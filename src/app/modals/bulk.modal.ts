import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { BulkRow, MAX_ROWS, buildTemplate, parseWorkbook } from '../core/bulk';
import { categorize, cleanName } from '../core/categorize';
import { FeedbackService } from '../core/feedback.service';
import { FileService } from '../core/file.service';
import { Item, UNITS } from '../core/models';
import { StoreService } from '../core/store.service';
import { categoryEmoji, todayISO } from '../core/utils';

interface Line {
  key: number;
  on: boolean;
  src: number; // spreadsheet row
  date: string;
  name: string;
  category: string;
  qty: number | null;
  unit: string;
  amount: number | null;
  shop: string;
  note: string;
  matchId?: string;
  locked: boolean;
  pinned?: boolean;
  warns: string[];
}

type Step = 'pick' | 'reading' | 'review';

@Component({
  selector: 'app-bulk-modal',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon],
  template: `
    <ion-content class="sheet-content">
      <div class="sheet-body scan">
        <div class="sheet-title">
          <div>
            <div class="eyebrow">Bulk upload</div>
            <h2>{{ step() === 'review' ? 'Check & approve' : 'Upload purchases' }}</h2>
          </div>
          <button class="icon-btn" (click)="cancel()" aria-label="Close"><ion-icon name="close-outline"></ion-icon></button>
        </div>

        @if (step() !== 'review') {
          <div class="bulk-steps">
            <div class="bs"><i>1</i><span><b>Download</b> the Excel template</span></div>
            <div class="bs"><i>2</i><span><b>Fill</b> one row per item</span></div>
            <div class="bs"><i>3</i><span><b>Upload</b> it, then review &amp; approve</span></div>
          </div>
        }

        @if (step() === 'pick') {
          <div class="scan-pick">
            <button class="pick-card" (click)="template()">
              <ion-icon name="download-outline"></ion-icon>
              <b>Download template</b>
              <small>Excel (.xlsx) with a guide sheet</small>
            </button>
            <button class="pick-card primary" (click)="file.click()">
              <ion-icon name="cloud-upload-outline"></ion-icon>
              <b>Upload filled file</b>
              <small>.xlsx, .xls or .csv</small>
            </button>
          </div>
          @if (error()) {
            <div class="scan-err"><ion-icon name="alert-circle-outline"></ion-icon><span>{{ error() }}</span></div>
          }
          <p class="muted" style="font-size: 12.5px; line-height: 1.5; margin: 14px 0 0">
            Only <b>Item</b> and <b>Amount</b> are required. Missing dates become today, and categories are guessed for you. Up to {{ max }} rows per file.
          </p>
          <input #file type="file" hidden accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" (change)="onFile($event)" />
        }

        @if (step() === 'reading') {
          <div class="scanning"><b>Reading {{ fileName() }}…</b><small>Checking rows and categories</small></div>
        }

        @if (step() === 'review') {
          <div class="bulk-sum">
            <div><b>{{ lines().length }}</b><small>rows read</small></div>
            <div class="good"><b>{{ readyCount() }}</b><small>ready</small></div>
            <div [class.bad]="problemCount() > 0"><b>{{ problemCount() }}</b><small>need attention</small></div>
          </div>

          @if (notice()) {
            <div class="scan-note"><ion-icon name="information-circle-outline"></ion-icon><span>{{ notice() }}</span></div>
          }

          <div class="bulk-tools">
            <button class="chip" [class.on]="!onlyProblems()" (click)="onlyProblems.set(false)">All</button>
            <button class="chip" [class.on]="onlyProblems()" (click)="onlyProblems.set(true)" [disabled]="!problemCount()">Needs attention ({{ problemCount() }})</button>
            <span class="grow"></span>
            <button class="btn-ghost sm" (click)="setAll(!allOn())">{{ allOn() ? 'Deselect all' : 'Select all' }}</button>
          </div>

          <datalist id="gm-shops-b">@for (s of store.shops(); track s) { <option [value]="s"></option> }</datalist>

          <div class="rv-list">
            @for (l of shown(); track l.key) {
              <div class="rv-line" [class.off]="!l.on" [class.bad]="l.on && problems(l).length">
                <div class="rv-top">
                  <button class="check" [class.on]="l.on" (click)="l.on = !l.on" [attr.aria-label]="l.on ? 'Skip this row' : 'Include this row'">
                    @if (l.on) { <ion-icon name="checkmark"></ion-icon> }
                  </button>
                  <input class="inp name" [(ngModel)]="l.name" (change)="rematch(l)" placeholder="Item name" autocomplete="off" />
                  <button class="icon-btn flat" (click)="remove(l)" aria-label="Remove row"><ion-icon name="trash-outline"></ion-icon></button>
                </div>
                <div class="rv-grid">
                  <div class="field">
                    <label>Category</label>
                    <select class="inp" [(ngModel)]="l.category" (ngModelChange)="l.locked = true" [disabled]="!!l.matchId">
                      @for (c of cats(); track c) { <option [value]="c">{{ emoji(c) }} {{ c }}</option> }
                    </select>
                  </div>
                  <div class="field">
                    <label>Qty</label>
                    <input class="inp" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="l.qty" />
                  </div>
                  <div class="field">
                    <label>Unit</label>
                    <select class="inp" [(ngModel)]="l.unit">
                      @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                    </select>
                  </div>
                  <div class="field">
                    <label>Amount</label>
                    <input class="inp" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="l.amount" />
                  </div>
                </div>
                <div class="rv-grid g3">
                  <div class="field">
                    <label>Date</label>
                    <input class="inp" type="date" [(ngModel)]="l.date" [max]="today" />
                  </div>
                  <div class="field">
                    <label>Shop</label>
                    <input class="inp" [(ngModel)]="l.shop" list="gm-shops-b" placeholder="Optional" autocomplete="off" />
                  </div>
                  <div class="field">
                    <label>Notes</label>
                    <input class="inp" [(ngModel)]="l.note" placeholder="Optional" autocomplete="off" />
                  </div>
                </div>
                <div class="field link-field" style="margin: 10px 0 0">
                  <label>Add to item</label>
                  <select class="inp" [ngModel]="l.matchId ?? ''" (ngModelChange)="link(l, $event)">
                    <option value="">➕ New item{{ l.name.trim() ? ' “' + l.name.trim() + '”' : '' }}</option>
                    @if (suggest(l).length) {
                      <optgroup label="Suggested matches">
                        @for (i of suggest(l); track i.id) { <option [value]="i.id">{{ emoji(i.category) }} {{ i.name }}</option> }
                      </optgroup>
                    }
                    <optgroup label="All items">
                      @for (i of sortedItems(); track i.id) { <option [value]="i.id">{{ emoji(i.category) }} {{ i.name }} · {{ i.category }}</option> }
                    </optgroup>
                  </select>
                </div>
                @for (w of l.warns; track w) {
                  <span class="tag warn"><ion-icon name="warning-outline"></ion-icon> {{ w }}</span>
                }
                @for (p of problems(l); track p) {
                  <span class="tag bad"><ion-icon name="alert-circle-outline"></ion-icon> {{ p }}</span>
                }
                @if (l.matchId) {
                  <span class="tag ok"><ion-icon name="checkmark-circle"></ion-icon> Will be added to “{{ itemName(l.matchId) }}”</span>
                } @else if (l.on && l.name.trim()) {
                  <span class="tag"><ion-icon name="sparkles-outline"></ion-icon> New item will be created</span>
                }
                <span class="tag src">Sheet row {{ l.src }}</span>
              </div>
            }
            @if (!shown().length) {
              <p class="muted" style="text-align: center; padding: 18px 0">Nothing to show here.</p>
            }
          </div>

          <button class="btn-ghost block sm" style="margin: 4px 0 14px" (click)="addLine()"><ion-icon name="add"></ion-icon> Add another row</button>

          <div class="rv-total">
            <div>
              <small>{{ readyCount() }} row{{ readyCount() === 1 ? '' : 's' }} selected</small>
              <b>{{ store.fmt(sum()) }}</b>
            </div>
          </div>

          <button class="btn-primary block" [disabled]="!readyCount()" (click)="approve()">
            <ion-icon name="checkmark-done"></ion-icon> Approve &amp; add {{ readyCount() }} purchase{{ readyCount() === 1 ? '' : 's' }}
          </button>
          @if (problemCount()) {
            <p class="muted" style="font-size: 12px; text-align: center; margin: 8px 0 0">Rows that still need attention are skipped when you approve.</p>
          }
          <button class="btn-ghost block" style="margin-top: 10px" (click)="restart()">Choose a different file</button>
        }
      </div>
    </ion-content>
  `,
})
export class BulkModal {
  store = inject(StoreService);
  private fb = inject(FeedbackService);
  private files = inject(FileService);
  private mc = inject(ModalController);

  @ViewChild('file') fileInput?: ElementRef<HTMLInputElement>;

  units = UNITS;
  max = MAX_ROWS;
  today = todayISO();
  emoji = categoryEmoji;

  step = signal<Step>('pick');
  error = signal('');
  notice = signal('');
  fileName = signal('');
  lines = signal<Line[]>([]);
  onlyProblems = signal(false);
  private seq = 1;

  cats = () => this.store.allCategories();
  sortedItems = computed(() => [...this.store.items()].sort((a, b) => a.name.localeCompare(b.name)));
  itemName = (id: string) => this.store.items().find((i) => i.id === id)?.name ?? '';

  /** Hard problems = row can't be added until fixed. */
  problems(l: Line): string[] {
    const p: string[] = [];
    if (!l.name.trim()) p.push('Enter an item name');
    if (!(Number(l.amount) > 0)) p.push('Enter the amount');
    if (!(Number(l.qty) > 0)) p.push('Quantity must be more than 0');
    if (!l.date) p.push('Pick a date');
    return p;
  }

  private valid = (l: Line) => l.on && this.problems(l).length === 0;
  // plain methods (not computed): rows are edited in place through ngModel, so these must re-run every check
  readyCount = () => this.lines().filter((l) => this.valid(l)).length;
  problemCount = () => this.lines().filter((l) => l.on && this.problems(l).length > 0).length;
  sum = () => this.lines().filter((l) => this.valid(l)).reduce((a, l) => a + Number(l.amount), 0);
  shown = () => (this.onlyProblems() ? this.lines().filter((l) => l.on && this.problems(l).length > 0) : this.lines());

  /* ---------- template ---------- */

  async template() {
    this.error.set('');
    try {
      const bytes = await buildTemplate(this.store.allCategories(), this.store.shops());
      await this.files.saveBinary('gmart-purchases-template.xlsx', bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      this.fb.toast('Template ready – fill it and upload');
    } catch (e: any) {
      this.error.set(e?.message || 'Could not create the template');
    }
  }

  /* ---------- upload ---------- */

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.error.set('');
    this.fileName.set(f.name);
    this.step.set('reading');
    try {
      const res = await parseWorkbook(await this.files.readBuffer(f));
      if (!res.rows.length) {
        this.step.set('pick');
        this.error.set('No purchase rows found. Fill in at least the Item and Amount columns.');
        return;
      }
      const cats = this.store.allCategories();
      const items = this.store.items();
      const lines: Line[] = res.rows.map((r) => this.toLine(r, cats, items));
      this.lines.set(lines);
      const bits: string[] = [];
      if (res.skipped) bits.push(`${res.skipped} blank/extra row${res.skipped === 1 ? '' : 's'} skipped`);
      if (res.missingColumns.length) bits.push(`No ${res.missingColumns.join(', ')} column – defaults used`);
      this.notice.set(bits.join(' · '));
      this.onlyProblems.set(false);
      this.step.set('review');
    } catch (e: any) {
      this.step.set('pick');
      this.error.set(e?.message || 'Could not read that file');
    }
  }

  private toLine(r: BulkRow, cats: string[], items: Item[]): Line {
    const name = cleanName(r.name);
    const given = cats.find((c) => c.toLowerCase() === r.category.toLowerCase());
    const c = categorize(name, items, cats, r.category);
    const warns = [...r.warns];
    let category = c.itemId ? c.category : given ?? c.category;
    if (r.category && !given && !c.itemId) {
      warns.push(`Category “${r.category}” isn't in your list – ${c.via === 'none' ? 'set to Other' : `using ${c.category}`}`);
    }
    return {
      key: this.seq++,
      on: true,
      src: r.row,
      date: r.date,
      name,
      category,
      qty: r.qty,
      unit: r.unit,
      amount: r.amount,
      shop: r.shop,
      note: r.note,
      matchId: c.itemId,
      locked: !!given,
      warns,
    };
  }

  /* ---------- review ---------- */

  private blank(): Line {
    return { key: this.seq++, on: true, src: 0, date: this.today, name: '', category: 'Other', qty: 1, unit: 'unit', amount: null, shop: '', note: '', locked: false, warns: [] };
  }

  addLine() {
    this.lines.update((l) => [...l, this.blank()]);
    this.onlyProblems.set(false);
  }

  remove(line: Line) {
    this.lines.update((l) => l.filter((x) => x !== line));
  }

  allOn = () => this.lines().length > 0 && this.lines().every((l) => l.on);

  setAll(on: boolean) {
    this.lines().forEach((l) => (l.on = on));
    this.lines.update((x) => [...x]);
  }

  restart() {
    this.lines.set([]);
    this.step.set('pick');
  }

  rematch(l: Line) {
    if (l.pinned) return;
    const c = categorize(l.name, this.store.items(), this.store.allCategories());
    l.matchId = c.itemId;
    if (!l.locked && c.via !== 'none') l.category = c.category;
    this.lines.update((x) => [...x]);
  }

  suggest(l: Line): Item[] {
    const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3));
    const mine = words(l.name);
    if (!mine.size) return [];
    return this.store
      .items()
      .map((i) => {
        const theirs = words(i.name);
        let hit = 0;
        mine.forEach((w) => {
          if (theirs.has(w) || [...theirs].some((x) => x.startsWith(w) || w.startsWith(x))) hit++;
        });
        return { i, score: hit / Math.max(1, Math.min(mine.size, theirs.size)) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.i);
  }

  link(l: Line, id: string) {
    l.pinned = true;
    if (!id) l.matchId = undefined;
    else {
      const it = this.store.items().find((x) => x.id === id);
      if (it) {
        l.matchId = id;
        l.category = it.category;
      }
    }
    this.lines.update((x) => [...x]);
  }

  approve() {
    const good = this.lines().filter((l) => this.valid(l));
    if (!good.length) {
      this.fb.warn();
      this.fb.toast('Fix the highlighted rows first', 'error');
      return;
    }
    const batch: { itemId: string; entry: { date: string; quantity: number; unit: string; totalAmount: number; store?: string; note?: string } }[] = [];
    for (const l of good) {
      let id = l.matchId && this.store.items().some((i) => i.id === l.matchId) ? l.matchId : this.store.findItem(l.name)?.id;
      if (!id) id = this.store.addItem(l.name.trim(), l.category).item?.id ?? this.store.findItem(l.name)?.id;
      if (!id) continue;
      batch.push({
        itemId: id,
        entry: {
          date: l.date,
          quantity: Number(l.qty),
          unit: l.unit,
          totalAmount: Number(l.amount),
          store: l.shop.trim() || undefined,
          note: l.note.trim() || 'Bulk upload',
        },
      });
      this.store.setCart(id, false);
    }
    this.store.addPurchases(batch);
    this.fb.success();
    this.fb.toast(`Added ${batch.length} purchase${batch.length === 1 ? '' : 's'} · ${this.store.fmt(this.sum(), 0)}`);
    this.mc.dismiss({ added: batch.length }, 'saved');
  }

  cancel() {
    this.mc.dismiss(null, 'cancel');
  }
}
