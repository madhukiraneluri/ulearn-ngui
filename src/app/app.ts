import { Component, inject, OnInit, computed } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd, NavigationError } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { merge, of } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { Navbar } from './shared/components/navbar/navbar';
import { Footer } from './shared/components/footer/footer';
import { ContactFab } from './shared/components/contact-fab/contact-fab';
import { LegalModal } from './shared/components/legal-modal/legal-modal';
import { ConfirmDialog } from './shared/components/confirm-dialog/confirm-dialog';
import { ToastComponent } from './shared/components/toast/toast';
import { PaymentService } from './shared/services/payment.service';
import { SessionTimeoutService } from './core/services/session-timeout.service';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navbar, Footer, ContactFab, LegalModal, ToastComponent, ConfirmDialog],
  template: `
    @if (!isAdminShell() && !isSessionJoinShell() && !isExamShell()) {
      <app-navbar />
    }
    <main [class.admin-main-shell]="isAdminShell()" [class.session-join-shell]="isSessionJoinShell()" [class.exam-main-shell]="isExamShell()">
      <router-outlet />
    </main>
    @if (!isAdminShell() && !isSessionJoinShell() && !isExamShell()) {
      <app-footer />
      <app-contact-fab />
    }
    <app-legal-modal />
    <app-toast />
    <app-confirm-dialog />
  `,
  styles: [`
    main {
      min-height: calc(100vh - 68px - 280px);
    }
    main.admin-main-shell,
    main.session-join-shell,
    main.exam-main-shell {
      min-height: 100vh;
    }
    @media (max-width: 480px) {
      main {
        min-height: calc(100vh - 60px - 420px);
      }
    }
  `]
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly paymentService = inject(PaymentService);
  private readonly auth = inject(AuthService);
  private readonly _sessionTimeout = inject(SessionTimeoutService);

  private readonly currentUrl = toSignal(
    merge(
      of(this.resolvePathname(this.router.url)),
      this.router.events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        map((e) => e.urlAfterRedirects.split('?')[0])
      )
    ),
    { initialValue: this.resolvePathname(this.router.url) }
  );

  readonly isAdminShell = computed(() => {
    const url = this.currentUrl();
    return url.startsWith('/admin') || url.startsWith('/auth/admin');
  });

  readonly isSessionJoinShell = computed(() => this.currentUrl().startsWith('/s/join'));

  readonly isExamShell = computed(() => this.currentUrl().startsWith('/exam'));

  ngOnInit(): void {
    this.paymentService.unlockPageScroll();
    this.router.events.subscribe(evt => {
      if (evt instanceof NavigationError) {
        const message = String(evt.error?.message ?? evt.error ?? '');
        if (this.isStaleChunkError(message)) {
          this.reloadForStaleBundle(evt.url);
        }
        return;
      }

      if (evt instanceof NavigationEnd) {
        sessionStorage.removeItem('ulearn-chunk-reload');
        this.paymentService.unlockPageScroll();
        setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }), 0);
        void this.redirectExamOnlyUsers(evt.urlAfterRedirects);
      }
    });
  }

  private isStaleChunkError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('failed to fetch dynamically imported module') ||
      lower.includes('loading chunk') ||
      lower.includes('chunkloaderror')
    );
  }

  private reloadForStaleBundle(targetUrl: string): void {
    const key = 'ulearn-chunk-reload';
    if (sessionStorage.getItem(key)) return;

    sessionStorage.setItem(key, '1');
    window.location.assign(targetUrl || window.location.href);
  }

  private async redirectExamOnlyUsers(url: string): Promise<void> {
    const path = url.split('?')[0];
    if (path.startsWith('/exam') || path.startsWith('/auth')) return;

    await this.auth.ensureSessionChecked();
    if (this.auth.isLoggedIn() && this.auth.isExamOnly()) {
      const target = this.auth.mustResetPassword() ? '/exam/set-password' : '/exam/dashboard';
      await this.router.navigateByUrl(target, { replaceUrl: true });
    }
  }

  private resolvePathname(url: string): string {
    const fromRouter = url.split('?')[0];
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/exam')) {
      return window.location.pathname;
    }
    return fromRouter || '/';
  }
}
