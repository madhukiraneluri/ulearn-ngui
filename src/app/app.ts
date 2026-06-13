import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { Navbar } from './shared/components/navbar/navbar';
import { Footer } from './shared/components/footer/footer';
import { ToastComponent } from './shared/components/toast/toast';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navbar, Footer, ToastComponent],
  template: `
    <app-navbar />
    <main>
      <router-outlet />
    </main>
    <app-footer />
    <app-toast />
  `,
  styles: [`
    main {
      min-height: calc(100vh - 68px - 280px);
    }
  `]
})
export class App implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.router.events.subscribe(evt => {
      if (evt instanceof NavigationEnd) {
        // small delay to allow the new view to render
        setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' }), 10);
      }
    });
  }
}