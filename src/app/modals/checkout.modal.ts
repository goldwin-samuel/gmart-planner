import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { FeedbackService } from '../core/feedback.service';
import { Item, UNITS } from '../core/models';
import { StoreService } from '../core/store.service';
import { categoryEmoji, todayISO } from '../core/utils';

interface Row {
  item: Item;
  include: boolean;
  qty: number | null;
  unit: string;
  amount: number | null;
}

@Component({
  selector: 'app-checkout-modal',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon],
  template: `
    <ion-content class="sheet-content">
      <div class="sheet-body">
        <div class="sheet-title">
          <div>
            <div class="eyebrow">Checkout</div>
            <h2>Record your cart</h2>
          </div>
          <button class="icon-btn" (click)="cancel()" aria-label="Close"><ion-icon name="close-outline"></ion-icon></button>
        </div>

        <div class="grid-2">
          <div class="field">
            <label>Date</label>
            <input class="inp" type="date" [(ngModel)]="date" [max]="today" />
          </div>
          <div class="field">
            <label>Store</label>
            <input class="inp" [(ngModel)]="shop" placeholder="Optional" />
          </div>
        </div>

        <div class="co-list">
          @for (r of rows; track r.item.id) {
            <div class="co-row" [class.off]="!r.include">
              <div class="co-head">
                <button class="check" [class.on]="r.include" (click)="r.include = !r.include" aria-label="Include">
                  @if (r.include) { <ion-icon name="checkmark"></ion-icon> }
                </button>
                <span class="co-name">{{ emoji(r.item.category) }} {{ r.item.name }}</span>
                <small class="muted">{{ r.item.lastPrice ? 'last ' + store.fmt(r.item.lastPrice) + '/' + r.item.lastUnit : 'first buy' }}</small>
              </div>
              @if (r.include) {
                <div class="co-inputs">
                  <input class="inp" type="number" inputmode="decimal" step="0.01" [(ngModel)]="r.qty" placeholder="Qty" />
                  <select class="inp" [(ngModel)]="r.unit">
                    @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                  </select>
                  <input class="inp" type="number" inputmode="decimal" step="0.01" [(ngModel)]="r.amount" placeholder="Total" />
                </div>
              }
            </div>
          }
        </div>

        <div class="callout" style="margin-top: 14px">
          <div>
            <small>Basket total</small>
            <b>{{ store.fmt(total()) }}</b>
          </div>
          <span class="muted">{{ selected() }} items</span>
        </div>

        <button class="btn-primary block" (click)="save()">Record purchases</button>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .co-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .co-row {
        background: var(--surface-2);
        border-radius: 16px;
        padding: 12px;
      }
      .co-row.off {
        opacity: 0.55;
      }
      .co-head {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .co-name {
        font-weight: 600;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .co-inputs {
        display: grid;
        grid-template-columns: 1fr 0.9fr 1.2fr;
        gap: 8px;
        margin-top: 10px;
      }
    `,
  ],
})
export class CheckoutModal implements OnInit {
  store = inject(StoreService);
  private fb = inject(FeedbackService);
  private mc = inject(ModalController);

  units = UNITS;
  today = todayISO();
  date = todayISO();
  shop = '';
  rows: Row[] = [];
  emoji = categoryEmoji;

  ngOnInit() {
    const cart = this.store.prefs().cart;
    this.rows = this.store
      .items()
      .filter((i) => cart.includes(i.id))
      .map((item) => {
        const last = item.history[item.history.length - 1];
        return { item, include: true, qty: last?.quantity ?? null, unit: last?.unit ?? 'kg', amount: last?.totalAmount ?? null };
      });
    this.shop = this.rows.map((r) => r.item.history[r.item.history.length - 1]?.store).find((s) => !!s) ?? '';
  }

  selected() {
    return this.rows.filter((r) => r.include).length;
  }

  total() {
    return this.rows.filter((r) => r.include).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  }

  save() {
    const picked = this.rows.filter((r) => r.include);
    if (!picked.length) {
      this.fb.toast('Select at least one item', 'error');
      return;
    }
    const bad = picked.find((r) => !(Number(r.qty) > 0) || r.amount === null || !(Number(r.amount) >= 0));
    if (bad) {
      this.fb.warn();
      this.fb.toast(`Enter quantity and total for ${bad.item.name}`, 'error');
      return;
    }
    this.store.addPurchases(
      picked.map((r) => ({
        itemId: r.item.id,
        entry: {
          date: this.date,
          quantity: Number(r.qty),
          unit: r.unit,
          totalAmount: Number(r.amount),
          store: this.shop.trim() || undefined,
        },
      })),
    );
    this.store.clearCart(picked.map((r) => r.item.id));
    this.fb.success();
    this.fb.toast(`Recorded ${picked.length} purchase${picked.length > 1 ? 's' : ''}`);
    this.mc.dismiss(true, 'saved');
  }

  cancel() {
    this.mc.dismiss(null, 'cancel');
  }
}
