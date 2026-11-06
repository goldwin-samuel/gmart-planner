import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import Chart from 'chart.js/auto';
import type { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-chart',
  standalone: true,
  template: `<div class="chart-box" [style.height.px]="height"><canvas #cv></canvas></div>`,
  styles: [
    `
      :host {
        display: block;
      }
      .chart-box {
        position: relative;
        width: 100%;
      }
    `,
  ],
})
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) config!: ChartConfiguration;
  @Input() height = 220;
  @ViewChild('cv') cv!: ElementRef<HTMLCanvasElement>;

  private chart?: Chart;
  private ready = false;

  ngAfterViewInit() {
    this.ready = true;
    this.render();
  }

  ngOnChanges(c: SimpleChanges) {
    if (this.ready && c['config']) this.render();
  }

  private render() {
    this.chart?.destroy();
    if (!this.config || !this.cv) return;
    this.chart = new Chart(this.cv.nativeElement, this.config);
  }

  ngOnDestroy() {
    this.chart?.destroy();
  }
}
