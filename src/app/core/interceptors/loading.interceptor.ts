import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingService);

  if (req.headers.has('X-Skip-Loading')) {
    return next(req);
  }

  loading.increment();
  return next(req).pipe(finalize(() => loading.decrement()));
};