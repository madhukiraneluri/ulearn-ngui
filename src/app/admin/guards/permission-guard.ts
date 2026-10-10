import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

export const permissionGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureSessionChecked();

  const anyPermission = route.data?.['anyPermission'] as string[] | undefined;
  if (anyPermission?.length) {
    if (anyPermission.some((key) => auth.hasPermission(key))) return true;
    return router.createUrlTree(['/admin/no-access']);
  }

  const permission = route.data?.['permission'] as string | undefined;
  if (!permission || auth.hasPermission(permission)) return true;
  return router.createUrlTree(['/admin/no-access']);
};
