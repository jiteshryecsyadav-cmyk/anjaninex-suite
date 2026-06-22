import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AdminService, AnjaninexKpi, RevenuePoint, TopFirm, LowBalanceFirm, TurnoverInfo } from '../services/admin.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-anjaninex-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <!-- Header with Anjaninex branding -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <img src="anjaninex-logo.jpeg" alt="Anjaninex" width="56" height="56" class="object-contain">
          <div>
            <h2 class="font-display font-black text-2xl text-anjaninex-navy">Anjaninex Admin Portal</h2>
            <p class="text-sm text-anjaninex-navy/70">Platform-wide overview · Super Admin only</p>
          </div>
        </div>
        <span class="text-xs font-bold bg-red-100 text-red-700 px-3 py-1 rounded-full">🔒 SUPER ADMIN</span>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/admin/dashboard" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           [routerLinkActiveOptions]="{exact:true}"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
        <a routerLink="/admin/firms" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🏢 Firms</a>
        <a routerLink="/admin/plans" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💼 Plans</a>
        <a routerLink="/admin/agents" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">👥 Agents</a>
        <a routerLink="/admin/roi" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 ROI / Profit</a>
        <a routerLink="/admin/ai-monitor" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🤖 AI Monitor</a>
        <a routerLink="/admin/ai-keys" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🔑 AI Keys</a>
        <a routerLink="/admin/changelog" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📝 Changelog</a>
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-500">Loading platform metrics…</div>
      }
      @if (kpi(); as k) {

        <!-- Hero KPI cards -->
        <div class="grid grid-cols-4 gap-4 mb-4">
          <div class="card border-l-4 border-purple-600">
            <div class="text-xs uppercase font-bold text-gray-500">MRR (Monthly Recurring)</div>
            <div class="text-2xl font-black text-[#5c1a8b]">₹{{ k.mrrInr | number:'1.0-0' }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ k.activeFirms }} active firms</div>
          </div>

          <div class="card border-l-4 border-green-600">
            <div class="text-xs uppercase font-bold text-gray-500">MTD Revenue</div>
            <div class="text-2xl font-black text-green-700">₹{{ k.mtdRevenue | number:'1.0-0' }}</div>
            <div class="text-xs text-gray-400 mt-1">
              Margin: ₹{{ k.mtdMargin | number:'1.0-0' }} ({{ k.mtdRevenue > 0 ? ((k.mtdMargin / k.mtdRevenue) * 100).toFixed(0) : 0 }}%)
            </div>
          </div>

          <div class="card border-l-4 border-blue-600">
            <div class="text-xs uppercase font-bold text-gray-500">Total Firms</div>
            <div class="text-2xl font-black text-blue-700">{{ k.totalFirms }}</div>
            <div class="text-xs text-gray-400 mt-1">+{{ k.newFirmsThisMonth }} this month</div>
          </div>

          <div class="card border-l-4 border-orange-600">
            <div class="text-xs uppercase font-bold text-gray-500">Today's Revenue</div>
            <div class="text-2xl font-black text-orange-700">₹{{ k.todayRevenue | number:'1.0-0' }}</div>
            <div class="text-xs text-gray-400 mt-1">In last 24 hours</div>
          </div>
        </div>

        <!-- FY Turnover + GST threshold (20 lakh) -->
        @if (turnover(); as t) {
          <div class="card mb-4 border-l-4" [class.border-green-600]="!t.gstApplicable" [class.border-red-600]="t.gstApplicable">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div class="text-xs uppercase font-bold text-gray-500">{{ t.fyLabel }} Turnover (approved payments)</div>
                <div class="text-2xl font-black text-[#5c1a8b]">₹{{ t.turnover | number:'1.0-0' }}
                  <span class="text-sm font-semibold text-gray-400">/ ₹{{ t.threshold | number:'1.0-0' }}</span>
                </div>
              </div>
              <div class="text-right">
                @if (t.gstApplicable) {
                  <span class="text-xs px-3 py-1 rounded-full font-bold bg-red-100 text-red-700">⚠️ 20L cross — 18% GST LAGEGA</span>
                  <div class="text-xs text-gray-500 mt-1">GST collected: ₹{{ t.gstCollected | number:'1.0-0' }}</div>
                } @else {
                  <span class="text-xs px-3 py-1 rounded-full font-bold bg-green-100 text-green-700">✓ GST exempt (20L se neeche)</span>
                  <div class="text-xs text-gray-500 mt-1">₹{{ (t.threshold - t.turnover) | number:'1.0-0' }} aur baki threshold tak</div>
                }
              </div>
            </div>
            <div class="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-2 rounded-full" [class.bg-green-500]="!t.gstApplicable" [class.bg-red-500]="t.gstApplicable"
                   [style.width.%]="Math.min(100, (t.turnover / t.threshold) * 100)"></div>
            </div>
          </div>
        }

        <!-- Secondary KPIs -->
        <div class="grid grid-cols-5 gap-3 mb-6">
          <div class="card text-center">
            <div class="text-xl mb-1">✅</div>
            <div class="text-lg font-bold text-green-600">{{ k.activeFirms }}</div>
            <div class="text-[10px] text-gray-500 uppercase">Active</div>
          </div>
          <div class="card text-center">
            <div class="text-xl mb-1">🆓</div>
            <div class="text-lg font-bold text-yellow-600">{{ k.trialFirms }}</div>
            <div class="text-[10px] text-gray-500 uppercase">Trial</div>
          </div>
          <div class="card text-center">
            <div class="text-xl mb-1">⏸️</div>
            <div class="text-lg font-bold text-red-600">{{ k.suspendedFirms }}</div>
            <div class="text-[10px] text-gray-500 uppercase">Suspended</div>
          </div>
          <div class="card text-center">
            <div class="text-xl mb-1">💰</div>
            <div class="text-lg font-bold font-mono">₹{{ k.totalWalletBalance | number:'1.0-0' }}</div>
            <div class="text-[10px] text-gray-500 uppercase">Total Wallets</div>
          </div>
          <div class="card text-center">
            <div class="text-xl mb-1">🤖</div>
            <div class="text-lg font-bold">{{ k.aiCallsToday }}</div>
            <div class="text-[10px] text-gray-500 uppercase">AI Today</div>
          </div>
        </div>

        <!-- Revenue chart -->
        <div class="card mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-display font-bold text-lg text-[#5c1a8b]">📈 Last 30 Days — Revenue vs Margin</h3>
            <div class="text-xs text-gray-500">
              <span class="inline-block w-3 h-3 bg-purple-500 rounded mr-1"></span> Gross
              <span class="inline-block w-3 h-3 bg-green-500 rounded mr-1 ml-3"></span> Margin
            </div>
          </div>
          @if (trend().length > 0) {
            <div class="flex items-end gap-1 h-44 border-b border-l border-gray-200 pl-2 pb-1">
              @for (d of trend(); track d.day) {
                <div class="flex-1 flex flex-col items-stretch justify-end gap-px">
                  @if (d.gross > 0) {
                    <div class="bg-purple-500 hover:bg-purple-700 rounded-t cursor-pointer"
                         [style.height.%]="(d.gross / maxBar()) * 100"
                         [title]="d.day + ' — Gross ₹' + d.gross"></div>
                    <div class="bg-green-500 hover:bg-green-700 rounded-t cursor-pointer"
                         [style.height.%]="(d.margin / maxBar()) * 100"
                         [title]="d.day + ' — Margin ₹' + d.margin"></div>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="text-center py-12 text-gray-400">No revenue yet</div>
          }
        </div>

        <!-- Top firms + Low balance alerts -->
        <div class="grid grid-cols-2 gap-4">
          <div class="card p-0 overflow-hidden">
            <div class="bg-green-50 px-4 py-3 border-b border-green-200">
              <h3 class="font-display font-bold text-green-700">🏆 Top Firms by Revenue (MTD)</h3>
            </div>
            @if (topFirms().length === 0) {
              <div class="p-6 text-center text-gray-400">No revenue yet</div>
            } @else {
              <table class="w-full text-sm">
                @for (f of topFirms(); track f.firmId; let i = $index) {
                  <tr class="border-t">
                    <td class="px-3 py-2 w-8 text-center font-bold">
                      @if (i === 0) { 🥇 } @else if (i === 1) { 🥈 } @else if (i === 2) { 🥉 } @else { #{{ i + 1 }} }
                    </td>
                    <td class="px-3 py-2">
                      <a [routerLink]="['/admin/firms', f.firmId]" class="font-semibold text-[#5c1a8b] hover:underline">
                        {{ f.name }}
                      </a>
                      <div class="text-xs text-gray-500">{{ f.planCode }}</div>
                    </td>
                    <td class="px-3 py-2 text-right font-mono font-bold">₹{{ f.revenue | number:'1.0-0' }}</td>
                  </tr>
                }
              </table>
            }
          </div>

          <div class="card p-0 overflow-hidden">
            <div class="bg-red-50 px-4 py-3 border-b border-red-200">
              <h3 class="font-display font-bold text-red-700">⚠️ Low Wallet Balance Alerts</h3>
            </div>
            @if (lowBalance().length === 0) {
              <div class="p-6 text-center text-gray-400">All firms have healthy balance ✓</div>
            } @else {
              <table class="w-full text-sm">
                @for (f of lowBalance(); track f.firmId) {
                  <tr class="border-t">
                    <td class="px-3 py-2">
                      <a [routerLink]="['/admin/firms', f.firmId]" class="font-semibold text-[#5c1a8b] hover:underline">
                        {{ f.name }}
                      </a>
                      @if (f.lastDailySpend > 0) {
                        <div class="text-xs text-gray-500">~₹{{ f.lastDailySpend | number:'1.0-0' }} daily spend</div>
                      }
                    </td>
                    <td class="px-3 py-2 text-right font-mono font-bold text-red-600">
                      ₹{{ f.balance | number:'1.2-2' }}
                    </td>
                  </tr>
                }
              </table>
            }
          </div>
        </div>

        <!-- AI Summary -->
        <div class="card mt-6 bg-gradient-to-r from-purple-50 to-orange-50 border-purple-200">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-display font-bold text-lg text-[#5c1a8b]">🤖 AI Today</h3>
              <p class="text-sm text-gray-600 mt-1">
                <strong>{{ k.aiCallsToday }}</strong> extractions ·
                Revenue <strong class="text-green-600">₹{{ k.aiRevenueToday | number:'1.2-2' }}</strong> ·
                Cost <strong class="text-red-600">₹{{ k.aiCostToday | number:'1.2-2' }}</strong> ·
                Margin <strong class="text-blue-600">₹{{ (k.aiRevenueToday - k.aiCostToday) | number:'1.2-2' }}</strong>
              </p>
            </div>
            <a routerLink="/admin/ai-monitor" class="text-sm text-[#5c1a8b] hover:underline font-semibold">View Details →</a>
          </div>
        </div>
      }
    </div>
  `
})
export class AnjaninexDashboardComponent {
  private svc = inject(AdminService);
  kpi = signal<AnjaninexKpi | null>(null);
  trend = signal<RevenuePoint[]>([]);
  topFirms = signal<TopFirm[]>([]);
  lowBalance = signal<LowBalanceFirm[]>([]);
  turnover = signal<TurnoverInfo | null>(null);
  loading = signal(true);
  Math = Math;   // template me Math.min ke liye

  maxBar = () => Math.max(1, ...this.trend().map(d => d.gross));

  ngOnInit() {
    this.svc.kpi().subscribe({
      next: (k) => { this.kpi.set(k); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.svc.dailyRevenue(30).subscribe(t => this.trend.set(t));
    this.svc.topFirms(5).subscribe(t => this.topFirms.set(t));
    this.svc.lowBalance().subscribe(l => this.lowBalance.set(l));
    this.svc.getTurnover().subscribe({ next: t => this.turnover.set(t), error: () => {} });
  }
}
