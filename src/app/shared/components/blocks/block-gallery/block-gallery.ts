import { ChangeDetectionStrategy, Component, input } from '@angular/core';

interface GalleryImage {
  imageUrl: string;
  caption?: string;
}

@Component({
  selector: 'app-block-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="block-gallery" [class]="colsClass()">
      @for (img of images(); track img.imageUrl) {
        <figure>
          <img [src]="img.imageUrl" [alt]="img.caption || ''" loading="lazy" />
          @if (img.caption) {
            <figcaption>{{ img.caption }}</figcaption>
          }
        </figure>
      }
    </div>
  `
})
export class BlockGallery {
  content = input.required<Record<string, unknown>>();
  images = () => (this.content()['images'] as GalleryImage[]) ?? [];
  colsClass = () => `cols-${this.content()['columns'] ?? 2}`;
}
