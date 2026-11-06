import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

@Injectable({ providedIn: 'root' })
export class StorageService {
  async get<T>(key: string): Promise<T | null> {
    const { value } = await Preferences.get({ key });
    if (value == null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await Preferences.set({ key, value: JSON.stringify(value) });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}
