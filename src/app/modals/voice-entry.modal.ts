import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { categorize, cleanName } from '../core/categorize';
import { FeedbackService } from '../core/feedback.service';
import { INCOME_SOURCES, UNITS } from '../core/models';
import { StoreService } from '../core/store.service';
import { categoryEmoji, todayISO } from '../core/utils';
import {
  IncomeSlots,
  PurchaseSlots,
  isCancel,
  isDone,
  isNo,
  isRestart,
  isYes,
  parseAmount,
  parseCorrection,
  parseIncome,
  parsePurchase,
  parseQty,
  parseShop,
  parseSource,
} from '../core/voice-parse';
import { VoiceService } from '../core/voice.service';

type Mode = 'purchase' | 'income';
type Ask = 'auto' | 'confirm' | 'change' | 'next' | 'shop';
interface Msg {
  who: 'bot' | 'me';
  text: string;
}

const SPOKEN_UNIT: Record<string, string> = { kg: 'kilograms', g: 'grams', L: 'litres', ml: 'millilitres', unit: '', dozen: 'dozen', pack: 'packs' };

@Component({
  selector: 'app-voice-entry-modal',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon],
  template: `
    <ion-content class="sheet-content">
      <div class="sheet-body voice">
        <div class="sheet-title">
          <div>
            <div class="eyebrow">Voice entry</div>
            <h2>{{ mode === 'purchase' ? 'Add a purchase' : 'Record income' }}</h2>
          </div>
          <div style="display: flex; gap: 6px">
            @if (voice.canSpeak) {
              <button class="icon-btn" (click)="voice.setTts(!voice.ttsOn())" [attr.aria-label]="voice.ttsOn() ? 'Mute spoken replies' : 'Turn on spoken replies'">
                <ion-icon [name]="voice.ttsOn() ? 'volume-high-outline' : 'volume-mute-outline'"></ion-icon>
              </button>
            }
            <button class="icon-btn" (click)="finish()" aria-label="Close"><ion-icon name="close-outline"></ion-icon></button>
          </div>
        </div>

        @if (!voice.supported) {
          <div class="scan-err"><ion-icon name="alert-circle-outline"></ion-icon><span>{{ voice.explain('unsupported') }}</span></div>
        }

        <!-- conversation -->
        <div class="vm-chat" #chat>
          @for (m of msgs(); track $index) {
            <div class="bubble" [class.bot]="m.who === 'bot'" [class.me]="m.who === 'me'">{{ m.text }}</div>
          }
          @if (voice.listening() && voice.partial()) {
            <div class="bubble me live">{{ voice.partial() }}…</div>
          }
        </div>

        <!-- mic -->
        <div class="vm-mic-row">
          <button class="vm-mic" [class.on]="voice.listening()" [class.talk]="voice.speaking()" (click)="toggleMic()" [disabled]="!voice.supported" [attr.aria-label]="voice.listening() ? 'Stop listening' : 'Start talking'">
            <ion-icon [name]="voice.listening() ? 'mic' : 'mic-outline'"></ion-icon>
            <i></i><i></i>
          </button>
          <div class="vm-state">
            <b>{{ stateText() }}</b>
            <small>{{ hint() }}</small>
          </div>
        </div>

        <!-- what we have so far -->
        @if (mode === 'purchase') {
          <div class="vm-draft">
            <div class="vm-need">
              <span [class.ok]="!!name.trim()">Item</span>
              <span [class.ok]="Number(qty) > 0">Quantity</span>
              <span [class.ok]="Number(amount) > 0">Amount</span>
              <span class="opt" [class.ok]="!!shop.trim()">Shop</span>
            </div>
            <div class="field">
              <label>Item</label>
              <input class="inp" [(ngModel)]="name" (change)="onName()" placeholder="e.g. Tomato" autocomplete="off" />
            </div>
            <div class="rv-grid">
              <div class="field">
                <label>Category</label>
                <select class="inp" [(ngModel)]="category" (ngModelChange)="catLocked = true" [disabled]="!!matchId">
                  @for (c of cats(); track c) { <option [value]="c">{{ emoji(c) }} {{ c }}</option> }
                </select>
              </div>
              <div class="field">
                <label>Qty</label>
                <input class="inp" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="qty" />
              </div>
              <div class="field">
                <label>Unit</label>
                <select class="inp" [(ngModel)]="unit">
                  @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                </select>
              </div>
              <div class="field">
                <label>Amount</label>
                <input class="inp" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="amount" />
              </div>
            </div>
            <div class="rv-grid g3" style="margin-top: 8px">
              <div class="field">
                <label>Shop</label>
                <input class="inp" [(ngModel)]="shop" list="gm-shops-v" placeholder="Optional" autocomplete="off" />
                <datalist id="gm-shops-v">@for (s of store.shops(); track s) { <option [value]="s"></option> }</datalist>
              </div>
              <div class="field">
                <label>Date</label>
                <input class="inp" type="date" [(ngModel)]="date" [max]="today" />
              </div>
              <div class="field">
                <label>Notes</label>
                <input class="inp" [(ngModel)]="note" placeholder="Optional" autocomplete="off" />
              </div>
            </div>
            @if (matchId) {
              <span class="tag ok" style="margin-top: 10px"><ion-icon name="checkmark-circle"></ion-icon> Added to your existing “{{ name }}”</span>
            }
          </div>
        } @else {
          <div class="vm-draft">
            <div class="vm-need">
              <span [class.ok]="Number(amount) > 0">Amount</span>
              <span [class.ok]="!!source.trim()">Source</span>
            </div>
            <div class="rv-grid g2">
              <div class="field">
                <label>Amount ({{ store.settings().currency }})</label>
                <input class="inp" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="amount" />
              </div>
              <div class="field">
                <label>Source</label>
                <input class="inp" [(ngModel)]="source" list="gm-src-v" placeholder="Salary, Freelance…" autocomplete="off" />
                <datalist id="gm-src-v">@for (s of sources(); track s) { <option [value]="s"></option> }</datalist>
              </div>
            </div>
            <div class="rv-grid g2" style="margin-top: 8px">
              <div class="field">
                <label>Date</label>
                <input class="inp" type="date" [(ngModel)]="date" [max]="today" />
              </div>
              <div class="field">
                <label>Note</label>
                <input class="inp" [(ngModel)]="note" placeholder="Optional" autocomplete="off" />
              </div>
            </div>
          </div>
        }

        @if (addedCount()) {
          <div class="vm-done"><ion-icon name="checkmark-circle"></ion-icon> {{ addedCount() }} saved this session · {{ store.fmt(addedTotal(), 0) }}</div>
        }

        <button class="btn-primary block" [disabled]="!valid()" (click)="saveManual(false)">
          <ion-icon name="checkmark"></ion-icon> {{ mode === 'purchase' ? 'Save purchase' : 'Save income' }}
        </button>
        <button class="btn-ghost block" style="margin-top: 10px" [disabled]="!valid()" (click)="saveManual(true)">
          <ion-icon name="add"></ion-icon> Save &amp; add another
        </button>
        @if (addedCount()) {
          <button class="btn-ghost block" style="margin-top: 10px" (click)="finish()">Done</button>
        }
      </div>
    </ion-content>
  `,
})
export class VoiceEntryModal implements OnInit, OnDestroy {
  @Input() mode: Mode = 'purchase';
  @Input() initialText = '';

  store = inject(StoreService);
  voice = inject(VoiceService);
  private fb = inject(FeedbackService);
  private mc = inject(ModalController);

  @ViewChild('chat') chat?: ElementRef<HTMLDivElement>;

  Number = Number;
  units = UNITS;
  today = todayISO();
  emoji = categoryEmoji;

  msgs = signal<Msg[]>([]);
  addedCount = signal(0);
  addedTotal = signal(0);
  stateText = signal('Getting ready…');

  // purchase draft
  name = '';
  category = 'Other';
  qty: number | null = null;
  unit = 'unit';
  amount: number | null = null;
  shop = '';
  note = '';
  date = todayISO();
  matchId?: string;
  catLocked = false;
  private unitGiven = false;
  private shopAsked = false;
  // income draft
  source = '';

  private ask: Ask = 'auto';
  private running = false;
  private closed = false;
  private silent = 0;
  private firstItem = true;

  cats = () => this.store.allCategories();
  sources = () => [...new Set([...INCOME_SOURCES, ...this.store.income().map((i) => i.source)])];

  ngOnInit() {
    if (this.mode === 'income') {
      const last = [...this.store.income()].sort((a, b) => b.date.localeCompare(a.date))[0];
      if (last) this.hintSource = last.source;
    }
    setTimeout(() => void this.begin(), 350);
  }

  private hintSource = '';

  ngOnDestroy() {
    this.closed = true;
    void this.voice.stop();
    this.voice.cancelSpeech();
  }

  hint() {
    if (this.voice.listening()) return 'Speak now – I stop when you pause';
    if (this.voice.speaking()) return '';
    return this.mode === 'purchase' ? 'Say “2 kilos tomato for 80 rupees at DMart”' : 'Say “received 50000 salary”';
  }

  /* ---------------- conversation loop ---------------- */

  private async begin() {
    if (this.closed) return;
    if (this.initialText) {
      this.addMsg('me', this.initialText);
      await this.handle(this.initialText);
    }
    if (this.voice.supported) void this.loop();
    else this.stateText.set('Type the details below');
  }

  toggleMic() {
    if (this.voice.listening()) {
      this.running = false;
      void this.voice.stop();
      this.stateText.set('Paused – tap the mic to continue');
      return;
    }
    this.voice.cancelSpeech();
    this.silent = 0;
    void this.loop();
  }

  private async loop() {
    if (this.running) return;
    this.running = true;
    while (this.running && !this.closed) {
      const q = this.nextQuestion();
      if (q) {
        this.addMsg('bot', q);
        this.stateText.set('Speaking…');
        await this.voice.speak(q);
        if (this.closed || !this.running) break;
      }
      this.stateText.set('Listening…');
      const r = await this.voice.listen();
      if (this.closed || !this.running) break;
      if (!r.text) {
        if (r.error && r.error !== 'no-speech') {
          this.addMsg('bot', this.voice.explain(r.error));
          break;
        }
        if (++this.silent >= 2) {
          this.addMsg('bot', "I'm not hearing anything. Tap the mic when you're ready, or type below.");
          break;
        }
        continue;
      }
      this.silent = 0;
      this.addMsg('me', r.text);
      this.stateText.set('Thinking…');
      await this.handle(r.text);
    }
    this.running = false;
    if (!this.closed) this.stateText.set('Tap the mic to talk');
  }

  /** Decides the next thing to ask from what is still missing. */
  private nextQuestion(): string {
    if (this.mode === 'income') {
      if (this.ask === 'next') return 'Saved. Another income entry? Tell me the amount, or say done.';
      if (this.ask === 'change') return 'What should I change? For example “amount 6000” or “source freelance”.';
      if (!(Number(this.amount) > 0)) return 'How much did you receive?';
      if (!this.source.trim()) return `Where is it from? For example ${this.hintSource || 'salary'}, business or freelance.`;
      this.ask = 'confirm';
      return `Record ${this.say$(this.amount)} from ${this.source}, ${this.dateWords()}. Say yes to save, or tell me what to change.`;
    }
    if (this.ask === 'next') return 'Saved. Anything else? Tell me the next item, or say done.';
    if (this.ask === 'change') return 'What should I change? For example “amount 90”, “shop Reliance” or “quantity 3 kilos”.';
    if (!this.name.trim()) return this.firstItem ? 'What did you buy? You can say it all at once, like “2 kilos tomato for 80 rupees at DMart”.' : "What's the item?";
    if (!(Number(this.qty) > 0)) return `How much ${this.name}? For example “2 kilos” or “6 pieces”.`;
    if (!(Number(this.amount) > 0)) return 'How much did you pay in total?';
    if (!this.shopAsked && !this.shop.trim()) {
      this.ask = 'shop';
      return 'Which shop was it from? Say skip if you don’t want to add one.';
    }
    this.ask = 'confirm';
    const u = SPOKEN_UNIT[this.unit] ?? this.unit;
    return `Add ${this.qty} ${u} ${this.name} for ${this.say$(this.amount)}${this.shop ? ' at ' + this.shop : ''}, ${this.dateWords()}. Say yes to save, or tell me what to change.`;
  }

  private say$(n: number | null) {
    const c = this.store.settings().currency;
    return `${n} ${c === 'INR' ? 'rupees' : c}`;
  }

  private dateWords() {
    if (this.date === this.today) return 'today';
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (this.date === todayISO(y)) return 'yesterday';
    return 'on ' + new Date(this.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  }

  /** Interpret one spoken reply. */
  private async handle(text: string): Promise<void> {
    const t = text.trim();
    const wasAsk = this.ask;

    if (wasAsk === 'next') {
      if (isDone(t) || isCancel(t)) return this.finish();
      this.ask = 'auto';
      return this.handle(t);
    }
    if (isCancel(t) && wasAsk !== 'shop') {
      this.addMsg('bot', 'Okay, cancelled.');
      await this.voice.speak('Okay, cancelled.');
      return this.finish();
    }
    if (isRestart(t)) {
      this.resetDraft(false);
      this.ask = 'auto';
      this.firstItem = true;
      return;
    }

    if (this.mode === 'income') return this.handleIncome(t, wasAsk);

    // ---- purchase ----
    if (wasAsk === 'confirm') {
      if (isYes(t)) return this.saveVoice();
      const fix = this.correction(t);
      if (fix) {
        this.applyPurchase(fix, true);
        this.ask = 'auto';
        this.confirmSoon();
        return;
      }
      if (isNo(t)) {
        this.ask = 'change';
        return;
      }
      this.addMsg('bot', 'Sorry, I didn’t get that.');
      return;
    }
    if (wasAsk === 'change') {
      const fix = this.correction(t);
      if (fix) {
        this.applyPurchase(fix, true);
        this.ask = 'auto';
        this.confirmSoon();
      } else {
        this.addMsg('bot', 'Try “amount 90”, “shop Reliance”, “quantity 3 kilos”, “category dairy” or “date yesterday”.');
      }
      return;
    }
    if (wasAsk === 'shop') {
      const shop = parseShop(t);
      const d = parsePurchase(t);
      if (shop == null) return;
      this.shop = shop;
      this.shopAsked = true;
      if (d.date) this.date = d.date;
      this.ask = 'auto';
      return;
    }

    // normal slot filling – the user may volunteer several things at once
    const p = parsePurchase(t);
    const asked = !this.name.trim() ? 'name' : !(Number(this.qty) > 0) ? 'qty' : !(Number(this.amount) > 0) ? 'amount' : '';
    if (asked !== 'name') delete p.name; // an answer to qty / amount is never the item name
    if (asked === 'qty' && p.qty == null) {
      const q = parseQty(t);
      if (q) {
        p.qty = q.qty;
        if (q.unit) p.unit = q.unit;
      }
    }
    if (asked === 'amount' && p.amount == null) {
      const a = parseAmount(t);
      if (a != null) p.amount = a;
    }
    if (asked === 'name' && !p.name && !Object.keys(p).length) {
      this.addMsg('bot', 'I didn’t catch the item name – try “tomato” or “two kilos of onions”.');
      return;
    }
    this.applyPurchase(p, false);
  }

  private confirmSoon() {
    /* nextQuestion() re-summarises because ask is 'auto' */
  }

  private correction(t: string): PurchaseSlots | null {
    const fix = parseCorrection(t, this.store.allCategories()) as PurchaseSlots & { category?: string };
    if (Object.keys(fix).length) return fix;
    const p = parsePurchase(t);
    delete p.name;
    return Object.keys(p).length ? p : null;
  }

  private handleIncome(t: string, wasAsk: Ask) {
    const known = this.sources();
    if (wasAsk === 'confirm') {
      if (isYes(t)) return this.saveVoice();
      const p = parseIncome(t, known);
      if (this.applyIncome(p, true)) {
        this.ask = 'auto';
        return;
      }
      if (isNo(t)) this.ask = 'change';
      return;
    }
    if (wasAsk === 'change') {
      const p = parseIncome(t, known);
      const m = t.match(/\bsource\b\s*(?:is|to|:)?\s*(.+)$/i);
      if (m) {
        const s = parseSource(m[1], known);
        if (s) p.source = s;
      }
      if (this.applyIncome(p, true)) this.ask = 'auto';
      else this.addMsg('bot', 'Try “amount 6000”, “source freelance” or “date yesterday”.');
      return;
    }
    const p = parseIncome(t, known);
    if (!p.source && Number(this.amount) > 0 && !this.source.trim()) {
      const s = parseSource(t, known);
      if (s) p.source = s;
    }
    if (p.amount == null && !(Number(this.amount) > 0)) {
      const a = parseAmount(t);
      if (a != null && !p.source) p.amount = a;
      else if (a != null) p.amount = a;
    }
    this.applyIncome(p, false);
  }

  /* ---------------- applying values ---------------- */

  private applyPurchase(p: PurchaseSlots & { category?: string }, override: boolean) {
    if (p.name) {
      const nm = cleanName(p.name);
      if (nm !== this.name) {
        this.name = nm;
        this.rematch();
      }
    }
    if (p.qty != null && p.qty > 0) this.qty = p.qty;
    if (p.unit) {
      this.unit = p.unit;
      if (p.unit !== 'unit') this.unitGiven = true;
    } else if (p.qty != null && !this.unitGiven && !override) {
      const it = this.matchId ? this.store.items().find((i) => i.id === this.matchId) : undefined;
      if (it?.lastUnit && UNITS.includes(it.lastUnit)) this.unit = it.lastUnit;
    }
    if (p.amount != null && p.amount > 0) this.amount = p.amount;
    if (p.shop != null) {
      this.shop = p.shop;
      this.shopAsked = true;
    }
    if (p.date) this.date = p.date;
    if (p.note) this.note = p.note;
    if (p.category && !this.matchId) {
      this.category = p.category;
      this.catLocked = true;
    }
  }

  private applyIncome(p: IncomeSlots, _override: boolean): boolean {
    let any = false;
    if (p.amount != null && p.amount > 0) {
      this.amount = p.amount;
      any = true;
    }
    if (p.source) {
      this.source = p.source;
      any = true;
    }
    if (p.date) {
      this.date = p.date;
      any = true;
    }
    if (p.note) {
      this.note = p.note;
      any = true;
    }
    return any;
  }

  onName() {
    this.rematch();
  }

  private rematch() {
    const c = categorize(this.name, this.store.items(), this.store.allCategories());
    this.matchId = c.itemId;
    if (c.itemId || (!this.catLocked && c.via !== 'none')) this.category = c.category;
    if (c.itemId) {
      const it = this.store.items().find((i) => i.id === c.itemId);
      if (it && it.name.toLowerCase() !== this.name.toLowerCase()) this.name = it.name;
      if (it) this.addMsg('bot', `Found “${it.name}” in your items.`);
    }
  }

  /* ---------------- saving ---------------- */

  valid() {
    if (this.mode === 'income') return Number(this.amount) > 0 && !!this.source.trim() && !!this.date;
    return !!this.name.trim() && Number(this.qty) > 0 && Number(this.amount) > 0 && !!this.date;
  }

  async saveVoice() {
    if (!this.valid()) {
      this.addMsg('bot', 'Something is still missing.');
      this.ask = 'auto';
      return;
    }
    const msg = this.commit();
    this.addMsg('bot', msg);
    this.ask = 'next';
  }

  saveManual(another: boolean) {
    if (!this.valid()) {
      this.fb.warn();
      this.fb.toast(this.mode === 'purchase' ? 'Add the item, quantity and amount' : 'Add the amount and source', 'error');
      return;
    }
    this.commit();
    if (another) {
      this.ask = 'auto';
      if (this.voice.supported && !this.running) void this.loop();
    } else this.finish();
  }

  /** Writes the entry to the store and clears the draft for the next one. Returns a short confirmation. */
  private commit(): string {
    const amt = Number(this.amount);
    let msg: string;
    if (this.mode === 'income') {
      this.store.addIncome({ date: this.date, amount: amt, source: this.source.trim(), note: this.note.trim() || undefined });
      msg = `Saved ${this.store.fmt(amt, 0)} from ${this.source.trim()}.`;
    } else {
      let id = this.matchId && this.store.items().some((i) => i.id === this.matchId) ? this.matchId : this.store.findItem(this.name)?.id;
      if (!id) id = this.store.addItem(this.name.trim(), this.category).item?.id ?? this.store.findItem(this.name)?.id;
      if (id) {
        this.store.addPurchases([
          {
            itemId: id,
            entry: {
              date: this.date,
              quantity: Number(this.qty),
              unit: this.unit,
              totalAmount: amt,
              store: this.shop.trim() || undefined,
              note: this.note.trim() || 'Voice entry',
            },
          },
        ]);
        this.store.setCart(id, false);
      }
      msg = `Saved ${this.name} for ${this.store.fmt(amt, 0)}.`;
    }
    this.addedCount.update((n) => n + 1);
    this.addedTotal.update((n) => n + amt);
    this.fb.success();
    this.fb.toast(msg);
    this.resetDraft(true);
    this.firstItem = false;
    return msg;
  }

  private resetDraft(keepShopAndDate: boolean) {
    this.name = '';
    this.qty = null;
    this.unit = 'unit';
    this.amount = null;
    this.note = '';
    this.matchId = undefined;
    this.catLocked = false;
    this.category = 'Other';
    this.unitGiven = false;
    this.source = this.mode === 'income' ? '' : this.source;
    if (!keepShopAndDate) {
      this.shop = '';
      this.shopAsked = false;
      this.date = todayISO();
    }
  }

  finish() {
    this.closed = true;
    this.running = false;
    void this.voice.stop();
    this.voice.cancelSpeech();
    this.mc.dismiss(this.addedCount() ? { added: this.addedCount() } : null, this.addedCount() ? 'saved' : 'cancel');
  }

  /* ---------------- chat ---------------- */

  private addMsg(who: Msg['who'], text: string) {
    this.msgs.update((m) => [...m.slice(-30), { who, text }]);
    setTimeout(() => {
      const el = this.chat?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 30);
  }
}
