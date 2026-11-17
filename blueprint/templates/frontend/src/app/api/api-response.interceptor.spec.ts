import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api-url';
import { apiResponseInterceptor } from './api-response.interceptor';

const API = 'https://api.example.com';

const meta = { correlationId: 'c1', timestamp: '2026-11-11T00:00:00.000Z' };
const success = (data: unknown, code = 200) => ({ success: true, code, data, errors: [], meta });

function setup(apiUrl: () => string = () => API) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([apiResponseInterceptor])),
      provideHttpClientTesting(),
      { provide: API_URL, useFactory: apiUrl },
    ],
  });
  return { client: TestBed.inject(HttpClient), http: TestBed.inject(HttpTestingController) };
}

describe('apiResponseInterceptor', () => {
  it('hands the data of a success response of our API to the caller', async () => {
    const { client, http } = setup();

    const result = firstValueFrom(client.get<{ id: number }>(`${API}/users/1`));
    http.expectOne(`${API}/users/1`).flush(success({ id: 1 }));

    expect(await result).toEqual({ id: 1 });
  });

  it('keeps a list as it is', async () => {
    const { client, http } = setup();

    const result = firstValueFrom(client.get<number[]>(`${API}/users`));
    http.expectOne(`${API}/users`).flush(success([1, 2]));

    expect(await result).toEqual([1, 2]);
  });

  it('hands over null when the API had nothing to return (archive, restore, password, logout)', async () => {
    const { client, http } = setup();

    const result = firstValueFrom(client.post<void>(`${API}/users/1/archive`, null));
    http.expectOne(`${API}/users/1/archive`).flush(success(null));

    expect(await result).toBeNull();
  });

  it('leaves a body without the standard shape alone (an older backend)', async () => {
    const { client, http } = setup();

    const result = firstValueFrom(client.get<unknown>(`${API}/users/1`));
    http.expectOne(`${API}/users/1`).flush({ id: 1 });

    expect(await result).toEqual({ id: 1 });
  });

  it('leaves other addresses alone, even when their body looks like ours', async () => {
    const { client, http } = setup();
    const body = success({ id: 1 });

    const result = firstValueFrom(client.get<unknown>('https://other.example/x'));
    http.expectOne('https://other.example/x').flush(body);

    expect(await result).toEqual(body);
  });

  it('does not ask for the API address on a relative request (config.json loads before it is known)', async () => {
    const { client, http } = setup(() => {
      throw new Error('API_URL is not known yet');
    });

    const result = firstValueFrom(client.get<unknown>('config.json'));
    http.expectOne('config.json').flush({ apiUrl: API });

    expect(await result).toEqual({ apiUrl: API });
  });

  it('keeps an error as it is: the status on the error and the standard body inside it', async () => {
    const { client, http } = setup();
    const failure = {
      success: false,
      code: 409,
      data: null,
      errors: [{ errorCode: 'ERR_CONFLICT', message: 'Taken', field: 'email' }],
      meta,
    };

    const result = firstValueFrom(client.post(`${API}/users`, {}));
    http.expectOne(`${API}/users`).flush(failure, { status: 409, statusText: 'Conflict' });

    const error = await result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(409);
    expect((error as HttpErrorResponse).error).toEqual(failure);
  });
});
