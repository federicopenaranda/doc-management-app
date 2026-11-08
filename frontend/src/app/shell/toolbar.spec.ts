import { fireEvent, render, screen } from '@testing-library/angular';
import { Toolbar } from './toolbar';

function follows(first: HTMLElement, second: HTMLElement): boolean {
  return !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('Toolbar', () => {
  it('is the page banner landmark', async () => {
    await render(Toolbar);

    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('lays out hamburger, name, search, create, notifications and profile in order', async () => {
    await render(Toolbar);

    const order = [
      screen.getByRole('button', { name: /open menu/i }),
      screen.getByText('DMS'),
      screen.getByRole('searchbox', { name: /search/i }),
      screen.getByRole('button', { name: /create/i }),
      screen.getByRole('button', { name: /notifications/i }),
      screen.getByRole('button', { name: /user menu/i }),
    ];

    order.slice(1).forEach((element, i) => expect(follows(order[i], element)).toBe(true));
  });

  it('emits menuToggle when the hamburger is clicked', async () => {
    const menuToggle = vi.fn();
    await render(Toolbar, { on: { menuToggle } });

    await fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(menuToggle).toHaveBeenCalledTimes(1);
  });

  it('reflects menuOpen in aria-expanded on the hamburger', async () => {
    await render(Toolbar, { inputs: { menuOpen: true } });

    expect(screen.getByRole('button', { name: /open menu/i }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('lists three test documents in the create menu', async () => {
    await render(Toolbar);

    await fireEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(await screen.findAllByRole('menuitem', { name: /test document/i })).toHaveLength(3);
  });

  it('has no icon inside the search input and shows the slash hint', async () => {
    await render(Toolbar);

    const input = screen.getByRole('searchbox', { name: /search/i });

    expect(input.parentElement?.querySelector('mat-icon')).toBeNull();
    expect(input.parentElement?.textContent).toContain('/');
  });
});
