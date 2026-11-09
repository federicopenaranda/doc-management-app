import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_URL } from './api-url';
import { AppConfigService } from './app-config.service';
import { routes } from './app.routes';
import { UploadApi } from './uploads/upload-api';
import { UsersApi } from './users/users-api';

function setup(uploadsEnabled: boolean, shellEnabled = false, usersEnabled = false) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideHttpClient(),
      { provide: API_URL, useValue: 'http://localhost:3000' },
      { provide: AppConfigService, useValue: { uploadsEnabled, shellEnabled, usersEnabled } },
      { provide: UploadApi, useValue: { sign: vi.fn() } },
      { provide: UsersApi, useValue: { list: vi.fn().mockResolvedValue([]), create: vi.fn() } },
    ],
  });
  return RouterTestingHarness.create();
}

describe('routes', () => {
  it('lazy loads the upload page when the feature flag is on', async () => {
    const harness = await setup(true);

    await harness.navigateByUrl('/upload');

    expect(harness.routeNativeElement?.querySelector('[data-testid="drop-zone"]')).not.toBeNull();
  });

  it('lazy loads the home page at the root', async () => {
    const harness = await setup(false);

    await harness.navigateByUrl('/');

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Hello, doc-management',
    );
  });

  it('renders pages inside the shell main landmark', async () => {
    const harness = await setup(true);

    await harness.navigateByUrl('/upload');

    expect(
      harness.routeNativeElement?.querySelector('main [data-testid="drop-zone"]'),
    ).not.toBeNull();
  });

  it('lazy loads the users list when the users flag is on', async () => {
    const harness = await setup(false, false, true);

    await harness.navigateByUrl('/users');

    expect(harness.routeNativeElement?.querySelector('main section h2')?.textContent).toContain(
      'Users',
    );
  });

  it('lazy loads the new user form when the users flag is on', async () => {
    const harness = await setup(false, false, true);

    await harness.navigateByUrl('/users/new');

    expect(harness.routeNativeElement?.querySelector('main form')).not.toBeNull();
  });

  it('has no users list while the users flag is off', async () => {
    const harness = await setup(false, false, false);

    await expect(harness.navigateByUrl('/users')).rejects.toThrow();
  });

  it('has no new user form while the users flag is off', async () => {
    const harness = await setup(false, false, false);

    await expect(harness.navigateByUrl('/users/new')).rejects.toThrow();
  });

  it('has no upload route while the feature flag is off', async () => {
    const harness = await setup(false);

    await expect(harness.navigateByUrl('/upload')).rejects.toThrow();
  });
});
