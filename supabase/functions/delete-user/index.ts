import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData.user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: adminProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    const isAdmin =
      adminProfile?.role === 'ADMIN' ||
      authData.user.user_metadata?.role === 'ADMIN';

    if (!isAdmin) {
      return json({ error: 'Forbidden' }, 403);
    }

    const body = await req.json();
    const userId = String(body?.userId ?? '').trim();
    if (!userId) {
      return json({ error: 'userId is required' }, 400);
    }

    const { data: target } = await adminClient
      .from('profiles')
      .select('id, role, full_name, email')
      .eq('id', userId)
      .maybeSingle();

    if (!target) {
      return json({ error: 'User not found' }, 404);
    }

    if (target.role === 'ADMIN' || target.role === 'INSTRUCTOR') {
      return json({ error: 'Cannot delete admin or instructor accounts' }, 400);
    }

    await adminClient.from('enrollments').delete().eq('user_id', userId);
    await adminClient.from('lesson_progress').delete().eq('user_id', userId);
    await adminClient.from('batch_members').delete().eq('user_id', userId);
    await adminClient.from('profiles').delete().eq('id', userId);

    const { error: deleteAuthErr } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthErr) {
      return json({ error: deleteAuthErr.message }, 500);
    }

    return json({ success: true, userId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ error: message }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
