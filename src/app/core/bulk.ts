import { UNITS } from './models';
import { todayISO } from './utils';

/** One parsed spreadsheet row, before the user reviews it. */
export interface BulkRow {
  row: number; // spreadsheet row number (for messages)
  date: string;
  name: string;
  category: string;
  qty: number | null;
  unit: string;
  amount: number | null;
  shop: string;
  note: string;
  /** soft problems found while reading (shown on the row) */
  warns: string[];
}

export const TEMPLATE_HEADERS = ['Date', 'Item', 'Category', 'Quantity', 'Unit', 'Amount', 'Shop', 'Notes'];

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'purchase date', 'bought on', 'day'],
  name: ['item', 'item name', 'name', 'product', 'product name', 'description', 'particulars'],
  category: ['category', 'cat', 'type', 'group'],
  qty: ['quantity', 'qty', 'qnty', 'count', 'nos'],
  unit: ['unit', 'uom', 'units'],
  amount: ['amount', 'total', 'price', 'cost', 'total amount', 'total price', 'value', 'rate', 'amt'],
  shop: ['shop', 'store', 'shop name', 'store name', 'vendor', 'merchant', 'supermarket'],
  note: ['notes', 'note', 'remarks', 'remark', 'comment', 'comments', 'memo'],
};

const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', grm: 'g',
  l: 'L', lt: 'L', ltr: 'L', ltrs: 'L', litre: 'L', litres: 'L', liter: 'L', liters: 'L',
  ml: 'ml', millilitre: 'ml', milliliter: 'ml', millilitres: 'ml',
  unit: 'unit', units: 'unit', pc: 'unit', pcs: 'unit', piece: 'unit', pieces: 'unit', nos: 'unit', no: 'unit', each: 'unit', ea: 'unit', item: 'unit', items: 'unit',
  dozen: 'dozen', dz: 'dozen', doz: 'dozen',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack', pkt: 'pack', pkts: 'pack', box: 'pack', boxes: 'pack', bottle: 'pack', bottles: 'pack',
};

export function normaliseUnit(raw: unknown): { unit: string; known: boolean } {
  const s = String(raw ?? '').trim();
  if (!s) return { unit: 'unit', known: true };
  const hit = UNITS.find((u) => u.toLowerCase() === s.toLowerCase());
  if (hit) return { unit: hit, known: true };
  const a = UNIT_ALIASES[s.toLowerCase().replace(/[.\s]/g, '')];
  return a ? { unit: a, known: true } : { unit: 'unit', known: false };
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[^0-9.\-]/g, '');
  if (!s || s === '-' || s === '.') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Accepts Excel serials, ISO text, dd/mm/yyyy, dd-mm-yyyy, "5 Nov 2026"… Returns '' when it cannot tell. */
export function parseDateCell(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return '';
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    let a = +m[1], b = +m[2];
    if (b > 12 && a <= 12) [a, b] = [b, a]; // clearly mm/dd/yyyy
    return ok(y, b, a); // default: dd/mm/yyyy
  }
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return '';
}

function ok(y: number, m: number, d: number): string {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return '';
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Builds the downloadable template (.xlsx bytes). */
export async function buildTemplate(categories: string[], shops: string[]): Promise<Uint8Array> {
  const XLSX = await import('xlsx');
  const today = todayISO();
  const y = new Date(Date.now() - 86400000);
  const yest = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
  const rows: (string | number)[][] = [
    TEMPLATE_HEADERS,
    [yest, 'Tomato', 'Vegetables', 2, 'kg', 80, shops[0] || 'DMart', 'Example row – delete me'],
    [today, 'Amul Milk', 'Dairy', 1, 'L', 62, shops[0] || 'DMart', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 30 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 } as any;

  const guide: (string | number)[][] = [
    ['How to fill the Purchases sheet'],
    [''],
    ['1.', 'One row per item you bought. Delete the two example rows.'],
    ['2.', 'Date: YYYY-MM-DD (e.g. 2026-11-05) or a normal Excel date. Leave blank for today.'],
    ['3.', 'Item and Amount are required. Amount is the TOTAL you paid for that row (not per kg).'],
    ['4.', 'Quantity defaults to 1, Unit defaults to "unit". Category is guessed for you when blank.'],
    ['5.', 'Shop and Notes are optional.'],
    ['6.', 'Save, then in the app press Add → Bulk upload and choose this file. You can edit everything before approving.'],
    [''],
    ['Units you can use', UNITS.join(', ')],
    ['Your categories', categories.join(', ')],
  ];
  const gs = XLSX.utils.aoa_to_sheet(guide);
  gs['!cols'] = [{ wch: 20 }, { wch: 90 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Purchases');
  XLSX.utils.book_append_sheet(wb, gs, 'Guide');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}

export interface BulkParse {
  rows: BulkRow[];
  skipped: number;
  sheet: string;
  missingColumns: string[];
}

export const MAX_ROWS = 1000;

/** Reads an .xlsx / .xls / .csv file into rows. Never throws on bad cells – problems become row warnings. */
export async function parseWorkbook(buf: ArrayBuffer): Promise<BulkParse> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const name = wb.SheetNames.find((n) => /purchase|expense|item/i.test(n)) ?? wb.SheetNames[0];
  const ws = name ? wb.Sheets[name] : undefined;
  if (!ws) throw new Error('That file has no sheets');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: false });
  if (!grid.length) throw new Error('The sheet is empty');

  // find the header row (first row within the top 10 that names at least Item + Amount-ish columns)
  let hi = -1;
  let map: Record<string, number> = {};
  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const m: Record<string, number> = {};
    grid[r].forEach((cell, c) => {
      const h = String(cell ?? '').trim().toLowerCase();
      if (!h) return;
      for (const [key, names] of Object.entries(HEADER_ALIASES)) if (m[key] == null && names.includes(h)) m[key] = c;
    });
    if (m['name'] != null && m['amount'] != null) {
      hi = r;
      map = m;
      break;
    }
  }
  if (hi < 0) {
    const need = ['Item', 'Amount'];
    throw new Error(`Could not find the ${need.join(' and ')} columns. Please use the downloaded template.`);
  }

  const today = todayISO();
  const rows: BulkRow[] = [];
  let skipped = 0;
  for (let r = hi + 1; r < grid.length; r++) {
    const line = grid[r];
    const get = (k: string) => (map[k] != null ? line[map[k]] : '');
    const nameRaw = String(get('name') ?? '').trim();
    const amountRaw = get('amount');
    if (!nameRaw && (amountRaw === '' || amountRaw == null)) {
      skipped++;
      continue; // blank row
    }
    if (rows.length >= MAX_ROWS) {
      skipped++;
      continue;
    }
    const warns: string[] = [];
    let date = parseDateCell(get('date'));
    const dateRaw = get('date');
    if (!date) {
      if (dateRaw !== '' && dateRaw != null) warns.push(`Date “${String(dateRaw)}” not understood – set to today`);
      date = today;
    } else if (date > today) {
      warns.push('Date is in the future – set to today');
      date = today;
    }
    const q = num(get('qty'));
    const u = normaliseUnit(get('unit'));
    if (!u.known) warns.push(`Unit “${String(get('unit'))}” not recognised – using “unit”`);
    const amount = num(amountRaw);
    if (!nameRaw) warns.push('Item name is missing');
    if (!(amount && amount > 0)) warns.push('Amount is missing');
    rows.push({
      row: r + 1,
      date,
      name: nameRaw,
      category: String(get('category') ?? '').trim(),
      qty: q && q > 0 ? q : 1,
      unit: u.unit,
      amount: amount && amount > 0 ? amount : null,
      shop: String(get('shop') ?? '').trim(),
      note: String(get('note') ?? '').trim(),
      warns,
    });
  }
  return { rows, skipped, sheet: name, missingColumns: ['date', 'category', 'qty', 'unit', 'shop', 'note'].filter((k) => map[k] == null) };
}
