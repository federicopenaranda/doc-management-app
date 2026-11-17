import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Sends anyone without a login to /login. */
export const authGuard: CanMatchFn = () =>
  inject(AuthService).isAuthenticated() || inject(Router).createUrlTree(['/login']);
