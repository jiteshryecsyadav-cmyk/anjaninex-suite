import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';
import { AgentService, AgentDashboard } from './agent.service';

import { BackButtonComponent } from '../../shared/back-button.component';
@Component({
  selector: 'app-agent-dashboard',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, DecimalPipe, DatePipe],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
    <div class="ag-shell">
      <!-- Minimal header (no firm sidebar) -->
      <header class="ag-header">
        <div class="ag-brand">
          <img src="anjaninex-logo.jpeg" alt="Anjaninex" class="ag-logo">
          <div>
            <div class="ag-title">Agent Portal</div>
            <div class="ag-sub">{{ data()?.name || 'Reseller' }} · Code <strong>{{ data()?.code }}</strong></div>
          </div>
        </div>
        <button (click)="logout()" class="ag-logout">Logout</button>
      </header>

      <main class="ag-main">
        @if (loading()) {
          <div class="ag-card text-center text-gray-500">Loading…</div>
        } @else if (err()) {
          <div class="ag-card text-center text-red-600">{{ err() }}</div>
        } @else {
          @if (data(); as d) {

          <!-- KPI cards -->
          <div class="ag-kpis">
            <div class="ag-card ag-k" style="border-left-color:#16a34a">
              <div class="ag-k-label">Total Earned</div>
              <div class="ag-k-val" style="color:#16a34a">₹{{ d.totalEarned | number:'1.0-0' }}</div>
            </div>
            <div class="ag-card ag-k" style="border-left-color:#ea580c">
              <div class="ag-k-label">Pending Payout</div>
              <div class="ag-k-val" style="color:#ea580c">₹{{ d.pending | number:'1.0-0' }}</div>
            </div>
            <div class="ag-card ag-k" style="border-left-color:#5c1a8b">
              <div class="ag-k-label">Paid Out</div>
              <div class="ag-k-val" style="color:#5c1a8b">₹{{ d.paid | number:'1.0-0' }}</div>
            </div>
            <div class="ag-card ag-k" style="border-left-color:#1B2E5C">
              <div class="ag-k-label">Firms Referred</div>
              <div class="ag-k-val" style="color:#1B2E5C">{{ d.firmsCount }}</div>
            </div>
          </div>

          <!-- Commission rates -->
          <div class="ag-card ag-rates">
            <span>Your rates →</span>
            <span class="ag-pill">Signup: <strong>{{ d.signupCommissionPct | number:'1.0-2' }}%</strong></span>
            <span class="ag-pill">Recharge: <strong>{{ d.rechargeCommissionPct | number:'1.0-2' }}%</strong></span>
            <span class="ag-pill">Wallet: <strong>₹{{ d.walletBalance | number:'1.0-0' }}</strong></span>
          </div>

          <!-- Referred firms -->
          <div class="ag-card ag-p0">
            <div class="ag-card-head">🏢 Referred Firms</div>
            <div class="ag-scroll">
              @if (d.firms.length === 0) {
                <div class="ag-empty">No firms referred yet</div>
              } @else {
                <table class="ag-table">
                  <thead>
                    <tr><th>Firm</th><th class="tc">Status</th><th>Joined</th></tr>
                  </thead>
                  <tbody>
                    @for (f of d.firms; track f.name + f.createdAt) {
                      <tr>
                        <td class="b">{{ f.name }}</td>
                        <td class="tc">
                          <span class="ag-status"
                                [class.ok]="f.status === 'active'"
                                [class.warn]="f.status === 'trial'"
                                [class.bad]="f.status === 'suspended' || f.status === 'churned'">{{ f.status }}</span>
                        </td>
                        <td>{{ f.createdAt | date:'mediumDate' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>

          <!-- Recent commissions -->
          <div class="ag-card ag-p0">
            <div class="ag-card-head">💰 Recent Commissions</div>
            <div class="ag-scroll">
              @if (d.recentCommissions.length === 0) {
                <div class="ag-empty">No commissions yet</div>
              } @else {
                <table class="ag-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Firm</th><th>Kind</th>
                      <th class="tr">Recharge</th><th class="tr">Commission</th><th class="tc">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of d.recentCommissions; track c.firmName + c.createdAt) {
                      <tr>
                        <td>{{ c.createdAt | date:'short' }}</td>
                        <td class="b">{{ c.firmName }}</td>
                        <td class="up">{{ c.kind }}</td>
                        <td class="tr m">₹{{ c.rechargeAmount | number:'1.2-2' }}</td>
                        <td class="tr m g">₹{{ c.commissionAmt | number:'1.2-2' }}</td>
                        <td class="tc">
                          <span class="ag-status"
                                [class.ok]="c.status === 'paid'"
                                [class.warn]="c.status !== 'paid'">{{ c.status }}</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
          }
        }
      </main>
    </div>
  `,
  styles: [`
    :host { display:block; }
    .ag-shell { min-height:100vh; background:#f4f6fb; font-family:inherit; }
    .ag-header { display:flex; align-items:center; justify-content:space-between;
      background:#1B2E5C; color:#fff; padding:14px 22px; }
    .ag-brand { display:flex; align-items:center; gap:12px; }
    .ag-logo { width:42px; height:42px; border-radius:10px; background:#fff; padding:5px; object-fit:contain; }
    .ag-title { font-size:18px; font-weight:900; letter-spacing:-.3px; }
    .ag-sub { font-size:12px; color:rgba(255,255,255,.75); }
    .ag-sub strong { color:#fff; font-family:monospace; }
    .ag-logout { background:rgba(255,255,255,.14); color:#fff; border:0; padding:8px 16px;
      border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; }
    .ag-logout:hover { background:rgba(255,255,255,.24); }

    .ag-main { max-width:1100px; margin:0 auto; padding:20px 16px 40px; }
    .ag-card { background:#fff; border:1px solid #e6eaf2; border-radius:14px; padding:16px;
      box-shadow:0 6px 20px rgba(20,30,60,.05); margin-bottom:16px; }
    .ag-p0 { padding:0; overflow:hidden; }
    .ag-card-head { padding:13px 16px; border-bottom:1px solid #eef0f6; font-weight:800; color:#5c1a8b; background:#f7f0ff; }

    .ag-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
    .ag-k { border-left:4px solid #5c1a8b; }
    .ag-k-label { font-size:11px; text-transform:uppercase; font-weight:800; color:#6b7280; }
    .ag-k-val { font-size:26px; font-weight:900; margin-top:4px; }

    .ag-rates { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:13px; color:#6b7280; }
    .ag-pill { background:#f0e6ff; color:#5c1a8b; padding:5px 12px; border-radius:999px; font-size:12px; }

    .ag-scroll { overflow-x:auto; }
    .ag-table { width:100%; border-collapse:collapse; font-size:13px; }
    .ag-table thead th { text-align:left; font-size:10.5px; text-transform:uppercase; color:#5c1a8b;
      background:#faf5ff; padding:9px 12px; font-weight:800; white-space:nowrap; }
    .ag-table td { padding:9px 12px; border-top:1px solid #eef0f6; white-space:nowrap; }
    .ag-table .b { font-weight:700; }
    .ag-table .m { font-family:monospace; }
    .ag-table .g { color:#16a34a; font-weight:700; }
    .ag-table .up { text-transform:uppercase; font-size:11px; }
    .tc { text-align:center; } .tr { text-align:right; }
    .ag-empty { padding:26px; text-align:center; color:#9ca3af; font-size:13px; }

    .ag-status { font-size:11px; padding:2px 9px; border-radius:6px; text-transform:uppercase; font-weight:700;
      background:#f3f4f6; color:#6b7280; }
    .ag-status.ok { background:#dcfce7; color:#15803d; }
    .ag-status.warn { background:#fef9c3; color:#a16207; }
    .ag-status.bad { background:#fee2e2; color:#b91c1c; }

    @media (max-width:760px) {
      .ag-kpis { grid-template-columns:repeat(2,1fr); }
    }
    @media (max-width:440px) {
      .ag-kpis { grid-template-columns:1fr; }
    }
  `]
})
export class AgentDashboardComponent {
  private svc = inject(AgentService);
  private auth = inject(AuthService);

  data = signal<AgentDashboard | null>(null);
  loading = signal(true);
  err = signal('');

  ngOnInit() {
    this.svc.getDashboard().subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (e) => { this.err.set(e?.error?.error ?? 'Dashboard load nahi hua'); this.loading.set(false); }
    });
  }

  logout() { this.auth.logout(); }
}
