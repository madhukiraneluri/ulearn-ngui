import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, escapeHtml, json } from '../_shared/admin-auth.ts';

const MAX_RECIPIENTS = 100;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_CHARS = 2_100_000;

interface TextBlock { type: 'text'; text: string }
interface ImageBlock { type: 'image'; url: string; alt?: string }
interface Attachment { filename: string; contentBase64: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData.user) return json({ error: 'Unauthorized' }, 401);

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: allowed, error: permError } = await adminClient.rpc('user_can_send_promotions', {
      target_user: authData.user.id
    });
    if (permError) return json({ error: permError.message }, 500);
    if (allowed !== true) return json({ error: 'You cannot send promotion emails' }, 403);

    const body = await req.json().catch(() => ({}));
    const subject = String(body?.subject ?? '').replace(/[\r\n]/g, ' ').trim();
    if (!subject || subject.length > 180) return json({ error: 'Enter a subject' }, 400);

    const emails = [...new Set(
      (Array.isArray(body?.emails) ? body.emails : [])
        .map((email: unknown) => String(email).trim().toLowerCase())
        .filter((email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )];
    if (!emails.length) return json({ error: 'Add at least one email' }, 400);
    if (emails.length > MAX_RECIPIENTS) return json({ error: 'Send to 100 addresses at a time' }, 400);

    const blocks = Array.isArray(body?.blocks) ? body.blocks as Array<TextBlock | ImageBlock> : [];
    const html = renderHtml(blocks);
    if (!html) return json({ error: 'Add some content' }, 400);

    const attachments = (Array.isArray(body?.attachments) ? body.attachments as Attachment[] : [])
      .slice(0, MAX_ATTACHMENTS)
      .map((file) => ({
        filename: String(file.filename ?? 'file').replace(/[^\w.\- ]/g, '').slice(0, 120) || 'file',
        content: String(file.contentBase64 ?? '')
      }))
      .filter((file) => file.content && file.content.length <= MAX_ATTACHMENT_CHARS);

    const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim() ?? 'ULearn <noreply@ulearn-edu.in>';
    const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
    if (!apiKey) return json({ error: 'Email sending is not configured' }, 500);

    if (attachments.length && emails.length > 20) {
      return json({ error: 'With attachments, send to 20 addresses at a time' }, 400);
    }

    const failed: { email: string; error: string }[] = [];
    let sent = 0;
    const chunkSize = attachments.length ? 1 : 50;

    for (let i = 0; i < emails.length; i += chunkSize) {
      const chunk = emails.slice(i, i + chunkSize);
      const payload = chunk.map((email) => ({
        from,
        to: [email],
        subject,
        html,
        ...(attachments.length ? { attachments } : {})
      }));
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errText = await res.text();
        for (const email of chunk) failed.push({ email, error: errText || `Resend HTTP ${res.status}` });
        continue;
      }
      sent += chunk.length;
    }

    return json({ success: true, sent, failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return json({ error: message }, 500);
  }
});

function renderHtml(blocks: Array<TextBlock | ImageBlock>): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block?.type === 'text') {
      const text = String(block.text ?? '').trim();
      if (!text) continue;
      parts.push(`<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`);
    } else if (block?.type === 'image') {
      const url = String(block.url ?? '').trim();
      if (!url.startsWith('https://')) continue;
      const alt = escapeHtml(String(block.alt ?? 'Promotion image'));
      parts.push(`<p><img src="${escapeHtml(url)}" alt="${alt}" style="max-width:100%;height:auto"></p>`);
    }
  }
  if (!parts.length) return '';
  return `<div style="font-family:Arial,sans-serif;color:#1e1e2e;line-height:1.5">${parts.join('')}<p style="color:#667;font-size:12px">ULearn</p></div>`;
}
