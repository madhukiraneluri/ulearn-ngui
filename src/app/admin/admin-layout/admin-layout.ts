import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal
} from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ADMIN_NAV_ITEMS } from '../labels/staff-permissions';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss'
})
export class AdminLayout {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly sidebarOpen = signal(false);

  readonly navItems = computed(() =>
    ADMIN_NAV_ITEMS.filter((item) => this.auth.hasPermission(item.permission))
  );

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  async logout(): Promise<void> {
    await this.auth.signOut('/auth/admin');
    await this.router.navigate(['/auth/admin']);
  }
}
