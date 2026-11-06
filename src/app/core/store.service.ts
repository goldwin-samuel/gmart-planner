import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { flatten } from './analytics';
import {
  ApiResponse,
  CURRENCIES,
  Category,
  DEFAULT_PREFS,
  DEFAULT_SETTINGS,
  HistoryEntry,
  Income,
  Item,
  LocalPrefs,
  Settings,
} from './models';
import { StorageService } from './storage.service';
import { csvCell, normaliseDate, uid } from './utils';

const K = {
  items: 'gmartItems',
  settings: 'gmartSettings',
  cats: 'gmartCats',
  prefs: 'gmartPrefs',
  dirty: 'gmartDirty',
  income: 'gmartIncome',
  dirtyInc: 'gmartDirtyInc',
};

export type SyncState = 'idle' | 'syncing' | 'error';

function normaliseEntry(e: any): HistoryEntry {
  const quantity = Number(e?.quantity) || 0;
  const totalAmount = Number(e?.totalAmount) || 0;
  const unitPrice = Number(e?.unitPrice) || (quantity ? totalAmount / quantity : 0);
  return {
    date: normaliseDate(e?.date),
    quantity,
    unit: String(e?.unit ?? 'unit'),
    totalAmount,
    unitPrice,
    store: e?.store ? String(e.store) : undefined,
    note: e?.note ? String(e.note) : undefined,
  };
}

export function normaliseItem(raw: any): Item {
  let history = raw?.history;
  if (typeof history === 'string') {
    try {
      history = JSON.parse(history);
    } catch {
      history = [];
    }
  }
  if (!Array.isArray(history)) history = [];
  const entries: HistoryEntry[] = history.map(normaliseEntry).sort((a: HistoryEntry, b: HistoryEntry) => a.date.localeCompare(b.date));
  const last = entries[entries.length - 1];
  const a = raw?.active;
  const lp = raw?.lastPrice;
  return {
    id: String(raw?.id ?? uid()),
    name: String(raw?.name ?? ''),
    category: String(raw?.category || 'Other'),
    active: a === true || a === 'TRUE' || a === 'true' || a === 1 || a === '1',
    lastPrice: lp != null && lp !== '' && !isNaN(Number(lp)) ? Number(lp) : (last?.unitPrice ?? null),
    lastUnit: raw?.lastUnit ? String(raw.lastUnit) : (last?.unit ?? null),
    history: entries,
  };
}

export function normaliseIncome(raw: any): Income {
  return {
    id: String(raw?.id ?? uid()),
    date: normaliseDate(raw?.date),
    amount: Number(raw?.amount) || 0,
    source: String(raw?.source || 'Other'),
    note: raw?.note ? String(raw.note) : undefined,
  };
}

function withLast(item: Item): Item {
  const h = [...item.history].sort((a, b) => a.date.localeCompare(b.date));
  const last = h[h.length - 1];
  return { ...item, history: h, lastPrice: last ? last.unitPrice : null, lastUnit: last ? last.unit : null };
}

function sameEntry(a: HistoryEntry, b: HistoryEntry) {
  return a.date === b.date && a.quantity === b.quantity && a.unit === b.unit && a.totalAmount === b.totalAmount;
}

@Injectable({ providedIn: 'root' })
export class StoreService {
  private api = inject(ApiService);
  private storage = inject(StorageService);

  items = signal<Item[]>([]);
  settings = signal<Settings>({ ...DEFAULT_SETTINGS });
  income = signal<Income[]>([]);
  categories = signal<Category[]>([]);
  prefs = signal<LocalPrefs>({ ...DEFAULT_PREFS });
  sync = signal<SyncState>('idle');
  lastSynced = signal<number | null>(null);
  hydrated = signal(false);

  purchases = computed(() => flatten(this.items()));

  /** Shops seen so far, most used first (feeds the store autocomplete). */
  shops = computed(() => {
    const n = new Map<string, number>();
    for (const p of this.purchases()) {
      const s = (p.entry.store || '').trim();
      if (s) n.set(s, (n.get(s) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  });

  allCategories = computed(() => {
    const seen = new Map<string, string>();
    for (const c of this.categories()) if (c.name) seen.set(c.name.toLowerCase(), c.name);
    for (const i of this.items()) if (i.category) seen.set(i.category.toLowerCase(), seen.get(i.category.toLowerCase()) ?? i.category);
    seen.delete('other');
    return [...seen.values()].sort((a, b) => a.localeCompare(b)).concat('Other');
  });

  private dirty = false;
  private dirtyInc = false;
  private pushingInc = false;
  private timerInc: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;
  private pushAgain = false;
  private refreshing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /* ---------- formatting ---------- */

  fmt = (n: number | null | undefined, digits = 2): string => {
    if (n == null || isNaN(Number(n))) return '—';
    const s = this.settings();
    try {
      return new Intl.NumberFormat(s.locale, {
        style: 'currency',
        currency: s.currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(n);
    } catch {
      return `${s.currency} ${Number(n).toFixed(digits)}`;
    }
  };

  fmtCompact = (n: number): string => {
    const s = this.settings();
    try {
      return new Intl.NumberFormat(s.locale, {
        style: 'currency',
        currency: s.currency,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(n);
    } catch {
      return String(Math.round(n));
    }
  };

  /* ---------- lifecycle ---------- */

  async hydrate(): Promise<void> {
    const [items, settings, cats, prefs, dirty, income, dirtyInc] = await Promise.all([
      this.storage.get<any[]>(K.items),
      this.storage.get<Settings>(K.settings),
      this.storage.get<Category[]>(K.cats),
      this.storage.get<LocalPrefs>(K.prefs),
      this.storage.get<boolean>(K.dirty),
      this.storage.get<any[]>(K.income),
      this.storage.get<boolean>(K.dirtyInc),
    ]);
    this.income.set((income ?? []).map(normaliseIncome));
    this.dirtyInc = !!dirtyInc;
    this.items.set((items ?? []).map(normaliseItem));
    this.settings.set(this.normaliseSettings(settings ?? {}));
    this.categories.set(cats ?? []);
    this.prefs.set({ ...DEFAULT_PREFS, ...(prefs ?? {}) });
    this.dirty = !!dirty;
    this.hydrated.set(true);
  }

  async reset(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (this.timerInc) clearTimeout(this.timerInc);
    this.items.set([]);
    this.income.set([]);
    this.dirtyInc = false;
    this.categories.set([]);
    this.settings.set({ ...DEFAULT_SETTINGS });
    this.prefs.set({ ...DEFAULT_PREFS });
    this.dirty = false;
    this.sync.set('idle');
    this.lastSynced.set(null);
    await Promise.all(Object.values(K).map((k) => this.storage.remove(k)));
  }

  private normaliseSettings(s: Partial<Settings> | Record<string, any>): Settings {
    const merged = { ...DEFAULT_SETTINGS, ...s } as Settings;
    merged.monthlyTarget = Number(merged.monthlyTarget) || DEFAULT_SETTINGS.monthlyTarget;
    const cur = CURRENCIES.find((c) => c.code === merged.currency) ?? CURRENCIES[0];
    merged.currency = cur.code;
    merged.locale = cur.locale;
    return merged;
  }

  /** Pull from cloud. Pending local edits are pushed first so they are never overwritten. */
  async refresh(): Promise<boolean> {
    if (!this.api.userId || this.refreshing) return false;
    this.refreshing = true;
    this.sync.set('syncing');
    try {
      if (this.dirty) await this.pushItems();
      if (this.dirtyInc) await this.pushIncome();

      const [ir, sr, cr] = await Promise.all([this.api.getItems(), this.api.getSettings(), this.api.getCategories()]);

      if (ir.status !== 'success') {
        this.sync.set('error');
        return false;
      }
      if (!this.dirty) {
        this.items.set(((ir['items'] as any[]) ?? []).map(normaliseItem));
        await this.persistItems();
      }
      // Income lives in a newer backend action; an older script simply won't have it.
      const incr = await this.api.getIncome();
      if (incr.status === 'success' && !this.dirtyInc) {
        this.income.set(((incr['income'] as any[]) ?? []).map(normaliseIncome));
        await this.storage.set(K.income, this.income());
      }
      if (sr.status === 'success' && sr['settings'] && Object.keys(sr['settings']).length) {
        this.settings.set(this.normaliseSettings(sr['settings']));
        await this.storage.set(K.settings, this.settings());
      }
      if (cr.status === 'success') {
        this.categories.set(((cr['categories'] as any[]) ?? []).map((c) => ({ name: String(c?.name ?? c) })));
        await this.storage.set(K.cats, this.categories());
      }
      this.sync.set('idle');
      this.lastSynced.set(Date.now());
      return true;
    } finally {
      this.refreshing = false;
    }
  }

  async syncNow(): Promise<boolean> {
    return this.refresh();
  }

  /* ---------- persistence + push ---------- */

  private async persistItems() {
    await this.storage.set(K.items, this.items());
  }

  private queueSave() {
    this.dirty = true;
    void this.storage.set(K.dirty, true);
    void this.persistItems();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.pushItems(), 900);
  }

  async pushItems(): Promise<boolean> {
    if (!this.api.userId) return false;
    if (this.pushing) {
      this.pushAgain = true;
      return false;
    }
    this.pushing = true;
    this.sync.set('syncing');
    let ok = false;
    try {
      const r = await this.api.saveItems(this.items());
      ok = r.status === 'success';
      if (ok && !this.pushAgain) {
        this.dirty = false;
        await this.storage.set(K.dirty, false);
        this.lastSynced.set(Date.now());
        this.sync.set('idle');
      } else if (!ok) {
        this.sync.set('error');
      }
    } finally {
      this.pushing = false;
    }
    if (this.pushAgain) {
      this.pushAgain = false;
      return this.pushItems();
    }
    return ok;
  }

  get hasPending() {
    return this.dirty || this.dirtyInc;
  }

  /* ---------- items ---------- */

  addItem(name: string, category: string): { ok: boolean; error?: string; item?: Item } {
    const n = name.trim();
    if (!n) return { ok: false, error: 'Enter an item name' };
    if (this.items().some((i) => i.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'Item already exists' };
    const item: Item = { id: uid(), name: n, category: category || 'Other', active: true, lastPrice: null, lastUnit: null, history: [] };
    this.items.update((l) => [...l, item]);
    this.queueSave();
    return { ok: true, item };
  }

  updateItem(id: string, patch: Partial<Pick<Item, 'name' | 'category' | 'active'>>): { ok: boolean; error?: string } {
    if (patch.name != null) {
      const n = patch.name.trim();
      if (!n) return { ok: false, error: 'Enter an item name' };
      if (this.items().some((i) => i.id !== id && i.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'Item already exists' };
      patch = { ...patch, name: n };
    }
    this.items.update((l) => l.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    this.queueSave();
    return { ok: true };
  }

  toggleActive(id: string, active: boolean) {
    this.updateItem(id, { active });
    if (!active) this.setCart(id, false);
  }

  deleteItem(id: string) {
    this.items.update((l) => l.filter((i) => i.id !== id));
    this.setCart(id, false);
    this.setFavorite(id, false);
    this.queueSave();
  }

  /* ---------- purchases ---------- */

  addPurchase(itemId: string, e: Omit<HistoryEntry, 'unitPrice'>) {
    const entry: HistoryEntry = { ...e, unitPrice: e.quantity ? e.totalAmount / e.quantity : 0 };
    this.items.update((l) => l.map((i) => (i.id === itemId ? withLast({ ...i, history: [...i.history, entry] }) : i)));
    this.queueSave();
  }

  addPurchases(list: { itemId: string; entry: Omit<HistoryEntry, 'unitPrice'> }[]) {
    const byItem = new Map<string, HistoryEntry[]>();
    for (const { itemId, entry } of list) {
      const full: HistoryEntry = { ...entry, unitPrice: entry.quantity ? entry.totalAmount / entry.quantity : 0 };
      byItem.set(itemId, [...(byItem.get(itemId) ?? []), full]);
    }
    this.items.update((l) => l.map((i) => (byItem.has(i.id) ? withLast({ ...i, history: [...i.history, ...byItem.get(i.id)!] }) : i)));
    this.queueSave();
  }

  updatePurchase(itemId: string, oldEntry: HistoryEntry, e: Omit<HistoryEntry, 'unitPrice'>) {
    const entry: HistoryEntry = { ...e, unitPrice: e.quantity ? e.totalAmount / e.quantity : 0 };
    this.items.update((l) =>
      l.map((i) => {
        if (i.id !== itemId) return i;
        const idx = i.history.findIndex((h) => sameEntry(h, oldEntry));
        if (idx < 0) return i;
        const history = [...i.history];
        history[idx] = entry;
        return withLast({ ...i, history });
      }),
    );
    this.queueSave();
  }

  removePurchase(itemId: string, entry: HistoryEntry) {
    this.items.update((l) =>
      l.map((i) => {
        if (i.id !== itemId) return i;
        const idx = i.history.findIndex((h) => sameEntry(h, entry));
        if (idx < 0) return i;
        const history = i.history.filter((_, n) => n !== idx);
        return withLast({ ...i, history });
      }),
    );
    this.queueSave();
  }

  /* ---------- income ---------- */

  private queueSaveIncome() {
    this.dirtyInc = true;
    void this.storage.set(K.dirtyInc, true);
    void this.storage.set(K.income, this.income());
    if (this.timerInc) clearTimeout(this.timerInc);
    this.timerInc = setTimeout(() => void this.pushIncome(), 900);
  }

  async pushIncome(): Promise<boolean> {
    if (!this.api.userId || this.pushingInc) return false;
    this.pushingInc = true;
    this.sync.set('syncing');
    try {
      const snapshot = this.income();
      const r = await this.api.saveIncome(snapshot);
      if (r.status === 'success') {
        if (snapshot === this.income()) {
          this.dirtyInc = false;
          await this.storage.set(K.dirtyInc, false);
        }
        this.lastSynced.set(Date.now());
        this.sync.set('idle');
        return true;
      }
      this.sync.set('error');
      return false;
    } finally {
      this.pushingInc = false;
    }
  }

  addIncome(i: Omit<Income, 'id'>): Income {
    const inc: Income = { ...i, id: uid() };
    this.income.update((l) => [...l, inc]);
    this.queueSaveIncome();
    return inc;
  }

  updateIncome(id: string, patch: Omit<Income, 'id'>) {
    this.income.update((l) => l.map((x) => (x.id === id ? { ...patch, id } : x)));
    this.queueSaveIncome();
  }

  deleteIncome(id: string) {
    this.income.update((l) => l.filter((x) => x.id !== id));
    this.queueSaveIncome();
  }

  /* ---------- helpers for bill scanning ---------- */

  findItem(name: string): Item | undefined {
    const n = name.trim().toLowerCase();
    return this.items().find((i) => i.name.toLowerCase() === n);
  }

  /* ---------- categories ---------- */

  async addCategory(name: string): Promise<ApiResponse> {
    const n = name.trim();
    if (!n) return { status: 'error', message: 'Enter a category name' };
    if (this.allCategories().some((c) => c.toLowerCase() === n.toLowerCase())) {
      return { status: 'error', message: 'Category already exists' };
    }
    this.categories.update((l) => [...l, { name: n }]);
    await this.storage.set(K.cats, this.categories());
    const r = await this.api.saveCategory(n);
    if (r.status !== 'success') {
      // keep it locally; it still works for items and will be re-added when used
      return { status: 'error', message: r.message || 'Saved on this device only' };
    }
    return r;
  }

  /* ---------- settings ---------- */

  async saveSettings(patch: Partial<Settings>): Promise<ApiResponse> {
    this.settings.set(this.normaliseSettings({ ...this.settings(), ...patch }));
    await this.storage.set(K.settings, this.settings());
    if (!this.api.userId) return { status: 'error', message: 'Not signed in' };
    return this.api.saveSettings(this.settings());
  }

  /* ---------- cart + favourites (device-local) ---------- */

  private async savePrefs() {
    await this.storage.set(K.prefs, this.prefs());
  }

  inCart = (id: string) => this.prefs().cart.includes(id);
  isFavorite = (id: string) => this.prefs().favorites.includes(id);

  setCart(id: string, on: boolean) {
    const cart = this.prefs().cart;
    if (on === cart.includes(id)) return;
    this.prefs.update((p) => ({ ...p, cart: on ? [...p.cart, id] : p.cart.filter((x) => x !== id) }));
    void this.savePrefs();
  }

  toggleCart(id: string) {
    this.setCart(id, !this.inCart(id));
  }

  clearCart(ids?: string[]) {
    this.prefs.update((p) => ({ ...p, cart: ids ? p.cart.filter((x) => !ids.includes(x)) : [] }));
    void this.savePrefs();
  }

  setFavorite(id: string, on: boolean) {
    const fav = this.prefs().favorites;
    if (on === fav.includes(id)) return;
    this.prefs.update((p) => ({ ...p, favorites: on ? [...p.favorites, id] : p.favorites.filter((x) => x !== id) }));
    void this.savePrefs();
  }

  toggleFavorite(id: string) {
    this.setFavorite(id, !this.isFavorite(id));
  }

  /* ---------- export / import ---------- */

  toCSV(): string {
    const rows = [['Date', 'Item', 'Category', 'Quantity', 'Unit', 'Total', 'Unit price', 'Store', 'Note']];
    for (const p of [...this.purchases()].sort((a, b) => b.entry.date.localeCompare(a.entry.date))) {
      const e = p.entry;
      rows.push([e.date, p.item.name, p.item.category, String(e.quantity), e.unit, e.totalAmount.toFixed(2), e.unitPrice.toFixed(2), e.store ?? '', e.note ?? '']);
    }
    return rows.map((r) => r.map(csvCell).join(',')).join('\n');
  }

  incomeCSV(): string {
    const rows = [['Date', 'Source', 'Amount', 'Note']];
    for (const i of [...this.income()].sort((a, b) => b.date.localeCompare(a.date))) rows.push([i.date, i.source, i.amount.toFixed(2), i.note ?? '']);
    return rows.map((r) => r.map(csvCell).join(',')).join('\n');
  }

  toBackupJSON(): string {
    return JSON.stringify(
      { app: 'gmart-planner', version: 2, exportedAt: new Date().toISOString(), settings: this.settings(), categories: this.categories(), items: this.items(), income: this.income() },
      null,
      2,
    );
  }

  /** Merge a backup file. Items with the same id are replaced, new ones added. */
  importBackup(json: string): { ok: boolean; message: string } {
    try {
      const data = JSON.parse(json);
      const incoming: any[] = Array.isArray(data) ? data : data?.items;
      if (!Array.isArray(incoming)) return { ok: false, message: 'File does not look like a G-Mart backup' };
      const map = new Map(this.items().map((i) => [i.id, i]));
      let added = 0;
      for (const raw of incoming) {
        const it = normaliseItem(raw);
        if (!it.name) continue;
        if (!map.has(it.id)) added++;
        map.set(it.id, it);
      }
      this.items.set([...map.values()]);
      this.queueSave();
      if (Array.isArray(data?.income)) {
        const im = new Map(this.income().map((i) => [i.id, i]));
        for (const raw of data.income) {
          const inc = normaliseIncome(raw);
          if (inc.amount > 0) im.set(inc.id, inc);
        }
        this.income.set([...im.values()]);
        this.queueSaveIncome();
      }
      return { ok: true, message: `Imported ${incoming.length} items (${added} new)` };
    } catch {
      return { ok: false, message: 'Could not read that file' };
    }
  }
}
