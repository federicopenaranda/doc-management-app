import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AppConfigService } from './app-config.service';
import { routes } from './app.routes';
import { UploadApi } from './uploads/upload-api';

function setup(uploadsEnabled: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: AppConfigService, useValue: { uploadsEnabled } },
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

  it('has no upload route while the feature flag is off', async () => {
    const harness = await setup(false);

    await expect(harness.navigateByUrl('/upload')).rejects.toThrow();
  });
});
