import { Component, LOCALE_ID, inject } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { DmsChart } from '../shared/chart';

const PALETTE = ['#4c78a8', '#f58518', '#54a24b', '#e45756', '#72b7b2'];

/** The page after login: a dashboard with made-up numbers, until real statistics exist. */
@Component({
  selector: 'dms-home-page',
  imports: [DmsChart],
  templateUrl: './home-page.html',
})
export class HomePage {
  private readonly locale = inject(LOCALE_ID);

  protected readonly perMonthLabel = $localize`Documents per month`;
  protected readonly perWeekLabel = $localize`Uploads per week`;
  protected readonly byTypeLabel = $localize`Documents by type`;

  protected readonly perMonth: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: this.months(),
      datasets: [
        {
          label: $localize`Documents`,
          data: [12, 19, 8, 15, 22, 30],
          backgroundColor: PALETTE[0],
        },
      ],
    },
    options: { plugins: { legend: { display: false } } },
  };

  protected readonly perWeek: ChartConfiguration = {
    type: 'line',
    data: {
      labels: ['1', '2', '3', '4', '5', '6', '7', '8'],
      datasets: [
        {
          label: $localize`Uploads`,
          data: [5, 9, 7, 14, 11, 18, 16, 21],
          borderColor: PALETTE[1],
          backgroundColor: PALETTE[1],
          tension: 0.3,
        },
      ],
    },
    options: { plugins: { legend: { display: false } } },
  };

  protected readonly byType: ChartConfiguration = {
    type: 'doughnut',
    data: {
      labels: ['PDF', 'Word', 'Excel', $localize`Images`],
      datasets: [{ label: $localize`Documents`, data: [48, 22, 12, 18], backgroundColor: PALETTE }],
    },
  };

  private months(): string[] {
    const format = new Intl.DateTimeFormat(this.locale, { month: 'short' });
    return Array.from({ length: 6 }, (_, i) => format.format(new Date(2026, i, 1)));
  }
}
