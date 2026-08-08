import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface StudentInput {
  email: string;
  fullName: string;
  phone?: string;
  collegeName?: string;
}

interface NewBatchInput {
  courseId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

interface CreateStudentPayload {
  students: StudentInput[];
  courseIds?: string[];
  batchIds?: string[];
  newBatch?: NewBatchInput | null;
  sendEmail?: boolean;
}

interface RowResult {
  rowNumber: number;
  email: string;
  success: boolean;
  message: string;
  userId?: string;
  tempPassword?: string;
  emailSent?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { adminClient, adminUserId } = auth;
    const body = (await req.json()) as CreateStudentPayload;
    const students = Array.isArray(body?.students) ? body.students : [];

    if (students.length === 0) {
      return json({ error: 'students array is required' }, 400);
    }

    const courseIds = normalizeIds(body.courseIds);
    const batchIds = [...normalizeIds(body.batchIds)];
    const sendEmail = body.sendEmail !== false;
    let batchWarning: string | undefined;

    if (body.newBatch?.courseId && body.newBatch?.name?.trim()) {
      const created = await createBatch(adminClient, body.newBatch, adminUserId);
      if (created.error) {
        batchWarning = created.error;
      } else if (created.id) {
        batchIds.push(created.id);
      }
    }

    const results: RowResult[] = [];

    for (let i = 0; i < students.length; i++) {
      const row = students[i];
      const rowNumber = i + 1;
      const email = String(row?.email ?? '').trim().toLowerCase();
      const fullName = String(row?.fullName ?? '').trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({ rowNumber, email: email || '—', success: false, message: 'Invalid email' });
        continue;
      }
      if (!fullName) {
        results.push({ rowNumber, email, success: false, message: 'Full name is required' });
        continue;
      }

      const existing = await adminClient
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existing.data?.id) {
        results.push({ rowNumber, email, success: false, message: 'Account already exists for this email' });
        continue;
      }

      const tempPassword = generateTempPassword();
      const phone = String(row?.phone ?? '').trim() || null;
      const collegeName = String(row?.collegeName ?? '').trim() || null;

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone_number: phone,
          must_reset_password: true,
          created_by_admin: true
        }
      });

      if (createErr || !created.user) {
        results.push({
          rowNumber,
          email,
          success: false,
          message: createErr?.message ?? 'Could not create user'
        });
        continue;
      }

      const userId = created.user.id;

      const { error: profileErr } = await adminClient.from('profiles').upsert({
        id: userId,
        full_name: fullName,
        email,
        phone,
        college_name: collegeName,
        profile_completed: false,
        must_reset_password: true,
        created_by_admin: true,
        role: 'USER'
      });

      if (profileErr) {
        await adminClient.auth.admin.deleteUser(userId);
        results.push({ rowNumber, email, success: false, message: profileErr.message });
        continue;
      }

      const enrollMessages: string[] = [];
      for (const courseId of courseIds) {
        const enr = await ensureEnrollment(adminClient, userId, courseId, {
          fullName,
          email,
          phone,
          collegeName
        });
        if (enr.error) enrollMessages.push(`Course: ${enr.error}`);
      }

      const batchMessages: string[] = [];
      for (const batchId of batchIds) {
        const bm = await addToBatch(adminClient, batchId, userId, adminUserId);
        if (bm.error) batchMessages.push(`Batch: ${bm.error}`);
      }

      let emailSent = false;
      let emailError: string | undefined;
      if (sendEmail) {
        const mail = await sendCredentialsEmail(email, fullName, tempPassword);
        emailSent = mail.sent;
        emailError = mail.error;
      }

      const extra = [...enrollMessages, ...batchMessages].filter(Boolean);
      if (batchWarning) extra.unshift(`Batch not created: ${batchWarning}`);
      const mailNote = sendEmail
        ? emailSent
          ? ' Credentials emailed.'
          : ` Email not sent${emailError ? `: ${emailError}` : ''}.`
        : '';

      results.push({
        rowNumber,
        email,
        success: true,
        message: `Account created.${extra.length ? ' ' + extra.join(' ') : ''}${mailNote}`,
        userId,
        tempPassword: emailSent ? undefined : tempPassword,
        emailSent
      });
    }

    const ok = results.filter((r) => r.success).length;
    const fail = results.length - ok;

    return json({ results, summary: { total: results.length, success: ok, failed: fail } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ error: message }, 500);
  }
});

async function requireAdmin(req: Request): Promise<
  | { ok: true; adminClient: SupabaseClient; adminUserId: string }
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
  const { data: adminProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  const isAdmin =
    adminProfile?.role === 'ADMIN' || authData.user.user_metadata?.role === 'ADMIN';

  if (!isAdmin) return { ok: false, response: json({ error: 'Forbidden' }, 403) };

  return { ok: true, adminClient, adminUserId: authData.user.id };
}

function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 8 }, () => pick(all));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function sendCredentialsEmail(
  to: string,
  fullName: string,
  tempPassword: string
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim() ?? 'ULearn <noreply@ulearn-edu.in>';
  const loginUrl = Deno.env.get('ULEARN_LOGIN_URL')?.trim() ?? 'https://www.ulearn-edu.in/auth/login';

  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not configured' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Your ULearn account credentials',
      html: `<p>Hi ${fullName},</p>
        <p>Your ULearn account has been created.</p>
        <p><strong>Login:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
        <p><strong>Email:</strong> ${to}</p>
        <p><strong>Temporary password:</strong> ${tempPassword}</p>
        <p>Sign in and set a new password on first login.</p>`
    })
  });

  if (!res.ok) return { sent: false, error: await res.text() };
  return { sent: true };
}

async function createBatch(
  client: SupabaseClient,
  input: NewBatchInput,
  adminUserId: string
): Promise<{ id?: string; error?: string }> {
  const courseId = String(input.courseId).trim();
  const name = String(input.name).trim();
  if (!courseId || !name) return { error: 'Batch course and name are required' };

  const { data, error } = await client
    .from('batches')
    .insert({
      course_id: courseId,
      name,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      status: input.status ?? 'active',
      created_by: adminUserId
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: String(data.id) };
}

async function ensureEnrollment(
  client: SupabaseClient,
  userId: string,
  courseId: string,
  profile: { fullName: string; email: string; phone: string | null; collegeName: string | null }
): Promise<{ error?: string }> {
  const { data: existing } = await client
    .from('enrollments')
    .select('id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (existing) return {};

  const { error } = await client.from('enrollments').insert({
    user_id: userId,
    course_id: courseId,
    full_name: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    college_name: profile.collegeName
  });

  return error ? { error: error.message } : {};
}

async function addToBatch(
  client: SupabaseClient,
  batchId: string,
  userId: string,
  adminUserId: string
): Promise<{ error?: string }> {
  const { data: batch, error: batchErr } = await client
    .from('batches')
    .select('id, course_id, start_date')
    .eq('id', batchId)
    .maybeSingle();

  if (batchErr || !batch) return { error: 'Batch not found' };

  const { data: profile } = await client
    .from('profiles')
    .select('full_name, email, phone, college_name')
    .eq('id', userId)
    .maybeSingle();

  await ensureEnrollment(client, userId, String(batch.course_id), {
    fullName: String(profile?.full_name ?? ''),
    email: String(profile?.email ?? ''),
    phone: (profile?.phone as string | null) ?? null,
    collegeName: (profile?.college_name as string | null) ?? null
  });

  if (batch.start_date) {
    await client
      .from('enrollments')
      .update({ live_class_start_month: String(batch.start_date).slice(0, 7) })
      .eq('user_id', userId)
      .eq('course_id', String(batch.course_id));
  }

  const { error } = await client.from('batch_members').upsert(
    { batch_id: batchId, user_id: userId, added_by: adminUserId },
    { onConflict: 'batch_id,user_id', ignoreDuplicates: true }
  );

  return error ? { error: error.message } : {};
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
