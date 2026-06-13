import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-block-image',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass],
  template: `
    <figure class="block-image" [ngClass]="alignment()">
      <img [src]="imageUrl()" [alt]="caption() || 'Lesson image'" loading="lazy" />
      @if (caption()) {
        <figcaption class="caption">{{ caption() }}</figcaption>
      }
    </figure>
  `
})
export class BlockImage {
  content = input.required<Record<string, unknown>>();
  imageUrl = () => String(this.content()['imageUrl'] ?? '');
  caption = () => String(this.content()['caption'] ?? '');
  alignment = () => String(this.content()['alignment'] ?? 'center');
}
