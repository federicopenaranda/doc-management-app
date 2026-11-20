import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { SideMenu } from './side-menu';

async function setup(open: boolean, canUpload = false) {
  const closed = vi.fn();
  await render(SideMenu, {
    inputs: { open, canUpload },
    on: { closed },
    // A catch-all route, so clicking a link has somewhere to go.
    providers: [provideRouter([{ path: '**', children: [] }])],
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

  it('has an Upload entry linking to /upload only for a user who can upload', async () => {
    await setup(true, true);

    expect(screen.getByRole('link', { name: 'Upload' }).getAttribute('href')).toBe('/upload');
  });

  it('has no Upload entry for a user who cannot upload', async () => {
    await setup(true, false);

    expect(screen.queryByRole('link', { name: 'Upload' })).toBeNull();
  });

  it('has a Clients entry linking to /clients', async () => {
    await setup(true);

    expect(screen.getByRole('link', { name: 'Clients' }).getAttribute('href')).toBe('/clients');
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
