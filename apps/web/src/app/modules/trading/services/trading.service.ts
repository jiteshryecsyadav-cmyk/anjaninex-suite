import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// =============================================================================
// DTOs
// =============================================================================
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
  pan?: string | null;
  discountNormal?: number;
  discountExhibition?: number;
  discountSpecial?: number;
}

export interface CreateParty {
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
  partyType: string;
  creditLimit: number;
  creditDays: number;
  commissionRate: number;
  openingBalance: number;
  openingType: string;
  waSupplier?: string | null;
  waBuyer?: string | null;
  discountNormal?: number;
  discountExhibition?: number;
  discountSpecial?: number;
}

export interface Item {
  id: string;
  code: string | null;
  name: string;
  hsnSac: string | null;
  unit: string;
  defaultRate: number;
  taxRate: number;
  category: string | null;
  isActive: boolean;
}

export interface BillLine {
  id?: string | null;
  itemId?: string | null;
  itemName: string;
  description?: string | null;
  hsnSac?: string | null;
  qty: number;
  unit?: string | null;
  /** Textile: pieces — qty billing wali hai (rateBasis chuni hui) */
  pcs?: number | null;
  /** Textile: meters */
  meters?: number | null;
  /** 'PCS' | 'MTR' — kis ginti par rate laga */
  rateBasis?: string | null;
  rate: number;
  discountPct: number;
  taxRate: number;
  taxableAmount: number;
  totalAmount: number;
}

export interface BillListItem {
  id: string;
  billType: string;
  billNo: string;
  billDate: string;
  partyId: string;
  partyName: string;           // Supplier name
  partyGst: string | null;     // Supplier GST
  buyerPartyId: string | null;
  buyerName: string | null;    // Buyer name (null for legacy bills)
  buyerGst: string | null;     // Buyer GST
  poNumber: string | null;
  ewayBillNo: string | null;   // For search + display
  ewayBillDate?: string | null; // migration 41 — e-Way bill date
  supplierBillNo?: string | null;   // supplier ka original invoice no (list display)
  partyGroup?: string | null;       // supplier ka group (sister firms)
  buyerGroup?: string | null;       // buyer ka group
  lrNo: string | null;
  total: number;
  paidAmount: number;
  status: string;
  voucherId: string | null;
  aiExtracted: boolean;
  preparedBy?: string | null;   // jis staff ne banaya (login id se)
  isDeleted?: boolean;          // DELETED tag — numbering gap clear rahe
  createdAt?: string;           // entry kab punch hui (time ke saath)
  taxableAmount?: number;       // payment receipt NET AMT
  taxAmount?: number;           // CGST+SGST+IGST
  grAmount?: number;            // is bill ka asli GR total (0 = koi return nahi)
  advanceExtra?: number;        // buyer ne bill se ZYADA diya — extra/advance
  entitledDisc?: number;        // buyer group ka banta-hua disc% (bill date ke hisaab se)
}

export interface BillDetail extends BillListItem {
  supplierBillNo?: string | null;   // supplier ka invoice no (edit me load)
  invoiceType: string | null;
  poNumber: string | null;
  deliveryDate: string | null;
  subtotal: number;
  discount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  voucherNo: string | null;
  notes: string | null;
  // e-Way / transporter / LR — DB columns (Bill entity); Get ab seedha lautata hai
  ewayBillDate?: string | null;
  transporterId?: string | null;
  lrDate?: string | null;
  lines: BillLine[];
}

export interface CreateBill {
  billType: string;
  billDate: string;
  partyId: string;
  invoiceType?: string;
  poNumber?: string;
  deliveryDate?: string;
  discount: number;
  roundOff: number;
  notes?: string;
  ewayBillDate?: string | null;   // migration 41 — e-Way bill date
  lines: BillLine[];
}

// =============================================================================
// Orders
// =============================================================================
export interface OrderLine {
  id?: string | null;
  itemId?: string | null;
  itemName: string;
  description?: string | null;
  hsnSac?: string | null;
  qty: number;
  unit?: string | null;
  /** Textile: pieces — qty billing wali hai (rateBasis chuni hui) */
  pcs?: number | null;
  /** Textile: meters */
  meters?: number | null;
  /** 'PCS' | 'MTR' — kis ginti par rate laga */
  rateBasis?: string | null;
  rate: number;
  rd: number;
  sgstPct: number;
  cgstPct: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface OrderListItem {
  id: string;
  orderType: string;
  orderNo: string;
  orderDate: string;
  partyId: string;
  partyName: string;
  buyerPartyId: string | null;
  buyerName: string | null;
  total: number;
  status: string;
  paymentTerms: string | null;
  preparedBy?: string | null;   // jis staff ne banaya (login id se)
  isDeleted?: boolean;          // DELETED tag — numbering gap clear rahe
  createdAt?: string;           // entry kab punch hui (time ke saath)
  billedDate?: string | null;   // is order ka bill kab bana
}

export interface OrderDetail extends OrderListItem {
  subtotal: number;
  taxAmount: number;
  cdPercent: number;
  cdAmount: number;
  cdType?: string;          // before | after (GST)
  transporterId?: string | null;
  supplierOrderNo: string | null;
  notes: string | null;
  lines: OrderLine[];
}

export interface CreateOrder {
  orderType: string;
  orderDate: string;
  partyId: string;
  buyerPartyId?: string | null;
  cdPercent: number;
  cdType?: string;          // before | after (GST)
  cdAmount?: number;        // computed amount (manual override included)
  transporterId?: string | null;
  supplierOrderNo?: string;
  paymentTerms?: string;
  status: string;
  notes?: string;
  lines: OrderLine[];
}

// =============================================================================
// Goods Returns (GR)
// =============================================================================
export interface GoodsReturnLine {
  id?: string | null;
  billLineId?: string | null;
  itemId?: string | null;
  itemName: string;
  description?: string | null;
  hsnSac?: string | null;
  qty: number;
  unit?: string | null;
  rate: number;
  rd: number;
  igstPct: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface GoodsReturnListItem {
  id: string;
  grNo: string;
  grDate: string;
  supplierPartyId: string;
  supplierName: string;
  buyerPartyId: string | null;
  buyerName: string | null;
  originalBillId: string | null;
  originalBillNo: string | null;
  totalReturnAmount: number;
  effectMode: string;
  status: string;
  createdAt?: string;   // entry kab punch hui (time ke saath)
}

export interface GoodsReturnDetail extends GoodsReturnListItem {
  transport: string | null;
  lrNo: string | null;
  reason: string | null;
  remark: string | null;
  originalBillAmount: number;
  taxableAmount: number;
  taxAmount: number;
  netBillAfterGr: number;
  creditNoteValidTill: string | null;
  creditNoteAdjustFuture: boolean;
  commissionPct: number;
  commissionAmount: number;
  approvedAt: string | null;
  rejectionReason: string | null;
  lines: GoodsReturnLine[];
}

export interface CreateGoodsReturn {
  grDate: string;
  supplierPartyId: string;
  buyerPartyId?: string | null;
  originalBillId?: string | null;
  transport?: string;
  lrNo?: string;
  reason?: string;
  remark?: string;
  effectMode: string;            // direct_adjustment | credit_note
  originalBillAmount: number;
  creditNoteValidTill?: string | null;
  creditNoteAdjustFuture: boolean;
  commissionPct: number;
  status: string;
  lines: GoodsReturnLine[];
}

export interface PaymentAllocation {
  billId: string;
  billNo: string;
  allocated: number;
  /** Discount + packing + rate diff jo bill se KATA — cash nahi aaya par bill utna settle hua. */
  deduction?: number;
}

export interface Transporter {
  id: string;
  firmName: string;
  gstNo: string | null;
  mobile: string | null;
  city: string | null;
  state: string | null;
  isActive?: boolean;
}

export interface PaymentListItem {
  id: string;
  paymentType: string;
  paymentNo: string;
  paymentDate: string;
  partyId: string;
  partyName: string;
  partyGst: string | null;
  paymentMode: string;
  amount: number;
  referenceNo: string | null;
  voucherId: string | null;
  voucherNo: string | null;
  billNos: string | null;
  createdAt?: string;        // entry kab punch hui (time ke saath)
  balancePending?: number;   // is payment ke bills par abhi kitna baki
  supplierName?: string | null;  // notes ke "Supplier: X" se
}

export interface CreatePayment {
  paymentType: string;
  paymentDate: string;
  partyId: string;
  paymentMode: string;
  amount: number;
  referenceNo?: string;
  bankName?: string;
  bankLedgerId: string | null;   // broker receipt me zaroori nahi
  notes?: string;
  allocations?: PaymentAllocation[];
  reuseNo?: string;   // edit me purana payment number reuse (renumber na ho)
  moneyToAgency?: boolean;   // true = aadhat: paisa agency ke cash/bank me aaya
}

// =============================================================================
// Service
// =============================================================================
@Injectable({ providedIn: 'root' })
export class TradingService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/trading`;

  // Strip undefined/null/empty values from params (Angular HttpClient serializes
  // undefined as the literal string "undefined" which breaks backend filters)
  private cleanParams(opts: any): any {
    if (!opts) return {};
    const clean: any = {};
    for (const k of Object.keys(opts)) {
      const v = opts[k];
      if (v !== undefined && v !== null && v !== '') clean[k] = v;
    }
    return clean;
  }

  // Transporters (from core schema)
  listTransporters(): Observable<Transporter[]> {
    return this.http.get<Transporter[]>(`${environment.apiUrl}/api/core/transporters`);
  }
  createTransporter(data: { firmName: string; gstNo?: string; mobile?: string }): Observable<Transporter> {
    return this.http.post<Transporter>(`${environment.apiUrl}/api/core/transporters`, data);
  }

  // Parties
  listParties(search?: string): Observable<Party[]> {
    return this.http.get<Party[]>(`${this.base}/parties`, { params: search ? { search } : {} });
  }
  getParty(id: string) { return this.http.get<Party>(`${this.base}/parties/${id}`); }
  createParty(data: CreateParty) { return this.http.post<Party>(`${this.base}/parties`, data); }
  updateParty(id: string, data: CreateParty) { return this.http.put<Party>(`${this.base}/parties/${id}`, data); }
  updatePartyCredit(id: string, creditLimit: number, creditDays: number) {
    return this.http.patch(`${this.base}/parties/${id}/credit`, { creditLimit, creditDays });
  }
  deleteParty(id: string) { return this.http.delete(`${this.base}/parties/${id}`); }

  // Items
  listItems(search?: string): Observable<Item[]> {
    return this.http.get<Item[]>(`${this.base}/items`, { params: search ? { search } : {} });
  }
  createItem(data: any) { return this.http.post<Item>(`${this.base}/items`, data); }
  updateItem(id: string, data: any) { return this.http.put<Item>(`${this.base}/items/${id}`, data); }
  deleteItem(id: string) { return this.http.delete(`${this.base}/items/${id}`); }

  // Bills
  listBills(opts?: { type?: string; from?: string; to?: string; partyId?: string; status?: string; page?: number; size?: number }) {
    return this.http.get<{ items: BillListItem[]; total: number }>(`${this.base}/bills`, { params: this.cleanParams(opts) });
  }
  getBill(id: string) { return this.http.get<BillDetail>(`${this.base}/bills/${id}`); }
  createBill(data: CreateBill) { return this.http.post<BillDetail>(`${this.base}/bills`, data); }
  updateBill(id: string, data: CreateBill) { return this.http.put<BillDetail>(`${this.base}/bills/${id}`, data); }
  deleteBill(id: string) { return this.http.delete(`${this.base}/bills/${id}`); }

  // Orders
  listOrders(opts?: { type?: string; from?: string; to?: string; partyId?: string; status?: string; page?: number; size?: number }) {
    return this.http.get<{ items: OrderListItem[]; total: number }>(`${this.base}/orders`, { params: this.cleanParams(opts) });
  }
  getOrder(id: string) { return this.http.get<OrderDetail>(`${this.base}/orders/${id}`); }
  createOrder(data: CreateOrder) { return this.http.post<OrderDetail>(`${this.base}/orders`, data); }
  updateOrder(id: string, data: CreateOrder) { return this.http.put<OrderDetail>(`${this.base}/orders/${id}`, data); }
  deleteOrder(id: string) { return this.http.delete(`${this.base}/orders/${id}`); }

  // Goods Returns
  listGoodsReturns(opts?: { status?: string; from?: string; to?: string; partyId?: string; page?: number; size?: number }) {
    return this.http.get<{ items: GoodsReturnListItem[]; total: number }>(`${this.base}/goods-returns`, { params: this.cleanParams(opts) });
  }
  getGoodsReturn(id: string) { return this.http.get<GoodsReturnDetail>(`${this.base}/goods-returns/${id}`); }
  createGoodsReturn(data: CreateGoodsReturn) { return this.http.post<GoodsReturnDetail>(`${this.base}/goods-returns`, data); }
  updateGoodsReturn(id: string, data: CreateGoodsReturn) { return this.http.put<GoodsReturnDetail>(`${this.base}/goods-returns/${id}`, data); }
  approveGoodsReturn(id: string) { return this.http.post<GoodsReturnDetail>(`${this.base}/goods-returns/${id}/approve`, {}); }
  rejectGoodsReturn(id: string, reason: string) { return this.http.post<GoodsReturnDetail>(`${this.base}/goods-returns/${id}/reject`, { reason }); }
  deleteGoodsReturn(id: string) { return this.http.delete(`${this.base}/goods-returns/${id}`); }

  // Payments
  listPayments(opts?: { type?: string; from?: string; to?: string; partyId?: string; page?: number; size?: number }) {
    return this.http.get<{ items: PaymentListItem[]; total: number }>(`${this.base}/payments`, { params: this.cleanParams(opts) });
  }
  outstandingBills(partyId: string, supplierId?: string) {
    const params: any = { partyId };
    if (supplierId) params.supplierId = supplierId;   // supplier-buyer PAIR ke bills
    return this.http.get<BillListItem[]>(`${this.base}/payments/outstanding-bills`, { params });
  }
  createPayment(data: CreatePayment) { return this.http.post(`${this.base}/payments`, data); }
  getPayment(id: string) { return this.http.get<any>(`${this.base}/payments/${id}`); }
  deletePayment(id: string) { return this.http.delete(`${this.base}/payments/${id}`); }

  // Commission Invoices (consolidated commission e-invoices generated from bills)
  /** Jin bills ka commission pehle se ban chuka hai — unki id list.
   *  Naya commission banate waqt inhe hata dete hain, warna wahi bill dobara
   *  aakar duplicate invoice ban jati hai. */
  /** Receipt ko JAGAH PAR update — delete+recreate ki jagah.
   *  Us purane tarike me delete chal jata aur banana atak jata to payment hi
   *  gayab ho jati thi. Ye sab kuch ek transaction me karta hai. */
  updatePayment(id: string, data: any) {
    return this.http.put<any>(`${this.base}/payments/${id}`, data);
  }
  billedBillIds() {
    return this.http.get<string[]>(`${this.base}/commission-invoices/billed-bill-ids`);
  }
  listCommissionInvoices() {
    return this.http.get<any[]>(`${this.base}/commission-invoices`);
  }
  getCommissionInvoice(id: string) {
    return this.http.get<any>(`${this.base}/commission-invoices/${id}`);
  }
  createCommissionInvoice(data: {
    partyId: string;
    commissionPct: number;
    gstPct: number;
    notes?: string;
    lines: { billId: string; billNo: string; billDate: string; billAmount: number; commissionPct: number; commissionAmount: number; }[];
  }) {
    return this.http.post<{ id: string; invoiceNo: string; totalAmount: number }>(`${this.base}/commission-invoices`, data);
  }
  deleteCommissionInvoice(id: string) {
    return this.http.delete(`${this.base}/commission-invoices/${id}`);
  }
}
