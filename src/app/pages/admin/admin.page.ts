import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { IonContent, IonIcon, NavController } from '@ionic/angular/standalone';
import { ApiService } from '../../core/api.service';
import { FeedbackService } from '../../core/feedback.service';
import { User } from '../../core/models';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [IonContent, IonIcon],
  template: `
    <ion-content [fullscreen]="true">
      <div class="wrap narrow">
        <div class="back-row m-only">
          <button class="btn-ghost sm" (click)="back()"><ion-icon name="chevron-back"></ion-icon> Back</button>
        </div>

        <div class="page-head h-row">
          <div>
            <div class="eyebrow">Admin</div>
            <h1 class="title">Users</h1>
          </div>
          <button class="btn-ghost sm" [class.spin]="loading()" (click)="load()"><ion-icon name="refresh-outline"></ion-icon> Reload</button>
        </div>

        @if (error()) {
          <div class="card empty">
            <div class="empty-ico">⚠️</div>
            <h3>Couldn’t load users</h3>
            <p>{{ error() }}</p>
            <button class="btn-primary" (click)="load()">Try again</button>
          </div>
        } @else {
          @if (pending().length) {
            <div class="card">
              <div class="card-head"><div><h3>Awaiting approval</h3><small>{{ pending().length }} new registration{{ pending().length > 1 ? 's' : '' }}</small></div></div>
              <div class="plain-rows">
                @for (u of pending(); track u.id) {
                  <div class="row" style="cursor: default">
                    <div class="avatar" style="font-weight: 800">{{ initial(u) }}</div>
                    <div class="row-main"><b>{{ u.name }}</b><span>{{ u.username }} · {{ u.role }}</span></div>
                    <button class="btn-primary sm" [disabled]="busyId() === u.id" (click)="approve(u)">Approve</button>
                  </div>
                }
              </div>
            </div>
          }

          <div class="card">
            <div class="card-head"><div><h3>Approved users</h3><small>{{ approved().length }} active</small></div></div>
            @if (approved().length) {
              <div class="plain-rows">
                @for (u of approved(); track u.id) {
                  <div class="row" style="cursor: default">
                    <div class="avatar" style="font-weight: 800">{{ initial(u) }}</div>
                    <div class="row-main"><b>{{ u.name }}</b><span>{{ u.username }}</span></div>
                    <span class="pill" style="text-transform: capitalize">{{ u.role }}</span>
                  </div>
                }
              </div>
            } @else if (!loading()) {
              <p class="muted" style="margin: 0">No users found.</p>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class AdminPage implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FeedbackService);
  private nav = inject(NavController);

  users = signal<User[]>([]);
  loading = signal(false);
  error = signal('');
  busyId = signal<string | null>(null);

  pending = computed(() => this.users().filter((u) => !u.approved));
  approved = computed(() => this.users().filter((u) => u.approved));

  ngOnInit() {
    void this.load();
  }

  initial(u: User) {
    return (u.name || u.username || '?')[0].toUpperCase();
  }

  back() {
    this.nav.navigateBack('/tabs/more');
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    const r = await this.api.getAllUsers();
    this.loading.set(false);
    if (r.status === 'success') this.users.set((r['users'] as User[]) ?? []);
    else this.error.set(r.message || 'Unknown error');
  }

  async approve(u: User) {
    this.busyId.set(u.id);
    const r = await this.api.approveUser(u.id);
    this.busyId.set(null);
    if (r.status === 'success') {
      this.fb.success();
      this.fb.toast(r.message || `${u.name} approved`);
      this.users.update((l) => l.map((x) => (x.id === u.id ? { ...x, approved: true } : x)));
    } else {
      this.fb.toast(r.message || 'Approval failed', 'error');
    }
  }
}
