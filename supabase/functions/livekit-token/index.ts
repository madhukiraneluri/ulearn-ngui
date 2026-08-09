import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { AccessToken } from 'npm:livekit-server-sdk@2.9.1';
import { corsHeaders, json } from '../_shared/admin-auth.ts';

type SessionRole = 'instructor' | 'moderator' | 'student';

interface InviteRow {
  id: string;
  role: SessionRole;
  revoked: boolean;
  live_sessions: {
    id: string;
    batch_id: string;
    livekit_room_name: string;
    status: string;
    host_user_id: string | null;
  };
}

function roleGrants(role: SessionRole): Record<string, boolean> {
  switch (role) {
    case 'instructor':
      return {
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: true
      };
    case 'moderator':
      return {
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: true
      };
    case 'student':
    default:
      return {
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      };
  }
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { ok: false as const, response: json({ error: 'Unauthorized' }, 401) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return { ok: false as const, response: json({ error: 'Unauthorized' }, 401) };
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, full_name')
    .eq('id', authData.user.id)
    .maybeSingle();

  const isAdmin =
    profile?.role === 'ADMIN' || authData.user.user_metadata?.role === 'ADMIN';

  return {
    ok: true as const,
    adminClient,
    userId: authData.user.id,
    userName: String(profile?.full_name ?? authData.user.email ?? 'Participant'),
    isAdmin
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const inviteToken = String(body?.inviteToken ?? '').trim();
    if (!inviteToken) {
      return json({ error: 'inviteToken is required' }, 400);
    }

    const apiKey = Deno.env.get('LIVEKIT_API_KEY')?.trim();
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')?.trim();
    const wsUrl = Deno.env.get('LIVEKIT_WS_URL')?.trim();

    if (!apiKey || !apiSecret || !wsUrl) {
      return json({ error: 'LiveKit is not configured on the server' }, 500);
    }

    const { data: invite, error: inviteErr } = await auth.adminClient
      .from('session_invites')
      .select(
        'id, role, revoked, live_sessions(id, batch_id, livekit_room_name, status, host_user_id)'
      )
      .eq('token', inviteToken)
      .maybeSingle();

    if (inviteErr || !invite) {
      return json({ error: 'Invalid invite link' }, 404);
    }

    const row = invite as unknown as InviteRow;
    if (row.revoked) {
      return json({ error: 'This invite link has been revoked' }, 403);
    }

    const session = row.live_sessions;
    if (!session) {
      return json({ error: 'Session not found' }, 404);
    }

    if (session.status === 'cancelled') {
      return json({ error: 'This session was cancelled' }, 403);
    }

    if (session.status === 'ended') {
      return json({ error: 'This session has ended' }, 403);
    }

    const role = row.role;

    if (role === 'student') {
      const { data: membership } = await auth.adminClient
        .from('batch_members')
        .select('id')
        .eq('batch_id', session.batch_id)
        .eq('user_id', auth.userId)
        .maybeSingle();

      if (!membership && !auth.isAdmin) {
        return json({ error: 'You are not assigned to this batch' }, 403);
      }
    } else if (role === 'instructor') {
      const isHost = session.host_user_id === auth.userId;
      if (!auth.isAdmin && !isHost) {
        return json({ error: 'Only the assigned instructor or admin can use this link' }, 403);
      }
    } else if (role === 'moderator') {
      if (!auth.isAdmin) {
        return json({ error: 'Only admins can use the moderator link' }, 403);
      }
    }

    if (role === 'instructor' && session.status === 'scheduled') {
      await auth.adminClient
        .from('live_sessions')
        .update({ status: 'live', started_at: new Date().toISOString() })
        .eq('id', session.id);
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: auth.userId,
      name: auth.userName,
      metadata: JSON.stringify({ role, sessionId: session.id })
    });

    at.addGrant({
      ...roleGrants(role),
      room: session.livekit_room_name
    });

    const token = await at.toJwt();

    await auth.adminClient.from('session_attendance').upsert(
      {
        session_id: session.id,
        user_id: auth.userId,
        role,
        joined_at: new Date().toISOString(),
        left_at: null
      },
      { onConflict: 'session_id,user_id' }
    );

    return json({
      token,
      wsUrl,
      roomName: session.livekit_room_name,
      role,
      sessionId: session.id
    });
  } catch (err) {
    console.error('livekit-token error:', err);
    const msg = err instanceof Error ? err.message : 'Token generation failed';
    return json({ error: msg }, 500);
  }
});
