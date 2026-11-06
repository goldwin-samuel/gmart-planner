import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { FeedbackService } from '../../core/feedback.service';
import { LayoutService } from '../../core/layout.service';
import { Item } from '../../core/models';
import { StoreService } from '../../core/store.service';
import { categoryEmoji, relativeDay } from '../../core/utils';
import { ModalsService } from '../../modals/modals.service';

type Tab = 'active' | 'inactive' | 'favorites';
type Sort = 'category' | 'name' | 'recent' | 'price';

interface Group {
  label: string | null;
  items: Item[];
}

@Component({
  selector: 'app-list',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonRefresher, IonRefresherContent],
  template: `
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="wrap">
        <div class="page-head h-row">
          <div>
            <div class="eyebrow">Monthly planner</div>
            <h1 class="title">Shopping list</h1>
          </div>
          <button class="icon-btn m-only" (click)="cycleSort()" aria-label="Sort"><ion-icon name="swap-vertical-outline"></ion-icon></button>
          <button class="btn-primary sm d-only" (click)="add()"><ion-icon name="add"></ion-icon> Add item</button>
        </div>

        <!-- toolbar -->
        <div class="toolbar">
          <div class="search grow">
            <ion-icon name="search-outline"></ion-icon>
            <input type="search" placeholder="Search items, categories or shops" [value]="q()" (input)="q.set($any($event.target).value)" />
            @if (q()) { <ion-icon name="close-circle" style="cursor: pointer" (click)="q.set('')"></ion-icon> }
          </div>
          <select class="inp sm d-only" [ngModel]="sort()" (ngModelChange)="sort.set($event)" aria-label="Sort by">
            <option value="category">Group by category</option>
            <option value="name">Name A–Z</option>
            <option value="recent">Recently bought</option>
            <option value="price">Highest price</option>
          </select>
        </div>

        <div class="seg" style="margin-bottom: 12px; max-width: 520px">
          <button [class.on]="tab() === 'active'" (click)="setTab('active')">To buy · {{ counts().active }}</button>
          <button [class.on]="tab() === 'favorites'" (click)="setTab('favorites')">Favorites · {{ counts().fav }}</button>
          <button [class.on]="tab() === 'inactive'" (click)="setTab('inactive')">Paused · {{ counts().inactive }}</button>
        </div>

        <div class="chips" style="margin-bottom: 8px">
          <button class="chip" [class.on]="cat() === 'All'" (click)="cat.set('All')">All</button>
          @for (c of usedCategories(); track c) {
            <button class="chip" [class.on]="cat() === c" (click)="cat.set(c)">{{ emoji(c) }} {{ c }}</button>
          }
        </div>

        @if (!visible().length) {
          <div class="card empty" style="margin-top: 18px">
            <div class="empty-ico">{{ store.items().length ? '🔍' : '🛒' }}</div>
            <h3>{{ store.items().length ? 'Nothing here' : 'Your list is empty' }}</h3>
            <p>
              {{ store.items().length ? 'Try another filter, or switch tabs to see paused and favorite items.' : 'Add the things you buy regularly and track what they cost over time.' }}
            </p>
            <button class="btn-primary" (click)="add()"><ion-icon name="add"></ion-icon> Add item</button>
          </div>
        } @else if (layout.isDesktop()) {
          <!-- ================= DESKTOP: table + basket ================= -->
          <div class="list-grid" style="margin-top: 14px">
            <div class="card tbl-card">
              <div class="tbl-head">
                <span></span><span>Item</span><span>Last price</span><span>Last bought</span><span class="r">Total spent</span><span></span>
              </div>
              @for (g of groups(); track g.label) {
                @if (g.label) {
                  <div class="tbl-group">{{ emoji(g.label) }} {{ g.label }} <em>· {{ g.items.length }}</em></div>
                }
                @for (it of g.items; track it.id) {
                  <div class="tbl-row" (click)="open(it)">
                    @if (it.active) {
                      <button class="check" [class.on]="store.inCart(it.id)" (click)="toggleCart($event, it)" aria-label="Add to cart">
                        @if (store.inCart(it.id)) { <ion-icon name="checkmark"></ion-icon> }
                      </button>
                    } @else { <span></span> }
                    <div class="cell-item">
                      <div class="avatar sm">{{ emoji(it.category) }}</div>
                      <div style="min-width: 0"><b>{{ it.name }}</b><small>{{ it.category }}</small></div>
                    </div>
                    <span class="num">@if (it.lastPrice) { {{ store.fmt(it.lastPrice) }}<small> /{{ it.lastUnit }}</small> } @else { <span class="sub-c">—</span> }</span>
                    <span class="sub-c">{{ lastWhen(it) || 'Never' }}</span>
                    <span class="r num">{{ store.fmt(totalSpent(it), 0) }}</span>
                    <div class="row-actions">
                      <button class="ibtn" [class.on]="store.isFavorite(it.id)" (click)="toggleFav($event, it)" title="Favorite">
                        <ion-icon [name]="store.isFavorite(it.id) ? 'star' : 'star-outline'"></ion-icon>
                      </button>
                      @if (it.active) {
                        <button class="ibtn" (click)="stop($event); buy(it)" title="Record purchase"><ion-icon name="bag-check-outline"></ion-icon></button>
                        <button class="ibtn" (click)="stop($event); setActive(it, false)" title="Pause"><ion-icon name="bed-outline"></ion-icon></button>
                      } @else {
                        <button class="ibtn" (click)="stop($event); setActive(it, true)" title="Resume"><ion-icon name="refresh-outline"></ion-icon></button>
                      }
                      <button class="ibtn danger" (click)="stop($event); remove(it)" title="Delete"><ion-icon name="trash-outline"></ion-icon></button>
                    </div>
                  </div>
                }
              }
            </div>

            <aside class="side-panel">
              <div class="card">
                <div class="card-head"><div><h3>Basket</h3><small>{{ cartCount() }} of {{ visible().length }} ticked</small></div></div>
                <div class="callout" style="margin-bottom: 12px">
                  <div><small>Estimated total</small><b>{{ store.fmt(estimate(), 0) }}</b></div>
                </div>
                @if (cartItems().length) {
                  <div class="plain-rows" style="margin-bottom: 14px">
                    @for (c of cartItems(); track c.id) {
                      <div class="row" style="cursor: default">
                        <div class="avatar sm">{{ emoji(c.category) }}</div>
                        <div class="row-main"><b>{{ c.name }}</b><span>{{ c.lastPrice ? store.fmt(c.lastPrice) + ' / ' + c.lastUnit : 'no price yet' }}</span></div>
                        <button class="ibtn" (click)="store.toggleCart(c.id)" title="Remove"><ion-icon name="close-outline"></ion-icon></button>
                      </div>
                    }
                  </div>
                  <button class="btn-primary block" (click)="checkout()"><ion-icon name="bag-check-outline"></ion-icon> Record {{ cartCount() }} purchase{{ cartCount() > 1 ? 's' : '' }}</button>
                } @else {
                  <p class="muted" style="margin: 0; line-height: 1.5">Tick items as you shop. They collect here so you can record them all in one go.</p>
                }
              </div>
              <div class="card">
                <div class="card-head"><h3>Quick stats</h3></div>
                <div class="plain-rows">
                  <div class="row" style="cursor: default"><div class="row-main"><b>Items to buy</b></div><div class="row-end"><b>{{ counts().active }}</b></div></div>
                  <div class="row" style="cursor: default"><div class="row-main"><b>Paused</b></div><div class="row-end"><b>{{ counts().inactive }}</b></div></div>
                  <div class="row" style="cursor: default"><div class="row-main"><b>Favorites</b></div><div class="row-end"><b>{{ counts().fav }}</b></div></div>
                </div>
              </div>
            </aside>
          </div>
        } @else {
          <!-- ================= MOBILE: grouped cards ================= -->
          @if (tab() === 'active') {
            <div class="callout" style="margin: 14px 0 0">
              <div><small>Estimated basket</small><b>{{ store.fmt(estimate(), 0) }}</b></div>
              <span class="muted">{{ visible().length }} items</span>
            </div>
          }

          @for (g of groups(); track g.label) {
            @if (g.label) {
              <div class="group-label">{{ emoji(g.label) }} {{ g.label }} <span>· {{ g.items.length }}</span></div>
            } @else {
              <div style="height: 12px"></div>
            }
            <div class="group-card">
              @for (it of g.items; track it.id) {
                <ion-item-sliding #slide>
                  @if (it.active) {
                    <ion-item-options side="start">
                      <ion-item-option class="opt-buy" (click)="buy(it); slide.close()">
                        <ion-icon slot="top" name="bag-check-outline"></ion-icon>Buy
                      </ion-item-option>
                    </ion-item-options>
                  }

                  <ion-item lines="none" class="row-item" detail="false" button (click)="open(it)">
                    <div class="row">
                      @if (it.active) {
                        <button class="check" [class.on]="store.inCart(it.id)" (click)="toggleCart($event, it)" aria-label="Add to cart">
                          @if (store.inCart(it.id)) { <ion-icon name="checkmark"></ion-icon> }
                        </button>
                      }
                      <div class="avatar">{{ emoji(it.category) }}</div>
                      <div class="row-main">
                        <b>{{ it.name }}</b>
                        <span>
                          @if (it.lastPrice) { {{ store.fmt(it.lastPrice) }} / {{ it.lastUnit }} · {{ lastWhen(it) }} } @else { {{ it.category }} · never bought }
                        </span>
                      </div>
                      <div class="row-end">
                        <button class="fav-btn" [class.on]="store.isFavorite(it.id)" (click)="toggleFav($event, it)" aria-label="Favorite">
                          <ion-icon [name]="store.isFavorite(it.id) ? 'star' : 'star-outline'"></ion-icon>
                        </button>
                      </div>
                    </div>
                  </ion-item>

                  <ion-item-options side="end">
                    @if (it.active) {
                      <ion-item-option class="opt-off" (click)="setActive(it, false); slide.close()">
                        <ion-icon slot="top" name="bed-outline"></ion-icon>Pause
                      </ion-item-option>
                    } @else {
                      <ion-item-option class="opt-on" (click)="setActive(it, true); slide.close()">
                        <ion-icon slot="top" name="refresh-outline"></ion-icon>Resume
                      </ion-item-option>
                    }
                    <ion-item-option class="opt-del" (click)="remove(it); slide.close()">
                      <ion-icon slot="top" name="trash-outline"></ion-icon>Delete
                    </ion-item-option>
                  </ion-item-options>
                </ion-item-sliding>
              }
            </div>
          }
          <p class="muted" style="text-align: center; margin-top: 18px">Swipe right to record a purchase · swipe left for more</p>
        }
      </div>

      @if (cartCount() > 0) {
        <div class="cart-bar">
          <div>
            <b>{{ cartCount() }} in cart</b>
            <span>Record them together at checkout</span>
          </div>
          <button class="btn-primary sm" (click)="checkout()">Checkout</button>
        </div>
      }
    </ion-content>
  `,
})
export class ListPage {
  store = inject(StoreService);
  layout = inject(LayoutService);
  private fb = inject(FeedbackService);
  private modals = inject(ModalsService);
  private router = inject(Router);

  emoji = categoryEmoji;

  tab = signal<Tab>('active');
  q = signal('');
  cat = signal('All');
  sort = signal<Sort>('category');

  constructor() {
    inject(ActivatedRoute).queryParams.subscribe((p) => {
      if (p['cat']) {
        this.cat.set(p['cat']);
        this.tab.set('active');
      }
      this.q.set(p['q'] ?? '');
    });
  }

  counts = computed(() => {
    const items = this.store.items();
    return {
      active: items.filter((i) => i.active).length,
      inactive: items.filter((i) => !i.active).length,
      fav: items.filter((i) => this.store.isFavorite(i.id)).length,
    };
  });

  usedCategories = computed(() => {
    const t = this.tab();
    const s = new Set<string>();
    for (const i of this.store.items()) {
      if (t === 'active' && !i.active) continue;
      if (t === 'inactive' && i.active) continue;
      if (t === 'favorites' && !this.store.isFavorite(i.id)) continue;
      s.add(i.category);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  });

  visible = computed(() => {
    const t = this.tab();
    const q = this.q().trim().toLowerCase();
    const cat = this.cat();
    let list = this.store.items().filter((i) => {
      if (t === 'active' && !i.active) return false;
      if (t === 'inactive' && i.active) return false;
      if (t === 'favorites' && !this.store.isFavorite(i.id)) return false;
      if (cat !== 'All' && i.category !== cat) return false;
      if (q && !(i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || i.history.some((h) => (h.store ?? '').toLowerCase().includes(q)))) return false;
      return true;
    });
    const lastDate = (i: Item) => i.history[i.history.length - 1]?.date ?? '';
    switch (this.sort()) {
      case 'name':
        list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'recent':
        list = [...list].sort((a, b) => lastDate(b).localeCompare(lastDate(a)));
        break;
      case 'price':
        list = [...list].sort((a, b) => (b.lastPrice ?? 0) - (a.lastPrice ?? 0));
        break;
      default:
        list = [...list].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    }
    return list;
  });

  groups = computed<Group[]>(() => {
    const list = this.visible();
    if (this.sort() !== 'category') return list.length ? [{ label: null, items: list }] : [];
    const map = new Map<string, Item[]>();
    for (const i of list) map.set(i.category, [...(map.get(i.category) ?? []), i]);
    return [...map.entries()].map(([label, items]) => ({ label, items }));
  });

  estimate = computed(() => this.visible().reduce((s, i) => s + (i.history[i.history.length - 1]?.totalAmount ?? 0), 0));

  cartCount = computed(() => this.store.prefs().cart.length);
  cartItems = computed(() => {
    const cart = this.store.prefs().cart;
    return this.store.items().filter((i) => cart.includes(i.id));
  });

  totalSpent(i: Item) {
    return i.history.reduce((s, e) => s + e.totalAmount, 0);
  }

  stop(ev: Event) {
    ev.stopPropagation();
  }

  setTab(t: Tab) {
    this.tab.set(t);
    this.cat.set('All');
    this.fb.tap();
  }

  cycleSort() {
    const order: Sort[] = ['category', 'name', 'recent', 'price'];
    const next = order[(order.indexOf(this.sort()) + 1) % order.length];
    this.sort.set(next);
    this.fb.tap();
    const label = { category: 'Category', name: 'Name A–Z', recent: 'Recently bought', price: 'Highest price' }[next];
    this.fb.toast(`Sorted by ${label}`, 'info', 1400);
  }

  lastWhen(i: Item) {
    const l = i.history[i.history.length - 1];
    return l ? relativeDay(l.date) : '';
  }

  open(i: Item) {
    void this.router.navigate(['/tabs/item', i.id]);
  }

  toggleCart(ev: Event, i: Item) {
    ev.stopPropagation();
    this.store.toggleCart(i.id);
    this.fb.tap();
  }

  toggleFav(ev: Event, i: Item) {
    ev.stopPropagation();
    this.store.toggleFavorite(i.id);
    this.fb.tap();
  }

  buy(i: Item) {
    void this.modals.entry(i);
  }

  setActive(i: Item, on: boolean) {
    this.store.toggleActive(i.id, on);
    this.fb.tap();
    this.fb.toast(on ? `${i.name} is back on your list` : `${i.name} paused`, 'info', 1600);
  }

  async remove(i: Item) {
    const ok = await this.fb.confirm('Delete item?', `“${i.name}” and its ${i.history.length} purchase record(s) will be removed.`, 'Delete', true);
    if (!ok) return;
    this.store.deleteItem(i.id);
    this.fb.success();
    this.fb.toast('Item deleted');
  }

  add() {
    void this.modals.addItem({ presetCategory: this.cat() !== 'All' ? this.cat() : undefined });
  }

  checkout() {
    this.fb.tap();
    void this.modals.checkout();
  }

  async refresh(ev: Event) {
    await this.store.refresh();
    (ev as CustomEvent & { detail: { complete: () => void } }).detail.complete();
  }
}
