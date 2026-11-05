import { InjectionToken } from '@angular/core';

// shortcut: hardcoded local backend URL, replace with build-time configuration before the first deploy.
export const API_URL = new InjectionToken<string>('API_URL', {
  factory: () => 'http://localhost:3000',
});
