import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const { userClient, userId } = auth;
    const body = await req.json();
    const examId = String(body?.examId ?? '').trim();
    if (!examId) return json({ error: 'examId is required' }, 400);

    const { data: exam, error: examErr } = await userClient
      .from('exams')
      .select('id, starts_at, ends_at, duration_minutes, max_concurrent, status')
      .eq('id', examId)
      .maybeSingle();

    if (examErr || !exam) return json({ error: 'Exam not found' }, 404);
    if (exam.status !== 'published') return json({ error: 'Exam is not published' }, 400);

    const now = Date.now();
    if (now < new Date(exam.starts_at).getTime()) {
      return json({ error: 'Exam has not started yet' }, 400);
    }
    if (now > new Date(exam.ends_at).getTime()) {
      return json({ error: 'Exam window has closed' }, 400);
    }

    const { data: existing } = await userClient
      .from('exam_attempts')
      .select('id, ends_at')
      .eq('exam_id', examId)
      .eq('user_id', userId)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (existing) {
      return json({ attemptId: existing.id, endsAt: existing.ends_at });
    }

    const { data: candidate, error: candErr } = await userClient
      .from('exam_candidates')
      .select('exam_role_id')
      .eq('exam_id', examId)
      .eq('user_id', userId)
      .maybeSingle();

    if (candErr || !candidate) return json({ error: 'You are not registered for this exam' }, 403);

    const adminClient = createAdminClient();
    const { count, error: countErr } = await adminClient
      .from('exam_active_slots')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', examId);

    if (countErr) return json({ error: countErr.message }, 500);
    if ((count ?? 0) >= exam.max_concurrent) {
      return json({ error: 'Exam hall is full. Please try again shortly.' }, 409);
    }

    const attemptEndsAt = Math.min(now + exam.duration_minutes * 60_000, examEnd);
    const endsAtIso = new Date(attemptEndsAt).toISOString();

    const { data: attempt, error: attemptErr } = await userClient
      .from('exam_attempts')
      .insert({
        exam_id: examId,
        exam_role_id: candidate.exam_role_id,
        user_id: userId,
        ends_at: endsAtIso,
        status: 'in_progress'
      })
      .select('id, ends_at')
      .single();

    if (attemptErr || !attempt) return json({ error: attemptErr?.message ?? 'Could not create attempt' }, 500);

    const { error: slotErr } = await userClient.from('exam_active_slots').insert({
      exam_id: examId,
      attempt_id: attempt.id,
      user_id: userId
    });

    if (slotErr) {
      await userClient.from('exam_attempts').delete().eq('id', attempt.id);
      if (slotErr.message.includes('duplicate') || (count ?? 0) + 1 > exam.max_concurrent) {
        return json({ error: 'Exam hall is full. Please try again shortly.' }, 409);
      }
      return json({ error: slotErr.message }, 500);
    }

    return json({ attemptId: attempt.id, endsAt: attempt.ends_at });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

async function requireUser(req: Request): Promise<
  | { ok: true; userClient: SupabaseClient; userId: string }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { ok: false, response: json({ error: 'Unauthorized' }, 401) };

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) return { ok: false, response: json({ error: 'Unauthorized' }, 401) };

  return { ok: true, userClient, userId: authData.user.id };
}

function createAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(supabaseUrl, serviceKey);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
