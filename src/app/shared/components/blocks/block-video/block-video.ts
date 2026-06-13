import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-block-video',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="video-container block-video">
      <video controls [src]="videoUrl()" preload="metadata">
        Your browser does not support video playback.
      </video>
    </div>
  `
})
export class BlockVideo {
  content = input.required<Record<string, unknown>>();
  videoUrl = () => String(this.content()['videoUrl'] ?? this.content()['url'] ?? '');
}
