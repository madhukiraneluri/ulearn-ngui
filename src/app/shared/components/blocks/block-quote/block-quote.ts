import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-block-quote',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <blockquote class="block-quote">
      <p>"{{ text() }}"</p>
      @if (author()) {
        <cite class="author">— {{ author() }}</cite>
      }
    </blockquote>
  `
})
export class BlockQuote {
  content = input.required<Record<string, unknown>>();
  text = () => String(this.content()['text'] ?? '');
  author = () => String(this.content()['author'] ?? '');
}
