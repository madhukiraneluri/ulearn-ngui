// Deploy with: supabase functions deploy complete-signup --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { json, corsHeaders } from '../_shared/admin-auth.ts';
import {
  isValidEmail,
  normalizeEmail,
  passwordError,
  sha256,
  timingSafeEqual
} from '../_shared/signup-otp.ts';

const VERIFIED_WINDOW_MS = 20 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const password = String(body?.password ?? '');
    const fullName = String(body?.fullName ?? '').trim();
    const phone = String(body?.phone ?? '').trim();
    const verificationToken = String(body?.verificationToken ?? '').trim();

    if (!isValidEmail(email)) return json({ error: 'Enter a valid email address' }, 400);
    if (!/^[a-zA-Z\s.'-]{2,80}$/.test(fullName)) {
      return json({ error: 'Enter a valid full name' }, 400);
    }
    if (!/^[0-9]{10,15}$/.test(phone)) {
      return json({ error: 'Enter a valid 10-15 digit phone number' }, 400);
    }
    const pwError = passwordError(password);
    if (pwError) return json({ error: pwError }, 400);
    if (!verificationToken) {
      return json({ error: 'Verify your email before creating an account' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: exists, error: existsErr } = await adminClient.rpc('auth_email_exists', {
      target_email: email
    });
    if (existsErr) return json({ error: existsErr.message }, 500);
    if (exists === true) {
      return json({ error: 'An account with this email already exists. Sign in instead.' }, 409);
    }

    const { data: row, error: rowErr } = await adminClient
      .from('signup_email_otps')
      .select('token_hash, token_salt, verified_at, consumed_at')
      .eq('email', email)
      .maybeSingle();

    if (rowErr) return json({ error: rowErr.message }, 500);
    if (!row?.verified_at || !row.token_hash || !row.token_salt || row.consumed_at) {
      return json({ error: 'Verify your email before creating an account' }, 400);
    }
    if (Date.now() - new Date(row.verified_at).getTime() > VERIFIED_WINDOW_MS) {
      return json({ error: 'Email verification expired. Request a new code.' }, 400);
    }

    const expected = await sha256(`${row.token_salt}:${verificationToken}`);
    if (!timingSafeEqual(expected, row.token_hash)) {
      return json({ error: 'Email verification expired. Request a new code.' }, 400);
    }

    const consumedAt = new Date().toISOString();
    const { data: consumed, error: consumeErr } = await adminClient
      .from('signup_email_otps')
      .update({ consumed_at: consumedAt })
      .eq('email', email)
      .is('consumed_at', null)
      .select('email')
      .maybeSingle();

    if (consumeErr) return json({ error: consumeErr.message }, 500);
    if (!consumed) {
      return json({ error: 'Verify your email before creating an account' }, 400);
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { provisioned: true },
      user_metadata: {
        full_name: fullName,
        phone_number: phone
      }
    });

    if (createErr || !created.user) {
      await adminClient
        .from('signup_email_otps')
        .update({ consumed_at: null })
        .eq('email', email);
      const message = createErr?.message ?? 'Could not create account';
      const status = message.toLowerCase().includes('already') ? 409 : 500;
      return json({ error: message }, status);
    }

    const { error: profileErr } = await adminClient.from('profiles').upsert(
      {
        id: created.user.id,
        full_name: fullName,
        email,
        phone,
        role: 'USER',
        profile_completed: false,
        must_reset_password: false,
        created_by_admin: false
      },
      { onConflict: 'id' }
    );

    if (profileErr) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      await adminClient
        .from('signup_email_otps')
        .update({ consumed_at: null })
        .eq('email', email);
      return json({ error: profileErr.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ error: message }, 500);
  }
});
