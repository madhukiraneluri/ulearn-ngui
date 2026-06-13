import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-block-text',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="block-text" [innerHTML]="safeHtml()"></div>`
})
export class BlockText {
  private readonly sanitizer = inject(DomSanitizer);
  content = input.required<Record<string, unknown>>();
  safeHtml = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(String(this.content()['html'] ?? ''))
  );
}
