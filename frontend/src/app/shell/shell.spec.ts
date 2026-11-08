import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { AppConfigService } from '../app-config.service';
import { Shell } from './shell';

async function setup(shellEnabled: boolean) {
  return render(Shell, {
    providers: [provideRouter([]), { provide: AppConfigService, useValue: { shellEnabled } }],
  });
}

describe('Shell', () => {
  it('renders exactly one main landmark with the shell flag off, and no toolbar', async () => {
    await setup(false);

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('renders exactly one main landmark with the shell flag on', async () => {
    await setup(true);

    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
