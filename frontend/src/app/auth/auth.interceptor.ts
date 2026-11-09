import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { API_URL } from '../api-url';
import { AuthService } from './auth.service';

// A 401 from these means "wrong password" or "token already used", not "session expired".
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

const isUnauthorized = (error: unknown): error is HttpErrorResponse =>
  error instanceof HttpErrorResponse && error.status === 401;

/**
 * Sends the token to our API only. A 401 from it means the access token expired: refresh once and repeat the request;
 * if that is not possible (or the repeat fails again), the session has ended.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // The config.json request is relative and runs before the API address is known.
  if (!req.url.startsWith('http')) return next(req);
  const apiUrl = inject(API_URL);
  if (!req.url.startsWith(`${apiUrl}/`)) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);
  const send = () => {
    const token = auth.token();
    return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
  };
  const endSession = () => {
    auth.logout();
    void router.navigateByUrl('/login');
  };

  return send().pipe(
    catchError((error: unknown) => {
      if (!isUnauthorized(error) || AUTH_PATHS.some((path) => req.url === `${apiUrl}${path}`)) {
        return throwError(() => error);
      }
      if (!auth.canRefresh()) {
        endSession();
        return throwError(() => error);
      }
      return from(auth.refresh()).pipe(
        switchMap((refreshed) => {
          if (!refreshed) {
            endSession();
            return throwError(() => error);
          }
          return send().pipe(
            catchError((retryError: unknown) => {
              if (isUnauthorized(retryError)) endSession();
              return throwError(() => retryError);
            }),
          );
        }),
      );
    }),
  );
};
