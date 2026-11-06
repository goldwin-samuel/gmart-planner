import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { AuthService } from '../../core/auth.service';
import { StoreService } from '../../core/store.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon],
  template: `
    <ion-content [fullscreen]="true">
      <div class="auth-split">
        <!-- brand panel (desktop) -->
        <section class="auth-brand">
          <div class="ab-logo"><div class="logo">G</div> G-Mart Planner</div>
          <div>
            <h2>Plan the month.<br />Spend with clarity.</h2>
            <p>Track what you buy, watch prices move and stay inside your budget — on the web and on your phone, always in sync.</p>
            <div class="ab-feats">
              <div><span>📊</span> Budget ring, trends and category insights</div>
              <div><span>🏷️</span> Price history and alerts for every item</div>
              <div><span>🛒</span> Tick items as you shop, check out in one tap</div>
            </div>
          </div>
          <div class="ab-foot">© G-Mart Planner</div>
        </section>

        <!-- form -->
        <section class="auth-panel">
          <div class="auth-form pop-in">
            <div class="logo m-only">G</div>
            <div class="eyebrow">{{ register ? 'Get started' : 'Welcome back' }}</div>
            <h1 class="title" style="font-size: 32px">{{ register ? 'Create your account' : 'Sign in to your planner' }}</h1>
            <p class="muted" style="margin: 8px 0 26px; font-size: 14.5px; line-height: 1.5">
              {{ register ? 'An admin will approve your account before you can sign in.' : 'Your lists, prices and budget sync across all your devices.' }}
            </p>

            @if (register) {
              <div class="field">
                <label>Full name</label>
                <input class="inp" [(ngModel)]="name" placeholder="Your name" autocomplete="name" />
              </div>
            }
            <div class="field">
              <label>Username</label>
              <input class="inp" [(ngModel)]="username" placeholder="Username" autocomplete="username" autocapitalize="none" />
            </div>
            <div class="field">
              <label>Password</label>
              <div class="pw-wrap">
                <input class="inp" [type]="show ? 'text' : 'password'" [(ngModel)]="password" placeholder="Password" autocomplete="current-password" (keyup.enter)="submit()" />
                <button type="button" (click)="show = !show" aria-label="Toggle password">
                  <ion-icon [name]="show ? 'eye-off-outline' : 'eye-outline'"></ion-icon>
                </button>
              </div>
            </div>

            @if (error) { <p class="err">{{ error }}</p> }
            @if (info) { <p class="ok-msg">{{ info }}</p> }

            <button class="btn-primary block" [disabled]="busy" (click)="submit()">
              {{ busy ? 'Please wait…' : register ? 'Create account' : 'Sign in' }}
            </button>
            <button class="btn-ghost block" style="margin-top: 12px" (click)="toggle()">
              {{ register ? 'I already have an account' : 'Need an account? Register' }}
            </button>
          </div>
        </section>
      </div>
    </ion-content>
  `,
})
export class AuthPage {
  private auth = inject(AuthService);
  private store = inject(StoreService);
  private router = inject(Router);

  register = false;
  show = false;
  busy = false;
  name = '';
  username = '';
  password = '';
  error = '';
  info = '';

  toggle() {
    this.register = !this.register;
    this.error = '';
    this.info = '';
  }

  async submit() {
    this.error = '';
    this.info = '';
    const username = this.username.trim();
    if (!username || !this.password || (this.register && !this.name.trim())) {
      this.error = 'Please fill out all required fields.';
      return;
    }
    this.busy = true;
    try {
      if (this.register) {
        const r = await this.auth.register(this.name.trim(), username, this.password);
        if (r.status === 'success') {
          this.info = r.message || 'Registered. Wait for admin approval, then sign in.';
          this.register = false;
          this.password = '';
        } else {
          this.error = r.message || 'Registration failed';
        }
        return;
      }
      const r = await this.auth.login(username, this.password);
      if (r.status === 'success') {
        await this.store.reset(); // never leak a previous user's cached data
        await this.store.hydrate();
        this.password = '';
        void this.store.refresh();
        await this.router.navigateByUrl('/tabs/home', { replaceUrl: true });
      } else {
        const msg = r.message ?? '';
        this.error = msg.includes('not_approved') ? 'Your account is awaiting admin approval.' : msg || 'Login failed';
      }
    } finally {
      this.busy = false;
    }
  }
}
