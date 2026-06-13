import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      switch (err.status) {
        case 0:
          toast.error('Network error. Please check your connection.');
          break;
        case 403:
          toast.error('You do not have permission to perform this action.');
          break;
        case 404:
          toast.error('Resource not found.');
          break;
        case 409:
          toast.error(err.error?.message ?? 'Conflict. This record already exists.');
          break;
        case 500:
        case 502:
        case 503:
          toast.error('Server error. Please try again shortly.');
          break;
        default:
          if (err.status !== 401 && err.status !== 400) {
            toast.error(err.error?.message ?? 'Something went wrong.');
          }
      }
      return throwError(() => err);
    })
  );
};