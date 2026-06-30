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
    <div class="lx-shell">
      <!-- LEFT — brand panel (firm theme colour) -->
      <aside class="lx-brandpanel">
        <div class="lx-bp-top">
          <img src="anjaninex-logo.jpeg" alt="Anjaninex" class="lx-bp-logo">
          <div class="lx-bp-name">Vyapaar Setu</div>
          <div class="lx-bp-suite">AN ANJANINEX PRODUCT</div>
        </div>
        <div class="lx-bp-mid">
          <h2 class="lx-bp-head">Run your entire B2B business in one place.</h2>
          <ul class="lx-bp-feats">
            <li>Trading — orders, bills &amp; GST invoicing</li>
            <li>Accounting — ledgers, P&amp;L &amp; balance sheet</li>
            <li>Suppliers — catalog, matching &amp; directory</li>
            <li>HR &amp; Wallet — team, payouts &amp; billing</li>
          </ul>
        </div>
        <a [href]="anjaninexUrl" target="_blank" rel="noopener" class="lx-bp-bottom">
          <strong>Vyapaar Setu</strong> — an Anjaninex product · Building world-class B2B software
        </a>
      </aside>

      <!-- RIGHT — sign-in form -->
      <main class="lx-formpanel">
        <form [formGroup]="form" (ngSubmit)="login()" class="lx-form">
          <h1 class="lx-f-title">Sign in</h1>
          <p class="lx-f-sub">Welcome back — please enter your details.</p>

          @if (error()) {
            <div class="lx-error">{{ error() }}</div>
          }

          <label class="lx-label">Email / Phone / Username</label>
          <input formControlName="identifier" type="text" class="lx-input"
                 placeholder="Enter your username" autofocus autocomplete="username">

          <label class="lx-label mt">Password</label>
          <div class="lx-pass">
            <input formControlName="password" [type]="showPassword() ? 'text' : 'password'"
                   class="lx-input" placeholder="Enter your password" autocomplete="current-password">
            <button type="button" (click)="showPassword.set(!showPassword())" class="lx-eye no-shine">
              {{ showPassword() ? '🙈' : '👁' }}
            </button>
          </div>

          <div class="lx-row">
            <label class="lx-remember">
              <input type="checkbox" formControlName="remember"> Remember me
            </label>
            <a href="#" class="lx-forgot">Forgot password?</a>
          </div>

          <button type="submit" class="lx-signin" [disabled]="loading()">
            {{ loading() ? 'Signing in…' : 'Sign In' }}
          </button>

          <div class="lx-or"><span>OR</span></div>
          <button type="button" class="lx-otp">Sign in with OTP</button>

          <a href="mailto:support@anjaninex.com" class="lx-help">Need help? support&#64;anjaninex.com</a>
        </form>
      </main>
    </div>
  `,
  styles: [`
    /* ===== Corporate split-screen sign-in ===== */
    :host{display:block}
    .lx-shell{min-height:100vh;display:flex;font-family:inherit}

    /* LEFT — brand panel (firm theme colour) */
    .lx-brandpanel{flex:0 0 42%;max-width:520px;background:var(--anjaninex-navy,#1b2e5c);color:#fff;
      display:flex;flex-direction:column;justify-content:space-between;padding:48px 44px;position:relative;overflow:hidden}
    .lx-brandpanel::before{content:'';position:absolute;inset:0;
      background:radial-gradient(circle at 82% 10%, rgba(255,255,255,.10), transparent 55%);pointer-events:none}
    .lx-bp-top,.lx-bp-mid,.lx-bp-bottom{position:relative;z-index:1}
    .lx-bp-logo{width:62px;height:62px;border-radius:14px;background:#fff;padding:7px;object-fit:contain;box-shadow:0 8px 24px rgba(0,0,0,.25)}
    .lx-bp-name{font-size:28px;font-weight:900;letter-spacing:-.5px;margin-top:16px}
    .lx-bp-suite{font-size:12px;font-weight:700;color:rgba(255,255,255,.7);letter-spacing:2px;margin-top:2px}
    .lx-bp-head{font-size:26px;font-weight:800;line-height:1.32;margin:0 0 24px;max-width:340px}
    .lx-bp-feats{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px}
    .lx-bp-feats li{font-size:14px;color:rgba(255,255,255,.9);padding-left:26px;position:relative;line-height:1.4}
    .lx-bp-feats li::before{content:'✓';position:absolute;left:0;top:0;font-weight:900;color:#fff;
      background:rgba(255,255,255,.18);width:18px;height:18px;border-radius:50%;font-size:11px;display:flex;align-items:center;justify-content:center}
    .lx-bp-bottom{font-size:11.5px;color:rgba(255,255,255,.62);text-decoration:none}
    .lx-bp-bottom strong{color:#fff}

    /* RIGHT — form panel */
    .lx-formpanel{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 24px;background:#f4f6fb}
    .lx-form{width:100%;max-width:380px;background:#fff;border:1px solid #e6eaf2;border-radius:16px;padding:36px 32px;
      box-shadow:0 18px 50px rgba(20,30,60,.10);display:flex;flex-direction:column}
    .lx-f-title{font-size:24px;font-weight:800;color:#0f1729;margin:0}
    .lx-f-sub{font-size:13px;color:#6b7280;margin:5px 0 22px}
    .lx-error{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px 12px;border-radius:9px;font-size:13px;font-weight:600;margin-bottom:14px}

    .lx-label{font-size:12px;font-weight:700;color:#374151;margin-bottom:7px;display:block}
    .lx-label.mt{margin-top:16px}
    .lx-input{width:100%;padding:12px 14px;border:1.5px solid #d7dceb;border-radius:10px;font-size:14px;font-family:inherit;
      background:#fff;transition:.15s;box-sizing:border-box}
    .lx-input:focus{outline:none;border-color:var(--anjaninex-navy,#1b2e5c);box-shadow:0 0 0 3px rgba(0,0,0,.06)}
    .lx-pass{position:relative}
    .lx-eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:16px;opacity:.65}

    .lx-row{display:flex;justify-content:space-between;align-items:center;margin-top:16px;font-size:13px}
    .lx-remember{display:flex;align-items:center;gap:7px;color:#374151;font-weight:500;cursor:pointer}
    .lx-remember input{accent-color:var(--anjaninex-navy,#1b2e5c);width:15px;height:15px}
    .lx-forgot{color:var(--anjaninex-navy,#1b2e5c);font-weight:600;text-decoration:none}
    .lx-forgot:hover{text-decoration:underline}

    .lx-signin{margin-top:22px;padding:13px;border:0;border-radius:10px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;
      font-family:inherit;background:var(--anjaninex-navy,#1b2e5c);box-shadow:0 8px 20px rgba(0,0,0,.16);transition:.15s}
    .lx-signin:hover:not(:disabled){filter:brightness(1.08)}
    .lx-signin:disabled{opacity:.6;cursor:not-allowed}

    .lx-or{display:flex;align-items:center;gap:10px;margin:18px 0 14px;color:#9ca3af;font-size:11px;font-weight:600}
    .lx-or::before,.lx-or::after{content:'';flex:1;height:1px;background:#e5e7eb}

    .lx-otp{width:100%;padding:12px;border:1.5px solid #d7dceb;background:#fff;color:#374151;border-radius:10px;
      font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s}
    .lx-otp:hover{border-color:var(--anjaninex-navy,#1b2e5c);color:var(--anjaninex-navy,#1b2e5c)}

    .lx-help{margin-top:20px;text-align:center;font-size:12px;color:#9ca3af;text-decoration:none}
    .lx-help:hover{color:#6b7280}

    @media (max-width:860px){
      .lx-shell{flex-direction:column}
      .lx-brandpanel{flex:none;max-width:none;padding:24px 22px;flex-direction:row;align-items:center;gap:14px;justify-content:flex-start}
      .lx-bp-mid,.lx-bp-bottom{display:none}
      .lx-bp-logo{width:46px;height:46px}
      .lx-bp-name{font-size:21px;margin-top:0}
      .lx-bp-suite{margin-top:0}
      .lx-formpanel{padding:22px 14px}
      .lx-form{padding:26px 22px}
    }
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
      // Agent login → apna reseller dashboard (firm shell se alag)
      if (this.auth.user()?.agentId) {
        this.router.navigateByUrl('/agent/dashboard');
        return;
      }
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
