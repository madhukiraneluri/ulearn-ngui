import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { RoomServiceClient, TrackType } from 'npm:livekit-server-sdk@2.9.1';
import { corsHeaders, json } from '../_shared/admin-auth.ts';

type SessionRole = 'instructor' | 'moderator' | 'student';

interface SessionRow {
  id: string;
  livekit_room_name: string;
  host_user_id: string | null;
  allow_student_mic: boolean;
  allow_student_camera: boolean;
  allow_student_unmute: boolean;
  isolate_students: boolean;
}

function livekitHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
}

function mapSettings(session: SessionRow) {
  return {
    allowStudentMic: session.allow_student_mic !== false,
    allowStudentCamera: session.allow_student_camera !== false,
    allowStudentUnmute: session.allow_student_unmute !== false,
    isolateStudents: session.isolate_students === true
  };
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
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  const isAdmin =
    profile?.role === 'ADMIN' || authData.user.user_metadata?.role === 'ADMIN';

  return { ok: true as const, adminClient, userId: authData.user.id, isAdmin };
}

async function loadSession(adminClient: ReturnType<typeof createClient>, sessionId: string) {
  const { data, error } = await adminClient
    .from('live_sessions')
    .select(
      'id, livekit_room_name, host_user_id, allow_student_mic, allow_student_camera, allow_student_unmute, isolate_students'
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !data) return null;
  return data as SessionRow;
}

function canControlSession(session: SessionRow, userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return session.host_user_id === userId;
}

function parseParticipantRole(metadata: string | undefined): SessionRole {
  if (!metadata) return 'student';
  try {
    const parsed = JSON.parse(metadata) as { role?: SessionRole };
    return parsed.role ?? 'student';
  } catch {
    return 'student';
  }
}

async function muteParticipantAudio(
  roomService: RoomServiceClient,
  roomName: string,
  identity: string
): Promise<void> {
  const participant = await roomService.getParticipant(roomName, identity);
  for (const pub of participant.tracks) {
    if (pub.type === TrackType.AUDIO) {
      await roomService.mutePublishedTrack(roomName, identity, pub.sid, true);
    }
  }
}

async function muteAllStudents(
  roomService: RoomServiceClient,
  roomName: string
): Promise<void> {
  const participants = await roomService.listParticipants(roomName);
  for (const participant of participants) {
    if (parseParticipantRole(participant.metadata) !== 'student') continue;
    for (const pub of participant.tracks) {
      if (pub.type === TrackType.AUDIO) {
        await roomService.mutePublishedTrack(roomName, participant.identity, pub.sid, true);
      }
    }
  }
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
    const sessionId = String(body?.sessionId ?? '').trim();
    const action = String(body?.action ?? '').trim();

    if (!sessionId || !action) {
      return json({ error: 'sessionId and action are required' }, 400);
    }

    const session = await loadSession(auth.adminClient, sessionId);
    if (!session) {
      return json({ error: 'Session not found' }, 404);
    }

    if (!canControlSession(session, auth.userId, auth.isAdmin)) {
      return json({ error: 'Only the instructor or admin can control the room' }, 403);
    }

    const apiKey = Deno.env.get('LIVEKIT_API_KEY')?.trim();
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')?.trim();
    const wsUrl = Deno.env.get('LIVEKIT_WS_URL')?.trim();

    if (!apiKey || !apiSecret || !wsUrl) {
      return json({ error: 'LiveKit is not configured on the server' }, 500);
    }

    const roomService = new RoomServiceClient(livekitHttpUrl(wsUrl), apiKey, apiSecret);
    const roomName = session.livekit_room_name;
    const now = new Date().toISOString();
    let nextSession: SessionRow = { ...session };

    switch (action) {
      case 'start_session': {
        await auth.adminClient
          .from('live_sessions')
          .update({ status: 'live', started_at: now, updated_at: now })
          .eq('id', sessionId);
        break;
      }
      case 'mute_all': {
        await muteAllStudents(roomService, roomName);
        nextSession.allow_student_unmute = false;
        await auth.adminClient
          .from('live_sessions')
          .update({ allow_student_unmute: false, updated_at: now })
          .eq('id', sessionId);
        break;
      }
      case 'allow_unmute': {
        nextSession.allow_student_unmute = true;
        await auth.adminClient
          .from('live_sessions')
          .update({ allow_student_unmute: true, updated_at: now })
          .eq('id', sessionId);
        break;
      }
      case 'disallow_unmute': {
        await muteAllStudents(roomService, roomName);
        nextSession.allow_student_unmute = false;
        await auth.adminClient
          .from('live_sessions')
          .update({ allow_student_unmute: false, updated_at: now })
          .eq('id', sessionId);
        break;
      }
      case 'update_settings': {
        const settings = body?.settings ?? {};
        const payload: Record<string, unknown> = { updated_at: now };

        if (typeof settings.allowStudentMic === 'boolean') {
          payload.allow_student_mic = settings.allowStudentMic;
          nextSession.allow_student_mic = settings.allowStudentMic;
          if (!settings.allowStudentMic) {
            await muteAllStudents(roomService, roomName);
          }
        }
        if (typeof settings.allowStudentCamera === 'boolean') {
          payload.allow_student_camera = settings.allowStudentCamera;
          nextSession.allow_student_camera = settings.allowStudentCamera;
        }
        if (typeof settings.allowStudentUnmute === 'boolean') {
          payload.allow_student_unmute = settings.allowStudentUnmute;
          nextSession.allow_student_unmute = settings.allowStudentUnmute;
          if (!settings.allowStudentUnmute) {
            await muteAllStudents(roomService, roomName);
          }
        }

        await auth.adminClient.from('live_sessions').update(payload).eq('id', sessionId);
        break;
      }
      case 'mute_participant': {
        const identity = String(body?.participantIdentity ?? '').trim();
        if (!identity) {
          return json({ error: 'participantIdentity is required' }, 400);
        }
        await muteParticipantAudio(roomService, roomName, identity);
        break;
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }

    return json({ ok: true, settings: mapSettings(nextSession) });
  } catch (err) {
    console.error('session-room-control error:', err);
    const msg = err instanceof Error ? err.message : 'Room control failed';
    return json({ ok: false, error: msg }, 500);
  }
});
