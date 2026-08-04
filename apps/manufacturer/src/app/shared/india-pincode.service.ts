import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/**
 * India Post pincode lookup — har form me same kaam ke liye shared service.
 * byPin('395002')  → city/state nikalo
 * byCity('Surat')  → main pincode nikalo
 * (auth interceptor in external calls par token NAHI bhejta)
 */
@Injectable({ providedIn: 'root' })
export class IndiaPincodeService {
  private http = inject(HttpClient);

  byPin(pin: string) {
    return this.http.get<any[]>(`https://api.postalpincode.in/pincode/${pin}`);
  }

  byCity(city: string) {
    return this.http.get<any[]>(`https://api.postalpincode.in/postoffice/${encodeURIComponent(city)}`);
  }

  /** Response me se pehla PostOffice (state-match prefer). */
  firstPo(res: any[], preferState?: string): any | null {
    const list: any[] = res?.[0]?.PostOffice || [];
    if (!list.length) return null;
    if (preferState) {
      const m = list.find(x => (x.State || '').toLowerCase() === preferState.toLowerCase());
      if (m) return m;
    }
    return list[0];
  }
}
