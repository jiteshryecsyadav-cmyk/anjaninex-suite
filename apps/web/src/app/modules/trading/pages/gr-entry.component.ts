import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TradingService, Party, BillListItem, BillDetail, GoodsReturnLine } from '../services/trading.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { amountInWords } from '../../../shared/amount-in-words.util';
import { InvoicePreviewComponent, PreviewData } from '../../../shared/invoice-preview.component';
import { todayLocal } from '../../../shared/date.util';
import { InDatePipe } from '../../../shared/in-date.pipe';
import { FeatureService } from '../../../shared/feature.service';
import { ToastService } from '../../../shared/toast.service';

interface ReturnRow {
  selected: boolean;
  billLineId: string | null;
  itemId: string | null;
  itemName: string;
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  rate: number;
  rd: number;
  igstPct: number;
}

@Component({
  selector: 'app-gr-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent, InDatePipe, InvoicePreviewComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <!-- ============ HEADER ============ -->
      <div class="gr-header">
        <div class="gh-left">
          <img src="anjaninex-logo.jpeg" alt="Anjaninex" class="gh-logo">
          <div>
            <h2 class="gh-title">Goods Return (GR) — {{ features.firmName() || 'Anjaninex' }}</h2>
            <p class="gh-sub">Return items back to supplier · adjust bill or issue credit note</p>
          </div>
        </div>
        <div class="gh-right">
          <span class="gr-no-tag">GR No: <strong>{{ tempGrNo() }}</strong></span>
        </div>
      </div>

      <!-- ============ TAB STRIP ============ -->
      <div class="tabs-strip">
        <button type="button" class="tab tab-active">📋 New GR</button>
        <a routerLink="/trading/gr" class="tab">📜 GR History</a>
      </div>

      <!-- ============ GR STATUS ============ -->
      <div class="section-card">
        <div class="status-row">
          <div class="status-left">
            <div class="status-label">GR STATUS</div>
            <div class="status-tabs">
              <button type="button" class="st-tab st-pending" [class.active]="grStatus === 'pending'" (click)="grStatus = 'pending'">
                ⏳ Pending Approval
              </button>
              <button type="button" class="st-tab st-approved" [class.active]="grStatus === 'approved'" (click)="grStatus = 'approved'">
                ✅ Approved
              </button>
              <button type="button" class="st-tab st-rejected" [class.active]="grStatus === 'rejected'" (click)="grStatus = 'rejected'">
                ❌ Rejected
              </button>
            </div>
          </div>
          <div class="status-right">
            <div class="status-label">GR Number</div>
            <div class="gr-no-big">{{ tempGrNo() }}</div>
          </div>
        </div>
      </div>

      <!-- ============ SECTION 1: GR BASIC INFORMATION ============ -->
      <div class="section-card">
        <div class="section-head">
          <span class="sec-ico">📋</span> GR BASIC INFORMATION
        </div>

        <div class="grid grid-cols-4 gap-4 mt-3">
          <div>
            <label class="lbl">GR DATE *</label>
            <input [(ngModel)]="grDate" type="date" class="ip">
          </div>
          <div>
            <label class="lbl">SUPPLIER *
              @if (supplierId) {
                <button type="button" class="wa-mini" (click)="openWhatsAppParty(supplierId)" title="WhatsApp karo">💬 WhatsApp</button>
              }
            </label>
            <div class="search-wrap">
              <input [(ngModel)]="supplierSearch" (input)="filterSuppliers()" type="text"
                     (keydown.arrowdown)="$event.preventDefault(); supIdx = Math.min(supIdx + 1, supplierResults().length - 1)"
                     (keydown.arrowup)="$event.preventDefault(); supIdx = Math.max(supIdx - 1, 0)"
                     (keydown.enter)="$event.preventDefault(); supplierResults()[supIdx] && selectSupplier(supplierResults()[supIdx])"
                     (keydown.escape)="supplierResults.set([])"
                     placeholder="🔍 Name ya GST No..." class="ip">
              @if (supplierSearch && supplierResults().length > 0 && !supplierId) {
                <div class="search-dd">
                  @for (p of supplierResults(); track p.id; let i = $index) {
                    <div class="search-item" [class.kb-active]="i === supIdx"
                         (mousedown)="selectSupplier(p)" (mouseenter)="supIdx = i">
                      <strong>{{ p.displayName }}</strong>
                      <small>{{ p.gst || '—' }} · {{ p.city || '—' }}</small>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
          <div>
            <label class="lbl">BUYER *
              @if (buyerId) {
                <button type="button" class="wa-mini" (click)="openWhatsAppParty(buyerId)" title="WhatsApp karo">💬 WhatsApp</button>
              }
            </label>
            <div class="search-wrap">
              <input [(ngModel)]="buyerSearch" (input)="filterBuyers()" type="text"
                     (keydown.arrowdown)="$event.preventDefault(); buyIdx = Math.min(buyIdx + 1, buyerResults().length - 1)"
                     (keydown.arrowup)="$event.preventDefault(); buyIdx = Math.max(buyIdx - 1, 0)"
                     (keydown.enter)="$event.preventDefault(); buyerResults()[buyIdx] && selectBuyer(buyerResults()[buyIdx])"
                     (keydown.escape)="buyerResults.set([])"
                     placeholder="🔍 Name ya GST No..." class="ip">
              @if (buyerSearch && buyerResults().length > 0 && !buyerId) {
                <div class="search-dd">
                  @for (p of buyerResults(); track p.id; let i = $index) {
                    <div class="search-item" [class.kb-active]="i === buyIdx"
                         (mousedown)="selectBuyer(p)" (mouseenter)="buyIdx = i">
                      <strong>{{ p.displayName }}</strong>
                      <small>{{ p.gst || '—' }} · {{ p.city || '—' }}</small>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
          <div>
            <label class="lbl">TRANSPORT NAME</label>
            <input [(ngModel)]="transport" type="text" placeholder="Transporter / Courier name" class="ip">
          </div>
          <div>
            <label class="lbl">TRANSPORT / LR NO.</label>
            <input [(ngModel)]="lrNo" type="text" placeholder="LR/Courier No." class="ip">
          </div>

          <div>
            <label class="lbl">REASON FOR RETURN *</label>
            <select [(ngModel)]="reason" class="ip">
              <option value="">— Select Reason —</option>
              <option value="defective">Defective / Damaged</option>
              <option value="wrong_item">Wrong Item Received</option>
              <option value="quality_issue">Quality Issue</option>
              <option value="excess_qty">Excess Quantity</option>
              <option value="late_delivery">Late Delivery (cancelled)</option>
              <option value="color_diff">Color Mismatch</option>
              <option value="size_diff">Size Mismatch</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="col-span-2">
            <label class="lbl">REMARK / NOTE</label>
            <input [(ngModel)]="remark" type="text" placeholder="Additional details..." class="ip">
          </div>
          <div>
            <label class="lbl">GR EFFECT ON BILL</label>
            <select [(ngModel)]="effectMode" class="ip">
              <option value="direct_adjustment">📉 Direct Bill Adjustment (amount minus)</option>
              <option value="credit_note">📝 Credit Note (for future bills)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- ============ SECTION 2: ORIGINAL BILL REFERENCE ============ -->
      <div class="section-card">
        <div class="flex items-center justify-between">
          <div class="section-head no-border">
            <span class="sec-ico">📄</span> ORIGINAL BILL REFERENCE
          </div>
          <!-- ON/OFF switch: Bill Entry (bina bill ke) -->
          <div class="direct-toggle">
            <span class="dt-text">📝 Bill Entry (bina bill ke)</span>
            <button type="button" class="switch" [class.on]="directEntry"
                    (click)="directEntry = !directEntry; onDirectToggle()">
              <span class="knob"></span>
            </button>
            <span class="dt-state" [class.on]="directEntry">{{ directEntry ? 'ON' : 'OFF' }}</span>
          </div>
        </div>

        @if (directEntry) {
          <div class="direct-note mt-2">
            ✓ Direct mode ON — bill select karne ki zaroorat nahi. Sirf upar Supplier + Buyer rakho aur niche return items khud bharo.
          </div>
        } @else {
          <!-- Quick lookup: supplier ka bill no daalte hi supplier+buyer+original bill auto-uth jaye -->
          <div class="bill-lookup mt-3">
            <label class="lbl">🔎 SUPPLIER BILL NO. (daalte hi supplier / buyer auto-uthenge)</label>
            <div class="flex gap-2">
              <input [(ngModel)]="grBillNoSearch" type="text" class="ip flex-1"
                     placeholder="Supplier ka bill / invoice no — e.g. INV-2026/045 (ya internal bill no)"
                     (keyup.enter)="findBillBySupplierNo()">
              <button type="button" class="btn-find" [disabled]="billLookupBusy() || !grBillNoSearch.trim()"
                      (click)="findBillBySupplierNo()">
                {{ billLookupBusy() ? '…' : '🔎 Find Bill' }}
              </button>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-4 mt-3">
            <div>
              <label class="lbl">SELECT ORIGINAL BILL *</label>
              <select [(ngModel)]="originalBillId" (ngModelChange)="onBillSelect($event)" class="ip"
                      [disabled]="bills().length === 0">
                @if (bills().length === 0) {
                  <option value="">— Pehle Supplier & Buyer select karein —</option>
                } @else {
                  <option value="">— Select Bill —</option>
                  @for (b of bills(); track b.id) {
                    <option [value]="b.id">{{ b.billNo }} · ₹{{ b.total | number:'1.2-2' }} ({{ b.billDate | inDate }})</option>
                  }
                }
              </select>
            </div>
            <div>
              <label class="lbl">ORIGINAL BILL DATE</label>
              <input type="text" disabled [value]="selectedBillDate" placeholder="—" class="ip ip-auto">
            </div>
            <div>
              <label class="lbl">ORIGINAL BILL AMOUNT</label>
              <input type="text" disabled [value]="'₹ ' + (originalBillAmount() | number:'1.2-2')" class="ip ip-auto">
            </div>
          </div>
        }
      </div>

      <!-- ============ SECTION 3: RETURN ITEMS DETAIL ============ -->
      <div class="section-card">
        <div class="flex items-center justify-between">
          <div class="section-head no-border">
            <span class="sec-ico">📦</span> RETURN ITEMS DETAIL
          </div>
          <button type="button" (click)="addLine()" class="btn-add-item">+ Add Item</button>
        </div>

        <div class="item-table-wrap mt-2">
          <table class="item-table">
            <thead>
              <tr>
                <th class="w-8 text-center">
                  <input type="checkbox" [checked]="allSelected()" (change)="toggleAll($event)">
                </th>
                <th class="w-10">SNO.</th>
                <th>ITEM NAME</th>
                <th>DESCRIPTION</th>
                <th class="w-16">QTY.</th>
                <th class="w-20">UNIT</th>
                <th class="w-20">PRICE</th>
                <th class="w-16">RD</th>
                <th class="w-20">HSN</th>
                <th class="w-16">IGST %</th>
                <th class="w-24">TAXABLE AMT</th>
                <th class="w-20">TAX AMT</th>
                <th class="w-24">TOTAL AMT</th>
                <th class="w-10">DEL</th>
              </tr>
            </thead>
            <tbody>
              @for (line of lines(); track $index) {
                <tr [class.row-selected]="line.selected">
                  <td class="text-center">
                    <input type="checkbox" [ngModel]="line.selected" (ngModelChange)="updateLine($index, 'selected', $event)">
                  </td>
                  <td class="text-center">{{ $index + 1 }}</td>
                  <td>
                    <input [ngModel]="line.itemName"
                           (ngModelChange)="updateLine($index, 'itemName', $event)"
                           class="tip" placeholder="Item name">
                  </td>
                  <td>
                    <input [ngModel]="line.description"
                           (ngModelChange)="updateLine($index, 'description', $event)"
                           class="tip" placeholder="Description / Design">
                  </td>
                  <td>
                    <input [ngModel]="line.qty"
                           (ngModelChange)="updateLine($index, 'qty', +$event)"
                           type="number" step="0.01" class="tip text-right">
                  </td>
                  <td>
                    <select [ngModel]="line.unit" (ngModelChange)="updateLine($index, 'unit', $event)" class="tip">
                      <option value="MTR">MTR</option>
                      <option value="PCS">PCS</option>
                      <option value="KG">KG</option>
                      <option value="DOZ">DOZ</option>
                      <option value="BOX">BOX</option>
                    </select>
                  </td>
                  <td>
                    <input [ngModel]="line.rate"
                           (ngModelChange)="updateLine($index, 'rate', +$event)"
                           type="number" step="0.01" class="tip text-right">
                  </td>
                  <td>
                    <input [ngModel]="line.rd"
                           (ngModelChange)="updateLine($index, 'rd', +$event)"
                           type="number" step="0.01" class="tip text-right">
                  </td>
                  <td>
                    <input [ngModel]="line.hsnSac"
                           (ngModelChange)="updateLine($index, 'hsnSac', $event)"
                           type="text" class="tip text-center" placeholder="HSN">
                  </td>
                  <td>
                    <input [ngModel]="line.igstPct"
                           (ngModelChange)="updateLine($index, 'igstPct', +$event)"
                           type="number" step="0.01" class="tip text-right">
                  </td>
                  <td class="text-right font-mono">{{ lineTaxable($index) | number:'1.2-2' }}</td>
                  <td class="text-right font-mono">{{ lineTax($index) | number:'1.2-2' }}</td>
                  <td class="text-right font-mono total-cell">{{ lineTotal($index) | number:'1.2-2' }}</td>
                  <td class="text-center">
                    @if (lines().length > 1) {
                      <button type="button" (click)="removeLine($index)" class="btn-del">🗑</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" class="text-right">
                  <span class="check-tick">✓</span> SELECTED TOTALS →
                </td>
                <td class="text-center font-mono font-bold">{{ totalReturnQty() | number:'1.0-0' }}</td>
                <td colspan="5"></td>
                <td class="text-right font-mono">{{ totalTaxable() | number:'1.2-2' }}</td>
                <td class="text-right font-mono">{{ totalTax() | number:'1.2-2' }}</td>
                <td class="text-right font-mono">{{ totalAmount() | number:'1.2-2' }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- ============ SECTION 4: GR EFFECT ON BILL & COMMISSION ============ -->
      <div class="section-card">
        <div class="flex items-center justify-between">
          <div class="section-head no-border">
            <span class="sec-ico">⚡</span> GR EFFECT ON BILL & COMMISSION
          </div>
          <!-- ON/OFF switch: Commission recalculation -->
          <div class="direct-toggle">
            <span class="dt-text">🪙 Commission lagao</span>
            <button type="button" class="switch" [class.on]="showCommission"
                    (click)="toggleCommission()">
              <span class="knob"></span>
            </button>
            <span class="dt-state" [class.on]="showCommission">{{ showCommission ? 'ON' : 'OFF' }}</span>
          </div>
        </div>

        @if (showCommission) {
          <div class="comm-block mt-3">
            <div class="comm-head">🪙 COMMISSION RECALCULATION</div>
            <div class="grid grid-cols-4 gap-4 mt-2">
              <div>
                <div class="comm-label">Original Bill</div>
                <div class="comm-value">₹ {{ originalBillAmount() | number:'1.2-2' }}</div>
              </div>
              <div>
                <div class="comm-label">GR Amount</div>
                <div class="comm-value text-red-600">- ₹ {{ netReturnAmount() | number:'1.2-2' }}</div>
              </div>
              <div>
                <div class="comm-label">Net Taxable (after GR)</div>
                <div class="comm-value">₹ {{ netTaxableAfterGr() | number:'1.2-2' }}</div>
              </div>
              <div>
                <div class="comm-label">Commission % → Amt</div>
                <!-- Dono par rate ho to source choose karo -->
                @if (supplierCommRate > 0 && buyerCommRate > 0) {
                  <select [(ngModel)]="commissionSource" (ngModelChange)="applyCommSource()"
                          class="tip-inline" style="width:130px;margin-bottom:5px">
                    <option value="buyer">Buyer ({{ buyerCommRate }}%)</option>
                    <option value="supplier">Supplier ({{ supplierCommRate }}%)</option>
                  </select>
                } @else {
                  <div style="font-size:10px;color:#6b7280;margin-bottom:3px">
                    {{ buyerCommRate > 0 ? 'Buyer ka rate' : (supplierCommRate > 0 ? 'Supplier ka rate' : 'Manual') }}
                  </div>
                }
                <div class="comm-row">
                  <input [(ngModel)]="commissionPct" type="number" step="0.01" min="0" class="tip-inline" style="width:60px">
                  <span>%</span>
                  <span class="comm-amt font-mono">₹ {{ commissionAmount() | number:'1.2-2' }}</span>
                </div>
                <div style="font-size:9.5px;color:#9ca3af;margin-top:3px;font-style:italic">
                  ℹ️ Sirf record — bill/payment par koi effect nahi
                </div>
              </div>
            </div>
          </div>
        }

        <div class="grid grid-cols-2 gap-4 mt-3">
          <!-- Option A -->
          <div class="opt-card" [class.opt-active]="effectMode === 'direct_adjustment'">
            <div class="opt-head opt-head-a">
              📉 OPTION A — DIRECT BILL ADJUSTMENT
            </div>
            <div class="opt-body">
              <div class="opt-row">
                <span>Original Bill Amount</span>
                <span class="font-mono">₹ {{ originalBillAmount() | number:'1.2-2' }}</span>
              </div>
              <div class="opt-row">
                <span>(-) GR Return Amount</span>
                <span class="font-mono text-red-600">- ₹ {{ netReturnAmount() | number:'1.2-2' }}</span>
              </div>
              <div class="opt-divider"></div>
              <div class="opt-row opt-row-final">
                <strong>Net Bill After GR</strong>
                <strong class="font-mono">₹ {{ netBillAfterGr() | number:'1.2-2' }}</strong>
              </div>
            </div>
          </div>

          <!-- Option B -->
          <div class="opt-card opt-card-b" [class.opt-active]="effectMode === 'credit_note'">
            <div class="opt-head opt-head-b">
              📝 OPTION B — CREDIT NOTE
            </div>
            <div class="opt-body">
              <div class="opt-row">
                <span>Credit Note Amount</span>
                <span class="font-mono">₹ {{ netReturnAmount() | number:'1.2-2' }}</span>
              </div>
              <div class="opt-row">
                <span>Valid Till</span>
                <input [(ngModel)]="creditNoteValidTill" type="date" class="tip-inline">
              </div>
              <div class="opt-divider"></div>
              <div class="opt-row opt-row-final">
                <strong>Adjust in Future Bills</strong>
                <label class="toggle-yes" [class.on]="creditNoteAdjustFuture" (click)="creditNoteAdjustFuture = !creditNoteAdjustFuture">
                  {{ creditNoteAdjustFuture ? '✅ Yes' : '❌ No' }}
                </label>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- ============ SECTION 5: GR SUMMARY ============ -->
      <div class="section-card">
        <div class="section-head">
          <span class="sec-ico">📊</span> GR SUMMARY
        </div>
        <div class="grid grid-cols-4 gap-4 mt-3">
          <div class="sum-stat sum-stat-purple">
            <div class="stat-label">TOTAL RETURN AMT</div>
            <div class="stat-value">₹ {{ totalAmount() | number:'1.2-2' }}</div>
            @if (roundOff() !== 0) {
              <div style="font-size:11px;font-weight:600;margin-top:4px;"
                   [style.color]="roundOff() >= 0 ? '#15803d' : '#dc2626'">
                R/Off: {{ roundOff() >= 0 ? '+' : '-' }} ₹ {{ (roundOff() < 0 ? -roundOff() : roundOff()) | number:'1.2-2' }}
              </div>
            }
            @if (netReturnAmount() > 0 && roundOff() !== 0) {
              <div style="font-size:13px;font-weight:800;color:#1B2E5C;margin-top:4px;
                          background:#FEF3C7;padding:4px 8px;border-radius:4px;
                          border-left:3px solid #F59E0B;">
                NET: ₹ {{ netReturnAmount() | number:'1.0-0' }}
              </div>
            }
            @if (netReturnAmount() > 0) {
              <div style="font-size:10.5px;color:#065f46;background:#ecfdf5;
                          border-left:3px solid #10b981;padding:4px 8px;
                          border-radius:4px;margin-top:6px;
                          font-style:italic;font-weight:600;line-height:1.4;">
                📝 {{ words(netReturnAmount()) }}
              </div>
            }
          </div>
          <div class="sum-stat sum-stat-yellow">
            <div class="stat-label">ORIGINAL BILL AMT</div>
            <div class="stat-value">₹ {{ originalBillAmount() | number:'1.2-2' }}</div>
            @if (originalBillAmount() > 0) {
              <div class="stat-words">📝 {{ words(originalBillAmount()) }}</div>
            }
          </div>
          <div class="sum-stat sum-stat-green">
            <div class="stat-label">NET BILL AFTER GR</div>
            <div class="stat-value">₹ {{ netBillAfterGr() | number:'1.2-2' }}</div>
            @if (netBillAfterGr() > 0) {
              <div class="stat-words">📝 {{ words(netBillAfterGr()) }}</div>
            }
          </div>
          <div class="sum-stat sum-stat-pink">
            <div class="stat-label">ITEMS RETURNED</div>
            <div class="stat-value">{{ selectedCount() }}</div>
          </div>
        </div>
      </div>

      @if (error()) {
        <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mt-3">
          {{ error() }}
        </div>
      }

      <!-- ============ BOTTOM ============ -->
      <div class="bottom-bar">
        <a routerLink="/trading/gr" class="btn-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
          GR List
        </a>
        <div class="flex gap-3 items-center">
          <button type="button" (click)="clear()" class="btn-clear">🗙 Clear</button>
          <button type="button" (click)="preview()" class="btn-preview">👁 Preview</button>
          <button type="button" (click)="save()" [disabled]="saving()" class="btn-save">
            {{ saving() ? 'Saving…' : '💾 Save GR' }}
          </button>
        </div>
      </div>

      @if (previewData()) {
        <app-invoice-preview [data]="previewData()!" (close)="previewData.set(null)"></app-invoice-preview>
      }

    </div>
  `,
  styles: [`
    :host { display: block; background: #FAF7F0; min-height: 100vh; padding: 16px 0; }

    /* HEADER */
    .gr-header {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 14px 22px; border-radius: 12px 12px 0 0;
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 0; box-shadow: 0 2px 8px rgba(27,46,92,0.12);
    }
    .gh-left { display: flex; align-items: center; gap: 12px; }
    .gh-logo { width: 44px; height: 44px; object-fit: contain; background: #fff; border-radius: 8px; padding: 4px; }
    .gh-title { font-size: 17px; font-weight: 800; margin: 0; }
    .gh-sub { font-size: 12px; opacity: 0.85; margin: 0; }
    .gr-no-tag {
      background: #fff; color: #1B2E5C; padding: 8px 14px; border-radius: 8px;
      font-size: 13px; font-weight: 700;
    }
    .gr-no-tag strong { color: #DC2626; }

    /* TABS STRIP */
    .tabs-strip {
      background: #fff; border: 1px solid #D6DDEA; border-top: 0;
      display: flex; padding: 0 16px; margin-bottom: 14px;
    }
    .tab {
      flex: 1; text-align: center; padding: 12px; font-size: 13px; font-weight: 700;
      color: #4A5878; cursor: pointer; border: 0; background: transparent;
      border-bottom: 3px solid transparent; text-decoration: none; font-family: inherit;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    .tab:hover { background: #FAF7F0; }
    .tab-active { color: #DC2626; border-bottom-color: #DC2626; background: #FEF2F2; }

    /* SECTION CARDS */
    .section-card {
      background: #fff; border: 1px solid #D6DDEA; border-radius: 10px;
      padding: 14px 18px; margin-bottom: 14px;
      box-shadow: 0 1px 3px rgba(27,46,92,0.04);
    }
    .section-head {
      font-size: 13px; font-weight: 800; color: #DC2626; letter-spacing: 0.5px;
      padding-bottom: 8px; border-bottom: 1px solid #F5EFE3;
      display: flex; align-items: center; gap: 6px;
    }
    .section-head.no-border { border-bottom: 0; padding-bottom: 0; }
    .sec-ico { font-size: 15px; }

    /* STATUS ROW */
    .status-row { display: flex; justify-content: space-between; align-items: center; }
    .status-label { font-size: 10px; font-weight: 700; color: #4A5878; text-transform: uppercase; letter-spacing: 0.5px; }
    .status-tabs { display: flex; gap: 8px; margin-top: 6px; }
    .st-tab {
      padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700;
      border: 1.5px solid #D6DDEA; background: #fff; cursor: pointer; font-family: inherit;
      transition: all 0.15s;
    }
    .st-tab.st-pending.active { background: #FBA94B; color: #fff; border-color: #FBA94B; }
    .st-tab.st-approved.active { background: #10B981; color: #fff; border-color: #10B981; }
    .st-tab.st-rejected.active { background: #DC2626; color: #fff; border-color: #DC2626; }
    .gr-no-big { font-size: 18px; font-weight: 800; color: #DC2626; font-family: 'JetBrains Mono', monospace; margin-top: 4px; }

    /* INPUTS */
    .lbl { display: block; font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.5px; margin-bottom: 4px; text-transform: uppercase; }
    .bill-lookup { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 10px 12px; }
    .btn-find { padding: 8px 16px; background: #16a34a; color: #fff; border: 0; border-radius: 6px;
      font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap; }
    .btn-find:hover { background: #15803d; }
    .btn-find:disabled { opacity: .5; cursor: not-allowed; }
    .ip {
      width: 100%; padding: 8px 10px; border: 1px solid #D6DDEA; border-radius: 6px;
      font-size: 13px; color: #1B2E5C; background: #fff; font-family: inherit;
      transition: border 0.15s, box-shadow 0.15s;
    }
    .ip:focus { outline: none; border-color: #DC2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.1); }
    .ip:disabled { background: #F5EFE3; cursor: not-allowed; }
    .ip-auto { background: #ECFDF5; color: #047857; border-color: #A7F3D0; font-weight: 600; }
    .direct-toggle { display: flex; align-items: center; gap: 9px; user-select: none; }
    .dt-text { font-size: 12px; font-weight: 700; color: #5c1a8b; }
    .switch { width: 46px; height: 24px; border-radius: 999px; background: #cbd5e1; border: 0;
      position: relative; cursor: pointer; transition: background .2s; padding: 0; }
    .switch.on { background: #16a34a; }
    .switch .knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
      border-radius: 50%; background: #fff; transition: left .2s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
    .switch.on .knob { left: 24px; }
    .dt-state { font-size: 11px; font-weight: 800; color: #9ca3af; width: 26px; }
    .dt-state.on { color: #16a34a; }
    .direct-note { background: #f0fdf4; border-left: 4px solid #16a34a; color: #15803d;
      font-size: 12px; padding: 9px 12px; border-radius: 8px; font-weight: 600; }
    select.ip { cursor: pointer; }

    /* SEARCH */
    .search-wrap { position: relative; }
    .wa-mini { margin-left: 8px; border: 1px solid #86efac; background: #dcfce7; color: #15803d;
      border-radius: 6px; padding: 1px 8px; font-size: 10px; font-weight: 800; cursor: pointer; font-family: inherit; }
    .wa-mini:hover { background: #bbf7d0; }
    .search-dd {
      position: absolute; top: 100%; left: 0; right: 0; z-index: 20;
      background: #fff; border: 1px solid #D6DDEA; border-radius: 6px;
      box-shadow: 0 4px 12px rgba(27,46,92,0.15); max-height: 260px; overflow-y: auto;
    }
    .search-item { padding: 8px 10px; border-bottom: 1px solid #F5EFE3; cursor: pointer; }
    .search-item:hover { background: #FAF7F0; }
    .search-item.kb-active { background: #f0e6ff; border-left: 3px solid #5c1a8b; }
    .search-item strong { display: block; font-size: 13px; color: #1B2E5C; }
    .search-item small { font-size: 11px; color: #4A5878; }

    /* ITEM TABLE */
    .btn-add-item {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 8px 16px; border-radius: 8px;
      font-size: 13px; font-weight: 700; border: 0; cursor: pointer; font-family: inherit;
    }
    .btn-add-item:hover { background: #142347; }

    .item-table-wrap { overflow-x: auto; border: 1px solid #D6DDEA; border-radius: 8px; }
    .item-table { width: 100%; font-size: 11.5px; border-collapse: collapse; background: #fff; }
    .item-table thead { background: var(--anjaninex-navy, #1B2E5C); color: #fff; }
    .item-table th { padding: 8px 6px; text-align: left; font-weight: 700; font-size: 10px; letter-spacing: 0.3px; text-transform: uppercase; white-space: nowrap; }
    .item-table th.text-right { text-align: right; }
    .item-table th.text-center { text-align: center; }
    .item-table td { padding: 4px 4px; border-bottom: 1px solid #F5EFE3; vertical-align: middle; }
    .item-table tbody tr:hover { background: #FAF7F0; }
    .row-selected { background: #ECFDF5 !important; }
    .item-table tfoot { background: var(--anjaninex-navy, #1B2E5C); color: #fff; font-weight: 800; }
    .item-table tfoot td { padding: 8px 6px; }
    .total-cell { color: #DC2626; font-weight: 800; }
    .check-tick { display: inline-block; background: #10B981; color: #fff; width: 18px; height: 18px; border-radius: 4px; text-align: center; margin-right: 4px; font-size: 11px; line-height: 18px; }

    .tip {
      width: 100%; padding: 5px 6px; border: 1px solid #E5E9F2; border-radius: 4px;
      font-size: 11.5px; color: #1B2E5C; background: #fff; font-family: inherit;
    }
    .tip:focus { outline: none; border-color: #DC2626; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .btn-del { background: transparent; border: 0; color: #DC2626; font-size: 14px; cursor: pointer; padding: 2px 6px; }

    /* OPT CARDS */
    .opt-card {
      border: 1px solid #D6DDEA; border-radius: 8px; overflow: hidden;
      background: #F5EFE3; transition: border 0.15s, box-shadow 0.15s;
    }
    .opt-card-b { background: #FFFBEB; }
    .opt-active {
      border: 2px solid #1B2E5C; box-shadow: 0 0 0 2px rgba(27,46,92,0.1);
    }
    .opt-head {
      padding: 10px 14px; font-size: 12px; font-weight: 800;
      letter-spacing: 0.4px; color: #5c1a8b;
      background: rgba(255,255,255,0.5); border-bottom: 1px solid #D6DDEA;
    }
    .opt-head-b { color: #D97706; }
    .opt-body { padding: 12px 14px; }
    .opt-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 0; font-size: 13px; color: #1B2E5C;
    }
    .opt-divider { height: 1px; background: #D6DDEA; margin: 6px 0; }
    .opt-row-final { font-size: 14px; padding-top: 8px; }
    .tip-inline {
      padding: 4px 8px; border: 1px solid #D6DDEA; border-radius: 4px;
      font-size: 12px; color: #1B2E5C; background: #fff; font-family: inherit;
    }
    .toggle-yes {
      display: inline-block; padding: 4px 12px; background: #D1FAE5; color: #047857;
      font-weight: 700; border-radius: 6px; cursor: pointer; font-size: 12px;
      border: 1px solid #A7F3D0;
    }
    .toggle-yes:not(.on) { background: #FEE2E2; color: #DC2626; border-color: #FCA5A5; }

    /* COMMISSION */
    .comm-block {
      background: #FFFBEB; border: 1px solid #FCD34D; border-radius: 8px; padding: 12px 14px;
    }
    .comm-head {
      font-size: 12px; font-weight: 800; color: #D97706; letter-spacing: 0.4px;
    }
    .comm-label { font-size: 10px; font-weight: 700; color: #4A5878; text-transform: uppercase; letter-spacing: 0.3px; }
    .comm-value { font-size: 15px; font-weight: 800; color: #1B2E5C; font-family: 'JetBrains Mono', monospace; margin-top: 4px; }
    .comm-row { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
    .comm-amt { font-size: 14px; font-weight: 800; color: #DC2626; margin-left: auto; }

    /* SUMMARY */
    .sum-stat {
      border: 1px solid #D6DDEA; border-radius: 8px; padding: 14px; background: #fff;
    }
    .sum-stat-purple { background: #F5EFE3; border-color: #5c1a8b; }
    .sum-stat-yellow { background: #FFFBEB; border-color: #FCD34D; }
    .sum-stat-green  { background: #ECFDF5; border-color: #10B981; }
    .sum-stat-pink   { background: #FCE7F3; border-color: #DB2777; }
    .stat-label { font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.5px; text-transform: uppercase; }
    .stat-value { font-size: 19px; font-weight: 800; color: #1B2E5C; margin-top: 6px; font-family: 'JetBrains Mono', monospace; }
    .stat-words { font-size: 10px; color: #6b7280; font-style: italic; margin-top: 5px; line-height: 1.35; }

    /* BOTTOM */
    .bottom-bar { display: flex; justify-content: space-between; align-items: center; padding: 16px 0 8px; margin-top: 8px; border-top: 1px solid #D6DDEA; }
    .btn-back, .btn-clear, .btn-preview, .btn-save {
      padding: 9px 18px; border-radius: 8px; font-weight: 700; font-size: 13px;
      cursor: pointer; border: 1px solid #D6DDEA; font-family: inherit; text-decoration: none;
      display: inline-flex; align-items: center; gap: 4px;
    }
    .btn-back { background: #fff; color: #4A5878; border: 1px solid #D6DDEA; padding: 9px 18px;
      border-radius: 8px; font-size: 13px; font-weight: 700; text-decoration: none;
      display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s; }
    .btn-back:hover { background: #F5EFE3; border-color: #1B2E5C; color: #DC2626; }
    .btn-back svg { width: 14px; height: 14px; }
    .btn-clear { background: #fff; color: #4A5878; }
    .btn-clear:hover { background: #F5EFE3; }
    .btn-preview { background: #fff; color: #1B2E5C; border-color: #1B2E5C; }
    .btn-preview:hover { background: #E5E9F2; }
    .btn-save {
      background: #DC2626; color: #fff; border: 0;
      box-shadow: 0 2px 6px rgba(220,38,38,0.3);
      transition: background 0.15s, transform 0.1s;
    }
    .btn-save:hover:not(:disabled) { background: #B91C1C; transform: translateY(-1px); }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

    @media (max-width: 640px) {
      :host { padding: 8px 0; }
      .gr-header { flex-wrap: wrap; gap: 8px; padding: 12px 14px; }
      .section-card { padding: 12px 12px; }
      /* All form grids → single column */
      .grid-cols-2, .grid-cols-3, .grid-cols-4 { grid-template-columns: 1fr !important; }
      .col-span-2 { grid-column: span 1 !important; }
      .ip { width: 100% !important; }
      .status-row { flex-direction: column; align-items: stretch; gap: 10px; }
      .status-tabs { flex-wrap: wrap; }
      .tabs-strip { flex-wrap: wrap; }
      /* Item table horizontally scrollable */
      .item-table-wrap { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .item-table { white-space: nowrap; }
      /* Bottom action bar stacks */
      .bottom-bar { flex-wrap: wrap; gap: 10px; }
      .bottom-bar .flex { flex-wrap: wrap; }
    }
  `]
})
export class GrEntryComponent {
  private svc = inject(TradingService);
  features = inject(FeatureService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  // Supplier ka bill no. — daalte hi us bill se supplier+buyer+original bill auto-uth jaye
  grBillNoSearch = '';
  billLookupBusy = signal(false);

  /** Supplier bill no (ya internal bill no) se bill dhoondo → supplier/buyer/original bill auto-fill. */
  async findBillBySupplierNo() {
    const q = (this.grBillNoSearch || '').trim().toLowerCase();
    if (!q) return;
    this.billLookupBusy.set(true);
    try {
      const res = await firstValueFrom(this.svc.listBills({ size: 500 }));
      const items = (res.items || []).filter(b => !b.isDeleted);
      const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();
      const bill =
        items.find(b => norm(b.supplierBillNo) === q || norm(b.billNo) === q) ||
        items.find(b => norm(b.supplierBillNo).includes(q) || norm(b.billNo).includes(q));
      if (!bill) {
        this.toast.error(`"${this.grBillNoSearch}" se koi bill nahi mila. Sahi bill no daalein.`);
        return;
      }
      // Supplier + Buyer auto-set
      const sup = this.parties().find(p => p.id === bill.partyId);
      const buy = bill.buyerPartyId ? this.parties().find(p => p.id === bill.buyerPartyId) : null;
      if (sup) { this.supplierId = sup.id; this.supplierSearch = sup.displayName; this.supplierResults.set([]); }
      if (buy) {
        this.buyerId = buy.id; this.buyerSearch = buy.displayName; this.buyerResults.set([]);
        this.buyerCommRate = +buy.commissionRate || 0;
        if (this.showCommission) this.commissionPct = this.buyerCommRate;
      }
      await this.loadBills();
      this.originalBillId = bill.id;
      await this.onBillSelect(bill.id);
      this.toast.success(`Bill ${bill.billNo} mil gaya — supplier/buyer auto-fill ho gaye ✓`);
    } catch {
      this.toast.error('Bill search nahi ho paya. Dobara try karein.');
    } finally {
      this.billLookupBusy.set(false);
    }
  }
  editId: string | null = null;
  editMode = false;

  parties = signal<Party[]>([]);

  /** Party ka WhatsApp kholo — phone ke last 10 digit par (+91) */
  openWhatsAppParty(partyId: string) {
    const p = this.parties().find(x => x.id === partyId);
    const digits = (p?.phone || '').replace(/\D/g, '');
    if (!digits) { alert('Is party ka phone number save nahi hai'); return; }
    const ten = digits.length > 10 ? digits.slice(-10) : digits;
    window.open('https://wa.me/91' + ten, '_blank');
  }
  bills = signal<BillListItem[]>([]);
  saving = signal(false);
  error = signal('');

  // Status
  grStatus: 'pending' | 'approved' | 'rejected' = 'pending';
  // Transport field (was being assigned in edit-load without being declared)
  transport = '';

  // Section 1 — Basic Info
  grDate = todayLocal();   // LOCAL date — UTC shift nahi
  lrNo = '';
  reason = '';
  remark = '';
  effectMode: 'direct_adjustment' | 'credit_note' = 'direct_adjustment';

  // Supplier/Buyer search
  supplierSearch = '';
  buyerSearch = '';
  supplierId = '';
  buyerId = '';
  supplierResults = signal<Party[]>([]);
  buyerResults = signal<Party[]>([]);

  // Section 2 — Original Bill
  originalBillId = '';
  selectedBillDate = '';
  selectedBillAmount = 0;
  directEntry = false;   // ON = bina bill ke direct return entry

  /** Toggle Direct Entry — ON par bill linkage hatao */
  onDirectToggle() {
    if (this.directEntry) {
      this.originalBillId = '';
      this.selectedBillDate = '';
      this.selectedBillAmount = 0;
    }
  }

  // Section 4 — Credit Note + Commission
  creditNoteValidTill = '';
  creditNoteAdjustFuture = true;
  commissionPct = 0;

  // Item lines
  lines = signal<ReturnRow[]>([this.newLine()]);

  // ============ COMPUTED ============
  // Real grNo loaded when editing an existing GR; null for a brand-new GR.
  realGrNo = signal<string | null>(null);
  tempGrNo = computed(() => {
    // In edit mode show the actual saved GR number, not the placeholder.
    const real = this.realGrNo();
    if (real) return real;
    const fyStart = new Date();
    const y = fyStart.getMonth() >= 3 ? fyStart.getFullYear() : fyStart.getFullYear() - 1;
    return `GR/${y}-${(y + 1) % 100}/0001`;
  });

  lineTaxable(idx: number): number {
    const l = this.lines()[idx];
    if (!l.selected) return 0;
    const gross = l.qty * l.rate;
    return Math.max(0, gross - (l.qty * l.rd));
  }
  lineTax(idx: number): number {
    return this.lineTaxable(idx) * (this.lines()[idx].igstPct / 100);
  }
  lineTotal(idx: number): number {
    return this.lineTaxable(idx) + this.lineTax(idx);
  }

  totalTaxable = computed(() => this.lines().reduce((s, _, i) => s + this.lineTaxable(i), 0));
  totalTax = computed(() => this.lines().reduce((s, _, i) => s + this.lineTax(i), 0));
  totalAmount = computed(() => this.totalTaxable() + this.totalTax());

  /** Net return amount = totalAmount rounded to nearest whole rupee. */
  netReturnAmount = computed(() => Math.round(this.totalAmount()));

  /** Round-off difference for GR. */
  roundOff = computed(() => +(this.netReturnAmount() - this.totalAmount()).toFixed(2));

  /** Indian number-to-words for display. */
  words = amountInWords;
  selectedCount = computed(() => this.lines().filter(l => l.selected).length);
  allSelected = computed(() => this.lines().length > 0 && this.lines().every(l => l.selected));

  // Plain methods (computed nahi) — selectedBillAmount plain prop hai, computed use NAHI hota tha
  // isliye original amount 0 dikhta tha. Methods har CD par fresh.
  originalBillAmount(): number { return this.selectedBillAmount; }
  // Net Bill = Original − ROUNDED GR return (paisa round)
  netBillAfterGr(): number { return Math.max(0, this.originalBillAmount() - this.netReturnAmount()); }
  netTaxableAfterGr(): number { return this.netBillAfterGr(); }
  commissionAmount(): number { return this.netTaxableAfterGr() * (this.commissionPct / 100); }
  totalReturnQty(): number { return this.lines().reduce((s, l) => s + (+l.qty || 0), 0); }

  showCommission = false;
  buyerCommRate = 0;       // Party Master se buyer ka commission rate
  supplierCommRate = 0;    // Party Master se supplier ka commission rate
  commissionSource: 'buyer' | 'supplier' = 'buyer';

  toggleCommission() {
    this.showCommission = !this.showCommission;
    if (this.showCommission) {
      // Dono parties ke rate Party Master se fresh
      const buy = this.parties().find(p => p.id === this.buyerId);
      const sup = this.parties().find(p => p.id === this.supplierId);
      this.buyerCommRate = +buy?.commissionRate! || 0;
      this.supplierCommRate = +sup?.commissionRate! || 0;
      // Jis par set ho wahi; dono par ho to buyer default (user badal sakta hai)
      this.commissionSource = this.buyerCommRate > 0 ? 'buyer' : 'supplier';
      this.applyCommSource();
    } else {
      this.commissionPct = 0;
    }
  }

  /** Chosen source ka rate commissionPct me bharo */
  applyCommSource() {
    this.commissionPct = this.commissionSource === 'supplier' ? this.supplierCommRate : this.buyerCommRate;
  }

  canSave = computed(() => {
    return !!this.supplierId
        && !!this.buyerId
        && !!this.reason
        && this.lines().some(l => l.selected && l.itemName && l.qty > 0);
  });

  // ============ LIFECYCLE ============
  async ngOnInit() {
    // Load parties FIRST so search inputs can be populated correctly in edit mode
    this.parties.set(await firstValueFrom(this.svc.listParties()));

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.editId = idParam;
      this.editMode = true;
      this.svc.getGoodsReturn(idParam).subscribe({
        next: (gr) => {
          if (gr.grNo) this.realGrNo.set(gr.grNo);   // show real GR number, not /0001 placeholder
          this.grDate = gr.grDate || todayLocal();   // restore GR date (warna edit par aaj ki date reset ho jaati thi)
          this.supplierId = gr.supplierPartyId;
          this.buyerId = gr.buyerPartyId || '';
          this.reason = gr.reason || '';
          this.remark = gr.remark || '';
          this.transport = gr.transport || '';
          this.lrNo = gr.lrNo || '';
          this.grStatus = (gr.status as any) || 'pending';
          this.originalBillId = gr.originalBillId || '';   // restore bill linkage
          this.selectedBillAmount = Number(gr.originalBillAmount) || 0;   // edit me original bill amount wapas
          this.effectMode = (gr.effectMode as any) || 'direct_adjustment';
          this.commissionPct = Number(gr.commissionPct) || 0;
          if (this.commissionPct > 0) this.showCommission = true;   // commission tha to box khula rakho
          this.creditNoteValidTill = gr.creditNoteValidTill || '';
          this.creditNoteAdjustFuture = !!gr.creditNoteAdjustFuture;

          // Populate the visible search-input labels (selects use IDs but the UIs are text)
          const supParty = this.parties().find(p => p.id === this.supplierId);
          const buyParty = this.parties().find(p => p.id === this.buyerId);
          this.supplierSearch = supParty?.displayName || '';
          this.buyerSearch = buyParty?.displayName || '';

          if (gr.lines && gr.lines.length > 0) {
            this.lines.set(gr.lines.map(l => ({
              selected: true,
              billLineId: l.billLineId || null,
              itemId: l.itemId || null,
              itemName: l.itemName,
              description: l.description || '',
              hsnSac: l.hsnSac || '',
              qty: l.qty,
              unit: l.unit || 'MTR',
              rate: l.rate,
              rd: l.rd || 0,
              igstPct: l.igstPct || 5
            })));
          }
        },
        error: () => alert('❌ Failed to load goods return for editing')
      });
    } else {
      // Bills list ke "Create GR" button se aaye → bill no se supplier/buyer/original bill auto-fill
      const billNoParam = this.route.snapshot.queryParamMap.get('billNo');
      if (billNoParam) {
        this.grBillNoSearch = billNoParam;
        this.findBillBySupplierNo();
      }
    }
  }

  // ============ HELPERS ============
  newLine(): ReturnRow {
    return {
      selected: true, billLineId: null, itemId: null,
      itemName: '', description: '', hsnSac: '',
      qty: 0, unit: 'MTR', rate: 0, rd: 0, igstPct: 5
    };
  }

  // ============ SEARCH (matches name, GST, code, city, phone) ============
  // Keyboard nav for dropdowns
  Math = Math;
  supIdx = 0;
  buyIdx = 0;

  filterSuppliers() {
    const q = this.supplierSearch.toLowerCase().trim();
    this.supIdx = 0;
    this.supplierId = '';   // dobara type → selection hatao, dropdown wapas khule
    if (!q) { this.supplierResults.set([]); return; }
    // Supplier me sirf SELLER/BOTH
    this.supplierResults.set(
      this.parties().filter(p =>
        (p.partyType === 'seller' || p.partyType === 'both') && (
        (p.displayName || '').toLowerCase().includes(q)
        || (p.gst || '').toLowerCase().includes(q)
        || (p.partyCode || '').toLowerCase().includes(q)
        || (p.city || '').toLowerCase().includes(q)
        || (p.phone || '').toLowerCase().includes(q))
      ).slice(0, 8)
    );
  }
  filterBuyers() {
    const q = this.buyerSearch.toLowerCase().trim();
    this.buyIdx = 0;
    this.buyerId = '';   // dobara type → selection hatao, dropdown wapas khule
    if (!q) { this.buyerResults.set([]); return; }
    // Buyer me sirf BUYER/BOTH
    this.buyerResults.set(
      this.parties().filter(p =>
        (p.partyType === 'buyer' || p.partyType === 'both') && (
        (p.displayName || '').toLowerCase().includes(q)
        || (p.gst || '').toLowerCase().includes(q)
        || (p.partyCode || '').toLowerCase().includes(q)
        || (p.city || '').toLowerCase().includes(q)
        || (p.phone || '').toLowerCase().includes(q))
      ).slice(0, 8)
    );
  }
  selectSupplier(p: Party) {
    this.supplierId = p.id;
    this.supplierSearch = p.displayName;
    this.supplierResults.set([]);
    this.loadBills();
  }
  selectBuyer(p: Party) {
    this.buyerId = p.id;
    this.buyerSearch = p.displayName;
    this.buyerResults.set([]);
    // Commission rate Party Master se auto — buyer ka set kiya hua rate
    this.buyerCommRate = +p.commissionRate || 0;
    if (this.showCommission) this.commissionPct = this.buyerCommRate;
    this.loadBills();
  }

  async loadBills() {
    // GR supplier ko return hai — bill us supplier+buyer ke transaction ka hota hai.
    // Pehle sirf buyer ke OUTSTANDING bills aate the; agar koi outstanding na ho
    // to dropdown khaali/disabled reh jaata tha. Ab supplier (ya buyer) ke SAARE
    // bills load karo taaki "Select Original Bill" hamesha kaam kare.
    const pid = this.supplierId || this.buyerId;
    if (!pid) return;
    try {
      const res = await firstValueFrom(this.svc.listBills({ partyId: pid, size: 200 }));
      let items = (res.items || []).filter(b => !b.isDeleted);
      // Dono select hain to supplier+buyer PAIR wale bills prefer karo (jo mile)
      if (this.supplierId && this.buyerId) {
        const pair = items.filter(b =>
          (b.partyId === this.supplierId && b.buyerPartyId === this.buyerId) ||
          (b.partyId === this.buyerId && b.buyerPartyId === this.supplierId));
        if (pair.length) items = pair;
      }
      this.bills.set(items);
    } catch (e) {
      console.warn('No bills', e);
      this.bills.set([]);
    }
  }

  async onBillSelect(billId: string) {
    if (!billId) {
      this.selectedBillDate = '';
      this.selectedBillAmount = 0;
      return;
    }
    const b = this.bills().find(x => x.id === billId);
    if (b) {
      this.selectedBillDate = b.billDate;
      this.selectedBillAmount = b.total;
      // Pre-fill items from bill
      try {
        const detail = await firstValueFrom(this.svc.getBill(billId));
        this.lines.set(detail.lines.map(bl => ({
          selected: false,
          billLineId: bl.id ?? null,
          itemId: bl.itemId ?? null,
          itemName: bl.itemName,
          description: bl.description ?? '',
          hsnSac: bl.hsnSac ?? '',
          qty: bl.qty,
          unit: bl.unit ?? 'MTR',
          rate: bl.rate,
          rd: 0,
          igstPct: bl.taxRate ?? 5
        })));
      } catch {}
    }
  }

  // ============ LINE OPERATIONS ============
  updateLine(idx: number, field: keyof ReturnRow, value: any) {
    this.lines.update(arr => arr.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }
  addLine() { this.lines.update(arr => [...arr, this.newLine()]); }
  removeLine(idx: number) { this.lines.update(arr => arr.filter((_, i) => i !== idx)); }
  toggleAll(event: any) {
    const v = event.target.checked;
    this.lines.update(arr => arr.map(l => ({ ...l, selected: v })));
  }

  // ============ ACTIONS ============
  previewData = signal<PreviewData | null>(null);

  preview() {
    const sup = this.parties().find(p => p.id === this.supplierId);
    const buy = this.parties().find(p => p.id === this.buyerId);
    const supCard = sup ? { id: sup.id, name: sup.displayName, gst: sup.gst, mobile: sup.phone, city: sup.city,
        address: sup.city ? `Address on file · ${sup.city}` : null }
      : { name: '—', gst: null, mobile: null, city: null, address: null };
    const buyCard = buy ? { id: buy.id, name: buy.displayName, gst: buy.gst, mobile: buy.phone, city: buy.city,
        address: buy.city ? `Address on file · ${buy.city}` : null }
      : { name: '—', gst: null, mobile: null, city: null, address: null };

    const lines = this.lines().filter(l => l.selected && l.itemName).map(l => ({
      itemName: l.itemName, hsnSac: l.hsnSac || '',
      qty: l.qty, unit: l.unit || 'PCS', rate: l.rate,
      taxableAmount: l.qty * l.rate,
      taxAmount: l.qty * l.rate * (l.igstPct / 100),
      totalAmount: l.qty * l.rate * (1 + l.igstPct / 100)
    }));

    const adj: { label: string; amount: number }[] = [
      { label: 'Original Bill', amount: this.originalBillAmount() },
      { label: 'GR Return Amount', amount: -this.totalAmount() },
      { label: 'Net Bill After GR', amount: this.netBillAfterGr() }
    ];
    if (this.showCommission && this.commissionAmount() > 0)
      adj.push({ label: `Commission @ ${this.commissionPct}%`, amount: this.commissionAmount() });

    this.previewData.set({
      type: 'gr',
      title: 'GOODS RETURN (GR)',
      number: this.tempGrNo(),
      date: this.grDate,
      firmName: this.features.firmName() || 'Anjaninex',
      firmGst: this.features.firmGst(),
      firmAddress: 'Commission Agent · Surat, Gujarat',
      supplier: supCard,
      buyer: buyCard,
      lines,
      grossAmount: this.totalTaxable(),
      taxableAmount: this.totalTaxable(),
      totalTax: this.totalTax(),
      netAmount: this.totalAmount(),
      adjustments: adj,
      notes: (this.reason ? 'Reason: ' + this.reason : '')
        + (this.remark ? ' | ' + this.remark : '')
        + ' | Effect: ' + (this.effectMode === 'direct_adjustment' ? 'Direct Bill Adjustment' : 'Credit Note')
    } as PreviewData);
  }
  clear() {
    if (!confirm('Clear all fields?')) return;
    this.lines.set([this.newLine()]);
    this.supplierId = ''; this.buyerId = '';
    this.supplierSearch = ''; this.buyerSearch = '';
    this.originalBillId = '';
    this.selectedBillDate = ''; this.selectedBillAmount = 0;
    this.lrNo = ''; this.reason = ''; this.remark = '';
    this.creditNoteValidTill = ''; this.commissionPct = 0;
    this.error.set('');
  }

  save() {
    const missing: string[] = [];
    if (!this.supplierId) missing.push('SUPPLIER (top)');
    if (!this.buyerId) missing.push('BUYER (top)');
    if (!this.reason) missing.push('REASON for return');
    const validRows = this.lines().filter((r: ReturnRow) => r.selected && r.itemName && r.qty > 0);
    if (validRows.length === 0) missing.push('AT LEAST ONE selected item (with name + qty > 0)');
    if (missing.length > 0) {
      const msg = '⚠️ Please fill the following:\n\n• ' + missing.join('\n• ');
      this.error.set(msg);
      alert(msg);
      return;
    }
    this.saving.set(true);
    this.error.set('');

    const validLines: GoodsReturnLine[] = this.lines()
      .filter(l => l.selected && l.itemName && l.qty > 0)
      .map((l, idx) => ({
        billLineId: l.billLineId,
        itemId: l.itemId,
        itemName: l.itemName,
        description: l.description || null,
        hsnSac: l.hsnSac || null,
        qty: l.qty,
        unit: l.unit,
        rate: l.rate,
        rd: l.rd || 0,
        igstPct: l.igstPct,
        taxableAmount: this.lineTaxable(idx),
        taxAmount: this.lineTax(idx),
        totalAmount: this.lineTotal(idx)
      }));

    const payload = {
      grDate: this.grDate,
      supplierPartyId: this.supplierId,
      buyerPartyId: this.buyerId || null,
      originalBillId: this.originalBillId || null,
      transport: this.transport || undefined,
      lrNo: this.lrNo || undefined,
      reason: this.reason || undefined,
      remark: this.remark || undefined,
      effectMode: this.effectMode,
      originalBillAmount: this.originalBillAmount(),
      creditNoteValidTill: this.creditNoteValidTill || null,
      creditNoteAdjustFuture: this.creditNoteAdjustFuture,
      commissionPct: this.commissionPct,
      status: this.grStatus,
      lines: validLines
    };

    // EDIT mode: in-place update (GR no same rehta hai, renumber nahi)
    if (this.editMode && this.editId) {
      this.svc.updateGoodsReturn(this.editId, payload as any).subscribe({
        next: (g) => {
          alert(`✓ GR ${g.grNo} update ho gaya!`);
          this.router.navigate(['/trading/gr']);
        },
        error: (e) => {
          this.error.set(e?.error?.error ?? 'Failed to update GR.');
          this.saving.set(false);
        }
      });
      return;
    }

    this.svc.createGoodsReturn(payload).subscribe({
      next: (g) => {
        alert(`✓ GR ${g.grNo} saved successfully!\n\n` +
              `Status: ${g.status}\n` +
              `Items Returned: ${g.lines.length}\n` +
              `Total Return: ₹${g.totalReturnAmount.toFixed(2)}\n` +
              `Net Bill After GR: ₹${g.netBillAfterGr.toFixed(2)}`);
        this.router.navigate(['/trading/gr']);
      },
      error: (e) => {
        this.error.set(e?.error?.error ?? 'Failed to save GR. Check all required fields.');
        this.saving.set(false);
      }
    });
  }
}
