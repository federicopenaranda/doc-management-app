import { render, screen } from '@testing-library/angular';
import { HomePage } from './home-page';

describe('HomePage', () => {
  it('is blank for now: a heading for screen readers and nothing else', async () => {
    const { container } = await render(HomePage);

    const heading = screen.getByRole('heading', { level: 1, name: 'Home' });
    expect(heading.className).toContain('sr-only');
    expect(container.querySelectorAll('a, button, input')).toHaveLength(0);
    expect(container.textContent?.trim()).toBe('Home');
  });
});
