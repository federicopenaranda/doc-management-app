import { TestBed } from '@angular/core/testing';
import { CanMatchFn, Route, Router, UrlSegment, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

function run(authenticated: boolean) {
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: { isAuthenticated: () => authenticated } }],
  });
  return TestBed.runInInjectionContext(() =>
    authGuard({} as Route, [] as UrlSegment[], {} as Parameters<CanMatchFn>[2]),
  );
}

describe('authGuard', () => {
  it('lets a logged-in user through', () => {
    expect(run(true)).toBe(true);
  });

  it('sends a logged-out user to /login', () => {
    const result = run(false);

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });
});
