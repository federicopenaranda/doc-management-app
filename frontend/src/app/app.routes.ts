import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AppConfigService } from './app-config.service';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./hello/home-page').then((m) => m.HomePage),
      },
      {
        path: 'upload',
        // Feature flag (config.json "uploadsEnabled"): without it the route does not exist.
        canMatch: [() => inject(AppConfigService).uploadsEnabled],
        loadComponent: () => import('./uploads/upload-page').then((m) => m.UploadPage),
      },
    ],
  },
];
