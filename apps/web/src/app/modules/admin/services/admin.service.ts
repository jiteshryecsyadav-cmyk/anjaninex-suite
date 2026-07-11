import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface AnjaninexKpi {
  totalFirms: number;
  activeFirms: number;
  trialFirms: number;
  suspendedFirms: number;
  mrrInr: number;
  mtdRevenue: number;
  mtdMargin: number;
  todayRevenue: number;
  newFirmsThisMonth: number;
  totalWalletBalance: number;
  aiCallsToday: number;
  aiRevenueToday: number;
  aiCostToday: number;
}

export interface FirmListItem {
  id: string;
  name: string;
  gst: string | null;
  city: string | null;
  contactEmail: string;
  planCode: string;
  status: string;
  walletBalance: number;
  mtdSpend: number;
  createdAt: string;
  activatedAt: string | null;
}

export interface FirmDetail extends FirmListItem {
  legalName: string | null;
  pan: string | null;
  state: string | null;
  contactPhone: string;
  planName: string;
  planMonthlyInr: number | null;
  creditLimit: number;
  trialEndsAt: string | null;
  branchCount: number;
  userCount: number;
  billCount: number;
  voucherCount: number;
  supplierCount: number;
  lifetimeSpend: number;
  lifetimeRevenue: number;
  theme: string;
}

export interface WalletTxn {
  id: number;
  txnType: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface RevenuePoint {
  day: string;
  gross: number;
  cost: number;
  margin: number;
}

export interface AgentCost {
  agentName: string;
  calls: number;
  costInr: number;
  revenueInr: number;
  marginInr: number;
  avgConfidence: number;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  monthlyInr: number | null;
  annualInr: number | null;
  maxBranches: number;
  maxUsers: number;
  maxAiCalls: number;
  maxWaMessages: number;
  features: string;
  isActive: boolean;
  firmCount: number;
}

export interface FirmReportRow {
  id: string; name: string; city: string | null; status: string;
  planName: string | null; planEnds: string | null; extendedOn: string | null;
  branches: number; staff: number; walletBalance: number;
}
export interface FirmReport {
  summary: { total: number; active: number; trial: number; grace: number; suspended: number; cancelled: number; extended: number };
  firms: FirmReportRow[];
}

export interface FirmPartnerReq { fullName: string; username: string; password: string; mobile?: string; whatsapp?: string; }
export interface CreateFirmReq {
  name: string; legalName?: string; gst?: string; pan?: string; city?: string; state?: string;
  firmType?: string;   // proprietorship | partnership | llp | pvt_ltd
  contactEmail: string; contactPhone: string; planId?: string | null;
  bankName?: string; accountNo?: string; ifsc?: string;
  adminFullName: string; adminUsername: string; adminPassword: string; adminMobile?: string; adminWhatsapp?: string;
  agentCode?: string;
  partners?: FirmPartnerReq[];   // extra admin logins (2-4), sab firm_owner
}

export interface SavePlan {
  code: string; name: string;
  monthlyInr: number | null; annualInr: number | null;
  maxBranches: number; maxUsers: number; maxAiCalls: number; maxWaMessages: number;
  features: string;
}

export interface TopFirm {
  firmId: string;
  name: string;
  planCode: string;
  revenue: number;
  days: number;
}

export interface LowBalanceFirm {
  firmId: string;
  name: string;
  balance: number;
  lastDailySpend: number;
}

// Firm ka login user — password kabhi nahi aata (security). Sirf reset hota hai.
export interface FirmUser {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  roles: string[];
  createdAt: string;
}

export interface UpdateFirmUserReq {
  fullName: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/admin`;

  kpi() { return this.http.get<AnjaninexKpi>(`${this.base}/kpi`); }
  dailyRevenue(days = 30) { return this.http.get<RevenuePoint[]>(`${this.base}/daily-revenue`, { params: { days } as any }); }
  topFirms(top = 10) { return this.http.get<TopFirm[]>(`${this.base}/top-firms`, { params: { top } as any }); }
  lowBalance() { return this.http.get<LowBalanceFirm[]>(`${this.base}/low-balance`); }

  listFirms(search?: string, status?: string) {
    const p: any = {};
    if (search) p.search = search;
    if (status) p.status = status;
    return this.http.get<FirmListItem[]>(`${this.base}/firms`, { params: p });
  }
  getFirm(id: string) { return this.http.get<FirmDetail>(`${this.base}/firms/${id}`); }
  firmWalletHistory(id: string, limit = 50) {
    return this.http.get<WalletTxn[]>(`${this.base}/firms/${id}/wallet-history`, { params: { limit } as any });
  }
  recharge(id: string, amount: number, source: string, reference: string) {
    return this.http.post(`${this.base}/firms/${id}/recharge`, { amount, source, reference });
  }
  suspend(id: string) { return this.http.post(`${this.base}/firms/${id}/suspend`, {}); }
  activate(id: string) { return this.http.post(`${this.base}/firms/${id}/activate`, {}); }
  changePlan(id: string, planId: string) { return this.http.post(`${this.base}/firms/${id}/change-plan`, { planId }); }
  setFirmTheme(firmId: string, theme: string) {
    return this.http.post<{ success: boolean; theme: string }>(`${this.base}/firms/${firmId}/theme`, { theme });
  }

  // ---- Firm login users (super-admin) ----
  listFirmUsers(firmId: string) { return this.http.get<FirmUser[]>(`${this.base}/firms/${firmId}/users`); }
  resetFirmUserPassword(firmId: string, userId: string, newPassword: string) {
    return this.http.post<{ ok: boolean }>(`${this.base}/firms/${firmId}/users/${userId}/reset-password`, { newPassword });
  }
  updateFirmUser(firmId: string, userId: string, data: UpdateFirmUserReq) {
    return this.http.put<{ ok: boolean }>(`${this.base}/firms/${firmId}/users/${userId}`, data);
  }
  deleteFirmUser(firmId: string, userId: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/firms/${firmId}/users/${userId}`);
  }

  aiCostBreakdown(days = 30) { return this.http.get<AgentCost[]>(`${this.base}/ai/cost-breakdown`, { params: { days } as any }); }
  aiDailyRevenue(days = 30) { return this.http.get<RevenuePoint[]>(`${this.base}/ai/daily-revenue`, { params: { days } as any }); }

  listPlans() { return this.http.get<Plan[]>(`${this.base}/plans`); }
  togglePlan(id: string) { return this.http.post(`${this.base}/plans/${id}/toggle`, {}); }
  createFirm(data: CreateFirmReq) {
    return this.http.post<{ firmId: string; username: string }>(`${this.base}/firms`, data);
  }
  getFirmReport() { return this.http.get<FirmReport>(`${this.base}/firms-report`); }
  getFirmApiKeys(id: string) { return this.http.get<FirmApiKeysInfo>(`${this.base}/firms/${id}/api-keys`); }
  saveFirmApiKeys(id: string, data: SaveFirmApiKeys) {
    return this.http.put(`${this.base}/firms/${id}/api-keys`, data);
  }
  extendBulk(days: number, planId?: string) {
    return this.http.post<{ count: number }>(`${this.base}/subscription/extend-bulk`, { days, planId: planId ?? null });
  }
  createPlan(data: SavePlan) { return this.http.post<Plan>(`${this.base}/plans`, data); }
  updatePlan(id: string, data: SavePlan) { return this.http.put<Plan>(`${this.base}/plans/${id}`, data); }
  deletePlan(id: string) { return this.http.delete(`${this.base}/plans/${id}`); }

  listChangelog() { return this.http.get<any[]>(`${this.base}/changelog`); }
  publishChangelog(entry: any) { return this.http.post(`${this.base}/changelog`, entry); }

  getBilling() { return this.http.get<BillingSettings>(`${this.base}/billing`); }
  saveBilling(s: SaveBilling) { return this.http.put<BillingSettings>(`${this.base}/billing`, s); }

  // ---- Platform AI keys (super-admin, common for all firms) ----
  getAiKeys() { return this.http.get<AiKeysInfo>(`${this.base}/ai-keys`); }
  saveAiKeys(body: SaveAiKeys) { return this.http.put<AiKeysInfo>(`${this.base}/ai-keys`, body); }
  clearAiKey(provider: 'gemini' | 'claude' | 'openai' | 'sarvam' | 'maps' | 'ola') { return this.http.delete<AiKeysInfo>(`${this.base}/ai-keys/${provider}`); }

  // Add-on services (admin catalog)
  listAddonServices() { return this.http.get<AddonService[]>(`${this.base}/addon-services`); }
  createAddonService(s: SaveAddonService) { return this.http.post<AddonService>(`${this.base}/addon-services`, s); }
  updateAddonService(id: string, s: SaveAddonService) { return this.http.put<AddonService>(`${this.base}/addon-services/${id}`, s); }
  deleteAddonService(id: string) { return this.http.delete(`${this.base}/addon-services/${id}`); }

  listPaymentRequests(status = 'pending') {
    return this.http.get<AdminPaymentReq[]>(`${this.base}/payment-requests`, { params: { status } as any });
  }
  approvePayment(id: string) { return this.http.post(`${this.base}/payment-requests/${id}/approve`, {}); }
  getTurnover() { return this.http.get<TurnoverInfo>(`${this.base}/payment-requests/turnover`); }
  rejectPayment(id: string, reason: string) { return this.http.post(`${this.base}/payment-requests/${id}/reject`, { reason }); }

  // ---- Agent / Reseller program ----
  listAgents() { return this.http.get<AgentListItem[]>(`${this.base}/agents`); }
  getAgent(id: string) { return this.http.get<AgentDetail>(`${this.base}/agents/${id}`); }
  createAgent(body: CreateAgentReq) { return this.http.post<CreateAgentResp>(`${this.base}/agents`, body); }
  updateAgent(id: string, body: UpdateAgentReq) { return this.http.put<{ ok: boolean }>(`${this.base}/agents/${id}`, body); }
  agentPayout(id: string, body: AgentPayoutReq) { return this.http.post<{ ok: boolean }>(`${this.base}/agents/${id}/payout`, body); }
  resolveAgentCode(code: string) { return this.http.get<AgentResolve>(`${this.base}/agents/resolve`, { params: { code } as any }); }
}

export interface FirmApiKeysInfo {
  aiProvider: string; aiModel: string | null;
  aiKeySet: boolean; aiKeyMasked: string | null;
  mapsKeySet: boolean; mapsKeyMasked: string | null;
}
export interface SaveFirmApiKeys {
  aiProvider: string;
  aiApiKey?: string | null;   // null/omit = no change, '' = clear
  aiModel?: string | null;
  mapsApiKey?: string | null;
}

export interface AdminPaymentReq {
  id: string; firmId: string; firmName: string | null; amount: number;
  method: string | null; reference: string | null; note: string | null;
  status: string; createdAt: string | null;
}

export interface BillingSettings {
  payeeName: string | null; upiId: string | null; bankName: string | null;
  accountName: string | null; accountNo: string | null; ifsc: string | null;
  qrImageUrl: string | null; instructions: string | null; gateway: string | null;
  razorpayKeyId: string | null; gatewayEnabled: boolean; razorpaySecretSet: boolean;
  booksFirmId: string | null; gstin: string | null;
}
export interface SaveBilling {
  payeeName?: string | null; upiId?: string | null; bankName?: string | null;
  accountName?: string | null; accountNo?: string | null; ifsc?: string | null;
  qrImageUrl?: string | null; instructions?: string | null; gateway?: string | null;
  razorpayKeyId?: string | null; razorpayKeySecret?: string | null; gatewayEnabled?: boolean;
  booksFirmId?: string | null; gstin?: string | null;
}

// Platform AI keys — full key kabhi nahi aati, sirf set-flag + last 4 chars.
export interface AiKeysInfo {
  geminiSet: boolean; geminiLast4: string;
  claudeSet: boolean; claudeLast4: string;
  openaiSet: boolean; openaiLast4: string;
  sarvamSet: boolean; sarvamLast4: string;   // Anji ki voice (Sarvam AI TTS)
  mapsSet: boolean; mapsLast4: string;       // Google Maps key
  olaMapsSet: boolean; olaMapsLast4: string; // Ola Maps key
  mapsProvider: string;                      // osm | google | ola
}
export interface SaveAiKeys {
  geminiKey?: string | null;   // blank/null = no change
  claudeKey?: string | null;
  openaiKey?: string | null;
  sarvamKey?: string | null;   // Anji voice (Sarvam AI)
  mapsKey?: string | null;     // Google Maps key
  olaMapsKey?: string | null;  // Ola Maps key
  mapsProvider?: string | null; // osm | google | ola
}

export interface AddonService {
  id: string; code: string; name: string; icon: string | null; unit: string | null;
  rate: number; freeNote: string | null; billingType: string; active: boolean;
  allowSelf: boolean; sortOrder: number;
}
export interface SaveAddonService {
  code?: string | null; name: string; icon?: string | null; unit?: string | null;
  rate: number; freeNote?: string | null; billingType?: string | null; active: boolean;
  allowSelf: boolean; sortOrder: number;
}

export interface TurnoverInfo {
  fyLabel: string; turnover: number; threshold: number;
  gstApplicable: boolean; gstCollected: number;
}

// ===== Agent / Reseller program =====
export interface AgentListItem {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  signupCommissionPct: number;
  rechargeCommissionPct: number;
  walletBalance: number;
  status: string;
  firmsCount: number;
  totalEarned: number;
  pending: number;
}

export interface AgentCommission {
  id: string;
  firmName: string;
  kind: string;
  rechargeAmount: number;
  commissionPct: number;
  commissionAmt: number;
  status: string;
  createdAt: string;
}

export interface AgentPayout {
  id: string;
  amount: number;
  method: string;
  reference: string;
  createdAt: string;
}

// Flat shape — matches backend AgentDetailDto exactly.
export interface AgentDetail {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  signupCommissionPct: number;
  rechargeCommissionPct: number;
  status: string;
  notes?: string | null;
  walletBalance: number;
  firmsCount: number;
  totalEarned: number;
  pending: number;
  paid: number;
  recentCommissions: AgentCommission[];
  payouts: AgentPayout[];
  createdAt: string;
}

export interface CreateAgentReq {
  name: string;
  email: string;
  phone: string;
  signupCommissionPct: number;
  rechargeCommissionPct: number;
  code?: string;
  loginUsername?: string;
  loginPassword?: string;
}

export interface CreateAgentResp {
  id: string;
  code: string;
  name: string;
  loginUsername: string;
  tempPassword: string;
}

export interface UpdateAgentReq {
  name: string;
  email: string;
  phone: string;
  signupCommissionPct: number;
  rechargeCommissionPct: number;
  status: string;
}

export interface AgentPayoutReq {
  amount: number;
  method: string;
  reference: string;
  notes?: string;
}

export interface AgentResolve {
  id: string;
  name: string;
  status: string;
}
