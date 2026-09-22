/**
 * Batch-send credential emails for all pending exam_registrations (service role).
 * Usage: node scripts/send-all-pending-exam-credentials.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://yllfccuxohnipleyseup.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? 'ULearn <noreply@ulearn-edu.in>';
const LOGIN_URL = process.env.ULEARN_EXAM_LOGIN_URL ?? 'https://www.ulearn-edu.in/exam/login';
const BATCH_SIZE = 25;

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function generateTempPassword(length = 10) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (chars) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(upper), pick(lower), pick(digits)];
  const rest = Array.from({ length: Math.max(0, length - 3) }, () => pick(all));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function formatExamWindow(startsAt, endsAt) {
  if (!startsAt || !endsAt) return '';
  const options = { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' };
  const start = new Date(startsAt).toLocaleString('en-IN', options);
  const end = new Date(endsAt).toLocaleString('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  return `${start} to ${end} (IST)`;
}

async function sendEmail(to, fullName, tempPassword, examTitle, examWindow) {
  if (!RESEND_API_KEY) return { sent: false, error: 'RESEND_API_KEY not set' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject: `Your ULearn exam portal credentials — ${examTitle}`,
      html: `<p>Hi ${fullName},</p>
        <p>We are happy to share your ULearn exam portal access for <strong>${examTitle}</strong>.</p>
        <p>Please sign in and <strong>reset your password now</strong>, well before your examination timing.</p>
        ${examWindow ? `<p><strong>Exam window:</strong> ${examWindow}</p>` : ''}
        <p><strong>Exam portal:</strong> <a href="${LOGIN_URL}">${LOGIN_URL}</a></p>
        <p><strong>Email:</strong> ${to}</p>
        <p><strong>Temporary password:</strong> ${tempPassword}</p>
        <p>Best of luck,<br/>Team ULearn</p>`
    })
  });

  if (!res.ok) return { sent: false, error: await res.text() };
  return { sent: true };
}

async function fetchPendingBatch() {
  const { data, error } = await supabase
    .from('exam_registrations')
    .select('id, email, full_name, user_id, exams(title, starts_at, ends_at)')
    .is('credentials_sent_at', null)
    .not('user_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function main() {
  let sent = 0;
  let failed = 0;
  let processed = 0;

  while (true) {
    const batch = await fetchPendingBatch();
    if (batch.length === 0) break;

    for (const row of batch) {
      processed++;
      const exam = row.exams;
      const examTitle = exam?.title ?? 'Exam';
      const examWindow = formatExamWindow(exam?.starts_at, exam?.ends_at);
      const tempPassword = generateTempPassword(10);

      const { error: pwErr } = await supabase.auth.admin.updateUserById(String(row.user_id), {
        password: tempPassword,
        user_metadata: { must_reset_password: true, exam_only: true, full_name: row.full_name }
      });

      if (pwErr) {
        failed++;
        console.error('Password failed', row.email, pwErr.message);
        continue;
      }

      await supabase
        .from('profiles')
        .update({ must_reset_password: true, exam_only: true, updated_at: new Date().toISOString() })
        .eq('id', row.user_id);

      const mail = await sendEmail(row.email, row.full_name, tempPassword, examTitle, examWindow);
      if (mail.sent) {
        await supabase
          .from('exam_registrations')
          .update({ credentials_sent_at: new Date().toISOString() })
          .eq('id', row.id);
        sent++;
      } else {
        failed++;
        console.error('Email failed', row.email, mail.error);
      }
    }

    console.log(`Progress: ${sent} sent, ${failed} failed, ${processed} processed this run`);
  }

  const { count } = await supabase
    .from('exam_registrations')
    .select('*', { count: 'exact', head: true })
    .is('credentials_sent_at', null)
    .not('user_id', 'is', null);

  console.log('\nDone.', { sent, failed, processed, stillPending: count ?? 0 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
