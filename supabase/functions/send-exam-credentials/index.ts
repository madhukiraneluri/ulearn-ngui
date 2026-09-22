import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { adminClient } = auth;

    const body = await req.json();
    const registrationIds = Array.isArray(body?.registrationIds)
      ? body.registrationIds.map((id: unknown) => String(id))
      : [];
    const examId = body?.examId ? String(body.examId) : null;
    const onlyUnsent = body?.onlyUnsent !== false;
    const MAX_BATCH = 40;

    if (registrationIds.length > MAX_BATCH) {
      return json({ error: `Send at most ${MAX_BATCH} registrationIds per request (use batched sends)` }, 400);
    }

    let query = adminClient
      .from('exam_registrations')
      .select('id, email, full_name, exam_id, user_id, credentials_sent_at, exams(title, starts_at, ends_at)');

    if (registrationIds.length > 0) {
      query = query.in('id', registrationIds);
    } else if (examId) {
      query = query.eq('exam_id', examId);
    } else if (onlyUnsent) {
      query = query.order('created_at', { ascending: true });
    } else {
      return json(
        { error: 'Provide registrationIds (max 40), examId, or onlyUnsent for the next pending batch' },
        400
      );
    }

    if (onlyUnsent) query = query.is('credentials_sent_at', null);

    query = query.not('user_id', 'is', null);

    if (registrationIds.length === 0) {
      query = query.limit(MAX_BATCH);
    }

    const { data: rows, error } = await query;
    if (error) return json({ error: error.message }, 500);
    if (!rows?.length) return json({ summary: { total: 0, sent: 0, failed: 0 }, results: [] });

    const loginUrl =
      Deno.env.get('ULEARN_EXAM_LOGIN_URL')?.trim() ??
      'https://www.ulearn-edu.in/exam/login';

    const results: Array<{
      registrationId: string;
      email: string;
      success: boolean;
      message: string;
      tempPassword?: string;
    }> = [];

    for (const row of rows) {
      const registrationId = String(row.id);
      const email = String(row.email);
      const fullName = String(row.full_name);
      const examTitle = (row.exams as { title?: string } | null)?.title ?? 'Exam';
      const examMeta = row.exams as { starts_at?: string; ends_at?: string } | null;
      const examWindow = formatExamWindow(examMeta?.starts_at, examMeta?.ends_at);

      const tempPassword = generateTempPassword(10);
      const { error: pwErr } = await adminClient.auth.admin.updateUserById(String(row.user_id), {
        password: tempPassword,
        user_metadata: { must_reset_password: true, exam_only: true, full_name: fullName }
      });

      if (pwErr) {
        results.push({ registrationId, email, success: false, message: pwErr.message });
        continue;
      }

      await adminClient.from('profiles').update({
        must_reset_password: true,
        exam_only: true,
        updated_at: new Date().toISOString()
      }).eq('id', row.user_id);

      const mail = await sendExamCredentialsEmail(
        email,
        fullName,
        tempPassword,
        examTitle,
        loginUrl,
        examWindow
      );
      if (mail.sent) {
        await adminClient.from('exam_registrations').update({
          credentials_sent_at: new Date().toISOString()
        }).eq('id', row.id);
        results.push({
          registrationId,
          email,
          success: true,
          message: 'Credentials emailed',
          tempPassword
        });
      } else {
        results.push({
          registrationId,
          email,
          success: false,
          message: mail.error ?? 'Email failed',
          tempPassword
        });
      }
    }

    const sent = results.filter((r) => r.success).length;
    return json({ results, summary: { total: results.length, sent, failed: results.length - sent } });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

function generateTempPassword(length: number): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(upper), pick(lower), pick(digits)];
  const rest = Array.from({ length: Math.max(0, length - 3) }, () => pick(all));
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
  loginUrl: string,
  examWindow: string
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim() ?? 'ULearn <noreply@ulearn-edu.in>';
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not configured' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Your ULearn exam portal credentials — ${examTitle}`,
      html: `<p>Hi ${fullName},</p>
        <p>We are happy to share your ULearn exam portal access for <strong>${examTitle}</strong>.</p>
        <p>Please sign in and <strong>reset your password now</strong>, well before your examination timing. You will not be able to start the exam until you have set a new password.</p>
        ${examWindow ? `<p><strong>Exam window:</strong> ${examWindow}</p>` : ''}
        <p><strong>Exam portal:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
        <p><strong>Email:</strong> ${to}</p>
        <p><strong>Temporary password:</strong> ${tempPassword}</p>
        <p>Steps: sign in → set a new password → wait for the exam window to open → complete your exam during the scheduled time.</p>
        <p>Best of luck,<br/>Team ULearn</p>`
    })
  });

  if (!res.ok) return { sent: false, error: await res.text() };
  return { sent: true };
}

function formatExamWindow(startsAt?: string, endsAt?: string): string {
  if (!startsAt || !endsAt) return '';
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  };
  const start = new Date(startsAt).toLocaleString('en-IN', options);
  const end = new Date(endsAt).toLocaleString('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  return `${start} to ${end} (IST)`;
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
