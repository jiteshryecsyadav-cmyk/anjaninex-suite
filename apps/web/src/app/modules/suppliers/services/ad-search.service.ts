import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface SearchResult {
  type: string;        // supplier | buyer
  id: string;
  contactId: string;
  displayName: string;
  phone: string | null;
  gst: string | null;
  city: string | null;
  extra: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdSearchService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/ad-search`;

  search(q: string, type?: string) {
    const params: any = { q };
    if (type) params.type = type;
    return this.http.get<SearchResult[]>(this.base, { params });
  }
}
