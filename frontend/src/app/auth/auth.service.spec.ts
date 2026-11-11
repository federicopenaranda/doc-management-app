import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../api-url';
import { LocaleService } from '../i18n/locale.service';
import { AuthService } from './auth.service';

function setup() {
  const locale = { redirectIfNeeded: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: 'http://localhost:3000' },
      { provide: LocaleService, useValue: locale },
    ],
  });
  return {
    auth: TestBed.inject(AuthService),
    http: TestBed.inject(HttpTestingController),
    locale,
  };
}

describe('AuthService with refresh tokens', () => {
  const API = 'http://localhost:3000';
  beforeEach(() => sessionStorage.clear());

  async function loggedIn() {
    const ctx = setup();
    const result = ctx.auth.login('me@example.com', 'a-long-password');
    ctx.http
      .expectOne(`${API}/auth/login`)
      .flush({ accessToken: 'access-1', expiresIn: 3600, refreshToken: 'refresh-1' });
    await result;
    return ctx;
  }

  it('keeps the refresh token from login in sessionStorage', async () => {
    await loggedIn();

    expect(sessionStorage.getItem('dms.refreshToken')).toBe('refresh-1');
  });

  it('refresh() swaps the refresh token for a new pair and keeps both', async () => {
    const { auth, http } = await loggedIn();

    const result = auth.refresh();

    const req = http.expectOne(`${API}/auth/refresh`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush({ accessToken: 'access-2', expiresIn: 3600, refreshToken: 'refresh-2' });
    await expect(result).resolves.toBe(true);
    expect(auth.token()).toBe('access-2');
    expect(sessionStorage.getItem('dms.accessToken')).toBe('access-2');
    expect(sessionStorage.getItem('dms.refreshToken')).toBe('refresh-2');
  });

  it('refresh() makes one request when called several times at once (the token works only once)', async () => {
    const { auth, http } = await loggedIn();

    const results = [auth.refresh(), auth.refresh(), auth.refresh()];

    http
      .expectOne(`${API}/auth/refresh`)
      .flush({ accessToken: 'access-2', expiresIn: 3600, refreshToken: 'refresh-2' });
    await expect(Promise.all(results)).resolves.toEqual([true, true, true]);
  });

  it('refresh() can run again later with the newest token', async () => {
    const { auth, http } = await loggedIn();
    const first = auth.refresh();
    http
      .expectOne(`${API}/auth/refresh`)
      .flush({ accessToken: 'access-2', expiresIn: 3600, refreshToken: 'refresh-2' });
    await first;

    const second = auth.refresh();

    const req = http.expectOne(`${API}/auth/refresh`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh-2' });
    req.flush({ accessToken: 'access-3', expiresIn: 3600, refreshToken: 'refresh-3' });
    await expect(second).resolves.toBe(true);
  });

  it('canRefresh() is true with a refresh token', async () => {
    const { auth } = await loggedIn();

    expect(auth.canRefresh()).toBe(true);
  });

  it('canRefresh() is false without a refresh token', () => {
    expect(setup().auth.canRefresh()).toBe(false);
  });

  it('refresh() resolves false without a request when there is no refresh token', async () => {
    const { auth, http } = setup();

    await expect(auth.refresh()).resolves.toBe(false);

    http.expectNone(`${API}/auth/refresh`);
  });

  it('refresh() forgets the session and resolves false when the server refuses', async () => {
    const { auth, http } = await loggedIn();

    const result = auth.refresh();
    http.expectOne(`${API}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(result).resolves.toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('dms.refreshToken')).toBeNull();
  });

  it('refresh() rejects a response without both tokens, and forgets the session', async () => {
    const { auth, http } = await loggedIn();

    const result = auth.refresh();
    http.expectOne(`${API}/auth/refresh`).flush({ accessToken: 'access-2' });

    await expect(result).resolves.toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('logout() tells the server to revoke the refresh token and forgets it', async () => {
    const { auth, http } = await loggedIn();

    auth.logout();

    const req = http.expectOne(`${API}/auth/logout`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('dms.refreshToken')).toBeNull();
  });

  it('logout() still logs out when the server cannot be reached', async () => {
    const { auth, http } = await loggedIn();

    auth.logout();
    http.expectOne(`${API}/auth/logout`).error(new ProgressEvent('error'));

    expect(auth.isAuthenticated()).toBe(false);
  });

  it('logout() sends nothing when there is no refresh token', async () => {
    const { auth, http } = setup();
    const result = auth.login('me@example.com', 'a-long-password');
    http.expectOne(`${API}/auth/login`).flush({ accessToken: 'access-1', expiresIn: 3600 });
    await result;

    auth.logout();

    http.expectNone(`${API}/auth/logout`);
    expect(auth.isAuthenticated()).toBe(false);
  });
});

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

  it('logout forgets the token, in memory and in sessionStorage', () => {
    sessionStorage.setItem('dms.accessToken', 'jwt-old');
    const { auth } = setup();

    auth.logout();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
    expect(sessionStorage.getItem('dms.accessToken')).toBeNull();
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

describe('AuthService current user', () => {
  const API = 'http://localhost:3000';
  const me = {
    id: 'u1',
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'García',
    language: 'es',
  };
  beforeEach(() => sessionStorage.clear());

  it('has no current user until it is loaded', () => {
    sessionStorage.setItem('dms.accessToken', 'access-1');

    expect(setup().auth.currentUser()).toBeNull();
  });

  it('loadCurrentUser() GETs /auth/me and keeps who the user is', async () => {
    sessionStorage.setItem('dms.accessToken', 'access-1');
    const { auth, http } = setup();

    const loading = auth.loadCurrentUser();

    const req = http.expectOne(`${API}/auth/me`);
    expect(req.request.method).toBe('GET');
    req.flush(me);
    await loading;
    expect(auth.currentUser()).toEqual(me);
  });

  it('loadCurrentUser() asks nothing while logged out', async () => {
    const { auth, http } = setup();

    await auth.loadCurrentUser();

    http.expectNone(`${API}/auth/me`);
    expect(auth.currentUser()).toBeNull();
  });

  it('loadCurrentUser() leaves the current user empty when the server fails, without throwing', async () => {
    sessionStorage.setItem('dms.accessToken', 'access-1');
    const { auth, http } = setup();

    const loading = auth.loadCurrentUser();
    http.expectOne(`${API}/auth/me`).flush('boom', { status: 500, statusText: 'Server Error' });

    await expect(loading).resolves.toBeUndefined();
    expect(auth.currentUser()).toBeNull();
  });

  it('logout() forgets the current user', async () => {
    sessionStorage.setItem('dms.accessToken', 'access-1');
    const { auth, http } = setup();
    const loading = auth.loadCurrentUser();
    http.expectOne(`${API}/auth/me`).flush(me);
    await loading;

    auth.logout();

    expect(auth.currentUser()).toBeNull();
  });

  it('loadCurrentUser() keeps the language in sessionStorage', async () => {
    sessionStorage.setItem('dms.accessToken', 'access-1');
    const { auth, http } = setup();

    const loading = auth.loadCurrentUser();
    http.expectOne(`${API}/auth/me`).flush(me);
    await loading;

    expect(sessionStorage.getItem('dms.language')).toBe('es');
  });

  it("loadCurrentUser() asks the locale service to open the user's language", async () => {
    sessionStorage.setItem('dms.accessToken', 'access-1');
    const { auth, http, locale } = setup();

    const loading = auth.loadCurrentUser();
    http.expectOne(`${API}/auth/me`).flush({ ...me, language: 'en' });
    await loading;

    expect(locale.redirectIfNeeded).toHaveBeenCalledExactlyOnceWith('en');
  });

  it('loadCurrentUser() does not redirect when the request fails', async () => {
    sessionStorage.setItem('dms.accessToken', 'access-1');
    const { auth, http, locale } = setup();

    const loading = auth.loadCurrentUser();
    http.expectOne(`${API}/auth/me`).flush('boom', { status: 500, statusText: 'Server Error' });
    await loading;

    expect(locale.redirectIfNeeded).not.toHaveBeenCalled();
  });

  it('setLanguage() PUTs it, then keeps it in sessionStorage and on the current user', async () => {
    sessionStorage.setItem('dms.accessToken', 'access-1');
    const { auth, http } = setup();
    const loading = auth.loadCurrentUser();
    http.expectOne(`${API}/auth/me`).flush(me);
    await loading;

    const saving = auth.setLanguage('en');

    const req = http.expectOne(`${API}/auth/me/language`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ language: 'en' });
    req.flush({ ...me, language: 'en' });
    await saving;
    expect(sessionStorage.getItem('dms.language')).toBe('en');
    expect(auth.currentUser()?.language).toBe('en');
  });

  it('setLanguage() changes nothing here when the server refuses', async () => {
    sessionStorage.setItem('dms.accessToken', 'access-1');
    sessionStorage.setItem('dms.language', 'es');
    const { auth, http } = setup();

    const saving = auth.setLanguage('en');
    http
      .expectOne(`${API}/auth/me/language`)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    await expect(saving).rejects.toBeTruthy();
    expect(sessionStorage.getItem('dms.language')).toBe('es');
  });
});
