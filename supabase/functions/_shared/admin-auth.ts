import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

export async function requireAdmin(req: Request): Promise<
  | { ok: true; adminClient: SupabaseClient; adminUser: User; adminUserId: string }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { ok: false, response: json({ error: 'Unauthorized' }, 401) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return { ok: false, response: json({ error: 'Unauthorized' }, 401) };
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
    return { ok: false, response: json({ error: 'Forbidden' }, 403) };
  }

  return {
    ok: true,
    adminClient,
    adminUser: authData.user,
    adminUserId: authData.user.id
  };
}

export function generateTempPassword(): string {
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

export async function sendCredentialsEmail(
  to: string,
  fullName: string,
  tempPassword: string
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim() ?? 'ULearn <noreply@ulearn-edu.in>';
  const loginUrl = Deno.env.get('ULEARN_LOGIN_URL')?.trim() ?? 'https://www.ulearn-edu.in/auth/login';

  if (!apiKey) {
    return { sent: false, error: 'RESEND_API_KEY not configured' };
  }

  const html = `
    <p>Hi ${fullName || 'there'},</p>
    <p>Your ULearn account has been created by your college administrator.</p>
    <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
    <p><strong>Username (email):</strong> ${to}</p>
    <p><strong>Temporary password:</strong> ${tempPassword}</p>
    <p>Sign in with these credentials, then you will be asked to set a new password before continuing.</p>
    <p>— ULearn Team</p>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Your ULearn account credentials',
      html
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    return { sent: false, error: errText || `Resend HTTP ${res.status}` };
  }

  return { sent: true };
}
