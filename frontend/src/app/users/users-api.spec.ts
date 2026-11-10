import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../api-url';
import { UsersApi, type User } from './users-api';

const API = 'http://localhost:3000';
const ana: User = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  isActive: true,
  createdAt: '2026-11-09T12:00:00.000Z',
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
    ],
  });
  return { api: TestBed.inject(UsersApi), http: TestBed.inject(HttpTestingController) };
}

describe('UsersApi', () => {
  it('list() GETs /users and returns the users', async () => {
    const { api, http } = setup();

    const result = api.list();

    const req = http.expectOne(`${API}/users`);
    expect(req.request.method).toBe('GET');
    req.flush([ana]);
    await expect(result).resolves.toEqual([ana]);
  });

  it('create() POSTs exactly the four fields to /users and returns the new user', async () => {
    const { api, http } = setup();
    const input = {
      firstName: 'Ana',
      lastName: 'García',
      email: 'ana@example.com',
      password: 'a long enough password',
    };

    const result = api.create(input);

    const req = http.expectOne(`${API}/users`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush(ana);
    await expect(result).resolves.toEqual(ana);
  });

  it('create() rejects with the HTTP error, so the form can tell a duplicate email (409)', async () => {
    const { api, http } = setup();

    const result = api.create({
      firstName: 'Ana',
      lastName: 'García',
      email: 'ana@example.com',
      password: 'a long enough password',
    });
    http.expectOne(`${API}/users`).flush({}, { status: 409, statusText: 'Conflict' });

    await expect(result).rejects.toMatchObject({ status: 409 });
  });
});

describe('UsersApi edit', () => {
  const edit = { firstName: 'Ana María', lastName: 'García', email: 'ana@example.com' };

  it('get() GETs /users/:id and returns the user', async () => {
    const { api, http } = setup();

    const result = api.get('u1');

    const req = http.expectOne(`${API}/users/u1`);
    expect(req.request.method).toBe('GET');
    req.flush(ana);
    await expect(result).resolves.toEqual(ana);
  });

  it('update() PUTs exactly the three editable fields to /users/:id and returns the user', async () => {
    const { api, http } = setup();

    const result = api.update('u1', edit);

    const req = http.expectOne(`${API}/users/u1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(edit);
    req.flush({ ...ana, ...edit });
    await expect(result).resolves.toMatchObject(edit);
  });

  it('update() rejects with the HTTP error, so the form can tell a duplicate email (409)', async () => {
    const { api, http } = setup();

    const result = api.update('u1', edit);
    http.expectOne(`${API}/users/u1`).flush({}, { status: 409, statusText: 'Conflict' });

    await expect(result).rejects.toMatchObject({ status: 409 });
  });
});

describe('UsersApi status and archive', () => {
  it('setActive() PUTs { isActive } to /users/:id/active and returns the user', async () => {
    const { api, http } = setup();

    const result = api.setActive('u1', false);

    const req = http.expectOne(`${API}/users/u1/active`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ isActive: false });
    req.flush({ ...ana, isActive: false });
    await expect(result).resolves.toMatchObject({ id: 'u1', isActive: false });
  });

  it('archive() POSTs to /users/:id/archive and resolves with nothing', async () => {
    const { api, http } = setup();

    const result = api.archive('u1');

    const req = http.expectOne(`${API}/users/u1/archive`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await expect(result).resolves.toBeUndefined();
  });

  it('archive() rejects with the HTTP error', async () => {
    const { api, http } = setup();

    const result = api.archive('u1');
    http.expectOne(`${API}/users/u1/archive`).flush({}, { status: 409, statusText: 'Conflict' });

    await expect(result).rejects.toMatchObject({ status: 409 });
  });
});

describe('UsersApi archived users', () => {
  it('listArchived() GETs /users/archived', async () => {
    const { api, http } = setup();

    const result = api.listArchived();

    const req = http.expectOne(`${API}/users/archived`);
    expect(req.request.method).toBe('GET');
    req.flush([{ ...ana, archivedAt: '2026-11-10T09:00:00.000Z' }]);
    await expect(result).resolves.toMatchObject([{ id: 'u1', archivedAt: expect.any(String) }]);
  });

  it('restore() POSTs to /users/:id/restore and resolves with nothing', async () => {
    const { api, http } = setup();

    const result = api.restore('u1');

    const req = http.expectOne(`${API}/users/u1/restore`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await expect(result).resolves.toBeUndefined();
  });

  it('restore() rejects with the HTTP error', async () => {
    const { api, http } = setup();

    const result = api.restore('u1');
    http.expectOne(`${API}/users/u1/restore`).flush({}, { status: 404, statusText: 'Not Found' });

    await expect(result).rejects.toMatchObject({ status: 404 });
  });
});

describe('UsersApi setPassword', () => {
  it('PUTs { password } to /users/:id/password and resolves with nothing', async () => {
    const { api, http } = setup();

    const result = api.setPassword('u1', 'a brand new password');

    const req = http.expectOne(`${API}/users/u1/password`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ password: 'a brand new password' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await expect(result).resolves.toBeUndefined();
  });

  it('rejects with the HTTP error', async () => {
    const { api, http } = setup();

    const result = api.setPassword('u1', 'a brand new password');
    http.expectOne(`${API}/users/u1/password`).flush({}, { status: 404, statusText: 'Not Found' });

    await expect(result).rejects.toMatchObject({ status: 404 });
  });
});
