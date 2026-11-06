import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { ApiResponse, Income, Item, Settings } from './models';

/**
 * Thin client for the existing Google Apps Script backend.
 * Contract is unchanged from the original index.html:
 *  - GET  ?action=...&userId=...
 *  - POST text/plain JSON body (simple request => no CORS preflight)
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  userId: string | null = null;

  private async request(
    action: string,
    payload: Record<string, unknown> = {},
    method: 'GET' | 'POST' = 'POST',
    timeoutMs = 30000,
  ): Promise<ApiResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let resp: Response;
      if (method === 'GET') {
        const params = new URLSearchParams({ action });
        if (this.userId) params.set('userId', this.userId);
        for (const [k, v] of Object.entries(payload)) params.set(k, String(v));
        resp = await fetch(`${environment.apiUrl}?${params.toString()}`, { signal: ctrl.signal });
      } else {
        resp = await fetch(environment.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action, userId: this.userId, ...payload }),
          signal: ctrl.signal,
        });
      }
      return (await resp.json()) as ApiResponse;
    } catch (e: any) {
      const message =
        e?.name === 'AbortError'
          ? 'Request timed out'
          : typeof navigator !== 'undefined' && navigator.onLine === false
            ? 'You are offline'
            : e?.message || 'Network error';
      return { status: 'error', message };
    } finally {
      clearTimeout(timer);
    }
  }

  login(username: string, password: string) {
    return this.request('loginUser', { username, password });
  }
  register(name: string, username: string, password: string) {
    return this.request('registerUser', { name, username, password });
  }
  getItems() {
    return this.request('getItems', {}, 'GET');
  }
  saveItems(items: Item[]) {
    return this.request('saveItems', { items });
  }
  getIncome() {
    return this.request('getIncome', {}, 'GET');
  }
  saveIncome(income: Income[]) {
    return this.request('saveIncome', { income });
  }
  /** Sends a (compressed) bill photo for OCR. Can take a while, so the timeout is generous. */
  scanBill(image: string, mime: string, categories: string[]) {
    return this.request('scanBill', { image, mime, categories }, 'POST', 90000);
  }
  getSettings() {
    return this.request('getSettings', {}, 'GET');
  }
  saveSettings(settings: Settings) {
    return this.request('saveSettings', { settings });
  }
  getCategories() {
    return this.request('getCategories', {}, 'GET');
  }
  saveCategory(name: string) {
    return this.request('saveCategory', { name });
  }
  getAllUsers() {
    return this.request('getAllUsers', { userId: this.userId });
  }
  /** `userId` is the user being approved; `requestedBy` is the signed-in admin (checked server-side). */
  approveUser(targetUserId: string) {
    return this.request('approveUser', { userId: targetUserId, requestedBy: this.userId });
  }
  changePassword(newPassword: string) {
    return this.request('changePassword', { userId: this.userId, newPassword });
  }
}
