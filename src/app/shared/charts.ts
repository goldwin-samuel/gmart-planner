import type { ChartConfiguration } from 'chart.js';
import { ChartTheme } from '../core/theme.service';
import { hexToRgb } from '../core/utils';

type Fmt = (n: number) => string;

const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

function baseScales(ct: ChartTheme, fmt: Fmt, showY = true): any {
  return {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: ct.ink, font: { size: 11, weight: 500 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
    },
    y: {
      display: showY,
      beginAtZero: true,
      grid: { color: ct.grid },
      border: { display: false },
      ticks: { color: ct.ink, font: { size: 11 }, maxTicksLimit: 4, callback: (v: any) => fmt(Number(v)) },
    },
  };
}

function tooltip(ct: ChartTheme, fmt: Fmt): any {
  return {
    backgroundColor: ct.isDark ? '#1f2c48' : '#0f172a',
    titleColor: '#fff',
    bodyColor: '#e2e8f0',
    padding: 10,
    cornerRadius: 10,
    displayColors: false,
    callbacks: { label: (c: any) => fmt(Number(c.parsed.y ?? c.parsed)) },
  };
}

/** Bars; the last bar (current period) uses the accent gradient, others are muted. */
export function barChart(labels: string[], data: number[], ct: ChartTheme, fmt: Fmt, highlightLast = true): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          data,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 34,
          backgroundColor: data.map((_, i) => (highlightLast && i < data.length - 1 ? rgba(ct.accent, 0.28) : ct.accent)),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: { legend: { display: false }, tooltip: tooltip(ct, fmt) },
      scales: baseScales(ct, fmt),
    },
  };
}

export function areaChart(labels: string[], data: number[], ct: ChartTheme, fmt: Fmt, showPoints = true): ChartConfiguration {
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data,
          tension: 0.38,
          fill: true,
          borderColor: ct.accent,
          borderWidth: 2.5,
          pointRadius: showPoints ? 3.5 : 0,
          pointHoverRadius: 5,
          pointBackgroundColor: ct.surface,
          pointBorderColor: ct.accent,
          pointBorderWidth: 2,
          backgroundColor: (ctx: any) => {
            const { chart } = ctx;
            const area = chart.chartArea;
            if (!area) return 'transparent';
            const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, rgba(ct.accent, 0.32));
            g.addColorStop(1, rgba(ct.accent, 0));
            return g;
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: tooltip(ct, fmt) },
      scales: baseScales(ct, fmt),
    },
  };
}

export function doughnutChart(labels: string[], data: number[], ct: ChartTheme, fmt: Fmt): ChartConfiguration {
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: data.map((_, i) => ct.palette[i % ct.palette.length]),
          borderColor: ct.surface,
          borderWidth: 3,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltip(ct, fmt), callbacks: { label: (c: any) => `${c.label}: ${fmt(Number(c.parsed))}` } },
      },
    } as any,
  };
}

export interface Series {
  name: string;
  data: number[];
  color: string;
}

/** Side-by-side bars for 2+ series (e.g. income vs expenses) with a legend. */
export function groupedBarChart(labels: string[], series: Series[], ct: ChartTheme, fmt: Fmt): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.name,
        data: s.data,
        backgroundColor: s.color,
        borderRadius: 7,
        borderSkipped: false,
        maxBarThickness: 22,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, color: ct.ink, font: { size: 11, weight: 600 } } },
        tooltip: { ...tooltip(ct, fmt), displayColors: true, callbacks: { label: (c: any) => `${c.dataset.label}: ${fmt(Number(c.parsed.y))}` } },
      },
      scales: baseScales(ct, fmt),
    },
  };
}

/** Line of net/balance values that may go negative; area is tinted green above zero and red below. */
export function balanceChart(labels: string[], data: number[], ct: ChartTheme, fmt: Fmt, good: string, bad: string): ChartConfiguration {
  const scales = baseScales(ct, fmt);
  scales.y.beginAtZero = false;
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data,
          tension: 0.35,
          fill: { target: 'origin', above: rgba(good, 0.16), below: rgba(bad, 0.16) },
          borderColor: ct.accent,
          borderWidth: 2.5,
          pointRadius: 3.5,
          pointHoverRadius: 5,
          pointBackgroundColor: ct.surface,
          pointBorderColor: ct.accent,
          pointBorderWidth: 2,
          segment: { borderColor: (c: any) => (c.p1.parsed.y < 0 ? bad : ct.accent) },
        } as any,
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: tooltip(ct, fmt) },
      scales,
    },
  };
}
