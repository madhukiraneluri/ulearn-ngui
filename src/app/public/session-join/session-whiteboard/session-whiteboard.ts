import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionBoardService } from '../../../shared/services/session-board.service';
import type { ExcalidrawBoardHost } from './excalidraw-board';
import type { WhiteboardSyncMessage } from './whiteboard-sync.types';

@Component({
  selector: 'app-session-whiteboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './session-whiteboard.html',
  styleUrl: './session-whiteboard.scss'
})
export class SessionWhiteboard implements OnDestroy {
  private readonly boardService = inject(SessionBoardService);

  readonly sessionId = input('');
  readonly boardId = input('board-1');
  readonly participantId = input('');
  readonly enabled = input(true);
  readonly canDraw = input(true);
  readonly remoteMessage = input<WhiteboardSyncMessage | null>(null);

  readonly syncOut = output<WhiteboardSyncMessage>();

  readonly hostRef = viewChild<ElementRef<HTMLDivElement>>('host');

  readonly loading = signal(true);

  private boardHost: ExcalidrawBoardHost | null = null;
  private mountGeneration = 0;
  private readonly syncOutHandler = (message: WhiteboardSyncMessage): void => {
    this.syncOut.emit(message);
  };

  constructor() {
    effect(() => {
      this.sessionId();
      this.boardId();
      this.enabled();
      const el = this.hostRef()?.nativeElement;
      if (!this.enabled()) {
        this.destroyBoard();
        return;
      }
      if (!el) return;
      void this.remountBoard();
    });

    effect(() => {
      this.participantId();
      this.canDraw();
      this.patchBoardProps();
    });

    effect(() => {
      const remote = this.remoteMessage();
      this.boardHost?.applyRemoteMessage(remote);
    });
  }

  ngOnDestroy(): void {
    this.destroyBoard();
  }

  private waitForHostLayout(el: HTMLElement): Promise<void> {
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let timeout: ReturnType<typeof window.setTimeout> | undefined;
      const observer = new ResizeObserver(() => {
        if (el.clientWidth > 0 && el.clientHeight > 0) {
          finish();
        }
      });

      const finish = (): void => {
        if (timeout != null) {
          window.clearTimeout(timeout);
        }
        observer.disconnect();
        resolve();
      };

      timeout = window.setTimeout(finish, 2500);
      observer.observe(el);
    });
  }

  private async remountBoard(): Promise<void> {
    const el = this.hostRef()?.nativeElement;
    if (!el || !this.enabled()) return;

    const sessionId = this.sessionId();
    if (!sessionId) return;

    this.loading.set(true);
    this.destroyBoard();
    await this.waitForHostLayout(el);

    const generation = ++this.mountGeneration;
    const { mountExcalidrawBoard } = await import('./excalidraw-board');

    if (generation !== this.mountGeneration) return;

    const boardId = this.boardId();

    this.boardHost = mountExcalidrawBoard(el, {
      sessionId,
      boardId,
      participantId: this.participantId(),
      canDraw: this.canDraw(),
      loadPersistedScene: () => this.boardService.loadBoard(sessionId, boardId),
      onPersistScene: (scene) => {
        void this.boardService.saveBoard(sessionId, boardId, scene);
      },
      onSyncOut: this.syncOutHandler
    });

    this.loading.set(false);
  }

  private patchBoardProps(): void {
    if (!this.boardHost) return;

    const sessionId = this.sessionId();
    const boardId = this.boardId();

    this.boardHost.update({
      sessionId,
      boardId,
      participantId: this.participantId(),
      canDraw: this.canDraw(),
      loadPersistedScene: () => this.boardService.loadBoard(sessionId, boardId),
      onPersistScene: (scene) => {
        void this.boardService.saveBoard(sessionId, boardId, scene);
      },
      onSyncOut: this.syncOutHandler
    });
  }

  private destroyBoard(): void {
    this.boardHost?.destroy();
    this.boardHost = null;
  }
}
