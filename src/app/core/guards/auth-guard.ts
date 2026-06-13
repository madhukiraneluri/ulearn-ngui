import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isAuthenticated = await auth.ensureSessionChecked();

  if (isAuthenticated) {
    return true;
  }

  const loginPath = state.url.startsWith('/admin') ? '/auth/admin' : '/auth/login';

  return router.createUrlTree([loginPath], {
    queryParams: { returnUrl: state.url }
  });
};
