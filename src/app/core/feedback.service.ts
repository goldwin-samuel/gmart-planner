import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { StorageService } from './storage.service';

type Kind = 'ok' | 'error' | 'info';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private toasts = inject(ToastController);
  private alerts = inject(AlertController);
  private storage = inject(StorageService);

  haptics = signal(true);

  async init() {
    const v = await this.storage.get<boolean>('gmartHaptics');
    if (v !== null) this.haptics.set(v);
  }

  setHaptics(v: boolean) {
    this.haptics.set(v);
    void this.storage.set('gmartHaptics', v);
  }

  private get on() {
    return this.haptics() && Capacitor.isNativePlatform();
  }

  tap() {
    if (this.on) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  success() {
    if (this.on) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  }

  warn() {
    if (this.on) Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  }

  async toast(message: string, kind: Kind = 'ok', duration = 2400) {
    const icon = kind === 'ok' ? 'checkmark-circle' : kind === 'error' ? 'alert-circle-outline' : 'information-circle-outline';
    const t = await this.toasts.create({
      message,
      duration,
      position: 'top',
      icon,
      cssClass: `gm-toast gm-toast-${kind}`,
    });
    await t.present();
  }

  async confirm(header: string, message: string, okText = 'Confirm', danger = false): Promise<boolean> {
    const a = await this.alerts.create({
      header,
      message,
      cssClass: 'gm-alert',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: okText, role: 'confirm', cssClass: danger ? 'alert-danger' : '' },
      ],
    });
    await a.present();
    const { role } = await a.onDidDismiss();
    return role === 'confirm';
  }

  async prompt(header: string, placeholder: string, value = ''): Promise<string | null> {
    const a = await this.alerts.create({
      header,
      cssClass: 'gm-alert',
      inputs: [{ name: 'v', type: 'text', placeholder, value }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Save', role: 'confirm' },
      ],
    });
    await a.present();
    const res = await a.onDidDismiss();
    if (res.role !== 'confirm') return null;
    const v = String(res.data?.values?.v ?? '').trim();
    return v || null;
  }
}
