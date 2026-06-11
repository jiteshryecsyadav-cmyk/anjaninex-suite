import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SubscriptionService } from './subscription.service';

@Component({
  selector: 'app-trial-banner',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (sub.showBanner()) {
      <div class="banner" [class.urgent]="severity() === 'urgent'" [class.critical]="severity() === 'critical'">
        <div class="left">
          <span class="ico">{{ icon() }}</span>
          <span class="msg">
            <strong>{{ titleText() }}</strong>
            <span class="sub">{{ subText() }}</span>
          </span>
        </div>
        <div class="right">
          <a routerLink="/wallet" class="cta">{{ ctaText() }} →</a>
          @if (severity() !== 'critical') {
            <button class="dismiss" (click)="dismiss()" title="Hide for this session">✕</button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    :host{display:block}
    .banner{display:flex;justify-content:space-between;align-items:center;padding:10px 18px;background:#FEF3C7;border-bottom:2px solid #D97706;color:#92400E;font-size:13px;font-weight:600}
    .banner.urgent{background:#FED7AA;border-bottom-color:#EA580C;color:#9A3412}
    .banner.critical{background:#FEE2E2;border-bottom-color:#DC2626;color:#991B1B;animation:pulseBg 2s ease-in-out infinite}
    @keyframes pulseBg{0%,100%{opacity:1}50%{opacity:0.85}}
    .left{display:flex;align-items:center;gap:10px}
    .ico{font-size:18px}
    .msg{display:flex;flex-direction:column;gap:1px}
    .msg strong{font-weight:800}
    .msg .sub{font-size:11px;opacity:0.85;font-weight:500}
    .right{display:flex;align-items:center;gap:10px}
    .cta{background:#DC2626;color:#fff;padding:7px 14px;border-radius:6px;text-decoration:none;font-weight:800;font-size:12px;transition:background 0.15s}
    .cta:hover{background:#B91C1C}
    .dismiss{background:transparent;border:0;color:inherit;font-size:16px;cursor:pointer;opacity:0.65;padding:0 4px}
    .dismiss:hover{opacity:1}
  `]
})
export class TrialBannerComponent {
  sub = inject(SubscriptionService);
  private dismissedKey = 'ax-trial-banner-dismissed';

  severity = computed(() => {
    const days = this.sub.daysLeft();
    if (this.sub.status()?.status === 'grace_period') return 'critical';
    if (days <= 1) return 'critical';
    if (days <= 3) return 'urgent';
    return 'info';
  });

  icon = computed(() => {
    const s = this.sub.status();
    if (s?.status === 'grace_period') return '🔴';
    if (this.severity() === 'critical') return '🚨';
    if (this.severity() === 'urgent') return '⚠️';
    return '⏰';
  });

  titleText = computed(() => {
    const s = this.sub.status();
    if (!s) return '';
    if (s.status === 'grace_period') return `Grace period — ${s.daysLeft} days left`;
    if (s.status === 'trial')        return `Free trial — ${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'} left`;
    if (s.status === 'active')       return `Subscription renews in ${s.daysLeft} days`;
    return '';
  });

  subText = computed(() => {
    const s = this.sub.status();
    if (!s) return '';
    if (s.status === 'grace_period') return 'Services will be suspended after grace ends. Renew now.';
    if (s.status === 'trial')        return s.daysLeft <= 1
                                         ? 'Trial ends tomorrow. Subscribe to keep your data.'
                                         : 'Subscribe to avoid service interruption.';
    return 'Recharge your wallet to auto-renew.';
  });

  ctaText = computed(() => {
    const s = this.sub.status();
    if (s?.status === 'trial') return 'Subscribe Now';
    return 'Renew Now';
  });

  dismiss(): void {
    sessionStorage.setItem(this.dismissedKey, '1');
    // simple hack: hide the banner by setting status to non-bannered locally
    const s = this.sub.status();
    if (s) {
      (this.sub as any)._status.set({ ...s, showBanner: false });
    }
  }
}
