import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-block-heading',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="block-heading">
      @switch (level()) {
        @case ('h1') { <h1>{{ text() }}</h1> }
        @case ('h3') { <h3>{{ text() }}</h3> }
        @default { <h2>{{ text() }}</h2> }
      }
    </div>
  `
})
export class BlockHeading {
  content = input.required<Record<string, unknown>>();
  text = computed(() => String(this.content()['text'] ?? ''));
  level = computed(() => String(this.content()['level'] ?? 'h2'));
}
