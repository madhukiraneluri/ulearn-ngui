/**
 * Create a dedicated admin user in Supabase.
 *
 * Usage (requires service role key from Supabase Dashboard → Settings → API):
 *   set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
 *   node scripts/setup_admin.js
 *
 * Default credentials created:
 *   Email:    admin@ulearn.in
 *   Password: ULearn@Admin2026
 */

const SUPABASE_URL = 'https://yllfccuxohnipleyseup.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_EMAIL = 'admin@ulearn.in';
const ADMIN_PASSWORD = 'ULearn@Admin2026';
const ADMIN_NAME = 'ULearn Admin';

async function main() {
  if (!SERVICE_KEY) {
    console.error('Set SUPABASE_SERVICE_ROLE_KEY environment variable.');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: ADMIN_NAME, role: 'ADMIN' }
  });

  if (createErr) {
    if (createErr.message.toLowerCase().includes('already')) {
      console.log('Admin user already exists:', ADMIN_EMAIL);
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email === ADMIN_EMAIL);
      if (existing) {
        await admin.from('profiles').upsert({
          id: existing.id,
          full_name: ADMIN_NAME,
          role: 'ADMIN',
          profile_completed: true
        });
        await admin.auth.admin.updateUserById(existing.id, {
          user_metadata: { full_name: ADMIN_NAME, role: 'ADMIN' }
        });
      }
    } else {
      console.error('Create user failed:', createErr.message);
      process.exit(1);
    }
  } else if (created.user) {
    await admin.from('profiles').upsert({
      id: created.user.id,
      full_name: ADMIN_NAME,
      role: 'ADMIN',
      profile_completed: true
    });
    console.log('Admin user created:', ADMIN_EMAIL);
  }

  console.log('\nAdmin login URL: /auth/admin');
  console.log('Email:   ', ADMIN_EMAIL);
  console.log('Password:', ADMIN_PASSWORD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
