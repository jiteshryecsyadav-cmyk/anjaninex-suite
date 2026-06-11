import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="lx-bg">
      <!-- soft colour blobs -->
      <span class="blob b1"></span>
      <span class="blob b2"></span>
      <span class="blob b3"></span>

      <!-- scattered watermark text (cities + modules) -->
      <div class="lx-marks">
        @for (w of watermarks; track $index) {
          <span [style.top.%]="w.t" [style.left.%]="w.l"
                [style.font-size.px]="w.s"
                [style.transform]="'rotate(' + w.r + 'deg)'"
                [style.animation-duration.s]="watermarks.length * 2"
                [style.animation-delay.s]="$index * 2">{{ w.x }}</span>
        }
      </div>

      <div class="lx-wrap">
        <!-- Brand header -->
        <div class="lx-brand">
          <img src="anjaninex-logo.jpeg" alt="Anjaninex" width="96" height="96" class="lx-logo">
          <h1 class="lx-word">Anjani<span>nex</span></h1>
          <p class="lx-sub">Business Suite</p>
          <div class="lx-pills">
            <span class="pill p-blue">📦 Trading</span>
            <span class="pill p-green">📊 Accounting</span>
            <span class="pill p-purple">🤝 Suppliers</span>
            <span class="pill p-amber">👥 HR</span>
          </div>
        </div>

        <!-- Login card -->
        <form [formGroup]="form" (ngSubmit)="login()" class="lx-card">
          <div class="lx-card-bar"></div>

          @if (error()) {
            <div class="lx-error">⚠️ {{ error() }}</div>
          }

          <label class="lx-label">Email / Phone / Username <span>*</span></label>
          <input formControlName="identifier" type="text" class="lx-input"
                 placeholder="Enter username" autofocus autocomplete="username">

          <label class="lx-label mt">Password <span>*</span></label>
          <div class="lx-pass">
            <input formControlName="password" [type]="showPassword() ? 'text' : 'password'"
                   class="lx-input" placeholder="Enter password" autocomplete="current-password">
            <button type="button" (click)="showPassword.set(!showPassword())" class="lx-eye">
              {{ showPassword() ? '🙈' : '👁️' }}
            </button>
          </div>

          <div class="lx-row">
            <label class="lx-remember">
              <input type="checkbox" formControlName="remember"> Remember me
            </label>
            <a href="#" class="lx-forgot">Forgot password?</a>
          </div>

          <button type="submit" class="lx-signin" [disabled]="loading()">
            {{ loading() ? 'Signing in…' : '🔓 Sign In' }}
          </button>

          <div class="lx-or"><span>OR</span></div>

          <button type="button" class="lx-otp">📱 Sign in with OTP</button>
        </form>

        <!-- Powered by -->
        <a [href]="anjaninexUrl" target="_blank" rel="noopener" class="lx-power">
          <img src="anjaninex-logo.jpeg" alt="Anjaninex" width="40" height="40" class="object-contain">
          <span>Powered by <strong>Anjaninex</strong></span>
          <small>Building world-class B2B software</small>
        </a>

        <!-- Support -->
        <a href="mailto:support@anjaninex.com" class="lx-support">
          ✉️ Need help? <strong>support&#64;anjaninex.com</strong>
        </a>
      </div>
    </div>
  `,
  styles: [`
    .lx-bg{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden;
      background:linear-gradient(135deg,#0f1e40 0%,#1b2e5c 42%,#3a1a5c 78%,#7a1530 100%)}
    .blob{position:absolute;border-radius:50%;filter:blur(70px);opacity:.45;pointer-events:none}
    .b1{width:340px;height:340px;background:#d91e28;top:-80px;right:-60px}
    .b2{width:300px;height:300px;background:#9333ea;bottom:-90px;left:-70px}
    .b3{width:260px;height:260px;background:#0ea5e9;top:40%;left:55%}
    .lx-marks{position:absolute;inset:0;z-index:1;overflow:hidden}
    .lx-marks span{position:absolute;color:rgba(255,255,255,.045);font-weight:900;letter-spacing:.5px;
      white-space:nowrap;pointer-events:none;user-select:none;text-transform:uppercase;font-family:'JetBrains Mono',monospace;
      animation-name:wmBlink;animation-timing-function:linear;animation-iteration-count:infinite}
    @keyframes wmBlink{
      0%   {opacity:.045; color:rgba(255,255,255,.045); text-shadow:none}
      1%   {opacity:1;    color:#ffd166; text-shadow:0 0 22px rgba(255,180,40,.8)}
      2.5% {opacity:1;    color:#ffd166; text-shadow:0 0 22px rgba(255,180,40,.8)}
      4%   {opacity:.045; color:rgba(255,255,255,.045); text-shadow:none}
      100% {opacity:.045}
    }
    .lx-wrap{position:relative;z-index:2;width:100%;max-width:430px;display:flex;flex-direction:column;align-items:center}

    .lx-brand{text-align:center;margin-bottom:18px}
    .lx-logo{display:block;margin:0 auto;border-radius:18px;background:#fff;padding:8px;object-fit:contain;box-shadow:0 10px 30px rgba(0,0,0,.3)}
    .lx-word{font-size:34px;font-weight:900;color:#fff;margin:12px 0 0;letter-spacing:-1px}
    .lx-word span{background:linear-gradient(90deg,#ff5b64,#ffb020);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .lx-sub{color:rgba(255,255,255,.8);font-weight:600;font-size:13px;margin-top:2px}
    .lx-pills{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-top:12px}
    .pill{font-size:11px;font-weight:700;padding:5px 11px;border-radius:999px;color:#fff;backdrop-filter:blur(4px)}
    .p-blue{background:rgba(14,165,233,.28);border:1px solid rgba(14,165,233,.5)}
    .p-green{background:rgba(22,163,74,.28);border:1px solid rgba(22,163,74,.5)}
    .p-purple{background:rgba(147,51,234,.28);border:1px solid rgba(147,51,234,.5)}
    .p-amber{background:rgba(217,119,6,.30);border:1px solid rgba(217,119,6,.5)}

    .lx-card{width:100%;background:rgba(255,255,255,.97);border-radius:18px;padding:26px 24px 24px;
      box-shadow:0 24px 60px rgba(0,0,0,.35);position:relative;overflow:hidden;display:flex;flex-direction:column}
    .lx-card-bar{position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#1b2e5c,#9333ea,#d91e28,#ffb020)}
    .lx-error{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:9px 12px;border-radius:9px;font-size:13px;font-weight:600;margin-bottom:6px}

    .lx-label{font-size:11px;font-weight:800;color:#1b2e5c;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}
    .lx-label.mt{margin-top:14px}
    .lx-label span{color:#d91e28}
    .lx-input{width:100%;padding:12px 14px;border:1.5px solid #dbe2ee;border-radius:11px;font-size:14px;font-family:inherit;
      background:#f8fafc;transition:.15s;box-sizing:border-box}
    .lx-input:focus{outline:none;border-color:#1b2e5c;background:#fff;box-shadow:0 0 0 4px rgba(27,46,92,.1)}
    .lx-pass{position:relative}
    .lx-eye{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:17px}

    .lx-row{display:flex;justify-content:space-between;align-items:center;margin-top:14px;font-size:13px}
    .lx-remember{display:flex;align-items:center;gap:7px;color:#1b2e5c;font-weight:600;cursor:pointer}
    .lx-remember input{accent-color:#d91e28;width:15px;height:15px}
    .lx-forgot{color:#1b2e5c;font-weight:700;text-decoration:none}
    .lx-forgot:hover{color:#d91e28;text-decoration:underline}

    .lx-signin{margin-top:18px;padding:13px;border:0;border-radius:12px;color:#fff;font-size:15px;font-weight:800;cursor:pointer;
      font-family:inherit;background:linear-gradient(90deg,#d91e28,#b91c1c);box-shadow:0 8px 20px rgba(217,30,40,.35);transition:.15s}
    .lx-signin:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 12px 26px rgba(217,30,40,.45)}
    .lx-signin:disabled{opacity:.6;cursor:not-allowed}

    .lx-or{display:flex;align-items:center;gap:10px;margin:16px 0 12px;color:#9ca3af;font-size:11px;font-weight:700}
    .lx-or::before,.lx-or::after{content:'';flex:1;height:1px;background:#e5e7eb}

    .lx-otp{width:100%;padding:12px;border:1.5px solid #1b2e5c;background:#fff;color:#1b2e5c;border-radius:12px;
      font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s}
    .lx-otp:hover{background:#1b2e5c;color:#fff}

    .lx-power{margin-top:22px;display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;
      color:rgba(255,255,255,.85)}
    .lx-power img{border-radius:10px;background:#fff;padding:4px}
    .lx-power span{font-size:12px;margin-top:4px}
    .lx-power strong{color:#ffb020}
    .lx-power small{font-size:10px;color:rgba(255,255,255,.6)}

    .lx-support{margin-top:14px;font-size:12px;color:rgba(255,255,255,.8);text-decoration:none;
      background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);padding:7px 16px;border-radius:999px;transition:.15s}
    .lx-support:hover{background:rgba(255,255,255,.16);color:#fff}
    .lx-support strong{color:#ffb020}
  `]
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  showPassword = signal(false);
  loading = signal(false);
  error = signal('');

  version = (window as any).__APP_VERSION__ ?? '1.0.0';
  anjaninexUrl = environment.anjaninexUrl;

  // Scattered background watermarks — Indian textile/trade cities + module names
  watermarks = [
    { x: 'Anjaninex',   t: 5,  l: 4,  r: -8,  s: 30 },
    { x: 'Surat',       t: 9,  l: 48, r: 10,  s: 24 },
    { x: 'Mumbai',      t: 13, l: 74, r: 6,   s: 24 },
    { x: 'Tiruppur',    t: 17, l: 18, r: -6,  s: 20 },
    { x: 'Trading',     t: 21, l: 56, r: -5,  s: 22 },
    { x: 'Bhilwara',    t: 25, l: 86, r: 9,   s: 18 },
    { x: 'Erode',       t: 28, l: 6,  r: 7,   s: 18 },
    { x: 'HR',          t: 31, l: 40, r: -10, s: 26 },
    { x: 'Panipat',     t: 35, l: 70, r: 5,   s: 20 },
    { x: 'Coimbatore',  t: 38, l: 20, r: -7,  s: 18 },
    { x: 'Bazaar Link', t: 42, l: 54, r: 8,   s: 22 },
    { x: 'Ludhiana',    t: 45, l: 86, r: -6,  s: 18 },
    { x: 'Ahmedabad',   t: 49, l: 8,  r: 7,   s: 20 },
    { x: 'Accounting',  t: 52, l: 64, r: -5,  s: 20 },
    { x: 'Ichalkaranji',t: 55, l: 34, r: 9,   s: 16 },
    { x: 'Bhiwandi',    t: 58, l: 88, r: -8,  s: 18 },
    { x: 'Kolkata',     t: 61, l: 6,  r: 6,   s: 22 },
    { x: 'Suppliers',   t: 64, l: 48, r: -7,  s: 20 },
    { x: 'Salem',       t: 67, l: 76, r: 8,   s: 18 },
    { x: 'Karur',       t: 70, l: 22, r: -6,  s: 16 },
    { x: 'Anjaninex',   t: 73, l: 60, r: 7,   s: 24 },
    { x: 'Solapur',     t: 76, l: 88, r: -9,  s: 18 },
    { x: 'Amritsar',    t: 79, l: 10, r: 8,   s: 18 },
    { x: 'Wallet',      t: 82, l: 44, r: -6,  s: 20 },
    { x: 'Bhagalpur',   t: 85, l: 72, r: 7,   s: 16 },
    { x: 'Varanasi',    t: 88, l: 24, r: -7,  s: 18 },
    { x: 'Malegaon',    t: 91, l: 58, r: 9,   s: 16 },
    { x: 'Kanpur',      t: 94, l: 86, r: -6,  s: 18 },
    { x: 'Jaipur',      t: 7,  l: 26, r: 12,  s: 18 },
    { x: 'Delhi',       t: 11, l: 90, r: -8,  s: 20 },
    { x: 'Indore',      t: 33, l: 90, r: 6,   s: 16 },
    { x: 'Hyderabad',   t: 47, l: 38, r: -8,  s: 18 },
    { x: 'Chennai',     t: 62, l: 90, r: 7,   s: 16 },
    { x: 'Madurai',     t: 86, l: 4,  r: -7,  s: 16 },
    { x: 'Mau',         t: 19, l: 92, r: 8,   s: 16 },
    { x: 'Trading',     t: 96, l: 40, r: -5,  s: 18 }
  ];

  form = this.fb.nonNullable.group({
    identifier: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [true]
  });

  async login(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Username aur password dono bharo (password kam se kam 6 characters).');
      return;
    }
    this.error.set('');
    this.loading.set(true);

    try {
      const { identifier, password } = this.form.getRawValue();
      await this.auth.login(identifier, password);
      // Super admin → HAMESHA Anjaninex panel (returnUrl '/' ho to bhi override karo)
      const isSuper = this.auth.hasRole('super_admin');
      let target = this.route.snapshot.queryParamMap.get('returnUrl') ?? (isSuper ? '/admin/dashboard' : '/');
      if (isSuper && !target.startsWith('/admin')) target = '/admin/dashboard';
      this.router.navigateByUrl(target);
    } catch (e: any) {
      this.error.set(e?.error?.error ?? 'Login failed. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
