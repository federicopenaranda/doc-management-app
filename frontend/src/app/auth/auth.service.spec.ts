import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../api-url';
import { AuthService } from './auth.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: 'http://localhost:3000' },
    ],
  });
  return { auth: TestBed.inject(AuthService), http: TestBed.inject(HttpTestingController) };
}

describe('AuthService', () => {
  beforeEach(() => sessionStorage.clear());

  it('is not authenticated before logging in', () => {
    const { auth } = setup();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
  });

  it('POSTs the credentials to /auth/login and keeps the access token', async () => {
    const { auth, http } = setup();

    const result = auth.login('me@example.com', 'a-long-password');

    const req = http.expectOne('http://localhost:3000/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'me@example.com', password: 'a-long-password' });
    req.flush({ accessToken: 'jwt-1', expiresIn: 3600 });
    await expect(result).resolves.toBe(true);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.token()).toBe('jwt-1');
  });

  it('keeps the token in sessionStorage so a refresh does not log out', async () => {
    const { auth, http } = setup();

    const result = auth.login('me@example.com', 'a-long-password');
    http.expectOne('http://localhost:3000/auth/login').flush({ accessToken: 'jwt-1' });
    await result;

    expect(sessionStorage.getItem('dms.accessToken')).toBe('jwt-1');
  });

  it('restores the token from sessionStorage on start', () => {
    sessionStorage.setItem('dms.accessToken', 'jwt-old');

    const { auth } = setup();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.token()).toBe('jwt-old');
  });

  it('resolves false and stays logged out on a 401', async () => {
    const { auth, http } = setup();

    const result = auth.login('me@example.com', 'wrong');
    http
      .expectOne('http://localhost:3000/auth/login')
      .flush({ statusCode: 401 }, { status: 401, statusText: 'Unauthorized' });

    await expect(result).resolves.toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('dms.accessToken')).toBeNull();
  });

  it('rejects on any other failure, so the page can say "try again later"', async () => {
    const { auth, http } = setup();

    const result = auth.login('me@example.com', 'a-long-password');
    http
      .expectOne('http://localhost:3000/auth/login')
      .flush('boom', { status: 500, statusText: 'Server Error' });

    await expect(result).rejects.toBeDefined();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('rejects a response without an access token', async () => {
    const { auth, http } = setup();

    const result = auth.login('me@example.com', 'a-long-password');
    http.expectOne('http://localhost:3000/auth/login').flush({});

    await expect(result).rejects.toThrow();
    expect(auth.isAuthenticated()).toBe(false);
  });
});
