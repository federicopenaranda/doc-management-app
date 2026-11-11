import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface AppConfig {
  apiUrl: string;
  /** Feature flag for the Preferences dialog (SCRUM-19): remove it two weeks after it is on in use. */
  preferencesEnabled: boolean;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function parseFlag(object: Record<string, unknown>, key: string): boolean {
  // The secret is edited by hand, so "true" / "false" as strings are accepted too.
  const flag = object[key] ?? false;
  const value = flag === 'true' ? true : flag === 'false' ? false : flag;
  if (typeof value !== 'boolean') {
    throw new Error(`config.json: "${key}" must be true or false`);
  }
  return value;
}

function parseConfig(raw: unknown): AppConfig {
  const object =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const apiUrl = object['apiUrl'];
  if (typeof apiUrl !== 'string' || !isHttpUrl(apiUrl)) {
    throw new Error('config.json: "apiUrl" must be an absolute http(s) URL');
  }
  const preferencesEnabled = parseFlag(object, 'preferencesEnabled');
  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    preferencesEnabled,
  };
}

/** Runtime configuration: one build serves every environment, config.json says where the API is. */
@Service()
export class AppConfigService {
  private readonly http = inject(HttpClient);
  private config: AppConfig | null = null;

  get apiUrl(): string {
    if (!this.config) throw new Error('config.json has not been loaded');
    return this.config.apiUrl;
  }

  get preferencesEnabled(): boolean {
    if (!this.config) throw new Error('config.json has not been loaded');
    return this.config.preferencesEnabled;
  }

  /** Relative URL, so the app also works when served from a sub-path. */
  async load(): Promise<void> {
    let raw: unknown;
    try {
      raw = await firstValueFrom(this.http.get<unknown>('config.json'));
    } catch {
      throw new Error('Could not load config.json');
    }
    this.config = parseConfig(raw);
  }
}
