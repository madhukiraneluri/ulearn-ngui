import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from '../services/auth';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const auth = inject(AuthService);

  if (isAuthEndpoint(req.url)) {
    return next(req);
  }

  const token  = auth.getAccessToken();
  const authReq = token ? addToken(req, token) : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !isAuthEndpoint(req.url)) {
        return handle401(req, next, auth);
      }
      return throwError(() => err);
    })
  );
};

function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService
) {
  if (!auth.isCurrentlyRefreshing) {
    auth.setRefreshing(true);
    auth.getRefreshSubject().next(null);

    return auth.refreshAccessToken().pipe(
      switchMap(tokens => {
        auth.setRefreshing(false);
        auth.getRefreshSubject().next(tokens.accessToken);
        return next(addToken(req, tokens.accessToken));
      }),
      catchError(err => {
        auth.setRefreshing(false);
        return throwError(() => err);
      })
    );
  }

  return auth.getRefreshSubject().pipe(
    filter(token => token !== null),
    take(1),
    switchMap(token => next(addToken(req, token!)))
  );
}

function addToken(
  req: HttpRequest<unknown>,
  token: string
): HttpRequest<unknown> {
  return req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  });
}

function isAuthEndpoint(url: string): boolean {
  return url.includes('/auth/login') ||
         url.includes('/auth/register') ||
         url.includes('/auth/refresh');
}