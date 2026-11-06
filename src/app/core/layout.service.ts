import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private storage = inject(StorageService);

  /** true when the viewport is wide enough for the sidebar layout */
  isDesktop = signal(false);
  collapsed = signal(false);
  themePanel = signal(false);

  constructor() {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(min-width: 1024px)') : undefined;
    if (mq) {
      this.isDesktop.set(mq.matches);
      mq.addEventListener?.('change', (e) => this.isDesktop.set(e.matches));
    }
  }

  async init() {
    const v = await this.storage.get<boolean>('gmartSidebar');
    if (v !== null) this.collapsed.set(v);
  }

  setCollapsed(v: boolean) {
    this.collapsed.set(v);
    void this.storage.set('gmartSidebar', v);
  }

  toggleCollapsed() {
    this.setCollapsed(!this.collapsed());
  }
}
