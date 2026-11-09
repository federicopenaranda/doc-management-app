import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api-url';
import { AppConfigService } from '../app-config.service';

const ACCESS_KEY = 'dms.accessToken';
const REFRESH_KEY = 'dms.refreshToken';

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/**
 * Holds the access token (1 hour) and, with the refresh flag on, the refresh token (7 days, works once).
 * sessionStorage (not localStorage) so a page reload keeps you in but closing the tab logs you out.
 */
@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private readonly config = inject(AppConfigService);
  private pendingRefresh: Promise<boolean> | null = null;

  readonly token = signal<string | null>(sessionStorage.getItem(ACCESS_KEY));
  readonly isAuthenticated = computed(() => this.token() !== null);

  /** True when a 401 can be answered with a refresh instead of ending the session. */
  canRefresh(): boolean {
    return this.config.refreshEnabled && sessionStorage.getItem(REFRESH_KEY) !== null;
  }

  /** Forgets the session here and asks the server to revoke the refresh token (best effort). */
  logout(): void {
    const refreshToken = sessionStorage.getItem(REFRESH_KEY);
    this.forget();
    if (refreshToken && this.config.refreshEnabled) {
      this.http
        .post(`${this.apiUrl}/auth/logout`, { refreshToken })
        .subscribe({ error: () => undefined });
    }
  }

  /** Resolves true when logged in, false for wrong credentials; rejects on any other failure. */
  async login(email: string, password: string): Promise<boolean> {
    try {
      const { accessToken, refreshToken } = await firstValueFrom(
        this.http.post<{ accessToken?: unknown; refreshToken?: unknown }>(
          `${this.apiUrl}/auth/login`,
          { email, password },
        ),
      );
      if (!isText(accessToken)) throw new Error('The API returned no access token');
      this.store(
        accessToken,
        this.config.refreshEnabled && isText(refreshToken) ? refreshToken : null,
      );
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) return false;
      throw error;
    }
  }

  /**
   * Swaps the refresh token for a new pair. Resolves false (and forgets the session) when that is not possible.
   * Calls made while one is running share it: a refresh token works only once, so two requests would end the session.
   */
  refresh(): Promise<boolean> {
    this.pendingRefresh ??= this.requestRefresh().finally(() => (this.pendingRefresh = null));
    return this.pendingRefresh;
  }

  private async requestRefresh(): Promise<boolean> {
    const refreshToken = sessionStorage.getItem(REFRESH_KEY);
    if (!refreshToken || !this.config.refreshEnabled) return false;
    try {
      const response = await firstValueFrom(
        this.http.post<{ accessToken?: unknown; refreshToken?: unknown }>(
          `${this.apiUrl}/auth/refresh`,
          { refreshToken },
        ),
      );
      if (!isText(response.accessToken) || !isText(response.refreshToken)) {
        throw new Error('The API returned no new tokens');
      }
      this.store(response.accessToken, response.refreshToken);
      return true;
    } catch {
      this.forget();
      return false;
    }
  }

  private store(accessToken: string, refreshToken: string | null): void {
    sessionStorage.setItem(ACCESS_KEY, accessToken);
    this.token.set(accessToken);
    if (refreshToken) sessionStorage.setItem(REFRESH_KEY, refreshToken);
  }

  private forget(): void {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    this.token.set(null);
  }
}
