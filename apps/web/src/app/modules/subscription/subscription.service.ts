import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SubscriptionStatus {
  status: 'trial' | 'active' | 'grace_period' | 'suspended' | 'cancelled' | 'low_wallet';
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  graceUntil?: string;
  daysLeft: number;
  health: string;          // emoji
  showBanner: boolean;
  isLocked: boolean;
  suspendedReason?: string;
  planName?: string | null;
  planCode?: string | null;
  monthlyPrice?: number | null;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/subscription`;

  private _status = signal<SubscriptionStatus | null>(null);
  private _loading = signal(false);

  readonly status = this._status.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly isLocked = computed(() => this._status()?.isLocked === true);
  readonly showBanner = computed(() => this._status()?.showBanner === true);
  readonly daysLeft = computed(() => this._status()?.daysLeft ?? 0);
  readonly health = computed(() => this._status()?.health ?? '🟢');
  readonly statusLabel = computed(() => {
    const s = this._status();
    if (!s) return '';
    if (s.status === 'trial')        return `Free Trial — ${s.daysLeft} days left`;
    if (s.status === 'active')       return `Active subscription — renews in ${s.daysLeft} days`;
    if (s.status === 'grace_period') return `⚠️ Grace period — ${s.daysLeft} days left to renew`;
    if (s.status === 'suspended')    return '🔒 Account suspended — renew to restore access';
    return s.status;
  });

  async refresh(): Promise<void> {
    this._loading.set(true);
    try {
      const status = await firstValueFrom(
        this.http.get<SubscriptionStatus>(`${this.base}/status`)
      );
      this._status.set(status);
    } catch (e) {
      // Don't break the app if endpoint fails — log only
      const err = e as HttpErrorResponse;
      if (err.status === 402) {
        // Suspended firm — backend returned Payment Required
        this._status.set({
          status: 'suspended',
          daysLeft: 0,
          health: '🔴',
          showBanner: false,
          isLocked: true,
          suspendedReason: 'Subscription expired'
        });
      } else {
        console.warn('[Subscription] refresh failed', e);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async renew(durationDays = 30): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.base}/renew`, { durationDays })
    );
    await this.refresh();
  }
}
