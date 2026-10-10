import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-no-access',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="no-access">
      <h1>No access to this screen</h1>
      <p>Your label does not include this page. Choose another item from the sidebar.</p>
    </section>
  `,
  styles: `
    .no-access {
      padding: 48px 24px;
      max-width: 520px;
    }
    h1 { margin: 0 0 8px; color: var(--navy); }
    p { margin: 0; color: var(--muted); }
  `
})
export class NoAccess {}
