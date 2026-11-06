import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { FeedbackService } from '../core/feedback.service';
import { Item } from '../core/models';
import { StoreService } from '../core/store.service';
import { categoryEmoji } from '../core/utils';

@Component({
  selector: 'app-add-item-modal',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon],
  template: `
    <ion-content class="sheet-content">
      <div class="sheet-body">
        <div class="sheet-title">
          <div>
            <div class="eyebrow">{{ item ? 'Edit item' : 'New item' }}</div>
            <h2>{{ item ? item.name : 'Add to your list' }}</h2>
          </div>
          <button class="icon-btn" (click)="cancel()" aria-label="Close"><ion-icon name="close-outline"></ion-icon></button>
        </div>

        <div class="field">
          <label>Item name</label>
          <input class="inp" [(ngModel)]="name" placeholder="e.g. Basmati rice" autocomplete="off" (keyup.enter)="save()" />
        </div>

        <div class="field">
          <label>Category</label>
          <div class="chips wrap-chips">
            @for (c of store.allCategories(); track c) {
              <button class="chip" [class.on]="category === c" (click)="category = c; creating = false">
                <span>{{ emoji(c) }}</span> {{ c }}
              </button>
            }
            <button class="chip dashed" [class.on]="creating" (click)="creating = true; category = ''">
              <ion-icon name="add"></ion-icon> New
            </button>
          </div>
          @if (creating) {
            <input class="inp" style="margin-top: 10px" [(ngModel)]="newCat" placeholder="New category name" autocomplete="off" />
          }
        </div>

        <button class="btn-primary block" (click)="save()" [disabled]="busy">
          {{ busy ? 'Saving…' : item ? 'Save changes' : 'Add item' }}
        </button>
      </div>
    </ion-content>
  `,
})
export class AddItemModal implements OnInit {
  @Input() item?: Item;
  @Input() presetCategory?: string;

  store = inject(StoreService);
  private fb = inject(FeedbackService);
  private mc = inject(ModalController);

  name = '';
  category = '';
  newCat = '';
  creating = false;
  busy = false;

  emoji = categoryEmoji;

  ngOnInit() {
    if (this.item) {
      this.name = this.item.name;
      this.category = this.item.category;
    } else {
      this.category = this.presetCategory || this.store.allCategories()[0] || 'Other';
    }
  }

  async save() {
    if (this.busy) return;
    let cat = this.category;
    if (this.creating) {
      cat = this.newCat.trim();
      if (!cat) {
        this.fb.toast('Enter a category name', 'error');
        return;
      }
    }
    if (!cat) cat = 'Other';

    this.busy = true;
    try {
      if (this.creating) {
        const r = await this.store.addCategory(cat);
        if (r.status === 'error' && r.message !== 'Category already exists') this.fb.toast(r.message ?? 'Category saved locally', 'info');
      }
      const res = this.item ? this.store.updateItem(this.item.id, { name: this.name, category: cat }) : this.store.addItem(this.name, cat);
      if (!res.ok) {
        this.fb.warn();
        this.fb.toast(res.error ?? 'Could not save', 'error');
        return;
      }
      this.fb.success();
      this.fb.toast(this.item ? 'Item updated' : `Added ${this.name.trim()}`);
      await this.mc.dismiss(true, 'saved');
    } finally {
      this.busy = false;
    }
  }

  cancel() {
    this.mc.dismiss(null, 'cancel');
  }
}
