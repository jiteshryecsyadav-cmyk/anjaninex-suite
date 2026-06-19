import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface BuyerListItem {
  id: string;
  contactId: string;
  buyerCode: string | null;
  displayName: string;
  phone: string | null;
  gst: string | null;
  city: string | null;
  buyerType: string | null;
  brandName: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetUnit: string;
  isActive: boolean;
}

export interface BuyerDetail extends BuyerListItem {
  legalName: string | null;
  email: string | null;
  pan: string | null;
  address: string | null;
  state: string | null;
  pincode: string | null;
  categoryIds: string[];
  orderFrequency: string | null;
  paymentTerms: string | null;
  qualityPref: string | null;
  targetCustomer: string | null;
  waPhone: string | null;
  notes: string | null;
  // Form gap-fill (migration 49)
  ownerName: string | null;
  altPhone: string | null;
  website: string | null;
  instagram: string | null;
  isSupplier: boolean;
  gpsLocation: string | null;
}

// Live duplicate-check result.
export interface BuyerDuplicateMatch {
  id: string;
  contactId: string;
  displayName: string;
  gst: string | null;
  phone: string | null;
  matchOn: string;
}

export interface CreateBuyer {
  displayName: string;
  legalName?: string;
  phone?: string;
  email?: string;
  gst?: string;
  pan?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  buyerType?: string;
  brandName?: string;
  categoryIds: string[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  budgetUnit?: string;
  orderFrequency?: string;
  paymentTerms?: string;
  qualityPref?: string;
  targetCustomer?: string;
  waPhone?: string;
  notes?: string;
  // Form gap-fill (migration 49)
  ownerName?: string;
  altPhone?: string;
  website?: string;
  instagram?: string;
  isSupplier?: boolean;
  gpsLocation?: string;
}

@Injectable({ providedIn: 'root' })
export class BuyersService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/buyers`;

  list(search?: string) {
    const params: any = {};
    if (search) params.search = search;
    return this.http.get<BuyerListItem[]>(this.base, { params });
  }
  get(id: string) { return this.http.get<BuyerDetail>(`${this.base}/${id}`); }
  create(data: CreateBuyer) { return this.http.post<BuyerDetail>(this.base, data); }
  update(id: string, data: CreateBuyer) { return this.http.put<BuyerDetail>(`${this.base}/${id}`, data); }
  delete(id: string) { return this.http.delete(`${this.base}/${id}`); }

  // Live duplicate-check on GST / mobile (debounced from the form).
  checkDuplicate(data: { gst?: string; phone?: string; excludeId?: string }) {
    return this.http.post<BuyerDuplicateMatch[]>(`${this.base}/check-duplicate`, data);
  }
}
