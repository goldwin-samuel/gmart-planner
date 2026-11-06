import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { FeedbackService } from '../core/feedback.service';
import { INCOME_SOURCES, Income } from '../core/models';
import { StoreService } from '../core/store.service';
import { todayISO } from '../core/utils';

@Component({
  selector: 'app-income-modal',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon],
  template: `
    <ion-content class="sheet-content">
      <div class="sheet-body">
        <div class="sheet-title">
          <div>
            <div class="eyebrow">{{ income ? 'Edit income' : 'New income' }}</div>
            <h2>{{ income ? 'Update entry' : 'Record income' }}</h2>
          </div>
          <button class="icon-btn" (click)="cancel()" aria-label="Close"><ion-icon name="close-outline"></ion-icon></button>
        </div>

        <div class="field">
          <label>Amount ({{ store.settings().currency }})</label>
          <input class="inp big" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="amount" placeholder="0.00" (keyup.enter)="save()" />
        </div>

        <div class="field">
          <label>Source</label>
          <div class="chips wrap-chips">
            @for (s of sources(); track s) {
              <button class="chip" [class.on]="source === s" (click)="source = s; custom = false">{{ s }}</button>
            }
            <button class="chip dashed" [class.on]="custom" (click)="custom = true; source = ''"><ion-icon name="add"></ion-icon> Other…</button>
          </div>
          @if (custom) {
            <input class="inp" style="margin-top: 10px" [(ngModel)]="customName" placeholder="e.g. Bonus" autocomplete="off" />
          }
        </div>

        <div class="grid-2">
          <div class="field">
            <label>Date</label>
            <input class="inp" type="date" [(ngModel)]="date" [max]="today" />
          </div>
          <div class="field">
            <label>Note <small>(optional)</small></label>
            <input class="inp" [(ngModel)]="note" placeholder="Who / what for" />
          </div>
        </div>

        <button class="btn-primary block" (click)="save()">{{ income ? 'Save changes' : 'Add income' }}</button>
        @if (income) {
          <button class="btn-ghost block danger" style="margin-top: 10px" (click)="remove()"><ion-icon name="trash-outline"></ion-icon> Delete entry</button>
        }
      </div>
    </ion-content>
  `,
})
export class IncomeModal implements OnInit {
  @Input() income?: Income;

  store = inject(StoreService);
  private fb = inject(FeedbackService);
  private mc = inject(ModalController);

  today = todayISO();
  date = todayISO();
  amount: number | null = null;
  source = 'Salary';
  custom = false;
  customName = '';
  note = '';

  /** Built-in sources plus any custom ones already used. */
  sources() {
    const extra = this.store.income().map((i) => i.source).filter((s) => !INCOME_SOURCES.includes(s));
    return [...INCOME_SOURCES, ...new Set(extra)];
  }

  ngOnInit() {
    if (this.income) {
      this.date = this.income.date;
      this.amount = this.income.amount;
      this.source = this.income.source;
      this.note = this.income.note ?? '';
    } else {
      // default to the most recent source – salary is usually repeated monthly
      const last = [...this.store.income()].sort((a, b) => b.date.localeCompare(a.date))[0];
      if (last) this.source = last.source;
    }
  }

  save() {
    const amt = Number(this.amount);
    const src = (this.custom ? this.customName : this.source).trim();
    if (!(amt > 0) || !this.date || !src) {
      this.fb.warn();
      this.fb.toast('Enter an amount, source and date', 'error');
      return;
    }
    const data = { date: this.date, amount: amt, source: src, note: this.note.trim() || undefined };
    if (this.income) this.store.updateIncome(this.income.id, data);
    else this.store.addIncome(data);
    this.fb.success();
    this.fb.toast(this.income ? 'Income updated' : 'Income added');
    this.mc.dismiss(true, 'saved');
  }

  async remove() {
    if (!this.income) return;
    const ok = await this.fb.confirm('Delete this income?', `${this.income.source} · ${this.store.fmt(this.income.amount)} will be removed.`, 'Delete', true);
    if (!ok) return;
    this.store.deleteIncome(this.income.id);
    this.fb.toast('Income deleted');
    this.mc.dismiss(true, 'deleted');
  }

  cancel() {
    this.mc.dismiss(null, 'cancel');
  }
}
