import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

interface ColumnContent {
  type?: string;
  html?: string;
  imageUrl?: string;
}

@Component({
  selector: 'app-block-two-column',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="block-two-column">
      <div class="col" [innerHTML]="leftHtml()"></div>
      <div class="col" [innerHTML]="rightHtml()"></div>
    </div>
  `
})
export class BlockTwoColumn {
  private readonly sanitizer = inject(DomSanitizer);
  content = input.required<Record<string, unknown>>();

  leftHtml = computed(() => this.safeColumn(this.content()['left'] as ColumnContent));
  rightHtml = computed(() => this.safeColumn(this.content()['right'] as ColumnContent));

  private safeColumn(col: ColumnContent | undefined) {
    if (!col) return this.sanitizer.bypassSecurityTrustHtml('');
    if (col.type === 'image' && col.imageUrl) {
      return this.sanitizer.bypassSecurityTrustHtml(
        `<img src="${col.imageUrl}" alt="" style="border-radius:12px;max-width:100%" />`
      );
    }
    return this.sanitizer.bypassSecurityTrustHtml(col.html ?? '');
  }
}
