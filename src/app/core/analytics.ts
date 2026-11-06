import { HistoryEntry, Income, Item } from './models';
import { pad } from './utils';

export interface Purchase {
  item: Item;
  entry: HistoryEntry;
  ym: string;
  day: number;
}

export function flatten(items: Item[]): Purchase[] {
  const out: Purchase[] = [];
  for (const item of items) {
    for (const entry of item.history) {
      out.push({ item, entry, ym: entry.date.slice(0, 7), day: Number(entry.date.slice(8, 10)) || 1 });
    }
  }
  return out;
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function monthLabel(ym: string, short = false): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return short
    ? d.toLocaleDateString('en-US', { month: 'short' })
    : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function sumMonth(ps: Purchase[], ym: string): number {
  let s = 0;
  for (const p of ps) if (p.ym === ym) s += p.entry.totalAmount;
  return s;
}

export function sumAll(ps: Purchase[]): number {
  let s = 0;
  for (const p of ps) s += p.entry.totalAmount;
  return s;
}

export interface CatTotal {
  name: string;
  total: number;
  pct: number;
  count: number;
}

export function categoryTotals(ps: Purchase[], ym?: string): CatTotal[] {
  const map = new Map<string, { total: number; count: number }>();
  let grand = 0;
  for (const p of ps) {
    if (ym && p.ym !== ym) continue;
    const cur = map.get(p.item.category) ?? { total: 0, count: 0 };
    cur.total += p.entry.totalAmount;
    cur.count += 1;
    map.set(p.item.category, cur);
    grand += p.entry.totalAmount;
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, total: v.total, count: v.count, pct: grand ? (v.total / grand) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

export function monthlySeries(ps: Purchase[], endYm: string, n: number): { ym: string; total: number }[] {
  const out: { ym: string; total: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const ym = shiftMonth(endYm, -i);
    out.push({ ym, total: sumMonth(ps, ym) });
  }
  return out;
}

export function dailySeries(ps: Purchase[], ym: string): number[] {
  const arr = new Array(daysInMonth(ym)).fill(0) as number[];
  for (const p of ps) if (p.ym === ym) arr[Math.min(p.day, arr.length) - 1] += p.entry.totalAmount;
  return arr;
}

export interface TopItem {
  item: Item;
  total: number;
  count: number;
}

export function topItems(ps: Purchase[], ym: string | null, n = 5): TopItem[] {
  const map = new Map<string, TopItem>();
  for (const p of ps) {
    if (ym && p.ym !== ym) continue;
    const cur = map.get(p.item.id) ?? { item: p.item, total: 0, count: 0 };
    cur.total += p.entry.totalAmount;
    cur.count += 1;
    map.set(p.item.id, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

export interface Mover {
  item: Item;
  prev: number;
  last: number;
  unit: string;
  pct: number;
}

/** Items whose latest unit price differs from the previous purchase (same unit only). */
export function priceMovers(items: Item[]): Mover[] {
  const out: Mover[] = [];
  for (const item of items) {
    const h = item.history;
    if (h.length < 2) continue;
    const a = h[h.length - 2];
    const b = h[h.length - 1];
    if (a.unit !== b.unit || !a.unitPrice) continue;
    const pct = ((b.unitPrice - a.unitPrice) / a.unitPrice) * 100;
    if (Math.abs(pct) < 0.5) continue;
    out.push({ item, prev: a.unitPrice, last: b.unitPrice, unit: b.unit, pct });
  }
  return out.sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct));
}

export interface ItemStats {
  last: number;
  avg: number;
  min: number;
  max: number;
  total: number;
  count: number;
  unit: string;
}

export function itemStats(item: Item): ItemStats | null {
  const h = item.history;
  if (!h.length) return null;
  const prices = h.map((e) => e.unitPrice);
  return {
    last: prices[prices.length - 1],
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    total: h.reduce((a, e) => a + e.totalAmount, 0),
    count: h.length,
    unit: h[h.length - 1].unit,
  };
}

export function forecast(spend: number, ym: string, now = new Date()) {
  const dim = daysInMonth(ym);
  const isCurrent = ym === monthKey(now);
  const elapsed = isCurrent ? Math.max(now.getDate(), 1) : dim;
  const avgDaily = spend / elapsed;
  return {
    avgDaily,
    projected: isCurrent ? avgDaily * dim : spend,
    daysLeft: isCurrent ? dim - elapsed : 0,
  };
}

/* ---------- income / cash flow ---------- */

export function incomeMonth(list: Income[], ym: string): number {
  let s = 0;
  for (const i of list) if (i.date.startsWith(ym)) s += i.amount;
  return s;
}

export function incomeBySource(list: Income[], ym?: string): { name: string; total: number; pct: number }[] {
  const map = new Map<string, number>();
  let grand = 0;
  for (const i of list) {
    if (ym && !i.date.startsWith(ym)) continue;
    map.set(i.source, (map.get(i.source) ?? 0) + i.amount);
    grand += i.amount;
  }
  return [...map.entries()]
    .map(([name, total]) => ({ name, total, pct: grand ? (total / grand) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

export interface FlowRow {
  ym: string;
  income: number;
  expense: number;
  net: number;
  balance: number; // running balance since the first recorded month
}

/** Month-by-month balance sheet ending at `endYm` (n months). Running balance starts from all earlier history. */
export function cashflow(ps: Purchase[], inc: Income[], endYm: string, n: number): FlowRow[] {
  const start = shiftMonth(endYm, -(n - 1));
  let opening = 0;
  for (const p of ps) if (p.ym < start) opening -= p.entry.totalAmount;
  for (const i of inc) if (i.date.slice(0, 7) < start) opening += i.amount;
  const rows: FlowRow[] = [];
  let bal = opening;
  for (let k = 0; k < n; k++) {
    const ym = shiftMonth(start, k);
    const income = incomeMonth(inc, ym);
    const expense = sumMonth(ps, ym);
    bal += income - expense;
    rows.push({ ym, income, expense, net: income - expense, balance: bal });
  }
  return rows;
}

export function storeTotals(ps: Purchase[], ym?: string): { name: string; total: number; count: number; pct: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  let grand = 0;
  for (const p of ps) {
    if (ym && p.ym !== ym) continue;
    const k = (p.entry.store || '').trim() || 'Unspecified';
    const cur = map.get(k) ?? { total: 0, count: 0 };
    cur.total += p.entry.totalAmount;
    cur.count += 1;
    map.set(k, cur);
    grand += p.entry.totalAmount;
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v, pct: grand ? (v.total / grand) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}
