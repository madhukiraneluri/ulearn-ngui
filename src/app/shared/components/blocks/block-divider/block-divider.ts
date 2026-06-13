import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-block-divider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hr class="block-divider" />`
})
export class BlockDivider {}
