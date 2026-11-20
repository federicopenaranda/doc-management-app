import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Sends anyone without a login to /login. */
export const authGuard: CanMatchFn = () =>
  inject(AuthService).isAuthenticated() || inject(Router).createUrlTree(['/login']);

/**
 * Keeps the upload page for users who may upload (the API says so with canUpload; it refuses everyone else anyway).
 * Opened directly, nobody is loaded yet, so the profile is asked for first.
 */
export const uploadGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.currentUser()) await auth.loadCurrentUser();
  return auth.currentUser()?.canUpload === true || router.createUrlTree(['/']);
};
