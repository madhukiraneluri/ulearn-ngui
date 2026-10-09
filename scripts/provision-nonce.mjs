import { randomBytes } from 'node:crypto';

export async function issueProvisionNonce(supabase, email) {
  const nonce = randomBytes(32).toString('hex');
  const { error } = await supabase.from('auth_provision_nonces').upsert({
    email: String(email).trim().toLowerCase(),
    nonce,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    used_at: null
  });
  if (error) throw new Error(error.message);
  return nonce;
}
