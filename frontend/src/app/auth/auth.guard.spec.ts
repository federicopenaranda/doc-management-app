import { TestBed } from '@angular/core/testing';
import { CanMatchFn, Route, Router, UrlSegment, UrlTree } from '@angular/router';
import { AppConfigService } from '../app-config.service';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

function run(authEnabled: boolean, authenticated: boolean) {
  TestBed.configureTestingModule({
    providers: [
      { provide: AppConfigService, useValue: { authEnabled } },
      { provide: AuthService, useValue: { isAuthenticated: () => authenticated } },
    ],
  });
  return TestBed.runInInjectionContext(() =>
    authGuard({} as Route, [] as UrlSegment[], {} as Parameters<CanMatchFn>[2]),
  );
}

describe('authGuard', () => {
  it('lets everything through while the auth flag is off', () => {
    expect(run(false, false)).toBe(true);
  });

  it('lets a logged-in user through', () => {
    expect(run(true, true)).toBe(true);
  });

  it('sends a logged-out user to /login', () => {
    const result = run(true, false);

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });
});
