import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../api-url';
import { ClientsApi, type Client } from './clients-api';

const API = 'http://localhost:3000';
const acme: Client = {
  id: 'c1',
  name: 'Acme',
  address: null,
  code: 'ACME',
  phone: null,
  email: 'info@acme.com',
  prefix: 'ACM',
  isActive: true,
  createdAt: '2026-11-13T12:00:00.000Z',
  updatedAt: '2026-11-13T12:00:00.000Z',
};
const input = {
  name: 'Acme',
  address: null,
  code: 'ACME',
  phone: null,
  email: 'info@acme.com',
  prefix: 'ACM',
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
    ],
  });
  return { api: TestBed.inject(ClientsApi), http: TestBed.inject(HttpTestingController) };
}

describe('ClientsApi', () => {
  it('list() GETs /clients', async () => {
    const { api, http } = setup();

    const result = api.list();

    const req = http.expectOne(`${API}/clients`);
    expect(req.request.method).toBe('GET');
    req.flush([acme]);
    await expect(result).resolves.toEqual([acme]);
  });

  it('get() GETs /clients/:id', async () => {
    const { api, http } = setup();

    const result = api.get('c1');

    http.expectOne(`${API}/clients/c1`).flush(acme);
    await expect(result).resolves.toEqual(acme);
  });

  it('create() POSTs the fields to /clients', async () => {
    const { api, http } = setup();

    const result = api.create(input);

    const req = http.expectOne(`${API}/clients`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush(acme);
    await expect(result).resolves.toEqual(acme);
  });

  it('update() PUTs the fields to /clients/:id', async () => {
    const { api, http } = setup();

    const result = api.update('c1', input);

    const req = http.expectOne(`${API}/clients/c1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(input);
    req.flush(acme);
    await expect(result).resolves.toEqual(acme);
  });

  it.each([
    [false, 'disable'],
    [true, 'enable'],
  ])('setActive(%s) POSTs to /clients/:id/%s', async (isActive, action) => {
    const { api, http } = setup();

    const result = api.setActive('c1', isActive);

    const req = http.expectOne(`${API}/clients/c1/${action}`);
    expect(req.request.method).toBe('POST');
    req.flush(acme);
    await expect(result).resolves.toEqual(acme);
  });

  it('create() rejects with the HTTP error, so the form can tell a taken field (409)', async () => {
    const { api, http } = setup();

    const result = api.create(input);

    http.expectOne(`${API}/clients`).flush('', { status: 409, statusText: 'Conflict' });
    await expect(result).rejects.toMatchObject({ status: 409 });
  });
});
