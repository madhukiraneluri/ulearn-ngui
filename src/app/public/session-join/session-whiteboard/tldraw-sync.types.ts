import type { RecordsDiff } from '@tldraw/store';
import type { TLRecord } from '@tldraw/tlschema';
import type { TLEditorSnapshot } from '@tldraw/editor';

export type TldrawSyncMessage =
  | TldrawDiffMessage
  | TldrawSnapshotMessage
  | TldrawRequestMessage;

export interface TldrawDiffMessage {
  type: 'TL_DIFF';
  boardId: string;
  senderId: string;
  syncId: string;
  diff: RecordsDiff<TLRecord>;
}

export interface TldrawSnapshotMessage {
  type: 'TL_SNAPSHOT';
  boardId: string;
  senderId: string;
  syncId: string;
  snapshot: TLEditorSnapshot;
}

export interface TldrawRequestMessage {
  type: 'TL_REQUEST';
  boardId: string;
  senderId: string;
  syncId: string;
}

export function isTldrawSyncMessage(value: unknown): value is TldrawSyncMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const candidate = value as { type: string; syncId?: unknown };
  if (typeof candidate.syncId !== 'string' || !candidate.syncId) return false;
  return candidate.type === 'TL_DIFF' || candidate.type === 'TL_SNAPSHOT' || candidate.type === 'TL_REQUEST';
}
