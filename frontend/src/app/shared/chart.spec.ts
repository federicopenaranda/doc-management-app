import { render, screen } from '@testing-library/angular';
import type { ChartConfiguration } from 'chart.js';
import { ThemeService } from '../theme/theme.service';
import { CHART_FACTORY, DmsChart } from './chart';

const made: {
  canvas: unknown;
  config: ChartConfiguration;
  destroy: ReturnType<typeof vi.fn>;
}[] = [];

// jsdom has no canvas, so the charts are recorded instead of drawn.
const factory = (canvas: HTMLCanvasElement, config: ChartConfiguration) => {
  const chart = { canvas, config, destroy: vi.fn() };
  made.push(chart);
  return chart;
};

const config: ChartConfiguration = {
  type: 'bar',
  data: {
    labels: ['Jan', 'Feb'],
    datasets: [{ label: 'Documents', data: [3, 5] }],
  },
};

// The chart is drawn after the first render, so wait for it before looking.
async function draw() {
  const view = await render(DmsChart, {
    inputs: { config, label: 'Documents per month' },
    providers: [{ provide: CHART_FACTORY, useValue: factory }],
  });
  view.fixture.detectChanges();
  await view.fixture.whenStable();
  return view;
}

describe('DmsChart', () => {
  beforeEach(() => (made.length = 0));

  it('draws the configuration on its canvas, filling the box it sits in', async () => {
    await draw();

    expect(made).toHaveLength(1);
    expect(made[0]?.canvas).toBe(screen.getByRole('img', { name: 'Documents per month' }));
    expect(made[0]?.config.type).toBe('bar');
    expect(made[0]?.config.options).toMatchObject({ responsive: true, maintainAspectRatio: false });
  });

  it('gives screen readers the same numbers as a table', async () => {
    await draw();

    const table = screen.getByRole('table', { name: 'Documents per month' });
    expect(table.textContent).toContain('Jan');
    expect(table.textContent).toContain('Documents');
    expect(table.textContent).toContain('5');
    expect(table.className).toContain('sr-only');
  });

  it('draws again, destroying the old chart, when the theme changes', async () => {
    const { fixture } = await draw();

    fixture.debugElement.injector.get(ThemeService).toggle();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(made).toHaveLength(2);
    expect(made[0]?.destroy).toHaveBeenCalled();
  });

  it('destroys the chart when it leaves the page', async () => {
    const { fixture } = await draw();

    fixture.destroy();

    expect(made[0]?.destroy).toHaveBeenCalled();
  });
});
