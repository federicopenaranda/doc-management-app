import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api-url';

export interface User {
  id: string;
  email: string;
  /** Empty for the users created before names existed. */
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
}

export interface NewUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

@Service()
export class UsersApi {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  list(): Promise<User[]> {
    return firstValueFrom(this.http.get<User[]>(`${this.apiUrl}/users`));
  }

  /** Rejects with the HttpErrorResponse: a 409 means the email is taken. */
  create(user: NewUser): Promise<User> {
    return firstValueFrom(this.http.post<User>(`${this.apiUrl}/users`, user));
  }
}
