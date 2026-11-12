import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideRouter } from '@angular/router';
import { AppConfigService } from './app-config.service';
import { apiResponseInterceptor } from './api/api-response.interceptor';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Responses come back in reverse order: the last interceptor sees the raw response first, so the standard
    // response shape is unwrapped before the auth interceptor looks at it.
    provideHttpClient(withInterceptors([authInterceptor, apiResponseInterceptor])),
    // The app does not start until config.json is loaded and valid.
    provideAppInitializer(() => inject(AppConfigService).load()),
    // The compact theme (density -2) hides the label of a filled field; an outlined field keeps it visible.
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
  ],
};
