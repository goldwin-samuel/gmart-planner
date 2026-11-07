import { Component, HostListener, computed, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular/standalone';
import { filter, map } from 'rxjs';
import { monthKey, sumMonth } from '../../core/analytics';
import { AuthService } from '../../core/auth.service';
import { FeedbackService } from '../../core/feedback.service';
import { LayoutService } from '../../core/layout.service';
import { StoreService } from '../../core/store.service';
import { ThemeService } from '../../core/theme.service';
import { VoiceControlService } from '../../core/voice-control.service';
import { ModalsService } from '../../modals/modals.service';

type Nav = 'home' | 'list' | 'money' | 'insights' | 'categories' | 'more' | 'admin';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [FormsModule, RouterLink, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <div class="shell" [class.collapsed]="layout.collapsed()">
      <!-- ================= SIDEBAR (desktop) ================= -->
      <aside class="side">
        <div class="side-brand">
          <div class="side-logo">G</div>
          <div class="side-brand-txt"><b>G-Mart</b><small>Planner</small></div>
          <button class="side-collapse" (click)="layout.toggleCollapsed()" [attr.aria-label]="layout.collapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
            <ion-icon name="chevron-back"></ion-icon>
          </button>
        </div>

        <nav class="side-nav">
          <div class="side-label">Workspace</div>
          <a class="side-link" routerLink="/tabs/home" [class.active]="nav() === 'home'" title="Dashboard">
            <ion-icon name="grid-outline"></ion-icon><span>Dashboard</span>
          </a>
          <a class="side-link" routerLink="/tabs/list" [class.active]="nav() === 'list'" title="Shopping">
            <ion-icon name="cart-outline"></ion-icon><span>Shopping</span>
            @if (activeCount()) { <em class="side-badge">{{ activeCount() }}</em> }
          </a>
          <a class="side-link" routerLink="/tabs/money" [class.active]="nav() === 'money'" title="Money">
            <ion-icon name="wallet-outline"></ion-icon><span>Money</span>
          </a>
          <a class="side-link" routerLink="/tabs/insights" [class.active]="nav() === 'insights'" title="Insights">
            <ion-icon name="stats-chart-outline"></ion-icon><span>Insights</span>
          </a>
          <a class="side-link" routerLink="/tabs/categories" [class.active]="nav() === 'categories'" title="Categories">
            <ion-icon name="pricetags-outline"></ion-icon><span>Categories</span>
          </a>

          <div class="side-label">Account</div>
          <a class="side-link" routerLink="/tabs/more" [class.active]="nav() === 'more'" title="Settings">
            <ion-icon name="settings-outline"></ion-icon><span>Settings</span>
          </a>
          @if (auth.isAdmin()) {
            <a class="side-link" routerLink="/tabs/admin" [class.active]="nav() === 'admin'" title="Users">
              <ion-icon name="people-outline"></ion-icon><span>Users</span>
            </a>
          }
        </nav>

        <div class="side-budget">
          <div class="sb-top"><span>{{ monthName }} budget</span><b>{{ budgetPct() }}%</b></div>
          <div class="sb-bar"><i [style.width.%]="budgetPctCapped()"></i></div>
          <small>{{ store.fmt(spent(), 0) }} of {{ store.fmt(store.settings().monthlyTarget, 0) }}</small>
        </div>

        <div class="side-user">
          <div class="su-ava">{{ initial() }}</div>
          <div class="su-txt"><b>{{ auth.user()?.name || auth.user()?.username }}</b><small>{{ auth.user()?.role || 'user' }}</small></div>
          <button class="su-out" (click)="logout()" aria-label="Sign out" title="Sign out"><ion-icon name="log-out-outline"></ion-icon></button>
        </div>
      </aside>

      <!-- ================= MAIN ================= -->
      <div class="main">
        <header class="topbar">
          <div class="crumbs">
            <span>{{ section() }}</span><ion-icon name="chevron-forward"></ion-icon><b>{{ title() }}</b>
          </div>

          <label class="top-search">
            <ion-icon name="search-outline"></ion-icon>
            <input #gs [(ngModel)]="query" placeholder="Search items and categories" (keyup.enter)="search()" />
            @if (query) { <ion-icon name="close-circle" (click)="clearSearch($event)"></ion-icon> } @else { <kbd>/</kbd> }
          </label>

          <div class="top-actions">
            <button class="sync-pill" [class.err]="store.sync() === 'error'" (click)="store.syncNow()">
              <ion-icon [name]="syncIcon()" [class.spin-i]="store.sync() === 'syncing'"></ion-icon>{{ syncText() }}
            </button>
            <button class="icon-btn flat mic-top" (click)="voiceControl()" aria-label="Voice control" title="Voice control">
              <ion-icon name="mic-outline"></ion-icon>
            </button>
            <button class="icon-btn flat" (click)="toggleDark()" [attr.aria-label]="'Toggle dark mode'">
              <ion-icon [name]="theme.isDark() ? 'sunny-outline' : 'moon-outline'"></ion-icon>
            </button>
            <button class="icon-btn flat" [class.on]="layout.themePanel()" (click)="layout.themePanel.set(!layout.themePanel())" aria-label="Theme settings">
              <ion-icon name="color-palette-outline"></ion-icon>
            </button>
            <button class="btn-primary sm" (click)="toggleMenu()" aria-haspopup="menu" [attr.aria-expanded]="menu()"><ion-icon name="add"></ion-icon> Add</button>
          </div>

          @if (layout.themePanel()) {
            <div class="tp-backdrop" (click)="layout.themePanel.set(false)"></div>
            <div class="theme-panel pop-in" role="dialog" aria-label="Theme settings">
              <div class="tp-head">
                <div><b>Theme settings</b><small>Personalise how the app looks</small></div>
                <button class="icon-btn flat" (click)="layout.themePanel.set(false)" aria-label="Close"><ion-icon name="close-outline"></ion-icon></button>
              </div>

              <div class="tp-sec">
                <label>Appearance</label>
                <div class="seg">
                  <button [class.on]="theme.mode() === 'light'" (click)="theme.setMode('light')"><ion-icon name="sunny-outline"></ion-icon> Light</button>
                  <button [class.on]="theme.mode() === 'dark'" (click)="theme.setMode('dark')"><ion-icon name="moon-outline"></ion-icon> Dark</button>
                  <button [class.on]="theme.mode() === 'system'" (click)="theme.setMode('system')">System</button>
                </div>
              </div>

              <div class="tp-sec">
                <label>Accent colour</label>
                <div class="swatches">
                  @for (k of theme.accentKeys; track k) {
                    <button
                      class="swatch"
                      [class.on]="theme.accent() === k"
                      [style.background]="'linear-gradient(135deg,' + theme.accents[k].a + ',' + theme.accents[k].b + ')'"
                      [attr.aria-label]="theme.accents[k].name"
                      [title]="theme.accents[k].name"
                      (click)="theme.setAccent(k)"
                    >
                      @if (theme.accent() === k) { <ion-icon name="checkmark"></ion-icon> }
                    </button>
                  }
                </div>
              </div>

              <div class="tp-sec">
                <label>Density</label>
                <div class="seg">
                  <button [class.on]="theme.density() === 'comfortable'" (click)="theme.setDensity('comfortable')">Comfortable</button>
                  <button [class.on]="theme.density() === 'compact'" (click)="theme.setDensity('compact')">Compact</button>
                </div>
              </div>

              <div class="tp-sec">
                <label>Corners</label>
                <div class="seg">
                  <button [class.on]="theme.corners() === 'soft'" (click)="theme.setCorners('soft')">Rounded</button>
                  <button [class.on]="theme.corners() === 'sharp'" (click)="theme.setCorners('sharp')">Sharp</button>
                </div>
              </div>

              <div class="tp-sec">
                <label>Sidebar</label>
                <div class="seg">
                  <button [class.on]="!layout.collapsed()" (click)="layout.setCollapsed(false)">Expanded</button>
                  <button [class.on]="layout.collapsed()" (click)="layout.setCollapsed(true)">Icons only</button>
                </div>
              </div>

              <button class="btn-ghost block sm" (click)="theme.reset(); layout.setCollapsed(false)">Reset to defaults</button>
            </div>
          }
        </header>

        <button class="mic-fab" (click)="voiceControl()" aria-label="Voice control"><ion-icon name="mic"></ion-icon></button>
        <ion-tabs>
          <ion-tab-bar slot="bottom" class="gm-tabbar">
            <ion-tab-button tab="home" (click)="fb.tap()">
              <ion-icon name="grid-outline"></ion-icon>
              <ion-label>Home</ion-label>
            </ion-tab-button>
            <ion-tab-button tab="list" (click)="fb.tap()">
              <ion-icon name="cart-outline"></ion-icon>
              <ion-label>Shop</ion-label>
            </ion-tab-button>

            <button class="tab-add" aria-label="Add" (click)="toggleMenu()"><ion-icon name="add"></ion-icon></button>

            <ion-tab-button tab="money" (click)="fb.tap()">
              <ion-icon name="wallet-outline"></ion-icon>
              <ion-label>Money</ion-label>
            </ion-tab-button>
            <ion-tab-button tab="more" (click)="fb.tap()">
              <ion-icon name="settings-outline"></ion-icon>
              <ion-label>More</ion-label>
            </ion-tab-button>
          </ion-tab-bar>
        </ion-tabs>
      </div>

      @if (menu()) {
        <div class="menu-backdrop" (click)="menu.set(false)"></div>
        <div class="add-menu pop-in" role="menu">
          <button role="menuitem" (click)="pick('item')">
            <span class="am-ico"><ion-icon name="cart-outline"></ion-icon></span>
            <span><b>Add item</b><small>New product to your list</small></span>
          </button>
          <button role="menuitem" (click)="pick('income')">
            <span class="am-ico in"><ion-icon name="arrow-down-circle-outline"></ion-icon></span>
            <span><b>Record income</b><small>Salary, business, refunds…</small></span>
          </button>
          <button role="menuitem" (click)="pick('voice')">
            <span class="am-ico voice"><ion-icon name="mic-outline"></ion-icon></span>
            <span><b>Add by voice</b><small>Speak a purchase – I’ll guide you</small></span>
          </button>
          <button role="menuitem" (click)="pick('voice-income')">
            <span class="am-ico voice"><ion-icon name="mic-outline"></ion-icon></span>
            <span><b>Income by voice</b><small>“Received 50000 salary”</small></span>
          </button>
          <button role="menuitem" (click)="pick('scan')">
            <span class="am-ico scan"><ion-icon name="camera-outline"></ion-icon></span>
            <span><b>Scan a bill</b><small>Photo → items, auto-sorted</small></span>
          </button>
          <button role="menuitem" (click)="pick('bulk')">
            <span class="am-ico bulk"><ion-icon name="document-text-outline"></ion-icon></span>
            <span><b>Bulk upload</b><small>Excel template → review → add</small></span>
          </button>
        </div>
      }
    </div>
  `,
})
export class TabsPage {
  auth = inject(AuthService);
  store = inject(StoreService);
  theme = inject(ThemeService);
  layout = inject(LayoutService);
  fb = inject(FeedbackService);
  private modals = inject(ModalsService);
  private router = inject(Router);

  @ViewChild('gs') gs?: ElementRef<HTMLInputElement>;

  query = '';
  monthName = new Date().toLocaleDateString('en-US', { month: 'long' });

  private url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  nav = computed<Nav>(() => {
    const u = this.url();
    if (u.includes('/tabs/list') || u.includes('/tabs/item')) return 'list';
    if (u.includes('/tabs/money')) return 'money';
    if (u.includes('/tabs/insights')) return 'insights';
    if (u.includes('/tabs/categories')) return 'categories';
    if (u.includes('/tabs/more')) return 'more';
    if (u.includes('/tabs/admin')) return 'admin';
    return 'home';
  });

  title = computed(() => {
    const u = this.url();
    if (u.includes('/tabs/item')) return 'Item details';
    return { home: 'Dashboard', list: 'Shopping list', money: 'Money', insights: 'Insights', categories: 'Categories', more: 'Settings', admin: 'Users' }[this.nav()];
  });

  section = computed(() => (this.nav() === 'more' || this.nav() === 'admin' ? 'Account' : 'Workspace'));

  activeCount = computed(() => this.store.items().filter((i) => i.active).length);
  spent = computed(() => sumMonth(this.store.purchases(), monthKey()));
  budgetPct = computed(() => {
    const t = this.store.settings().monthlyTarget;
    return t > 0 ? Math.round((this.spent() / t) * 100) : 0;
  });
  budgetPctCapped = computed(() => Math.min(this.budgetPct(), 100));

  initial() {
    return (this.auth.user()?.name || this.auth.user()?.username || '?')[0].toUpperCase();
  }

  syncIcon() {
    const s = this.store.sync();
    return s === 'error' ? 'cloud-offline-outline' : s === 'syncing' ? 'sync-outline' : 'cloud-done-outline';
  }

  syncText() {
    const s = this.store.sync();
    if (s === 'syncing') return 'Syncing…';
    if (s === 'error') return this.store.hasPending ? 'Offline · saved locally' : 'Sync failed';
    const t = this.store.lastSynced();
    return t ? `Synced ${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Synced';
  }

  toggleDark() {
    this.theme.setMode(this.theme.isDark() ? 'light' : 'dark');
  }

  menu = signal(false);

  toggleMenu() {
    this.fb.tap();
    this.menu.update((v) => !v);
  }

  private vc = inject(VoiceControlService);

  voiceControl() {
    this.fb.tap();
    this.menu.set(false);
    void this.vc.start();
  }

  pick(what: 'item' | 'income' | 'scan' | 'bulk' | 'voice' | 'voice-income') {
    this.menu.set(false);
    if (what === 'item') void this.modals.addItem();
    else if (what === 'income') void this.modals.income();
    else if (what === 'bulk') void this.modals.bulk();
    else if (what === 'voice') void this.modals.voiceEntry('purchase');
    else if (what === 'voice-income') void this.modals.voiceEntry('income');
    else void this.modals.scan();
  }

  search() {
    const q = this.query.trim();
    void this.router.navigate(['/tabs/list'], { queryParams: { q: q || null } });
  }

  clearSearch(ev: Event) {
    ev.preventDefault();
    this.query = '';
    this.search();
  }

  @HostListener('window:keydown', ['$event'])
  onKey(ev: KeyboardEvent) {
    const t = ev.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (ev.key === '/' && !typing && this.layout.isDesktop()) {
      ev.preventDefault();
      this.gs?.nativeElement.focus();
    }
    if (ev.altKey && ev.key.toLowerCase() === 'v') {
      ev.preventDefault();
      this.voiceControl();
    }
    if (ev.key === 'Escape') {
      this.layout.themePanel.set(false);
      this.menu.set(false);
    }
  }

  async logout() {
    const ok = await this.fb.confirm(
      'Sign out?',
      this.store.hasPending ? 'You have changes that have not synced yet. Signing out will discard them.' : 'Data stored on this device will be cleared. Your cloud data stays safe.',
      'Sign out',
      true,
    );
    if (!ok) return;
    await this.store.reset();
    await this.auth.logout();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
