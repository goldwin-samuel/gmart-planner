import { Item } from './models';

/**
 * Keyword → category hints used to auto-categorise scanned bill lines.
 * Matching is word-prefix based on a normalised name, so "Amul Toned Milk 500ml" → Dairy.
 */
const RULES: [string, string[]][] = [
  ['Dairy', ['milk', 'curd', 'yogurt', 'yoghurt', 'paneer', 'butter', 'cheese', 'ghee', 'cream', 'egg', 'dahi', 'lassi', 'buttermilk', 'khoa']],
  ['Fruits', ['apple', 'banana', 'mango', 'orange', 'grape', 'papaya', 'pomegranate', 'watermelon', 'melon', 'guava', 'pineapple', 'kiwi', 'lemon', 'lime', 'pear', 'plum', 'cherry', 'berry', 'strawberry', 'coconut', 'fig', 'dates', 'sapota', 'chikoo']],
  ['Vegetables', ['tomato', 'onion', 'potato', 'carrot', 'beans', 'cabbage', 'cauliflower', 'brinjal', 'eggplant', 'okra', 'ladyfinger', 'capsicum', 'cucumber', 'spinach', 'palak', 'coriander', 'mint', 'garlic', 'ginger', 'chilli', 'chili', 'beetroot', 'radish', 'pumpkin', 'gourd', 'peas', 'drumstick', 'broccoli', 'mushroom', 'veg', 'leaf', 'leaves', 'curry leaf']],
  ['Grocery', ['rice', 'atta', 'wheat', 'flour', 'maida', 'rava', 'sooji', 'dal', 'lentil', 'toor', 'moong', 'urad', 'chana', 'rajma', 'sugar', 'jaggery', 'salt', 'oil', 'sunflower', 'mustard', 'turmeric', 'masala', 'spice', 'cumin', 'jeera', 'pepper', 'poha', 'oats', 'cereal', 'noodles', 'pasta', 'vermicelli', 'sauce', 'ketchup', 'jam', 'honey', 'pickle', 'papad', 'basmati', 'sabudana', 'besan', 'tamarind']],
  ['Snacks', ['chips', 'biscuit', 'cookie', 'chocolate', 'choco', 'candy', 'namkeen', 'bhujia', 'mixture', 'popcorn', 'wafer', 'cracker', 'cake', 'rusk', 'bar', 'kurkure', 'lays', 'ice cream', 'icecream', 'sweet', 'laddu', 'nuts', 'almond', 'cashew', 'raisin', 'peanut', 'bread', 'bun', 'pav']],
  ['Beverages', ['tea', 'coffee', 'juice', 'cola', 'pepsi', 'coke', 'soda', 'water', 'drink', 'energy', 'squash', 'horlicks', 'bournvita', 'boost', 'milkshake', 'badam', 'sprite', 'fanta', 'beer', 'wine']],
  ['Household', ['detergent', 'surf', 'soap', 'dishwash', 'vim', 'cleaner', 'harpic', 'phenyl', 'bleach', 'tissue', 'napkin', 'foil', 'garbage', 'bag', 'broom', 'mop', 'sponge', 'scrub', 'bulb', 'battery', 'candle', 'matchbox', 'agarbatti', 'incense', 'freshener', 'mosquito', 'hit', 'good knight', 'lizol', 'comfort', 'ariel', 'tide', 'rin', 'wheel']],
  ['Personal Care', ['shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'colgate', 'pepsodent', 'facewash', 'face wash', 'cream', 'lotion', 'deodorant', 'deo', 'perfume', 'razor', 'shaving', 'sanitary', 'pad', 'hair oil', 'powder', 'handwash', 'sanitizer', 'sanitiser', 'lipstick', 'kajal', 'comb', 'dettol', 'dove', 'lifebuoy', 'lux', 'nivea', 'vaseline']],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export interface Categorized {
  category: string;
  /** existing item that this line most likely refers to */
  itemId?: string;
  /** 'item' = matched an existing item, 'rule' = keyword rule, 'none' = fell back */
  via: 'item' | 'rule' | 'none';
}

function pickCategory(wanted: string, available: string[]): string {
  const hit = available.find((c) => c.toLowerCase() === wanted.toLowerCase());
  return hit ?? wanted;
}

/** Best existing item for a scanned line (exact, then containment either way). */
export function matchItem(name: string, items: Item[]): Item | undefined {
  const n = norm(name);
  if (!n) return undefined;
  const exact = items.find((i) => norm(i.name) === n);
  if (exact) return exact;
  let best: Item | undefined;
  let bestLen = 0;
  for (const i of items) {
    const m = norm(i.name);
    if (m.length < 3) continue;
    if (n.includes(m) || m.includes(n)) {
      if (m.length > bestLen) {
        best = i;
        bestLen = m.length;
      }
    }
  }
  return best;
}

export function categorize(name: string, items: Item[], categories: string[], suggested?: string): Categorized {
  const it = matchItem(name, items);
  if (it) return { category: it.category, itemId: it.id, via: 'item' };

  const n = ' ' + norm(name) + ' ';
  for (const [cat, words] of RULES) {
    for (const w of words) {
      if (n.includes(' ' + w) ) return { category: pickCategory(cat, categories), via: 'rule' };
    }
  }
  if (suggested) {
    const hit = categories.find((c) => c.toLowerCase() === suggested.toLowerCase());
    if (hit) return { category: hit, via: 'rule' };
  }
  return { category: 'Other', via: 'none' };
}

/** Title-case a noisy OCR product name ("AMUL TONED MILK  500ML" → "Amul Toned Milk 500ml"). */
export function cleanName(raw: string): string {
  const s = raw.replace(/[|_*#]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}
