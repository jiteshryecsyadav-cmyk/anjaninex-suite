import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface MatchRequest {
  buyerId?: string | null;
  categoryIds?: string[];
  rateMin?: number | null;
  rateMax?: number | null;
  city?: string;
}

export interface MatchResult {
  supplierId: string;
  displayName: string;
  phone: string | null;
  city: string | null;
  businessType: string | null;
  matchedCategories: string[];
  categoryMatchCount: number;
  bestRate: number | null;
  score: number;
}

@Injectable({ providedIn: 'root' })
export class MatchService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/match`;

  match(req: MatchRequest) {
    return this.http.post<MatchResult[]>(this.base, req);
  }
}
