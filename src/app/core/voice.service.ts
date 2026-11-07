import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition as NativeSR } from '@capacitor-community/speech-recognition';

export interface ListenResult {
  text: string;
  /** set when nothing usable was heard: 'no-speech' | 'denied' | 'unsupported' | 'network' | 'busy' | 'error' */
  error?: string;
}

const LANG = 'en-IN';
const TTS_KEY = 'gm_voice_tts';

/**
 * Speech in / speech out for the whole app.
 *  - Android/iOS app: @capacitor-community/speech-recognition (the WebView has no Web Speech API)
 *  - Browsers: webkitSpeechRecognition (Chrome, Edge, Safari). Firefox has none → `supported` is false.
 *  - Speaking uses speechSynthesis where available.
 */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  listening = signal(false);
  speaking = signal(false);
  /** live words while the user is still talking (browser only) */
  partial = signal('');
  ttsOn = signal(this.readTts());

  private web: any = null;
  private stopRequested = false;
  private native = Capacitor.isNativePlatform();

  /** Can we listen at all on this device? (native availability is confirmed on first use) */
  get supported(): boolean {
    if (this.native) return true;
    const w = window as any;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  get canSpeak(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  setTts(on: boolean) {
    this.ttsOn.set(on);
    try {
      localStorage.setItem(TTS_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!on) this.cancelSpeech();
  }

  private readTts(): boolean {
    try {
      return localStorage.getItem(TTS_KEY) !== '0';
    } catch {
      return true;
    }
  }

  /** Listen for one utterance. Resolves with '' text + error when nothing was understood. */
  async listen(): Promise<ListenResult> {
    if (this.listening()) return { text: '', error: 'busy' };
    this.cancelSpeech();
    this.stopRequested = false;
    this.partial.set('');
    return this.native ? this.listenNative() : this.listenWeb();
  }

  /** Stop listening now (resolves the pending listen()). */
  async stop() {
    this.stopRequested = true;
    try {
      if (this.native) await NativeSR.stop();
      else this.web?.stop?.();
    } catch {
      /* ignore */
    }
  }

  /* ---------------- browser ---------------- */

  private listenWeb(): Promise<ListenResult> {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return Promise.resolve({ text: '', error: 'unsupported' });
    return new Promise<ListenResult>((resolve) => {
      const r = new SR();
      this.web = r;
      r.lang = LANG;
      r.interimResults = true;
      r.continuous = false;
      r.maxAlternatives = 1;
      let finalText = '';
      let interim = '';
      let error: string | undefined;
      r.onstart = () => this.listening.set(true);
      r.onresult = (e: any) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript;
          else interim += res[0].transcript;
        }
        this.partial.set((finalText + ' ' + interim).trim());
      };
      r.onerror = (e: any) => {
        const code = String(e?.error ?? 'error');
        error = code === 'not-allowed' || code === 'service-not-allowed' ? 'denied' : code === 'no-speech' ? 'no-speech' : code === 'aborted' ? undefined : code === 'network' ? 'network' : 'error';
      };
      r.onend = () => {
        this.listening.set(false);
        this.web = null;
        const text = (finalText || interim).trim();
        this.partial.set('');
        resolve(text ? { text } : { text: '', error: error ?? 'no-speech' });
      };
      try {
        r.start();
      } catch {
        this.listening.set(false);
        resolve({ text: '', error: 'busy' });
      }
    });
  }

  /* ---------------- Android / iOS app ---------------- */

  private async listenNative(): Promise<ListenResult> {
    try {
      const { available } = await NativeSR.available();
      if (!available) return { text: '', error: 'unsupported' };
      let perm = await NativeSR.checkPermissions();
      if (perm.speechRecognition !== 'granted') perm = await NativeSR.requestPermissions();
      if (perm.speechRecognition !== 'granted') return { text: '', error: 'denied' };
      // Android's recogniser needs a moment after the previous session / after TTS
      await new Promise((r) => setTimeout(r, 250));
      this.listening.set(true);
      const res = await NativeSR.start({ language: LANG, maxResults: 3, prompt: '', partialResults: false, popup: false });
      const text = (res.matches?.[0] ?? '').trim();
      return text ? { text } : { text: '', error: 'no-speech' };
    } catch (e: any) {
      const m = String(e?.message ?? e ?? '').toLowerCase();
      if (this.stopRequested) return { text: '' };
      if (/permission|denied|not allowed/.test(m)) return { text: '', error: 'denied' };
      if (/no match|no speech|speech timeout|didn'?t understand|7|6/.test(m)) return { text: '', error: 'no-speech' };
      if (/network/.test(m)) return { text: '', error: 'network' };
      return { text: '', error: 'error' };
    } finally {
      this.listening.set(false);
    }
  }

  /* ---------------- speaking ---------------- */

  cancelSpeech() {
    if (!this.canSpeak) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    this.speaking.set(false);
  }

  /** Speaks `text` (if voice replies are on) and resolves when finished – or after a safety timeout. */
  speak(text: string): Promise<void> {
    if (!this.ttsOn() || !this.canSpeak || !text) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        this.speaking.set(false);
        resolve();
      };
      const guard = setTimeout(finish, Math.min(15000, 2500 + text.length * 90));
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text.replace(/₹\s*([\d,.]+)/g, '$1 rupees').replace(/₹/g, 'rupees'));
        u.lang = LANG;
        u.rate = 1.02;
        u.onend = finish;
        u.onerror = finish;
        this.speaking.set(true);
        window.speechSynthesis.speak(u);
      } catch {
        finish();
      }
    });
  }

  /** Human-readable reason for a failed listen. */
  explain(error?: string): string {
    switch (error) {
      case 'denied':
        return 'Microphone permission is off. Allow it in your browser / phone settings, then tap the mic.';
      case 'unsupported':
        return this.native
          ? 'Speech recognition is not available on this phone (install / enable the Google app).'
          : 'This browser has no speech recognition. Use Chrome or Edge, or type below.';
      case 'network':
        return 'Speech recognition needs an internet connection.';
      case 'no-speech':
        return "I didn't hear anything. Tap the mic and try again.";
      case 'busy':
        return 'Still listening… try again in a second.';
      default:
        return 'Something went wrong with the microphone. Tap the mic to retry.';
    }
  }
}
