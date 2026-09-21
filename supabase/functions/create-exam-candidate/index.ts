import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface CandidateInput {
  email: string;
  fullName: string;
  phone?: string;
  collegeName?: string;
  roleSlug: string;
}

interface CreateExamCandidatePayload {
  examId: string;
  candidates: CandidateInput[];
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

    const { adminClient } = auth;
    const body = (await req.json()) as CreateExamCandidatePayload;
    const examId = String(body?.examId ?? '').trim();
    const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
    const sendEmail = body.sendEmail !== false;

    if (!examId) return json({ error: 'examId is required' }, 400);
    if (candidates.length === 0) return json({ error: 'candidates array is required' }, 400);

    const { data: exam, error: examErr } = await adminClient
      .from('exams')
      .select('id, title')
      .eq('id', examId)
      .maybeSingle();

    if (examErr || !exam) return json({ error: 'Exam not found' }, 404);

    const { data: roles, error: rolesErr } = await adminClient
      .from('exam_roles')
      .select('id, slug')
      .eq('exam_id', examId);

    if (rolesErr) return json({ error: rolesErr.message }, 500);

    const roleBySlug = new Map(
      (roles ?? []).map((r: { id: string; slug: string }) => [String(r.slug).toLowerCase(), String(r.id)])
    );

    const results: RowResult[] = [];
    const loginUrl =
      Deno.env.get('ULEARN_EXAM_LOGIN_URL')?.trim() ??
      Deno.env.get('ULEARN_LOGIN_URL')?.trim()?.replace('/auth/login', '/exam/login') ??
      'https://www.ulearn-edu.in/exam/login';

    for (let i = 0; i < candidates.length; i++) {
      const row = candidates[i];
      const rowNumber = i + 1;
      const email = String(row?.email ?? '').trim().toLowerCase();
      const fullName = String(row?.fullName ?? '').trim();
      const roleSlug = String(row?.roleSlug ?? '').trim().toLowerCase();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({ rowNumber, email: email || '—', success: false, message: 'Invalid email' });
        continue;
      }
      if (!fullName) {
        results.push({ rowNumber, email, success: false, message: 'Full name is required' });
        continue;
      }
      if (!roleSlug || !roleBySlug.has(roleSlug)) {
        results.push({ rowNumber, email, success: false, message: `Unknown role slug: ${roleSlug || '—'}` });
        continue;
      }

      const examRoleId = roleBySlug.get(roleSlug)!;
      const phone = String(row?.phone ?? '').trim() || null;
      const collegeName = String(row?.collegeName ?? '').trim() || null;

      const existingProfile = await adminClient
        .from('profiles')
        .select('id, exam_only')
        .eq('email', email)
        .maybeSingle();

      let userId: string;

      if (existingProfile.data?.id) {
        userId = String(existingProfile.data.id);
        await adminClient
          .from('profiles')
          .update({ exam_only: true, updated_at: new Date().toISOString() })
          .eq('id', userId);
      } else {
        const tempPassword = generateTempPassword(10);
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            phone_number: phone,
            must_reset_password: true,
            created_by_admin: true,
            exam_only: true
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

        userId = created.user.id;

        const { error: profileErr } = await adminClient.from('profiles').upsert({
          id: userId,
          full_name: fullName,
          email,
          phone,
          college_name: collegeName,
          profile_completed: true,
          must_reset_password: true,
          created_by_admin: true,
          exam_only: true,
          role: 'USER'
        });

        if (profileErr) {
          await adminClient.auth.admin.deleteUser(userId);
          results.push({ rowNumber, email, success: false, message: profileErr.message });
          continue;
        }

        let emailSent = false;
        let emailError: string | undefined;
        if (sendEmail) {
          const mail = await sendExamCredentialsEmail(
            email,
            fullName,
            tempPassword,
            String(exam.title),
            loginUrl
          );
          emailSent = mail.sent;
          emailError = mail.error;
        }

        const { error: candErr } = await adminClient.from('exam_candidates').upsert(
          {
            exam_id: examId,
            user_id: userId,
            exam_role_id: examRoleId,
            credentials_sent_at: sendEmail ? new Date().toISOString() : null
          },
          { onConflict: 'exam_id,user_id' }
        );

        if (candErr) {
          results.push({ rowNumber, email, success: false, message: candErr.message });
          continue;
        }

        results.push({
          rowNumber,
          email,
          success: true,
          message: emailSent
            ? 'Account created and credentials emailed.'
            : `Account created.${emailError ? ` Email not sent: ${emailError}` : ''}`,
          userId,
          tempPassword: emailSent ? undefined : tempPassword,
          emailSent
        });
        continue;
      }

      const { error: candErr } = await adminClient.from('exam_candidates').upsert(
        {
          exam_id: examId,
          user_id: userId,
          exam_role_id: examRoleId,
          credentials_sent_at: null
        },
        { onConflict: 'exam_id,user_id' }
      );

      if (candErr) {
        results.push({ rowNumber, email, success: false, message: candErr.message });
        continue;
      }

      results.push({
        rowNumber,
        email,
        success: true,
        message: 'Existing account registered for exam.',
        userId
      });
    }

    const ok = results.filter((r) => r.success).length;
    return json({ results, summary: { total: results.length, success: ok, failed: results.length - ok } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ error: message }, 500);
  }
});

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
  const { data: adminProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  const isAdmin =
    adminProfile?.role === 'ADMIN' || authData.user.user_metadata?.role === 'ADMIN';

  if (!isAdmin) return { ok: false, response: json({ error: 'Forbidden' }, 403) };

  return { ok: true, adminClient };
}

function generateTempPassword(length: number): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: Math.max(0, length - 4) }, () => pick(all));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function sendExamCredentialsEmail(
  to: string,
  fullName: string,
  tempPassword: string,
  examTitle: string,
  loginUrl: string
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim() ?? 'ULearn <noreply@ulearn-edu.in>';

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
      subject: `Your exam portal credentials — ${examTitle}`,
      html: `<p>Hi ${fullName},</p>
        <p>You have been registered for <strong>${examTitle}</strong>.</p>
        <p><strong>Exam portal:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
        <p><strong>Email:</strong> ${to}</p>
        <p><strong>Temporary password:</strong> ${tempPassword}</p>
        <p>Sign in, set a new password, then complete your exam during the scheduled window.</p>`
    })
  });

  if (!res.ok) return { sent: false, error: await res.text() };
  return { sent: true };
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
