import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TradingSubNavComponent } from '../components/trading-sub-nav.component';
import { firstValueFrom } from 'rxjs';
import { TradingService, BillListItem, Party } from '../services/trading.service';
import { todayLocal, toLocalYmd } from '../../../shared/date.util';
import { InvoicePreviewComponent, PreviewData } from '../../../shared/invoice-preview.component';

interface CommBill {
  selected: boolean;
  sr: number;
  id: string;
  billDate: string;
  supplier: string;
  buyer: string;
  billNo: string;
  billAmt: number;
  paidAmt: number;
  pending: number;
  payTermsDays: number;
  dueDate: string;
  agingDays: number;          // negative = overdue, positive = days left, 0 = today
  commPct: number;
  commAmt: number;
  status: 'paid' | 'partial' | 'pending';
}
import { BackButtonComponent } from '../../../shared/back-button.component';
import { InDatePipe } from '../../../shared/in-date.pipe';
import { PaginatorComponent } from '../../../shared/paginator.component';
import { FeatureService } from '../../../shared/feature.service';
import { amountInWords } from '../../../shared/amount-in-words.util';

@Component({
  selector: 'app-commission',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, TradingSubNavComponent, BackButtonComponent, InvoicePreviewComponent, InDatePipe, PaginatorComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <!-- ============ HEADER ============ -->
      <div class="comm-header">
        <div class="ch-left">
          <span class="ch-ico">🧾</span>
          <h2 class="ch-title">Commission e-Invoices</h2>
        </div>
        <div class="ch-right">{{ today() }}</div>
      </div>

      <!-- ============ SUB NAV ============ -->
      <app-trading-sub-nav></app-trading-sub-nav>

            <!-- ============ FILTER ============ -->
      <div class="section-card">
        <div class="section-head">🔍 FILTER</div>
        <div class="grid grid-cols-4 gap-3 mt-3 items-end">
          <div>
            <label class="lbl">FROM DATE</label>
            <input [(ngModel)]="fromDate" type="date" class="ip">
          </div>
          <div>
            <label class="lbl">TO DATE</label>
            <input [(ngModel)]="toDate" type="date" class="ip">
          </div>
          <div>
            <label class="lbl">SUPPLIER</label>
            <input type="text" [ngModel]="supplierFilter()" (ngModelChange)="supplierFilter.set($event)"
                   placeholder="🔍 Search by GST / Name / Code" class="ip mb-1" style="font-size:12px;padding:5px 8px">
            <select [(ngModel)]="supplierId" class="ip">
              <option value="">— All Suppliers ({{ filteredSuppliers().length }}) —</option>
              @for (p of filteredSuppliers(); track p.id) {
                <option [value]="p.id">{{ p.displayName }} {{ p.gst ? '— ' + p.gst : '' }}</option>
              }
            </select>
          </div>
          <div class="flex gap-2">
            <button (click)="apply()" class="btn-red">🎯 Get</button>
            <button (click)="reset()" class="btn-refresh">⟲</button>
          </div>
        </div>
      </div>

      <!-- ============ STATS CARDS ============ -->
      <div class="grid grid-cols-5 gap-3 mt-4">
        <div class="stat-card stat-default">
          <div class="stat-label">TOTAL BILLS</div>
          <div class="stat-value">{{ totalBillsCount() }}</div>
        </div>
        <div class="stat-card stat-purple">
          <div class="stat-label">TOTAL BILL AMT</div>
          <div class="stat-value">₹{{ totalBillAmt() | number:'1.0-0' }}</div>
          @if (inWords(totalBillAmt())) { <div class="stat-words">{{ inWords(totalBillAmt()) }}</div> }
        </div>
        <div class="stat-card stat-green">
          <div class="stat-label">✅ PAID</div>
          <div class="stat-value">₹{{ paidAmt() | number:'1.0-0' }}</div>
          @if (inWords(paidAmt())) { <div class="stat-words">{{ inWords(paidAmt()) }}</div> }
        </div>
        <div class="stat-card stat-red">
          <div class="stat-label">⚪ UNPAID</div>
          <div class="stat-value">₹{{ unpaidAmt() | number:'1.0-0' }}</div>
          @if (inWords(unpaidAmt())) { <div class="stat-words">{{ inWords(unpaidAmt()) }}</div> }
        </div>
        <div class="stat-card stat-yellow">
          <div class="stat-label">🪙 COMMISSION</div>
          <div class="stat-value">₹{{ totalComm() | number:'1.0-0' }}</div>
          @if (inWords(totalComm())) { <div class="stat-words">{{ inWords(totalComm()) }}</div> }
        </div>
      </div>

      <!-- ============ ANALYTICS CHARTS ============ -->
      <div class="section-card mt-4">
        <div class="section-head">📊 COMMISSION ANALYTICS</div>
        <div class="grid grid-cols-3 gap-4 mt-3">

          <!-- Monthly bar chart (REAL — bills se) -->
          <div>
            <div class="chart-title">MONTHLY COMMISSION EARNED (₹)</div>
            @if (monthData().length) {
              <svg viewBox="0 0 360 160" class="chart-svg">
                <text x="5" y="20" class="ax-lbl">{{ commAxis(1) }}</text>
                <text x="5" y="80" class="ax-lbl">{{ commAxis(0.5) }}</text>
                <text x="5" y="148" class="ax-lbl">₹0</text>
                @for (m of monthData(); track m.label; let i = $index) {
                  <g [attr.transform]="'translate(' + (40 + i * 52) + ', 0)'">
                    <rect [attr.x]="0" [attr.y]="140 - m.value" [attr.width]="36" [attr.height]="m.value"
                          fill="#1B2E5C"></rect>
                    <text x="18" y="155" class="ax-lbl" text-anchor="middle">{{ m.label }}</text>
                  </g>
                }
              </svg>
            } @else {
              <div class="chart-empty">Abhi data nahi — bills aate hi yahan dikhega</div>
            }
          </div>

          <!-- Paid vs Unpaid donut -->
          <div>
            <div class="chart-title">PAID VS UNPAID</div>
            <svg viewBox="0 0 200 160" class="chart-svg">
              <circle cx="100" cy="80" r="55" fill="none" stroke="#F5EFE3" stroke-width="22"></circle>
              <circle cx="100" cy="80" r="55" fill="none" stroke="#10B981" stroke-width="22"
                      [attr.stroke-dasharray]="paidArc() + ' ' + (346 - paidArc())"
                      transform="rotate(-90 100 80)"></circle>
              <circle cx="100" cy="80" r="55" fill="none" stroke="#DC2626" stroke-width="22"
                      [attr.stroke-dasharray]="(346 - paidArc()) + ' ' + paidArc()"
                      [attr.stroke-dashoffset]="-paidArc()" transform="rotate(-90 100 80)"></circle>
            </svg>
            <div class="chart-legend">
              <span><span class="lg-sw" style="background:#10B981"></span> Paid {{ paidPct() }}%</span>
              <span><span class="lg-sw" style="background:#DC2626"></span> Unpaid {{ 100 - paidPct() }}%</span>
            </div>
          </div>

          <!-- Supplier-wise horizontal bar -->
          <div>
            <div class="chart-title">SUPPLIER-WISE COMMISSION</div>
            <svg viewBox="0 0 280 160" class="chart-svg">
              @for (s of supplierData(); track s.name; let i = $index) {
                <g [attr.transform]="'translate(0, ' + (15 + i * 32) + ')'">
                  <text x="0" y="15" class="ax-lbl">{{ s.name }}</text>
                  <rect x="65" y="3" [attr.width]="s.bar" height="18"
                        [attr.fill]="i === 0 ? '#1B2E5C' : (i === 1 ? '#DC2626' : (i === 2 ? '#F97316' : '#10B981'))"></rect>
                </g>
              }
            </svg>
            <div class="chart-legend">
              <span class="ax-tick">₹0</span>
              <span class="ax-tick">{{ supAxis(0.5) }}</span>
              <span class="ax-tick">{{ supAxis(1) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ TAB STRIP ============ -->
      <div class="tab-strip mt-4">
        <button (click)="activeTab.set('all')" [class.tab-active]="activeTab() === 'all'" class="tab-btn">
          📋 All Bills <span class="tab-count">{{ commBills().length }}</span>
        </button>
        <button (click)="activeTab.set('paid')" [class.tab-active]="activeTab() === 'paid'" class="tab-btn">
          ✅ Paid <span class="tab-count">{{ paidCount() }}</span>
        </button>
        <button (click)="activeTab.set('unpaid')" [class.tab-active]="activeTab() === 'unpaid'" class="tab-btn">
          ⚪ Unpaid / Overdue <span class="tab-count">{{ unpaidCount() }}</span>
        </button>
      </div>

      <!-- ============ BILLS TABLE ============ -->
      <div class="section-card">
        <div class="flex items-center justify-between">
          <div class="section-head no-border">📒 {{ activeTab() === 'all' ? 'ALL BILLS' : activeTab() === 'paid' ? 'PAID' : 'UNPAID / OVERDUE' }}</div>
          <div class="legend-row">
            <span class="lg-item"><span class="dot dot-red"></span> Red = Overdue</span>
            <span class="lg-item"><span class="dot dot-yellow"></span> Yellow = Due in 5 days</span>
          </div>
        </div>

        <div class="bill-table-wrap mt-2">
          <table class="bill-table">
            <thead>
              <tr>
                <th>SR.</th>
                <th>BILL DATE</th>
                <th>SUPPLIER</th>
                <th>BUYER</th>
                <th>BILL NO</th>
                <th class="text-right">BILL AMT</th>
                <th class="text-right">PAID AMT</th>
                <th class="text-right">PENDING</th>
                <th class="text-center">PAY TERMS</th>
                <th>DUE DATE</th>
                <th class="text-center">AGING</th>
                <th class="text-center">COMM%</th>
                <th class="text-right">COMM AMT</th>
                <th class="text-center">STATUS</th>
              </tr>
            </thead>
            <tbody>
              @if (filteredBills().length === 0) {
                <tr><td colspan="14" class="empty-row">No bills found for selected filters</td></tr>
              }
              @for (b of pagedBills(); track b.id) {
                <tr [class.row-overdue]="b.agingDays < 0 && b.status !== 'paid'"
                    [class.row-soon]="b.agingDays >= 0 && b.agingDays <= 5 && b.status !== 'paid'">
                  <td>{{ b.sr }}</td>
                  <td class="text-xs">{{ b.billDate | inDate }}</td>
                  <td>{{ b.supplier }}</td>
                  <td>{{ b.buyer }}</td>
                  <td class="font-mono text-xs font-bold">{{ b.billNo }}</td>
                  <td class="text-right font-mono">{{ b.billAmt | number:'1.2-2' }}</td>
                  <td class="text-right font-mono text-green-600">{{ b.paidAmt > 0 ? (b.paidAmt | number:'1.2-2') : '—' }}</td>
                  <td class="text-right font-mono text-red-600">{{ b.pending > 0 ? (b.pending | number:'1.2-2') : '—' }}</td>
                  <td class="text-center"><span class="term-tag">{{ b.payTermsDays }}d</span></td>
                  <td class="text-xs">{{ b.dueDate | inDate }}</td>
                  <td class="text-center">
                    @if (b.status === 'paid') { <span class="aging-tag aging-done">✅ Done</span> }
                    @else if (b.agingDays < 0) { <span class="aging-tag aging-overdue">{{ -b.agingDays }}d overdue</span> }
                    @else if (b.agingDays === 0) { <span class="aging-tag aging-today">Today</span> }
                    @else { <span class="aging-tag aging-left">{{ b.agingDays }}d left</span> }
                  </td>
                  <td class="text-center font-bold">{{ b.commPct }}%</td>
                  <td class="text-right font-mono total-cell">{{ b.commAmt > 0 ? (b.commAmt | number:'1.2-2') : '—' }}</td>
                  <td class="text-center">
                    @if (b.status === 'paid') { <span class="status-tag status-paid">✅ Paid</span> }
                    @else if (b.status === 'partial') { <span class="status-tag status-partial">❎ Partial</span> }
                    @else { <span class="status-tag status-pending">⚪ Pending</span> }
                  </td>
                </tr>
              }
            </tbody>
            @if (filteredBills().length > 0) {
              <tfoot>
                <tr>
                  <td colspan="5" class="text-center">Totals</td>
                  <td class="text-right font-mono">{{ totalBillAmt() | number:'1.2-2' }}</td>
                  <td class="text-right font-mono">{{ paidAmt() | number:'1.2-2' }}</td>
                  <td class="text-right font-mono">{{ unpaidAmt() | number:'1.2-2' }}</td>
                  <td colspan="4"></td>
                  <td class="text-right font-mono total-cell">{{ totalComm() | number:'1.2-2' }}</td>
                  <td colspan="1"></td>
                </tr>
              </tfoot>
            }
          </table>
          <app-paginator [total]="filteredBills().length" [page]="pageClamped()" [pageSize]="pageSize()"
                         (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event); page.set(1)"></app-paginator>
        </div>

        <div class="bottom-actions">
          <a routerLink="/trading/commission/new" class="btn-red" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px;">🧾 Generate Commission Invoice</a>
          <button (click)="printList()" class="btn-light">🖨 Print List</button>
        </div>
      </div>

      <!-- ============ GENERATED COMMISSION INVOICES ============ -->
      <div class="section-card mt-4">
        <div class="flex items-center justify-between">
          <div class="section-head no-border">🧾 GENERATED COMMISSION INVOICES <span class="text-xs font-normal text-gray-500 ml-2">({{ generatedInvoices().length }})</span></div>
          <button (click)="loadInvoices()" class="btn-light text-xs">🔄 Refresh</button>
        </div>

        <div class="bill-table-wrap mt-2">
          <table class="bill-table">
            <thead>
              <tr>
                <th>SR.</th>
                <th>INVOICE NO</th>
                <th>DATE</th>
                <th>PARTY</th>
                <th class="text-center">BILLS</th>
                <th class="text-right">GROSS</th>
                <th class="text-center">COMM%</th>
                <th class="text-right">COMM AMT</th>
                <th class="text-center">GST%</th>
                <th class="text-right">GST AMT</th>
                <th class="text-right">TOTAL</th>
                <th class="text-center">STATUS</th>
                <th class="text-center">ACTION</th>
              </tr>
            </thead>
            <tbody>
              @if (generatedInvoices().length === 0) {
                <tr><td colspan="13" class="empty-row">No commission invoices generated yet. Select bills above and click "Bulk Invoice".</td></tr>
              }
              @for (inv of generatedInvoices(); track inv.id; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td class="font-mono text-xs font-bold text-[#1B2E5C]">{{ inv.invoiceNo }}</td>
                  <td class="text-xs">{{ inv.invoiceDate | inDate }}
                    <div class="text-[10px] text-gray-400 whitespace-nowrap">🕐 {{ inv.createdAt ? (inv.createdAt | date:'dd/MM/yy, hh:mm a') : '' }}</div>
                  </td>
                  <td>{{ inv.partyName }}</td>
                  <td class="text-center"><span class="term-tag">{{ inv.billCount }}</span></td>
                  <td class="text-right font-mono">{{ inv.grossAmount | number:'1.2-2' }}</td>
                  <td class="text-center font-bold">{{ inv.commissionPct }}%</td>
                  <td class="text-right font-mono">{{ inv.commissionAmount | number:'1.2-2' }}</td>
                  <td class="text-center">{{ inv.gstPct }}%</td>
                  <td class="text-right font-mono">{{ inv.gstAmount | number:'1.2-2' }}</td>
                  <td class="text-right font-mono total-cell font-bold">{{ inv.totalAmount | number:'1.2-2' }}</td>
                  <td class="text-center">
                    <span class="status-tag" [class.status-paid]="inv.status === 'paid'" [class.status-pending]="inv.status === 'pending'">
                      {{ inv.status === 'paid' ? '✅ Paid' : '⚪ ' + inv.status }}
                    </span>
                  </td>
                  <td class="text-center">
                    <button (click)="previewInvoice(inv)" class="action-btn action-preview">👁 Preview</button>
                    <button (click)="waInvoice(inv)" class="action-btn action-wa">💬 WhatsApp</button>
                    <button (click)="deleteInvoice(inv)" class="action-btn action-reminder">🗑 Delete</button>
                  </td>
                </tr>
              }
            </tbody>
            @if (generatedInvoices().length > 0) {
              <tfoot>
                <tr>
                  <td colspan="5" class="text-center">Totals</td>
                  <td class="text-right font-mono">{{ invSum('grossAmount') | number:'1.2-2' }}</td>
                  <td></td>
                  <td class="text-right font-mono">{{ invSum('commissionAmount') | number:'1.2-2' }}</td>
                  <td></td>
                  <td class="text-right font-mono">{{ invSum('gstAmount') | number:'1.2-2' }}</td>
                  <td class="text-right font-mono total-cell">{{ invSum('totalAmount') | number:'1.2-2' }}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
      </div>

      @if (previewData()) {
        <app-invoice-preview [data]="previewData()!" (close)="previewData.set(null)"></app-invoice-preview>
      }

    </div>
  `,
  styles: [`
    :host { display: block; background: #FAF7F0; min-height: 100vh; padding: 16px 0; }

    .comm-header {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 14px 22px; border-radius: 12px 12px 0 0;
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;
      box-shadow: 0 2px 8px rgba(27,46,92,0.12);
    }
    .ch-left { display: flex; align-items: center; gap: 10px; }
    .ch-ico { font-size: 22px; }
    .ch-title { font-size: 17px; font-weight: 800; margin: 0; }
    .ch-right { font-size: 13px; font-weight: 700; opacity: 0.9; }

    .section-card {
      background: #fff; border: 1px solid #D6DDEA; border-radius: 10px;
      padding: 14px 18px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(27,46,92,0.04);
    }
    .section-head {
      font-size: 13px; font-weight: 800; color: #DC2626; letter-spacing: 0.5px;
      padding-bottom: 8px; border-bottom: 1px solid #F5EFE3;
      display: flex; align-items: center; gap: 6px;
    }
    .section-head.no-border { border-bottom: 0; padding-bottom: 0; }

    .lbl { display: block; font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.5px; margin-bottom: 4px; text-transform: uppercase; }
    .ip {
      width: 100%; padding: 8px 10px; border: 1px solid #D6DDEA; border-radius: 6px;
      font-size: 13px; color: #1B2E5C; background: #fff; font-family: inherit;
    }
    .ip:focus { outline: none; border-color: #DC2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.1); }

    .btn-red {
      background: #DC2626; color: #fff; padding: 9px 16px; border-radius: 6px;
      font-weight: 700; font-size: 13px; border: 0; cursor: pointer; font-family: inherit;
    }
    .btn-red:hover { background: #B91C1C; }
    .btn-refresh {
      background: #fff; border: 1px solid #D6DDEA; padding: 9px 12px; border-radius: 6px;
      cursor: pointer; font-size: 14px;
    }
    .btn-refresh:hover { background: #F5EFE3; }

    /* STATS */
    .stat-card { border: 1px solid #D6DDEA; border-radius: 10px; padding: 14px; background: #fff; }
    .stat-default { background: #fff; }
    .stat-purple { background: #F5EFE3; border-color: #5c1a8b; }
    .stat-green  { background: #FEF3C7; border-color: #FBBF24; }
    .stat-red    { background: #FEE2E2; border-color: #DC2626; }
    .stat-yellow { background: #FFFBEB; border-color: #FCD34D; }
    .stat-label { font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.5px; text-transform: uppercase; }
    .stat-value { font-size: 22px; font-weight: 800; color: #1B2E5C; margin-top: 6px; font-family: 'JetBrains Mono', monospace; }
    .stat-words { font-size: 10px; font-weight: 600; color: #4A5878; font-style: italic; margin-top: 4px; line-height: 1.3; }

    /* CHARTS */
    .chart-title { font-size: 10px; font-weight: 800; color: #4A5878; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; }
    .chart-empty { padding: 40px 10px; text-align: center; color: #9CA3AF; font-size: 11px; }
    .chart-svg { width: 100%; height: 160px; }
    .ax-lbl { font-size: 9px; fill: #6B7280; font-family: inherit; }
    .ax-tick { font-size: 10px; color: #6B7280; }
    .chart-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 6px; font-size: 11px; color: #4A5878; }
    .lg-sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }

    /* TAB STRIP */
    .tab-strip { display: flex; gap: 4px; background: #fff; border: 1px solid #D6DDEA; border-radius: 10px 10px 0 0; padding: 4px; }
    .tab-btn {
      flex: 1; padding: 12px; font-size: 13px; font-weight: 700; color: #4A5878;
      background: transparent; border: 0; cursor: pointer; font-family: inherit; border-radius: 8px;
      transition: background 0.15s, color 0.15s;
    }
    .tab-btn:hover { background: #F5EFE3; }
    .tab-active { background: var(--anjaninex-navy, #1B2E5C); color: #fff; }
    .tab-count { background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 999px; margin-left: 6px; font-size: 11px; }
    .tab-btn:not(.tab-active) .tab-count { background: #E5E9F2; color: #4A5878; }

    /* COMMISSION BASE TOGGLE */
    .base-toggle { display: inline-flex; align-items: center; gap: 0; border: 1px solid #D6DDEA; border-radius: 8px; overflow: hidden; background: #fff; }
    .base-toggle .bt-lbl { font-size: 9px; font-weight: 800; color: #8a93ad; letter-spacing: 0.5px; padding: 0 8px; }
    .base-toggle button { padding: 6px 12px; font-size: 11px; font-weight: 700; color: #4A5878; background: #fff; border: 0; border-left: 1px solid #D6DDEA; cursor: pointer; font-family: inherit; }
    .base-toggle button.active { background: var(--anjaninex-navy, #1B2E5C); color: #fff; }

    /* LEGEND ROW */
    .legend-row { display: flex; gap: 12px; font-size: 11px; color: #4A5878; }
    .lg-item { display: inline-flex; align-items: center; gap: 4px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot-red { background: #DC2626; }
    .dot-yellow { background: #FCD34D; }

    /* BILL TABLE */
    .bill-table-wrap { overflow-x: auto; border: 1px solid #D6DDEA; border-radius: 8px; }
    .bill-table { width: 100%; font-size: 11.5px; border-collapse: collapse; background: #fff; }
    .bill-table thead { background: var(--anjaninex-navy, #1B2E5C); color: #fff; }
    .bill-table th {
      padding: 8px 6px; text-align: left; font-weight: 700; font-size: 10px;
      letter-spacing: 0.3px; text-transform: uppercase; white-space: nowrap;
    }
    .bill-table th.text-right { text-align: right; }
    .bill-table th.text-center { text-align: center; }
    .bill-table td { padding: 6px 6px; border-bottom: 1px solid #F5EFE3; vertical-align: middle; }
    .bill-table tbody tr:hover { background: #FAF7F0; }
    .row-overdue { background: #FEE2E2 !important; }
    .row-soon { background: #FEF3C7 !important; }
    .bill-table tfoot { background: var(--anjaninex-navy, #1B2E5C); color: #fff; font-weight: 800; }
    .bill-table tfoot td { padding: 8px 6px; }

    .empty-row { text-align: center; padding: 30px; color: #9CA3AF; font-size: 13px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .total-cell { color: #DC2626; font-weight: 800; }

    .term-tag, .aging-tag, .status-tag {
      display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
    }
    .term-tag { background: #E5E9F2; color: #4A5878; }
    .aging-done { background: #D1FAE5; color: #047857; }
    .aging-overdue { background: #FEE2E2; color: #DC2626; }
    .aging-today { background: #FEF3C7; color: #92400E; }
    .aging-left { background: #E5E9F2; color: #4A5878; }
    .status-paid { background: #D1FAE5; color: #047857; }
    .status-partial { background: #FED7AA; color: #C2410C; }
    .status-pending { background: #FEF3C7; color: #92400E; }

    .action-btn {
      padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;
      border: 1px solid #D6DDEA; background: #fff; cursor: pointer; font-family: inherit;
      margin-right: 4px;
    }
    .action-preview { color: #1B2E5C; }
    .action-preview:hover { background: #E5E9F2; }
    .action-reminder { background: #FEF3C7; color: #92400E; border-color: #FCD34D; }
    .action-reminder:hover { background: #FDE68A; }
    .action-wa { background: #dcfce7; color: #15803d; border-color: #86efac; }
    .action-wa:hover { background: #bbf7d0; }

    /* BOTTOM */
    .bottom-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; margin-top: 10px; border-top: 1px solid #F5EFE3; }
    .btn-light {
      padding: 9px 18px; background: #fff; border: 1px solid #D6DDEA; border-radius: 8px;
      font-size: 13px; font-weight: 700; color: #4A5878; cursor: pointer; font-family: inherit;
    }
    .btn-light:hover { background: #F5EFE3; }
    .btn-orange {
      padding: 9px 18px; background: #F97316; color: #fff; border-radius: 8px;
      font-size: 13px; font-weight: 800; border: 0; cursor: pointer; font-family: inherit;
      box-shadow: 0 2px 6px rgba(249,115,22,0.3);
    }
    .btn-orange:hover { background: #EA580C; }

    @media (max-width: 640px) {
      :host { padding: 8px 0; }
      .comm-header { flex-wrap: wrap; gap: 8px; padding: 12px 14px; }
      .section-card { padding: 12px 12px; }
      /* All filter / stats / chart grids → single column */
      .grid-cols-2, .grid-cols-3, .grid-cols-4, .grid-cols-5 { grid-template-columns: 1fr !important; }
      .ip { width: 100% !important; }
      .stat-value { font-size: 18px; }
      .tab-strip { flex-wrap: wrap; }
      .tab-btn { flex: 1 1 100%; }
      .legend-row { flex-wrap: wrap; }
      /* Tables horizontally scrollable (wrapper already overflow-x but enforce block) */
      .bill-table-wrap { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .bill-table { white-space: nowrap; }
      .bottom-actions { flex-wrap: wrap; }
    }
  `]
})
export class CommissionComponent {
  readonly inWords = amountInWords;   // card amount → words (Indian Lakh/Crore)
  private svc = inject(TradingService);
  features = inject(FeatureService);

  parties = signal<Party[]>([]);
  rawBills = signal<BillListItem[]>([]);
  saving = signal(false);

  // Filters
  fromDate = '2000-01-01';   // default: SAARE bills (purane 2023 wale bhi) — date se filter na ho
  toDate = todayLocal();   // LOCAL date — UTC shift nahi
  supplierId = '';
  activeTab = signal<'all' | 'paid' | 'unpaid'>('all');
  // Commission base: 'after' = bill total (GST included), 'before' = taxable (GST se pehle)
  commBase = signal<'before' | 'after'>('after');

  // GST/Name/Code filter
  supplierFilter = signal('');

  // Sirf SUPPLIERS — Party Master ke hisaab se (partyType seller/both). Buyers dropdown me nahi.
  filteredSuppliers = computed(() => {
    const base = this.parties().filter(p =>
      p.partyType === 'seller' || p.partyType === 'both');
    const t = this.supplierFilter().toLowerCase().trim();
    if (!t) return base;
    return base.filter(p =>
      (p.displayName || '').toLowerCase().includes(t) ||
      (p.gst || '').toLowerCase().includes(t) ||
      (p.partyCode || '').toLowerCase().includes(t) ||
      (p.city || '').toLowerCase().includes(t) ||
      (p.phone || '').toLowerCase().includes(t)
    );
  });

  // Constants
  DEFAULT_COMM_PCT = 7;
  DEFAULT_PAY_TERMS = 30;

  today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // REAL — commission month-wise (bills se), last 6 months with data
  monthData = computed(() => {
    const map = new Map<string, { label: string; v: number }>();
    for (const b of this.commBills()) {
      const d = new Date(b.billDate);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      const cur = map.get(key) ?? { label: d.toLocaleString('en', { month: 'short' }), v: 0 };
      cur.v += b.commAmt;
      map.set(key, cur);
    }
    const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    if (!entries.length) return [];
    const max = Math.max(...entries.map(e => e[1].v), 1);
    return entries.map(([, m]) => ({ label: m.label, v: m.v, value: (m.v / max) * 120 }));
  });
  monthMax = computed(() => Math.max(...this.monthData().map(m => m.v), 0));
  private kFmt(v: number): string {
    if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
    if (v >= 1000) return '₹' + Math.round(v / 1000) + 'K';
    return '₹' + Math.round(v);
  }
  commAxis(f: number): string { return this.kFmt(this.monthMax() * f); }
  supMax = computed(() => {
    const map = new Map<string, number>();
    for (const b of this.commBills()) map.set(b.supplier, (map.get(b.supplier) || 0) + b.commAmt);
    return Math.max(...Array.from(map.values()), 0);
  });
  supAxis(f: number): string { return this.kFmt(this.supMax() * f); }

  async ngOnInit() {
    this.parties.set(await firstValueFrom(this.svc.listParties()));
    this.apply();
    this.loadInvoices();
  }

  async apply() {
    const res = await firstValueFrom(this.svc.listBills({
      from: this.fromDate || undefined,
      to: this.toDate || undefined,
      partyId: this.supplierId || undefined
    }));
    this.rawBills.set(res.items.filter(b => !b.isDeleted)); // deleted bills commission me nahi
  }

  reset() {
    this.fromDate = '2000-01-01';
    this.toDate = todayLocal();
    this.supplierId = '';
    this.apply();
  }

  commBills = computed<CommBill[]>(() => {
    const today = new Date();
    // Party Master se rate map — supplier ya buyer jiska commission set ho
    const rateById = new Map<string, number>();
    for (const p of this.parties()) rateById.set(p.id, +(p.commissionRate ?? 0));
    return this.rawBills().map((b, idx) => {
      const billDate = new Date(b.billDate);
      const dueDate = new Date(billDate);
      dueDate.setDate(dueDate.getDate() + this.DEFAULT_PAY_TERMS);
      const agingMs = dueDate.getTime() - today.getTime();
      const agingDays = Math.round(agingMs / (1000 * 60 * 60 * 24));
      const pending = b.total - b.paidAmount;
      let status: 'paid' | 'partial' | 'pending' = 'pending';
      if (pending <= 0.01) status = 'paid';
      else if (b.paidAmount > 0) status = 'partial';

      // Commission % — Party Master se (supplier ya buyer jiska set ho), warna default
      const supRate = rateById.get(b.partyId) ?? 0;
      const buyRate = b.buyerPartyId ? (rateById.get(b.buyerPartyId) ?? 0) : 0;
      const commPct = supRate > 0 ? supRate : (buyRate > 0 ? buyRate : this.DEFAULT_COMM_PCT);

      // Commission base — toggle ke hisaab se (GST se pehle taxable, ya total)
      let base = b.total;
      if (this.commBase() === 'before') {
        base = (b.taxableAmount && b.taxableAmount > 0) ? b.taxableAmount
             : (b.taxAmount && b.taxAmount > 0) ? b.total - b.taxAmount
             : b.total;
      }

      return {
        selected: (b as any).selected ?? false,   // preserve checkbox state from rawBills
        sr: idx + 1,
        id: b.id,
        billDate: b.billDate,
        supplier: b.partyName,            // bill ka supplier
        buyer: b.buyerName || '—',        // asli buyer (pehle galti se supplier aa raha tha)
        billNo: b.billNo,
        billAmt: b.total,
        paidAmt: b.paidAmount,
        pending,
        payTermsDays: this.DEFAULT_PAY_TERMS,
        dueDate: toLocalYmd(dueDate),
        agingDays,
        commPct,
        commAmt: base * (commPct / 100),
        status
      };
    });
  });

  filteredBills = computed(() => {
    const all = this.commBills();
    if (this.activeTab() === 'paid') return all.filter(b => b.status === 'paid');
    if (this.activeTab() === 'unpaid') return all.filter(b => b.status !== 'paid');
    return all;
  });

  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageClamped = computed(() => {
    const pages = Math.max(1, Math.ceil(this.filteredBills().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });
  pagedBills = computed(() => {
    const st = (this.pageClamped() - 1) * this.pageSize();
    return this.filteredBills().slice(st, st + this.pageSize());
  });

  totalBillsCount = computed(() => this.commBills().length);
  totalBillAmt = computed(() => this.commBills().reduce((s, b) => s + b.billAmt, 0));
  paidAmt = computed(() => this.commBills().reduce((s, b) => s + b.paidAmt, 0));
  unpaidAmt = computed(() => this.totalBillAmt() - this.paidAmt());
  totalComm = computed(() => this.commBills().reduce((s, b) => s + b.commAmt, 0));
  paidCount = computed(() => this.commBills().filter(b => b.status === 'paid').length);
  unpaidCount = computed(() => this.commBills().filter(b => b.status !== 'paid').length);

  paidPct = computed(() => {
    const t = this.totalBillAmt();
    if (t === 0) return 0;
    return Math.round((this.paidAmt() / t) * 100);
  });
  paidArc = computed(() => Math.round((this.paidPct() / 100) * 346));

  supplierData = computed(() => {
    const map = new Map<string, number>();
    for (const b of this.commBills()) {
      map.set(b.supplier, (map.get(b.supplier) || 0) + b.commAmt);
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const max = sorted[0]?.[1] || 1;
    return sorted.map(([name, value]) => ({
      name: name.substring(0, 6),
      value,
      bar: Math.max(20, (value / max) * 200)
    }));
  });

  allSelected = computed(() => this.filteredBills().length > 0 && this.filteredBills().every(b => b.selected));

  updateBill(id: string, field: string, value: any) {
    this.rawBills.update(arr => arr.map(b => b.id === id ? { ...b, [field]: value } : b));
  }
  toggleAll(event: any) {
    const v = event.target.checked;
    this.rawBills.update(arr => arr.map(b => ({ ...b, selected: v })));
  }

  preview(b: CommBill) {
    // Fetch full bill detail + party details
    this.svc.getBill(b.id).subscribe(bill => {
      this.svc.getParty(bill.partyId).subscribe(party => {
        const lines = bill.lines.map(l => ({
          itemName: l.itemName,
          description: null,
          hsnSac: l.hsnSac,
          qty: l.qty,
          unit: l.unit,
          rate: l.rate,
          rd: l.discountPct,
          taxPct: l.taxRate,
          taxableAmount: l.taxableAmount,
          taxAmount: l.totalAmount - l.taxableAmount,
          totalAmount: l.totalAmount
        }));
        const partyCard = {
          name: party.displayName,
          gst: party.gst,
          mobile: party.phone,
          city: party.city,
          address: party.city ? `Address on file · ${party.city}` : null
        };
        const firmCard = {
          name: this.features.firmName() || 'Anjaninex',
          gst: this.features.firmGst(),
          mobile: '+91 98765 43210',
          city: 'Surat',
          address: 'Commission Agent · Surat, Gujarat — 395003'
        };
        this.previewData.set({
          type: 'bill',
          title: bill.billType === 'sales' ? 'SALES INVOICE' : 'PURCHASE BILL',
          number: bill.billNo,
          date: bill.billDate,
          firmName: this.features.firmName() || 'Anjaninex',
          firmGst: this.features.firmGst(),
          firmAddress: 'Commission Agent · Surat, Gujarat',
          supplier: firmCard,
          buyer: partyCard,
          supplierLabel: 'FROM (COMMISSION AGENT)',
          buyerLabel: 'TO SUPPLIER',
          commissionPct: b.commPct,
          commissionAmount: b.commAmt,
          lines,
          grossAmount: bill.total,
          taxableAmount: bill.taxableAmount,
          totalTax: bill.cgst + bill.sgst + bill.igst,
          cdAmount: bill.discount,
          netAmount: bill.total,
          paymentTerms: null,
          supplierOrderNo: bill.poNumber,
          notes: bill.notes || null
        });
      });
    });
  }
  previewData = signal<PreviewData | null>(null);
  reminder(b: CommBill) {
    alert(`🔔 Reminder sent to ${b.supplier}\nBill ${b.billNo} pending: ₹${b.pending.toFixed(2)}\nDue: ${b.dueDate}`);
  }
  printList() { window.print(); }
  bulkInvoice() {
    const selected = this.commBills().filter(b => b.selected);
    if (selected.length === 0) {
      alert('⚠️ Please select bills first using the checkboxes.');
      return;
    }
    // All selected bills must be for same party (since we group by party)
    const partyIds = new Set(this.rawBills().filter(b => selected.some(s => s.id === b.id)).map(b => b.partyId));
    if (partyIds.size > 1) {
      alert('⚠️ Selected bills are from multiple parties. Please select bills from one party only.');
      return;
    }
    const firstBill = this.rawBills().find(b => b.id === selected[0].id);
    if (!firstBill) return;

    const partyId = firstBill.partyId;
    const commTotal = selected.reduce((s, b) => s + b.commAmt, 0);
    const gstAmount = +(commTotal * 18 / 100).toFixed(2);
    const grandTotal = +(commTotal + gstAmount).toFixed(2);

    if (!confirm(
      `📑 Generate Commission Invoice?\n\n` +
      `Party: ${selected[0].supplier}\n` +
      `Bills: ${selected.length}\n` +
      `Commission Base: ₹${commTotal.toFixed(2)}\n` +
      `GST @ 18%: ₹${gstAmount.toFixed(2)}\n` +
      `Grand Total: ₹${grandTotal.toFixed(2)}\n\n` +
      `This will save the invoice to backend.`
    )) return;

    this.svc.createCommissionInvoice({
      partyId,
      commissionPct: selected[0].commPct,
      gstPct: 18,
      notes: `Bulk consolidation of ${selected.length} bills`,
      lines: selected.map(s => ({
        billId: s.id,
        billNo: s.billNo,
        billDate: s.billDate,
        billAmount: s.billAmt,
        commissionPct: s.commPct,
        commissionAmount: s.commAmt
      }))
    }).subscribe({
      next: (res) => {
        alert(
          `✅ Commission Invoice Saved!\n\n` +
          `Invoice No: ${res.invoiceNo}\n` +
          `Total Amount: ₹${res.totalAmount.toFixed(2)}\n\n` +
          `View it in the Generated Invoices section.`
        );
        // Clear selections and reload list
        this.rawBills.update(arr => arr.map(b => ({ ...b, selected: false } as any)));
        this.loadInvoices();
      },
      error: (e) => {
        alert('❌ Failed to save: ' + (e?.error?.error ?? 'unknown error'));
      }
    });
  }

  // Generated commission invoices list (saved from bulk)
  generatedInvoices = signal<any[]>([]);
  loadInvoices() {
    this.svc.listCommissionInvoices().subscribe({
      next: (list) => {
        // NEWEST upar (descending) — invoice no ke trailing number se
        const num = (s: any) => { const m = String(s ?? '').match(/(\d+)\s*$/); return m ? +m[1] : 0; };
        this.generatedInvoices.set([...list].sort((a: any, b: any) => num(b.invoiceNo) - num(a.invoiceNo)));
      },
      error: () => {}
    });
  }

  invSum(field: 'grossAmount' | 'commissionAmount' | 'gstAmount' | 'totalAmount'): number {
    return this.generatedInvoices().reduce((s, i) => s + (Number(i[field]) || 0), 0);
  }

  previewInvoice(inv: any) {
    this.svc.getCommissionInvoice(inv.id).subscribe(full => {
      this.svc.getParty(full.partyId).subscribe(party => {
        // Build preview lines from invoice lines (bill list)
        const lines = (full.lines || []).map((l: any) => ({
          itemName: `Commission on ${l.billNo}`,
          description: `Bill dated ${l.billDate} · Amount ₹${Number(l.billAmount).toFixed(2)}`,
          hsnSac: '996111',
          qty: 1,
          unit: 'NOS',
          rate: Number(l.commissionAmount),
          rd: 0,
          taxPct: Number(full.gstPct),
          taxableAmount: Number(l.commissionAmount),
          taxAmount: Number(l.commissionAmount) * Number(full.gstPct) / 100,
          totalAmount: Number(l.commissionAmount) * (1 + Number(full.gstPct) / 100)
        }));

        const partyCard = {
          name: party.displayName,
          gst: party.gst,
          mobile: party.phone,
          city: party.city,
          address: party.city ? `Address on file · ${party.city}` : null
        };
        const firmCard = {
          name: this.features.firmName() || 'Anjaninex',
          gst: this.features.firmGst(),
          mobile: '+91 98765 43210',
          city: 'Surat',
          address: 'Commission Agent · Surat, Gujarat — 395003'
        };

        this.previewData.set({
          type: 'commission',
          title: 'COMMISSION INVOICE',
          number: full.invoiceNo,
          date: full.invoiceDate,
          firmName: this.features.firmName() || 'Anjaninex',
          firmGst: this.features.firmGst(),
          firmAddress: 'Commission Agent · Surat, Gujarat',
          supplier: firmCard,
          buyer: partyCard,
          supplierLabel: 'FROM (COMMISSION AGENT)',
          buyerLabel: 'TO (SUPPLIER)',
          lines,
          grossAmount: Number(full.grossAmount),
          taxableAmount: Number(full.commissionAmount),
          totalTax: Number(full.gstAmount),
          cdAmount: 0,
          netAmount: Number(full.totalAmount),
          paymentTerms: null,
          supplierOrderNo: null,
          notes: full.notes
        });
      });
    });
  }

  /** Invoice party ko WhatsApp — message me invoice detail pre-filled */
  waInvoice(inv: any) {
    const p = this.parties().find(x => x.displayName === inv.partyName);
    const digits = (p?.phone || '').replace(/\D/g, '');
    if (!digits) { alert(`"${inv.partyName}" ka phone number Party Master me save nahi hai`); return; }
    const ten = digits.length > 10 ? digits.slice(-10) : digits;
    const msg = encodeURIComponent(
      `Commission Invoice ${inv.invoiceNo}\n` +
      `Date: ${inv.invoiceDate}\n` +
      `Bills: ${inv.billCount}\n` +
      `Total: ₹${(+inv.totalAmount).toFixed(2)}\n\n` +
      `- ${this.features.firmName() || 'Anjaninex'}`
    );
    window.open(`https://wa.me/91${ten}?text=${msg}`, '_blank');
  }

  deleteInvoice(inv: any) {
    if (!confirm(`🗑 Delete commission invoice ${inv.invoiceNo}?\n\nThis cannot be undone.`)) return;
    this.svc.deleteCommissionInvoice(inv.id).subscribe({
      next: () => {
        alert('✅ Invoice deleted');
        this.loadInvoices();
      },
      error: (e) => alert('❌ Delete failed: ' + (e?.error?.error ?? 'unknown error'))
    });
  }
}
