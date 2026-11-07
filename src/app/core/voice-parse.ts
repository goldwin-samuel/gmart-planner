import { UNITS } from './models';
import { normaliseUnit } from './bulk';
import { cleanName } from './categorize';
import { todayISO } from './utils';

/* ------------------------------------------------------------------ *
 * Small, dependency-free English parser for spoken purchase / income *
 * ------------------------------------------------------------------ */

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE: Record<string, number> = { hundred: 100, thousand: 1000, lakh: 100000, lakhs: 100000, lac: 100000, lacs: 100000 };

const isNumWord = (w: string) => w in ONES || w in TENS || w in SCALE;

/** "two hundred fifty" → 250 · "one and a half" → 1.5 · "half" → 0.5 · leaves digits and other words alone. */
export function wordsToDigits(input: string): string {
  const t = input
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/\bhalf an?\b/gi, 'half')
    .replace(/\ba half\b/gi, 'half')
    .replace(/\band a quarter\b/gi, 'and quarter')
    .split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < t.length; i++) {
    const w = t[i].toLowerCase().replace(/[,.]$/, '');
    if (w === 'half' || w === 'quarter') {
      const v = w === 'half' ? 0.5 : 0.25;
      const prev = out[out.length - 1];
      // "one and half", "2 and half" → add to previous number
      if (prev === 'and' && /^\d+(\.\d+)?$/.test(out[out.length - 2] ?? '')) {
        const n = Number(out[out.length - 2]) + v;
        out.splice(out.length - 2, 2, String(n));
      } else out.push(String(v));
      continue;
    }
    if (isNumWord(w)) {
      let total = 0;
      let cur = 0;
      let j = i;
      let used = false;
      while (j < t.length) {
        const x = t[j].toLowerCase().replace(/[,.]$/, '');
        if (x in ONES) cur += ONES[x];
        else if (x in TENS) cur += TENS[x];
        else if (x in SCALE) {
          const s = SCALE[x];
          if (s === 100) cur = (cur || 1) * 100;
          else {
            total += (cur || 1) * s;
            cur = 0;
          }
        } else if (x === 'and' && used && j + 1 < t.length && isNumWord(t[j + 1].toLowerCase())) {
          /* "two hundred and fifty" */
        } else break;
        used = true;
        j++;
      }
      out.push(String(total + cur));
      i = j - 1;
      continue;
    }
    out.push(t[i]);
  }
  return out.join(' ').replace(/\b(\d+(?:\.\d+)?) and (\d(?:\.\d+)?)\b(?=\s*(?:kg|kilo|l\b|litre|liter|dozen))/gi, (_, a, b) => String(Number(a) + Number(b)));
}

/* ------------------------------ dates ------------------------------ */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Finds a spoken date, returns it plus the text with that phrase removed. Never returns a future date. */
export function extractDate(text: string, now = new Date()): { date?: string; rest: string } {
  let rest = text;
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = rest.match(re);
    if (m) rest = rest.replace(m[0], ' ');
    return m;
  };
  const back = (n: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
    return iso(d);
  };
  if (take(/\bday before yesterday\b/i)) return { date: back(2), rest };
  if (take(/\byesterday\b/i)) return { date: back(1), rest };
  if (take(/\b(today|just now|right now|this morning|this evening|tonight)\b/i)) return { date: back(0), rest };

  let m = take(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join('|')})(?:\\s+(\\d{4}))?\\b`, 'i'));
  let day: number | undefined, mon: number | undefined, yr: number | undefined;
  if (m) {
    day = +m[1];
    mon = MONTHS.indexOf(m[2].toLowerCase());
    yr = m[3] ? +m[3] : undefined;
  } else {
    m = take(new RegExp(`\\b(?:on\\s+)?(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`, 'i'));
    if (m) {
      mon = MONTHS.indexOf(m[1].toLowerCase());
      day = +m[2];
      yr = m[3] ? +m[3] : undefined;
    }
  }
  if (day != null && mon != null && mon >= 0 && day >= 1 && day <= 31) {
    let d = new Date(yr ?? now.getFullYear(), mon, day);
    if (!yr && d > now) d = new Date(now.getFullYear() - 1, mon, day);
    if (d.getMonth() === mon && d <= now) return { date: iso(d), rest };
  }
  m = take(/\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (m) {
    const dd = +m[1];
    let d = new Date(now.getFullYear(), now.getMonth(), dd);
    if (d > now) d = new Date(now.getFullYear(), now.getMonth() - 1, dd);
    if (dd >= 1 && dd <= 31 && d.getDate() === dd) return { date: iso(d), rest };
  }
  m = take(new RegExp(`\\b(?:last|on)\\s+(${DAYS.join('|')})\\b`, 'i'));
  if (m) {
    const target = DAYS.indexOf(m[1].toLowerCase());
    let diff = (now.getDay() - target + 7) % 7;
    if (diff === 0) diff = 7;
    return { date: back(diff), rest };
  }
  return { rest };
}

/* ------------------------------ helpers ------------------------------ */

const UNIT_RE = '(?:kgs?|kilograms?|kilos?|grams?|gms?|gm|g|litres?|liters?|ltrs?|ltr|l|millilitres?|ml|dozens?|dz|packs?|packets?|pkts?|pcs|pieces?|units?|nos|bottles?|boxes|box)';
const NUM = '(\\d+(?:\\.\\d+)?)';
const CUR = '(?:rs\\.?|rupees?|rupaye|rupay|inr|₹|bucks)';

const FILLER = new Set([
  'i', 'we', 'bought', 'buy', 'buying', 'purchased', 'purchase', 'purchases', 'add', 'adding', 'record', 'log', 'new', 'expense', 'spent', 'spend',
  'got', 'get', 'took', 'take', 'order', 'ordered', 'please', 'a', 'an', 'the', 'some', 'of', 'to', 'my', 'list', 'item', 'items', 'entry', 'and', 'also', 'um', 'uh',
  'today', 'for', 'on', 'in', 'cost', 'costs', 'costing', 'price', 'total', 'worth', 'is', 'was', 'it', 'that', 'with', 'about', 'around', 'only', 'just', 'then',
]);

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface PurchaseSlots {
  name?: string;
  qty?: number;
  unit?: string;
  amount?: number;
  shop?: string;
  date?: string;
  note?: string;
}

export function parsePurchase(raw: string, now = new Date()): PurchaseSlots {
  const out: PurchaseSlots = {};
  let s = clean(raw.replace(/[₹]/g, ' ₹ '));

  // note: "... note fresh and organic"
  let m = s.match(/\b(?:note|notes|remark|comment)s?\s*(?:is|are|:|-)?\s+(.+)$/i);
  if (m) {
    out.note = clean(m[1]).replace(/[.]$/, '');
    s = clean(s.slice(0, m.index));
  }

  s = wordsToDigits(s);

  const d = extractDate(s, now);
  if (d.date) out.date = d.date;
  s = clean(d.rest);

  // amount
  const amtPatterns: RegExp[] = [
    new RegExp(`\\b(?:for|at|cost(?:s|ing)?|price(?:\\s+is)?|priced|total(?:\\s+is)?|worth|paid|pay|spent|of)\\s*(?:about\\s+|around\\s+)?(?:${CUR}\\s*)?${NUM}\\s*(?:${CUR})?(?!\\s*${UNIT_RE}\\b)`, 'i'),
    new RegExp(`${NUM}\\s*${CUR}`, 'i'),
    new RegExp(`${CUR}\\s*${NUM}`, 'i'),
  ];
  for (const re of amtPatterns) {
    const am = s.match(re);
    if (am) {
      const v = Number(am[1]);
      if (v > 0) {
        out.amount = v;
        s = clean(s.replace(am[0], ' '));
        break;
      }
    }
  }

  // shop: "at DMart", "from Reliance Fresh" (never "at 80")
  m = s.match(/\b(?:at|from|in|@)\s+(?!\d)(?:the\s+)?(.+?)(?=\s+(?:for|on|cost|costs|price|total|paid|worth|note|notes|with|and\s+\d)\b|$)/i);
  if (m) {
    const shop = clean(m[1]).replace(/[.,]$/, '');
    if (shop && shop.split(' ').length <= 5) {
      out.shop = titleCase(shop);
      s = clean(s.replace(m[0], ' '));
    }
  }

  // quantity + unit
  m = s.match(new RegExp(`${NUM}\\s*(${UNIT_RE})\\b`, 'i'));
  if (m) {
    out.qty = Number(m[1]);
    out.unit = normaliseUnit(m[2]).unit;
    s = clean(s.replace(m[0], ' '));
  } else {
    m = s.match(new RegExp(`\\b(?:a|one)\\s+(dozen|dz|kilo|kg|litre|liter|packet|pack)\\b`, 'i'));
    if (m) {
      out.qty = 1;
      out.unit = normaliseUnit(m[1]).unit;
      s = clean(s.replace(m[0], ' '));
    } else {
      m = s.match(/^(?:\S+\s+)*?(\d+(?:\.\d+)?)\s+(?=[a-z])/i);
      if (m && !out.amount) {
        // "3 apples" with no price word – ambiguous; treat as quantity, amount is asked next
        out.qty = Number(m[1]);
        out.unit = 'unit';
        s = clean(s.replace(new RegExp(`\\b${m[1]}\\b`), ' '));
      } else if (m) {
        out.qty = Number(m[1]);
        out.unit = 'unit';
        s = clean(s.replace(new RegExp(`\\b${m[1]}\\b`), ' '));
      }
    }
  }

  // a leftover bare number after the quantity ("rice 5 kg 450") is the amount
  if (out.amount == null && out.qty != null) {
    const nums = [...s.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/g)];
    if (nums.length) {
      const last = nums[nums.length - 1];
      out.amount = Number(last[1]);
      s = clean(s.slice(0, last.index!) + ' ' + s.slice((last.index ?? 0) + last[0].length));
    }
  }

  // whatever is left that isn't filler is the item name
  const words = s
    .replace(/[^\p{L}\p{N}\s'&.-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  while (words.length && FILLER.has(words[0].toLowerCase())) words.shift();
  while (words.length && FILLER.has(words[words.length - 1].toLowerCase())) words.pop();
  const name = words.filter((w) => !/^\d+(\.\d+)?$/.test(w)).join(' ');
  if (name && name.length >= 2) out.name = singularHint(cleanName(name));
  return out;
}

/** "tomatoes" stays "Tomatoes" – we only tidy capitalisation, never guess plurals. */
function singularHint(n: string) {
  return n;
}

function titleCase(s: string) {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\bDmart\b/g, 'DMart');
}

/** Reply to "how much / how many?" */
export function parseQty(raw: string): { qty: number; unit?: string } | null {
  const s = wordsToDigits(clean(raw));
  let m = s.match(new RegExp(`${NUM}\\s*(${UNIT_RE})\\b`, 'i'));
  if (m) return { qty: Number(m[1]), unit: normaliseUnit(m[2]).unit };
  m = s.match(new RegExp(`\\b(?:a|one)?\\s*(dozen|dz)\\b`, 'i'));
  if (m) return { qty: 1, unit: 'dozen' };
  m = s.match(new RegExp(`${NUM}`));
  if (m) return { qty: Number(m[1]) };
  return null;
}

/** Reply to "how much did it cost?" */
export function parseAmount(raw: string): number | null {
  const s = wordsToDigits(clean(raw.replace(/₹/g, ' ')));
  const withCur = s.match(new RegExp(`${NUM}\\s*${CUR}|${CUR}\\s*${NUM}`, 'i'));
  if (withCur) return Number(withCur[1] ?? withCur[2]);
  const all = [...s.matchAll(/\d+(?:\.\d+)?/g)].map((x) => Number(x[0]));
  return all.length ? all[all.length - 1] : null;
}

/** Reply to "which shop?" → shop name, '' for "no shop", null when nothing usable. */
export function parseShop(raw: string): string | null {
  const s = clean(raw.replace(/[.!]$/, ''));
  if (/^(skip|none|no|nothing|nowhere|no shop|not sure|don'?t know|pass|next|nope)$/i.test(s)) return '';
  const stripped = clean(s.replace(/^(?:it\s*(?:was|is)\s+)?(?:(?:from|at|in)\s+)?(?:the\s+)?(?:shop|store)?\s*(?:is|was|name is)?\s*(?:(?:from|at|in)\s+)?(?:the\s+)?/i, ''));
  return stripped ? titleCase(stripped) : null;
}

export const isYes = (t: string) => /^(yes|yeah|yep|yup|ya|yea|sure|ok|okay|correct|right|confirm|confirmed|save|save it|add it|add|do it|go ahead|looks good|that'?s right|perfect|done|haan|ha|theek hai|sahi)\b/i.test(clean(t));
export const isNo = (t: string) => /^(no|nope|nah|wrong|incorrect|change|edit|not really|wait|nahi|galat)\b/i.test(clean(t));
export const isDone = (t: string) => /\b(done|finish|finished|that'?s all|that is all|nothing|no more|nothing else|exit|close|stop|enough|no thanks|i'?m done)\b/i.test(clean(t)) || /^no$/i.test(clean(t));
export const isCancel = (t: string) => /\b(cancel|discard|never ?mind|forget it|abort|quit)\b/i.test(clean(t));
export const isSkip = (t: string) => /^(skip|pass|next|none|no|nope|nothing|leave it|don'?t know)\b/i.test(clean(t));
export const isRestart = (t: string) => /\b(start over|restart|clear|reset|from the beginning)\b/i.test(clean(t));

/** "change amount to 90", "shop is Reliance", "category fruits", "make it 3 kg" … */
export function parseCorrection(raw: string, categories: string[], now = new Date()): PurchaseSlots {
  const s = wordsToDigits(clean(raw));
  const out: PurchaseSlots = {};
  let m = s.match(/\b(?:amount|price|cost|total|rupees|money)\b[^\d]*(\d+(?:\.\d+)?)/i);
  if (m) out.amount = Number(m[1]);
  m = s.match(/\b(?:quantity|qty|weight|how much|make it)\b[^\d]*(\d+(?:\.\d+)?)\s*(\w+)?/i);
  if (m) {
    out.qty = Number(m[1]);
    const u = m[2] ? normaliseUnit(m[2]) : null;
    if (u?.known && m[2]) out.unit = u.unit;
  }
  m = s.match(/\b(?:shop|store|place|bought (?:it )?(?:at|from))\b\s*(?:is|was|to|:)?\s*(?:from |at )?(.+)$/i);
  if (m) {
    const sh = parseShop(m[1]);
    if (sh != null) out.shop = sh;
  }
  m = s.match(/\b(?:category)\b\s*(?:is|to|:)?\s*(.+)$/i);
  if (m) {
    const want = clean(m[1]).toLowerCase();
    const hit = categories.find((c) => c.toLowerCase() === want) ?? categories.find((c) => want.includes(c.toLowerCase()) || c.toLowerCase().includes(want));
    if (hit) (out as any).category = hit;
  }
  m = s.match(/\b(?:name|item|product)\b\s*(?:is|to|:)?\s*(.+)$/i);
  if (m) out.name = cleanName(clean(m[1]));
  const d = extractDate(s, now);
  if (d.date) out.date = d.date;
  m = s.match(/\b(?:note|notes)\b\s*(?:is|to|:)?\s*(.+)$/i);
  if (m) out.note = clean(m[1]);
  return out;
}

/* ------------------------------ income ------------------------------ */

export interface IncomeSlots {
  amount?: number;
  source?: string;
  date?: string;
  note?: string;
}

const SOURCE_WORDS: [string, RegExp][] = [
  ['Salary', /\b(salary|salaries|pay ?check|paycheque|wages?|stipend|payroll)\b/i],
  ['Business', /\b(business|sales?|shop income|profit|customer)\b/i],
  ['Freelance', /\b(freelanc\w*|project|client|consult\w*|gig)\b/i],
  ['Interest', /\b(interest|dividends?|fd|fixed deposit|returns?)\b/i],
  ['Rent', /\b(rent|rental|tenant)\b/i],
  ['Gift', /\b(gift|present|birthday|festival|diwali)\b/i],
  ['Refund', /\b(refund|cashback|cash back|reimburse\w*)\b/i],
];

export function matchSource(text: string, known: string[]): string | undefined {
  const t = text.toLowerCase();
  for (const k of known) if (k.length > 2 && new RegExp(`\\b${k.toLowerCase().replace(/[^a-z0-9 ]/g, '')}\\b`).test(t)) return k;
  for (const [name, re] of SOURCE_WORDS) if (re.test(text)) return known.find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;
  return undefined;
}

export function parseIncome(raw: string, known: string[], now = new Date()): IncomeSlots {
  const out: IncomeSlots = {};
  let s = clean(raw.replace(/₹/g, ' ₹ '));
  const m = s.match(/\b(?:note|notes|remark)s?\s*(?:is|:|-)?\s+(.+)$/i);
  if (m) {
    out.note = clean(m[1]);
    s = clean(s.slice(0, m.index));
  }
  s = wordsToDigits(s);
  const d = extractDate(s, now);
  if (d.date) out.date = d.date;
  s = clean(d.rest);
  const a = s.match(new RegExp(`${NUM}\\s*${CUR}|${CUR}\\s*${NUM}`, 'i')) ?? s.match(/\b(?:of|for|received|got|earned|credited|amount|rs)\s*(\d+(?:\.\d+)?)\b/i) ?? s.match(/\b(\d+(?:\.\d+)?)\b/);
  if (a) {
    const v = Number(a[1] ?? a[2]);
    if (v > 0) out.amount = v;
  }
  const src = matchSource(s, known);
  if (src) out.source = src;
  return out;
}

/** Reply to "where did it come from?" – match a known source or accept a short custom label. */
export function parseSource(raw: string, known: string[]): string | null {
  const hit = matchSource(raw, known);
  if (hit) return hit;
  const s = clean(raw.replace(/[.!?]$/, '').replace(/^(?:it\s*(?:was|is)\s+)?(?:from|as|a|an|the|my|source is|it'?s)\s+/i, ''));
  if (!s || s.split(' ').length > 4) return null;
  return cleanName(s);
}

export { todayISO, UNITS };
