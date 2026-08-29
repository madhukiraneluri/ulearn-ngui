import { Component, inject, OnInit, computed } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd, NavigationError } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { Navbar } from './shared/components/navbar/navbar';
import { Footer } from './shared/components/footer/footer';
import { ContactFab } from './shared/components/contact-fab/contact-fab';
import { LegalModal } from './shared/components/legal-modal/legal-modal';
import { ConfirmDialog } from './shared/components/confirm-dialog/confirm-dialog';
import { ToastComponent } from './shared/components/toast/toast';
import { PaymentService } from './shared/services/payment.service';
import { SessionTimeoutService } from './core/services/session-timeout.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navbar, Footer, ContactFab, LegalModal, ToastComponent, ConfirmDialog],
  template: `
    @if (!isAdminShell()) {
      <app-navbar />
    }
    <main [class.admin-main-shell]="isAdminShell()">
      <router-outlet />
    </main>
    @if (!isAdminShell()) {
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
    main.admin-main-shell {
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
  private readonly _sessionTimeout = inject(SessionTimeoutService);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0]),
      startWith(this.router.url.split('?')[0])
    ),
    { initialValue: '/' }
  );

  readonly isAdminShell = computed(() => {
    const url = this.currentUrl();
    return url.startsWith('/admin') || url.startsWith('/auth/admin');
  });

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
}
