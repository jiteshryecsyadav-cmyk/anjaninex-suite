import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Party ka dhaancha — agency app wala hi. Party Chat isi ko padhti hai.
 * (Sirf wahi khaane rakhe hain jo asli me use hote hain.)
 */
export interface Party {
  id: string;
  contactId: string;
  partyCode: string | null;
  displayName: string;
  phone: string | null;
  email: string | null;
  gst: string | null;
  city: string | null;
  partyType: string;
  creditLimit: number;
  creditDays: number;
  commissionRate: number;
  outstandingBalance: number;
  ledgerId: string | null;
  isActive: boolean;
  waSupplier?: string | null;
  waBuyer?: string | null;
}

/**
 * Party Chat ke liye patla sa khol.
 *
 * Agency app ki `TradingService` 500 line ki hai — bill, order, payment,
 * commission sab. Party Chat usme se sirf EK cheez maangti hai: party ki list.
 * Poori service copy karte to manufacturer app me 500 line aisa code aa jata
 * jise koi bulata hi nahi, aur wo dono jagah alag-alag bigadta rehta.
 *
 * Isliye yahan sirf wahi ek method — aur wo bhi manufacturer ke apne
 * endpoint (`/api/mfg/parties`) par, jo wahi `trading.party_profiles` padhta
 * hai. Party dono app me ek hi hai.
 */
@Injectable({ providedIn: 'root' })
export class TradingService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;

  listParties(search?: string): Observable<Party[]> {
    return this.http.get<Party[]>(`${this.base}/parties`,
                                  { params: search ? { search } : {} });
  }
}
