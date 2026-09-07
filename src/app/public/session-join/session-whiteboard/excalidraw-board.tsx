import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Excalidraw, restoreAppState, restoreElements } from '@excalidraw/excalidraw';
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawPersistedScene, WhiteboardSyncMessage } from './whiteboard-sync.types';

export interface ExcalidrawBoardProps {
  sessionId: string;
  boardId: string;
  participantId: string;
  canDraw: boolean;
  loadPersistedScene: () => Promise<ExcalidrawPersistedScene | null>;
  onPersistScene: (scene: ExcalidrawPersistedScene) => void;
  onSyncOut: (message: WhiteboardSyncMessage) => void;
}

interface ExcalidrawBoardViewProps {
  viewModeEnabled: boolean;
  initialScene: ExcalidrawPersistedScene | null;
  onMountApi: (api: ExcalidrawImperativeAPI) => () => void;
}

function createSyncId(): string {
  return crypto.randomUUID();
}

function toPersistedScene(
  api: ExcalidrawImperativeAPI,
  appState: AppState,
  files: BinaryFiles
): ExcalidrawPersistedScene {
  return {
    elements: api.getSceneElementsIncludingDeleted() as unknown[],
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
      theme: appState.theme
    },
    files: files as Record<string, unknown>
  };
}

function applyPersistedScene(
  api: ExcalidrawImperativeAPI,
  scene: ExcalidrawPersistedScene
): void {
  const currentElements = api.getSceneElementsIncludingDeleted();
  const currentAppState = api.getAppState();

  api.updateScene({
    elements: restoreElements(scene.elements as Parameters<typeof restoreElements>[0], currentElements),
    appState: restoreAppState(scene.appState as Partial<AppState>, currentAppState)
  });

  if (scene.files) {
    const fileValues = Object.values(scene.files) as BinaryFileData[];
    if (fileValues.length > 0) {
      api.addFiles(fileValues);
    }
  }
}

function buildInitialData(scene: ExcalidrawPersistedScene | null): {
  elements: ReturnType<ExcalidrawImperativeAPI['getSceneElementsIncludingDeleted']>;
  appState: Partial<AppState>;
  files?: BinaryFiles;
} {
  if (!scene) {
    return { elements: [], appState: { viewBackgroundColor: '#ffffff' } };
  }

  return {
    elements: restoreElements(scene.elements as Parameters<typeof restoreElements>[0], null),
    appState: restoreAppState(scene.appState as Partial<AppState>, null),
    files: scene.files as BinaryFiles | undefined
  };
}

function ExcalidrawBoardView({
  viewModeEnabled,
  initialScene,
  onMountApi
}: ExcalidrawBoardViewProps): ReactElement {
  const initialData = buildInitialData(initialScene);

  return (
    <div className="excalidraw-board-root">
      <Excalidraw
        initialData={initialData}
        viewModeEnabled={viewModeEnabled}
        excalidrawAPI={(api) => onMountApi(api)}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            export: false,
            saveAsImage: false
          }
        }}
      />
    </div>
  );
}

export interface ExcalidrawBoardHost {
  update(props: ExcalidrawBoardProps): void;
  applyRemoteMessage(message: WhiteboardSyncMessage | null): void;
  destroy(): void;
}

export function mountExcalidrawBoard(host: HTMLElement, props: ExcalidrawBoardProps): ExcalidrawBoardHost {
  const root: Root = createRoot(host);
  const propsRef = useRefLike(props);
  const apiRef = { current: null as ExcalidrawImperativeAPI | null };
  const isApplyingRemoteRef = { current: false };
  const hasDocumentRef = { current: false };
  const syncTimerRef = { current: null as number | null };
  const persistTimerRef = { current: null as number | null };
  const pendingSceneRef = { current: null as ExcalidrawPersistedScene | null };
  const sentSyncIds = new Set<string>();
  const appliedSyncIds = new Set<string>();
  const viewModeRef = { current: !props.canDraw };
  const initialSceneRef = { current: null as ExcalidrawPersistedScene | null };
  let renderGeneration = 0;

  const rememberOutgoing = (message: WhiteboardSyncMessage): void => {
    sentSyncIds.add(message.syncId);
    if (sentSyncIds.size > 512) {
      sentSyncIds.clear();
    }
  };

  const shouldIgnoreRemote = (message: WhiteboardSyncMessage): boolean => {
    const localId = propsRef.current.participantId.trim();
    const senderId = message.senderId.trim();

    if (localId && senderId === localId) return true;
    if (sentSyncIds.has(message.syncId)) return true;
    if (appliedSyncIds.has(message.syncId)) return true;

    return false;
  };

  const flushSceneSync = (): void => {
    const scene = pendingSceneRef.current;
    pendingSceneRef.current = null;
    if (!scene || !hasDocumentRef.current) return;

    const message: WhiteboardSyncMessage = {
      type: 'EX_SCENE',
      boardId: propsRef.current.boardId,
      senderId: propsRef.current.participantId,
      syncId: createSyncId(),
      scene
    };
    rememberOutgoing(message);
    propsRef.current.onSyncOut(message);
  };

  const queueSceneSync = (scene: ExcalidrawPersistedScene): void => {
    pendingSceneRef.current = scene;
    if (syncTimerRef.current != null) return;
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      flushSceneSync();
    }, 96);
  };

  const queuePersist = (scene: ExcalidrawPersistedScene): void => {
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      propsRef.current.onPersistScene(scene);
    }, 1800);
  };

  const sendSnapshot = (): void => {
    const api = apiRef.current;
    if (!api || !hasDocumentRef.current) return;

    const scene = toPersistedScene(api, api.getAppState(), api.getFiles());
    const message: WhiteboardSyncMessage = {
      type: 'EX_SNAPSHOT',
      boardId: propsRef.current.boardId,
      senderId: propsRef.current.participantId,
      syncId: createSyncId(),
      scene
    };
    rememberOutgoing(message);
    propsRef.current.onSyncOut(message);
  };

  const requestSync = (): void => {
    const message: WhiteboardSyncMessage = {
      type: 'EX_REQUEST',
      boardId: propsRef.current.boardId,
      senderId: propsRef.current.participantId,
      syncId: createSyncId()
    };
    rememberOutgoing(message);
    propsRef.current.onSyncOut(message);
  };

  const handleRemoteMessage = (remoteMessage: WhiteboardSyncMessage | null): void => {
    const api = apiRef.current;
    if (!api || !remoteMessage) return;

    const { boardId } = propsRef.current;
    if (remoteMessage.boardId !== boardId) return;
    if (shouldIgnoreRemote(remoteMessage)) return;

    appliedSyncIds.add(remoteMessage.syncId);
    if (appliedSyncIds.size > 512) {
      appliedSyncIds.clear();
    }

    if (remoteMessage.type === 'EX_REQUEST') {
      sendSnapshot();
      return;
    }

    if (remoteMessage.type === 'EX_SNAPSHOT' || remoteMessage.type === 'EX_SCENE') {
      isApplyingRemoteRef.current = true;
      applyPersistedScene(api, remoteMessage.scene);
      hasDocumentRef.current = true;
      requestAnimationFrame(() => {
        isApplyingRemoteRef.current = false;
      });
    }
  };

  const mountApi = (api: ExcalidrawImperativeAPI): (() => void) => {
    apiRef.current = api;
    hasDocumentRef.current = Boolean(initialSceneRef.current?.elements?.length);
    requestSync();

    const unsubscribe = api.onChange((elements, appState, files) => {
      if (isApplyingRemoteRef.current) return;
      if (!propsRef.current.canDraw) return;

      hasDocumentRef.current = elements.length > 0;
      const scene = toPersistedScene(api, appState, files);
      queueSceneSync(scene);
      queuePersist(scene);
    });

    return () => {
      unsubscribe();
      apiRef.current = null;
    };
  };

  const render = (): void => {
    const generation = ++renderGeneration;

    root.render(
      <ExcalidrawBoardView
        viewModeEnabled={viewModeRef.current}
        initialScene={initialSceneRef.current}
        onMountApi={(api) => {
          if (generation !== renderGeneration) {
            return () => undefined;
          }
          return mountApi(api);
        }}
      />
    );
  };

  void props.loadPersistedScene().then((scene) => {
    initialSceneRef.current = scene;
    hasDocumentRef.current = Boolean(scene?.elements?.length);
    render();
  });

  return {
    update(nextProps: ExcalidrawBoardProps): void {
      const prev = propsRef.current;
      propsRef.current = nextProps;

      const nextViewMode = !nextProps.canDraw;
      if (prev.canDraw !== nextProps.canDraw && viewModeRef.current !== nextViewMode) {
        viewModeRef.current = nextViewMode;
        render();
      }

      if (prev.boardId !== nextProps.boardId || prev.sessionId !== nextProps.sessionId) {
        sentSyncIds.clear();
        appliedSyncIds.clear();
        void nextProps.loadPersistedScene().then((scene) => {
          initialSceneRef.current = scene;
          hasDocumentRef.current = Boolean(scene?.elements?.length);
          render();
        });
        return;
      }

      if (prev.participantId !== nextProps.participantId) {
        requestSync();
      }
    },
    applyRemoteMessage(message: WhiteboardSyncMessage | null): void {
      handleRemoteMessage(message);
    },
    destroy(): void {
      if (syncTimerRef.current != null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      root.unmount();
      apiRef.current = null;
    }
  };
}

function useRefLike<T>(initial: T): { current: T } {
  return { current: initial };
}
