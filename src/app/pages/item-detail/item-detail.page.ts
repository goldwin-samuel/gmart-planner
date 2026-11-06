import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, NavController } from '@ionic/angular/standalone';
import { map } from 'rxjs';
import { itemStats } from '../../core/analytics';
import { FeedbackService } from '../../core/feedback.service';
import { HistoryEntry } from '../../core/models';
import { StoreService } from '../../core/store.service';
import { ThemeService } from '../../core/theme.service';
import { categoryEmoji, prettyDate } from '../../core/utils';
import { ModalsService } from '../../modals/modals.service';
import { ChartComponent } from '../../shared/chart.component';
import { areaChart } from '../../shared/charts';

@Component({
  selector: 'app-item-detail',
  standalone: true,
  imports: [IonContent, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, ChartComponent],
  template: `
    <ion-content [fullscreen]="true">
      <div class="wrap">
        @if (item(); as it) {
          <div class="back-row">
            <button class="btn-ghost sm" (click)="back()"><ion-icon name="chevron-back"></ion-icon> <span class="d-only" style="display: inline">Shopping list</span><span class="m-only" style="display: inline">Back</span></button>
            <div style="display: flex; gap: 8px">
              <button class="icon-btn" (click)="toggleFav()" aria-label="Favorite">
                <ion-icon [name]="store.isFavorite(it.id) ? 'star' : 'star-outline'" [style.color]="store.isFavorite(it.id) ? '#f59e0b' : ''"></ion-icon>
              </button>
              <button class="icon-btn" (click)="edit()" aria-label="Edit"><ion-icon name="create-outline"></ion-icon></button>
              <button class="icon-btn d-only" (click)="remove()" aria-label="Delete" style="color: var(--bad)"><ion-icon name="trash-outline"></ion-icon></button>
            </div>
          </div>

          <div class="card" style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap">
            <div class="avatar lg">{{ emoji(it.category) }}</div>
            <div style="min-width: 0; flex: 1">
              <h1 class="title" style="margin: 0">{{ it.name }}</h1>
              <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
                <span class="pill">{{ it.category }}</span>
                @if (!it.active) { <span class="pill warn">Paused</span> }
                @if (stats(); as s) { <small>{{ s.count }} purchases · {{ store.fmt(s.total, 0) }} spent</small> }
              </div>
            </div>
            <div style="display: flex; gap: 10px; width: 100%; max-width: 380px">
              <button class="btn-primary" style="flex: 1" (click)="record()"><ion-icon name="add-circle-outline"></ion-icon> Record purchase</button>
              <button class="btn-ghost" (click)="toggleActive()">
                <ion-icon [name]="it.active ? 'bed-outline' : 'refresh-outline'"></ion-icon> {{ it.active ? 'Pause' : 'Resume' }}
              </button>
            </div>
          </div>

          @if (stats(); as s) {
            <div class="two-col">
              <div class="col">
                <div class="tiles four" style="margin: 0">
                  <div class="tile"><small>Last price</small><b>{{ store.fmt(s.last) }}</b><div class="sub">per {{ s.unit }}</div></div>
                  <div class="tile"><small>Average</small><b>{{ store.fmt(s.avg) }}</b><div class="sub">per {{ s.unit }}</div></div>
                  <div class="tile"><small>Lowest</small><b style="color: var(--good)">{{ store.fmt(s.min) }}</b><div class="sub">best price paid</div></div>
                  <div class="tile"><small>Highest</small><b style="color: var(--bad)">{{ store.fmt(s.max) }}</b><div class="sub">{{ s.count }} purchases</div></div>
                </div>

                <div class="card">
                  <div class="card-head">
                    <div><h3>Price history</h3><small>Unit price over time</small></div>
                    <span class="pill">{{ store.fmt(s.total, 0) }} total</span>
                  </div>
                  @if (it.history.length > 1) {
                    <app-chart [config]="priceCfg()" [height]="240"></app-chart>
                  } @else {
                    <p class="muted" style="margin: 0">Record at least two purchases to see a price trend.</p>
                  }
                </div>
              </div>

              <div class="col">
                <div class="card" style="padding-bottom: 12px">
                  <div class="card-head"><div><h3>Purchases</h3><small class="m-only">Swipe left to edit or delete</small><small class="d-only" style="display: none">Newest first</small></div></div>
                  <div class="group-card" style="box-shadow: none">
                    @for (e of sorted(); track $index) {
                      <ion-item-sliding #slide>
                        <ion-item lines="none" class="row-item" detail="false" style="--min-height: 62px">
                          <div class="row">
                            <div class="row-main">
                              <b>{{ pretty(e.date) }}</b>
                              <span>{{ e.quantity }} {{ e.unit }} · {{ store.fmt(e.unitPrice) }}/{{ e.unit }}{{ e.store ? ' · ' + e.store : '' }}{{ e.note ? ' · ' + e.note : '' }}</span>
                            </div>
                            <div class="row-end hist-amt"><b>{{ store.fmt(e.totalAmount) }}</b></div>
                            <div class="d-only" style="gap: 0">
                              <button class="ibtn" (click)="editEntry(e)" title="Edit"><ion-icon name="create-outline"></ion-icon></button>
                              <button class="ibtn danger" (click)="removeEntry(e)" title="Delete"><ion-icon name="trash-outline"></ion-icon></button>
                            </div>
                          </div>
                        </ion-item>
                        <ion-item-options side="end">
                          <ion-item-option class="opt-off" (click)="editEntry(e); slide.close()">
                            <ion-icon slot="top" name="create-outline"></ion-icon>Edit
                          </ion-item-option>
                          <ion-item-option class="opt-del" (click)="removeEntry(e); slide.close()">
                            <ion-icon slot="top" name="trash-outline"></ion-icon>Delete
                          </ion-item-option>
                        </ion-item-options>
                      </ion-item-sliding>
                    }
                  </div>
                </div>
              </div>
            </div>
          } @else {
            <div class="card empty">
              <div class="empty-ico">🧾</div>
              <h3>No purchases yet</h3>
              <p>Record your first purchase to start tracking price history for {{ it.name }}.</p>
            </div>
          }

          <button class="btn-danger block m-only" style="margin-top: 6px" (click)="remove()"><ion-icon name="trash-outline"></ion-icon> Delete item</button>
        } @else {
          <div class="card empty" style="margin-top: 60px">
            <div class="empty-ico">🤷</div>
            <h3>Item not found</h3>
            <p>It may have been deleted on another device.</p>
            <button class="btn-primary" (click)="back()">Back to list</button>
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class ItemDetailPage {
  store = inject(StoreService);
  private theme = inject(ThemeService);
  private fb = inject(FeedbackService);
  private modals = inject(ModalsService);
  private nav = inject(NavController);
  private route = inject(ActivatedRoute);

  emoji = categoryEmoji;
  pretty = prettyDate;

  id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id'))), { initialValue: null });
  item = computed(() => this.store.items().find((i) => i.id === this.id()));
  stats = computed(() => {
    const it = this.item();
    return it ? itemStats(it) : null;
  });
  sorted = computed(() => [...(this.item()?.history ?? [])].sort((a, b) => b.date.localeCompare(a.date)));

  priceCfg = computed(() => {
    const h = this.item()?.history ?? [];
    return areaChart(
      h.map((e) => e.date.slice(5)),
      h.map((e) => Number(e.unitPrice.toFixed(2))),
      this.theme.chart(),
      (n) => this.store.fmt(n),
    );
  });

  back() {
    this.nav.navigateBack('/tabs/list');
  }

  toggleFav() {
    const it = this.item();
    if (it) {
      this.store.toggleFavorite(it.id);
      this.fb.tap();
    }
  }

  edit() {
    const it = this.item();
    if (it) void this.modals.addItem({ item: it });
  }

  record() {
    const it = this.item();
    if (it) void this.modals.entry(it);
  }

  editEntry(e: HistoryEntry) {
    const it = this.item();
    if (it) void this.modals.entry(it, e);
  }

  async removeEntry(e: HistoryEntry) {
    const it = this.item();
    if (!it) return;
    const ok = await this.fb.confirm('Delete purchase?', `${prettyDate(e.date)} · ${this.store.fmt(e.totalAmount)}`, 'Delete', true);
    if (!ok) return;
    this.store.removePurchase(it.id, e);
    this.fb.success();
    this.fb.toast('Purchase deleted');
  }

  toggleActive() {
    const it = this.item();
    if (!it) return;
    this.store.toggleActive(it.id, !it.active);
    this.fb.tap();
  }

  async remove() {
    const it = this.item();
    if (!it) return;
    const ok = await this.fb.confirm('Delete item?', `“${it.name}” and all its history will be removed.`, 'Delete', true);
    if (!ok) return;
    this.store.deleteItem(it.id);
    this.fb.success();
    this.fb.toast('Item deleted');
    this.back();
  }
}
