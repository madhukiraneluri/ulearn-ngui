import { Component, inject, OnInit, computed } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { Navbar } from './shared/components/navbar/navbar';
import { Footer } from './shared/components/footer/footer';
import { ContactFab } from './shared/components/contact-fab/contact-fab';
import { ToastComponent } from './shared/components/toast/toast';
import { PaymentService } from './shared/services/payment.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navbar, Footer, ContactFab, ToastComponent],
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
    <app-toast />
  `,
  styles: [`
    main {
      min-height: calc(100vh - 68px - 280px);
    }
    main.admin-main-shell {
      min-height: 100vh;
    }
  `]
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly paymentService = inject(PaymentService);

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
      if (evt instanceof NavigationEnd) {
        this.paymentService.unlockPageScroll();
        setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }), 0);
      }
    });
  }
}
