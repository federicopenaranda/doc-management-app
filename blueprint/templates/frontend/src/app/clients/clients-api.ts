import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api-url';
import type { Client, ClientInput } from './client.model';

@Service()
export class ClientsApi {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  list(): Promise<Client[]> {
    return firstValueFrom(this.http.get<Client[]>(`${this.apiUrl}/clients`));
  }

  get(id: string): Promise<Client> {
    return firstValueFrom(this.http.get<Client>(`${this.apiUrl}/clients/${id}`));
  }

  /** Rejects with the HttpErrorResponse: a 409 means the code, email or prefix belongs to another client. */
  create(client: ClientInput): Promise<Client> {
    return firstValueFrom(this.http.post<Client>(`${this.apiUrl}/clients`, client));
  }

  /** Rejects with the HttpErrorResponse: 404 for no such client, 409 for a code, email or prefix that is taken. */
  update(id: string, client: ClientInput): Promise<Client> {
    return firstValueFrom(this.http.put<Client>(`${this.apiUrl}/clients/${id}`, client));
  }

  /** Disables or enables a client. Rejects with the HttpErrorResponse (404: no such client). */
  setActive(id: string, isActive: boolean): Promise<Client> {
    const action = isActive ? 'enable' : 'disable';
    return firstValueFrom(this.http.post<Client>(`${this.apiUrl}/clients/${id}/${action}`, null));
  }
}
