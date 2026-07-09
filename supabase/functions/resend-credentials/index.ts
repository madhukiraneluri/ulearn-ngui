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
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData.user) return json({ error: 'Unauthorized' }, 401);

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: adminProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    const isAdmin =
      adminProfile?.role === 'ADMIN' || authData.user.user_metadata?.role === 'ADMIN';
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    const body = await req.json();
    const userId = String(body?.userId ?? '').trim();
    if (!userId) return json({ error: 'userId is required' }, 400);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, full_name, email, role, must_reset_password')
      .eq('id', userId)
      .maybeSingle();

    if (!profile?.email) return json({ error: 'User not found' }, 404);
    if (profile.role === 'ADMIN' || profile.role === 'INSTRUCTOR') {
      return json({ error: 'Cannot resend credentials for admin/instructor' }, 400);
    }

    const tempPassword = generateTempPassword();

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, {
      password: tempPassword,
      user_metadata: { must_reset_password: true }
    });

    if (updateErr) return json({ error: updateErr.message }, 500);

    await adminClient
      .from('profiles')
      .update({ must_reset_password: true })
      .eq('id', userId);

    const email = String(profile.email);
    const fullName = String(profile.full_name ?? '');
    const mail = await sendCredentialsEmail(email, fullName, tempPassword);

    return json({
      success: true,
      emailSent: mail.sent,
      emailError: mail.error ?? null,
      tempPassword: mail.sent ? undefined : tempPassword
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ error: message }, 500);
  }
});

function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 8 }, () => pick(all));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function sendCredentialsEmail(
  to: string,
  fullName: string,
  tempPassword: string
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim() ?? 'ULearn <noreply@ulearn-edu.in>';
  const loginUrl = Deno.env.get('ULEARN_LOGIN_URL')?.trim() ?? 'https://www.ulearn-edu.in/auth/login';

  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not configured' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Your ULearn login credentials (reset)',
      html: `<p>Hi ${fullName},</p>
        <p>New temporary credentials for your ULearn account:</p>
        <p><strong>Login:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
        <p><strong>Email:</strong> ${to}</p>
        <p><strong>Temporary password:</strong> ${tempPassword}</p>
        <p>Sign in and set a new password.</p>`
    })
  });

  if (!res.ok) return { sent: false, error: await res.text() };
  return { sent: true };
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
