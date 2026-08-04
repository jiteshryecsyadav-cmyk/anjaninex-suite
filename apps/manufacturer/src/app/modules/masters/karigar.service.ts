import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Karigar {
  id: string;
  name: string;
  firmName: string | null;
  mobile: string;
  jobType: string;
  agentId: string | null;
  agentName: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  pincode: string | null;
  gstin: string | null;
  gstType: string | null;
  pan: string | null;
  photoUrl: string | null;
  isActive: boolean;
  /** Kitni majoori abhi baki hai — list me har naam ke saamne dikhti hai. */
  majooriBaki: number;
}

export type SaveKarigar = Omit<Karigar, 'id' | 'agentName' | 'majooriBaki'>;

@Injectable({ providedIn: 'root' })
export class KarigarService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg/karigars`;

  list(search = '', includeInactive = false) {
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    if (includeInactive) q.set('includeInactive', 'true');
    return this.http.get<Karigar[]>(`${this.base}?${q}`);
  }

  create(dto: SaveKarigar) { return this.http.post<{ id: string }>(this.base, dto); }
  update(id: string, dto: SaveKarigar) { return this.http.put<{ id: string }>(`${this.base}/${id}`, dto); }

  /** Mitane ki jagah band karna — uske job slip aur majoori ka hisab bacha rehta hai. */
  toggle(id: string) {
    return this.http.post<{ id: string; isActive: boolean }>(`${this.base}/${id}/toggle`, {});
  }
}
