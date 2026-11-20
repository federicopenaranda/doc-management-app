import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanMatchFn, Route, Router, UrlSegment, UrlTree } from '@angular/router';
import { authGuard, uploadGuard } from './auth.guard';
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

describe('uploadGuard', () => {
  function runUpload(initial: { canUpload: boolean } | null, loaded?: { canUpload: boolean }) {
    const currentUser = signal(initial);
    const loadCurrentUser = vi.fn(() => {
      if (loaded) currentUser.set(loaded);
      return Promise.resolve();
    });
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser, loadCurrentUser } }],
    });
    const result = TestBed.runInInjectionContext(() =>
      uploadGuard({} as Route, [] as UrlSegment[], {} as Parameters<CanMatchFn>[2]),
    );
    return { result: Promise.resolve(result), loadCurrentUser };
  }

  it('lets a user who can upload through, without asking the API again', async () => {
    const { result, loadCurrentUser } = runUpload({ canUpload: true });

    expect(await result).toBe(true);
    expect(loadCurrentUser).not.toHaveBeenCalled();
  });

  it('sends a user who cannot upload to the home page', async () => {
    const { result } = runUpload({ canUpload: false });

    const url = (await result) as UrlTree;
    expect(url).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(url)).toBe('/');
  });

  it('loads the user first when the page was opened directly and nobody is loaded yet', async () => {
    const { result, loadCurrentUser } = runUpload(null, { canUpload: true });

    expect(await result).toBe(true);
    expect(loadCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('sends the user home when the profile cannot be loaded', async () => {
    const { result } = runUpload(null);

    expect(await result).toBeInstanceOf(UrlTree);
  });
});
