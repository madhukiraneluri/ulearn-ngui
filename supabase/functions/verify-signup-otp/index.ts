// Deploy with: supabase functions deploy verify-signup-otp --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { json, corsHeaders } from '../_shared/admin-auth.ts';
import {
  isValidEmail,
  normalizeEmail,
  randomHex,
  sha256,
  timingSafeEqual
} from '../_shared/signup-otp.ts';

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const code = String(body?.code ?? '').trim();
    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
      return json({ error: 'Enter the 6-digit code sent to your email' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: row, error: rowErr } = await adminClient
      .from('signup_email_otps')
      .select('code_hash, code_salt, expires_at, attempts, consumed_at')
      .eq('email', email)
      .maybeSingle();

    if (rowErr) return json({ error: rowErr.message }, 500);
    if (!row || row.consumed_at) {
      return json({ error: 'Request a new verification code.' }, 400);
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      return json({ error: 'Too many attempts. Request a new code.' }, 429);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return json({ error: 'That code has expired. Request a new one.' }, 400);
    }

    const expected = await sha256(`${row.code_salt}:${code}`);
    if (!timingSafeEqual(expected, row.code_hash)) {
      await adminClient
        .from('signup_email_otps')
        .update({ attempts: Number(row.attempts) + 1 })
        .eq('email', email);
      return json({ error: 'That code is incorrect.' }, 400);
    }

    const token = randomHex(32);
    const tokenSalt = randomHex(16);
    const tokenHash = await sha256(`${tokenSalt}:${token}`);

    const { error: updateErr } = await adminClient
      .from('signup_email_otps')
      .update({
        token_hash: tokenHash,
        token_salt: tokenSalt,
        verified_at: new Date().toISOString(),
        consumed_at: null
      })
      .eq('email', email);

    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ success: true, verificationToken: token });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ error: message }, 500);
  }
});
