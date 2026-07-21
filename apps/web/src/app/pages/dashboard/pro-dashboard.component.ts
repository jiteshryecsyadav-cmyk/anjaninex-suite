import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { FeatureService } from '../../shared/feature.service';
import { environment } from '../../../environments/environment';
import { InDatePipe } from '../../shared/in-date.pipe';

type TabKey = 'sales' | 'payments' | 'operations' | 'parties';
type PeriodKey = 'week' | 'month' | 'quarter' | 'year';

interface DonutSeg { label: string; color: string; value: number; pct: number; dash: string; off: number; }

@Component({
  selector: 'app-pro-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DecimalPipe, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">

      <!-- ============ HEADER ============ -->
      <div class="pd-header">
        <div class="ph-left">
          <span class="ph-bolt">⚡</span>
          <div>
            <h1 class="ph-title">{{ features.firmName() || 'Dashboard' }}</h1>
            <p class="ph-sub">Pro Dashboard · {{ fyLabel() }} · Welcome back, {{ auth.user()?.fullName?.split(' ')?.[0] || 'User' }}</p>
          </div>
        </div>
        <div class="ph-right">
          <span class="ph-date">{{ today() }}</span>
          <button class="ph-bell" (click)="alertsOpen = !alertsOpen" [class.has-new]="newAlerts() > 0">
            🔔
            @if (newAlerts() > 0) {
              <span class="bell-badge">{{ newAlerts() }}</span>
            }
          </button>
        </div>
      </div>

      <!-- ============ TAB STRIP ============ -->
      <div class="tab-bar">
        <div class="tab-strip">
          <button (click)="tab.set('sales')" [class.tab-active]="tab() === 'sales'" class="tab-btn">📊 Sales</button>
          <button (click)="tab.set('payments')" [class.tab-active]="tab() === 'payments'" class="tab-btn">🪙 Payments</button>
          <button (click)="tab.set('operations')" [class.tab-active]="tab() === 'operations'" class="tab-btn">⚙️ Operations</button>
          <button (click)="tab.set('parties')" [class.tab-active]="tab() === 'parties'" class="tab-btn">👥 Parties</button>
        </div>
      </div>

      <!-- ============ FILTERS (real — data reload karte hain) ============ -->
      <div class="filter-row">
        <div class="period-tabs">
          <button (click)="setPeriod('week')" [class.pt-active]="period() === 'week'" class="pt-btn">This Week</button>
          <button (click)="setPeriod('month')" [class.pt-active]="period() === 'month'" class="pt-btn">This Month</button>
          <button (click)="setPeriod('quarter')" [class.pt-active]="period() === 'quarter'" class="pt-btn">Quarter</button>
          <button (click)="setPeriod('year')" [class.pt-active]="period() === 'year'" class="pt-btn">Full Year</button>
        </div>
        <select [(ngModel)]="branch" (ngModelChange)="loadDash()" class="branch-select">
          <option value="">📍 All Branches</option>
          @for (b of branchList(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </div>

      <!-- ============ TOP 4 KPI CARDS (REAL) ============ -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-1">
          <div class="kpi-top">
            <span class="kpi-ico">📦</span>
            <span class="kpi-delta delta-up">{{ deltaTxt(kpiSales().delta) }}</span>
          </div>
          <div class="kpi-value">₹{{ kpiSales().value }}L</div>
          <div class="kpi-label">TOTAL SALES</div>
          <svg class="kpi-spark" viewBox="0 0 100 30">
            <polyline [attr.points]="sparkPoints(sparkSales)" fill="none" stroke="#1B2E5C" stroke-width="2"/>
            <polygon [attr.points]="sparkPoints(sparkSales) + ' 100,30 0,30'" fill="#1B2E5C" opacity="0.1"/>
          </svg>
        </div>

        <div class="kpi-card kpi-2">
          <div class="kpi-top">
            <span class="kpi-ico">💎</span>
            <span class="kpi-delta delta-up">{{ deltaTxt(kpiComm().delta) }}</span>
          </div>
          <div class="kpi-value">{{ kpiComm().value }}</div>
          <div class="kpi-label">COMMISSION</div>
          <svg class="kpi-spark" viewBox="0 0 100 30">
            <polyline [attr.points]="sparkPoints(sparkComm)" fill="none" stroke="#F97316" stroke-width="2"/>
            <polygon [attr.points]="sparkPoints(sparkComm) + ' 100,30 0,30'" fill="#F97316" opacity="0.1"/>
          </svg>
        </div>

        <div class="kpi-card kpi-3">
          <div class="kpi-top">
            <span class="kpi-ico">✅</span>
            <span class="kpi-delta delta-pending">₹{{ kpiReceived().pending }}L pending</span>
          </div>
          <div class="kpi-value">₹{{ kpiReceived().value }}L</div>
          <div class="kpi-label">RECEIVED</div>
          <svg class="kpi-spark" viewBox="0 0 100 30">
            <polyline [attr.points]="sparkPoints(sparkReceived)" fill="none" stroke="#10B981" stroke-width="2"/>
            <polygon [attr.points]="sparkPoints(sparkReceived) + ' 100,30 0,30'" fill="#10B981" opacity="0.1"/>
          </svg>
        </div>

        <div class="kpi-card kpi-4">
          <div class="kpi-top">
            <span class="kpi-ico">↩️</span>
            <span class="kpi-delta delta-warn">↑ {{ kpiGr().new }} new</span>
          </div>
          <div class="kpi-value">₹{{ kpiGr().value }}L</div>
          <div class="kpi-label">GR RETURNS</div>
          <svg class="kpi-spark" viewBox="0 0 100 30">
            <polyline [attr.points]="sparkPoints(sparkGr)" fill="none" stroke="#DC2626" stroke-width="2"/>
            <polygon [attr.points]="sparkPoints(sparkGr) + ' 100,30 0,30'" fill="#DC2626" opacity="0.1"/>
          </svg>
        </div>
      </div>

      <!-- ============ INSIGHT BANNER (real alerts se) ============ -->
      @if (!insightDismissed() && aiInsight()) {
        <div class="ai-banner">
          <span class="ai-ico">🤖</span>
          <div class="ai-content">
            <strong>Insight:</strong> {{ aiInsight() }}
            <a routerLink="/reports" class="ai-link">View detailed analysis →</a>
          </div>
          <button class="ai-dismiss" (click)="dismissInsight()">✕</button>
        </div>
      }

      <!-- ============ TAB CONTENT: SALES ============ -->
      @if (tab() === 'sales') {
        <div class="grid grid-cols-3 gap-4 mt-4">

          <!-- Monthly Sales Trend (2/3) — REAL -->
          <div class="widget col-span-2 w-navy">
            <div class="widget-head">
              <div>
                <h3>📈 MONTHLY SALES TREND</h3>
                <p class="widget-sub">Sale / Commission / GR toggle</p>
              </div>
              <div class="seg-toggle">
                <button [class.seg-active]="trendMode === 'sale'" (click)="trendMode = 'sale'">Sale</button>
                <button [class.seg-active]="trendMode === 'comm'" (click)="trendMode = 'comm'">Comm</button>
                <button [class.seg-active]="trendMode === 'gr'" (click)="trendMode = 'gr'">GR</button>
              </div>
            </div>
            <div class="trend-summary">
              <span class="trend-big">₹{{ trendTotal() }}L</span>
              <span class="trend-sub">Total {{ trendMode === 'sale' ? 'Sales' : trendMode === 'comm' ? 'Commission' : 'Returns' }} {{ fyLabel() }}</span>
            </div>
            <svg viewBox="0 0 600 200" class="chart-svg">
              <defs>
                <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#1B2E5C" stop-opacity="0.28"/>
                  <stop offset="100%" stop-color="#1B2E5C" stop-opacity="0.02"/>
                </linearGradient>
              </defs>
              <line x1="40" y1="20" x2="600" y2="20" stroke="#F5EFE3" stroke-width="1"/>
              <line x1="40" y1="60" x2="600" y2="60" stroke="#F5EFE3" stroke-width="1"/>
              <line x1="40" y1="100" x2="600" y2="100" stroke="#F5EFE3" stroke-width="1"/>
              <line x1="40" y1="140" x2="600" y2="140" stroke="#F5EFE3" stroke-width="1"/>
              <text x="5" y="25" class="ax-lbl">{{ axLbl(1) }}</text>
              <text x="5" y="65" class="ax-lbl">{{ axLbl(0.714) }}</text>
              <text x="5" y="105" class="ax-lbl">{{ axLbl(0.429) }}</text>
              <text x="5" y="145" class="ax-lbl">{{ axLbl(0.143) }}</text>
              <text x="15" y="170" class="ax-lbl">0</text>
              @for (p of trendPoints(); track p.label; let i = $index) {
                <rect [attr.x]="40 + i * 47 - 13" [attr.y]="160 - p.value * 1.4" width="26"
                      [attr.height]="p.value * 1.4" rx="3" fill="#1B2E5C" opacity="0.88"/>
                <text [attr.x]="40 + i * 47" y="185" class="ax-lbl" text-anchor="middle">{{ p.label }}</text>
              }
            </svg>
            <div class="trend-stats">
              <div><span class="stat-l">BEST MONTH</span><strong class="text-navy">{{ bestMonth() }}</strong></div>
              <div><span class="stat-l">PEAK</span><strong class="text-orange">{{ peakL() }}</strong></div>
              <div><span class="stat-l">THIS MONTH</span><strong class="text-green-600">{{ thisMonthL() }}</strong></div>
            </div>
          </div>

          <!-- Segment Mix donut (1/3) — REAL (item category se) -->
          <div class="widget w-purple">
            <div class="widget-head">
              <div>
                <h3>🎨 SEGMENT MIX</h3>
                <p class="widget-sub">Description-wise sales</p>
              </div>
            </div>
            @if (segMix().length) {
              <svg viewBox="0 0 200 200" class="chart-svg-donut">
                <circle cx="100" cy="100" r="70" fill="none" stroke="#F5EFE3" stroke-width="22"/>
                @for (s of segMix(); track s.label) {
                  <circle cx="100" cy="100" r="70" fill="none" [attr.stroke]="s.color" stroke-width="22"
                          [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 100 100)"/>
                }
                <text x="100" y="95" text-anchor="middle" class="donut-big">{{ money(segTotal()) }}</text>
                <text x="100" y="115" text-anchor="middle" class="donut-sub">Total Sales</text>
              </svg>
              <div class="legend-rows">
                @for (s of segMix(); track s.label) {
                  <div><span class="lg-dot" [style.background]="s.color"></span> {{ s.label }} {{ s.pct }}% — {{ money(s.value) }}</div>
                }
              </div>
            } @else {
              <div class="empty-state">Abhi data nahi — sales bill bante hi yahan dikhega</div>
            }
          </div>

          <!-- Branch-wise Sales — REAL -->
          <div class="widget w-blue">
            <div class="widget-head">
              <div>
                <h3>🏢 BRANCH-WISE SALES</h3>
                <p class="widget-sub">Sales vs Received</p>
              </div>
            </div>
            @if (branchData.length) {
              <svg viewBox="0 0 400 200" class="chart-svg">
                <text x="5" y="25" class="ax-lbl">{{ branchAx(1) }}</text>
                <text x="5" y="65" class="ax-lbl">{{ branchAx(0.72) }}</text>
                <text x="5" y="105" class="ax-lbl">{{ branchAx(0.45) }}</text>
                <text x="5" y="145" class="ax-lbl">{{ branchAx(0.17) }}</text>
                <text x="15" y="175" class="ax-lbl">0</text>
                @for (b of branchData; track b.name; let i = $index) {
                  <g [attr.transform]="'translate(' + (40 + i * 90) + ', 0)'">
                    <rect [attr.x]="0" [attr.y]="170 - b.sales" [attr.width]="28" [attr.height]="b.sales" fill="#5c1a8b" rx="2"/>
                    <rect [attr.x]="34" [attr.y]="170 - b.received" [attr.width]="28" [attr.height]="b.received" fill="#10B981" rx="2"/>
                    <text x="31" y="190" class="ax-lbl" text-anchor="middle">{{ b.name }}</text>
                  </g>
                }
              </svg>
              <div class="legend-rows" style="flex-direction:row; gap:14px">
                <span><span class="lg-dot" style="background:#5c1a8b"></span> Sales (L)</span>
                <span><span class="lg-dot" style="background:#10B981"></span> Received (L)</span>
              </div>
            } @else {
              <div class="empty-state">Abhi data nahi — bills/payments aate hi yahan dikhega</div>
            }
          </div>

          <!-- Order Status donut — REAL -->
          <div class="widget w-green">
            <div class="widget-head">
              <div>
                <h3>📋 ORDER STATUS</h3>
                <p class="widget-sub">Billed / Pending / Cancelled</p>
              </div>
            </div>
            @if (orderStatusSegs().length) {
              <svg viewBox="0 0 200 200" class="chart-svg-donut">
                <circle cx="100" cy="100" r="70" fill="none" stroke="#F5EFE3" stroke-width="22"/>
                @for (s of orderStatusSegs(); track s.label) {
                  <circle cx="100" cy="100" r="70" fill="none" [attr.stroke]="s.color" stroke-width="22"
                          [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 100 100)"/>
                }
                <text x="100" y="95" text-anchor="middle" class="donut-big">{{ billedPct() }}%</text>
                <text x="100" y="115" text-anchor="middle" class="donut-sub">Billed</text>
              </svg>
              <div class="legend-rows">
                @for (s of orderStatusSegs(); track s.label) {
                  <div><span class="lg-dot" [style.background]="s.color"></span> {{ s.label }} {{ s.pct }}% ({{ s.value }})</div>
                }
              </div>
            } @else {
              <div class="empty-state">Is period me koi order nahi</div>
            }
          </div>

          <!-- Trending Items full width — REAL -->
          <div class="widget col-span-3 w-red">
            <div class="widget-head">
              <div>
                <h3>🔥 TRENDING ITEMS / FABRICS</h3>
                <p class="widget-sub">Most ordered this period</p>
              </div>
              <a routerLink="/trading/items" class="full-list">Full List →</a>
            </div>
            @if (topItems().length) {
              <table class="trend-table">
                <thead>
                  <tr><th class="w-8">#</th><th>ITEM</th><th>CATEGORY</th><th class="text-right">ORDERS</th><th class="text-right">BUYERS</th><th class="text-right">QTY</th><th class="text-right">AMOUNT</th><th>SHARE</th></tr>
                </thead>
                <tbody>
                  @for (t of topItems(); track t.item; let i = $index) {
                    <tr>
                      <td><span class="rank-badge">{{ i + 1 }}</span></td>
                      <td><strong>{{ t.item }}</strong></td>
                      <td><span class="seg-tag seg-fabric">{{ t.category }}</span></td>
                      <td class="text-right font-mono">{{ t.orders }}</td>
                      <td class="text-right font-mono">{{ t.buyers }}</td>
                      <td class="text-right font-mono">{{ t.qty | number:'1.0-0' }}</td>
                      <td class="text-right font-mono">{{ money(t.amount) }}</td>
                      <td>
                        <div class="share-bar"><div class="share-fill" [style.width.%]="t.fill" [style.background]="t.color"></div></div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <div class="empty-state">Is period me koi order nahi — orders entry karte hi trending items yahan dikhenge</div>
            }
          </div>

        </div>
      }

      <!-- ============ TAB CONTENT: PAYMENTS ============ -->
      @if (tab() === 'payments') {
        <div class="grid grid-cols-3 gap-4 mt-4">

          <!-- Receipts by Mode — REAL -->
          <div class="widget w-teal">
            <div class="widget-head">
              <div>
                <h3>🪙 RECEIPTS BY MODE</h3>
                <p class="widget-sub">Cash / Bank / UPI…</p>
              </div>
            </div>
            @if (payModeSegs().length) {
              <svg viewBox="0 0 200 200" class="chart-svg-donut">
                <circle cx="100" cy="100" r="70" fill="none" stroke="#F5EFE3" stroke-width="22"/>
                @for (s of payModeSegs(); track s.label) {
                  <circle cx="100" cy="100" r="70" fill="none" [attr.stroke]="s.color" stroke-width="22"
                          [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 100 100)"/>
                }
                <text x="100" y="95" text-anchor="middle" class="donut-big">{{ money(payModeTotal()) }}</text>
                <text x="100" y="115" text-anchor="middle" class="donut-sub">Received</text>
              </svg>
              <div class="legend-rows">
                @for (s of payModeSegs(); track s.label) {
                  <div><span class="lg-dot" [style.background]="s.color"></span> {{ s.label | titlecase }} {{ s.pct }}% — {{ money(s.value) }}</div>
                }
              </div>
            } @else {
              <div class="empty-state">Is period me koi receipt nahi</div>
            }
          </div>

          <!-- Monthly Commission Bars — REAL (FY trend se) -->
          <div class="widget w-orange">
            <div class="widget-head">
              <div>
                <h3>💎 MONTHLY COMMISSION</h3>
                <p class="widget-sub">{{ fyLabel() }} earned</p>
              </div>
            </div>
            @if (commMax() > 0) {
              <svg viewBox="0 0 360 180" class="chart-svg">
                <text x="2" y="20" class="ax-lbl">{{ money(commMax()) }}</text>
                <text x="2" y="90" class="ax-lbl">{{ money(commMax() / 2) }}</text>
                <text x="10" y="160" class="ax-lbl">0</text>
                @for (m of commBars(); track m.label; let i = $index) {
                  <g [attr.transform]="'translate(' + (38 + i * 27) + ', 0)'">
                    <rect [attr.x]="0" [attr.y]="150 - m.h" [attr.width]="20" [attr.height]="m.h" fill="#F97316" rx="3"/>
                    @if (i % 2 === 0) {
                      <text x="10" y="170" class="ax-lbl" text-anchor="middle">{{ m.label }}</text>
                    }
                  </g>
                }
              </svg>
            } @else {
              <div class="empty-state">Abhi commission data nahi</div>
            }
          </div>

          <!-- Bill Aging — REAL -->
          <div class="widget w-amber">
            <div class="widget-head">
              <div>
                <h3>📅 BILL AGING</h3>
                <p class="widget-sub">Outstanding by days</p>
              </div>
            </div>
            @if (agingMax() > 0) {
              <svg viewBox="0 0 320 180" class="chart-svg">
                <text x="2" y="20" class="ax-lbl">{{ money(agingMax()) }}</text>
                <text x="2" y="90" class="ax-lbl">{{ money(agingMax() / 2) }}</text>
                <text x="10" y="160" class="ax-lbl">0</text>
                @for (a of agingBars(); track a.label; let i = $index) {
                  <g [attr.transform]="'translate(' + (40 + i * 70) + ', 0)'">
                    <rect [attr.x]="0" [attr.y]="150 - a.h" [attr.width]="52" [attr.height]="a.h" [attr.fill]="a.color" rx="3"/>
                    <text x="26" y="170" class="ax-lbl" text-anchor="middle">{{ a.label }}</text>
                  </g>
                }
              </svg>
            } @else {
              <div class="empty-state">Koi outstanding bill nahi 🎉</div>
            }
          </div>

          <!-- Outstanding Bills — REAL -->
          <div class="widget col-span-3 w-red">
            <div class="widget-head">
              <div>
                <h3>📒 OUTSTANDING BILLS</h3>
                <p class="widget-sub">Overdue aur upcoming</p>
              </div>
              <a routerLink="/trading/bills" class="full-list">View Bills →</a>
            </div>
            @if (outstandingRows().length) {
              <table class="trend-table">
                <thead>
                  <tr><th>BILL NO</th><th>BUYER</th><th class="text-right">BALANCE</th><th>STATUS</th><th>DUE</th></tr>
                </thead>
                <tbody>
                  @for (o of outstandingRows(); track o.billNo) {
                    <tr>
                      <td class="font-mono text-xs font-bold">{{ o.billNo }}</td>
                      <td><strong>{{ o.buyer }}</strong></td>
                      <td class="text-right font-mono">₹{{ o.amount | number:'1.2-2' }}</td>
                      <td>
                        @if (o.status === 'overdue') { <span class="aging-tag aging-overdue">⚠️ {{ o.days }}d overdue</span> }
                        @else if (o.status === 'soon') { <span class="aging-tag aging-soon">🟡 {{ o.days }}d baki</span> }
                        @else { <span class="aging-tag aging-done">✅ {{ o.days }}d baki</span> }
                      </td>
                      <td class="text-xs">{{ o.dueDate | inDate }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <div class="empty-state">Koi outstanding bill nahi — sab clear 🎉</div>
            }
          </div>

        </div>
      }

      <!-- ============ TAB CONTENT: OPERATIONS ============ -->
      @if (tab() === 'operations') {
        <div class="grid grid-cols-3 gap-4 mt-4">

          <!-- GR Return Trend — REAL (FY trend se) -->
          <div class="widget w-red">
            <div class="widget-head"><div><h3>🔄 GR RETURN TREND</h3><p class="widget-sub">Monthly return amount</p></div></div>
            @if (grMax() > 0) {
              <svg viewBox="0 0 320 190" class="chart-svg">
                <text x="2" y="20" class="ax-lbl">{{ money(grMax()) }}</text>
                <text x="2" y="90" class="ax-lbl">{{ money(grMax() / 2) }}</text>
                <text x="10" y="160" class="ax-lbl">0</text>
                <polyline [attr.points]="grTrendPath()" fill="none" stroke="#DC2626" stroke-width="2.5"/>
                @for (g of grTrendPts(); track g.label; let i = $index) {
                  <circle [attr.cx]="g.x" [attr.cy]="g.y" r="3" fill="#fff" stroke="#DC2626" stroke-width="2"/>
                  @if (i % 2 === 0) {
                    <text [attr.x]="g.x" y="182" class="ax-lbl" text-anchor="middle">{{ g.label }}</text>
                  }
                }
              </svg>
            } @else {
              <div class="empty-state">Abhi koi GR nahi</div>
            }
          </div>

          <!-- Return Reasons — REAL -->
          <div class="widget w-purple">
            <div class="widget-head"><div><h3>🔍 RETURN REASONS</h3><p class="widget-sub">Why items returned</p></div></div>
            @if (grReasonSegs().length) {
              <svg viewBox="0 0 200 200" class="chart-svg-donut">
                <circle cx="100" cy="100" r="70" fill="none" stroke="#F5EFE3" stroke-width="22"/>
                @for (s of grReasonSegs(); track s.label) {
                  <circle cx="100" cy="100" r="70" fill="none" [attr.stroke]="s.color" stroke-width="22"
                          [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 100 100)"/>
                }
              </svg>
              <div class="legend-rows">
                @for (s of grReasonSegs(); track s.label) {
                  <div><span class="lg-dot" [style.background]="s.color"></span> {{ s.label }} {{ s.pct }}% — {{ money(s.value) }}</div>
                }
              </div>
            } @else {
              <div class="empty-state">Is period me koi return nahi 🎉</div>
            }
          </div>

          <!-- GR Status — REAL -->
          <div class="widget w-blue">
            <div class="widget-head"><div><h3>📋 GR STATUS</h3><p class="widget-sub">Pending / Approved / Rejected</p></div></div>
            @if (grStatusSegs().length) {
              <svg viewBox="0 0 200 200" class="chart-svg-donut">
                <circle cx="100" cy="100" r="70" fill="none" stroke="#F5EFE3" stroke-width="22"/>
                @for (s of grStatusSegs(); track s.label) {
                  <circle cx="100" cy="100" r="70" fill="none" [attr.stroke]="s.color" stroke-width="22"
                          [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 100 100)"/>
                }
              </svg>
              <div class="legend-rows">
                @for (s of grStatusSegs(); track s.label) {
                  <div><span class="lg-dot" [style.background]="s.color"></span> {{ s.label | titlecase }} {{ s.pct }}% ({{ s.value }})</div>
                }
              </div>
            } @else {
              <div class="empty-state">Is period me koi GR nahi</div>
            }
          </div>

          <!-- Supplier Performance — REAL -->
          <div class="widget col-span-3 w-amber">
            <div class="widget-head"><div><h3>🏆 SUPPLIER PERFORMANCE</h3><p class="widget-sub">Sales · Return rate</p></div></div>
            @if (supplierPerfRows().length) {
              <div class="supplier-list">
                @for (s of supplierPerfRows(); track s.name) {
                  <div class="supplier-row">
                    <div class="sup-avatar" [style.background]="s.avatarColor">{{ s.name.substring(0,2).toUpperCase() }}</div>
                    <div class="sup-info">
                      <div class="sup-name">{{ s.name }}</div>
                      <div class="sup-stats">{{ s.bills }} bills · {{ money(s.sales) }} sales · <span [class]="s.badgeClass">{{ s.badge }}</span></div>
                      <div class="sup-bar"><div class="sup-fill" [style.width.%]="s.fill" [style.background]="s.barColor"></div></div>
                    </div>
                    <div class="sup-pct" [class.text-red-600]="s.returnPct > 5" [class.text-green-600]="s.returnPct <= 2">
                      {{ s.returnPct }}%
                      <small>return</small>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="empty-state">Is period me koi sales bill nahi — suppliers ki performance yahan dikhegi</div>
            }
          </div>

        </div>
      }

      <!-- ============ TAB CONTENT: PARTIES ============ -->
      @if (tab() === 'parties') {
        <div class="grid grid-cols-3 gap-4 mt-4">

          <!-- Party Outstanding — REAL -->
          <div class="widget col-span-2 w-navy">
            <div class="widget-head"><div><h3>📊 PARTY OUTSTANDING</h3><p class="widget-sub">Receivable vs Payable</p></div></div>
            @if (partyOutBars().length) {
              <svg viewBox="0 0 600 200" class="chart-svg">
                <text x="2" y="25" class="ax-lbl">{{ money(partyOutMax()) }}</text>
                <text x="2" y="100" class="ax-lbl">{{ money(partyOutMax() / 2) }}</text>
                <text x="12" y="175" class="ax-lbl">0</text>
                @for (p of partyOutBars(); track p.name; let i = $index) {
                  <g [attr.transform]="'translate(' + (50 + i * 90) + ', 0)'">
                    <rect [attr.x]="0" [attr.y]="170 - p.rH" [attr.width]="28" [attr.height]="p.rH" fill="#5c1a8b" rx="2"/>
                    <rect [attr.x]="34" [attr.y]="170 - p.pH" [attr.width]="28" [attr.height]="p.pH" fill="#DC2626" rx="2"/>
                    <text x="31" y="190" class="ax-lbl" text-anchor="middle">{{ p.name }}</text>
                  </g>
                }
              </svg>
              <div class="legend-rows" style="flex-direction:row; gap:14px">
                <span><span class="lg-dot" style="background:#5c1a8b"></span> Receivable</span>
                <span><span class="lg-dot" style="background:#DC2626"></span> Payable</span>
              </div>
            } @else {
              <div class="empty-state">Koi party outstanding nahi 🎉</div>
            }
          </div>

          <!-- Party Ratings — REAL -->
          <div class="widget w-amber">
            <div class="widget-head"><div><h3>⭐ PARTY RATINGS</h3><p class="widget-sub">Credit rating distribution</p></div></div>
            @if (ratingSegs().length) {
              <svg viewBox="0 0 200 200" class="chart-svg-donut">
                <circle cx="100" cy="100" r="70" fill="none" stroke="#F5EFE3" stroke-width="22"/>
                @for (s of ratingSegs(); track s.label) {
                  <circle cx="100" cy="100" r="70" fill="none" [attr.stroke]="s.color" stroke-width="22"
                          [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 100 100)"/>
                }
              </svg>
              <div class="legend-rows">
                @for (s of ratingSegs(); track s.label) {
                  <div><span class="lg-dot" [style.background]="s.color"></span> {{ s.label }} — {{ s.value }} parties</div>
                }
              </div>
            } @else {
              <div class="empty-state">Abhi koi party nahi</div>
            }
          </div>

          <!-- City-wise — REAL -->
          <div class="widget w-blue">
            <div class="widget-head"><div><h3>🌆 CITY-WISE PARTIES</h3><p class="widget-sub">Top 5 cities</p></div></div>
            @if (cityRows().length) {
              <svg viewBox="0 0 320 180" class="chart-svg">
                @for (c of cityRows(); track c.name; let i = $index) {
                  <g [attr.transform]="'translate(0, ' + (20 + i * 30) + ')'">
                    <text x="0" y="15" class="ax-lbl">{{ c.name }}</text>
                    <rect x="75" y="3" [attr.width]="c.bar" height="20" [attr.fill]="c.color" rx="3"/>
                    <text [attr.x]="80 + c.bar" y="18" class="ax-lbl">{{ c.count }}</text>
                  </g>
                }
              </svg>
            } @else {
              <div class="empty-state">Parties me city add karoge to yahan dikhega</div>
            }
          </div>

          <!-- Supplier Commission — REAL -->
          <div class="widget w-teal">
            <div class="widget-head"><div><h3>🪙 SUPPLIER COMMISSION</h3><p class="widget-sub">Supplier-wise earnings</p></div></div>
            @if (supplierCommRows().length) {
              <svg viewBox="0 0 320 180" class="chart-svg">
                @for (s of supplierCommRows(); track s.name; let i = $index) {
                  <g [attr.transform]="'translate(0, ' + (20 + i * 30) + ')'">
                    <text x="0" y="15" class="ax-lbl">{{ s.name }}</text>
                    <rect x="75" y="3" [attr.width]="s.bar" height="20" [attr.fill]="s.color" rx="3"/>
                    <text [attr.x]="80 + s.bar" y="18" class="ax-lbl">{{ money(s.amount) }}</text>
                  </g>
                }
              </svg>
            } @else {
              <div class="empty-state">Is period me koi commission invoice nahi</div>
            }
          </div>

          <!-- Top Buyers — REAL -->
          <div class="widget col-span-3 w-green">
            <div class="widget-head"><div><h3>🛒 TOP BUYERS</h3><p class="widget-sub">Sales · Bills · Outstanding</p></div></div>
            @if (topBuyersRows().length) {
              <div class="grid grid-cols-3 gap-3">
                @for (b of topBuyersRows(); track b.name; let i = $index) {
                  <div class="behav-card">
                    <div class="behav-top">
                      <div class="bb-avatar" [style.background]="color(i)">{{ b.name.substring(0,2).toUpperCase() }}</div>
                      <div>
                        <div class="bb-name">{{ b.name }}</div>
                        <div class="bb-stars">{{ b.bills }} bills</div>
                      </div>
                      <div class="bb-pct">{{ money(b.sales) }}<small>sales</small></div>
                    </div>
                    <div class="bb-payment">Outstanding: <strong>{{ money(b.outstanding) }}</strong></div>
                    <div class="bb-bar"><div class="bb-fill" [style.width.%]="b.paidPct"></div></div>
                  </div>
                }
              </div>
            } @else {
              <div class="empty-state">Is period me koi sales nahi — buyers yahan dikhenge</div>
            }
          </div>

        </div>
      }

      <!-- ============ PARTY BEHAVIOUR — Top 5 Supplier + Top 5 Buyer (REAL) ============ -->
      <div class="grid grid-cols-2 gap-4 mt-4">

        <!-- SUPPLIER BEHAVIOUR -->
        <div class="widget w-amber">
          <div class="widget-head">
            <div><h3>🏭 SUPPLIER BEHAVIOUR</h3><p class="widget-sub">Late dispatch · Bina bole maal · Quality (GR)</p></div>
            <a routerLink="/trading/parties" class="full-list">Full List →</a>
          </div>
          @if (behSuppliers().length) {
            @for (s of behSuppliers(); track s.partyId) {
              <div class="beh-row">
                <div class="beh-avatar">{{ initials(s.name) }}</div>
                <div class="beh-mid">
                  <div class="beh-name">
                    {{ s.name }}
                    <span class="beh-grade" [class]="'g-' + gradeClass(s.grade)">{{ s.grade }}</span>
                    <span class="beh-stars">{{ starStr(s.stars) }}</span>
                  </div>
                  <div class="beh-sub">{{ s.billCount }} bills · Dispatch avg {{ s.avgDispatch }}d
                    @if (s.badge) { · <b>{{ s.badge }}</b> }
                  </div>
                  <div class="beh-bar"><div class="beh-fill" [class.bf-bad]="s.returnRate > 5"
                       [style.width.%]="mini(100 - s.returnRate * 5)"></div></div>
                </div>
                <div class="beh-right" [class.text-red-600]="s.returnRate > 5">
                  {{ s.returnRate }}%<div class="beh-rlbl">return rate</div>
                </div>
              </div>
            }
          } @else {
            <div class="empty-state">Bills aane par supplier behaviour yahan dikhega</div>
          }
        </div>

        <!-- BUYER BEHAVIOUR -->
        <div class="widget w-green">
          <div class="widget-head">
            <div><h3>🛒 BUYER BEHAVIOUR</h3><p class="widget-sub">Advance · On-time · Late payment · GR</p></div>
            <a routerLink="/trading/parties" class="full-list">Full List →</a>
          </div>
          @if (behBuyers().length) {
            @for (b of behBuyers(); track b.partyId) {
              <div class="beh-row">
                <div class="beh-avatar bav-buy">{{ initials(b.name) }}</div>
                <div class="beh-mid">
                  <div class="beh-name">
                    {{ b.name }}
                    <span class="beh-grade" [class]="'g-' + gradeClass(b.grade)">{{ b.grade }}</span>
                    <span class="beh-stars">{{ starStr(b.stars) }}</span>
                  </div>
                  <div class="beh-sub">
                    {{ b.billCount }} bills
                    @if (b.advCount + b.earlyCount + b.ontimeCount + b.lateCount > 0) {
                      · 💎{{ b.advCount }} ⏩{{ b.earlyCount }} ✅{{ b.ontimeCount }} 🐌{{ b.lateCount }} · {{ b.avgPayDays }}d avg
                    }
                    @if (b.badge) { · <b>{{ b.badge }}</b> }
                  </div>
                  <div class="beh-bar"><div class="beh-fill" [class.bf-bad]="b.goodPct < 60"
                       [style.width.%]="mini(b.goodPct)"></div></div>
                </div>
                <div class="beh-right" [class.text-red-600]="b.returnRate > 5">
                  {{ b.returnRate }}%<div class="beh-rlbl">return rate</div>
                </div>
              </div>
            }
          } @else {
            <div class="empty-state">Sales bills aane par buyer behaviour yahan dikhega</div>
          }
        </div>

      </div>

      <!-- ============ SMART ALERTS PANEL (REAL — data se derive) ============ -->
      <div class="widget mt-4 w-navy">
        <div class="widget-head">
          <div><h3>🔔 SMART ALERTS</h3><p class="widget-sub">Action lene wali cheezein</p></div>
          <a routerLink="/trading/bills" class="full-list">All Bills →</a>
        </div>
        @if (alerts().length) {
          <div class="grid grid-cols-2 gap-3">
            @for (a of alerts(); track a.title) {
              <div class="alert-row" [class]="'al-' + a.level">
                <span class="al-ico">{{ a.icon }}</span>
                <div class="al-content">
                  <div class="al-title">{{ a.title }}</div>
                  <div class="al-detail">{{ a.detail }}</div>
                </div>
                <span class="al-time">{{ a.time }}</span>
              </div>
            }
          </div>
        } @else {
          <div class="alert-row al-success">
            <span class="al-ico">✅</span>
            <div class="al-content">
              <div class="al-title">Sab theek hai</div>
              <div class="al-detail">Koi pending action nahi — overdue payment ya GR approval aate hi yahan dikhega</div>
            </div>
          </div>
        }
      </div>

      <!-- ============ ALERTS DROPDOWN (top right) ============ -->
      @if (alertsOpen) {
        <div class="alerts-dropdown" (click)="$event.stopPropagation()">
          <div class="ad-head">🔔 Recent Alerts</div>
          @if (alerts().length) {
            @for (a of alerts(); track a.title) {
              <div class="ad-row">
                <span [style.color]="a.level === 'critical' ? '#DC2626' : '#F97316'">{{ a.icon }}</span>
                <div>
                  <strong>{{ a.title }}</strong>
                  <small>{{ a.detail }}</small>
                </div>
              </div>
            }
          } @else {
            <div class="ad-row"><span>✅</span><div><strong>Sab clear</strong><small>Koi naya alert nahi</small></div></div>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: block; background: #FAF7F0; min-height: 100vh; padding: 16px 24px; }

    /* HEADER */
    .pd-header {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 16px 24px; border-radius: 12px;
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;
      box-shadow: 0 4px 12px rgba(27,46,92,0.15);
    }
    .ph-left { display: flex; align-items: center; gap: 14px; }
    .ph-bolt { font-size: 28px; color: #FCD34D; }
    .ph-title { font-size: 22px; font-weight: 900; margin: 0; letter-spacing: 0.3px; }
    .ph-sub { font-size: 12px; opacity: 0.85; margin: 2px 0 0; }
    .ph-right { display: flex; align-items: center; gap: 16px; }
    .ph-date {
      background: rgba(255,255,255,0.15); padding: 6px 14px; border-radius: 999px;
      font-size: 12px; font-weight: 700; letter-spacing: 0.4px;
    }
    .ph-bell {
      background: transparent; border: 0; color: #fff; font-size: 22px; cursor: pointer;
      position: relative; padding: 4px;
    }
    .ph-bell.has-new::before {
      content: ''; position: absolute; top: 4px; right: 4px; width: 8px; height: 8px;
      background: #DC2626; border-radius: 50%; animation: pulse 1.5s infinite;
    }
    .bell-badge {
      position: absolute; top: -2px; right: -4px; background: #DC2626; color: #fff;
      font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 999px; line-height: 1;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* TAB BAR */
    .tab-bar {
      display: flex; justify-content: space-between; align-items: center;
      background: #fff; border: 1px solid #D6DDEA; border-radius: 10px; padding: 6px; margin-bottom: 14px;
    }
    .tab-strip { display: flex; gap: 4px; }
    .tab-btn {
      padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px;
      color: #4A5878; background: transparent; border: 0; cursor: pointer; font-family: inherit;
      transition: all 0.15s;
    }
    .tab-btn:hover { background: #F5EFE3; color: #1B2E5C; }
    .tab-active { background: var(--anjaninex-navy, #1B2E5C) !important; color: #fff !important; }

    /* FILTERS */
    .filter-row {
      display: flex; justify-content: space-between; align-items: center;
      background: #fff; padding: 10px 14px; border-radius: 10px; border: 1px solid #D6DDEA;
      margin-bottom: 14px;
    }
    .period-tabs { display: flex; gap: 6px; }
    .pt-btn {
      padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 700;
      background: #fff; border: 1px solid #D6DDEA; color: #4A5878; cursor: pointer; font-family: inherit;
      transition: all 0.15s;
    }
    .pt-btn:hover { border-color: #1B2E5C; }
    .pt-active { background: var(--anjaninex-navy, #1B2E5C) !important; color: #fff !important; border-color: var(--anjaninex-navy, #1B2E5C) !important; }
    .branch-select {
      padding: 7px 14px; border: 1px solid var(--anjaninex-navy, #1B2E5C); background: var(--anjaninex-navy, #1B2E5C); color: #fff;
      border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
    }

    /* KPI CARDS */
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
    .kpi-card {
      background: #fff; border: 1px solid #D6DDEA; border-radius: 12px; padding: 16px;
      position: relative; overflow: hidden; transition: transform 0.15s, box-shadow 0.15s;
    }
    .kpi-card:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(27,46,92,0.14); }
    .kpi-1 { border-top: 4px solid #1B2E5C; background: linear-gradient(160deg,#f3f6fc 0%,#fff 55%); }
    .kpi-2 { border-top: 4px solid #F97316; background: linear-gradient(160deg,#fff7ed 0%,#fff 55%); }
    .kpi-3 { border-top: 4px solid #10B981; background: linear-gradient(160deg,#ecfdf5 0%,#fff 55%); }
    .kpi-4 { border-top: 4px solid #DC2626; background: linear-gradient(160deg,#fef2f2 0%,#fff 55%); }
    .kpi-1 .kpi-value { color: #1B2E5C; }
    .kpi-2 .kpi-value { color: #EA580C; }
    .kpi-3 .kpi-value { color: #059669; }
    .kpi-4 .kpi-value { color: #DC2626; }
    .kpi-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .kpi-ico { font-size: 20px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; border-radius: 10px; }
    .kpi-1 .kpi-ico { background: #1B2E5C15; }
    .kpi-2 .kpi-ico { background: #F9731620; }
    .kpi-3 .kpi-ico { background: #10B98120; }
    .kpi-4 .kpi-ico { background: #DC262615; }
    .kpi-delta {
      font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 999px;
    }
    .delta-up { background: #D1FAE5; color: #047857; }
    .delta-pending { background: #FED7AA; color: #C2410C; }
    .delta-warn { background: #FEE2E2; color: #DC2626; }
    .kpi-value { font-size: 28px; font-weight: 900; color: #1B2E5C; font-family: 'JetBrains Mono', monospace; line-height: 1.1; }
    .kpi-label { font-size: 10px; font-weight: 800; color: #4A5878; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 4px; }
    .kpi-spark { width: 100%; height: 30px; margin-top: 8px; }

    /* AI BANNER */
    .ai-banner {
      background: linear-gradient(90deg, #FEF3C7, #FFFBEB);
      border: 1px solid #FCD34D; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px;
      display: flex; align-items: center; gap: 12px;
    }
    .ai-ico { font-size: 22px; }
    .ai-content { flex: 1; font-size: 13px; color: #92400E; }
    .ai-content strong { color: #1B2E5C; }
    .ai-link { color: #DC2626; font-weight: 700; text-decoration: none; margin-left: 6px; }
    .ai-link:hover { text-decoration: underline; }
    .ai-dismiss { background: transparent; border: 0; color: #92400E; cursor: pointer; padding: 4px 8px; font-size: 14px; }

    /* WIDGETS */
    .widget {
      background: #fff; border: 1px solid #D6DDEA; border-radius: 12px; padding: 16px;
      box-shadow: 0 1px 3px rgba(27,46,92,0.04);
    }
    .col-span-2 { grid-column: span 2; }
    .col-span-3 { grid-column: span 3; }
    .widget-head {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 10px; border-bottom: 1px solid #F5EFE3; margin-bottom: 12px;
    }
    .widget-head h3 { font-size: 12px; font-weight: 800; color: #1B2E5C; letter-spacing: 0.5px; margin: 0; }
    .widget-sub { font-size: 11px; color: #6B7280; margin: 2px 0 0; }
    .full-list { font-size: 11px; font-weight: 700; color: #DC2626; text-decoration: none; }
    .full-list:hover { text-decoration: underline; }

    /* ===== PER-WIDGET COLOUR ACCENTS (purely visual) =====
       Each widget gets a coloured left bar, a faint matching tint at the
       top-left, and a coloured h3 title so the page feels vibrant. */
    .w-navy   { border-left: 4px solid #1B2E5C; background: linear-gradient(125deg,#1B2E5C0d 0%,#fff 42%); }
    .w-purple { border-left: 4px solid #9333ea; background: linear-gradient(125deg,#9333ea0d 0%,#fff 42%); }
    .w-blue   { border-left: 4px solid #0284c7; background: linear-gradient(125deg,#0284c70d 0%,#fff 42%); }
    .w-green  { border-left: 4px solid #16a34a; background: linear-gradient(125deg,#16a34a0d 0%,#fff 42%); }
    .w-orange { border-left: 4px solid #EA580C; background: linear-gradient(125deg,#EA580C0d 0%,#fff 42%); }
    .w-teal   { border-left: 4px solid #0d9488; background: linear-gradient(125deg,#0d94880d 0%,#fff 42%); }
    .w-red    { border-left: 4px solid #DC2626; background: linear-gradient(125deg,#DC26260d 0%,#fff 42%); }
    .w-amber  { border-left: 4px solid #d97706; background: linear-gradient(125deg,#d977060d 0%,#fff 42%); }

    .w-navy   .widget-head h3 { color: #1B2E5C; }
    .w-purple .widget-head h3 { color: #7e22ce; }
    .w-blue   .widget-head h3 { color: #0369a1; }
    .w-green  .widget-head h3 { color: #15803d; }
    .w-orange .widget-head h3 { color: #c2410c; }
    .w-teal   .widget-head h3 { color: #0f766e; }
    .w-red    .widget-head h3 { color: #b91c1c; }
    .w-amber  .widget-head h3 { color: #b45309; }

    /* tint the head underline to match the accent */
    .w-navy   .widget-head { border-bottom-color: #1B2E5C22; }
    .w-purple .widget-head { border-bottom-color: #9333ea22; }
    .w-blue   .widget-head { border-bottom-color: #0284c722; }
    .w-green  .widget-head { border-bottom-color: #16a34a22; }
    .w-orange .widget-head { border-bottom-color: #EA580C22; }
    .w-teal   .widget-head { border-bottom-color: #0d948822; }
    .w-red    .widget-head { border-bottom-color: #DC262622; }
    .w-amber  .widget-head { border-bottom-color: #d9770622; }

    .chart-svg { width: 100%; height: auto; max-height: 220px; }
    .chart-svg-donut { width: 100%; max-height: 200px; }
    .ax-lbl { font-size: 9px; fill: #6B7280; font-family: inherit; }
    .donut-big { font-size: 20px; font-weight: 800; fill: #1B2E5C; font-family: 'JetBrains Mono', monospace; }
    .donut-sub { font-size: 9px; fill: #6B7280; }

    .legend-rows { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 11px; color: #4A5878; }
    .lg-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }

    .empty-state { padding: 36px 12px; text-align: center; color: #9CA3AF; font-size: 12px; }

    .trend-summary { margin-bottom: 6px; }
    .trend-big { font-size: 26px; font-weight: 800; color: #DC2626; font-family: 'JetBrains Mono', monospace; }
    .trend-sub { font-size: 11px; color: #6B7280; margin-left: 8px; }
    .trend-stats {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px;
      padding-top: 10px; border-top: 1px solid #F5EFE3;
    }
    .trend-stats > div { text-align: center; }
    .stat-l { display: block; font-size: 9px; color: #6B7280; letter-spacing: 0.5px; margin-bottom: 2px; }
    .text-orange { color: #F97316; }
    .text-navy { color: #1B2E5C; }
    .text-red-600 { color: #DC2626; }
    .text-green-600 { color: #10B981; }
    .text-gray-500 { color: #6B7280; }

    .seg-toggle { display: flex; gap: 2px; background: #F5EFE3; padding: 3px; border-radius: 6px; }
    .seg-toggle button {
      padding: 4px 10px; font-size: 11px; font-weight: 700; background: transparent;
      border: 0; cursor: pointer; border-radius: 4px; color: #4A5878; font-family: inherit;
    }
    .seg-active { background: #5c1a8b !important; color: #fff !important; }

    /* TRENDING TABLE */
    .trend-table { width: 100%; font-size: 12px; border-collapse: collapse; }
    .trend-table thead { background: var(--anjaninex-navy, #1B2E5C); color: #fff; }
    .trend-table th { padding: 8px; text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
    .trend-table th.text-right { text-align: right; }
    .trend-table th.text-center { text-align: center; }
    .trend-table td { padding: 10px 8px; border-bottom: 1px solid #F5EFE3; }
    .trend-table tbody tr:hover { background: #FAF7F0; }
    .rank-badge {
      display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;
      background: #FCD34D; color: #92400E; border-radius: 50%; font-weight: 800; font-size: 11px;
    }
    .seg-tag { padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; }
    .seg-fabric { background: #EDE9FE; color: #5c1a8b; }
    .share-bar { width: 100px; height: 8px; background: #E5E9F2; border-radius: 4px; overflow: hidden; }
    .share-fill { height: 100%; border-radius: 4px; transition: width 0.4s; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }

    /* AGING TAGS */
    .aging-tag { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; }
    .aging-overdue { background: #FEE2E2; color: #DC2626; }
    .aging-soon { background: #FEF3C7; color: #92400E; }
    .aging-done { background: #D1FAE5; color: #047857; }

    /* SUPPLIER LIST */
    .supplier-list { display: flex; flex-direction: column; gap: 10px; }
    .supplier-row {
      display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center;
      padding: 12px; background: #FAF7F0; border-radius: 8px; border: 1px solid #F5EFE3;
    }
    .sup-avatar { width: 38px; height: 38px; border-radius: 50%; color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 13px; }
    .sup-name { font-size: 14px; font-weight: 700; color: #1B2E5C; }
    .sup-stats { font-size: 11px; color: #4A5878; margin-top: 2px; }
    .sup-bar { width: 100%; height: 4px; background: #E5E9F2; border-radius: 2px; margin-top: 6px; overflow: hidden; }
    .sup-fill { height: 100%; transition: width 0.4s; }
    .sup-pct { font-weight: 800; font-size: 14px; text-align: right; font-family: 'JetBrains Mono', monospace; }
    .sup-pct small { display: block; font-size: 9px; color: #6B7280; font-weight: normal; }
    .badge-good { background: #D1FAE5; color: #047857; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; }
    .badge-warn { background: #FEE2E2; color: #DC2626; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; }

    /* BUYER CARDS */
    .behav-card { background: #FAF7F0; border: 1px solid #F5EFE3; border-radius: 8px; padding: 12px; }
    .behav-top { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; margin-bottom: 8px; }
    .bb-avatar { width: 34px; height: 34px; border-radius: 50%; color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 12px; }
    .bb-name { font-size: 13px; font-weight: 700; color: #1B2E5C; }
    .bb-stars { color: #6B7280; font-size: 10px; }
    .bb-pct { font-size: 13px; font-weight: 800; color: #1B2E5C; text-align: right; font-family: 'JetBrains Mono', monospace; }
    .bb-pct small { display: block; font-size: 8px; color: #6B7280; font-weight: normal; }
    .bb-payment { font-size: 11px; color: #4A5878; }
    .bb-bar { width: 100%; height: 4px; background: #E5E9F2; border-radius: 2px; margin-top: 6px; overflow: hidden; }
    .bb-fill { height: 100%; background: #10B981; transition: width 0.4s; }

    /* PARTY BEHAVIOUR */
    .beh-row { display: flex; gap: 12px; align-items: center; padding: 10px 4px;
      border-bottom: 1px solid #f3eefa; }
    .beh-row:last-child { border-bottom: 0; }
    .beh-avatar { width: 38px; height: 38px; border-radius: 10px; background: #f0e6ff; color: #5c1a8b;
      display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; flex: none; }
    .bav-buy { background: #dcfce7; color: #15803d; }
    .beh-mid { flex: 1; min-width: 0; }
    .beh-name { font-weight: 800; font-size: 13px; color: #1B2E5C;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .beh-grade { font-size: 10px; font-weight: 900; padding: 1px 7px; border-radius: 6px; }
    .g-ap { background: #dcfce7; color: #15803d; }
    .g-a  { background: #d1fae5; color: #047857; }
    .g-b  { background: #fef3c7; color: #b45309; }
    .g-c  { background: #fee2e2; color: #b91c1c; }
    .beh-stars { color: #f59e0b; font-size: 11px; letter-spacing: 1px; }
    .beh-sub { font-size: 11px; color: #6b7280; margin: 2px 0 5px; }
    .beh-bar { height: 6px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
    .beh-fill { height: 100%; background: #10B981; border-radius: 99px; transition: width .4s; }
    .bf-bad { background: #DC2626; }
    .beh-right { text-align: right; font-weight: 900; font-size: 13px; color: #1B2E5C; flex: none; }
    .beh-rlbl { font-size: 9px; font-weight: 600; color: #9ca3af; text-transform: uppercase; }

    /* SMART ALERTS */
    .alert-row {
      display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center;
      padding: 12px 14px; border-radius: 8px; border-left: 4px solid;
    }
    .al-critical { background: #FEE2E2; border-color: #DC2626; }
    .al-warning  { background: #FEF3C7; border-color: #FCD34D; }
    .al-info     { background: #DBEAFE; border-color: #3B82F6; }
    .al-success  { background: #D1FAE5; border-color: #10B981; }
    .al-ico { font-size: 18px; }
    .al-title { font-size: 13px; font-weight: 700; color: #1B2E5C; }
    .al-detail { font-size: 11px; color: #4A5878; margin-top: 2px; }
    .al-time { font-size: 10px; color: #6B7280; font-weight: 600; }

    /* ALERTS DROPDOWN */
    .alerts-dropdown {
      position: fixed; top: 100px; right: 30px; z-index: 100;
      width: 360px; background: #fff; border: 1px solid #D6DDEA; border-radius: 12px;
      box-shadow: 0 12px 32px rgba(27,46,92,0.2); padding: 8px;
    }
    .ad-head { font-size: 12px; font-weight: 800; color: #1B2E5C; padding: 8px 10px; }
    .ad-row {
      display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: start;
      padding: 10px; border-radius: 6px; cursor: pointer;
    }
    .ad-row:hover { background: #FAF7F0; }
    .ad-row strong { display: block; font-size: 12px; color: #1B2E5C; }
    .ad-row small { display: block; font-size: 10px; color: #6B7280; margin-top: 2px; }

    /* ===== MOBILE (<=640px) ===== */
    @media (max-width: 640px) {
      :host { padding: 12px 12px; }
      .pd-header { flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px 16px; }
      .ph-right { width: 100%; justify-content: space-between; }
      .ph-title { font-size: 18px; }
      .tab-bar { flex-direction: column; align-items: stretch; gap: 6px; }
      .tab-strip { flex-wrap: wrap; }
      .tab-btn { padding: 8px 14px; }
      .filter-row { flex-direction: column; align-items: stretch; gap: 10px; }
      .period-tabs { flex-wrap: wrap; }
      .branch-select { width: 100% !important; }
      .kpi-grid { grid-template-columns: 1fr 1fr !important; }
      .kpi-value { font-size: 22px; }
      .grid-cols-3, .grid-cols-2 { grid-template-columns: 1fr !important; }
      .col-span-2, .col-span-3 { grid-column: span 1 !important; }
      .trend-stats { grid-template-columns: 1fr !important; }
      .widget-head { flex-wrap: wrap; gap: 6px; }
      .seg-toggle { flex-wrap: wrap; }
      .supplier-row { grid-template-columns: auto 1fr; }
      .supplier-row .sup-pct { grid-column: 1 / -1; text-align: left; }
      .behav-top { grid-template-columns: auto 1fr; }
      .alert-row { grid-template-columns: auto 1fr; }
      .al-time { grid-column: 1 / -1; }
      .trend-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
      .alerts-dropdown { width: auto !important; max-width: calc(100vw - 24px); left: 12px; right: 12px; }
    }
  `]
})
export class ProDashboardComponent {
  auth = inject(AuthService);
  features = inject(FeatureService);

  tab = signal<TabKey>('sales');
  period = signal<PeriodKey>('year');
  branch = '';
  trendMode: 'sale' | 'comm' | 'gr' = 'sale';
  alertsOpen = false;
  insightDismissed = signal(false);

  today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // ===== REAL DATA — GET api/dashboard/pro (period + branch filters) =====
  private http = inject(HttpClient);
  dash = signal<any | null>(null);
  branchList = signal<{ id: string; name: string }[]>([]);

  private router2 = inject(Router);

  ngOnInit() {
    // Super admin ki koi firm nahi — ye firm dashboard uske liye nahi hai
    if (this.auth.hasRole('super_admin')) {
      this.router2.navigateByUrl('/admin/dashboard');
      return;
    }
    this.loadDash();
    this.http.get<any[]>(`${environment.apiUrl}/api/core/branches`).subscribe({
      next: (b) => this.branchList.set(b.map(x => ({ id: x.id, name: x.name }))),
      error: () => {}
    });
  }

  setPeriod(p: PeriodKey) {
    this.period.set(p);
    this.loadDash();
  }

  loadDash() {
    const params: any = { period: this.period() };
    if (this.branch) params.branchId = this.branch;
    this.http.get<any>(`${environment.apiUrl}/api/dashboard/pro`, { params }).subscribe({
      next: (d) => this.dash.set(d),
      error: () => {}
    });
    this.loadBehaviour();
  }

  // ===== PARTY BEHAVIOUR — Top 5 supplier + buyer (real data se) =====
  behaviour = signal<{ suppliers: any[]; buyers: any[] }>({ suppliers: [], buyers: [] });
  behSuppliers = () => this.behaviour().suppliers.slice(0, 5);
  behBuyers = () => this.behaviour().buyers.slice(0, 5);

  loadBehaviour() {
    this.http.get<any>(`${environment.apiUrl}/api/dashboard/behaviour`).subscribe({
      next: (d) => this.behaviour.set({ suppliers: d?.suppliers || [], buyers: d?.buyers || [] }),
      error: () => {}
    });
  }

  initials(name: string): string {
    return (name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
  starStr(n: number): string { return '★'.repeat(n || 0) + '☆'.repeat(Math.max(0, 5 - (n || 0))); }
  gradeClass(g: string): string { return g === 'A+' ? 'ap' : (g || 'c').toLowerCase(); }
  mini(v: number): number { return Math.max(4, Math.min(100, v || 0)); }

  // ===== Shared helpers =====
  private pal = ['#5c1a8b', '#F97316', '#10B981', '#3B82F6', '#DC2626', '#FCD34D', '#06B6D4'];
  color(i: number): string { return this.pal[i % this.pal.length]; }

  // rupees → lakhs (1 decimal)
  L(v: number | null | undefined): number { return Math.round(((v ?? 0) / 100000) * 10) / 10; }

  // smart money label: ₹1.2L / ₹45K / ₹930
  money(v: number | null | undefined): string {
    const n = +(v ?? 0);
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + Math.round(n / 1000) + 'K';
    return '₹' + Math.round(n);
  }

  // donut segments (r=70 → C≈440)
  private donut(parts: { label: string; value: number; color: string }[]): DonutSeg[] {
    const C = 2 * Math.PI * 70;
    const total = parts.reduce((s, p) => s + (+p.value || 0), 0);
    if (total <= 0) return [];
    let off = 0;
    return parts.filter(p => +p.value > 0).map(p => {
      const dash = (+p.value / total) * C;
      const seg: DonutSeg = {
        label: p.label, color: p.color, value: +p.value,
        pct: Math.round((+p.value / total) * 100),
        dash: `${dash} ${C}`, off: -off
      };
      off += dash;
      return seg;
    });
  }

  fyLabel(): string { return this.dash()?.fyLabel ?? 'FY'; }

  private monthArr(key: 'sales' | 'commission' | 'gr'): number[] {
    const t = this.dash()?.trend ?? [];
    return t.length ? t.map((m: any) => +m[key] || 0) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  // Sparklines = real monthly values
  get sparkSales(): number[] { return this.monthArr('sales'); }
  get sparkComm(): number[] { return this.monthArr('commission'); }
  get sparkReceived(): number[] { return this.monthArr('sales'); }
  get sparkGr(): number[] { return this.monthArr('gr'); }

  kpiSales = computed(() => {
    const k = this.dash()?.kpis;
    return { value: this.L(k?.sales), delta: k?.salesDelta ?? 0 };
  });

  /** Growth % ka text. Pichhli avadhi na ke barabar ho to % ka koi matlab nahi
   *  ("↑26160%" se user ko kuch samajh nahi aata) — tab seedha 'bahut zyada'. */
  deltaTxt(d: number): string {
    if (d >= 999) return '↑ bahut zyada';
    if (d <= -999) return '↓ bahut kam';
    return (d >= 0 ? '↑ ' : '↓ ') + Math.abs(d) + '%';
  }
  kpiComm = computed(() => {
    const k = this.dash()?.kpis;
    // Commission chhota hota hai — smart format (₹11.7K / ₹1.2L), na ki forced "L"
    return { value: this.money(k?.commission), delta: k?.commissionDelta ?? 0 };
  });
  kpiReceived = computed(() => {
    const k = this.dash()?.kpis;
    return { value: this.L(k?.received), pending: this.L(k?.pending) };
  });
  kpiGr = computed(() => {
    const k = this.dash()?.kpis;
    return { value: this.L(k?.gr), new: k?.grCount ?? 0 };
  });

  sparkPoints(arr: number[]): string {
    const max = Math.max(...arr, 1);
    return arr.map((v, i) => `${(i / (arr.length - 1)) * 100},${30 - (v / max) * 25}`).join(' ');
  }

  // ===== Alerts (REAL — backend se derive) =====
  alerts = computed(() => this.dash()?.alerts ?? []);
  newAlerts = computed(() => this.alerts().filter((a: any) => a.level === 'critical' || a.level === 'warning').length);
  aiInsight = computed(() => {
    const a = this.alerts();
    return a.length ? `${a[0].title} — ${a[0].detail}` : '';
  });
  dismissInsight() { this.insightDismissed.set(true); }

  // ===== Trend chart (12 months REAL, rupees; chart scale 0–100) =====
  private trendRaw(): { label: string; v: number }[] {
    const key = this.trendMode === 'sale' ? 'sales' : this.trendMode === 'comm' ? 'commission' : 'gr';
    const t = this.dash()?.trend ?? [];
    if (!t.length) {
      return ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
        .map(l => ({ label: l, v: 0 }));
    }
    return t.map((m: any) => ({ label: m.label, v: +m[key] || 0 }));
  }
  trendMax(): number { return Math.max(...this.trendRaw().map(p => p.v), 1); }
  trendPoints(): { label: string; value: number }[] {
    const max = this.trendMax();
    return this.trendRaw().map(p => ({ label: p.label, value: (p.v / max) * 100 }));
  }
  trendTotal(): string {
    return this.L(this.trendRaw().reduce((s, p) => s + p.v, 0)).toFixed(1);
  }
  trendLinePath(): string {
    return this.trendPoints().map((p, i) => `${40 + i * 47},${160 - p.value * 1.4}`).join(' ');
  }
  trendAreaPath(): string {
    const line = this.trendLinePath();
    const lastX = 40 + (this.trendPoints().length - 1) * 47;
    return `40,160 ${line} ${lastX},160`;
  }
  axLbl(f: number): string { return '₹' + this.L(this.trendMax() * f) + 'L'; }
  bestMonth(): string {
    const r = this.trendRaw();
    return r.reduce((b, p) => (p.v > b.v ? p : b), r[0]).label;
  }
  peakL(): string { return '₹' + this.L(this.trendMax()) + 'L'; }
  thisMonthL(): string {
    const lbl = new Date().toLocaleString('en', { month: 'short' });
    const m = this.trendRaw().find(p => p.label === lbl);
    return '₹' + this.L(m?.v ?? 0) + 'L';
  }

  // ===== Branch data (REAL — bar heights px-scaled, max 145) =====
  get branchData(): { name: string; sales: number; received: number }[] {
    const br = this.dash()?.branches ?? [];
    if (!br.length) return [];
    const max = Math.max(...br.map((b: any) => Math.max(+b.sales || 0, +b.received || 0)), 1);
    return br.slice(0, 4).map((b: any) => ({
      name: b.name,
      sales: ((+b.sales || 0) / max) * 145,
      received: ((+b.received || 0) / max) * 145
    }));
  }
  branchMaxL(): number {
    const br = this.dash()?.branches ?? [];
    if (!br.length) return 0;
    return this.L(Math.max(...br.map((b: any) => Math.max(+b.sales || 0, +b.received || 0)), 0));
  }
  branchAx(f: number): string {
    return (Math.round(this.branchMaxL() * f * 10) / 10).toString();
  }

  // ===== Segment Mix (REAL — item category) =====
  segMix = computed(() => this.donut(
    (this.dash()?.segmentMix ?? []).map((s: any, i: number) => ({ label: s.segment, value: +s.amount, color: this.color(i) }))
  ));
  segTotal = computed(() => (this.dash()?.segmentMix ?? []).reduce((s: number, x: any) => s + (+x.amount || 0), 0));

  // ===== Order Status (REAL) =====
  orderStatusSegs = computed(() => {
    const os = this.dash()?.orderStatus;
    if (!os || !os.total) return [];
    return this.donut([
      { label: 'Billed', value: +os.billed, color: '#10B981' },
      { label: 'Pending', value: +os.pending, color: '#FCD34D' },
      { label: 'Cancelled', value: +os.cancelled, color: '#DC2626' },
      { label: 'Other', value: +os.other, color: '#3B82F6' }
    ]);
  });
  billedPct = computed(() => {
    const os = this.dash()?.orderStatus;
    return os?.total ? Math.round((os.billed / os.total) * 100) : 0;
  });

  // ===== Trending items (REAL) =====
  topItems = computed(() => {
    const t = this.dash()?.topItems ?? [];
    const max = Math.max(...t.map((x: any) => +x.orders || 0), 1);
    return t.map((x: any, i: number) => ({ ...x, fill: ((+x.orders || 0) / max) * 100, color: this.color(i) }));
  });

  // ===== Payments tab (REAL) =====
  payModeSegs = computed(() => this.donut(
    (this.dash()?.payModes ?? []).map((p: any, i: number) => ({ label: p.mode || '—', value: +p.amount, color: this.color(i) }))
  ));
  payModeTotal = computed(() => (this.dash()?.payModes ?? []).reduce((s: number, x: any) => s + (+x.amount || 0), 0));

  commBars = computed(() => {
    const t = this.dash()?.trend ?? [];
    const max = Math.max(...t.map((m: any) => +m.commission || 0), 1);
    return t.map((m: any) => ({ label: m.label, v: +m.commission || 0, h: ((+m.commission || 0) / max) * 130 }));
  });
  commMax = computed(() => Math.max(...(this.dash()?.trend ?? []).map((m: any) => +m.commission || 0), 0));

  agingBars = computed(() => {
    const a = this.dash()?.aging ?? [];
    const max = Math.max(...a.map((x: any) => +x.amount || 0), 1);
    const colors = ['#10B981', '#FCD34D', '#F97316', '#DC2626'];
    return a.map((x: any, i: number) => ({ label: x.label, v: +x.amount || 0, h: ((+x.amount || 0) / max) * 130, color: colors[i % 4] }));
  });
  agingMax = computed(() => Math.max(...(this.dash()?.aging ?? []).map((x: any) => +x.amount || 0), 0));

  outstandingRows = computed(() => this.dash()?.outstanding ?? []);

  // ===== Operations tab (REAL) =====
  grTrendPts = computed(() => {
    const t = this.dash()?.trend ?? [];
    const max = Math.max(...t.map((m: any) => +m.gr || 0), 1);
    return t.map((m: any, i: number) => ({
      label: m.label, v: +m.gr || 0,
      x: 35 + i * 24,
      y: 160 - ((+m.gr || 0) / max) * 130
    }));
  });
  grTrendPath = computed(() => this.grTrendPts().map((p: any) => `${p.x},${p.y}`).join(' '));
  grMax = computed(() => Math.max(...(this.dash()?.trend ?? []).map((m: any) => +m.gr || 0), 0));

  grReasonSegs = computed(() => this.donut(
    (this.dash()?.grReasons ?? []).map((r: any, i: number) => ({ label: r.reason || 'Other', value: +r.amount, color: this.color(i + 4) }))
  ));
  grStatusSegs = computed(() => {
    const colorMap: any = { pending: '#FCD34D', approved: '#10B981', rejected: '#DC2626' };
    return this.donut(
      (this.dash()?.grStatus ?? []).map((s: any, i: number) => ({
        label: s.status || '—', value: +s.n, color: colorMap[s.status] || this.color(i)
      }))
    );
  });

  supplierPerfRows = computed(() => {
    const rows = this.dash()?.supplierPerf ?? [];
    return rows.map((s: any, i: number) => {
      const pct = +s.returnPct || 0;
      return {
        ...s,
        avatarColor: this.color(i),
        badge: pct > 5 ? '⚠️ High returns' : pct > 2 ? '🟡 Watch returns' : '✅ Reliable',
        badgeClass: pct > 5 ? 'badge-warn' : 'badge-good',
        fill: Math.max(5, 100 - pct * 5),
        barColor: pct > 5 ? '#DC2626' : pct > 2 ? '#FCD34D' : '#10B981'
      };
    });
  });

  // ===== Parties tab (REAL) =====
  partyOutBars = computed(() => {
    const rows = this.dash()?.partyOut ?? [];
    if (!rows.length) return [];
    const max = Math.max(...rows.map((p: any) => Math.max(+p.receivable || 0, +p.payable || 0)), 1);
    return rows.map((p: any) => ({
      name: (p.name || '—').substring(0, 10),
      receivable: +p.receivable || 0,
      payable: +p.payable || 0,
      rH: ((+p.receivable || 0) / max) * 145,
      pH: ((+p.payable || 0) / max) * 145
    }));
  });
  partyOutMax = computed(() => {
    const rows = this.dash()?.partyOut ?? [];
    return Math.max(...rows.map((p: any) => Math.max(+p.receivable || 0, +p.payable || 0)), 0);
  });

  ratingSegs = computed(() => {
    const colorMap: any = { 'A+': '#10B981', 'A': '#FCD34D', 'B': '#F97316', 'C': '#DC2626', '—': '#9CA3AF' };
    return this.donut(
      (this.dash()?.ratings ?? []).map((r: any, i: number) => ({
        label: r.rating, value: +r.n, color: colorMap[r.rating] || this.color(i)
      }))
    );
  });

  cityRows = computed(() => {
    const rows = this.dash()?.cities ?? [];
    if (!rows.length) return [];
    const max = Math.max(...rows.map((c: any) => +c.n || 0), 1);
    return rows.map((c: any, i: number) => ({
      name: (c.city || '—').substring(0, 12),
      count: +c.n || 0,
      bar: Math.max(8, ((+c.n || 0) / max) * 180),
      color: this.color(i)
    }));
  });

  supplierCommRows = computed(() => {
    const rows = this.dash()?.supplierComm ?? [];
    if (!rows.length) return [];
    const max = Math.max(...rows.map((s: any) => +s.amount || 0), 1);
    return rows.map((s: any, i: number) => ({
      name: (s.name || '—').substring(0, 12),
      amount: +s.amount || 0,
      bar: Math.max(8, ((+s.amount || 0) / max) * 170),
      color: this.color(i)
    }));
  });

  topBuyersRows = computed(() => {
    const rows = this.dash()?.topBuyers ?? [];
    return rows.map((b: any) => ({
      ...b,
      paidPct: +b.sales > 0 ? Math.round(((+b.sales - +b.outstanding) / +b.sales) * 100) : 0
    }));
  });
}
