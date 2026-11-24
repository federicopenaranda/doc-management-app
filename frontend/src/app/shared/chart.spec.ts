import { render, screen } from '@testing-library/angular';
import type { ChartConfiguration } from 'chart.js';
import { ThemeService } from '../theme/theme.service';
import { DmsChart } from './chart';

const made = vi.hoisted(() => ({
  charts: [] as {
    canvas: unknown;
    config: ChartConfiguration;
    destroy: ReturnType<typeof vi.fn>;
  }[],
}));

// jsdom has no canvas, so Chart.js is replaced by a recorder.
vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults: Record<string, unknown> = {};
    destroy = vi.fn();
    constructor(
      public canvas: unknown,
      public config: ChartConfiguration,
    ) {
      made.charts.push(this);
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

const config: ChartConfiguration = {
  type: 'bar',
  data: {
    labels: ['Jan', 'Feb'],
    datasets: [{ label: 'Documents', data: [3, 5] }],
  },
};

describe('DmsChart', () => {
  beforeEach(() => (made.charts.length = 0));

  it('draws the configuration on its canvas, filling the box it sits in', async () => {
    await render(DmsChart, { inputs: { config, label: 'Documents per month' } });

    expect(made.charts).toHaveLength(1);
    expect(made.charts[0]?.canvas).toBe(screen.getByRole('img', { name: 'Documents per month' }));
    expect(made.charts[0]?.config.type).toBe('bar');
    expect(made.charts[0]?.config.options).toMatchObject({
      responsive: true,
      maintainAspectRatio: false,
    });
  });

  it('gives screen readers the same numbers as a table', async () => {
    await render(DmsChart, { inputs: { config, label: 'Documents per month' } });

    const table = screen.getByRole('table', { name: 'Documents per month' });
    expect(table.textContent).toContain('Jan');
    expect(table.textContent).toContain('Documents');
    expect(table.textContent).toContain('5');
    expect(table.className).toContain('sr-only');
  });

  it('draws again, destroying the old chart, when the theme changes', async () => {
    const { fixture } = await render(DmsChart, {
      inputs: { config, label: 'Documents per month' },
    });
    const theme = fixture.debugElement.injector.get(ThemeService);

    theme.toggle();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(made.charts).toHaveLength(2);
    expect(made.charts[0]?.destroy).toHaveBeenCalled();
  });

  it('destroys the chart when it leaves the page', async () => {
    const { fixture } = await render(DmsChart, {
      inputs: { config, label: 'Documents per month' },
    });

    fixture.destroy();

    expect(made.charts[0]?.destroy).toHaveBeenCalled();
  });
});
