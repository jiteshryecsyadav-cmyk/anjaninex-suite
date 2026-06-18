import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// =============================================================================
// DTOs
// =============================================================================
export interface AccountHead {
  id: string;
  code: string;
  name: string;
  nature: string;
  sign: string;
  sortOrder: number | null;
  isSystem: boolean;
  groupCount: number;
}

export interface AccountGroup {
  id: string;
  headId: string;
  headName: string;
  code: string | null;
  name: string;
  isSystem: boolean;
  subGroupCount: number;
  ledgerCount: number;
}

export interface SubGroup {
  id: string;
  groupId: string;
  groupName: string;
  headName: string;
  code: string | null;
  name: string;
  isSystem: boolean;
  ledgerCount: number;
}

export interface Ledger {
  id: string;
  subGroupId: string;
  subGroupName: string;
  groupName: string;
  headName: string;
  contactId: string | null;
  contactName: string | null;
  code: string | null;
  name: string;
  openingBalance: number;
  openingType: string;
  currentBalance: number;
  currentBalanceType: string;
  isActive: boolean;
}

export interface VoucherLine {
  ledgerId: string;
  ledgerName: string;
  debitCredit: 'Dr' | 'Cr';
  amount: number;
  narration: string | null;
}

export interface VoucherListItem {
  id: string;
  voucherType: string;
  voucherNo: string;
  voucherDate: string;
  totalAmount: number;
  narration: string | null;
  lineCount: number;
  createdBy: string;
}

export interface VoucherDetail extends VoucherListItem {
  branchId: string;
  branchName: string;
  sourceModule: string | null;
  sourceRefId: string | null;
  lines: VoucherLine[];
}

export interface CreateVoucher {
  voucherType: string;
  voucherDate: string;
  narration: string | null;
  lines: { ledgerId: string; debitCredit: 'Dr' | 'Cr'; amount: number; narration: string | null }[];
}

export interface TrialBalanceRow {
  ledgerId: string;
  ledgerName: string;
  groupName: string;
  headName: string;
  openingDr: number;
  openingCr: number;
  periodDr: number;
  periodCr: number;
  closingDr: number;
  closingCr: number;
}

export interface TrialBalance {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDr: number;
  totalCr: number;
  isBalanced: boolean;
}

export interface ProfitLoss {
  from: string;
  to: string;
  incomeRows: TrialBalanceRow[];
  expenseRows: TrialBalanceRow[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
}

export interface BalanceSheetRow {
  section: string;
  name: string;
  amount: number;
}

export interface BalanceSheet {
  asOf: string;
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  totalAssets: number;
  totalLiabilities: number;
}

// One row of a ledger statement / khata. First row (voucherType '—') is Opening;
// `balance` is the running balance (abs) and `balanceType` is 'Dr' | 'Cr'.
export interface LedgerTransaction {
  date: string;
  voucherNo: string;
  voucherType: string;
  narration: string | null;
  debit: number;
  credit: number;
  balance: number;
  balanceType: 'Dr' | 'Cr';
}

// Party Master shortcut → which accounting ledger belongs to a party.
export interface PartyLedger {
  ledgerId: string;
  ledgerName: string;
}

// =============================================================================
// Service
// =============================================================================
@Injectable({ providedIn: 'root' })
export class AccountingService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/accounting`;

  // Heads
  listHeads(): Observable<AccountHead[]> {
    return this.http.get<AccountHead[]>(`${this.base}/heads`);
  }

  // Groups
  listGroups(headId?: string): Observable<AccountGroup[]> {
    const params = headId ? { headId } : undefined;
    return this.http.get<AccountGroup[]>(`${this.base}/groups`, { params });
  }
  createGroup(data: { headId: string; name: string; code?: string }) {
    return this.http.post<AccountGroup>(`${this.base}/groups`, data);
  }
  deleteGroup(id: string) {
    return this.http.delete(`${this.base}/groups/${id}`);
  }

  // Sub groups
  listSubGroups(groupId?: string): Observable<SubGroup[]> {
    const params = groupId ? { groupId } : undefined;
    return this.http.get<SubGroup[]>(`${this.base}/sub-groups`, { params });
  }
  createSubGroup(data: { groupId: string; name: string; code?: string }) {
    return this.http.post<SubGroup>(`${this.base}/sub-groups`, data);
  }
  deleteSubGroup(id: string) {
    return this.http.delete(`${this.base}/sub-groups/${id}`);
  }

  // Ledgers
  listLedgers(opts?: { subGroupId?: string; search?: string }): Observable<Ledger[]> {
    return this.http.get<Ledger[]>(`${this.base}/ledgers`, { params: opts ?? {} });
  }
  getLedger(id: string) {
    return this.http.get<Ledger>(`${this.base}/ledgers/${id}`);
  }
  createLedger(data: {
    subGroupId: string;
    name: string;
    code?: string;
    contactId?: string;
    openingBalance: number;
    openingType: string;
  }) {
    return this.http.post<Ledger>(`${this.base}/ledgers`, data);
  }
  updateLedger(id: string, data: any) {
    return this.http.put<Ledger>(`${this.base}/ledgers/${id}`, data);
  }
  deleteLedger(id: string) {
    return this.http.delete(`${this.base}/ledgers/${id}`);
  }

  // Vouchers
  listVouchers(opts?: { type?: string; from?: string; to?: string; page?: number; size?: number }) {
    return this.http.get<{ items: VoucherListItem[]; total: number; page: number; size: number }>(
      `${this.base}/vouchers`, { params: opts as any ?? {} });
  }
  getVoucher(id: string) {
    return this.http.get<VoucherDetail>(`${this.base}/vouchers/${id}`);
  }
  createVoucher(data: CreateVoucher) {
    return this.http.post<VoucherDetail>(`${this.base}/vouchers`, data);
  }
  updateVoucher(id: string, data: CreateVoucher) {
    return this.http.put<VoucherDetail>(`${this.base}/vouchers/${id}`, data);
  }
  deleteVoucher(id: string) {
    return this.http.delete(`${this.base}/vouchers/${id}`);
  }

  // Reports
  trialBalance(asOf?: string) {
    return this.http.get<TrialBalance>(`${this.base}/reports/trial-balance`,
      { params: asOf ? { asOf } : {} });
  }
  profitLoss(from?: string, to?: string) {
    const params: any = {};
    if (from) params.from = from;
    if (to) params.to = to;
    return this.http.get<ProfitLoss>(`${this.base}/reports/profit-loss`, { params });
  }
  balanceSheet(asOf?: string) {
    return this.http.get<BalanceSheet>(`${this.base}/reports/balance-sheet`,
      { params: asOf ? { asOf } : {} });
  }
  ledgerStatement(ledgerId: string, from?: string, to?: string) {
    const params: any = {};
    if (from) params.from = from;
    if (to) params.to = to;
    return this.http.get<LedgerTransaction[]>(`${this.base}/reports/ledger-statement/${ledgerId}`, { params });
  }

  // Resolve a trading party → its accounting ledger (Party Master "📒 Ledger" shortcut).
  partyLedger(partyId: string) {
    return this.http.get<PartyLedger>(`${this.base}/reports/party-ledger/${partyId}`);
  }
}
