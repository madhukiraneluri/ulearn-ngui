/**
 * Wipe recruitment exam registrations/candidates/attempts and re-import from Excel.
 * Usage: node scripts/reimport-exam-candidates-from-xlsx.mjs [path-to-xlsx]
 */
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://yllfccuxohnipleyseup.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_XLSX =
  process.argv[2] ?? 'C:/Users/madhu/Downloads/exam-candidates-template.xlsx';
const BATCH_SIZE = 25;

const ROLE_DEFINITIONS = [
  {
    slug: 'business-development-executive',
    name: 'Business Development Executive',
    matchTerms: ['business development', 'bde', 'business development executive']
  },
  {
    slug: 'research-analyst',
    name: 'Research Analyst',
    matchTerms: ['research analyst', 'research']
  },
  {
    slug: 'associate-lead-generation-specialist',
    name: 'Associate Lead Generation Specialist',
    matchTerms: ['lead generation', 'associate lead', 'lead gen']
  },
  {
    slug: 'relationship-executive',
    name: 'Relationship Executive',
    matchTerms: ['relationship executive', 'relationship']
  },
  {
    slug: 'junior-full-stack-developer',
    name: 'Junior Full-Stack Developer',
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
    return ROLE_DEFINITIONS.map((role) => role.slug);
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
  const byEmail = new Map();
  for (const row of parsed) {
    const email = row.email.trim().toLowerCase();
    if (!email) continue;
    const list = byEmail.get(email) ?? [];
    list.push({ ...row, email });
    byEmail.set(email, list);
  }

  const normalized = [];
  for (const group of byEmail.values()) {
    const primary = group[0];
    const roleSlugs = new Set();
    for (const row of group) {
      for (const slug of resolveRolesFromText(row.roleInterested)) {
        roleSlugs.add(slug);
      }
    }

    if (roleSlugs.size === 0) {
      normalized.push(primary);
      continue;
    }

    const fullName = group.map((r) => r.fullName.trim()).find(Boolean) ?? primary.fullName;
    for (const slug of roleSlugs) {
      const roleDef = ROLE_DEFINITIONS.find((r) => r.slug === slug);
      normalized.push({
        email: primary.email,
        fullName,
        roleInterested: roleDef?.name ?? slug,
        roleSlug: slug
      });
    }
  }
  return normalized;
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
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: input.fullName,
      email: input.email,
      profile_completed: true,
      must_reset_password: true,
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
  console.log('Reading', DEFAULT_XLSX);
  const parsed = parseExcel(DEFAULT_XLSX);
  const rows = normalizeRows(parsed);
  console.log(`Parsed ${parsed.length} Excel rows → ${rows.length} assignments after multi-role merge`);

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

  const { data: counts } = await supabase
    .from('exam_registrations')
    .select('role_slug');

  const byRole = {};
  for (const r of counts ?? []) {
    const slug = r.role_slug ?? 'unknown';
    byRole[slug] = (byRole[slug] ?? 0) + 1;
  }
  console.log('Registrations by role:', byRole);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
