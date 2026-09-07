import { useRef, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { squashRecordDiffs, type RecordsDiff } from '@tldraw/store';
import type { TLRecord } from '@tldraw/tlschema';
import {
  Tldraw,
  getSnapshot,
  loadSnapshot,
  type Editor
} from '@tldraw/tldraw';
import type { TldrawSyncMessage } from './tldraw-sync.types';
import { meritHubUiComponents, MeritHubFloatingToolbar, MeritHubNavigationPanel, MeritHubStylePanel } from './tldraw-merithub-ui';
import { localTldrawAssetUrls } from './tldraw-asset-urls';

export interface TldrawBoardProps {
  boardId: string;
  participantId: string;
  canDraw: boolean;
  onSyncOut: (message: TldrawSyncMessage) => void;
}

interface TldrawBoardViewProps {
  onMountEditor: (editor: Editor) => () => void;
}

function createSyncId(): string {
  return crypto.randomUUID();
}

function waitForCanvas(root: HTMLElement): Promise<HTMLElement | null> {
  const existing = root.querySelector('.tl-canvas');
  if (existing instanceof HTMLElement) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    let timeout: ReturnType<typeof window.setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      const canvas = root.querySelector('.tl-canvas');
      if (canvas instanceof HTMLElement) {
        finish(canvas);
      }
    });

    const finish = (canvas: HTMLElement | null): void => {
      if (timeout != null) {
        window.clearTimeout(timeout);
      }
      observer.disconnect();
      resolve(canvas);
    };

    observer.observe(root, { childList: true, subtree: true });
    timeout = window.setTimeout(() => finish(null), 3000);
  });
}

function syncViewportBounds(editor: Editor, canvas: HTMLElement): void {
  editor.updateViewportScreenBounds(canvas);
}

function TldrawBoardView({ onMountEditor }: TldrawBoardViewProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={rootRef} className="tldraw-board-root merithub-tldraw">
      <Tldraw
        hideUi
        assetUrls={localTldrawAssetUrls}
        components={meritHubUiComponents}
        onMount={(editor) => {
          const root = rootRef.current;
          if (!root) {
            return onMountEditor(editor);
          }

          void waitForCanvas(root).then((canvas) => {
            if (!canvas) return;
            requestAnimationFrame(() => syncViewportBounds(editor, canvas));
          });

          const disposeEditor = onMountEditor(editor);

          return () => {
            disposeEditor();
          };
        }}
      >
        <MeritHubFloatingToolbar />
        <MeritHubStylePanel />
        <MeritHubNavigationPanel />
      </Tldraw>
    </div>
  );
}

export interface TldrawBoardHost {
  update(props: TldrawBoardProps): void;
  applyRemoteMessage(message: TldrawSyncMessage | null): void;
  destroy(): void;
}

export function mountTldrawBoard(host: HTMLElement, props: TldrawBoardProps): TldrawBoardHost {
  const root: Root = createRoot(host);
  const propsRef = useRefLike(props);
  const editorRef = { current: null as Editor | null };
  const hasDocumentRef = { current: false };
  const flushTimerRef = { current: null as number | null };
  const pendingDiffsRef = { current: [] as RecordsDiff<TLRecord>[] };
  const sentSyncIds = new Set<string>();
  const appliedSyncIds = new Set<string>();
  let renderGeneration = 0;

  const rememberOutgoing = (message: TldrawSyncMessage): void => {
    sentSyncIds.add(message.syncId);
    if (sentSyncIds.size > 512) {
      sentSyncIds.clear();
    }
  };

  const shouldIgnoreRemote = (message: TldrawSyncMessage): boolean => {
    const localId = propsRef.current.participantId.trim();
    const senderId = message.senderId.trim();

    if (localId && senderId === localId) return true;
    if (sentSyncIds.has(message.syncId)) return true;
    if (appliedSyncIds.has(message.syncId)) return true;

    return false;
  };

  const flushDiffs = (): void => {
    if (!pendingDiffsRef.current.length) return;

    const diff = squashRecordDiffs(pendingDiffsRef.current);
    pendingDiffsRef.current = [];

    if (
      Object.keys(diff.added).length ||
      Object.keys(diff.updated).length ||
      Object.keys(diff.removed).length
    ) {
      const message: TldrawSyncMessage = {
        type: 'TL_DIFF',
        boardId: propsRef.current.boardId,
        senderId: propsRef.current.participantId,
        syncId: createSyncId(),
        diff
      };
      rememberOutgoing(message);
      propsRef.current.onSyncOut(message);
    }
  };

  const queueDiff = (diff: RecordsDiff<TLRecord>): void => {
    pendingDiffsRef.current.push(diff);
    if (flushTimerRef.current != null) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushDiffs();
    }, 48);
  };

  const sendSnapshot = (): void => {
    const editor = editorRef.current;
    if (!editor || !hasDocumentRef.current) return;

    const message: TldrawSyncMessage = {
      type: 'TL_SNAPSHOT',
      boardId: propsRef.current.boardId,
      senderId: propsRef.current.participantId,
      syncId: createSyncId(),
      snapshot: getSnapshot(editor.store)
    };
    rememberOutgoing(message);
    propsRef.current.onSyncOut(message);
  };

  const requestSync = (): void => {
    const message: TldrawSyncMessage = {
      type: 'TL_REQUEST',
      boardId: propsRef.current.boardId,
      senderId: propsRef.current.participantId,
      syncId: createSyncId()
    };
    rememberOutgoing(message);
    propsRef.current.onSyncOut(message);
  };

  const handleRemoteMessage = (remoteMessage: TldrawSyncMessage | null): void => {
    const editor = editorRef.current;
    if (!editor || !remoteMessage) return;

    const { boardId } = propsRef.current;
    if (remoteMessage.boardId !== boardId) return;
    if (shouldIgnoreRemote(remoteMessage)) return;

    appliedSyncIds.add(remoteMessage.syncId);
    if (appliedSyncIds.size > 512) {
      appliedSyncIds.clear();
    }

    if (remoteMessage.type === 'TL_REQUEST') {
      sendSnapshot();
      return;
    }

    if (remoteMessage.type === 'TL_SNAPSHOT') {
      editor.store.mergeRemoteChanges(() => {
        loadSnapshot(editor.store, remoteMessage.snapshot);
      });
      hasDocumentRef.current = true;
      return;
    }

    if (remoteMessage.type === 'TL_DIFF') {
      editor.store.mergeRemoteChanges(() => {
        editor.store.applyDiff(remoteMessage.diff);
      });
      hasDocumentRef.current = true;
    }
  };

  const mountEditor = (editor: Editor): (() => void) => {
    editorRef.current = editor;
    hasDocumentRef.current = false;
    editor.updateInstanceState({ isReadonly: !propsRef.current.canDraw });
    requestSync();

    const unlisten = editor.store.listen(
      (entry) => {
        hasDocumentRef.current = true;
        queueDiff(entry.changes);
      },
      { source: 'user', scope: 'document' }
    );

    return () => {
      unlisten();
      editorRef.current = null;
    };
  };

  const render = (): void => {
    const generation = ++renderGeneration;

    root.render(
      <TldrawBoardView
        onMountEditor={(editor) => {
          if (generation !== renderGeneration) {
            return () => undefined;
          }
          return mountEditor(editor);
        }}
      />
    );
  };

  render();

  return {
    update(nextProps: TldrawBoardProps): void {
      const prev = propsRef.current;
      propsRef.current = nextProps;

      if (prev.canDraw !== nextProps.canDraw) {
        editorRef.current?.updateInstanceState({ isReadonly: !nextProps.canDraw });
      }

      if (prev.boardId !== nextProps.boardId) {
        sentSyncIds.clear();
        appliedSyncIds.clear();
        render();
        return;
      }

      if (prev.participantId !== nextProps.participantId) {
        requestSync();
      }
    },
    applyRemoteMessage(message: TldrawSyncMessage | null): void {
      handleRemoteMessage(message);
    },
    destroy(): void {
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      root.unmount();
      editorRef.current = null;
    }
  };
}

function useRefLike<T>(initial: T): { current: T } {
  return { current: initial };
}
