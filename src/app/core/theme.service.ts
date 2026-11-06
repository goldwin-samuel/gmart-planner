import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Corners, Density, ThemeMode } from './models';
import { StorageService } from './storage.service';
import { hexToRgb } from './utils';

export interface Accent {
  name: string;
  a: string;
  b: string;
}

export const ACCENTS: Record<string, Accent> = {
  indigo: { name: 'Indigo', a: '#6366f1', b: '#8b5cf6' },
  teal: { name: 'Teal', a: '#0d9488', b: '#0891b2' },
  violet: { name: 'Violet', a: '#8b5cf6', b: '#d946ef' },
  rose: { name: 'Rose', a: '#e11d48', b: '#f97316' },
  amber: { name: 'Amber', a: '#d97706', b: '#ea580c' },
  emerald: { name: 'Emerald', a: '#059669', b: '#65a30d' },
  slate: { name: 'Slate', a: '#334155', b: '#64748b' },
};

export interface ChartTheme {
  accent: string;
  accent2: string;
  ink: string;
  grid: string;
  surface: string;
  isDark: boolean;
  palette: string[];
}

const PALETTE = ['#6366f1', '#14b8a6', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#84cc16', '#fb923c', '#ec4899', '#64748b'];

interface Saved {
  mode: ThemeMode;
  accent: string;
  density: Density;
  corners: Corners;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private storage = inject(StorageService);

  mode = signal<ThemeMode>('system');
  accent = signal<string>('indigo');
  density = signal<Density>('comfortable');
  corners = signal<Corners>('soft');
  private sysDark = signal(false);

  readonly accents = ACCENTS;
  readonly accentKeys = Object.keys(ACCENTS);

  isDark = computed(() => this.mode() === 'dark' || (this.mode() === 'system' && this.sysDark()));

  chart = computed<ChartTheme>(() => {
    const ac = ACCENTS[this.accent()] ?? ACCENTS['indigo'];
    const dark = this.isDark();
    return {
      accent: ac.a,
      accent2: ac.b,
      ink: dark ? '#9aa6bd' : '#6b7690',
      grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(11,16,32,0.06)',
      surface: dark ? '#0f1424' : '#ffffff',
      isDark: dark,
      palette: [ac.a, ...PALETTE.filter((c) => c !== ac.a)],
    };
  });

  constructor() {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
    if (mq) {
      this.sysDark.set(mq.matches);
      mq.addEventListener?.('change', (e) => this.sysDark.set(e.matches));
    }
    effect(() => this.apply());
  }

  async init(): Promise<void> {
    const s = await this.storage.get<Partial<Saved>>('gmartTheme');
    if (!s) return;
    this.mode.set(s.mode ?? 'system');
    this.accent.set(s.accent && ACCENTS[s.accent] ? s.accent : 'indigo');
    this.density.set(s.density === 'compact' ? 'compact' : 'comfortable');
    this.corners.set(s.corners === 'sharp' ? 'sharp' : 'soft');
  }

  setMode(m: ThemeMode) {
    this.mode.set(m);
    this.persist();
  }
  setAccent(a: string) {
    this.accent.set(a);
    this.persist();
  }
  setDensity(d: Density) {
    this.density.set(d);
    this.persist();
  }
  setCorners(c: Corners) {
    this.corners.set(c);
    this.persist();
  }
  reset() {
    this.mode.set('system');
    this.accent.set('indigo');
    this.density.set('comfortable');
    this.corners.set('soft');
    this.persist();
  }

  private persist() {
    const s: Saved = { mode: this.mode(), accent: this.accent(), density: this.density(), corners: this.corners() };
    void this.storage.set('gmartTheme', s);
  }

  private apply() {
    const root = document.documentElement;
    root.classList.toggle('ion-palette-dark', this.isDark());
    root.dataset['density'] = this.density();
    root.dataset['corners'] = this.corners();
    const ac = ACCENTS[this.accent()] ?? ACCENTS['indigo'];
    const [r, g, b] = hexToRgb(ac.a);
    const s = root.style;
    s.setProperty('--accent', ac.a);
    s.setProperty('--accent-2', ac.b);
    s.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    s.setProperty('--ion-color-primary', ac.a);
    s.setProperty('--ion-color-primary-rgb', `${r}, ${g}, ${b}`);
    s.setProperty('--ion-color-primary-shade', ac.a);
    s.setProperty('--ion-color-primary-tint', ac.b);
  }
}
