import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../../models';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isAuthenticated = await auth.ensureSessionChecked();
  if (!isAuthenticated) {
    return router.createUrlTree(['/auth/login']);
  }

  const requiredRole = route.data?.['role'] as UserRole | undefined;

  if (requiredRole === 'ADMIN' && !auth.isAdmin()) {
    return router.createUrlTree(['/']);
  }

  return true;
};
