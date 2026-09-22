/**
 * Wipe recruitment exam registrations/candidates/attempts and re-import from Excel.
 * Usage: node scripts/reimport-exam-candidates-from-xlsx.mjs [path-to-xlsx]
 */
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://yllfccuxohnipleyseup.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_XLSX = 'C:/Users/madhu/Downloads/exam-candidates-template.xlsx';
const BATCH_SIZE = 25;

const ROLE_DEFINITIONS = [
  {
    slug: 'business-development-executive',
    name: 'Business Development Executive',
    hasCoding: false,
    matchTerms: ['business development', 'bde', 'business development executive']
  },
  {
    slug: 'research-analyst',
    name: 'Research Analyst',
    hasCoding: true,
    matchTerms: ['research analyst', 'research']
  },
  {
    slug: 'associate-lead-generation-specialist',
    name: 'Associate Lead Generation Specialist',
    hasCoding: false,
    matchTerms: ['lead generation', 'associate lead', 'lead gen']
  },
  {
    slug: 'relationship-executive',
    name: 'Relationship Executive',
    hasCoding: false,
    matchTerms: ['relationship executive', 'relationship']
  },
  {
    slug: 'junior-full-stack-developer',
    name: 'Junior Full-Stack Developer',
    hasCoding: true,
    matchTerms: ['full stack', 'full-stack', 'fullstack', 'junior full', 'developer']
  }
];

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!fs.existsSync(DEFAULT_XLSX)) {
  console.error('File not found:', DEFAULT_XLSX);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function normalizeRoleText(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ');
}

function resolveRolesFromText(roleInterested) {
  const text = normalizeRoleText(roleInterested);
  if (!text) return [];

  if (/^multiple roles?$/i.test(text)) {
    return ROLE_DEFINITIONS.filter((role) => !role.hasCoding).map((role) => role.slug);
  }

  const parts = text
    .split(/[,;/|]+|\band\b|\&/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const slugs = new Set();
  for (const part of parts.length > 0 ? parts : [text]) {
    const lower = part.toLowerCase();
    for (const role of ROLE_DEFINITIONS) {
      if (role.matchTerms.some((term) => lower.includes(term))) {
        slugs.add(role.slug);
      } else if (lower.includes(role.slug.replace(/-/g, ' '))) {
        slugs.add(role.slug);
      }
    }
  }

  if (slugs.size === 0) {
    for (const role of ROLE_DEFINITIONS) {
      const lower = text.toLowerCase();
      if (role.matchTerms.some((term) => lower.includes(term))) {
        slugs.add(role.slug);
        break;
      }
    }
  }

  return [...slugs];
}

function parseExcel(path) {
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map((row) => {
    const entries = Object.entries(row).map(
      ([k, v]) => [k.toLowerCase().trim(), String(v ?? '').trim()] 
    );
    const find = (...keys) => {
      for (const key of keys) {
        const hit = entries.find(([k]) => k.includes(key));
        if (hit?.[1]) return hit[1];
      }
      return '';
    };
    return {
      email: find('email').toLowerCase(),
      fullName: find('name', 'full name', 'fullname'),
      roleInterested: find('role interested', 'role', 'roles interested')
    };
  }).filter((r) => r.email || r.fullName);
}

function normalizeRows(parsed) {
  const normalized = [];
  for (const raw of parsed) {
    const email = raw.email.trim().toLowerCase();
    if (!email) continue;

    const fullName = raw.fullName.trim();
    const roleInterested = raw.roleInterested.trim();
    const roleSlugs = resolveRolesFromText(roleInterested);

    if (roleSlugs.length === 0) {
      normalized.push({ email, fullName, roleInterested, roleSlug: null, isMultiRoleRow: false });
      continue;
    }

    const isMultiRoleRow =
      /^multiple roles?$/i.test(normalizeRoleText(roleInterested)) || roleSlugs.length > 1;
    const slugsToAssign = isMultiRoleRow
      ? roleSlugs.filter((slug) => {
          const roleDef = ROLE_DEFINITIONS.find((r) => r.slug === slug);
          return roleDef && !roleDef.hasCoding;
        })
      : roleSlugs.slice(0, 1);

    for (const slug of slugsToAssign) {
      const roleDef = ROLE_DEFINITIONS.find((r) => r.slug === slug);
      normalized.push({
        email,
        fullName,
        roleInterested: roleDef?.name ?? slug,
        roleSlug: slug,
        isMultiRoleRow
      });
    }
  }
  return normalized;
}

function summarizeAssignments(parsed, normalized) {
  const byRole = {};
  for (const role of ROLE_DEFINITIONS) {
    byRole[role.slug] = 0;
  }
  const excelRowsByCategory = {
    'associate-lead-generation-specialist': 0,
    'business-development-executive': 0,
    'junior-full-stack-developer': 0,
    'relationship-executive': 0,
    'research-analyst': 0,
    multipleRoles: 0
  };
  let multiRoleRows = 0;

  for (const row of parsed) {
    const text = normalizeRoleText(row.roleInterested);
    if (/^multiple roles?$/i.test(text)) {
      excelRowsByCategory.multipleRoles++;
      multiRoleRows++;
      continue;
    }
    const slugs = resolveRolesFromText(row.roleInterested);
    if (slugs.length === 1) {
      excelRowsByCategory[slugs[0]] = (excelRowsByCategory[slugs[0]] ?? 0) + 1;
    } else if (slugs.length > 1) {
      multiRoleRows++;
    }
  }

  for (const row of normalized) {
    if (row.roleSlug) byRole[row.roleSlug] = (byRole[row.roleSlug] ?? 0) + 1;
  }

  return {
    excelRows: parsed.length,
    uniqueEmails: new Set(parsed.map((r) => r.email).filter(Boolean)).size,
    excelRowsByCategory,
    multiRoleRows,
    totalAssignments: normalized.filter((r) => r.roleSlug).length,
    assignmentsByRole: byRole
  };
}

function generateTempPassword(length = 10) {
  const all = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  const pick = () => all[Math.floor(Math.random() * all.length)];
  return Array.from({ length }, pick).join('');
}

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
  const useFixedPassword = Boolean(input.password);

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
        must_reset_password: useFixedPassword ? false : true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (useFixedPassword) {
      const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, {
        password: input.password,
        user_metadata: {
          full_name: input.fullName,
          must_reset_password: false,
          exam_only: true,
          created_by_admin: true
        }
      });
      if (pwErr) {
        return { ok: false, message: pwErr.message };
      }
    }
  } else {
    const tempPassword = input.password ?? generateTempPassword(10);
    const mustReset = useFixedPassword ? false : true;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: input.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        must_reset_password: mustReset,
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
      must_reset_password: mustReset,
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

const TEST_EXAM_PASSWORD = 'Kiran@4075';

/** One tester per recruitment role; shared password for QA. */
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

async function provisionTestExamAccounts(examsBySlug, importBatchId) {
  console.log('\nProvisioning QA test accounts (Test1–Test5, shared password)...');
  const results = [];

  for (const account of TEST_EXAM_ACCOUNTS) {
    const exam = examsBySlug.get(account.roleSlug);
    if (!exam) {
      results.push({ ...account, ok: false, message: 'Exam not configured' });
      continue;
    }

    const provision = await provisionCandidate({
      email: account.email,
      fullName: account.fullName,
      examId: exam.id,
      examRoleId: exam.roleId,
      roleSlug: account.roleSlug,
      password: TEST_EXAM_PASSWORD
    });

    if (!provision.ok) {
      results.push({ email: account.email, fullName: account.fullName, ok: false, message: provision.message });
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
        import_batch_id: importBatchId,
        provision_error: null
      },
      { onConflict: 'email,exam_id' }
    );

    if (regErr) {
      results.push({ email: account.email, fullName: account.fullName, ok: false, message: regErr.message });
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
  return results;
}

async function wipeExamStudentData(examIds) {
  if (examIds.length === 0) return;

  const { data: attempts } = await supabase.from('exam_attempts').select('id').in('exam_id', examIds);
  const attemptIds = (attempts ?? []).map((a) => a.id);

  if (attemptIds.length > 0) {
    await supabase.from('exam_results').delete().in('attempt_id', attemptIds);
    await supabase.from('exam_answers').delete().in('attempt_id', attemptIds);
  }

  await supabase.from('exam_results').delete().in('exam_id', examIds);
  await supabase.from('exam_active_slots').delete().in('exam_id', examIds);
  await supabase.from('exam_attempts').delete().in('exam_id', examIds);
  await supabase.from('exam_registrations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('exam_candidates').delete().in('exam_id', examIds);
}

async function main() {
  const statsOnly = process.argv.includes('--stats-only');
  const xlsxPath = process.argv.find((a) => a.endsWith('.xlsx')) ?? DEFAULT_XLSX;

  console.log('Reading', xlsxPath);
  const parsed = parseExcel(xlsxPath);
  const rows = normalizeRows(parsed);
  const summary = summarizeAssignments(parsed, rows);
  console.log('\nAssignment summary (multi-role → non-technical exams only):');
  console.log(JSON.stringify(summary, null, 2));

  if (statsOnly) return;

  console.log(`\nParsed ${parsed.length} Excel rows → ${rows.length} assignments`);

  const examsBySlug = await loadExamsByRecruitmentSlug();
  const recruitmentExamIds = [...examsBySlug.values()].map((e) => e.id);

  const { data: testExam } = await supabase
    .from('exams')
    .select('id')
    .eq('recruitment_slug', 'test-assessment-madhu')
    .maybeSingle();

  const wipeIds = [...recruitmentExamIds];
  if (testExam?.id) wipeIds.push(String(testExam.id));

  console.log('Wiping registrations, candidates, attempts, and results for', wipeIds.length, 'exams...');
  await wipeExamStudentData(wipeIds);
  console.log('Wipe complete.');

  const importBatchId = crypto.randomUUID();
  let success = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const roleSlug = row.roleSlug ?? resolveRolesFromText(row.roleInterested)[0];
    const exam = roleSlug ? examsBySlug.get(roleSlug) : null;

    if (!roleSlug || !exam) {
      failed++;
      failures.push({ email: row.email, message: `Unknown or unconfigured role: ${row.roleInterested}` });
      continue;
    }

    const provision = await provisionCandidate({
      email: row.email,
      fullName: row.fullName,
      examId: exam.id,
      examRoleId: exam.roleId,
      roleSlug
    });

    if (!provision.ok) {
      await supabase.from('exam_registrations').upsert(
        {
          email: row.email,
          full_name: row.fullName,
          role_interested: row.roleInterested,
          role_slug: roleSlug,
          exam_id: exam.id,
          import_batch_id: importBatchId,
          provision_error: provision.message
        },
        { onConflict: 'email,exam_id' }
      );
      failed++;
      failures.push({ email: row.email, role: roleSlug, message: provision.message });
      continue;
    }

    await supabase.from('exam_registrations').upsert(
      {
        email: row.email,
        full_name: row.fullName,
        role_interested: row.roleInterested,
        role_slug: roleSlug,
        exam_id: exam.id,
        user_id: provision.userId,
        candidate_id: provision.candidateId,
        import_batch_id: importBatchId,
        provision_error: null
      },
      { onConflict: 'email,exam_id' }
    );

    success++;
    if ((i + 1) % 50 === 0 || i === rows.length - 1) {
      console.log(`Progress: ${i + 1}/${rows.length} (ok ${success}, failed ${failed})`);
    }
  }

  console.log('\nImport finished.');
  console.log({ total: rows.length, success, failed, importBatchId });
  if (failures.length > 0) {
    console.log('First failures:', failures.slice(0, 15));
  }

  const { count, error: countErr } = await supabase
    .from('exam_registrations')
    .select('*', { count: 'exact', head: true });
  if (countErr) throw new Error(countErr.message);

  const byRole = {};
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from('exam_registrations')
      .select('role_slug')
      .range(from, from + pageSize - 1);
    if (pageErr) throw new Error(pageErr.message);
    if (!page?.length) break;
    for (const r of page) {
      const slug = r.role_slug ?? 'unknown';
      byRole[slug] = (byRole[slug] ?? 0) + 1;
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }
  console.log('Registrations total:', count);
  console.log('Registrations by role:', byRole);

  await provisionTestExamAccounts(examsBySlug, importBatchId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
