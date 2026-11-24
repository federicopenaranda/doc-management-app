import { render, screen } from '@testing-library/angular';
import type { ChartConfiguration } from 'chart.js';
import { CHART_FACTORY } from '../shared/chart';
import { HomePage } from './home-page';

const types: string[] = [];

// jsdom has no canvas, so the charts are recorded instead of drawn.
const factory = (_canvas: HTMLCanvasElement, config: ChartConfiguration) => {
  types.push(String(config.type));
  return { destroy: vi.fn() };
};

async function show() {
  const view = await render(HomePage, {
    providers: [{ provide: CHART_FACTORY, useValue: factory }],
  });
  view.fixture.detectChanges();
  await view.fixture.whenStable();
}

describe('HomePage', () => {
  beforeEach(() => (types.length = 0));

  it('keeps a Home heading for screen readers', async () => {
    await show();

    const heading = screen.getByRole('heading', { level: 1, name: 'Home' });
    expect(heading.className).toContain('sr-only');
  });

  it('shows a dashboard of three charts: bar, line and doughnut', async () => {
    await show();

    for (const name of ['Documents per month', 'Uploads per week', 'Documents by type']) {
      expect(screen.getByRole('img', { name })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    }
    expect([...types].sort()).toEqual(['bar', 'doughnut', 'line']);
  });
});
