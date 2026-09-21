import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/** Requires authenticated user for exam portal routes. */
export const examAuthGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isAuthenticated = await auth.ensureSessionChecked();
  if (!isAuthenticated) {
    return router.createUrlTree(['/exam/login'], {
      queryParams: { returnUrl: state.url }
    });
  }

  if (auth.mustResetPassword()) {
    const path = state.url.split('?')[0];
    if (path !== '/exam/set-password') {
      return router.createUrlTree(['/exam/set-password']);
    }
  }

  if (!auth.isExamOnly() && !auth.isAdmin()) {
    return router.createUrlTree(['/exam/login'], {
      queryParams: { returnUrl: state.url }
    });
  }

  return true;
};

/** Redirects exam-only users away from main LMS routes. */
export const blockExamOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureSessionChecked();
  if (auth.isLoggedIn() && auth.isExamOnly()) {
    const target = auth.mustResetPassword() ? '/exam/set-password' : '/exam/dashboard';
    return router.createUrlTree([target]);
  }

  return true;
};

/** Keeps non-exam users out of the exam portal (except login). */
export const examPortalGuestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isAuthenticated = await auth.ensureSessionChecked();
  if (!isAuthenticated) return true;

  if (auth.isAdmin()) {
    return router.createUrlTree(['/admin/dashboard']);
  }

  if (auth.isExamOnly() || auth.mustResetPassword()) {
    return router.createUrlTree(
      auth.mustResetPassword() ? ['/exam/set-password'] : ['/exam/dashboard']
    );
  }

  return router.createUrlTree(['/']);
};
