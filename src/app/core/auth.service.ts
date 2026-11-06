import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ApiResponse, User } from './models';
import { StorageService } from './storage.service';

const KEY = 'gmartUser';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private storage = inject(StorageService);

  user = signal<User | null>(null);
  isAdmin = computed(() => this.user()?.role === 'admin');
  firstName = computed(() => (this.user()?.name || this.user()?.username || 'there').split(' ')[0]);

  async restore(): Promise<void> {
    const u = await this.storage.get<User>(KEY);
    this.user.set(u && u.id ? u : null);
    this.api.userId = this.user()?.id ?? null;
  }

  async login(username: string, password: string): Promise<ApiResponse> {
    const r = await this.api.login(username, password);
    if (r.status === 'success' && r['user']) {
      const u = r['user'] as User;
      this.user.set(u);
      this.api.userId = u.id;
      await this.storage.set(KEY, u);
    }
    return r;
  }

  register(name: string, username: string, password: string) {
    return this.api.register(name, username, password);
  }

  async logout(): Promise<void> {
    this.user.set(null);
    this.api.userId = null;
    await this.storage.remove(KEY);
  }
}
