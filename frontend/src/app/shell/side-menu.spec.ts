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

  it('shows only the entries that lead somewhere while open', async () => {
    await setup(true);

    const nav = screen.getByRole('navigation', { name: /main menu/i });

    for (const name of ['Home', 'Documents', 'Users', 'Clients']) {
      expect(nav.textContent).toContain(name);
    }
    expect(screen.queryByRole('button', { name: 'Shared' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  });

  it('has a Users entry linking to /users', async () => {
    await setup(true);

    const link = screen.getByRole('link', { name: 'Users' });
    expect(link.getAttribute('href')).toBe('/users');
  });

  it('has a Documents entry linking to /documents', async () => {
    await setup(true);

    expect(screen.getByRole('link', { name: 'Documents' }).getAttribute('href')).toBe('/documents');
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

    await fireEvent.click(screen.getByRole('link', { name: 'Documents' }));

    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('SideMenu position', () => {
  it('starts right under the 3rem toolbar, scrim included', async () => {
    await setup(true);

    expect(screen.getByRole('navigation').className).toContain('top-12');
    expect(screen.getByTestId('scrim').className).toContain('top-12');
  });
});

describe('SideMenu icons', () => {
  it.each([
    ['Home', 'home'],
    ['Documents', 'description'],
    ['Upload', 'upload_file'],
    ['Users', 'group'],
    ['Clients', 'business'],
  ])('shows the %s entry with the %s icon', async (name, icon) => {
    await setup(true, true);

    const link = screen.getByRole('link', { name });

    expect(link.querySelector('mat-icon')?.getAttribute('fonticon')).toBe(icon);
  });
});
