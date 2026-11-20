import { Routes } from '@angular/router';
import { authGuard, uploadGuard } from './auth/auth.guard';

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
        path: 'documents',
        loadComponent: () => import('./documents/documents-page').then((m) => m.DocumentsPage),
      },
      {
        path: 'upload',
        canMatch: [uploadGuard],
        loadComponent: () => import('./uploads/upload-page').then((m) => m.UploadPage),
      },
      {
        path: 'clients',
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
