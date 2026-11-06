import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import {
  categoryTotals,
  dailySeries,
  daysInMonth,
  forecast,
  monthKey,
  monthLabel,
  monthlySeries,
  priceMovers,
  shiftMonth,
  storeTotals,
  sumMonth,
  topItems,
} from '../../core/analytics';
import { StoreService } from '../../core/store.service';
import { ThemeService } from '../../core/theme.service';
import { categoryEmoji } from '../../core/utils';
import { ChartComponent } from '../../shared/chart.component';
import { areaChart, barChart, doughnutChart } from '../../shared/charts';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [IonContent, IonIcon, ChartComponent],
  template: `
    <ion-content [fullscreen]="true">
      <div class="wrap">
        <div class="page-head h-row">
          <div>
            <div class="eyebrow">Analytics</div>
            <h1 class="title">Insights</h1>
          </div>
          <div class="stepper">
            <button class="icon-btn flat" (click)="step(-1)" aria-label="Previous month"><ion-icon name="chevron-back"></ion-icon></button>
            <span class="lbl">{{ label() }}</span>
            <button class="icon-btn flat" [disabled]="isCurrent()" [style.opacity]="isCurrent() ? 0.35 : 1" (click)="step(1)" aria-label="Next month">
              <ion-icon name="chevron-forward"></ion-icon>
            </button>
          </div>
        </div>

        <div class="tiles four">
          <div class="tile">
            <small>Total spent</small>
            <b>{{ store.fmt(spend(), 0) }}</b>
            <div class="sub">
              @if (delta() !== null) {
                <span class="delta" [class.up]="delta()! > 0" [class.down]="delta()! < 0">{{ delta()! > 0 ? '+' : '' }}{{ delta()!.toFixed(0) }}% vs last month</span>
              } @else { no prior data }
            </div>
          </div>
          <div class="tile"><small>Daily average</small><b>{{ store.fmt(fc().avgDaily, 0) }}</b><div class="sub">per day</div></div>
          <div class="tile"><small>Purchases</small><b>{{ count() }}</b><div class="sub">{{ store.fmt(avgBasket(), 0) }} average</div></div>
          <div class="tile"><small>Busiest day</small><b>{{ busiest().label }}</b><div class="sub">{{ store.fmt(busiest().amount, 0) }}</div></div>
        </div>

        @if (!count()) {
          <div class="card empty">
            <div class="empty-ico">📊</div>
            <h3>Nothing recorded in {{ label() }}</h3>
            <p>Switch months or record a purchase to see charts for this period.</p>
          </div>
        } @else {
          <div class="bento">
            <div class="card c-8">
              <div class="card-head"><div><h3>Day by day</h3><small>Spending across {{ label() }}</small></div></div>
              <app-chart [config]="dailyCfg()" [height]="240"></app-chart>
            </div>

            <div class="card c-4">
              <div class="card-head"><div><h3>Category mix</h3><small>Share of this month</small></div></div>
              <div class="donut-wrap stack">
                <div class="donut" style="position: relative">
                  <app-chart [config]="donutCfg()" [height]="170"></app-chart>
                  <div class="donut-center"><b>{{ cats().length }}</b><small>categories</small></div>
                </div>
                <div class="legend">
                  @for (c of cats().slice(0, 5); track c.name; let i = $index) {
                    <div class="lg">
                      <span class="dot" [style.background]="theme.chart().palette[i % theme.chart().palette.length]"></span>
                      {{ c.name }}<em>{{ c.pct.toFixed(0) }}%</em>
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="card c-6">
              <div class="card-head"><div><h3>Category breakdown</h3><small>Tap to open in your list</small></div></div>
              @for (c of cats(); track c.name) {
                <div class="rank-row" (click)="openCategory(c.name)">
                  <div class="rank-top">
                    <span>{{ emoji(c.name) }} {{ c.name }} <small>· {{ c.count }} buys</small></span>
                    <b>{{ store.fmt(c.total, 0) }}</b>
                  </div>
                  <div class="bar"><i [style.width.%]="c.pct"></i></div>
                </div>
              }
            </div>

            <div class="card c-6">
              <div class="card-head"><div><h3>Where you shop</h3><small>Spend by shop · {{ label() }}</small></div></div>
              @for (s of shops(); track s.name) {
                <div class="rank-row" (click)="openShop(s.name)">
                  <div class="rank-top">
                    <span>🏪 {{ s.name }} <small>· {{ s.count }} item{{ s.count === 1 ? '' : 's' }}</small></span>
                    <b>{{ store.fmt(s.total, 0) }}</b>
                  </div>
                  <div class="bar"><i [style.width.%]="s.pct"></i></div>
                </div>
              }
              @if (!hasShops()) {
                <p class="muted" style="margin: 10px 0 0; font-size: 13px">Add the shop when recording purchases (or scan a bill) to see this breakdown.</p>
              }
            </div>

            <div class="card c-6">
              <div class="card-head"><div><h3>Top items</h3><small>Where most money went</small></div></div>
              @for (t of top(); track t.item.id; let i = $index) {
                <div class="rank-row" (click)="openItem(t.item.id)">
                  <div class="rank-top">
                    <span><small style="width: 16px">{{ i + 1 }}</small> {{ emoji(t.item.category) }} {{ t.item.name }}</span>
                    <b>{{ store.fmt(t.total, 0) }}</b>
                  </div>
                  <div class="bar"><i [style.width.%]="(t.total / topMax()) * 100"></i></div>
                </div>
              }
            </div>
          </div>
        }

        <div class="bento" style="margin-top: var(--gap)">
          <div class="card c-8">
            <div class="card-head">
              <div><h3>12-month view</h3><small>Monthly totals</small></div>
              <span class="pill">avg {{ store.fmtCompact(yearAvg()) }}</span>
            </div>
            <app-chart [config]="yearCfg()" [height]="230"></app-chart>
          </div>

          <div class="card c-4">
            <div class="card-head"><div><h3>Biggest price moves</h3><small>Latest vs previous</small></div></div>
            @if (movers().length) {
              <div class="plain-rows">
                @for (m of movers(); track m.item.id) {
                  <div class="row" (click)="openItem(m.item.id)">
                    <div class="avatar sm">{{ emoji(m.item.category) }}</div>
                    <div class="row-main">
                      <b>{{ m.item.name }}</b>
                      <span>{{ store.fmt(m.prev) }} → {{ store.fmt(m.last) }}</span>
                    </div>
                    <span class="delta" [class.up]="m.pct > 0" [class.down]="m.pct < 0">
                      <ion-icon [name]="m.pct > 0 ? 'arrow-up-outline' : 'arrow-down-outline'"></ion-icon>{{ abs(m.pct).toFixed(0) }}%
                    </span>
                  </div>
                }
              </div>
            } @else {
              <p class="muted" style="margin: 0">Buy an item twice to see price changes.</p>
            }
          </div>
        </div>
      </div>
    </ion-content>
  `,
})
export class InsightsPage {
  store = inject(StoreService);
  theme = inject(ThemeService);
  private router = inject(Router);

  emoji = categoryEmoji;
  abs = Math.abs;

  ym = signal(monthKey());
  label = computed(() => monthLabel(this.ym()));
  isCurrent = computed(() => this.ym() >= monthKey());

  month = computed(() => this.store.purchases().filter((p) => p.ym === this.ym()));
  spend = computed(() => sumMonth(this.store.purchases(), this.ym()));
  prev = computed(() => sumMonth(this.store.purchases(), shiftMonth(this.ym(), -1)));
  delta = computed(() => (this.prev() > 0 ? ((this.spend() - this.prev()) / this.prev()) * 100 : null));
  count = computed(() => this.month().length);
  avgBasket = computed(() => (this.count() ? this.spend() / this.count() : 0));
  fc = computed(() => forecast(this.spend(), this.ym()));

  daily = computed(() => dailySeries(this.store.purchases(), this.ym()));
  busiest = computed(() => {
    const d = this.daily();
    const max = Math.max(...d, 0);
    if (max <= 0) return { label: '—', amount: 0 };
    const day = d.indexOf(max) + 1;
    return { label: `${monthLabel(this.ym(), true)} ${day}`, amount: max };
  });

  cats = computed(() => categoryTotals(this.store.purchases(), this.ym()));
  shops = computed(() => storeTotals(this.store.purchases(), this.ym()).slice(0, 6));
  hasShops = computed(() => this.shops().some((s) => s.name !== 'Unspecified'));
  top = computed(() => topItems(this.store.purchases(), this.ym(), 6));
  topMax = computed(() => Math.max(...this.top().map((t) => t.total), 1));
  movers = computed(() => priceMovers(this.store.items()).slice(0, 6));

  series12 = computed(() => monthlySeries(this.store.purchases(), monthKey(), 12));
  yearAvg = computed(() => {
    const s = this.series12().filter((x) => x.total > 0);
    return s.length ? s.reduce((a, b) => a + b.total, 0) / s.length : 0;
  });
  bestMonth = computed(() => {
    const s = this.series12().filter((x) => x.total > 0);
    if (!s.length) return { label: '—' };
    const min = s.reduce((a, b) => (b.total < a.total ? b : a));
    return { label: monthLabel(min.ym, true) };
  });

  dailyCfg = computed(() => {
    const n = daysInMonth(this.ym());
    return barChart(
      Array.from({ length: n }, (_, i) => String(i + 1)),
      this.daily(),
      this.theme.chart(),
      this.store.fmtCompact,
      false,
    );
  });

  donutCfg = computed(() => {
    const c = this.cats();
    return doughnutChart(
      c.map((x) => x.name),
      c.map((x) => x.total),
      this.theme.chart(),
      this.store.fmtCompact,
    );
  });

  yearCfg = computed(() => {
    const s = this.series12();
    return areaChart(
      s.map((x) => monthLabel(x.ym, true)),
      s.map((x) => x.total),
      this.theme.chart(),
      this.store.fmtCompact,
    );
  });

  step(d: number) {
    const next = shiftMonth(this.ym(), d);
    if (next > monthKey()) return;
    this.ym.set(next);
  }

  ionViewWillEnter() {
    if (this.ym() > monthKey()) this.ym.set(monthKey());
  }

  openItem(id: string) {
    void this.router.navigate(['/tabs/item', id]);
  }

  openShop(name: string) {
    if (name === 'Unspecified') return;
    void this.router.navigate(['/tabs/list'], { queryParams: { q: name } });
  }

  openCategory(name: string) {
    void this.router.navigate(['/tabs/list'], { queryParams: { cat: name } });
  }
}
