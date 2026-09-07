import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { AccessToken, RoomServiceClient, TrackSource } from 'npm:livekit-server-sdk@2.9.1';
import { corsHeaders, json } from '../_shared/admin-auth.ts';

type SessionRole = 'instructor' | 'moderator' | 'student';

interface SessionRow {
  id: string;
  batch_id: string;
  livekit_room_name: string;
  status: string;
  host_user_id: string | null;
  max_participants: number | null;
  allow_student_mic: boolean;
  allow_student_camera: boolean;
  allow_student_unmute: boolean;
  isolate_students: boolean;
}

interface InviteRow {
  id: string;
  role: SessionRole;
  revoked: boolean;
  live_sessions: SessionRow | SessionRow[];
}

function livekitHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
}

function roleGrants(
  role: SessionRole,
  session: SessionRow
): Record<string, unknown> {
  const base = {
    roomJoin: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: role === 'instructor' || role === 'moderator'
  };

  if (role === 'instructor' || role === 'moderator') {
    return {
      ...base,
      canPublish: true,
      canPublishSources: [
        TrackSource.CAMERA,
        TrackSource.MICROPHONE,
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO
      ]
    };
  }

  const sources: TrackSource[] = [];
  if (session.allow_student_camera) sources.push(TrackSource.CAMERA);
  if (session.allow_student_mic && session.allow_student_unmute) {
    sources.push(TrackSource.MICROPHONE);
  }

  return {
    ...base,
    canPublish: sources.length > 0,
    canPublishSources: sources
  };
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false as const, response: json({ error: 'Unauthorized' }, 401) };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: authData, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !authData.user) {
    return { ok: false as const, response: json({ error: 'Unauthorized' }, 401) };
  }

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

async function listRoomParticipants(
  roomService: RoomServiceClient,
  roomName: string
): Promise<number> {
  try {
    const participants = await roomService.listParticipants(roomName);
    return participants.length;
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    if (
      msg.includes('not found') ||
      msg.includes('does not exist') ||
      msg.includes('not_exist') ||
      msg.includes('404')
    ) {
      return 0;
    }
    throw err;
  }
}

async function checkCapacity(
  roomService: RoomServiceClient,
  roomName: string,
  maxParticipants: number | null
): Promise<string | null> {
  if (!maxParticipants || maxParticipants <= 0) return null;

  const count = await listRoomParticipants(roomService, roomName);
  if (count >= maxParticipants) {
    return 'This session has reached the maximum number of participants';
  }
  return null;
}

function resolveSession(sessionRaw: SessionRow | SessionRow[] | null | undefined): SessionRow | null {
  if (!sessionRaw) return null;
  if (Array.isArray(sessionRaw)) return sessionRaw[0] ?? null;
  return sessionRaw;
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
        'id, role, revoked, live_sessions(id, batch_id, livekit_room_name, status, host_user_id, max_participants, allow_student_mic, allow_student_camera, allow_student_unmute, isolate_students)'
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

    const session = resolveSession(row.live_sessions);
    if (!session) {
      return json({ error: 'Session not found' }, 404);
    }

    if (!session.livekit_room_name?.trim()) {
      return json({ error: 'Session room is not configured' }, 500);
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

      if (!membership) {
        return json(
          {
            error:
              'Only students assigned to this batch can join with the student link'
          },
          403
        );
      }

      if (auth.isAdmin) {
        return json(
          { error: 'Admins cannot join using the student link. Use instructor or moderator link.' },
          403
        );
      }
    } else if (role === 'instructor') {
      const isHost = session.host_user_id === auth.userId;
      if (auth.isAdmin) {
        // Admins may always use the instructor link.
      } else if (!session.host_user_id) {
        return json({ error: 'No instructor is assigned to this session yet' }, 403);
      } else if (!isHost) {
        return json({ error: 'Only the assigned instructor or admin can use this link' }, 403);
      }
    } else if (role === 'moderator') {
      if (!auth.isAdmin) {
        return json({ error: 'Only admins can use the moderator link' }, 403);
      }
    }

    const roomService = new RoomServiceClient(livekitHttpUrl(wsUrl), apiKey, apiSecret);

    if (role !== 'instructor' && session.status === 'scheduled') {
      return json({ error: 'The instructor has not started this session yet' }, 403);
    }

    const capacityError = await checkCapacity(
      roomService,
      session.livekit_room_name,
      session.max_participants
    );
    if (capacityError) {
      return json({ error: capacityError }, 403);
    }

    const roomSettings = {
      allowStudentMic: session.allow_student_mic !== false,
      allowStudentCamera: session.allow_student_camera !== false,
      allowStudentUnmute: session.allow_student_unmute !== false,
      isolateStudents: session.isolate_students === true
    };

    const at = new AccessToken(apiKey, apiSecret, {
      identity: auth.userId,
      name: auth.userName,
      metadata: JSON.stringify({ role, sessionId: session.id })
    });

    at.addGrant({
      ...roleGrants(role, session),
      room: session.livekit_room_name
    });

    const token = await at.toJwt();

    if (session.status === 'live') {
      const { error: attendanceErr } = await auth.adminClient.from('session_attendance').upsert(
        {
          session_id: session.id,
          user_id: auth.userId,
          role,
          joined_at: new Date().toISOString(),
          left_at: null
        },
        { onConflict: 'session_id,user_id' }
      );
      if (attendanceErr) {
        console.error('session_attendance upsert failed:', attendanceErr);
      }
    }

    return json({
      token,
      wsUrl,
      roomName: session.livekit_room_name,
      role,
      sessionId: session.id,
      sessionStatus: session.status,
      roomSettings
    });
  } catch (err) {
    console.error('livekit-token error:', err);
    const msg = err instanceof Error ? err.message : 'Token generation failed';
    return json({ error: msg }, 500);
  }
});
