import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CredilStatus {
  enabled: boolean;
  fullReportPrice: number;
  perComponentPrice: number;
  minFirms: number;
  minDataPoints: number;
  components: string[];
}

export interface CredilRequestResult {
  requestId: string;
  maskedMobile: string;
  amount: number;
  components: string[];
  otpSent: boolean;
  partyName?: string;
  otpPreview?: string | null;   // only for platform admin (testing)
}

export interface CredilRequestRow {
  id: string;
  targetGst: string;
  components: string[];
  amount: number;
  status: string;               // pending|otp_ok|paid|delivered|rejected
  paid: boolean;
  otpVerified: boolean;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;
  hasReport: boolean;
}

export interface CredilReport {
  gst: string;
  entityType: string;
  totalScore: number;
  band: string;
  components: { key: string; label: string; score: number }[];
  redFlags: any[];
  narrative?: string;
  dataPoints: number;
  firmsCount: number;
  computedAt?: string;
  generatedAt?: string;
}

export interface RzpOrder {
  orderId: string; keyId: string; amount: number; currency: string;
  name: string; email?: string; contact?: string;
}

@Injectable({ providedIn: 'root' })
export class CredilService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/credil`;
  private admin = `${environment.apiUrl}/api/admin/credil`;

  // ---- firm ----
  status() { return firstValueFrom(this.http.get<CredilStatus>(`${this.base}/status`)); }

  createRequest(targetGst: string, components: string[]) {
    return firstValueFrom(this.http.post<CredilRequestResult>(`${this.base}/request`, { targetGst, components }));
  }
  verifyOtp(id: string, otp: string) {
    return firstValueFrom(this.http.post<{ ok: boolean }>(`${this.base}/request/${id}/verify-otp`, { otp }));
  }
  payOrder(id: string) {
    return firstValueFrom(this.http.post<RzpOrder>(`${this.base}/request/${id}/pay/order`, {}));
  }
  payVerify(id: string, orderId: string, paymentId: string, signature: string) {
    return firstValueFrom(this.http.post<{ success: boolean }>(
      `${this.base}/request/${id}/pay/verify`, { orderId, paymentId, signature }));
  }
  myRequests() { return firstValueFrom(this.http.get<CredilRequestRow[]>(`${this.base}/requests`)); }
  getReport(id: string) { return firstValueFrom(this.http.get<CredilReport>(`${this.base}/report/${id}`)); }

  // ---- admin ----
  adminRequests(status?: string) {
    const q = status ? `?status=${status}` : '';
    return firstValueFrom(this.http.get<any[]>(`${this.admin}/requests${q}`));
  }
  approve(id: string) { return firstValueFrom(this.http.post<any>(`${this.admin}/requests/${id}/approve`, {})); }
  reject(id: string, note: string) { return firstValueFrom(this.http.post<any>(`${this.admin}/requests/${id}/reject`, { note })); }
  getConfig() { return firstValueFrom(this.http.get<any>(`${this.admin}/config`)); }
  saveConfig(c: any) { return firstValueFrom(this.http.put<any>(`${this.admin}/config`, c)); }
  adminFirms() { return firstValueFrom(this.http.get<any[]>(`${this.admin}/firms`)); }
  toggleFirm(firmId: string, enabled: boolean) {
    return firstValueFrom(this.http.put<any>(`${this.admin}/firms/${firmId}`, { enabled }));
  }
  refreshScores() { return firstValueFrom(this.http.post<{ scored: number }>(`${this.admin}/refresh`, {})); }

  // ---- Razorpay checkout (loads SDK, opens, resolves on success) ----
  openCheckout(order: RzpOrder): Promise<{ orderId: string; paymentId: string; signature: string }> {
    return new Promise((resolve, reject) => {
      const launch = () => {
        const rzp = new (window as any).Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: order.name,
          description: 'CREDIL report fee',
          order_id: order.orderId,
          prefill: { email: order.email || '', contact: order.contact || '' },
          theme: { color: '#0d9488' },
          handler: (resp: any) => resolve({
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature
          }),
          modal: { ondismiss: () => reject(new Error('Payment cancel ho gaya')) }
        });
        rzp.open();
      };
      if ((window as any).Razorpay) return launch();
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = launch;
      s.onerror = () => reject(new Error('Razorpay SDK load nahi hua'));
      document.body.appendChild(s);
    });
  }
}
