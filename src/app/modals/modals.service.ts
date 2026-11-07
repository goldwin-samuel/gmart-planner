import { Injectable, Type, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { LayoutService } from '../core/layout.service';
import { HistoryEntry, Income, Item } from '../core/models';
import { AddItemModal } from './add-item.modal';
import { CheckoutModal } from './checkout.modal';
import { EntryModal } from './entry.modal';
import { IncomeModal } from './income.modal';
import { ScanModal } from './scan.modal';
import { BulkModal } from './bulk.modal';
import { VoiceCommandModal } from './voice-command.modal';
import { VoiceEntryModal } from './voice-entry.modal';
import { PasswordModal } from './password.modal';

@Injectable({ providedIn: 'root' })
export class ModalsService {
  private mc = inject(ModalController);
  private layout = inject(LayoutService);

  addItem(opts: { item?: Item; presetCategory?: string } = {}) {
    return this.open(AddItemModal, opts, 0.62, 400);
  }

  entry(item: Item, entry?: HistoryEntry) {
    return this.open(EntryModal, { item, entry }, 0.92, 560);
  }

  income(income?: Income) {
    return this.open(IncomeModal, { income }, 0.72, 520);
  }

  scan() {
    return this.open(ScanModal, {}, 0.96, 760);
  }

  bulk() {
    return this.open(BulkModal, {}, 0.96, 780);
  }

  voiceEntry(mode: 'purchase' | 'income', initialText = '') {
    return this.open(VoiceEntryModal, { mode, initialText }, 0.96, 780);
  }

  voiceCommand(notice = '') {
    return this.open(VoiceCommandModal, { notice }, 0.75, 560);
  }

  checkout() {
    return this.open(CheckoutModal, {}, 0.94, 680);
  }

  changePassword() {
    return this.open(PasswordModal, {}, 0.55, 440);
  }

  private async open(component: Type<unknown>, props: Record<string, unknown>, breakpoint: number, desktopHeight = 560) {
    // Desktop: centred dialog. Mobile: bottom sheet.
    if (this.layout.isDesktop()) {
      const m = await this.mc.create({ component, componentProps: props, cssClass: 'gm-dialog' });
      m.style.setProperty('--height', `${desktopHeight}px`);
      await m.present();
      return m.onDidDismiss();
    }
    const m = await this.mc.create({
      component,
      componentProps: props,
      breakpoints: [0, breakpoint],
      initialBreakpoint: breakpoint,
      handle: true,
      cssClass: 'gm-sheet',
    });
    await m.present();
    return m.onDidDismiss();
  }
}
