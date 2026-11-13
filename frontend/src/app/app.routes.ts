import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AppConfigService } from './app-config.service';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
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
        loadComponent: () => import('./home/home-page').then((m) => m.HomePage),
      },
      {
        path: 'upload',
        loadComponent: () => import('./uploads/upload-page').then((m) => m.UploadPage),
      },
      {
        path: 'clients',
        // Feature flag: while it is off the routes do not exist.
        canMatch: [() => inject(AppConfigService).clientsEnabled],
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () => import('./clients/clients-page').then((m) => m.ClientsPage),
          },
          {
            path: 'new',
            loadComponent: () => import('./clients/client-form-page').then((m) => m.ClientFormPage),
          },
          {
            path: ':id/edit',
            loadComponent: () => import('./clients/client-form-page').then((m) => m.ClientFormPage),
          },
        ],
      },
      {
        path: 'users',
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
          {
            path: ':id/edit',
            loadComponent: () => import('./users/user-form-page').then((m) => m.UserFormPage),
          },
        ],
      },
    ],
  },
];
