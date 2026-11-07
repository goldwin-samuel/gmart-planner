import { Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { VoiceService } from '../core/voice.service';

export const COMMAND_EXAMPLES = [
  'Open money',
  'Go to dashboard',
  'Add purchase',
  'Add income',
  'Scan a bill',
  'Bulk upload',
  'Search tomato',
  'Show dairy',
  'How much did I spend this month',
  'Dark mode',
  'Open checkout',
  'Sync now',
];

@Component({
  selector: 'app-voice-command-modal',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon],
  template: `
    <ion-content class="sheet-content">
      <div class="sheet-body voice">
        <div class="sheet-title">
          <div>
            <div class="eyebrow">Voice control</div>
            <h2>What would you like to do?</h2>
          </div>
          <button class="icon-btn" (click)="cancel()" aria-label="Close"><ion-icon name="close-outline"></ion-icon></button>
        </div>

        @if (notice) {
          <div class="scan-note"><ion-icon name="information-circle-outline"></ion-icon><span>{{ notice }}</span></div>
        }

        <div class="vm-mic-row big">
          <button class="vm-mic" [class.on]="voice.listening()" (click)="toggle()" [disabled]="!voice.supported" [attr.aria-label]="voice.listening() ? 'Stop' : 'Start listening'">
            <ion-icon [name]="voice.listening() ? 'mic' : 'mic-outline'"></ion-icon>
            <i></i><i></i>
          </button>
          <div class="vm-state">
            <b>{{ state() }}</b>
            <small>{{ heard() || (voice.listening() ? voice.partial() || 'Say a command…' : 'Tap the mic and speak') }}</small>
          </div>
        </div>

        @if (error()) {
          <div class="scan-err"><ion-icon name="alert-circle-outline"></ion-icon><span>{{ error() }}</span></div>
        }

        <div class="field" style="margin: 14px 0 6px">
          <label>Or type a command</label>
          <div style="display: flex; gap: 8px">
            <input class="inp" [(ngModel)]="typed" placeholder="e.g. open money" (keyup.enter)="send(typed)" autocomplete="off" />
            <button class="btn-primary sm" (click)="send(typed)" [disabled]="!typed.trim()">Go</button>
          </div>
        </div>

        <div class="vm-try">
          <small>Try saying</small>
          <div class="chips wrap-chips">
            @for (c of examples; track c) {
              <button class="chip" (click)="send(c)">“{{ c }}”</button>
            }
          </div>
        </div>
      </div>
    </ion-content>
  `,
})
export class VoiceCommandModal implements OnInit, OnDestroy {
  @Input() notice = '';

  voice = inject(VoiceService);
  private mc = inject(ModalController);

  examples = COMMAND_EXAMPLES;
  typed = '';
  state = signal('Getting ready…');
  heard = signal('');
  error = signal('');
  private done = false;

  ngOnInit() {
    if (this.voice.supported) setTimeout(() => void this.listen(), 350);
    else {
      this.state.set('Voice not available');
      this.error.set(this.voice.explain('unsupported'));
    }
  }

  ngOnDestroy() {
    this.done = true;
    void this.voice.stop();
  }

  toggle() {
    if (this.voice.listening()) void this.voice.stop();
    else void this.listen();
  }

  private async listen() {
    if (this.done) return;
    this.error.set('');
    this.heard.set('');
    this.state.set('Listening…');
    const r = await this.voice.listen();
    if (this.done) return;
    if (!r.text) {
      this.state.set('Tap the mic to try again');
      if (r.error && r.error !== 'no-speech') this.error.set(this.voice.explain(r.error));
      else if (r.error === 'no-speech') this.error.set(this.voice.explain('no-speech'));
      return;
    }
    this.heard.set('“' + r.text + '”');
    this.state.set('Got it');
    setTimeout(() => this.send(r.text), 300);
  }

  send(text: string) {
    const t = text.trim();
    if (!t || this.done) return;
    this.done = true;
    this.mc.dismiss({ text: t }, 'command');
  }

  cancel() {
    this.done = true;
    void this.voice.stop();
    this.mc.dismiss(null, 'cancel');
  }
}
