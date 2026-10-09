import { generateTempPassword, requireAdmin, sendHtmlEmail, escapeHtml, json } from '../_shared/admin-auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { adminClient, adminUser, adminUserId } = auth;

    const { data: profile } = await adminClient
      .from('profiles')
      .select('email, full_name, role')
      .eq('id', adminUserId)
      .maybeSingle();

    if (profile?.role !== 'ADMIN' && adminUser.user_metadata?.role !== 'ADMIN') {
      return json({ error: 'Forbidden' }, 403);
    }

    const to = String(adminUser.email ?? profile?.email ?? '').trim().toLowerCase();
    if (!to) return json({ error: 'This admin account has no email address' }, 400);

    const fullName = String(profile?.full_name ?? adminUser.user_metadata?.full_name ?? 'Admin');
    const tempPassword = generateTempPassword();
    const loginUrl = adminLoginUrl();

    const mail = await sendHtmlEmail(
      to,
      'Your ULearn admin temporary password',
      `<p>Hi ${escapeHtml(fullName)},</p>
       <p>A password reset was requested for your ULearn admin account.</p>
       <p><strong>Sign in:</strong> <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>
       <p><strong>Email:</strong> ${escapeHtml(to)}</p>
       <p><strong>Temporary password:</strong> ${escapeHtml(tempPassword)}</p>
       <p>Sign in with this temporary password. You will be asked to choose a new password before continuing.</p>
       <p>If you did not request this, sign in with the temporary password immediately and set a new one.</p>
       <p>— ULearn Team</p>`
    );

    if (!mail.sent) {
      return json({ error: mail.error ?? 'Could not send reset email' }, 502);
    }

    const metadata = {
      ...(adminUser.user_metadata ?? {}),
      must_reset_password: true
    };

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(adminUserId, {
      password: tempPassword,
      user_metadata: metadata
    });
    if (updateErr) {
      return json({
        error: 'The email was sent, but the password could not be updated. Request reset again.'
      }, 500);
    }

    const { error: profileErr } = await adminClient
      .from('profiles')
      .update({ must_reset_password: true })
      .eq('id', adminUserId);

    if (profileErr) {
      return json({ error: profileErr.message }, 500);
    }

    return json({ success: true, emailSent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ error: message }, 500);
  }
});

function adminLoginUrl(): string {
  const configured = Deno.env.get('ULEARN_ADMIN_LOGIN_URL')?.trim();
  if (configured) return configured;
  const student = Deno.env.get('ULEARN_LOGIN_URL')?.trim();
  if (student) return student.replace(/\/auth\/login\/?$/, '/auth/admin');
  return 'https://www.ulearn-edu.in/auth/admin';
}
