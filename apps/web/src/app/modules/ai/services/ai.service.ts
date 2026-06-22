import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface ExtractedParty {
  name: string;
  gst: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
}

export interface ExtractedInvoice {
  number: string;
  date: string;
  dueDate: string;
  poNumber: string;
}

export interface ExtractedItem {
  name: string;
  hsnSac: string;
  qty: number;
  unit: string;
  rate: number;
  discountPercent: number;
  taxRate: number;
  taxableAmount: number;
  totalAmount: number;
}

export interface ExtractedTotals {
  taxableTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  grandTotal: number;
  amountInWords: string;
}

export interface ExtractedTransport {
  name: string;
  vehicleNo: string;
  lrNo: string;
  lrDate: string;
}

export interface ExtractedBank {
  name: string;
  accountNo: string;
  ifsc: string;
}

export interface ExtractedBill {
  confidence: number;
  fromCache: boolean;
  cost: number;
  modelUsed: string;
  imageHash: string;
  extractionId: string;
  failureReason?: string | null;
  supplier: ExtractedParty;
  buyer: ExtractedParty;
  invoice: ExtractedInvoice;
  items: ExtractedItem[];
  totals: ExtractedTotals;
  transport: ExtractedTransport;
  bank: ExtractedBank;
}

export interface ScanReportRow {
  date: string; time: string; type: string;
  model: string; confidence: number; user: string;
}

@Injectable({ providedIn: 'root' })
export class AiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/ai`;

  // Multi-page: accepts one File or an array of pages. Each page is appended under the
  // same 'image' field name so the backend reads them all via Request.Form.Files.
  // Single-page (1 File) behaves exactly as before.
  extractBill(images: File | File[], source: 'bill' | 'order' = 'bill', model?: 'flash' | 'pro' | 'sonnet' | 'haiku' | 'gpt4o') {
    const fd = new FormData();
    const pages = Array.isArray(images) ? images : [images];
    for (const page of pages) fd.append('image', page);
    fd.append('source', source);
    // Scan model chooser — chosen model query param se jaata hai (?model=flash|pro|sonnet).
    // model na de to backend firm-default (BYOK / Flash) use karega — purana behavior.
    const url = model ? `${this.base}/extract-bill?model=${model}` : `${this.base}/extract-bill`;
    return this.http.post<ExtractedBill>(url, fd);
  }

  scanReport(limit = 200) {
    return this.http.get<ScanReportRow[]>(`${this.base}/scan-report`, { params: { limit } as any });
  }

  usage() {
    return this.http.get<{ usedThisMonth: number; total: number; quotaMonthly: number; lastScanAt: string | null }>(`${this.base}/usage`);
  }

  recentExtractions(limit = 20) {
    return this.http.get<any[]>(`${this.base}/recent-extractions`, { params: { limit } as any });
  }

  markCorrected(id: string, diff: any) {
    return this.http.post(`${this.base}/mark-corrected/${id}`, diff);
  }
}
