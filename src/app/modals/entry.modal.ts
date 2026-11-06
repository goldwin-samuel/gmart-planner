import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { FeedbackService } from '../core/feedback.service';
import { HistoryEntry, Item, UNITS } from '../core/models';
import { StoreService } from '../core/store.service';
import { todayISO } from '../core/utils';

@Component({
  selector: 'app-entry-modal',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon],
  template: `
    <ion-content class="sheet-content">
      <div class="sheet-body">
        <div class="sheet-title">
          <div>
            <div class="eyebrow">{{ entry ? 'Edit purchase' : 'Record purchase' }}</div>
            <h2>{{ item.name }}</h2>
          </div>
          <button class="icon-btn" (click)="cancel()" aria-label="Close"><ion-icon name="close-outline"></ion-icon></button>
        </div>

        @if (!entry && lastEntry) {
          <button class="chip soft" style="margin-bottom: 14px" (click)="useLast()">
            <ion-icon name="refresh-outline"></ion-icon>
            Same as last: {{ lastEntry.quantity }} {{ lastEntry.unit }} · {{ store.fmt(lastEntry.totalAmount) }}
          </button>
        }

        <div class="grid-2">
          <div class="field">
            <label>Quantity</label>
            <input class="inp" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="qty" placeholder="1.5" />
          </div>
          <div class="field">
            <label>Total paid ({{ store.settings().currency }})</label>
            <input class="inp" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="amount" placeholder="0.00" />
          </div>
        </div>

        <div class="field">
          <label>Unit</label>
          <div class="chips wrap-chips">
            @for (u of units; track u) {
              <button class="chip" [class.on]="unit === u" (click)="unit = u">{{ u }}</button>
            }
          </div>
        </div>

        @if (unitPrice !== null) {
          <div class="callout">
            <div>
              <small>Unit price</small>
              <b>{{ store.fmt(unitPrice) }} <span>/ {{ unit }}</span></b>
            </div>
            @if (diffPct !== null) {
              <span class="delta" [class.up]="diffPct > 0.5" [class.down]="diffPct < -0.5">
                <ion-icon [name]="diffPct > 0 ? 'arrow-up-outline' : 'arrow-down-outline'"></ion-icon>
                {{ absPct }}% vs last
              </span>
            }
          </div>
        }

        <div class="grid-2">
          <div class="field">
            <label>Date</label>
            <input class="inp" type="date" [(ngModel)]="date" [max]="today" />
          </div>
          <div class="field">
            <label>Shop <small>(optional)</small></label>
            <input class="inp" [(ngModel)]="storeName" placeholder="e.g. G-Mart" list="gm-shops-e" autocomplete="off" />
            <datalist id="gm-shops-e">@for (s of store.shops(); track s) { <option [value]="s"></option> }</datalist>
          </div>
        </div>

        <div class="field">
          <label>Note <small>(optional)</small></label>
          <input class="inp" [(ngModel)]="note" placeholder="Brand, offer, anything to remember" />
        </div>

        <button class="btn-primary block" (click)="save()">{{ entry ? 'Save changes' : 'Save purchase' }}</button>
      </div>
    </ion-content>
  `,
})
export class EntryModal implements OnInit {
  @Input({ required: true }) item!: Item;
  @Input() entry?: HistoryEntry;

  store = inject(StoreService);
  private fb = inject(FeedbackService);
  private mc = inject(ModalController);

  units = UNITS;
  today = todayISO();
  date = todayISO();
  qty: number | null = null;
  amount: number | null = null;
  unit = 'kg';
  storeName = '';
  note = '';

  get lastEntry(): HistoryEntry | undefined {
    return this.item.history[this.item.history.length - 1];
  }

  get unitPrice(): number | null {
    return this.qty && this.amount ? this.amount / this.qty : null;
  }

  get diffPct(): number | null {
    const up = this.unitPrice;
    const last = this.item.lastPrice;
    if (up == null || !last || this.item.lastUnit !== this.unit) return null;
    return ((up - last) / last) * 100;
  }

  get absPct(): string {
    return Math.abs(this.diffPct ?? 0).toFixed(0);
  }

  ngOnInit() {
    if (this.entry) {
      this.date = this.entry.date;
      this.qty = this.entry.quantity;
      this.amount = this.entry.totalAmount;
      this.unit = this.entry.unit;
      this.storeName = this.entry.store ?? '';
      this.note = this.entry.note ?? '';
    } else {
      this.unit = this.item.lastUnit || 'kg';
      this.storeName = this.lastEntry?.store ?? '';
    }
  }

  useLast() {
    const l = this.lastEntry;
    if (!l) return;
    this.qty = l.quantity;
    this.unit = l.unit;
    this.amount = l.totalAmount;
    this.fb.tap();
  }

  save() {
    const qty = Number(this.qty);
    const amt = Number(this.amount);
    if (!this.date || !(qty > 0) || !(amt >= 0) || this.amount === null) {
      this.fb.warn();
      this.fb.toast('Enter a valid quantity and amount', 'error');
      return;
    }
    const data = {
      date: this.date,
      quantity: qty,
      unit: this.unit,
      totalAmount: amt,
      store: this.storeName.trim() || undefined,
      note: this.note.trim() || undefined,
    };
    if (this.entry) this.store.updatePurchase(this.item.id, this.entry, data);
    else this.store.addPurchase(this.item.id, data);
    this.store.setCart(this.item.id, false);
    this.fb.success();
    this.fb.toast(this.entry ? 'Purchase updated' : 'Purchase recorded');
    this.mc.dismiss(true, 'saved');
  }

  cancel() {
    this.mc.dismiss(null, 'cancel');
  }
}
