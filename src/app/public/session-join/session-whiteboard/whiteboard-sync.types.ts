/** Serializable Excalidraw scene stored in Supabase and synced over LiveKit. */
export interface ExcalidrawPersistedScene {
  elements: unknown[];
  appState: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export type WhiteboardSyncMessage =
  | WhiteboardSnapshotMessage
  | WhiteboardSceneMessage
  | WhiteboardRequestMessage;

export interface WhiteboardSnapshotMessage {
  type: 'EX_SNAPSHOT';
  boardId: string;
  senderId: string;
  syncId: string;
  scene: ExcalidrawPersistedScene;
}

export interface WhiteboardSceneMessage {
  type: 'EX_SCENE';
  boardId: string;
  senderId: string;
  syncId: string;
  scene: ExcalidrawPersistedScene;
}

export interface WhiteboardRequestMessage {
  type: 'EX_REQUEST';
  boardId: string;
  senderId: string;
  syncId: string;
}

export function isWhiteboardSyncMessage(value: unknown): value is WhiteboardSyncMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const candidate = value as { type: string; syncId?: unknown };
  if (typeof candidate.syncId !== 'string' || !candidate.syncId) return false;
  return candidate.type === 'EX_SNAPSHOT' || candidate.type === 'EX_SCENE' || candidate.type === 'EX_REQUEST';
}

/** @deprecated Use isWhiteboardSyncMessage */
export const isTldrawSyncMessage = isWhiteboardSyncMessage;

/** @deprecated Use WhiteboardSyncMessage */
export type TldrawSyncMessage = WhiteboardSyncMessage;
