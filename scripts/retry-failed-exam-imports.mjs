/** Retry failed bulk-import rows (provision_error set). */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'https://yllfccuxohnipleyseup.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function generateTempPassword(length = 10) {
  const all = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  return Array.from({ length }, () => all[Math.floor(Math.random() * all.length)]).join('');
}

async function provisionCandidate(input) {
  let userId;
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', input.email)
    .maybeSingle();

  if (existing?.id) {
    userId = String(existing.id);
    await supabase
      .from('profiles')
      .update({ exam_only: true, updated_at: new Date().toISOString() })
      .eq('id', userId);
  } else {
    const tempPassword = generateTempPassword(10);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: input.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        must_reset_password: true,
        created_by_admin: true,
        exam_only: true
      }
    });
    if (createErr || !created.user) {
      return { ok: false, message: createErr?.message ?? 'Could not create user' };
    }
    userId = created.user.id;
    await supabase.from('profiles').upsert({
      id: userId,
      full_name: input.fullName,
      email: input.email,
      profile_completed: true,
      must_reset_password: true,
      created_by_admin: true,
      exam_only: true,
      role: 'USER'
    });
  }

  const { data: cand, error: candErr } = await supabase
    .from('exam_candidates')
    .upsert(
      { exam_id: input.examId, user_id: userId, exam_role_id: input.examRoleId },
      { onConflict: 'exam_id,user_id' }
    )
    .select('id')
    .single();

  if (candErr || !cand) return { ok: false, message: candErr?.message ?? 'candidate failed' };
  return { ok: true, userId, candidateId: String(cand.id) };
}

async function main() {
  const { data: failed } = await supabase
    .from('exam_registrations')
    .select('id, email, full_name, role_slug, exam_id, provision_error')
    .not('provision_error', 'is', null);

  console.log('Rows with provision_error:', failed?.length ?? 0);
  for (const row of failed ?? []) {
    const { data: role } = await supabase
      .from('exam_roles')
      .select('id')
      .eq('exam_id', row.exam_id)
      .eq('slug', row.role_slug)
      .maybeSingle();

    const provision = await provisionCandidate({
      email: row.email,
      fullName: row.full_name,
      examId: row.exam_id,
      examRoleId: String(role.id)
    });

    if (!provision.ok) {
      console.log('Still failed', row.email, provision.message);
      continue;
    }

    await supabase
      .from('exam_registrations')
      .update({
        user_id: provision.userId,
        candidate_id: provision.candidateId,
        provision_error: null
      })
      .eq('id', row.id);

    console.log('Fixed', row.email, row.role_slug);
  }
}

main().catch(console.error);
