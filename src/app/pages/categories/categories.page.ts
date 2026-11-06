import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon, NavController } from '@ionic/angular/standalone';
import { categoryTotals } from '../../core/analytics';
import { FeedbackService } from '../../core/feedback.service';
import { STARTER_CATEGORIES } from '../../core/models';
import { StoreService } from '../../core/store.service';
import { categoryEmoji } from '../../core/utils';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [IonContent, IonIcon],
  template: `
    <ion-content [fullscreen]="true">
      <div class="wrap">
        <div class="back-row m-only">
          <button class="btn-ghost sm" (click)="back()"><ion-icon name="chevron-back"></ion-icon> Back</button>
        </div>

        <div class="page-head h-row">
          <div>
            <div class="eyebrow">Organise</div>
            <h1 class="title">Categories</h1>
          </div>
          <button class="btn-primary sm" (click)="add()"><ion-icon name="add"></ion-icon> Add category</button>
        </div>

        @if (rows().length === 0 || missingStarters().length === rows().length) {
          <div class="card empty">
            <div class="empty-ico">🏷️</div>
            <h3>No categories yet</h3>
            <p>Start with a ready-made set for groceries, or create your own.</p>
            <button class="btn-primary" [disabled]="seeding" (click)="seed()">{{ seeding ? 'Adding…' : 'Add starter set' }}</button>
          </div>
        }

        <div class="cat-grid">
          @for (r of rows(); track r.name) {
            <button class="card cat-card" (click)="open(r.name)">
              <div class="cc-top">
                <div class="avatar">{{ emoji(r.name) }}</div>
                <div class="row-main"><b>{{ r.name }}</b><span>{{ r.items }} item{{ r.items === 1 ? '' : 's' }}</span></div>
                <ion-icon name="chevron-forward" style="color: var(--ink-3)"></ion-icon>
              </div>
              <div class="cc-val"><b>{{ store.fmt(r.spend, 0) }}</b><small>total spent</small></div>
              <div class="bar"><i [style.width.%]="(r.spend / maxSpend()) * 100"></i></div>
            </button>
          }
        </div>

        @if (rows().length && missingStarters().length && missingStarters().length < rows().length) {
          <button class="btn-ghost block" style="margin-top: 16px; max-width: 360px" [disabled]="seeding" (click)="seed()">
            <ion-icon name="sparkles-outline"></ion-icon> Add missing starter categories
          </button>
        }
      </div>
    </ion-content>
  `,
})
export class CategoriesPage {
  store = inject(StoreService);
  private fb = inject(FeedbackService);
  private nav = inject(NavController);
  private router = inject(Router);

  emoji = categoryEmoji;
  seeding = false;

  rows = computed(() => {
    const spend = new Map(categoryTotals(this.store.purchases()).map((c) => [c.name, c.total]));
    return this.store.allCategories().map((name) => ({
      name,
      items: this.store.items().filter((i) => i.category === name).length,
      spend: spend.get(name) ?? 0,
    }));
  });

  maxSpend = computed(() => Math.max(...this.rows().map((r) => r.spend), 1));

  missingStarters = computed(() => {
    const have = new Set(this.store.allCategories().map((c) => c.toLowerCase()));
    return STARTER_CATEGORIES.filter((c) => !have.has(c.toLowerCase()));
  });

  back() {
    this.nav.navigateBack('/tabs/more');
  }

  open(name: string) {
    void this.router.navigate(['/tabs/list'], { queryParams: { cat: name } });
  }

  async add() {
    const name = await this.fb.prompt('New category', 'e.g. Bakery');
    if (!name) return;
    const r = await this.store.addCategory(name);
    if (r.status === 'success') {
      this.fb.success();
      this.fb.toast(`Added ${name}`);
    } else {
      this.fb.toast(r.message ?? 'Could not add category', r.message === 'Category already exists' ? 'error' : 'info');
    }
  }

  async seed() {
    this.seeding = true;
    try {
      for (const c of this.missingStarters()) await this.store.addCategory(c);
      this.fb.success();
      this.fb.toast('Starter categories added');
    } finally {
      this.seeding = false;
    }
  }
}
