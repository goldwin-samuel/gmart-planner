import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import {
  Purchase,
  cashflow,
  incomeBySource,
  monthKey,
  monthLabel,
  shiftMonth,
} from '../../core/analytics';
import { FeedbackService } from '../../core/feedback.service';
import { FileService } from '../../core/file.service';
import { LayoutService } from '../../core/layout.service';
import { HistoryEntry, Income, Item } from '../../core/models';
import { StoreService } from '../../core/store.service';
import { ThemeService } from '../../core/theme.service';
import { categoryEmoji, prettyDate } from '../../core/utils';
import { ModalsService } from '../../modals/modals.service';
import { ChartComponent } from '../../shared/chart.component';
import { balanceChart, doughnutChart, groupedBarChart } from '../../shared/charts';

interface Tx {
  kind: 'in' | 'out';
  date: string;
  title: string;
  sub: string;
  amount: number;
  emoji: string;
  income?: Income;
  item?: Item;
  entry?: HistoryEntry;
}

type Filter = 'all' | 'in' | 'out';

@Component({
  selector: 'app-money',
  standalone: true,
  imports: [IonContent, IonIcon, ChartComponent],
  template: `
    <ion-content [fullscreen]="true">
      <div class="wrap">
        <div class="page-head h-row">
          <div>
            <div class="eyebrow">Cash flow</div>
            <h1 class="title">Money</h1>
          </div>
          <div class="head-actions">
            <div class="stepper">
              <button class="icon-btn flat" (click)="step(-1)" aria-label="Previous month"><ion-icon name="chevron-back"></ion-icon></button>
              <span class="lbl">{{ label() }}</span>
              <button class="icon-btn flat" [disabled]="isCurrent()" [style.opacity]="isCurrent() ? 0.35 : 1" (click)="step(1)" aria-label="Next month">
                <ion-icon name="chevron-forward"></ion-icon>
              </button>
            </div>
            <button class="btn-ghost sm d-only" (click)="scan()"><ion-icon name="camera-outline"></ion-icon> Scan bill</button>
            <button class="btn-primary sm" (click)="addIncome()"><ion-icon name="add"></ion-icon> Income</button>
          </div>
        </div>

        <!-- ============ headline stats ============ -->
        <div class="tiles four">
          <div class="tile t-in">
            <small>Income</small>
            <b>{{ store.fmt(cur().income, 0) }}</b>
            <div class="sub">{{ deltaText(cur().income, prev().income, true) }}</div>
          </div>
          <div class="tile t-out">
            <small>Expenses</small>
            <b>{{ store.fmt(cur().expense, 0) }}</b>
            <div class="sub">{{ deltaText(cur().expense, prev().expense, false) }}</div>
          </div>
          <div class="tile">
            <small>Balance this month</small>
            <b [class.pos]="cur().net > 0" [class.neg]="cur().net < 0">{{ cur().net > 0 ? '+' : '' }}{{ store.fmt(cur().net, 0) }}</b>
            <div class="sub">Running total {{ store.fmt(cur().balance, 0) }}</div>
          </div>
          <div class="tile">
            <small>Savings rate</small>
            <b [class.pos]="(rate() ?? 0) > 0" [class.neg]="(rate() ?? 0) < 0">{{ rate() === null ? '—' : rate()!.toFixed(0) + '%' }}</b>
            <div class="sub">{{ rate() === null ? 'Add income to see this' : rate()! >= 20 ? 'Healthy — keep going' : rate()! >= 0 ? 'Room to save more' : 'Spending exceeds income' }}</div>
          </div>
        </div>

        <div class="bento">
          <!-- income vs expenses -->
          <div class="card c-8">
            <div class="card-head">
              <div><h3>Income vs expenses</h3><small>Month by month</small></div>
              <div class="seg sm">
                <button [class.on]="span() === 6" (click)="span.set(6)">6M</button>
                <button [class.on]="span() === 12" (click)="span.set(12)">12M</button>
              </div>
            </div>
            <app-chart [config]="flowCfg()" [height]="260"></app-chart>
          </div>

          <!-- where income went -->
          <div class="card c-4">
            <div class="card-head"><div><h3>Where income went</h3><small>{{ label() }}</small></div></div>
            @if (cur().income > 0 || cur().expense > 0) {
              <div class="donut-wrap stack">
                <div class="donut" style="position: relative">
                  <app-chart [config]="splitCfg()" [height]="170"></app-chart>
                  <div class="donut-center">
                    <b>{{ rate() === null ? '—' : rate()! < 0 ? '<0%' : rate()!.toFixed(0) + '%' }}</b>
                    <small>saved</small>
                  </div>
                </div>
                <div class="legend">
                  <div class="lg"><span class="dot" [style.background]="c.out"></span>Spent<em>{{ store.fmt(cur().expense, 0) }}</em></div>
                  <div class="lg"><span class="dot" [style.background]="c.in"></span>Saved<em>{{ store.fmt(cur().net > 0 ? cur().net : 0, 0) }}</em></div>
                  @if (cur().net < 0) {
                    <div class="lg over"><ion-icon name="alert-circle-outline"></ion-icon>Overspent by<em>{{ store.fmt(-cur().net, 0) }}</em></div>
                  }
                </div>
              </div>
            } @else {
              <p class="muted" style="margin: 0">Nothing recorded for {{ label() }} yet.</p>
            }
          </div>

          <!-- balance trend -->
          <div class="card c-8">
            <div class="card-head">
              <div><h3>Balance trend</h3><small>Income minus expenses, accumulated</small></div>
              <span class="pill" [class.warn]="cur().balance < 0">{{ store.fmtCompact(cur().balance) }}</span>
            </div>
            <app-chart [config]="balCfg()" [height]="230"></app-chart>
          </div>

          <!-- highlights -->
          <div class="card c-4">
            <div class="card-head"><div><h3>Highlights</h3><small>Last 12 months</small></div></div>
            <div class="stat-rows">
              <div><span>Avg monthly income</span><b>{{ store.fmt(avgIncome(), 0) }}</b></div>
              <div><span>Avg monthly spend</span><b>{{ store.fmt(avgSpend(), 0) }}</b></div>
              <div><span>Best month</span><b>{{ best().label }}<em>{{ best().net === null ? '' : store.fmtCompact(best().net!) }}</em></b></div>
              <div><span>Biggest income</span><b>{{ store.fmt(bigIn()?.amount ?? 0, 0) }}<em>{{ bigIn()?.source ?? '' }}</em></b></div>
              <div><span>Biggest expense</span><b>{{ store.fmt(bigOut()?.entry?.totalAmount ?? 0, 0) }}<em>{{ bigOut()?.item?.name ?? '' }}</em></b></div>
            </div>
            @if (sources().length) {
              <div class="src-bars">
                <small class="lbl">Income sources · {{ label() }}</small>
                @for (s of sources().slice(0, 4); track s.name) {
                  <div class="rank-row">
                    <div class="rank-top"><span>{{ s.name }}</span><b>{{ store.fmt(s.total, 0) }}</b></div>
                    <div class="bar good"><i [style.width.%]="s.pct"></i></div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- balance sheet -->
          <div class="card c-12">
            <div class="card-head">
              <div><h3>Balance sheet</h3><small>Income, expenses and running balance by month</small></div>
              <button class="btn-ghost sm" (click)="exportSheet()"><ion-icon name="download-outline"></ion-icon> CSV</button>
            </div>
            <div class="bs-wrap">
              <table class="bs">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th class="r">Income</th>
                    <th class="r">Expenses</th>
                    <th class="r">Net</th>
                    <th class="r d-only">Balance</th>
                    <th class="r d-only">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of sheetRows(); track r.ym) {
                    <tr [class.sel]="r.ym === ym()" (click)="ym.set(r.ym)">
                      <td>{{ fullLabel(r.ym) }}</td>
                      <td class="r" [class.in]="r.income > 0">{{ r.income ? amt(r.income) : '—' }}</td>
                      <td class="r">{{ r.expense ? amt(r.expense) : '—' }}</td>
                      <td class="r" [class.pos]="r.net > 0" [class.neg]="r.net < 0">{{ r.income || r.expense ? (r.net > 0 ? '+' : '') + amt(r.net) : '—' }}</td>
                      <td class="r d-only" [class.neg]="r.balance < 0">{{ store.fmt(r.balance, 0) }}</td>
                      <td class="r d-only">{{ r.income > 0 ? ((r.net / r.income) * 100).toFixed(0) + '%' : '—' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td class="r in">{{ amt(totals().income) }}</td>
                    <td class="r">{{ amt(totals().expense) }}</td>
                    <td class="r" [class.pos]="totals().net > 0" [class.neg]="totals().net < 0">{{ totals().net > 0 ? '+' : '' }}{{ amt(totals().net) }}</td>
                    <td class="r d-only"></td>
                    <td class="r d-only"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- ledger -->
          <div class="card c-12">
            <div class="card-head">
              <div><h3>Transactions</h3><small>{{ label() }} · {{ txs().length }} entr{{ txs().length === 1 ? 'y' : 'ies' }}</small></div>
              <div class="seg sm">
                <button [class.on]="filter() === 'all'" (click)="filter.set('all')">All</button>
                <button [class.on]="filter() === 'in'" (click)="filter.set('in')">Income</button>
                <button [class.on]="filter() === 'out'" (click)="filter.set('out')">Expenses</button>
              </div>
            </div>

            @if (txs().length) {
              <div class="ledger">
                @for (t of txs(); track $index) {
                  <div class="tx" [class.in]="t.kind === 'in'">
                    <div class="tx-ico" [class.in]="t.kind === 'in'">{{ t.kind === 'in' ? '' : t.emoji }}@if (t.kind === 'in') { <ion-icon name="arrow-down-outline"></ion-icon> }</div>
                    <div class="tx-main" (click)="edit(t)">
                      <b>{{ t.title }}</b>
                      <span>{{ t.sub }}</span>
                    </div>
                    <div class="tx-amt" [class.in]="t.kind === 'in'">{{ t.kind === 'in' ? '+' : '−' }}{{ store.fmt(t.amount) }}</div>
                    <div class="tx-act">
                      <button class="icon-btn flat" (click)="edit(t)" aria-label="Edit entry" title="Edit"><ion-icon name="create-outline"></ion-icon></button>
                      <button class="icon-btn flat" (click)="remove(t)" aria-label="Delete entry" title="Delete"><ion-icon name="trash-outline"></ion-icon></button>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="empty slim">
                <div class="empty-ico">🧾</div>
                <h3>No {{ filter() === 'in' ? 'income' : filter() === 'out' ? 'expenses' : 'transactions' }} in {{ label() }}</h3>
                <p>Record income with the button above, or scan a bill to add expenses in seconds.</p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap">
                  <button class="btn-primary sm" (click)="addIncome()"><ion-icon name="add"></ion-icon> Add income</button>
                  <button class="btn-ghost sm" (click)="scan()"><ion-icon name="camera-outline"></ion-icon> Scan bill</button>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </ion-content>
  `,
})
export class MoneyPage {
  store = inject(StoreService);
  theme = inject(ThemeService);
  private modals = inject(ModalsService);
  private fb = inject(FeedbackService);
  private files = inject(FileService);
  private layout = inject(LayoutService);

  ym = signal(monthKey());
  span = signal<6 | 12>(6);
  filter = signal<Filter>('all');

  label = computed(() => monthLabel(this.ym()));
  isCurrent = computed(() => this.ym() >= monthKey());
  fullLabel = (ym: string) => `${monthLabel(ym, true)} ${ym.slice(0, 4)}`;

  c = { in: '#059669', out: '#e11d48' };

  /** 12 months ending at the selected month. */
  rows = computed(() => cashflow(this.store.purchases(), this.store.income(), this.ym(), 12));
  cur = computed(() => this.rows()[11]);
  prev = computed(() => this.rows()[10]);
  /** Newest first, skipping the empty months before the first recorded entry. */
  sheetRows = computed(() => {
    const r = this.rows();
    const first = r.findIndex((x) => x.income > 0 || x.expense > 0);
    return r.slice(first < 0 ? r.length - 1 : first).reverse();
  });
  /** Compact amounts on phones so the table never needs sideways scrolling. */
  amt = (n: number) => (this.layout.isDesktop() ? this.store.fmt(n, 0) : this.store.fmtCompact(n));
  totals = computed(() => {
    const r = this.rows();
    const income = r.reduce((a, x) => a + x.income, 0);
    const expense = r.reduce((a, x) => a + x.expense, 0);
    return { income, expense, net: income - expense };
  });
  rate = computed(() => (this.cur().income > 0 ? (this.cur().net / this.cur().income) * 100 : null));

  active = computed(() => this.rows().filter((r) => r.income > 0 || r.expense > 0));
  avgIncome = computed(() => {
    const a = this.rows().filter((r) => r.income > 0);
    return a.length ? a.reduce((s, r) => s + r.income, 0) / a.length : 0;
  });
  avgSpend = computed(() => {
    const a = this.rows().filter((r) => r.expense > 0);
    return a.length ? a.reduce((s, r) => s + r.expense, 0) / a.length : 0;
  });
  best = computed(() => {
    const a = this.active();
    if (!a.length) return { label: '—', net: null as number | null };
    const b = a.reduce((x, y) => (y.net > x.net ? y : x));
    return { label: monthLabel(b.ym, true), net: b.net };
  });

  private inMonth = computed(() => this.store.income().filter((i) => i.date.startsWith(this.ym())));
  private outMonth = computed(() => this.store.purchases().filter((p) => p.ym === this.ym()));
  sources = computed(() => incomeBySource(this.store.income(), this.ym()));
  bigIn = computed(() => [...this.inMonth()].sort((a, b) => b.amount - a.amount)[0]);
  bigOut = computed<Purchase | undefined>(() => [...this.outMonth()].sort((a, b) => b.entry.totalAmount - a.entry.totalAmount)[0]);

  txs = computed<Tx[]>(() => {
    const f = this.filter();
    const out: Tx[] = [];
    if (f !== 'out') {
      for (const i of this.inMonth()) {
        out.push({ kind: 'in', date: i.date, title: i.source, sub: [prettyDate(i.date), i.note].filter(Boolean).join(' · '), amount: i.amount, emoji: '💰', income: i });
      }
    }
    if (f !== 'in') {
      for (const p of this.outMonth()) {
        const e = p.entry;
        out.push({
          kind: 'out',
          date: e.date,
          title: p.item.name,
          sub: [prettyDate(e.date), e.store, `${e.quantity} ${e.unit}`, e.note].filter(Boolean).join(' · '),
          amount: e.totalAmount,
          emoji: categoryEmoji(p.item.category),
          item: p.item,
          entry: e,
        });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  });

  flowCfg = computed(() => {
    const r = this.rows().slice(-this.span());
    return groupedBarChart(
      r.map((x) => monthLabel(x.ym, true)),
      [
        { name: 'Income', data: r.map((x) => x.income), color: this.c.in },
        { name: 'Expenses', data: r.map((x) => x.expense), color: this.c.out },
      ],
      this.theme.chart(),
      this.store.fmtCompact,
    );
  });

  splitCfg = computed(() => {
    const spent = this.cur().expense;
    const saved = Math.max(this.cur().net, 0);
    return doughnutChart(['Spent', 'Saved'], [spent, saved], { ...this.theme.chart(), palette: [this.c.out, this.c.in] }, this.store.fmtCompact);
  });

  balCfg = computed(() => {
    const r = this.rows();
    return balanceChart(
      r.map((x) => monthLabel(x.ym, true)),
      r.map((x) => x.balance),
      this.theme.chart(),
      this.store.fmtCompact,
      this.c.in,
      this.c.out,
    );
  });

  deltaText(now: number, before: number, upIsGood: boolean): string {
    if (!before) return now ? 'first month with data' : 'no data yet';
    const p = ((now - before) / before) * 100;
    if (Math.abs(p) < 0.5) return 'same as last month';
    void upIsGood;
    return `${p > 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}% vs last month`;
  }

  step(d: number) {
    const n = shiftMonth(this.ym(), d);
    if (n > monthKey()) return;
    this.ym.set(n);
  }

  ionViewWillEnter() {
    if (this.ym() > monthKey()) this.ym.set(monthKey());
  }

  addIncome() {
    this.fb.tap();
    void this.modals.income();
  }

  scan() {
    this.fb.tap();
    void this.modals.scan();
  }

  edit(t: Tx) {
    if (t.kind === 'in' && t.income) void this.modals.income(t.income);
    else if (t.item && t.entry) void this.modals.entry(t.item, t.entry);
  }

  async remove(t: Tx) {
    const label = t.kind === 'in' ? `${t.title} income` : t.title;
    const ok = await this.fb.confirm('Delete this entry?', `${label} · ${this.store.fmt(t.amount)} will be removed.`, 'Delete', true);
    if (!ok) return;
    if (t.kind === 'in' && t.income) this.store.deleteIncome(t.income.id);
    else if (t.item && t.entry) this.store.removePurchase(t.item.id, t.entry);
    this.fb.toast('Entry deleted');
  }

  async exportSheet() {
    const rows = [['Month', 'Income', 'Expenses', 'Net', 'Balance']];
    for (const r of this.rows()) rows.push([r.ym, r.income.toFixed(2), r.expense.toFixed(2), r.net.toFixed(2), r.balance.toFixed(2)]);
    await this.files.saveText(`gmart-balance-sheet-${this.ym()}.csv`, rows.map((r) => r.join(',')).join('\n'), 'text/csv');
  }
}
