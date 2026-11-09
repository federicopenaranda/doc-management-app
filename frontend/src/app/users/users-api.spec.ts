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
