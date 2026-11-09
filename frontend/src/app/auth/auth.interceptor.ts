import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_URL } from '../api-url';
import { AuthService } from './auth.service';

/** Sends the token to our API only, and treats a 401 from it as an ended session. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // The config.json request is relative and runs before the API address is known.
  if (!req.url.startsWith('http')) return next(req);
  const apiUrl = inject(API_URL);
  if (!req.url.startsWith(`${apiUrl}/`)) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const authorized = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authorized).pipe(
    catchError((error: unknown) => {
      // A 401 on login means a wrong password, not an expired session.
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        req.url !== `${apiUrl}/auth/login`
      ) {
        auth.logout();
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
