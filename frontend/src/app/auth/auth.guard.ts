import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AppConfigService } from '../app-config.service';
import { AuthService } from './auth.service';

/** Feature flag (config.json "authEnabled"): while it is off, nothing asks for a login. */
export const authGuard: CanMatchFn = () =>
  !inject(AppConfigService).authEnabled ||
  inject(AuthService).isAuthenticated() ||
  inject(Router).createUrlTree(['/login']);
