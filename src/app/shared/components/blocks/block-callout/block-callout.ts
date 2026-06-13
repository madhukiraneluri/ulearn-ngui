import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-block-callout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="block-callout" [class]="color()">
      <span class="icon">{{ icon() }}</span>
      <p>{{ text() }}</p>
    </div>
  `
})
export class BlockCallout {
  content = input.required<Record<string, unknown>>();
  icon = () => String(this.content()['icon'] ?? '💡');
  text = () => String(this.content()['text'] ?? '');
  color = () => String(this.content()['color'] ?? 'yellow');
}
