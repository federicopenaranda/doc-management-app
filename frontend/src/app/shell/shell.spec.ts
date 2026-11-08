import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
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

  describe('slash shortcut', () => {
    it('focuses the search input when / is pressed on the page', async () => {
      await setup(true);

      await fireEvent.keyDown(document.body, { key: '/' });

      expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    });

    it('does not steal / while typing in another field', async () => {
      await render('<input aria-label="other" />', {
        imports: [Shell],
        providers: [
          provideRouter([]),
          { provide: AppConfigService, useValue: { shellEnabled: true } },
        ],
      });
      const other = screen.getByLabelText('other');
      other.focus();

      await fireEvent.keyDown(other, { key: '/' });

      expect(document.activeElement).toBe(other);
    });

    it.each(['ctrlKey', 'metaKey', 'altKey'])('ignores / with %s held', async (modifier) => {
      await setup(true);

      await fireEvent.keyDown(document.body, { key: '/', [modifier]: true });

      expect(document.activeElement).not.toBe(screen.getByRole('searchbox'));
    });

    it('does nothing with the shell flag off', async () => {
      await setup(false);

      await fireEvent.keyDown(document.body, { key: '/' });

      expect(screen.queryByRole('searchbox')).toBeNull();
    });
  });
});
