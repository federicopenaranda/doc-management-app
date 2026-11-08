import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_URL } from './api-url';
import { AppConfigService } from './app-config.service';
import { routes } from './app.routes';
import { UploadApi } from './uploads/upload-api';

function setup(uploadsEnabled: boolean, shellEnabled = false) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideHttpClient(),
      { provide: API_URL, useValue: 'http://localhost:3000' },
      { provide: AppConfigService, useValue: { uploadsEnabled, shellEnabled } },
      { provide: UploadApi, useValue: { sign: vi.fn() } },
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

  it('has no upload route while the feature flag is off', async () => {
    const harness = await setup(false);

    await expect(harness.navigateByUrl('/upload')).rejects.toThrow();
  });
});
