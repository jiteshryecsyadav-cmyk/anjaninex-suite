import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, FirmChoice } from '../../core/auth.service';

@Component({
  selector: 'mfg-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen grid place-items-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-sm p-6 shadow-lg">
        <div class="text-center mb-5">
          <div class="text-4xl mb-2">🏭</div>
          <div class="font-extrabold text-brand-purple text-xl">Manufacturer</div>
          <div class="text-xs text-brand-muted">Anjaninex — Vyapaar Setu ka hissa</div>
        </div>

        @if (err()) {
          <div class="text-brand-bad text-sm font-bold mb-3 text-center">{{ err() }}</div>
        }

        @if (firms().length) {
          <!-- Ek hi id kai firms me hai — pehle firm chuno -->
          <p class="text-sm text-slate-600 mb-3 text-center">
            Aapki ek se zyada firm hain — kis me jaana hai?
          </p>
          <div class="space-y-2 mb-4">
            @for (f of firms(); track f.firmId) {
              <button class="btn-line w-full text-left" [disabled]="busy()"
                      (click)="go(f.firmId)">🏢 {{ f.firmName }}</button>
            }
          </div>
          <button class="text-xs text-brand-muted font-bold w-full" (click)="firms.set([])">
            ← wapas
          </button>
        } @else {
          <label class="label">User ID</label>
          <input class="input mb-3" [(ngModel)]="username" (keyup.enter)="go()"
                 autocomplete="username" placeholder="apna user id">

          <label class="label">Password</label>
          <input class="input mb-3" type="password" [(ngModel)]="password" (keyup.enter)="go()"
                 autocomplete="current-password">

          <!-- Remember me sach me kaam karta hai — API 90 din ka session deti hai.
               Phone par baar-baar id/password daalna sabse badi shikayat thi. -->
          <label class="flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" [(ngModel)]="remember" class="w-4 h-4 accent-[#5c1a8b]">
            Mujhe yaad rakho
          </label>

          <button class="btn-primary w-full" [disabled]="busy()" (click)="go()">
            {{ busy() ? 'Ruk jaiye…' : 'ANDAR AAIYE' }}
          </button>
        }
      </div>
    </div>
  `
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  remember = true;
  busy = signal(false);
  err = signal('');
  firms = signal<FirmChoice[]>([]);

  go(firmId?: string) {
    if (!this.username.trim() || !this.password) {
      this.err.set('User id aur password dono chahiye');
      return;
    }
    this.busy.set(true);
    this.err.set('');

    this.auth.login(this.username.trim(), this.password, this.remember, firmId).subscribe({
      next: res => {
        this.busy.set(false);
        if (res.kind === 'choose-firm') { this.firms.set(res.firms); return; }
        this.router.navigate(['/']);
      },
      error: e => {
        // 402 = firm ka plan band ho gaya. Baaki sab galat id/password.
        this.err.set(
          e?.status === 402 ? 'Firm ka plan band hai — pehle renew kijiye'
                            : (e?.error?.error ?? 'User id ya password galat hai'));
        this.busy.set(false);
      }
    });
  }
}
