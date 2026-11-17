import { inject, InjectionToken } from '@angular/core';
import { AppConfigService } from './app-config.service';

export const API_URL = new InjectionToken<string>('API_URL', {
  factory: () => inject(AppConfigService).apiUrl,
});
