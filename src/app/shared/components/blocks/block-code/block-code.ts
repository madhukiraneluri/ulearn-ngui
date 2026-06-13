import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-block-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="block-code">
      @if (language()) {
        <div class="lang-label">{{ language() }}</div>
      }
      <pre><code>{{ code() }}</code></pre>
    </div>
  `
})
export class BlockCode {
  content = input.required<Record<string, unknown>>();
  language = () => String(this.content()['language'] ?? '');
  code = () => String(this.content()['code'] ?? '');
}
