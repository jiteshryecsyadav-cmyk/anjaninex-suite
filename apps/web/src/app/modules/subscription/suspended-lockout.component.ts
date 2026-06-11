import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SubscriptionService } from './subscription.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-suspended-lockout',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="lockout">
      <div class="lockout-card">
        <!-- Anjaninex logo on top -->
        <img src="anjaninex-logo.jpeg" alt="Anjaninex" class="logo">

        <div class="lock-ico">🔒</div>
        <h1>Account Suspended</h1>
        <p class="reason">
          {{ reasonText() }}
        </p>

        <div class="info-box">
          <div class="info-row">
            <span class="lbl">Firm</span>
            <strong>{{ auth.user()?.fullName || 'Your firm' }}</strong>
          </div>
          <div class="info-row">
            <span class="lbl">Status</span>
            <strong style="color:#DC2626">{{ sub.status()?.status?.toUpperCase() }}</strong>
          </div>
          @if (sub.status()?.suspendedReason) {
            <div class="info-row">
              <span class="lbl">Reason</span>
              <strong>{{ sub.status()!.suspendedReason }}</strong>
            </div>
          }
        </div>

        <p class="what">
          <strong>What you can do:</strong>
        </p>
        <ul class="actions">
          <li>✅ Renew subscription → instant access restoration</li>
          <li>✅ Recharge wallet → AI scans, SMS, WhatsApp resume</li>
          <li>✅ Your data is safe — nothing has been deleted</li>
          <li>❌ Cannot create new bills, payments, or invoices</li>
          <li>❌ Cannot access HR, Reports, or Suppliers modules</li>
        </ul>

        <div class="cta-row">
          <a routerLink="/wallet" class="cta primary">💳 Renew Subscription</a>
          <button (click)="contactSupport()" class="cta secondary">📞 Contact Anjaninex</button>
        </div>

        <div class="footer">
          <small>
            Need help? Email
            <a href="mailto:support@anjaninex.com">support&#64;anjaninex.com</a>
            or call
            <a href="tel:+919876543210">+91-9876543210</a>
          </small>
          <br>
          <button (click)="signOut()" class="logout-link">Sign out</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host{display:block;min-height:100vh}
    .lockout{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:linear-gradient(180deg,#FAF7F0 0%,#F5EFE3 100%)}
    .lockout-card{background:#fff;border-radius:16px;border:1px solid #D6DDEA;box-shadow:0 8px 40px rgba(27,46,92,0.15);padding:40px 36px;max-width:560px;width:100%;text-align:center;border-top:6px solid #DC2626}
    .logo{width:64px;height:64px;object-fit:contain;margin-bottom:14px}
    .lock-ico{font-size:56px;margin-bottom:10px;animation:shake 0.5s ease-in-out}
    @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
    h1{font-size:26px;font-weight:800;color:#1B2E5C;margin-bottom:10px}
    .reason{color:#4A5878;font-size:14px;line-height:1.5;margin-bottom:24px}
    .info-box{background:#FAF7F0;border:1px solid #D6DDEA;border-radius:10px;padding:14px 16px;margin-bottom:20px;text-align:left}
    .info-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px dashed #D6DDEA}
    .info-row:last-child{border-bottom:none}
    .lbl{color:#4A5878;font-weight:600}
    .what{text-align:left;font-size:13px;font-weight:700;color:#1B2E5C;margin-bottom:8px}
    .actions{list-style:none;padding:0;text-align:left;font-size:12.5px;line-height:1.9;color:#4A5878;margin-bottom:24px}
    .actions li{padding-left:4px}
    .cta-row{display:flex;gap:10px;justify-content:center;margin-bottom:20px;flex-wrap:wrap}
    .cta{padding:12px 22px;border-radius:8px;font-weight:800;font-size:13px;text-decoration:none;cursor:pointer;border:0;font-family:inherit;transition:background 0.15s,transform 0.15s}
    .cta.primary{background:#DC2626;color:#fff}
    .cta.primary:hover{background:#B91C1C;transform:translateY(-1px)}
    .cta.secondary{background:#fff;color:#1B2E5C;border:1.5px solid #1B2E5C}
    .cta.secondary:hover{background:#E5E9F2}
    .footer{margin-top:14px;padding-top:14px;border-top:1px solid #D6DDEA;font-size:11px;color:#4A5878}
    .footer a{color:#1B2E5C;font-weight:700;text-decoration:none}
    .footer a:hover{text-decoration:underline}
    .logout-link{background:transparent;border:0;color:#DC2626;font-size:11px;font-weight:700;cursor:pointer;margin-top:8px;text-decoration:underline;font-family:inherit}
  `]
})
export class SuspendedLockoutComponent {
  sub = inject(SubscriptionService);
  auth = inject(AuthService);

  reasonText(): string {
    const s = this.sub.status();
    if (!s) return 'Your account access has been temporarily suspended.';
    if (s.suspendedReason?.includes('trial_expired')) {
      return 'Your 15-day free trial has ended. Subscribe to a plan to restore full access to your data.';
    }
    if (s.suspendedReason?.includes('subscription_expired')) {
      return 'Your subscription has expired and the 3-day grace period is over. Please renew to restore access.';
    }
    if (s.suspendedReason?.includes('manual_admin')) {
      return 'Your account has been suspended by the Anjaninex admin team. Please contact support for details.';
    }
    return 'Your account access has been suspended. Please renew your subscription or contact Anjaninex support.';
  }

  contactSupport(): void {
    window.location.href = 'mailto:support@anjaninex.com?subject=Account%20Suspended%20-%20Renewal%20Help';
  }

  signOut(): void {
    this.auth.logout();
  }
}
