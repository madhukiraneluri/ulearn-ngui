import {
  Component, ChangeDetectionStrategy, signal, inject, HostListener
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly mobileMenuOpen    = signal(false);
  readonly activeDrawerMenu  = signal<string | null>(null);
  readonly userMenuOpen      = signal(false);

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
    if (!this.mobileMenuOpen()) {
      this.activeDrawerMenu.set(null);
    }
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
    this.activeDrawerMenu.set(null);
  }

  toggleDrawerMenu(menu: string): void {
    this.activeDrawerMenu.update(v => v === menu ? null : menu);
  }

  isDrawerMenuOpen(menu: string): boolean {
    return this.activeDrawerMenu() === menu;
  }

  navigateWithQuery(path: string, queryParams: Record<string, string>): void {
    this.router.navigate([path], {
      queryParams: Object.keys(queryParams).length ? queryParams : {}
    });
    this.closeMobileMenu();
  }

  navigate(path: string): void {
    const [url, query] = path.split('?');
    const queryParams: Record<string, string> = {};
    if (query) {
      query.split('&').forEach(pair => {
        const [key, val] = pair.split('=');
        queryParams[key] = val;
      });
    }
    this.router.navigate(
      [url],
      Object.keys(queryParams).length ? { queryParams } : {}
    );
    this.closeMobileMenu();
  }

  toggleUserMenu(event: Event): void {
    event.stopPropagation();
    this.userMenuOpen.update(v => !v);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  private isLoggingOut = false;

  async logout(event?: Event): Promise<void> {
    event?.stopPropagation();
    event?.preventDefault();
    if (this.isLoggingOut) return;
    this.isLoggingOut = true;

    try {
      this.closeMobileMenu();
      this.closeUserMenu();
      await this.auth.signOut();
    } finally {
      this.isLoggingOut = false;
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.userMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMobileMenu();
    this.closeUserMenu();
  }
}