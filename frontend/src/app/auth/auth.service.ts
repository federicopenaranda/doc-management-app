import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api-url';

const STORAGE_KEY = 'dms.accessToken';

/**
 * Holds the access token. sessionStorage (not localStorage) so a refresh keeps you in but closing
 * the tab logs you out. shortcut: no refresh token and no logout yet, the token lasts 1 hour; add both with SCRUM-17.
 */
@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  readonly token = signal<string | null>(sessionStorage.getItem(STORAGE_KEY));
  readonly isAuthenticated = computed(() => this.token() !== null);

  /** Resolves true when logged in, false for wrong credentials; rejects on any other failure. */
  async login(email: string, password: string): Promise<boolean> {
    try {
      const { accessToken } = await firstValueFrom(
        this.http.post<{ accessToken?: unknown }>(`${this.apiUrl}/auth/login`, { email, password }),
      );
      if (typeof accessToken !== 'string' || accessToken === '') {
        throw new Error('The API returned no access token');
      }
      sessionStorage.setItem(STORAGE_KEY, accessToken);
      this.token.set(accessToken);
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) return false;
      throw error;
    }
  }
}
