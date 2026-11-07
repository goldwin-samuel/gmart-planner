import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { ModalsService } from '../modals/modals.service';
import { incomeMonth, monthKey, shiftMonth, sumMonth, monthLabel } from './analytics';
import { AuthService } from './auth.service';
import { categorize, cleanName, matchItem } from './categorize';
import { FeedbackService } from './feedback.service';
import { StoreService } from './store.service';
import { ThemeService } from './theme.service';
import { todayISO } from './utils';
import { parsePurchase } from './voice-parse';
import { VoiceService } from './voice.service';

interface Outcome {
  /** what to tell the user (toast + spoken) */
  reply?: string;
  /** reopen the mic with this message because the command wasn't understood */
  retry?: string;
}

const NAV_VERB = /\b(open|go|goto|show|take|view|see|navigate|switch|display|bring)\b/;
const ADD_VERB = /\b(add|record|new|log|enter|create|got|received|earned|credited|bought|buy|purchased|purchase|spent)\b/;

/** Voice control: turns a spoken sentence into navigation or an app action. */
@Injectable({ providedIn: 'root' })
export class VoiceControlService {
  private modals = inject(ModalsService);
  private router = inject(Router);
  private location = inject(Location);
  private store = inject(StoreService);
  private theme = inject(ThemeService);
  private auth = inject(AuthService);
  private fb = inject(FeedbackService);
  private voice = inject(VoiceService);

  /** Opens the mic sheet, runs whatever was said. */
  async start(notice = ''): Promise<void> {
    const r = await this.modals.voiceCommand(notice);
    const text = (r.data as { text?: string } | null)?.text;
    if (!text) return;
    const out = await this.execute(text);
    if (out.retry) return this.start(out.retry);
    if (out.reply) {
      void this.fb.toast(out.reply);
      void this.voice.speak(out.reply);
    }
  }

  async execute(raw: string): Promise<Outcome> {
    const t = raw
      .toLowerCase()
      .replace(/[^a-z0-9\s₹.]/g, ' ')
      .replace(/\b(please|hey|ok|okay|kindly|can you|could you|would you|i want to|i wanna|i would like to|i'd like to|let'?s|now)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return { retry: 'I didn’t catch that.' };

    if (/\b(help|what can i say|commands)\b/.test(t)) return { retry: 'Here are some things you can say.' };
    if (/^(cancel|close|stop|never ?mind|exit|nothing)$/.test(t)) return {};

    // ----- appearance -----
    if (/\b(toggle|switch|change|flip)\b.*\b(theme|mode)\b/.test(t) && !/\b(dark|light)\b/.test(t)) {
      this.theme.setMode(this.theme.isDark() ? 'light' : 'dark');
      return { reply: this.theme.isDark() ? 'Dark mode on' : 'Light mode on' };
    }
    if (/\b(dark|night)\b/.test(t) && /\b(mode|theme|on)\b|^dark$/.test(t)) {
      this.theme.setMode('dark');
      return { reply: 'Dark mode on' };
    }
    if (/\b(light|day|bright)\b/.test(t) && /\b(mode|theme|on)\b|^light$/.test(t)) {
      this.theme.setMode('light');
      return { reply: 'Light mode on' };
    }
    if (/\b(accent|colou?r|theme|make)\b/.test(t)) {
      const key = this.theme.accentKeys.find((k) => new RegExp(`\\b${this.theme.accents[k].name.toLowerCase()}\\b`).test(t));
      if (key) {
        this.theme.setAccent(key);
        return { reply: `Accent set to ${this.theme.accents[key].name}` };
      }
    }
    if (/\bcompact\b/.test(t)) {
      this.theme.setDensity('compact');
      return { reply: 'Compact layout' };
    }
    if (/\bcomfortable\b/.test(t)) {
      this.theme.setDensity('comfortable');
      return { reply: 'Comfortable layout' };
    }

    // ----- account / sync -----
    if (/\b(log ?out|sign ?out|logout|signout)\b/.test(t)) {
      const ok = await this.fb.confirm('Sign out?', 'Say or tap Sign out to confirm.', 'Sign out', true);
      if (!ok) return {};
      await this.store.reset();
      await this.auth.logout();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
      return {};
    }
    if (/\b(sync|refresh|reload|update data)\b/.test(t)) {
      void this.store.syncNow();
      return { reply: 'Syncing now' };
    }

    // ----- tools -----
    if (/\b(bulk|import|upload|excel|spreadsheet|template|csv)\b/.test(t)) {
      void this.modals.bulk();
      return { reply: 'Opening bulk upload' };
    }
    if (/\b(scan|receipt|photo|camera)\b/.test(t) || /\bbill\b/.test(t) && !/\bhow much\b/.test(t)) {
      void this.modals.scan();
      return { reply: 'Opening the bill scanner' };
    }
    if (/\b(check ?out|cart|basket)\b/.test(t)) {
      void this.modals.checkout();
      return { reply: 'Opening checkout' };
    }

    // ----- questions -----
    const ans = this.answer(t);
    if (ans) return { reply: ans };

    // ----- search / filter -----
    let m = t.match(/^(?:search|find|look for|search for|look up)\s+(.+)$/);
    if (m) {
      await this.router.navigate(['/tabs/list'], { queryParams: { q: m[1] } });
      return { reply: `Searching for ${m[1]}` };
    }
    if (NAV_VERB.test(t)) {
      const cat = this.store.allCategories().find((c) => c !== 'Other' && new RegExp(`\\b${c.toLowerCase()}\\b`).test(t));
      if (cat) {
        await this.router.navigate(['/tabs/list'], { queryParams: { cat } });
        return { reply: `Showing ${cat}` };
      }
    }

    // ----- add income -----
    if (ADD_VERB.test(t) && /\b(income|salary|earning|earnings|pay ?check|received|credited|earned)\b/.test(t) && !NAV_VERB.test(t)) {
      void this.modals.voiceEntry('income', /\d/.test(t) || /\b(salary|freelance|rent|interest|refund|gift)\b/.test(t) ? raw : '');
      return {};
    }
    if (/^(income|add income|new income|record income)$/.test(t)) {
      void this.modals.voiceEntry('income', '');
      return {};
    }

    // ----- add item (no price) -----
    m = t.match(/\b(?:add|create|new)\s+(?:a\s+)?(?:new\s+)?item(?:\s+(?:called|named))?\s*(.*)$/);
    if (m && !/\d/.test(t)) {
      const name = cleanName(m[1].replace(/\b(to|in|on)\b.*$/, '').trim());
      if (!name) {
        void this.modals.addItem();
        return { reply: 'Opening add item' };
      }
      const cats = this.store.allCategories();
      const res = this.store.addItem(name, categorize(name, this.store.items(), cats).category);
      return { reply: res.ok ? `Added ${name} to your items` : res.error || 'Could not add that item' };
    }

    // ----- add purchase -----
    if (/\b(purchase|expense|bought|buy|purchased|spent)\b/.test(t) || (ADD_VERB.test(t) && /\d/.test(t))) {
      const p = parsePurchase(raw);
      const generic = /^(?:add|new|record|log)?\s*(?:a\s+)?(?:new\s+)?(?:purchase|expense|entry)s?$/.test(t);
      void this.modals.voiceEntry('purchase', generic || (!p.name && p.amount == null) ? '' : raw);
      return {};
    }

    // ----- navigation -----
    const dest = this.destination(t);
    if (dest === 'back') {
      this.location.back();
      return {};
    }
    if (dest === 'denied') return { reply: 'Only admins can open Users' };
    if (dest) {
      await this.router.navigateByUrl(dest.url);
      return { reply: `Opening ${dest.label}` };
    }

    m = t.match(/^(?:open|show|view|go to|see)\s+(.+)$/);
    if (m) {
      const it = matchItem(m[1], this.store.items());
      if (it) {
        await this.router.navigateByUrl(`/tabs/item/${it.id}`);
        return { reply: `Opening ${it.name}` };
      }
    }

    // ----- "tomato 2 kg 80 rupees" with no verb -----
    const p = parsePurchase(raw);
    if (p.name && p.amount != null) {
      void this.modals.voiceEntry('purchase', raw);
      return {};
    }

    return { retry: `I didn’t understand “${raw}”. Try one of these.` };
  }

  private destination(t: string): { url: string; label: string } | 'back' | 'denied' | null {
    if (/\bgo back\b|^back$/.test(t)) return 'back';
    const map: [RegExp, string, string][] = [
      [/\b(categor(y|ies))\b/, '/tabs/categories', 'categories'],
      [/\b(insights?|stats?|statistics|analytics|reports?|charts?|trends?)\b/, '/tabs/insights', 'insights'],
      [/\b(money|income|balance|finance|wallet|ledger|cash ?flow|expenses?|sheet|savings)\b/, '/tabs/money', 'money'],
      [/\b(settings?|preferences|profile|account|options|more)\b/, '/tabs/more', 'settings'],
      [/\b(shop|shopping|list|items|groceries|grocery|products)\b/, '/tabs/list', 'the shopping list'],
      [/\b(home|dashboard|overview|main)\b/, '/tabs/home', 'the dashboard'],
    ];
    for (const [re, url, label] of map) if (re.test(t)) return { url, label };
    if (/\b(users?|admin|approvals?)\b/.test(t)) return this.auth.isAdmin() ? { url: '/tabs/admin', label: 'users' } : 'denied';
    return null;
  }

  /** Spoken answers to "how much did I spend…" style questions. */
  private answer(t: string): string | null {
    if (!/\b(how much|what'?s|what is|whats|total|tell me|do i have)\b/.test(t)) return null;
    if (!/\b(spent|spend|spending|expenses?|income|earned|balance|saved|savings|left|remaining|budget)\b/.test(t)) return null;
    const ps = this.store.purchases();
    const cur = monthKey();
    const last = /\blast month\b/.test(t);
    const ym = last ? shiftMonth(cur, -1) : cur;
    const label = last ? monthLabel(ym) : /\btoday\b/.test(t) ? 'today' : 'this month';
    if (/\btoday\b/.test(t)) {
      const today = todayISO();
      const v = ps.filter((p) => p.entry.date === today).reduce((a, p) => a + p.entry.totalAmount, 0);
      return `You have spent ${this.store.fmt(v, 0)} today`;
    }
    const spent = sumMonth(ps, ym);
    const earned = incomeMonth(this.store.income(), ym);
    if (/\b(budget|left|remaining)\b/.test(t)) {
      const target = this.store.settings().monthlyTarget;
      const left = target - spent;
      return left >= 0 ? `${this.store.fmt(left, 0)} left of your ${this.store.fmt(target, 0)} budget` : `You are ${this.store.fmt(-left, 0)} over your ${this.store.fmt(target, 0)} budget`;
    }
    if (/\b(income|earned)\b/.test(t)) return `Your income ${label} is ${this.store.fmt(earned, 0)}`;
    if (/\b(balance|saved|savings)\b/.test(t)) {
      const bal = earned - spent;
      return `Your balance ${label} is ${this.store.fmt(bal, 0)}: ${this.store.fmt(earned, 0)} income minus ${this.store.fmt(spent, 0)} spent`;
    }
    return `You spent ${this.store.fmt(spent, 0)} ${label}`;
  }
}
