import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface RegistrationInput {
  email: string;
  fullName: string;
  roleInterested: string;
  fromMultipleRoles?: boolean;
}

interface ImportPayload {
  registrations: RegistrationInput[];
  importBatchId?: string;
}

const ROLE_MAP: Array<{ slug: string; terms: string[]; examSlug: string }> = [
  { slug: 'business-development-executive', examSlug: 'business-development-executive', terms: ['business development', 'bde'] },
  { slug: 'research-analyst', examSlug: 'research-analyst', terms: ['research analyst', 'research'] },
  { slug: 'associate-lead-generation-specialist', examSlug: 'associate-lead-generation-specialist', terms: ['lead generation', 'associate lead', 'lead gen'] },
  { slug: 'relationship-executive', examSlug: 'relationship-executive', terms: ['relationship executive', 'relationship'] },
  { slug: 'junior-full-stack-developer', examSlug: 'junior-full-stack-developer', terms: ['full stack', 'full-stack', 'fullstack', 'junior full', 'developer'] }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { adminClient } = auth;

    const body = (await req.json()) as ImportPayload;
    const rows = Array.isArray(body?.registrations) ? body.registrations : [];
    const batchId = body?.importBatchId ?? crypto.randomUUID();

    if (rows.length === 0) return json({ error: 'registrations array is required' }, 400);

    const examsBySlug = await loadExamsByRecruitmentSlug(adminClient);
    const results: Array<{ rowNumber: number; email: string; success: boolean; message: string; roleSlug?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;
      const email = String(row?.email ?? '').trim().toLowerCase();
      const fullName = String(row?.fullName ?? '').trim();
      const roleInterested = String(row?.roleInterested ?? '').trim();
      const fromMultipleRoles = Boolean(row?.fromMultipleRoles);

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({ rowNumber, email: email || '—', success: false, message: 'Invalid email' });
        continue;
      }
      if (!fullName) {
        results.push({ rowNumber, email, success: false, message: 'Name is required' });
        continue;
      }

      const roleSlug = resolveRoleSlug(roleInterested);
      if (!roleSlug) {
        results.push({ rowNumber, email, success: false, message: `Unknown role: ${roleInterested || '—'}` });
        continue;
      }

      const exam = examsBySlug.get(roleSlug);
      if (!exam) {
        results.push({ rowNumber, email, success: false, message: `Exam not configured for ${roleSlug}` });
        continue;
      }

      const provision = await provisionCandidate(adminClient, {
        email,
        fullName,
        examId: exam.id,
        examRoleId: exam.roleId,
        roleSlug
      });

      if (!provision.ok) {
        await adminClient.from('exam_registrations').upsert({
          email,
          full_name: fullName,
          role_interested: roleInterested,
          role_slug: roleSlug,
          exam_id: exam.id,
          import_batch_id: batchId,
          provision_error: provision.message,
          from_multiple_roles: fromMultipleRoles
        }, { onConflict: 'email,exam_id' });
        results.push({ rowNumber, email, success: false, message: provision.message, roleSlug });
        continue;
      }

      await adminClient.from('exam_registrations').upsert({
        email,
        full_name: fullName,
        role_interested: roleInterested,
        role_slug: roleSlug,
        exam_id: exam.id,
        user_id: provision.userId,
        candidate_id: provision.candidateId,
        import_batch_id: batchId,
        provision_error: null,
        from_multiple_roles: fromMultipleRoles
      }, { onConflict: 'email,exam_id' });

      results.push({
        rowNumber,
        email,
        success: true,
        message: `Assigned to ${exam.title}`,
        roleSlug
      });
    }

    const ok = results.filter((r) => r.success).length;
    return json({ results, summary: { total: results.length, success: ok, failed: results.length - ok }, importBatchId: batchId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

function resolveRoleSlug(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  for (const role of ROLE_MAP) {
    if (role.terms.some((t) => text.includes(t))) return role.slug;
    if (text.includes(role.slug.replace(/-/g, ' '))) return role.slug;
  }
  return null;
}

async function loadExamsByRecruitmentSlug(client: SupabaseClient): Promise<
  Map<string, { id: string; title: string; roleId: string }>
> {
  const { data: exams } = await client
    .from('exams')
    .select('id, title, recruitment_slug')
    .not('recruitment_slug', 'is', null);

  const map = new Map<string, { id: string; title: string; roleId: string }>();
  for (const exam of exams ?? []) {
    const slug = String(exam.recruitment_slug);
    const { data: role } = await client
      .from('exam_roles')
      .select('id')
      .eq('exam_id', exam.id)
      .eq('slug', slug)
      .maybeSingle();
    if (role) {
      map.set(slug, { id: String(exam.id), title: String(exam.title), roleId: String(role.id) });
    }
  }
  return map;
}

async function provisionCandidate(
  client: SupabaseClient,
  input: { email: string; fullName: string; examId: string; examRoleId: string; roleSlug: string }
): Promise<{ ok: true; userId: string; candidateId: string } | { ok: false; message: string }> {
  let userId: string;

  const existing = await client.from('profiles').select('id').eq('email', input.email).maybeSingle();
  if (existing.data?.id) {
    userId = String(existing.data.id);
    await client.from('profiles').update({ exam_only: true, updated_at: new Date().toISOString() }).eq('id', userId);
  } else {
    const tempPassword = generateTempPassword(10);
    const { data: created, error: createErr } = await client.auth.admin.createUser({
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
    const { error: profileErr } = await client.from('profiles').upsert({
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
      await client.auth.admin.deleteUser(userId);
      return { ok: false, message: profileErr.message };
    }
  }

  const { data: cand, error: candErr } = await client
    .from('exam_candidates')
    .upsert(
      { exam_id: input.examId, user_id: userId, exam_role_id: input.examRoleId },
      { onConflict: 'exam_id,user_id' }
    )
    .select('id')
    .single();

  if (candErr || !cand) return { ok: false, message: candErr?.message ?? 'Could not register candidate' };
  return { ok: true, userId, candidateId: String(cand.id) };
}

function generateTempPassword(length: number): string {
  const all = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  const pick = () => all[Math.floor(Math.random() * all.length)];
  return Array.from({ length }, pick).join('');
}

async function requireAdmin(req: Request): Promise<
  | { ok: true; adminClient: SupabaseClient }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { ok: false, response: json({ error: 'Unauthorized' }, 401) };

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) return { ok: false, response: json({ error: 'Unauthorized' }, 401) };

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: adminProfile } = await adminClient.from('profiles').select('role').eq('id', authData.user.id).maybeSingle();
  const isAdmin = adminProfile?.role === 'ADMIN' || authData.user.user_metadata?.role === 'ADMIN';
  if (!isAdmin) return { ok: false, response: json({ error: 'Forbidden' }, 403) };

  return { ok: true, adminClient };
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
