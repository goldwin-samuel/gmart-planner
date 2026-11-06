import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { FeedbackService } from '../core/feedback.service';

@Component({
  selector: 'app-password-modal',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon],
  template: `
    <ion-content class="sheet-content">
      <div class="sheet-body">
        <div class="sheet-title">
          <div>
            <div class="eyebrow">Security</div>
            <h2>Change password</h2>
          </div>
          <button class="icon-btn" (click)="cancel()" aria-label="Close"><ion-icon name="close-outline"></ion-icon></button>
        </div>

        <div class="field">
          <label>New password</label>
          <input class="inp" [type]="show ? 'text' : 'password'" [(ngModel)]="pwd" placeholder="At least 6 characters" autocomplete="new-password" />
        </div>
        <div class="field">
          <label>Confirm password</label>
          <input class="inp" [type]="show ? 'text' : 'password'" [(ngModel)]="confirm" placeholder="Repeat password" autocomplete="new-password" (keyup.enter)="save()" />
        </div>
        <button class="chip soft" style="margin-bottom: 16px" (click)="show = !show">
          <ion-icon [name]="show ? 'eye-off-outline' : 'eye-outline'"></ion-icon> {{ show ? 'Hide' : 'Show' }} passwords
        </button>

        <button class="btn-primary block" [disabled]="busy" (click)="save()">{{ busy ? 'Saving…' : 'Update password' }}</button>
      </div>
    </ion-content>
  `,
})
export class PasswordModal {
  private api = inject(ApiService);
  private fb = inject(FeedbackService);
  private mc = inject(ModalController);

  pwd = '';
  confirm = '';
  show = false;
  busy = false;

  async save() {
    if (!this.pwd || !this.confirm) return this.fb.toast('Fill out both fields', 'error');
    if (this.pwd !== this.confirm) return this.fb.toast('Passwords do not match', 'error');
    if (this.pwd.length < 6) return this.fb.toast('Use at least 6 characters', 'error');
    this.busy = true;
    const r = await this.api.changePassword(this.pwd);
    this.busy = false;
    if (r.status === 'success') {
      this.fb.success();
      this.fb.toast(r.message || 'Password updated');
      this.mc.dismiss(true, 'saved');
    } else {
      this.fb.toast(r.message || 'Could not update password', 'error');
    }
  }

  cancel() {
    this.mc.dismiss(null, 'cancel');
  }
}
