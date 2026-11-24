import { render, screen, waitFor } from '@testing-library/angular';
import { HomePage } from './home-page';

const made = vi.hoisted(() => ({ types: [] as string[] }));

// jsdom has no canvas, so Chart.js is replaced by a recorder.
vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults: Record<string, unknown> = {};
    destroy = vi.fn();
    constructor(_canvas: unknown, config: { type: string }) {
      made.types.push(config.type);
    }
  }
  return {
    Chart,
    BarController: {},
    LineController: {},
    DoughnutController: {},
    BarElement: {},
    LineElement: {},
    PointElement: {},
    ArcElement: {},
    CategoryScale: {},
    LinearScale: {},
    Legend: {},
    Tooltip: {},
  };
});

describe('HomePage', () => {
  beforeEach(() => (made.types.length = 0));

  it('keeps a Home heading for screen readers', async () => {
    await render(HomePage);

    const heading = screen.getByRole('heading', { level: 1, name: 'Home' });
    expect(heading.className).toContain('sr-only');
  });

  it('shows a dashboard of three sample charts: bar, line and doughnut', async () => {
    const { fixture } = await render(HomePage);
    fixture.detectChanges();
    await fixture.whenStable();

    for (const name of ['Documents per month', 'Uploads per week', 'Documents by type']) {
      expect(screen.getByRole('img', { name })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    }
    await waitFor(() => expect([...made.types].sort()).toEqual(['bar', 'doughnut', 'line']));
  });

  it('says the numbers are sample data', async () => {
    await render(HomePage);

    expect(screen.getByText(/sample data/i)).toBeTruthy();
  });
});
