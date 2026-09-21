import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { adminClient } = auth;

    const { data: recruitmentExams } = await adminClient
      .from('exams')
      .select('id')
      .not('recruitment_slug', 'is', null);

    const examIds = (recruitmentExams ?? []).map((e) => String(e.id));

    const { error: regErr } = await adminClient.from('exam_registrations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (regErr) return json({ error: regErr.message }, 500);

    if (examIds.length > 0) {
      const { error: candErr } = await adminClient
        .from('exam_candidates')
        .delete()
        .in('exam_id', examIds);
      if (candErr) return json({ error: candErr.message }, 500);
    }

    return json({ ok: true, deletedExams: examIds.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

async function requireAdmin(req: Request): Promise<
  | { ok: true; adminClient: SupabaseClient }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { ok: false, response: json({ error: 'Unauthorized' }, 401) };

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) return { ok: false, response: json({ error: 'Unauthorized' }, 401) };

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: adminProfile } = await adminClient.from('profiles').select('role').eq('id', authData.user.id).maybeSingle();
  const isAdmin = adminProfile?.role === 'ADMIN' || authData.user.user_metadata?.role === 'ADMIN';
  if (!isAdmin) return { ok: false, response: json({ error: 'Forbidden' }, 403) };

  return { ok: true, adminClient };
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
