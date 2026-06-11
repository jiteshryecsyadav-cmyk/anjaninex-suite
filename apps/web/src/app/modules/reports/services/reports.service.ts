import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface ExecutiveKpi {
  todaysSales: number;
  todaysReceipts: number;
  mtdSales: number;
  mtdReceipts: number;
  mtdProfit: number;
  outstandingTotal: number;
  billsToday: number;
  pendingBillsCount: number;
  partiesActive: number;
  cashInHand: number;
  bankBalance: number;
}

export interface DailyPoint {
  day: string;
  sales: number;
  receipts: number;
  billsCount: number;
}

export interface SalesRegisterRow {
  billNo: string;
  billDate: string;
  partyName: string;          // SUPPLIER (broker model: bill.partyId)
  gst: string | null;
  buyerName?: string | null;  // BUYER (bill.buyerPartyId)
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  paidAmount: number;
  status: string;
}

export interface OutstandingRow {
  partyName: string;
  billNo: string;
  billDate: string;
  total: number;
  paid: number;
  pending: number;
  daysOverdue: number;
  agingBucket: string;
}

export interface PartyOutstanding {
  partyName: string;
  phone: string | null;
  gst: string | null;
  totalOutstanding: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90Plus: number;
  billCount: number;
}

export interface PartySales {
  partyId: string;
  partyName: string;
  billCount: number;
  totalSales: number;
  totalPaid: number;
  outstanding: number;
}

export interface ItemSales {
  itemName: string;
  hsnSac: string | null;
  totalQty: number;
  unit: string;
  totalRevenue: number;
  billCount: number;
  avgRate: number;
}

export interface GstSummary {
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  grandTotal: number;
  billCount: number;
}

export interface GstByRate {
  taxRate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  count: number;
}

export interface PaymentMode {
  mode: string;
  count: number;
  amount: number;
}

export interface DayReceipt {
  day: string;
  receipts: number;
  payments: number;
  netCashflow: number;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/reports`;

  kpi() { return this.http.get<ExecutiveKpi>(`${this.base}/kpi`); }
  dailySalesTrend(days = 30) { return this.http.get<DailyPoint[]>(`${this.base}/daily-sales-trend`, { params: { days } as any }); }
  salesRegister(from?: string, to?: string, status?: string) {
    const p: any = {};
    if (from) p.from = from; if (to) p.to = to; if (status) p.status = status;
    return this.http.get<SalesRegisterRow[]>(`${this.base}/sales-register`, { params: p });
  }
  outstanding(asOf?: string) {
    return this.http.get<OutstandingRow[]>(`${this.base}/outstanding`,
      { params: asOf ? { asOf } : {} });
  }
  partyOutstanding(asOf?: string) {
    return this.http.get<PartyOutstanding[]>(`${this.base}/party-outstanding`,
      { params: asOf ? { asOf } : {} });
  }
  topParties(from?: string, to?: string, top = 20) {
    const p: any = { top };
    if (from) p.from = from; if (to) p.to = to;
    return this.http.get<PartySales[]>(`${this.base}/top-parties`, { params: p });
  }
  topItems(from?: string, to?: string, top = 20) {
    const p: any = { top };
    if (from) p.from = from; if (to) p.to = to;
    return this.http.get<ItemSales[]>(`${this.base}/top-items`, { params: p });
  }
  gstSummary(from?: string, to?: string) {
    const p: any = {};
    if (from) p.from = from; if (to) p.to = to;
    return this.http.get<{ summary: GstSummary; byRate: GstByRate[] }>(`${this.base}/gst-summary`, { params: p });
  }
  paymentMode(from?: string, to?: string) {
    const p: any = {};
    if (from) p.from = from; if (to) p.to = to;
    return this.http.get<PaymentMode[]>(`${this.base}/payment-mode`, { params: p });
  }
  dailyCashflow(days = 30) { return this.http.get<DayReceipt[]>(`${this.base}/daily-cashflow`, { params: { days } as any }); }
}
