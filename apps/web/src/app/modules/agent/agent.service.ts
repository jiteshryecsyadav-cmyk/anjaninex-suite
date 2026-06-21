import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface AgentFirm {
  name: string;
  status: string;
  createdAt: string;
}

export interface AgentCommissionRow {
  firmName: string;
  kind: string;
  rechargeAmount: number;
  commissionPct: number;
  commissionAmt: number;
  status: string;
  createdAt: string;
}

// Flat shape — matches backend AgentDashboardDto exactly.
export interface AgentDashboard {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  signupCommissionPct: number;
  rechargeCommissionPct: number;
  status: string;
  walletBalance: number;
  firmsCount: number;
  totalEarned: number;
  pending: number;
  paid: number;
  recentCommissions: AgentCommissionRow[];
  firms: AgentFirm[];
}

@Injectable({ providedIn: 'root' })
export class AgentService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/agent/me`;

  getDashboard() { return this.http.get<AgentDashboard>(`${this.base}/dashboard`); }
  getCommissions() { return this.http.get<AgentCommissionRow[]>(`${this.base}/commissions`); }
}
