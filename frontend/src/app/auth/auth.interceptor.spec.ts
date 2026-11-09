import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { API_URL } from '../api-url';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const API = 'http://localhost:3000';

function setup(token: string | null = 'jwt-1') {
  sessionStorage.clear();
  if (token) sessionStorage.setItem('dms.accessToken', token);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_URL, useValue: API },
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
