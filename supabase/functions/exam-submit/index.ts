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
    const attemptId = String(body?.attemptId ?? '').trim();
    const autoSubmitted = body?.autoSubmitted === true;

    if (!attemptId) return json({ error: 'attemptId is required' }, 400);

    const { data: attempt, error: attemptErr } = await userClient
      .from('exam_attempts')
      .select('id, exam_id, user_id, status')
      .eq('id', attemptId)
      .maybeSingle();

    if (attemptErr || !attempt) return json({ error: 'Attempt not found' }, 404);
    if (attempt.user_id !== userId) return json({ error: 'Forbidden' }, 403);
    if (attempt.status !== 'in_progress') return json({ ok: true });

    const status = autoSubmitted ? 'auto_submitted' : 'submitted';
    const { error: updateErr } = await userClient
      .from('exam_attempts')
      .update({
        status,
        submitted_at: new Date().toISOString()
      })
      .eq('id', attemptId);

    if (updateErr) return json({ error: updateErr.message }, 500);

    await userClient
      .from('exam_active_slots')
      .delete()
      .eq('exam_id', attempt.exam_id)
      .eq('attempt_id', attemptId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    try {
      await fetch(`${supabaseUrl}/functions/v1/exam-evaluate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ attemptId })
      });
    } catch {
      // Evaluation failure should not block submit acknowledgement
    }

    return json({ ok: true });
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

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
