import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { AppConfigService } from '../app-config.service';
import { SideMenu } from './side-menu';

async function setup(open: boolean, clientsEnabled = false) {
  const closed = vi.fn();
  await render(SideMenu, {
    inputs: { open },
    on: { closed },
    // A catch-all route, so clicking a link has somewhere to go.
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: AppConfigService, useValue: { clientsEnabled } },
    ],
  });
  return { closed };
}

describe('SideMenu', () => {
  it('has no menu in the page while closed', async () => {
    await setup(false);

    expect(screen.queryByRole('navigation', { name: /main menu/i })).toBeNull();
    expect(screen.queryByTestId('scrim')).toBeNull();
  });

  it('shows the placeholder entries while open', async () => {
    await setup(true);

    const nav = screen.getByRole('navigation', { name: /main menu/i });

    for (const name of ['Home', 'Documents', 'Shared', 'Settings']) {
      expect(nav.textContent).toContain(name);
    }
  });

  it('has a Users entry linking to /users', async () => {
    await setup(true);

    const link = screen.getByRole('link', { name: 'Users' });
    expect(link.getAttribute('href')).toBe('/users');
  });

  it('has a Clients entry linking to /clients only while the clients flag is on', async () => {
    await setup(true, true);

    expect(screen.getByRole('link', { name: 'Clients' }).getAttribute('href')).toBe('/clients');
  });

  it('has no Clients entry while the clients flag is off', async () => {
    await setup(true, false);

    expect(screen.queryByRole('link', { name: 'Clients' })).toBeNull();
  });

  it('emits closed when the Users entry is clicked', async () => {
    const { closed } = await setup(true);

    await fireEvent.click(screen.getByRole('link', { name: 'Users' }));

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('emits closed when the scrim is clicked', async () => {
    const { closed } = await setup(true);

    await fireEvent.click(screen.getByTestId('scrim'));

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('emits closed when an entry is clicked', async () => {
    const { closed } = await setup(true);

    await fireEvent.click(screen.getByRole('button', { name: 'Documents' }));

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
