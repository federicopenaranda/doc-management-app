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

/** A user who was archived, with when. */
export interface ArchivedUser extends User {
  archivedAt: string;
}

export interface NewUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/** What the edit form changes: the password has no place here. */
export type EditedUser = Omit<NewUser, 'password'>;

@Service()
export class UsersApi {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  list(): Promise<User[]> {
    return firstValueFrom(this.http.get<User[]>(`${this.apiUrl}/users`));
  }

  get(id: string): Promise<User> {
    return firstValueFrom(this.http.get<User>(`${this.apiUrl}/users/${id}`));
  }

  /** Rejects with the HttpErrorResponse: a 409 means the email belongs to another user. */
  update(id: string, user: EditedUser): Promise<User> {
    return firstValueFrom(this.http.put<User>(`${this.apiUrl}/users/${id}`, user));
  }

  /** Turns a user on or off. Rejects with the HttpErrorResponse (409: you cannot disable yourself). */
  setActive(id: string, isActive: boolean): Promise<User> {
    return firstValueFrom(this.http.put<User>(`${this.apiUrl}/users/${id}/active`, { isActive }));
  }

  /** Users are archived, never deleted: the API keeps the row and its history. */
  async archive(id: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.apiUrl}/users/${id}/archive`, null));
  }

  listArchived(): Promise<ArchivedUser[]> {
    return firstValueFrom(this.http.get<ArchivedUser[]>(`${this.apiUrl}/users/archived`));
  }

  /** An admin sets a new password. Rejects with the HttpErrorResponse (404: no such user). */
  async setPassword(id: string, password: string): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.apiUrl}/users/${id}/password`, { password }));
  }

  /** Brings an archived user back, disabled. Rejects with the HttpErrorResponse (404: not archived). */
  async restore(id: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.apiUrl}/users/${id}/restore`, null));
  }

  /** Rejects with the HttpErrorResponse: a 409 means the email is taken. */
  create(user: NewUser): Promise<User> {
    return firstValueFrom(this.http.post<User>(`${this.apiUrl}/users`, user));
  }
}
