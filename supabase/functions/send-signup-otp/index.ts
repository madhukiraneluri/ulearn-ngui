// Deploy with: supabase functions deploy send-signup-otp --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { json, corsHeaders, sendHtmlEmail, escapeHtml } from '../_shared/admin-auth.ts';
import {
  isValidEmail,
  normalizeEmail,
  randomHex,
  randomOtp,
  sha256
} from '../_shared/signup-otp.ts';

const RESEND_COOLDOWN_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    if (!isValidEmail(email)) {
      return json({ error: 'Enter a valid email address' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: taken, error: takenErr } = await adminClient.rpc('auth_email_exists', {
      target_email: email
    });
    if (takenErr) return json({ error: takenErr.message }, 500);
    if (taken === true) {
      return json({ error: 'An account with this email already exists. Sign in instead.' }, 409);
    }

    const { data: existing } = await adminClient
      .from('signup_email_otps')
      .select('last_sent_at')
      .eq('email', email)
      .maybeSingle();

    if (existing?.last_sent_at) {
      const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return json({ error: `Please wait ${wait}s before requesting another code.` }, 429);
      }
    }

    const code = randomOtp();
    const salt = randomHex(16);
    const codeHash = await sha256(`${salt}:${code}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: saveErr } = await adminClient.from('signup_email_otps').upsert({
      email,
      code_hash: codeHash,
      code_salt: salt,
      expires_at: expiresAt,
      attempts: 0,
      last_sent_at: new Date().toISOString(),
      token_hash: null,
      token_salt: null,
      verified_at: null,
      consumed_at: null
    });
    if (saveErr) return json({ error: saveErr.message }, 500);

    const mail = await sendHtmlEmail(
      email,
      'Your ULearn verification code',
      `<p>Hi,</p>
       <p>Use this code to verify your email and create your ULearn account:</p>
       <p style="font-size:24px;font-weight:700;letter-spacing:4px">${escapeHtml(code)}</p>
       <p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
       <p>— ULearn Team</p>`
    );

    if (!mail.sent) {
      return json({ error: mail.error ?? 'Could not send verification email' }, 502);
    }

    return json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ error: message }, 500);
  }
});
