export const uid = () => '_' + Math.random().toString(36).slice(2, 9);

export const pad = (n: number) => String(n).padStart(2, '0');

/** Local-time YYYY-MM-DD (avoids the UTC off-by-one of toISOString). */
export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Accepts 'YYYY-MM-DD', ISO timestamps, or Date-parsable strings coming from Sheets. */
export function normaliseDate(v: unknown): string {
  const s = String(v ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return todayISO(d);
  return todayISO();
}

export function daysAgo(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((today - then) / 86400000);
}

export function relativeDay(dateStr: string): string {
  const n = daysAgo(dateStr);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n < 7) return `${n}d ago`;
  if (n < 30) return `${Math.floor(n / 7)}w ago`;
  if (n < 365) return `${Math.floor(n / 30)}mo ago`;
  return `${Math.floor(n / 365)}y ago`;
}

export function prettyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

const EMOJI: [RegExp, string][] = [
  [/fruit/i, '🍎'],
  [/veg|green/i, '🥦'],
  [/dairy|milk|egg/i, '🥛'],
  [/bak|bread/i, '🍞'],
  [/meat|chicken|mutton/i, '🍗'],
  [/fish|sea/i, '🐟'],
  [/snack|chips|sweet|choc/i, '🍿'],
  [/bever|drink|juice|tea|coffee/i, '☕'],
  [/grocer|staple|rice|dal|flour/i, '🛒'],
  [/house|clean|home|detergent/i, '🧴'],
  [/person|care|beauty|soap/i, '🧼'],
  [/baby/i, '🍼'],
  [/pet/i, '🐾'],
  [/frozen/i, '🧊'],
  [/spice|masala/i, '🌶️'],
  [/oil|ghee/i, '🫒'],
  [/medic|pharm|health/i, '💊'],
];

export function categoryEmoji(name: string): string {
  for (const [re, e] of EMOJI) if (re.test(name)) return e;
  return '🛍️';
}

export function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
