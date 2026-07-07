import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ReportsService, ExecutiveKpi, DailyPoint } from '../services/reports.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-executive-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📊 Executive Dashboard</h2>
          <p class="text-sm text-[#6b3fa0]">Real-time KPIs across Trading + Accounting</p>
        </div>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/reports/dashboard" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           [routerLinkActiveOptions]="{exact:true}"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
        <a routerLink="/reports/sales-register" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Sales Register</a>
        <a routerLink="/reports/outstanding" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Outstanding</a>
        <a routerLink="/reports/supplier-buyer" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Supplier vs Buyer</a>
        <a routerLink="/reports/party-outstanding" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Aging</a>
        <a routerLink="/reports/top-parties" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Top Parties</a>
        <a routerLink="/reports/top-items" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Top Items</a>
        <a routerLink="/reports/gst" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">GST</a>
        <a routerLink="/reports/payment-mode" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Payment Mode</a>
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-500">Loading dashboard…</div>
      }
      @if (kpi(); as k) {

        <!-- Hero KPI cards -->
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="card border-l-4 border-purple-500" style="border-left:4px solid #16a34a;background:#16a34a0d">
            <div class="text-xs text-gray-500 uppercase font-bold mb-1">Today's Sales</div>
            <div class="text-2xl font-black text-[#5c1a8b]" style="color:#16a34a">₹{{ k.todaysSales | number:'1.2-2' }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ k.billsToday }} bills today</div>
          </div>

          <div class="card border-l-4 border-green-500" style="border-left:4px solid #0d9488;background:#0d94880d">
            <div class="text-xs text-gray-500 uppercase font-bold mb-1">Today's Receipts</div>
            <div class="text-2xl font-black text-green-600" style="color:#0d9488">₹{{ k.todaysReceipts | number:'1.2-2' }}</div>
            <div class="text-xs text-gray-400 mt-1">Cash in today</div>
          </div>

          <div class="card border-l-4 border-orange-500" style="border-left:4px solid #d91e28;background:#d91e280d">
            <div class="text-xs text-gray-500 uppercase font-bold mb-1">Outstanding</div>
            <div class="text-2xl font-black text-orange-600" style="color:#d91e28">₹{{ k.outstandingTotal | number:'1.2-2' }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ k.pendingBillsCount }} pending bills</div>
          </div>

          <div class="card border-l-4 border-blue-500" style="border-left:4px solid #16a34a;background:#16a34a0d">
            <div class="text-xs text-gray-500 uppercase font-bold mb-1">MTD Profit</div>
            <div class="text-2xl font-black"
                 [class.text-green-700]="k.mtdProfit >= 0"
                 [class.text-red-700]="k.mtdProfit < 0"
                 style="color:#16a34a">
              ₹{{ (k.mtdProfit < 0 ? -k.mtdProfit : k.mtdProfit) | number:'1.2-2' }}
            </div>
            <div class="text-xs text-gray-400 mt-1">{{ k.mtdProfit >= 0 ? 'Profit' : 'Loss' }} this month</div>
          </div>
        </div>

        <!-- Secondary KPIs -->
        <div class="grid grid-cols-4 gap-3 mb-6">
          <div class="card text-center" style="border-left:4px solid #d97706;background:#d977060d">
            <div class="text-2xl mb-1">💵</div>
            <div class="text-lg font-bold font-mono" style="color:#d97706">₹{{ k.cashInHand | number:'1.2-2' }}</div>
            <div class="text-xs text-gray-500">Cash in Hand</div>
          </div>
          <div class="card text-center" style="border-left:4px solid #0284c7;background:#0284c70d">
            <div class="text-2xl mb-1">🏦</div>
            <div class="text-lg font-bold font-mono" style="color:#0284c7">₹{{ k.bankBalance | number:'1.2-2' }}</div>
            <div class="text-xs text-gray-500">Bank Balance</div>
          </div>
          <div class="card text-center" style="border-left:4px solid #9333ea;background:#9333ea0d">
            <div class="text-2xl mb-1">📈</div>
            <div class="text-lg font-bold font-mono" style="color:#9333ea">₹{{ k.mtdSales | number:'1.2-2' }}</div>
            <div class="text-xs text-gray-500">MTD Sales</div>
          </div>
          <div class="card text-center" style="border-left:4px solid #1B2E5C;background:#1B2E5C0d">
            <div class="text-2xl mb-1">📥</div>
            <div class="text-lg font-bold font-mono" style="color:#1B2E5C">₹{{ k.mtdReceipts | number:'1.2-2' }}</div>
            <div class="text-xs text-gray-500">MTD Receipts</div>
          </div>
        </div>

        <!-- Daily Sales Trend (last 30 days) -->
        <div class="card mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-display font-bold text-lg text-[#5c1a8b]">📈 Last 30 Days — Sales vs Receipts</h3>
            <div class="text-xs text-gray-500">
              <span class="inline-block w-3 h-3 bg-purple-500 rounded mr-1"></span> Sales
              <span class="inline-block w-3 h-3 bg-green-500 rounded mr-1 ml-3"></span> Receipts
            </div>
          </div>

          @if (trend().length > 0) {
            <div class="flex items-end gap-1 h-48 border-b border-l border-gray-200 pl-2 pb-1">
              @for (d of trend(); track d.day) {
                <div class="flex-1 flex flex-col items-stretch justify-end gap-px relative group">
                  @if (d.sales > 0 || d.receipts > 0) {
                    <div class="bg-purple-500 hover:bg-purple-700 transition cursor-pointer rounded-t"
                         [style.height.%]="(d.sales / maxBar()) * 100"
                         [title]="d.day + ' — Sales ₹' + d.sales"></div>
                    <div class="bg-green-500 hover:bg-green-700 transition cursor-pointer rounded-t"
                         [style.height.%]="(d.receipts / maxBar()) * 100"
                         [title]="d.day + ' — Receipts ₹' + d.receipts"></div>
                  }
                </div>
              }
            </div>
            <div class="flex justify-between text-xs text-gray-400 mt-1 px-2">
              <span>{{ trend()[0]?.day | slice:5 }}</span>
              @if (trend().length > 15) {
                <span>{{ trend()[15]?.day | slice:5 }}</span>
              }
              <span>{{ trend()[trend().length - 1]?.day | slice:5 }}</span>
            </div>
          } @else {
            <div class="text-center py-12 text-gray-400">No data yet — add bills and payments to see trend</div>
          }
        </div>

        <!-- Quick links -->
        <div class="grid grid-cols-4 gap-3">
          <a routerLink="/reports/sales-register"
             class="card hover:bg-[#f0e6ff] transition cursor-pointer block no-underline text-[#2d1040]">
            <div class="text-2xl mb-2">📋</div>
            <div class="font-bold text-sm">Sales Register</div>
            <div class="text-xs text-gray-500">All bills detailed</div>
          </a>
          <a routerLink="/reports/party-outstanding"
             class="card hover:bg-[#f0e6ff] transition cursor-pointer block no-underline text-[#2d1040]">
            <div class="text-2xl mb-2">⏱️</div>
            <div class="font-bold text-sm">Aging Analysis</div>
            <div class="text-xs text-gray-500">Outstanding by party + days</div>
          </a>
          <a routerLink="/reports/top-parties"
             class="card hover:bg-[#f0e6ff] transition cursor-pointer block no-underline text-[#2d1040]">
            <div class="text-2xl mb-2">🏆</div>
            <div class="font-bold text-sm">Top Customers</div>
            <div class="text-xs text-gray-500">Best buyers ranked</div>
          </a>
          <a routerLink="/reports/gst"
             class="card hover:bg-[#f0e6ff] transition cursor-pointer block no-underline text-[#2d1040]">
            <div class="text-2xl mb-2">🧾</div>
            <div class="font-bold text-sm">GST Summary</div>
            <div class="text-xs text-gray-500">For GSTR-1 filing</div>
          </a>
        </div>
      }
    </div>
  `
})
export class ExecutiveDashboardComponent {
  private svc = inject(ReportsService);
  kpi = signal<ExecutiveKpi | null>(null);
  trend = signal<DailyPoint[]>([]);
  loading = signal(true);

  maxBar = () => Math.max(1, ...this.trend().flatMap(d => [d.sales, d.receipts]));

  ngOnInit() {
    this.svc.kpi().subscribe({
      next: (k) => { this.kpi.set(k); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.svc.dailySalesTrend(30).subscribe(t => this.trend.set(t));
  }
}
