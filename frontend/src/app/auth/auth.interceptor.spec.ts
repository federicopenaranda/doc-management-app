import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { API_URL } from '../api-url';
import { AppConfigService } from '../app-config.service';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const API = 'http://localhost:3000';

function setup(token: string | null = 'jwt-1', refreshToken: string | null = null) {
  sessionStorage.clear();
  if (token) sessionStorage.setItem('dms.accessToken', token);
  if (refreshToken) sessionStorage.setItem('dms.refreshToken', refreshToken);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_URL, useValue: API },
      { provide: AppConfigService, useValue: { refreshEnabled: true } },
    ],
  });
  return {
    client: TestBed.inject(HttpClient),
    http: TestBed.inject(HttpTestingController),
    auth: TestBed.inject(AuthService),
    navigate: vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true),
  };
}

describe('authInterceptor', () => {
  it('sends the access token to the API as a Bearer header', () => {
    const { client, http } = setup('jwt-1');

    client.get(`${API}/uploads`).subscribe();

    expect(http.expectOne(`${API}/uploads`).request.headers.get('Authorization')).toBe(
      'Bearer jwt-1',
    );
  });

  it('sends no header while logged out', () => {
    const { client, http } = setup(null);

    client.get(`${API}/uploads`).subscribe();

    expect(http.expectOne(`${API}/uploads`).request.headers.has('Authorization')).toBe(false);
  });

  it.each([
    ['another site (never leak the token)', 'https://storage.googleapis.com/bucket/file'],
    ['a relative URL such as config.json', 'config.json'],
    ['a site that only starts with the API address', `${API}.evil.example/x`],
  ])('does not send the token to %s', (_label, url) => {
    const { client, http } = setup('jwt-1');

    client.get(url).subscribe();

    expect(http.expectOne(url).request.headers.has('Authorization')).toBe(false);
  });

  it('logs out and goes to /login when the API answers 401, and still reports the error', () => {
    const { client, http, auth, navigate } = setup('jwt-1');
    const failed = vi.fn();

    client.get(`${API}/uploads`).subscribe({ error: failed });
    http.expectOne(`${API}/uploads`).flush('', { status: 401, statusText: 'Unauthorized' });

    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('leaves the login call alone on 401 (a wrong password is not an expired session)', () => {
    const { client, http, auth, navigate } = setup('jwt-1');

    client.post(`${API}/auth/login`, {}).subscribe({ error: () => undefined });
    http.expectOne(`${API}/auth/login`).flush('', { status: 401, statusText: 'Unauthorized' });

    expect(auth.isAuthenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays logged in on other errors', () => {
    const { client, http, auth, navigate } = setup('jwt-1');

    client.get(`${API}/uploads`).subscribe({ error: () => undefined });
    http.expectOne(`${API}/uploads`).flush('', { status: 500, statusText: 'Server Error' });

    expect(auth.isAuthenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not fail when the API address is not known yet (the config.json request)', () => {
    // API_URL throws until config.json is loaded; the interceptor must not ask for it on relative URLs.
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: API_URL,
          useFactory: () => {
            throw new Error('config.json has not been loaded');
          },
        },
      ],
    });
    const client = TestBed.inject(HttpClient);
    const http = TestBed.inject(HttpTestingController);

    client.get('config.json').subscribe();

    http.expectOne('config.json').flush({});
  });
});

describe('authInterceptor with a refresh token', () => {
  const unauthorized = { status: 401, statusText: 'Unauthorized' };
  const newPair = { accessToken: 'jwt-2', expiresIn: 3600, refreshToken: 'refresh-2' };

  /** Waits for the interceptor to start the refresh, which happens after the 401 is delivered. */
  const refreshRequest = (http: HttpTestingController) =>
    vi.waitFor(() => http.expectOne(`${API}/auth/refresh`));

  it('refreshes on a 401 and repeats the request with the new token, without the caller noticing', async () => {
    const { client, http, auth, navigate } = setup('jwt-1', 'refresh-1');
    const result = vi.fn();

    client.get(`${API}/uploads`).subscribe(result);
    http.expectOne(`${API}/uploads`).flush('', unauthorized);
    const refresh = await refreshRequest(http);
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    refresh.flush(newPair);

    const retried = await vi.waitFor(() => http.expectOne(`${API}/uploads`));
    expect(retried.request.headers.get('Authorization')).toBe('Bearer jwt-2');
    retried.flush({ ok: true });
    expect(result).toHaveBeenCalledWith({ ok: true });
    expect(auth.isAuthenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('refreshes only once when several requests get a 401 together, then repeats all of them', async () => {
    const { client, http } = setup('jwt-1', 'refresh-1');
    const done = vi.fn();

    client.get(`${API}/a`).subscribe(done);
    client.get(`${API}/b`).subscribe(done);
    http.expectOne(`${API}/a`).flush('', unauthorized);
    http.expectOne(`${API}/b`).flush('', unauthorized);
    (await refreshRequest(http)).flush(newPair);

    (await vi.waitFor(() => http.expectOne(`${API}/a`))).flush(1);
    (await vi.waitFor(() => http.expectOne(`${API}/b`))).flush(2);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('logs out, goes to /login and reports the original error when the refresh is refused', async () => {
    const { client, http, auth, navigate } = setup('jwt-1', 'refresh-1');
    const failed = vi.fn();

    client.get(`${API}/uploads`).subscribe({ error: failed });
    http.expectOne(`${API}/uploads`).flush('', unauthorized);
    (await refreshRequest(http)).flush({}, unauthorized);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
    expect(auth.isAuthenticated()).toBe(false);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0][0].status).toBe(401);
  });

  it('does not refresh again when the repeated request also gets a 401', async () => {
    const { client, http, auth, navigate } = setup('jwt-1', 'refresh-1');
    const failed = vi.fn();

    client.get(`${API}/uploads`).subscribe({ error: failed });
    http.expectOne(`${API}/uploads`).flush('', unauthorized);
    (await refreshRequest(http)).flush(newPair);
    (await vi.waitFor(() => http.expectOne(`${API}/uploads`))).flush('', unauthorized);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
    http.expectNone(`${API}/auth/refresh`);
    expect(auth.isAuthenticated()).toBe(false);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('goes straight to /login on a 401 when there is no refresh token', () => {
    const { client, http, navigate } = setup('jwt-1', null);

    client.get(`${API}/uploads`).subscribe({ error: () => undefined });
    http.expectOne(`${API}/uploads`).flush('', unauthorized);

    expect(navigate).toHaveBeenCalledWith('/login');
    http.expectNone(`${API}/auth/refresh`);
  });

  it('never tries to refresh because of a 401 from the refresh or logout calls themselves', () => {
    const { client, http, navigate } = setup('jwt-1', 'refresh-1');

    client.post(`${API}/auth/logout`, {}).subscribe({ error: () => undefined });
    http.expectOne(`${API}/auth/logout`).flush('', unauthorized);

    http.expectNone(`${API}/auth/refresh`);
    expect(navigate).not.toHaveBeenCalled();
  });
});
