import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { Purchase, cashflow, categoryTotals, forecast, monthKey, monthLabel, monthlySeries, priceMovers, sumAll, sumMonth, shiftMonth, topItems } from '../../core/analytics';
import { AuthService } from '../../core/auth.service';
import { ModalsService } from '../../modals/modals.service';
import { StoreService } from '../../core/store.service';
import { ThemeService } from '../../core/theme.service';
import { categoryEmoji, prettyDate, relativeDay } from '../../core/utils';
import { ChartComponent } from '../../shared/chart.component';
import { barChart, doughnutChart, groupedBarChart } from '../../shared/charts';

const C = 2 * Math.PI * 52;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [IonContent, IonIcon, IonRefresher, IonRefresherContent, ChartComponent],
  template: `
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="wrap">
        <div class="page-head h-row">
          <div>
            <div class="eyebrow">{{ dateLine }}</div>
            <h1 class="title">{{ greeting() }}, {{ auth.firstName() }}</h1>
          </div>
          <button class="icon-btn m-only" [class.spin]="store.sync() === 'syncing'" (click)="store.syncNow()" aria-label="Sync">
            <ion-icon [name]="syncIcon()"></ion-icon>
          </button>
          <button class="btn-ghost sm d-only" (click)="go('/tabs/list')"><ion-icon name="cart-outline"></ion-icon> Open shopping list</button>
        </div>

        @if (store.items().length === 0) {
          <div class="card empty">
            <div class="empty-ico">🛒</div>
            <h3>Start your first list</h3>
            <p>Add the items you buy every month, then record prices as you shop to unlock trends and budget insights.</p>
            <button class="btn-primary" (click)="addItem()"><ion-icon name="add"></ion-icon> Add an item</button>
          </div>
        } @else {
          <div class="bento">
            <!-- budget hero -->
            <section class="hero c-5 pop-in">
              <div class="hero-top">
                <span>{{ monthName() }} budget</span>
                <span class="badge-glass">{{ status().text }}</span>
              </div>
              <div class="hero-body">
                <div class="ring">
                  <svg viewBox="0 0 120 120">
                    <defs>
                      <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" style="stop-color: #fff"></stop>
                        <stop offset="1" style="stop-color: var(--accent-2)"></stop>
                      </linearGradient>
                    </defs>
                    <circle class="bg" cx="60" cy="60" r="52"></circle>
                    <circle class="fg" cx="60" cy="60" r="52" [attr.stroke-dasharray]="dash()"></circle>
                  </svg>
                  <div class="mid">
                    <b>{{ pctText() }}</b>
                    <span>used</span>
                  </div>
                </div>
                <div class="hero-stats">
                  <div><small>Spent</small><b>{{ store.fmt(monthSpend(), 0) }}</b></div>
                  <div><small>{{ remaining() >= 0 ? 'Remaining' : 'Over by' }}</small><b>{{ store.fmt(absRemaining(), 0) }}</b></div>
                  <div><small>Projected</small><b>{{ store.fmt(fc().projected, 0) }}</b></div>
                </div>
              </div>
              <div class="hero-foot">
                <span>Target {{ store.fmt(target(), 0) }} · {{ fc().daysLeft }} days left</span>
                <button class="link" (click)="go('/tabs/more')">Edit</button>
              </div>
            </section>

            <!-- KPI tiles -->
            <div class="tiles snap c-7">
              <div class="tile">
                <div class="tile-ico"><ion-icon name="wallet-outline"></ion-icon></div>
                <small>All-time spend</small>
                <b>{{ store.fmtCompact(totalSpend()) }}</b>
                <div class="sub">{{ store.purchases().length }} purchases</div>
              </div>
              <div class="tile">
                <div class="tile-ico"><ion-icon [name]="(delta() ?? 0) > 0 ? 'trending-up-outline' : 'trending-down-outline'"></ion-icon></div>
                <small>vs last month</small>
                <b>{{ deltaText() }}</b>
                <div class="sub">{{ store.fmt(prevSpend(), 0) }} last month</div>
              </div>
              <div class="tile">
                <div class="tile-ico"><ion-icon name="calendar-outline"></ion-icon></div>
                <small>Daily average</small>
                <b>{{ store.fmt(fc().avgDaily, 0) }}</b>
                <div class="sub">{{ fc().daysLeft }} days left</div>
              </div>
              <div class="tile">
                <div class="tile-ico"><ion-icon name="cart-outline"></ion-icon></div>
                <small>On your list</small>
                <b>{{ activeCount() }}</b>
                <div class="sub">{{ store.prefs().cart.length }} in cart</div>
              </div>
            </div>

            <!-- trend -->
            <div class="card c-8">
              <div class="card-head">
                <div><h3>Spending trend</h3><small>Last 6 months</small></div>
                <span class="pill">{{ store.fmtCompact(sixMonthTotal()) }} total</span>
              </div>
              <app-chart [config]="trendCfg()" [height]="230"></app-chart>
            </div>

            <!-- categories -->
            <div class="card c-4">
              <div class="card-head">
                <div><h3>Where it goes</h3><small>{{ monthName() }} by category</small></div>
                <button class="link" (click)="go('/tabs/insights')">Details</button>
              </div>
              @if (cats().length) {
                <div class="donut-wrap stack">
                  <div class="donut" style="position: relative">
                    <app-chart [config]="donutCfg()" [height]="170"></app-chart>
                    <div class="donut-center"><b>{{ store.fmtCompact(monthSpend()) }}</b><small>this month</small></div>
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
              } @else {
                <p class="muted" style="margin: 0">No purchases recorded this month yet.</p>
              }
            </div>

            <!-- cash flow -->
            <div class="card c-8">
              <div class="card-head">
                <div><h3>Cash flow</h3><small>Income vs expenses, last 6 months</small></div>
                <button class="link" (click)="go('/tabs/money')">Balance sheet</button>
              </div>
              <div class="cf-strip">
                <div><small>Income</small><b class="pos">{{ store.fmt(flowNow().income, 0) }}</b></div>
                <div><small>Expenses</small><b>{{ store.fmt(flowNow().expense, 0) }}</b></div>
                <div><small>Balance</small><b [class.pos]="flowNow().net > 0" [class.neg]="flowNow().net < 0">{{ flowNow().net > 0 ? '+' : '' }}{{ store.fmt(flowNow().net, 0) }}</b></div>
              </div>
              @if (store.income().length) {
                <app-chart [config]="flowCfg()" [height]="200"></app-chart>
              } @else {
                <div class="empty slim">
                  <div class="empty-ico">💰</div>
                  <h3>Track your income too</h3>
                  <p>Add salary or other income to see your balance, savings rate and monthly balance sheet.</p>
                  <button class="btn-primary sm" (click)="addIncome()"><ion-icon name="add"></ion-icon> Record income</button>
                </div>
              }
            </div>

            <!-- scan CTA -->
            <div class="card c-4 cta-card">
              <div class="cta-ico"><ion-icon name="camera-outline"></ion-icon></div>
              <h3>Scan a bill</h3>
              <p>Snap a photo of your receipt. Items, prices and the shop are read for you and sorted into categories — you just approve.</p>
              <button class="btn-primary block" (click)="scan()"><ion-icon name="scan-outline"></ion-icon> Scan now</button>
              <button class="btn-ghost block" style="margin-top: 10px" (click)="addIncome()"><ion-icon name="add"></ion-icon> Record income</button>
            </div>

            <!-- top items -->
            <div class="card c-4">
              <div class="card-head"><div><h3>Top items</h3><small>Biggest spend this month</small></div></div>
              @if (top().length) {
                @for (t of top(); track t.item.id) {
                  <div class="rank-row" (click)="openItem(t.item.id)">
                    <div class="rank-top">
                      <span>{{ emoji(t.item.category) }} {{ t.item.name }}</span>
                      <b>{{ store.fmt(t.total, 0) }}</b>
                    </div>
                    <div class="bar"><i [style.width.%]="(t.total / topMax()) * 100"></i></div>
                  </div>
                }
              } @else {
                <p class="muted" style="margin: 0">Nothing recorded yet this month.</p>
              }
            </div>

            <!-- price alerts -->
            <div class="card c-4">
              <div class="card-head"><div><h3>Price alerts</h3><small>Latest change per item</small></div></div>
              @if (movers().length) {
                <div class="plain-rows">
                  @for (m of movers(); track m.item.id) {
                    <div class="row" (click)="openItem(m.item.id)">
                      <div class="avatar sm">{{ emoji(m.item.category) }}</div>
                      <div class="row-main">
                        <b>{{ m.item.name }}</b>
                        <span>{{ store.fmt(m.prev) }} → {{ store.fmt(m.last) }} / {{ m.unit }}</span>
                      </div>
                      <span class="delta" [class.up]="m.pct > 0" [class.down]="m.pct < 0">
                        <ion-icon [name]="m.pct > 0 ? 'arrow-up-outline' : 'arrow-down-outline'"></ion-icon>
                        {{ abs(m.pct).toFixed(0) }}%
                      </span>
                    </div>
                  }
                </div>
              } @else {
                <p class="muted" style="margin: 0">Buy an item twice to see how its price moves.</p>
              }
            </div>

            <!-- recent -->
            <div class="card c-4">
              <div class="card-head">
                <div><h3>Recent purchases</h3><small>Latest activity</small></div>
                <button class="link" (click)="go('/tabs/list')">View all</button>
              </div>
              @if (recent().length) {
                <div class="plain-rows">
                  @for (p of recent(); track $index) {
                    <div class="row" (click)="openItem(p.item.id)">
                      <div class="avatar sm">{{ emoji(p.item.category) }}</div>
                      <div class="row-main">
                        <b>{{ p.item.name }}</b>
                        <span>{{ p.entry.quantity }} {{ p.entry.unit }} · {{ rel(p.entry.date) }}{{ p.entry.store ? ' · ' + p.entry.store : '' }}{{ p.entry.note ? ' · ' + p.entry.note : '' }}</span>
                      </div>
                      <div class="row-end"><b>{{ store.fmt(p.entry.totalAmount) }}</b></div>
                      <button class="ibtn" (click)="$event.stopPropagation(); editEntry(p)" title="Edit" aria-label="Edit purchase"><ion-icon name="create-outline"></ion-icon></button>
                    </div>
                  }
                </div>
              } @else {
                <p class="muted" style="margin: 0">Record a purchase to see it here.</p>
              }
            </div>
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class DashboardPage {
  store = inject(StoreService);
  theme = inject(ThemeService);
  auth = inject(AuthService);
  private router = inject(Router);
  private modals = inject(ModalsService);

  emoji = categoryEmoji;
  abs = Math.abs;
  rel = relativeDay;
  pretty = prettyDate;

  ym = signal(monthKey());
  dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

  monthName = computed(() => monthLabel(this.ym()).split(' ')[0]);
  monthSpend = computed(() => sumMonth(this.store.purchases(), this.ym()));
  prevSpend = computed(() => sumMonth(this.store.purchases(), shiftMonth(this.ym(), -1)));
  totalSpend = computed(() => sumAll(this.store.purchases()));
  target = computed(() => this.store.settings().monthlyTarget);
  remaining = computed(() => this.target() - this.monthSpend());
  absRemaining = computed(() => Math.abs(this.remaining()));
  pct = computed(() => (this.target() > 0 ? (this.monthSpend() / this.target()) * 100 : 0));
  pctText = computed(() => `${Math.round(this.pct())}%`);
  dash = computed(() => `${(Math.min(this.pct(), 100) / 100) * C} ${C}`);
  fc = computed(() => forecast(this.monthSpend(), this.ym()));
  sixMonthTotal = computed(() => monthlySeries(this.store.purchases(), this.ym(), 6).reduce((a, b) => a + b.total, 0));
  activeCount = computed(() => this.store.items().filter((i) => i.active).length);

  delta = computed(() => {
    const p = this.prevSpend();
    return p > 0 ? ((this.monthSpend() - p) / p) * 100 : null;
  });
  deltaText = computed(() => {
    const d = this.delta();
    return d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(0)}%`;
  });

  status = computed(() => {
    const p = this.pct();
    if (this.monthSpend() === 0) return { text: 'No spend yet' };
    if (p > 100) return { text: 'Over budget' };
    if (this.fc().projected > this.target()) return { text: 'Pace is high' };
    return { text: 'On track' };
  });

  cats = computed(() => categoryTotals(this.store.purchases(), this.ym()));
  top = computed(() => topItems(this.store.purchases(), this.ym(), 5));
  topMax = computed(() => Math.max(...this.top().map((t) => t.total), 1));
  movers = computed(() => priceMovers(this.store.items()).slice(0, 4));
  recent = computed(() =>
    [...this.store.purchases()]
      .sort((a, b) => b.entry.date.localeCompare(a.entry.date))
      .slice(0, 5),
  );

  flow = computed(() => cashflow(this.store.purchases(), this.store.income(), this.ym(), 6));
  flowNow = computed(() => this.flow()[5]);
  flowCfg = computed(() => {
    const r = this.flow();
    return groupedBarChart(
      r.map((x) => monthLabel(x.ym, true)),
      [
        { name: 'Income', data: r.map((x) => x.income), color: '#059669' },
        { name: 'Expenses', data: r.map((x) => x.expense), color: '#e11d48' },
      ],
      this.theme.chart(),
      this.store.fmtCompact,
    );
  });

  addIncome() {
    void this.modals.income();
  }

  scan() {
    void this.modals.scan();
  }

  editEntry(p: Purchase) {
    void this.modals.entry(p.item, p.entry);
  }

  trendCfg = computed(() => {
    const s = monthlySeries(this.store.purchases(), this.ym(), 6);
    return barChart(
      s.map((x) => monthLabel(x.ym, true)),
      s.map((x) => x.total),
      this.theme.chart(),
      this.store.fmtCompact,
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

  greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  syncIcon() {
    const s = this.store.sync();
    return s === 'error' ? 'cloud-offline-outline' : s === 'syncing' ? 'sync-outline' : 'cloud-done-outline';
  }

  ionViewWillEnter() {
    this.ym.set(monthKey());
  }

  async refresh(ev: Event) {
    const ok = await this.store.refresh();
    if (!ok && this.store.sync() === 'error') void 0;
    (ev as CustomEvent & { detail: { complete: () => void } }).detail.complete();
  }

  addItem() {
    void this.modals.addItem();
  }

  go(path: string) {
    void this.router.navigateByUrl(path);
  }

  openItem(id: string) {
    void this.router.navigate(['/tabs/item', id]);
  }
}
