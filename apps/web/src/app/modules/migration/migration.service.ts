import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// Per-row result from the backend import.
export interface ImportRowResult {
  row: number;
  ok: boolean;
  message: string;
}

export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  rows: ImportRowResult[];
}

export type MigrationType = 'parties' | 'items' | 'ledgers' | 'bills' | 'opening';

@Injectable({ providedIn: 'root' })
export class MigrationService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/migration`;

  /** Download the .xlsx template for a type (returns a Blob to save as a file). */
  downloadTemplate(type: MigrationType): Observable<Blob> {
    return this.http.get(`${this.base}/template/${type}`, { responseType: 'blob' });
  }

  /** Upload a .xlsx/.csv file and get a per-row import report. */
  import(type: MigrationType, file: File): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ImportResult>(`${this.base}/import/${type}`, form);
  }
}
