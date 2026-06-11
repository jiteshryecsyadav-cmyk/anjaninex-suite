import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FeatureService } from './feature.service';
import { SubscriptionService } from '../modules/subscription/subscription.service';

/**
 * Smart upgrade nudge banner — shown in shell when:
 *  - AI quota >= 80% used
 *  - Trial <= 7 days remaining
 *  - Wallet < ₹500
 * Banner can be dismissed for 24 hours (localStorage flag).
 */
@Component({
  selector: 'app-upgrade-nudge',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (visibleNudge(); as nudge) {
      <div class="nudge" [class.nudge-warn]="nudge.severity === 'warn'"
                         [class.nudge-urgent]="nudge.severity === 'urgent'">
        <div class="nudge-icon">{{ nudge.icon }}</div>
        <div class="flex-1">
          <div class="nudge-title">{{ nudge.title }}</div>
          <div class="nudge-body">{{ nudge.body }}</div>
        </div>
        <div class="flex gap-2">
          <a [routerLink]="nudge.ctaLink" class="nudge-cta">{{ nudge.cta }}</a>
          <button (click)="dismiss(nudge.key)" class="nudge-close" title="Dismiss for 24 hours">✕</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .nudge {
      display: flex; align-items: center; gap: 14px;
      padding: 10px 18px; margin: 6px 12px 0;
      border-radius: 10px; font-size: 13px;
      border-left: 4px solid;
    }
    .nudge-warn {
      background: linear-gradient(90deg, #fff8e1, #fff3e0);
      color: #92400e;
      border-left-color: #f59e0b;
    }
    .nudge-urgent {
      background: linear-gradient(90deg, #fde8e8, #fef2f2);
      color: #991b1b;
      border-left-color: #dc2626;
    }
    .nudge-icon { font-size: 22px; flex-shrink: 0; }
    .nudge-title { font-weight: 800; font-size: 13.5px; }
    .nudge-body { font-size: 12px; opacity: .9; margin-top: 2px; }
    .nudge-cta {
      padding: 6px 14px; background: #5c1a8b; color: #fff;
      border-radius: 6px; font-weight: 700; font-size: 12px;
      text-decoration: none; white-space: nowrap;
    }
    .nudge-cta:hover { background: #4a1080; }
    .nudge-close {
      width: 28px; height: 28px; border-radius: 6px;
      background: rgba(0,0,0,.06); border: none; cursor: pointer;
      font-weight: 800; color: inherit;
    }
    .nudge-close:hover { background: rgba(0,0,0,.15); }
  `]
})
export class UpgradeNudgeComponent {
  features = inject(FeatureService);
  subscription = inject(SubscriptionService);

  /** Per-key dismissal state — keyed by nudge.key (refreshes every render). */
  private dismissedKeys = signal<Set<string>>(this.loadDismissed());

  visibleNudge = computed<Nudge | null>(() => {
    const dismissed = this.dismissedKeys();
    const nudges = this.computeNudges();
    return nudges.find(n => !dismissed.has(n.key)) ?? null;
  });

  private computeNudges(): Nudge[] {
    const list: Nudge[] = [];
    const pct = this.features.aiQuotaPctUsed();
    const aiUsed = this.features.aiUsedThisMonth();
    const aiQuota = this.features.aiQuotaMonthly();

    // AI quota nudges
    if (aiQuota > 0 && pct >= 100) {
      list.push({
        key: 'ai-exhausted',
        severity: 'urgent',
        icon: '🚫',
        title: 'AI Quota Exhausted',
        body: `Aap ne ${aiUsed}/${aiQuota} AI scans use kar liye. Add-on lo ya plan upgrade karo.`,
        cta: 'Buy +AI Pack',
        ctaLink: '/pricing'
      });
    } else if (aiQuota > 0 && pct >= 80) {
      list.push({
        key: `ai-80-${Math.floor(pct / 5)}`,
        severity: 'warn',
        icon: '⚠️',
        title: `AI Quota ${pct}% used`,
        body: `${aiUsed}/${aiQuota} scans done. ${aiQuota - aiUsed} bachhe hain. Upgrade plan ya +AI Pack lo.`,
        cta: 'See Plans',
        ctaLink: '/pricing'
      });
    }

    // Trial expiry nudges (uses existing SubscriptionService data)
    const trialDays = this.daysToTrialEnd();
    if (trialDays !== null && trialDays >= 0 && trialDays <= 7) {
      list.push({
        key: `trial-${trialDays}d`,
        severity: trialDays <= 2 ? 'urgent' : 'warn',
        icon: '⏰',
        title: `Trial ends in ${trialDays} ${trialDays === 1 ? 'day' : 'days'}`,
        body: 'Aaj subscribe karein. Annual plan me 17% OFF — 2 months free!',
        cta: 'Subscribe Now',
        ctaLink: '/pricing'
      });
    }

    return list;
  }

  private daysToTrialEnd(): number | null {
    const s = this.subscription;
    const endsAt = (s as any).trialEndsAt?.() ?? null;
    if (!endsAt) return null;
    const days = Math.ceil((new Date(endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  }

  dismiss(key: string) {
    const set = new Set(this.dismissedKeys());
    set.add(key);
    this.dismissedKeys.set(set);
    // Persist with 24-hour expiry
    const data = { keys: [...set], expiry: Date.now() + 24 * 60 * 60 * 1000 };
    try { localStorage.setItem('nmk_nudge_dismiss', JSON.stringify(data)); } catch {}
  }

  private loadDismissed(): Set<string> {
    try {
      const raw = localStorage.getItem('nmk_nudge_dismiss');
      if (!raw) return new Set();
      const data = JSON.parse(raw);
      if (data.expiry && data.expiry > Date.now()) {
        return new Set(data.keys);
      }
    } catch {}
    return new Set();
  }
}

interface Nudge {
  key: string;
  severity: 'warn' | 'urgent';
  icon: string;
  title: string;
  body: string;
  cta: string;
  ctaLink: string;
}
