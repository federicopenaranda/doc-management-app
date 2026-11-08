import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { SideMenu } from './side-menu';

async function setup(open: boolean) {
  const closed = vi.fn();
  await render(SideMenu, {
    inputs: { open },
    on: { closed },
    providers: [provideRouter([])],
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
