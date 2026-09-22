/**
 * Provision Test1–Test5 QA accounts (shared password). Safe to re-run.
 * Usage: node scripts/provision-test-exam-accounts.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://yllfccuxohnipleyseup.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_EXAM_PASSWORD = 'Kiran@4075';

const TEST_EXAM_ACCOUNTS = [
  {
    email: 'madhukiraneluri1@gmail.com',
    fullName: 'Test1',
    roleSlug: 'research-analyst',
    roleInterested: 'Research Analyst'
  },
  {
    email: 'madhukiranchowdaryeluri2004@gmail.com',
    fullName: 'Test2',
    roleSlug: 'junior-full-stack-developer',
    roleInterested: 'Junior Full-Stack Developer'
  },
  {
    email: 'duggiralapriyanka0549@gmail.com',
    fullName: 'Test3',
    roleSlug: 'business-development-executive',
    roleInterested: 'Business Development Executive'
  },
  {
    email: 'jayasree5259@gmail.com',
    fullName: 'Test4',
    roleSlug: 'associate-lead-generation-specialist',
    roleInterested: 'Associate Lead Generation Specialist'
  },
  {
    email: 'rams2898@gmail.com',
    fullName: 'Test5',
    roleSlug: 'relationship-executive',
    roleInterested: 'Relationship Executive'
  }
];

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function loadExamsByRecruitmentSlug() {
  const { data: exams, error } = await supabase
    .from('exams')
    .select('id, title, recruitment_slug')
    .not('recruitment_slug', 'is', null);

  if (error) throw new Error(error.message);

  const map = new Map();
  for (const exam of exams ?? []) {
    const slug = String(exam.recruitment_slug);
    if (slug === 'test-assessment-madhu') continue;

    const { data: role, error: roleErr } = await supabase
      .from('exam_roles')
      .select('id')
      .eq('exam_id', exam.id)
      .eq('slug', slug)
      .maybeSingle();

    if (roleErr) throw new Error(roleErr.message);
    if (role) {
      map.set(slug, { id: String(exam.id), title: String(exam.title), roleId: String(role.id) });
    }
  }
  return map;
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
      .update({
        full_name: input.fullName,
        exam_only: true,
        must_reset_password: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, {
      password: TEST_EXAM_PASSWORD,
      user_metadata: {
        full_name: input.fullName,
        must_reset_password: false,
        exam_only: true,
        created_by_admin: true
      }
    });
    if (pwErr) return { ok: false, message: pwErr.message };
  } else {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: input.email,
      password: TEST_EXAM_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        must_reset_password: false,
        created_by_admin: true,
        exam_only: true
      }
    });
    if (createErr || !created.user) {
      return { ok: false, message: createErr?.message ?? 'Could not create user' };
    }
    userId = created.user.id;
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: input.fullName,
      email: input.email,
      profile_completed: true,
      must_reset_password: false,
      created_by_admin: true,
      exam_only: true,
      role: 'USER'
    });
    if (profileErr) {
      await supabase.auth.admin.deleteUser(userId);
      return { ok: false, message: profileErr.message };
    }
  }

  const { data: cand, error: candErr } = await supabase
    .from('exam_candidates')
    .upsert(
      { exam_id: input.examId, user_id: userId, exam_role_id: input.examRoleId },
      { onConflict: 'exam_id,user_id' }
    )
    .select('id')
    .single();

  if (candErr || !cand) {
    return { ok: false, message: candErr?.message ?? 'Could not register candidate' };
  }

  return { ok: true, userId, candidateId: String(cand.id) };
}

async function main() {
  const examsBySlug = await loadExamsByRecruitmentSlug();
  const results = [];

  for (const account of TEST_EXAM_ACCOUNTS) {
    const exam = examsBySlug.get(account.roleSlug);
    if (!exam) {
      results.push({ email: account.email, ok: false, message: 'Exam not configured' });
      continue;
    }

    const provision = await provisionCandidate({
      email: account.email,
      fullName: account.fullName,
      examId: exam.id,
      examRoleId: exam.roleId
    });

    if (!provision.ok) {
      results.push({ email: account.email, ok: false, message: provision.message });
      continue;
    }

    const { error: regErr } = await supabase.from('exam_registrations').upsert(
      {
        email: account.email,
        full_name: account.fullName,
        role_interested: account.roleInterested,
        role_slug: account.roleSlug,
        exam_id: exam.id,
        user_id: provision.userId,
        candidate_id: provision.candidateId,
        import_batch_id: crypto.randomUUID(),
        provision_error: null
      },
      { onConflict: 'email,exam_id' }
    );

    if (regErr) {
      results.push({ email: account.email, ok: false, message: regErr.message });
      continue;
    }

    results.push({
      email: account.email,
      fullName: account.fullName,
      roleSlug: account.roleSlug,
      examTitle: exam.title,
      ok: true
    });
  }

  console.log(JSON.stringify({ testAccounts: results, password: TEST_EXAM_PASSWORD }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
