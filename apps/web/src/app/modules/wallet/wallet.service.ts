import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface WalletLedgerEntry {
  id: string;
  firmId: string;
  txnType: string;        // 'recharge' | 'debit_ai' | 'debit_sms' | 'subscription' | 'refund' ...
  amount: number;         // positive for credit, negative for debit
  balanceAfter: number;
  referenceId: string;
  description: string;
  createdAt: string;
}

export type PayMethod = 'upi' | 'razorpay' | 'neft' | 'cheque';

export interface RechargeRequest {
  amount: number;
  source?: string;        // 'upi' | 'razorpay' | 'manual'
  reference?: string;     // UPI ref / razorpay order id / cheque no
  gstin?: string;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/wallet`;

  // Reactive state — readable by any component via wallet.balance()
  private _balance = signal<number>(0);
  private _history = signal<WalletLedgerEntry[]>([]);
  private _loading = signal<boolean>(false);
  private _lastFetched = signal<number>(0);

  readonly balance = this._balance.asReadonly();
  readonly history = this._history.asReadonly();
  readonly loading = this._loading.asReadonly();

  /** Estimated days of runway at current usage (₹37.75/day demo default) */
  readonly runwayDays = computed(() => {
    const avgDaily = this.computeAvgDailySpend();
    return avgDaily > 0 ? Math.floor(this._balance() / avgDaily) : 0;
  });

  /** Is balance critically low? (< 500 OR < 5 days runway) */
  readonly isLow = computed(() =>
    this._balance() < 500 || this.runwayDays() < 5);

  /** Quick stats from history */
  readonly stats = computed(() => {
    const h = this._history();
    const now = Date.now();
    const monthAgo = now - 30 * 86400 * 1000;
    let recharged = 0, spent = 0, count = 0;
    for (const e of h) {
      const t = new Date(e.createdAt).getTime();
      if (t < monthAgo) continue;
      if (e.amount > 0) recharged += e.amount;
      else { spent += Math.abs(e.amount); count++; }
    }
    return {
      rechargedMtd: recharged,
      spentMtd: spent,
      avgDailySpend: count > 0 ? Math.round(spent / 30) : 38,
      txnCount: h.length
    };
  });

  /** Load (with cache — refetches if > 60s old). */
  async refresh(force = false): Promise<void> {
    if (!force && Date.now() - this._lastFetched() < 60_000) return;
    this._loading.set(true);
    try {
      const [bal, hist] = await Promise.all([
        firstValueFrom(this.http.get<{ balance: number }>(`${this.base}/balance`)),
        firstValueFrom(this.http.get<WalletLedgerEntry[]>(`${this.base}/history?size=100`))
      ]);
      this._balance.set(bal?.balance ?? 0);
      this._history.set(hist ?? []);
      this._lastFetched.set(Date.now());
    } catch (e) {
      console.warn('[Wallet] refresh failed', e);
    } finally {
      this._loading.set(false);
    }
  }

  /** Submit a recharge request. Returns new balance. */
  async recharge(req: RechargeRequest): Promise<number> {
    if (req.amount < 100) throw new Error('Minimum recharge is ₹100');
    const res = await firstValueFrom(
      this.http.post<{ success: boolean; newBalance: number }>(
        `${this.base}/recharge`, req)
    );
    this._balance.set(res.newBalance);
    await this.refresh(true);
    return res.newBalance;
  }

  /** Update wallet locally (used by polling / SignalR notifications). */
  setBalance(bal: number): void {
    this._balance.set(bal);
  }

  /** Compute GST + gateway fee + cashback for a recharge amount. */
  static computeBreakdown(amount: number, method: PayMethod) {
    const gst = 0; // GST 20 lakh turnover tak nahi lagti (aur uske baad price-inclusive). Payable = base.
    const fee = 0; // Razorpay-only; recharge = exact amount (no extra gateway fee shown).
    const cashback = 0; // No promo cashback (avoid showing credit that is not actually added).
    return { amount, gst, fee, cashback, total: amount + gst + fee - cashback };
  }

  private computeAvgDailySpend(): number {
    return this.stats().avgDailySpend || 38;
  }
}
