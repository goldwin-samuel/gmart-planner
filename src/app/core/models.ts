export interface HistoryEntry {
  date: string; // YYYY-MM-DD
  quantity: number;
  unit: string;
  totalAmount: number;
  unitPrice: number;
  store?: string;
  note?: string;
}

export interface Item {
  id: string;
  name: string;
  category: string;
  active: boolean;
  lastPrice: number | null;
  lastUnit: string | null;
  history: HistoryEntry[];
}

export interface Income {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  source: string;
  note?: string;
}

export const INCOME_SOURCES = ['Salary', 'Business', 'Freelance', 'Interest', 'Rent', 'Gift', 'Refund', 'Other'];

export interface Settings {
  currency: string;
  locale: string;
  theme: string;
  monthlyTarget: number;
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: string;
  approved?: boolean;
}

export interface Category {
  name: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type Corners = 'soft' | 'sharp';

export interface LocalPrefs {
  cart: string[];
  favorites: string[];
}

export interface ApiResponse {
  status: 'success' | 'error';
  message?: string;
  [key: string]: any;
}

export const UNITS = ['kg', 'g', 'L', 'ml', 'unit', 'dozen', 'pack'];

export const CURRENCIES = [
  { code: 'INR', locale: 'en-IN', symbol: '₹', label: 'Indian Rupee' },
  { code: 'USD', locale: 'en-US', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', locale: 'de-DE', symbol: '€', label: 'Euro' },
  { code: 'GBP', locale: 'en-GB', symbol: '£', label: 'British Pound' },
  { code: 'AED', locale: 'en-AE', symbol: 'د.إ', label: 'UAE Dirham' },
  { code: 'SGD', locale: 'en-SG', symbol: 'S$', label: 'Singapore Dollar' },
];

export const DEFAULT_SETTINGS: Settings = {
  currency: 'INR',
  locale: 'en-IN',
  theme: 'light',
  monthlyTarget: 700,
};

export const DEFAULT_PREFS: LocalPrefs = { cart: [], favorites: [] };

export const STARTER_CATEGORIES = [
  'Fruits',
  'Vegetables',
  'Dairy',
  'Grocery',
  'Snacks',
  'Beverages',
  'Household',
  'Personal Care',
];
