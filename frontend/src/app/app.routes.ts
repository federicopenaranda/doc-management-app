import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AppConfigService } from './app-config.service';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    // Feature flag (config.json "authEnabled"): without it the route does not exist.
    canMatch: [() => inject(AppConfigService).authEnabled],
    loadComponent: () => import('./auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canMatch: [authGuard],
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
      {
        path: 'users',
        // Feature flag (config.json "usersEnabled"): without it the routes do not exist.
        canMatch: [() => inject(AppConfigService).usersEnabled],
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () => import('./users/users-page').then((m) => m.UsersPage),
          },
          {
            path: 'new',
            loadComponent: () => import('./users/user-form-page').then((m) => m.UserFormPage),
          },
        ],
      },
    ],
  },
];
