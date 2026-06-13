import { Routes } from '@angular/router';

export const authRoutes: Routes = [
  {
    path: 'admin',
    loadComponent: () =>
      import('./admin-login/admin-login').then(m => m.AdminLogin)
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login').then(m => m.Login)
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./register/register').then(m => m.Register)
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./signup/signup').then(m => m.SignupComponent)
  },
  {
    path: 'complete-profile',
    loadComponent: () =>
      import('./complete-profile/complete-profile').then(m => m.CompleteProfileComponent)
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  }
];