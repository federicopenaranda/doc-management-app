import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartConfiguration,
  DoughnutController,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { ThemeService } from '../theme/theme.service';

// Only the chart types the app uses, so the rest of Chart.js stays out of the bundle.
Chart.register(
  BarController,
  LineController,
  DoughnutController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
);

/**
 * A Chart.js chart that fills the box it sits in (give the host a height). The canvas is
 * invisible to screen readers, so the same numbers also go out as a table.
 */
@Component({
  selector: 'dms-chart',
  templateUrl: './chart.html',
  host: { class: 'relative block h-64' },
})
export class DmsChart {
  readonly config = input.required<ChartConfiguration>();
  /** What the chart shows; names the canvas and the table. */
  readonly label = input.required<string>();

  private readonly theme = inject(ThemeService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly rows = computed(() => {
    const { labels = [], datasets } = this.config().data;
    return labels.map((name, i) => ({
      name: String(name),
      values: datasets.map((set) => String(set.data[i])),
    }));
  });
  protected readonly series = computed(() =>
    this.config().data.datasets.map((set) => set.label ?? ''),
  );

  constructor() {
    // Drawn again when the configuration or the light/dark theme changes.
    afterRenderEffect((onCleanup) => {
      this.theme.scheme();
      const element = this.canvas().nativeElement;
      const text = getComputedStyle(element).getPropertyValue('--mat-sys-on-surface').trim();
      Chart.defaults.color = text || '#666';
      Chart.defaults.borderColor = 'rgba(128, 128, 128, 0.25)';
      const config = this.config();
      const chart = new Chart(element, {
        ...config,
        options: { ...config.options, responsive: true, maintainAspectRatio: false },
      });
      onCleanup(() => chart.destroy());
    });
  }
}
