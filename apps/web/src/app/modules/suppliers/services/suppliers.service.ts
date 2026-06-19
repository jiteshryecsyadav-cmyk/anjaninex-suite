import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface SupplierCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number | null;
  isSystem: boolean;
  supplierCount: number;
}

export interface SupplierPhoto {
  id: string;
  storageUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  rate: number | null;
  rateUnit: string | null;
  sortOrder: number;
}

export interface SupplierRate {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  rate: number;
  rateUnit: string;
  minQty: number | null;
}

export interface SupplierListItem {
  id: string;
  contactId: string;
  supplierCode: string;
  displayName: string;
  phone: string | null;
  gst: string | null;
  city: string | null;
  businessType: string | null;
  categories: string[];
  rateUnit: string;
  reliabilityScore: number | null;
  deliveryLeadDays: number | null;
  photoCount: number;
  rateCount: number;
  primaryPhotoUrl: string | null;
  isActive: boolean;
}

export interface SupplierDetail extends SupplierListItem {
  legalName: string | null;
  email: string | null;
  pan: string | null;
  address: string | null;
  state: string | null;
  pincode: string | null;
  categoryIds: string[];
  waPhone: string | null;
  waBuyer: string | null;
  waGroupId: string | null;
  minOrderValue: number | null;
  notes: string | null;
  photos: SupplierPhoto[];
  rates: SupplierRate[];
  // Form gap-fill (migration 49)
  website: string | null;
  ownerName: string | null;
  gpsLocation: string | null;
  rateMin: number | null;
  rateMax: number | null;
}

// Live duplicate-check result.
export interface DuplicateMatch {
  id: string;
  contactId: string;
  displayName: string;
  gst: string | null;
  phone: string | null;
  matchOn: string;
}

export interface CreateSupplier {
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
  businessType: string;
  categoryIds: string[];
  rateUnit: string;
  waPhone?: string;
  waBuyer?: string;
  minOrderValue?: number;
  deliveryLeadDays?: number;
  notes?: string;
  // Form gap-fill (migration 49)
  website?: string;
  ownerName?: string;
  gpsLocation?: string;
  rateMin?: number | null;
  rateMax?: number | null;
}

export interface LinkableContact {
  contactId: string;
  displayName: string;
  gst: string | null;
  phone: string | null;
  city: string | null;
}

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/suppliers`;

  // Phase 3 — Core Master contacts (Trading parties etc.) not yet in directory.
  listLinkable(search?: string) {
    const params: any = {};
    if (search) params.search = search;
    return this.http.get<LinkableContact[]>(`${this.base}/linkable`, { params });
  }
  addFromContact(contactId: string) {
    return this.http.post<SupplierDetail>(`${this.base}/from-contact/${contactId}`, {});
  }

  list(search?: string, categoryId?: string) {
    const params: any = {};
    if (search) params.search = search;
    if (categoryId) params.categoryId = categoryId;
    return this.http.get<SupplierListItem[]>(this.base, { params });
  }
  get(id: string) { return this.http.get<SupplierDetail>(`${this.base}/${id}`); }
  create(data: CreateSupplier) { return this.http.post<SupplierDetail>(this.base, data); }
  update(id: string, data: CreateSupplier) { return this.http.put<SupplierDetail>(`${this.base}/${id}`, data); }
  delete(id: string) { return this.http.delete(`${this.base}/${id}`); }

  // Live duplicate-check on GST / mobile (debounced from the form).
  checkDuplicate(data: { gst?: string; phone?: string; excludeId?: string }) {
    return this.http.post<DuplicateMatch[]>(`${this.base}/check-duplicate`, data);
  }

  listCategories() { return this.http.get<SupplierCategory[]>(`${this.base}/categories`); }
  createCategory(name: string) { return this.http.post<SupplierCategory>(`${this.base}/categories`, { name }); }
  deleteCategory(id: string) { return this.http.delete(`${this.base}/categories/${id}`); }

  addPhoto(supplierId: string, data: { storageUrl: string; title?: string; rate?: number; rateUnit?: string }) {
    return this.http.post<SupplierPhoto>(`${this.base}/${supplierId}/photos`, data);
  }
  deletePhoto(photoId: string) { return this.http.delete(`${this.base}/photos/${photoId}`); }

  addRate(supplierId: string, data: { categoryId?: string; categoryName?: string; rate: number; rateUnit: string; minQty?: number }) {
    return this.http.post<SupplierRate>(`${this.base}/${supplierId}/rates`, data);
  }
  deleteRate(rateId: string) { return this.http.delete(`${this.base}/rates/${rateId}`); }

  // ---- Product Catalog (varieties + rates + photos) ----
  private catBase = `${environment.apiUrl}/api/catalog`;
  getCatalog(supplierId: string) { return this.http.get<Variety[]>(`${this.catBase}/${supplierId}`); }
  addVariety(supplierId: string, data: { categoryId?: string | null; categoryName?: string | null; name: string; dNo?: string | null }) {
    return this.http.post<{ id: string }>(`${this.catBase}/${supplierId}/varieties`, data);
  }
  deleteVariety(id: string) { return this.http.delete(`${this.catBase}/varieties/${id}`); }
  addVarietyRate(vid: string, data: { rate?: number | null; unit?: string; minQty?: number | null }) {
    return this.http.post<{ id: string }>(`${this.catBase}/varieties/${vid}/rates`, data);
  }
  deleteVarietyRate(id: string) { return this.http.delete(`${this.catBase}/rates/${id}`); }
  uploadVarietyPhoto(vid: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ id: string; url: string }>(`${this.catBase}/varieties/${vid}/photo`, fd);
  }
  deleteVarietyPhoto(id: string) { return this.http.delete(`${this.catBase}/photos/${id}`); }
}

export interface VarietyRate { id: string; rate: number | null; unit: string | null; minQty: number | null; }
export interface VarietyPhoto { id: string; url: string; }
export interface Variety {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  dNo: string | null;
  rates: VarietyRate[];
  photos: VarietyPhoto[];
}
