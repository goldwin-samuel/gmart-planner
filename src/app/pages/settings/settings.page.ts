import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonToggle } from '@ionic/angular/standalone';
import { AuthService } from '../../core/auth.service';
import { FeedbackService } from '../../core/feedback.service';
import { FileService } from '../../core/file.service';
import { CURRENCIES, ThemeMode } from '../../core/models';
import { StoreService } from '../../core/store.service';
import { ThemeService } from '../../core/theme.service';
import { todayISO } from '../../core/utils';
import { ModalsService } from '../../modals/modals.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon, IonToggle],
  template: `
    <ion-content [fullscreen]="true">
      <div class="wrap narrow">
        <div class="page-head">
          <div class="eyebrow">Preferences</div>
          <h1 class="title">Settings</h1>
        </div>

        <div class="set-grid">
          <!-- left column -->
          <div class="col">
            <div class="card">
              <div class="profile">
                <div class="pf-ava">{{ initial() }}</div>
                <div style="min-width: 0">
                  <b>{{ auth.user()?.name || auth.user()?.username }}</b>
                  <small>&#64;{{ auth.user()?.username }}</small>
                </div>
                <span class="pill" style="margin-left: auto; text-transform: capitalize">{{ auth.user()?.role || 'user' }}</span>
              </div>
            </div>

            <div class="card">
              <div class="card-head"><div><h3>Monthly budget</h3><small>Drives the dashboard ring and alerts</small></div></div>
              <div style="display: flex; gap: 10px">
                <input class="inp" type="number" inputmode="decimal" [(ngModel)]="target" placeholder="Monthly target" />
                <button class="btn-primary" (click)="saveTarget()">Save</button>
              </div>
            </div>

            <div class="card">
              <div class="card-head"><div><h3>Appearance</h3><small>Also available from the palette icon in the header</small></div></div>
              <div class="seg" style="margin-bottom: 18px">
                @for (m of modes; track m.value) {
                  <button [class.on]="theme.mode() === m.value" (click)="setMode(m.value)">{{ m.label }}</button>
                }
              </div>
              <div class="field">
                <label>Accent colour</label>
                <div class="swatches">
                  @for (k of theme.accentKeys; track k) {
                    <button
                      class="swatch"
                      [class.on]="theme.accent() === k"
                      [style.background]="'linear-gradient(135deg,' + theme.accents[k].a + ',' + theme.accents[k].b + ')'"
                      [attr.aria-label]="theme.accents[k].name"
                      (click)="setAccent(k)"
                    >
                      @if (theme.accent() === k) { <ion-icon name="checkmark"></ion-icon> }
                    </button>
                  }
                </div>
              </div>
              <div class="grid-2">
                <div class="field" style="margin: 0">
                  <label>Density</label>
                  <div class="seg">
                    <button [class.on]="theme.density() === 'comfortable'" (click)="theme.setDensity('comfortable')">Roomy</button>
                    <button [class.on]="theme.density() === 'compact'" (click)="theme.setDensity('compact')">Compact</button>
                  </div>
                </div>
                <div class="field" style="margin: 0">
                  <label>Corners</label>
                  <div class="seg">
                    <button [class.on]="theme.corners() === 'soft'" (click)="theme.setCorners('soft')">Round</button>
                    <button [class.on]="theme.corners() === 'sharp'" (click)="theme.setCorners('sharp')">Sharp</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="set-row" style="cursor: default">
                <div class="s-ico"><ion-icon name="wallet-outline"></ion-icon></div>
                <div class="s-main">Currency</div>
                <select class="inp sm" [ngModel]="store.settings().currency" (ngModelChange)="setCurrency($event)">
                  @for (c of currencies; track c.code) { <option [value]="c.code">{{ c.symbol }} {{ c.code }}</option> }
                </select>
              </div>
              <div class="set-row" style="cursor: default">
                <div class="s-ico"><ion-icon name="notifications-outline"></ion-icon></div>
                <div class="s-main">Haptic feedback<small>Subtle vibration on actions (mobile)</small></div>
                <ion-toggle [checked]="fb.haptics()" (ionChange)="fb.setHaptics($event.detail.checked)"></ion-toggle>
              </div>
              <button class="set-row m-only" (click)="go('/tabs/insights')">
                <div class="s-ico"><ion-icon name="stats-chart-outline"></ion-icon></div>
                <div class="s-main">Insights<small>Charts, shops, price moves</small></div>
                <ion-icon name="chevron-forward"></ion-icon>
              </button>
              <button class="set-row" (click)="go('/tabs/categories')">
                <div class="s-ico"><ion-icon name="pricetags-outline"></ion-icon></div>
                <div class="s-main">Categories<small>{{ store.allCategories().length }} total</small></div>
                <ion-icon name="chevron-forward"></ion-icon>
              </button>
            </div>
          </div>

          <!-- right column -->
          <div class="col">
            <div class="card">
              <div class="card-head"><div><h3>Data &amp; sync</h3><small>{{ syncLabel() }}</small></div></div>
              <button class="set-row" (click)="syncNow()">
                <div class="s-ico"><ion-icon name="sync-outline"></ion-icon></div>
                <div class="s-main">Sync now<small>Push local changes and pull the latest</small></div>
                <ion-icon name="chevron-forward"></ion-icon>
              </button>
              <button class="set-row" (click)="exportCsv()">
                <div class="s-ico"><ion-icon name="document-text-outline"></ion-icon></div>
                <div class="s-main">Export purchases (CSV)<small>Open in Excel or Google Sheets</small></div>
                <ion-icon name="download-outline"></ion-icon>
              </button>
              <button class="set-row" (click)="exportIncomeCsv()">
                <div class="s-ico"><ion-icon name="cash-outline"></ion-icon></div>
                <div class="s-main">Export income (CSV)<small>All recorded income entries</small></div>
                <ion-icon name="download-outline"></ion-icon>
              </button>
              <button class="set-row" (click)="exportJson()">
                <div class="s-ico"><ion-icon name="download-outline"></ion-icon></div>
                <div class="s-main">Backup everything (JSON)<small>Items, purchases, income, settings</small></div>
                <ion-icon name="chevron-forward"></ion-icon>
              </button>
              <button class="set-row" (click)="picker.click()">
                <div class="s-ico"><ion-icon name="cloud-upload-outline"></ion-icon></div>
                <div class="s-main">Restore from backup<small>Merges into your current list</small></div>
                <ion-icon name="chevron-forward"></ion-icon>
              </button>
              <input #picker type="file" accept=".json,application/json" hidden (change)="importFile($event)" />
            </div>

            <div class="card">
              <div class="card-head"><div><h3>Account</h3></div></div>
              @if (auth.isAdmin()) {
                <button class="set-row" (click)="go('/tabs/admin')">
                  <div class="s-ico"><ion-icon name="people-outline"></ion-icon></div>
                  <div class="s-main">Manage users<small>Approve new registrations</small></div>
                  <ion-icon name="chevron-forward"></ion-icon>
                </button>
              }
              <button class="set-row" (click)="changePassword()">
                <div class="s-ico"><ion-icon name="key-outline"></ion-icon></div>
                <div class="s-main">Change password</div>
                <ion-icon name="chevron-forward"></ion-icon>
              </button>
              <button class="set-row" (click)="logout()">
                <div class="s-ico red"><ion-icon name="log-out-outline"></ion-icon></div>
                <div class="s-main" style="color: var(--bad)">Sign out<small>Clears data stored on this device</small></div>
              </button>
            </div>

            <p class="muted" style="text-align: center; margin: 4px 0 0">G-Mart Planner · v3.0</p>
          </div>
        </div>
      </div>
    </ion-content>
  `,
})
export class SettingsPage {
  auth = inject(AuthService);
  store = inject(StoreService);
  theme = inject(ThemeService);
  fb = inject(FeedbackService);
  private files = inject(FileService);
  private modals = inject(ModalsService);
  private router = inject(Router);

  currencies = CURRENCIES;
  modes: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  target: number | null = this.store.settings().monthlyTarget;
  busy = signal(false);

  initial() {
    return (this.auth.user()?.name || this.auth.user()?.username || '?')[0].toUpperCase();
  }

  ionViewWillEnter() {
    this.target = this.store.settings().monthlyTarget;
  }

  syncLabel() {
    const s = this.store.sync();
    if (s === 'syncing') return 'Syncing…';
    if (s === 'error') return this.store.hasPending ? 'Offline · changes saved on this device' : 'Last sync failed';
    const t = this.store.lastSynced();
    return t ? `Synced ${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Ready';
  }

  setMode(m: ThemeMode) {
    this.theme.setMode(m);
    this.fb.tap();
  }

  setAccent(a: string) {
    this.theme.setAccent(a);
    this.fb.tap();
  }

  async saveTarget() {
    const v = Number(this.target);
    if (!(v > 0)) {
      this.fb.toast('Enter a valid amount', 'error');
      return;
    }
    const r = await this.store.saveSettings({ monthlyTarget: v });
    this.fb.success();
    this.fb.toast(r.status === 'success' ? 'Budget saved' : 'Saved on this device', r.status === 'success' ? 'ok' : 'info');
  }

  async setCurrency(code: string) {
    const r = await this.store.saveSettings({ currency: code });
    this.fb.toast(r.status === 'success' ? 'Currency updated' : 'Saved on this device', r.status === 'success' ? 'ok' : 'info');
  }

  async syncNow() {
    this.fb.tap();
    const ok = await this.store.syncNow();
    this.fb.toast(ok ? 'Everything is up to date' : 'Could not reach the server', ok ? 'ok' : 'error');
  }

  async exportCsv() {
    if (!this.store.purchases().length) return this.fb.toast('No purchases to export yet', 'info');
    await this.files.saveText(`gmart-purchases-${todayISO()}.csv`, this.store.toCSV(), 'text/csv');
  }

  async exportIncomeCsv() {
    if (!this.store.income().length) return this.fb.toast('No income recorded yet', 'info');
    await this.files.saveText(`gmart-income-${todayISO()}.csv`, this.store.incomeCSV(), 'text/csv');
  }

  async exportJson() {
    await this.files.saveText(`gmart-backup-${todayISO()}.json`, this.store.toBackupJSON(), 'application/json');
  }

  async importFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const ok = await this.fb.confirm('Restore backup?', 'Items from the file are merged with your current list. Matching items are replaced.', 'Restore');
    if (!ok) return;
    const r = this.store.importBackup(await this.files.readText(file));
    this.fb.toast(r.message, r.ok ? 'ok' : 'error');
    if (r.ok) this.fb.success();
  }

  changePassword() {
    void this.modals.changePassword();
  }

  go(path: string) {
    void this.router.navigateByUrl(path);
  }

  async logout() {
    const pending = this.store.hasPending;
    const ok = await this.fb.confirm(
      'Sign out?',
      pending ? 'You have changes that have not synced yet. Signing out will discard them.' : 'Data stored on this device will be cleared. Your cloud data stays safe.',
      'Sign out',
      true,
    );
    if (!ok) return;
    await this.store.reset();
    await this.auth.logout();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
