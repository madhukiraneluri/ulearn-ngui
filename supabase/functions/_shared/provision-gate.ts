import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { randomHex } from './signup-otp.ts';

export async function issueProvisionNonce(
  admin: SupabaseClient,
  email: string
): Promise<{ nonce: string } | { error: string }> {
  const nonce = randomHex(32);
  const { error } = await admin.from('auth_provision_nonces').upsert({
    email: email.trim().toLowerCase(),
    nonce,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    used_at: null
  });
  if (error) return { error: error.message };
  return { nonce };
}
