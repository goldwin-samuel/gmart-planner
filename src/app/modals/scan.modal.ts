import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { categorize, cleanName } from '../core/categorize';
import { FeedbackService } from '../core/feedback.service';
import { compressImage } from '../core/image';
import { UNITS } from '../core/models';
import { StoreService } from '../core/store.service';
import { categoryEmoji, todayISO } from '../core/utils';

interface Line {
  key: number;
  on: boolean;
  name: string;
  category: string;
  qty: number | null;
  unit: string;
  amount: number | null;
  matchId?: string;
  locked: boolean; // user picked the category by hand – stop auto-categorising
}

type Step = 'pick' | 'scanning' | 'review';

@Component({
  selector: 'app-scan-modal',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon],
  template: `
    <ion-content class="sheet-content">
      <div class="sheet-body scan">
        <div class="sheet-title">
          <div>
            <div class="eyebrow">Bill scanner</div>
            <h2>{{ step() === 'review' ? 'Check & approve' : 'Scan a bill' }}</h2>
          </div>
          <button class="icon-btn" (click)="cancel()" aria-label="Close"><ion-icon name="close-outline"></ion-icon></button>
        </div>

        <!-- ================= pick ================= -->
        @if (step() === 'pick') {
          <p class="muted" style="margin: 0 0 16px; line-height: 1.5">
            Take a photo of your bill. Items, prices, the shop and the date are read automatically and sorted into categories — you review everything before it is added.
          </p>
          <div class="scan-pick">
            <button class="pick-card primary" (click)="camera()">
              <ion-icon name="camera-outline"></ion-icon>
              <b>Take photo</b>
              <small>Lay the bill flat, good light</small>
            </button>
            <button class="pick-card" (click)="gallery()">
              <ion-icon name="images-outline"></ion-icon>
              <b>Choose from gallery</b>
              <small>JPG / PNG of a bill</small>
            </button>
          </div>
          @if (error()) {
            <div class="scan-err"><ion-icon name="alert-circle-outline"></ion-icon><span>{{ error() }}</span></div>
          }
          <button class="btn-ghost block" style="margin-top: 14px" (click)="manual()"><ion-icon name="create-outline"></ion-icon> Enter items manually</button>
          <input #cam type="file" accept="image/*" capture="environment" hidden (change)="onFile($event)" />
          <input #gal type="file" accept="image/*" hidden (change)="onFile($event)" />
        }

        <!-- ================= scanning ================= -->
        @if (step() === 'scanning') {
          <div class="scanning">
            @if (preview()) {
              <div class="shot"><img [src]="preview()" alt="Bill" /><i class="beam"></i></div>
            }
            <b>Reading your bill…</b>
            <small>Finding items, prices and categories</small>
          </div>
        }

        <!-- ================= review ================= -->
        @if (step() === 'review') {
          <div class="rv-head">
            @if (preview()) { <img class="rv-thumb" [src]="preview()" alt="Bill" /> }
            <div class="rv-fields">
              <div class="field" style="margin: 0">
                <label>Shop</label>
                <input class="inp" [(ngModel)]="shop" placeholder="Shop name" list="gm-shops" autocomplete="off" />
                <datalist id="gm-shops">@for (s of store.shops(); track s) { <option [value]="s"></option> }</datalist>
              </div>
              <div class="field" style="margin: 0">
                <label>Date</label>
                <input class="inp" type="date" [(ngModel)]="date" [max]="today" />
              </div>
            </div>
          </div>

          @if (note()) {
            <div class="scan-note"><ion-icon name="information-circle-outline"></ion-icon><span>{{ note() }}</span></div>
          }

          <div class="rv-list">
            @for (l of lines(); track l.key) {
              <div class="rv-line" [class.off]="!l.on">
                <div class="rv-top">
                  <button class="check" [class.on]="l.on" (click)="l.on = !l.on" [attr.aria-label]="l.on ? 'Skip this line' : 'Include this line'">
                    @if (l.on) { <ion-icon name="checkmark"></ion-icon> }
                  </button>
                  <input class="inp name" [(ngModel)]="l.name" (change)="rematch(l)" placeholder="Item name" autocomplete="off" />
                  <button class="icon-btn flat" (click)="remove(l)" aria-label="Remove line"><ion-icon name="trash-outline"></ion-icon></button>
                </div>
                <div class="rv-grid">
                  <div class="field">
                    <label>Category</label>
                    <select class="inp" [(ngModel)]="l.category" (ngModelChange)="l.locked = true">
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
                @if (l.matchId) {
                  <span class="tag ok"><ion-icon name="checkmark-circle"></ion-icon> Matches an item in your list</span>
                } @else if (l.on && l.name.trim()) {
                  <span class="tag"><ion-icon name="sparkles-outline"></ion-icon> New item will be created</span>
                }
              </div>
            }
          </div>

          <button class="btn-ghost block sm" style="margin: 4px 0 14px" (click)="addLine()"><ion-icon name="add"></ion-icon> Add another line</button>

          <div class="rv-total">
            <div>
              <small>{{ count() }} item{{ count() === 1 ? '' : 's' }} selected</small>
              <b>{{ store.fmt(sum()) }}</b>
            </div>
            @if (billTotal() !== null) {
              <span class="pill" [class.warn]="diff() > 0.5">
                Bill total {{ store.fmt(billTotal(), 2) }}@if (diff() > 0.5) { · {{ store.fmt(diff(), 2) }} off }
              </span>
            }
          </div>

          <button class="btn-primary block" [disabled]="!count()" (click)="approve()">
            <ion-icon name="checkmark-done"></ion-icon> Approve &amp; add {{ count() }} item{{ count() === 1 ? '' : 's' }}
          </button>
          <button class="btn-ghost block" style="margin-top: 10px" (click)="restart()">Scan a different bill</button>
        }
      </div>
    </ion-content>
  `,
})
export class ScanModal {
  store = inject(StoreService);
  private api = inject(ApiService);
  private fb = inject(FeedbackService);
  private mc = inject(ModalController);

  @ViewChild('cam') cam?: ElementRef<HTMLInputElement>;
  @ViewChild('gal') gal?: ElementRef<HTMLInputElement>;

  units = UNITS;
  today = todayISO();
  emoji = categoryEmoji;

  step = signal<Step>('pick');
  preview = signal('');
  error = signal('');
  note = signal('');
  lines = signal<Line[]>([]);
  billTotal = signal<number | null>(null);
  shop = '';
  date = todayISO();
  private seq = 1;

  cats = () => this.store.allCategories();

  count = () => this.lines().filter((l) => this.valid(l)).length;
  sum = () => this.lines().filter((l) => this.valid(l)).reduce((a, l) => a + Number(l.amount), 0);
  diff = () => Math.abs((this.billTotal() ?? 0) - this.sum());

  private valid(l: Line) {
    return l.on && l.name.trim().length > 0 && Number(l.amount) > 0 && Number(l.qty) > 0;
  }

  /* ---------- capture ---------- */

  async camera() {
    this.error.set('');
    if (Capacitor.isNativePlatform()) return this.native(CameraSource.Camera);
    this.cam?.nativeElement.click();
  }

  async gallery() {
    this.error.set('');
    if (Capacitor.isNativePlatform()) return this.native(CameraSource.Photos);
    this.gal?.nativeElement.click();
  }

  private async native(source: CameraSource) {
    try {
      const photo = await Camera.getPhoto({ source, resultType: CameraResultType.DataUrl, quality: 72, width: 1600, correctOrientation: true });
      if (photo.dataUrl) await this.process(photo.dataUrl);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (!/cancel/i.test(msg)) this.error.set('Could not open the camera. Check the camera permission in Settings.');
    }
  }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      await this.process(await compressImage(file));
    } catch (e: any) {
      this.error.set(e?.message || 'Could not read that image');
    }
  }

  /* ---------- scan ---------- */

  private async process(dataUrl: string) {
    this.preview.set(dataUrl);
    this.step.set('scanning');
    this.error.set('');
    const base64 = dataUrl.split(',')[1] ?? '';
    const r = await this.api.scanBill(base64, 'image/jpeg', this.store.allCategories());
    if (r.status !== 'success') {
      this.step.set('pick');
      const m = r.message || 'Scan failed';
      this.error.set(
        /unknown action/i.test(m)
          ? 'Your Apps Script has not been updated yet. Deploy the new Code.gs (see backend/README) or enter items manually.'
          : m,
      );
      return;
    }
    const cats = this.store.allCategories();
    const items = this.store.items();
    const lines: Line[] = ((r['items'] as any[]) ?? []).map((it) => {
      const name = cleanName(String(it.name ?? ''));
      const c = categorize(name, items, cats, String(it.category ?? ''));
      return {
        key: this.seq++,
        on: true,
        name,
        category: c.category,
        qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
        unit: UNITS.includes(it.unit) ? it.unit : 'unit',
        amount: Number(it.amount) || null,
        matchId: c.itemId,
        locked: false,
      };
    });
    this.shop = String(r['shop'] ?? '').trim();
    this.date = /^\d{4}-\d{2}-\d{2}$/.test(String(r['date'] ?? '')) && r['date'] <= this.today ? r['date'] : this.today;
    this.billTotal.set(Number(r['total']) > 0 ? Number(r['total']) : null);
    this.note.set(String(r['note'] ?? ''));
    this.lines.set(lines.length ? lines : [this.blank()]);
    this.step.set('review');
  }

  /* ---------- review ---------- */

  private blank(): Line {
    return { key: this.seq++, on: true, name: '', category: 'Other', qty: 1, unit: 'unit', amount: null, locked: false };
  }

  manual() {
    this.preview.set('');
    this.note.set('');
    this.billTotal.set(null);
    this.lines.set([this.blank()]);
    this.step.set('review');
  }

  restart() {
    this.preview.set('');
    this.step.set('pick');
  }

  addLine() {
    this.lines.update((l) => [...l, this.blank()]);
  }

  remove(line: Line) {
    this.lines.update((l) => l.filter((x) => x !== line));
    if (!this.lines().length) this.addLine();
  }

  /** Re-run matching/categorising when the name is edited (unless the category was set by hand). */
  rematch(l: Line) {
    const c = categorize(l.name, this.store.items(), this.store.allCategories());
    l.matchId = c.itemId;
    if (!l.locked && c.via !== 'none') l.category = c.category;
    this.lines.update((x) => [...x]);
  }

  approve() {
    const good = this.lines().filter((l) => this.valid(l));
    if (!good.length) {
      this.fb.warn();
      this.fb.toast('Add at least one item with a name and amount', 'error');
      return;
    }
    const shop = this.shop.trim() || undefined;
    const batch: { itemId: string; entry: { date: string; quantity: number; unit: string; totalAmount: number; store?: string; note?: string } }[] = [];
    for (const l of good) {
      let id = l.matchId && this.store.items().some((i) => i.id === l.matchId) ? l.matchId : this.store.findItem(l.name)?.id;
      if (!id) {
        const r = this.store.addItem(l.name, l.category);
        id = r.item?.id ?? this.store.findItem(l.name)?.id;
      }
      if (!id) continue;
      batch.push({
        itemId: id,
        entry: { date: this.date, quantity: Number(l.qty), unit: l.unit, totalAmount: Number(l.amount), store: shop, note: 'Scanned bill' },
      });
      this.store.setCart(id, false);
    }
    this.store.addPurchases(batch);
    this.fb.success();
    this.fb.toast(`Added ${batch.length} item${batch.length === 1 ? '' : 's'} · ${this.store.fmt(this.sum(), 0)}`);
    this.mc.dismiss({ added: batch.length }, 'saved');
  }

  cancel() {
    this.mc.dismiss(null, 'cancel');
  }
}
