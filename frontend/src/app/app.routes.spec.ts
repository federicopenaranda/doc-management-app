import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_URL } from './api-url';
import { AppConfigService } from './app-config.service';
import { routes } from './app.routes';
import { AuthService } from './auth/auth.service';
import { UploadApi } from './uploads/upload-api';
import { UsersApi } from './users/users-api';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideHttpClient(),
      { provide: API_URL, useValue: 'http://localhost:3000' },
      { provide: AppConfigService, useValue: { preferencesEnabled: false } },
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: () => true,
          currentUser: signal(null),
          loadCurrentUser: vi.fn(),
          logout: vi.fn(),
        },
      },
      { provide: UploadApi, useValue: { sign: vi.fn() } },
      { provide: UsersApi, useValue: { list: vi.fn().mockResolvedValue([]), create: vi.fn() } },
    ],
  });
  return RouterTestingHarness.create();
}

describe('routes', () => {
  it('lazy loads the upload page', async () => {
    const harness = await setup();

    await harness.navigateByUrl('/upload');

    expect(harness.routeNativeElement?.querySelector('[data-testid="drop-zone"]')).not.toBeNull();
  });

  it('sends the root to the upload page, the only real page for now', async () => {
    const harness = await setup();

    await harness.navigateByUrl('/');

    expect(TestBed.inject(Router).url).toBe('/upload');
    expect(harness.routeNativeElement?.querySelector('[data-testid="drop-zone"]')).not.toBeNull();
  });

  it('renders pages inside the shell main landmark', async () => {
    const harness = await setup();

    await harness.navigateByUrl('/upload');

    expect(
      harness.routeNativeElement?.querySelector('main [data-testid="drop-zone"]'),
    ).not.toBeNull();
  });

  it('lazy loads the users list', async () => {
    const harness = await setup();

    await harness.navigateByUrl('/users');

    expect(harness.routeNativeElement?.querySelector('main section h2')?.textContent).toContain(
      'Users',
    );
  });

  it('lazy loads the new user form', async () => {
    const harness = await setup();

    await harness.navigateByUrl('/users/new');

    expect(harness.routeNativeElement?.querySelector('main form')).not.toBeNull();
  });

  it('lazy loads the edit user form', async () => {
    const harness = await setup();

    await harness.navigateByUrl('/users/u1/edit');

    expect(harness.routeNativeElement?.querySelector('main section')).not.toBeNull();
  });
});
