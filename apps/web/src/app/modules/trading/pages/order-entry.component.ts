import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TradingService, Party, Item, OrderLine, Transporter } from '../services/trading.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { PartyQuickAddComponent } from '../../../shared/party-quick-add.component';
import { TransporterQuickAddComponent } from '../../../shared/transporter-quick-add.component';
import { BillScanModalComponent } from '../../ai/components/bill-scan-modal.component';
import { ExtractedBill, AiService } from '../../ai/services/ai.service';
import { amountInWords } from '../../../shared/amount-in-words.util';
import { todayLocal } from '../../../shared/date.util';
import { ToastService } from '../../../shared/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { FeatureService } from '../../../shared/feature.service';

interface RateOpt { qty: number; unit: string; rate: number; }
interface RateChoice {
  idx: number; name: string; taxable: number;
  optA: RateOpt; optB: RateOpt | null; raw: RateOpt;
}

interface LineRow {
  itemId: string | null;
  itemName: string;
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  rate: number;
  rd: number;
  sgstPct: number;
  cgstPct: number;
  igstPct: number;
  photoFile: File | null;
  photoPreview: string | null;
}

@Component({
  selector: 'app-order-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent, PartyQuickAddComponent, BillScanModalComponent, TransporterQuickAddComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <!-- ============ HEADER (Anjaninex solid navy, NO gradient) ============ -->
      <div class="ord-header">
        <div class="oh-left">
          <img src="anjaninex-logo.jpeg" alt="Anjaninex" class="oh-logo">
          <div>
            <h2 class="oh-title">{{ editMode ? 'Edit Order' : 'Order Add' }}</h2>
            <p class="oh-sub">@if (tempOrderNo) { Order No: <strong>{{ tempOrderNo }}</strong> · } ✍️ Prepared by: <strong>{{ auth.user()?.fullName }}</strong></p>
          </div>
        </div>
        <div class="oh-right">
          <button type="button" (click)="openScan()" class="oh-btn oh-btn-ai" title="Scan order/PO document">
            🤖 Scan Order
            @if (scanUse(); as u) {
              <span style="background:rgba(255,255,255,.25);border-radius:10px;padding:1px 8px;font-size:10px;margin-left:6px">
                {{ u.usedThisMonth }}{{ u.quotaMonthly ? '/' + u.quotaMonthly : '' }} is month
                @if (u.lastScanAt) { · last: {{ u.lastScanAt }} }
              </span>
            }
          </button>
          <button type="button" (click)="preview()" class="oh-btn oh-btn-light">👁 Preview</button>
          <button type="button" (click)="downloadPdf()" class="oh-btn oh-btn-light">📄 PDF</button>
          <button type="button" (click)="sendWhatsApp()" class="oh-btn oh-btn-wa">💬 WhatsApp</button>
          <a routerLink="/trading/orders" class="oh-btn oh-btn-close">✕ Close</a>
        </div>
      </div>

      <!-- AI Scan modal -->
      @if (showScan()) {
        <app-bill-scan-modal
          [source]="'order'"
          (closed)="showScan.set(false)"
          (dataReady)="applyAiExtraction($event)">
        </app-bill-scan-modal>
      }

      <!-- AI-extracted info banner -->
      @if (lastAiFill()) {
        <div class="ai-banner">
          <div>✨ <strong>Auto-filled this order</strong> ({{ (lastAiFill()!.confidence * 100).toFixed(0) }}% confidence)</div>
          <button type="button" (click)="lastAiFill.set(null)" class="ai-banner-close">✕</button>
        </div>
      }


      <!-- ============ SECTION 1: COMPANY & ORDER DETAILS ============ -->
      <div class="section-card">
        <div class="section-head">
          <span class="sec-ico">📋</span> COMPANY & ORDER DETAILS
        </div>
        <div class="grid grid-cols-3 gap-4 mt-3">
          <div>
            <label class="lbl">COMPANY *</label>
            <select [(ngModel)]="company" class="ip">
              <option value="namokara">{{ features.firmName() || 'Anjaninex' }}{{ features.firmGst() ? '-' + features.firmGst() : '' }}</option>
            </select>
          </div>
          <div>
            <label class="lbl">ORDER DATE *</label>
            <input [(ngModel)]="orderDate" type="date" class="ip">
          </div>
          <div>
            <label class="lbl">ORDER NO</label>
            <input type="text" disabled [value]="tempOrderNo" placeholder="Auto — save par milega" class="ip ip-auto">
          </div>
        </div>
      </div>

      <!-- ============ SECTION 2: SUPPLIER DETAILS ============ -->
      <div class="section-card">
        <div class="section-head">
          <span class="sec-ico">🏢</span> SUPPLIER DETAILS
        </div>
        <div class="grid grid-cols-2 gap-4 mt-3">
          <div>
            <label class="lbl">SUPPLIER *</label>
            <div class="combo-wrap">
              <div class="flex gap-1">
                <input type="text" [ngModel]="supplierFilter()" (ngModelChange)="supplierFilter.set($event); supplierDropdownOpen.set(true); supplierKbIdx.set(0)"
                       (focus)="supplierDropdownOpen.set(true)"
                       (blur)="closeSupplierDropdownSoon()"
                       (keydown)="supplierKey($event)"
                       placeholder="🔍 Name ya GST No se search..." class="ip flex-1">
                <button type="button" (click)="showAddSupplier.set(true)" class="qa-add-btn" title="Add new supplier to Party Master">+ New</button>
              </div>
              @if (supplierDropdownOpen() && (filteredGroups().length > 0 || filteredSuppliers().length > 0)) {
                <div class="combo-dropdown">
                  @for (g of filteredGroups(); track g.name; let gi = $index) {
                    <div class="combo-option" [class.kb-active]="gi === supplierKbIdx()" (mousedown)="selectGroupFromCombo(g)" style="background:#f3e8ff">
                      <div class="combo-name" style="color:#7c3aed;font-weight:700">{{ g.name }} <span style="font-size:11px">(GROUP - {{ g.count }} firms)</span></div>
                      <div class="combo-sub">Order group par book - bill par firm chuno (firm pending)</div>
                    </div>
                  }
                  @for (p of filteredSuppliers(); track p.id; let i = $index) {
                    <div class="combo-option" [class.kb-active]="filteredGroups().length + i === supplierKbIdx()" (mousedown)="selectSupplierFromCombo(p)">
                      <div class="combo-name">{{ p.displayName }}</div>
                      <div class="combo-sub">GST: {{ p.gst || '—' }} {{ p.partyCode ? '· ' + p.partyCode : '' }}</div>
                    </div>
                  }
                </div>
              }
              @if (supplierDropdownOpen() && supplierFilter() && filteredGroups().length === 0 && filteredSuppliers().length === 0) {
                <div class="combo-dropdown combo-empty">
                  ⚠️ No supplier found. Click <b class="text-green-600">+ New</b> to add "<i>{{ supplierFilter() }}</i>"
                </div>
              }
            </div>
          </div>
          <div>
            <label class="lbl">GSTIN *</label>
            <input type="text" [value]="supplierGstin" disabled placeholder="GSTIN" class="ip ip-auto">
          </div>
          <div>
            <label class="lbl">PAN</label>
            <input type="text" [value]="supplierPan" disabled placeholder="Auto fill" class="ip ip-auto">
          </div>
          <div>
            <label class="lbl">ADDRESS</label>
            <input type="text" [value]="supplierAddress" disabled placeholder="Auto fill" class="ip ip-auto">
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="lbl">MOBILE</label>
              <input type="text" [value]="supplierMobile" disabled placeholder="Auto fill" class="ip ip-auto">
            </div>
            <div>
              <label class="lbl">WHATSAPP</label>
              <div class="flex gap-1">
                <input type="text" [value]="supplierWhatsapp" disabled placeholder="Auto fill" class="ip ip-auto flex-1">
                <button type="button" class="wa-btn" [disabled]="!supplierWhatsapp && !supplierMobile"
                        (click)="openWhatsApp(supplierWhatsapp || supplierMobile)" title="WhatsApp karo">💬</button>
              </div>
            </div>
            <div>
              <label class="lbl">PARTY MASTER</label>
              @if (supplierInMaster) {
                <div class="pm-status pm-saved">✓ Party Master me save hai</div>
              } @else if (supplierFilter()) {
                <button type="button" class="pm-status pm-missing" (click)="showAddSupplier.set(true)">
                  ✗ Party Master me save nahi hai
                </button>
              } @else {
                <div class="pm-status pm-idle">— Pehle search karo</div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- ============ SECTION 3: BUYER DETAILS ============ -->
      <div class="section-card">
        <div class="section-head">
          <span class="sec-ico">🛒</span> BUYER DETAILS
        </div>
        <div class="grid grid-cols-2 gap-4 mt-3">
          <div>
            <label class="lbl">BUYER *</label>
            <div class="combo-wrap">
              <div class="flex gap-1">
                <input type="text" [ngModel]="buyerFilter()" (ngModelChange)="buyerFilter.set($event); buyerDropdownOpen.set(true); buyerKbIdx.set(0)"
                       (focus)="buyerDropdownOpen.set(true)"
                       (blur)="closeBuyerDropdownSoon()"
                       (keydown)="buyerKey($event)"
                       placeholder="🔍 Name ya GST No se search..." class="ip flex-1">
                <button type="button" (click)="showAddBuyer.set(true)" class="qa-add-btn" title="Add new buyer to Party Master">+ New</button>
              </div>
              @if (buyerDropdownOpen() && filteredBuyers().length > 0) {
                <div class="combo-dropdown">
                  @for (p of filteredBuyers(); track p.id; let i = $index) {
                    <div class="combo-option" [class.kb-active]="i === buyerKbIdx()" (mousedown)="selectBuyerFromCombo(p)">
                      <div class="combo-name">{{ p.displayName }}</div>
                      <div class="combo-sub">GST: {{ p.gst || '—' }} {{ p.partyCode ? '· ' + p.partyCode : '' }}</div>
                    </div>
                  }
                </div>
              }
              @if (buyerDropdownOpen() && buyerFilter() && filteredBuyers().length === 0) {
                <div class="combo-dropdown combo-empty">
                  ⚠️ No buyer found. Click <b class="text-green-600">+ New</b> to add "<i>{{ buyerFilter() }}</i>"
                </div>
              }
            </div>
          </div>
          <div>
            <label class="lbl">BUYER GSTIN</label>
            <input type="text" [value]="buyerGstin" disabled placeholder="Buyer GSTIN" class="ip ip-auto">
          </div>
          <div>
            <label class="lbl">BUYER PAN</label>
            <input type="text" [value]="buyerPan" disabled placeholder="Auto fill" class="ip ip-auto">
          </div>
          <div>
            <label class="lbl">BUYER ADDRESS</label>
            <input type="text" [value]="buyerAddress" disabled placeholder="Auto fill" class="ip ip-auto">
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="lbl">BUYER MOBILE</label>
              <input type="text" [value]="buyerMobile" disabled placeholder="Auto fill" class="ip ip-auto">
            </div>
            <div>
              <label class="lbl">BUYER WHATSAPP</label>
              <div class="flex gap-1">
                <input type="text" [value]="buyerWhatsapp" disabled placeholder="Auto fill" class="ip ip-auto flex-1">
                <button type="button" class="wa-btn" [disabled]="!buyerWhatsapp && !buyerMobile"
                        (click)="openWhatsApp(buyerWhatsapp || buyerMobile)" title="WhatsApp karo">💬</button>
              </div>
            </div>
            <div>
              <label class="lbl">PARTY MASTER</label>
              @if (buyerInMaster) {
                <div class="pm-status pm-saved">✓ Party Master me save hai</div>
              } @else if (buyerFilter()) {
                <button type="button" class="pm-status pm-missing" (click)="showAddBuyer.set(true)">
                  ✗ Party Master me save nahi hai
                </button>
              } @else {
                <div class="pm-status pm-idle">— Pehle search karo</div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- ============ SECTION 4: ITEM DETAILS ============ -->
      <div class="section-card">
        <div class="flex items-center justify-between">
          <div class="section-head no-border">
            <span class="sec-ico">📦</span> ITEM DETAILS
          </div>
          <button type="button" (click)="addLine()" class="btn-add-item">+ Add Item</button>
        </div>

        @if (reconcileNote()) {
          <div class="reconcile-note">⚠️ {{ reconcileNote() }}</div>
        }

        <div class="item-table-wrap mt-2">
          <table class="item-table">
            <thead>
              <tr>
                <th class="w-10">SNO.</th>
                <th>ITEM NAME</th>
                <th>CATEGORY</th>
                <th class="w-16">QTY.</th>
                <th class="w-20">UNIT</th>
                <th class="w-28">PRICE</th>
                <th class="w-16">RD</th>
                <th class="w-20">HSN</th>
                <th class="w-16">SGST%</th>
                <th class="w-16">CGST%</th>
                <th class="w-16">IGST%</th>
                <th class="w-24">TAXABLE AMT</th>
                <th class="w-20">TAX AMT</th>
                <th class="w-24">TOTAL</th>
                <th class="w-10">DEL</th>
                <th class="w-16">PHOTO</th>
              </tr>
            </thead>
            <tbody>
              @for (line of lines(); track $index) {
                <tr>
                  <td class="text-center sno-cell" data-label="#">{{ $index + 1 }}</td>
                  <td data-label="Item Name">
                    <input [ngModel]="line.itemName"
                           (ngModelChange)="updateLine($index, 'itemName', $event)"
                           list="items-list" class="tip" placeholder="Item name"
                           (change)="autoFillFromItem($index, $event)">
                  </td>
                  <td data-label="Category">
                    <select [ngModel]="line.description"
                            (ngModelChange)="updateLine($index, 'description', $event)"
                            (change)="onDescPick($index, $event)"
                            class="tip">
                      <option value="">— Select —</option>
                      @for (it of items(); track it.id) {
                        <option [value]="it.name">{{ it.name }}</option>
                      }
                      <option value="Other">Other</option>
                    </select>
                  </td>
                  <td data-label="Qty">
                    <input [ngModel]="line.qty"
                           (ngModelChange)="updateLine($index, 'qty', +$event)"
                           type="number" step="0.01" class="tip text-right">
                  </td>
                  <td data-label="Unit">
                    <select [ngModel]="line.unit"
                            (ngModelChange)="updateLine($index, 'unit', $event)"
                            class="tip">
                      <option value="MTR">MTR × Rate</option>
                      <option value="PCS">PCS × Rate</option>
                      <option value="KG">KG</option>
                      <option value="DOZ">DOZ</option>
                      <option value="BOX">BOX</option>
                      <option value="LTR">LTR</option>
                    </select>
                  </td>
                  <td data-label="Price">
                    <input [ngModel]="line.rate"
                           (ngModelChange)="updateLine($index, 'rate', +$event)"
                           type="number" step="0.01" class="tip text-right">
                  </td>
                  <td data-label="RD">
                    <input [ngModel]="line.rd"
                           (ngModelChange)="updateLine($index, 'rd', +$event)"
                           type="number" step="0.01" class="tip text-right">
                  </td>
                  <td data-label="HSN">
                    <input [ngModel]="line.hsnSac"
                           (ngModelChange)="updateLine($index, 'hsnSac', $event)"
                           type="text" class="tip text-center" placeholder="HSN">
                  </td>
                  <td data-label="SGST %">
                    <input [ngModel]="line.sgstPct"
                           (ngModelChange)="updateLine($index, 'sgstPct', +$event)"
                           type="number" step="0.01" class="tip text-right"
                           [disabled]="isInterState()">
                  </td>
                  <td data-label="CGST %">
                    <input [ngModel]="line.cgstPct"
                           (ngModelChange)="updateLine($index, 'cgstPct', +$event)"
                           type="number" step="0.01" class="tip text-right"
                           [disabled]="isInterState()">
                  </td>
                  <td data-label="IGST %">
                    <input [ngModel]="line.igstPct"
                           (ngModelChange)="updateLine($index, 'igstPct', +$event)"
                           type="number" step="0.01" class="tip text-right"
                           [disabled]="!isInterState()">
                  </td>
                  <td class="text-right font-mono" data-label="Taxable Amt">{{ lineTaxable($index) | number:'1.2-2' }}</td>
                  <td class="text-right font-mono" data-label="Tax Amt">{{ lineTax($index) | number:'1.2-2' }}</td>
                  <td class="text-right font-mono total-cell" data-label="Total">{{ lineTotal($index) | number:'1.2-2' }}</td>
                  <td class="text-center" data-label="Delete">
                    @if (lines().length > 1) {
                      <button type="button" (click)="removeLine($index)" class="btn-del">🗑</button>
                    }
                  </td>
                  <td class="text-center" data-label="Photo">
                    <label class="photo-upload">
                      @if (line.photoPreview) {
                        <img [src]="line.photoPreview" alt="item">
                      } @else {
                        <span class="cam-ico">📷</span>
                      }
                      <input type="file" accept="image/*" hidden
                             (change)="onItemPhoto($index, $event)">
                    </label>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" class="text-right ft-label">TOTALS →</td>
                <td class="text-center font-mono font-bold" data-label="Total Qty">{{ totalQty() | number:'1.0-3' }}</td>
                <td colspan="7" class="ft-blank"></td>
                <td class="text-right font-mono" data-label="Taxable">{{ totalTaxable() | number:'1.2-2' }}</td>
                <td class="text-right font-mono" data-label="Tax">{{ totalTax() | number:'1.2-2' }}</td>
                <td class="text-right font-mono" data-label="Total">{{ totalAmount() | number:'1.2-2' }}</td>
                <td colspan="2" class="ft-blank"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <datalist id="items-list">
          @for (i of items(); track i.id) {
            <option [value]="i.name"></option>
          }
        </datalist>
      </div>

      <!-- ============ SECTION 5: ADJUSTMENTS + ORDER SUMMARY ============ -->
      <div class="grid grid-cols-3 gap-4 mt-4">

        <!-- LEFT: Adjustments (2/3 width) -->
        <div class="section-card col-span-2">
          <div class="section-head">
            <span class="sec-ico">⚙️</span> ADJUSTMENTS
          </div>

          <!-- CD Toggle -->
          <div class="cd-block mt-3">
            <div class="cd-head">
              <span>$ CD (Cash Discount)</span>
              <button type="button" class="toggle" [class.on]="cdEnabled()" (click)="toggleCd()">
                <span class="dot"></span>
                <span class="toggle-text">{{ cdEnabled() ? 'ON' : 'OFF' }}</span>
              </button>
            </div>
            @if (cdEnabled()) {
              <!-- CD Type: Before GST = discount pehle, GST kam base par | After GST = GST poore par, discount total par -->
              <div class="flex gap-2 mt-2">
                <button type="button" (click)="setCdType('before')"
                        [class]="cdType() === 'before'
                          ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-anjaninex-navy text-white'
                          : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-600'">
                  Before GST
                </button>
                <button type="button" (click)="setCdType('after')"
                        [class]="cdType() === 'after'
                          ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-anjaninex-navy text-white'
                          : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-600'">
                  After GST
                </button>
                <span class="text-[11px] text-gray-400 self-center">
                  {{ cdType() === 'before' ? 'Discount pehle — GST kam amount par lagega' : 'GST poore par — discount bill total par' }}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label class="lbl">CD %</label>
                  <input [ngModel]="cdPct()" (ngModelChange)="onCdPctChange($event)"
                         type="number" step="0.01" min="0" class="ip">
                </div>
                <div>
                  <label class="lbl">CD AMOUNT (₹) — editable</label>
                  <input [ngModel]="cdAmount()" (ngModelChange)="onCdAmountChange($event)"
                         type="number" step="0.01" min="0" class="ip">
                </div>
              </div>
            }
          </div>

          <!-- 💸 SUPPLIER DISCOUNT — % master se auto, amount auto-calculate (editable).
               Before/After GST wahi lagta hai jo upar CD me set hai. -->
          <div class="cd-block mt-3">
            <div class="cd-head">
              <span>💸 Supplier Discount
                <small style="font-weight:400;color:#9CA3AF">(master se auto · Before/After GST — CD wala hi)</small>
              </span>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label class="lbl">NORMAL DISC %</label>
                <input [ngModel]="discNormalPct()" (ngModelChange)="onDiscNormalPct($event)"
                       type="number" step="0.01" min="0" class="ip">
              </div>
              <div>
                <label class="lbl">NORMAL DISC AMT (₹) — editable</label>
                <input [ngModel]="discNormalAmt()" (ngModelChange)="onDiscNormalAmt($event)"
                       type="number" step="0.01" min="0" class="ip">
              </div>
              <div>
                <label class="lbl">EXHIBITION DISC %</label>
                <input [ngModel]="discExhPct()" (ngModelChange)="onDiscExhPct($event)"
                       type="number" step="0.01" min="0" class="ip">
              </div>
              <div>
                <label class="lbl">EXHIBITION DISC AMT (₹) — editable</label>
                <input [ngModel]="discExhAmt()" (ngModelChange)="onDiscExhAmt($event)"
                       type="number" step="0.01" min="0" class="ip">
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label class="lbl">SUPPLIER ORDER NO.</label>
              <input [(ngModel)]="supplierOrderNo" type="text" placeholder="Supplier's order ref" class="ip">
            </div>
            <div>
              <label class="lbl">SUPPLIER GROUP (firm abhi pakki nahi to)</label>
              <input [(ngModel)]="supplierGroupName" type="text" placeholder="e.g. Gupta Group" class="ip">
            </div>
            <div>
              <label class="lbl">TRANSPORTER</label>
              <div class="combo-wrap">
                <div class="flex gap-2">
                  <input type="text" [ngModel]="transporterFilter()"
                         (ngModelChange)="transporterFilter.set($event); transporterDropdownOpen.set(true); transporterKbIdx.set(0); onTransporterTyped($event)"
                         (focus)="transporterDropdownOpen.set(true)"
                         (blur)="closeTransporterDropdownSoon()"
                         (keydown)="transporterKey($event)"
                         placeholder="🔍 Transporter name ya GST se search..." class="ip flex-1">
                  <button type="button" (click)="quickAddTransporter()"
                          class="px-3 rounded-lg text-xs font-bold bg-anjaninex-navy text-white hover:bg-[#2a4178] whitespace-nowrap"
                          title="Naya transporter add karo">+ New</button>
                </div>
                @if (transporterDropdownOpen() && filteredTransporters().length > 0) {
                  <div class="combo-dropdown">
                    @for (t of filteredTransporters(); track t.id; let i = $index) {
                      <div class="combo-option" [class.kb-active]="i === transporterKbIdx()"
                           (mousedown)="selectTransporterFromCombo(t)">
                        <div class="combo-name">{{ t.firmName }}</div>
                        <div class="combo-sub">GST: {{ t.gstNo || '—' }} {{ t.mobile ? '· ' + t.mobile : (t.city ? '· ' + t.city : '') }}</div>
                      </div>
                    }
                  </div>
                }
                @if (transporterDropdownOpen() && transporterFilter() && filteredTransporters().length === 0) {
                  <div class="combo-dropdown combo-empty">
                    ⚠️ No transporter found. <b class="text-green-600">+ New</b> se add karein.
                  </div>
                }
              </div>
            </div>
            <div>
              <label class="lbl">TRANSPORTER GST</label>
              <input type="text" [value]="selTransporter()?.gstNo || ''" disabled placeholder="Auto fill" class="ip ip-auto">
            </div>
            <div>
              <label class="lbl">TRANSPORTER MOBILE</label>
              <input type="text" [value]="selTransporter()?.mobile || ''" disabled placeholder="Auto fill" class="ip ip-auto">
            </div>
            <div>
              <label class="lbl">PAYMENT TERMS *</label>
              <select [(ngModel)]="paymentTerms" class="ip">
                <option value="">Select...</option>
                <option value="advance">Advance Payment</option>
                <option value="net15">Net 15 Days</option>
                <option value="net30">Net 30 Days</option>
                <option value="net45">Net 45 Days</option>
                <option value="net60">Net 60 Days</option>
                <option value="net90">Net 90 Days</option>
                <option value="cod">COD (Cash on Delivery)</option>
                <option value="loa">LOA (Letter of Authorization)</option>
              </select>
            </div>
            <div>
              <label class="lbl">ORDER STATUS</label>
              <select [(ngModel)]="orderStatus" class="ip">
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="partial">Partial</option>
                <option value="billed">Billed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label class="lbl">REMARK</label>
              <input [(ngModel)]="remark" type="text" placeholder="Optional remark" class="ip">
            </div>
            <div>
              <label class="lbl">INSURANCE</label>
              <input [ngModel]="insuranceAmt()" (ngModelChange)="insuranceAmt.set(+$event || 0)" type="number" step="0.01" class="ip">
            </div>
          </div>
        </div>

        <!-- RIGHT: Order Summary (1/3 width) -->
        <div class="section-card summary-card">
          <div class="section-head">
            <span class="sec-ico">🧾</span> ORDER SUMMARY
          </div>
          <div class="sum-rows mt-3">
            <div class="sum-row">
              <span>Gross Amount</span>
              <span class="font-mono">₹ {{ totalTaxable() | number:'1.2-2' }}</span>
            </div>
            <div class="sum-row">
              <span>Total Tax {{ cdType() === 'before' && cdAmount() > 0 ? '(CD ke baad)' : '' }}</span>
              <span class="font-mono">₹ {{ effTax() | number:'1.2-2' }}</span>
            </div>
            <div class="sum-row">
              <span>Taxable Amount</span>
              <span class="font-mono">₹ {{ totalTaxable() | number:'1.2-2' }}</span>
            </div>
            <div class="sum-row">
              <span>💵 CD Discount ({{ cdType() === 'before' ? 'Before GST' : 'After GST' }})</span>
              <span class="font-mono text-red-600">- ₹ {{ cdAmount() | number:'1.2-2' }}</span>
            </div>
            @if (discNormalAmt() > 0) {
              <div class="sum-row">
                <span>Normal Disc</span>
                <span class="font-mono text-red-600">- ₹ {{ discNormalAmt() | number:'1.2-2' }}</span>
              </div>
            }
            @if (discExhAmt() > 0) {
              <div class="sum-row">
                <span>Exhibition Disc</span>
                <span class="font-mono text-red-600">- ₹ {{ discExhAmt() | number:'1.2-2' }}</span>
              </div>
            }
            @if (insuranceAmt() > 0) {
              <div class="sum-row">
                <span>Insurance</span>
                <span class="font-mono">+ ₹ {{ insuranceAmt() | number:'1.2-2' }}</span>
              </div>
            }
            <div class="sum-divider"></div>
            <div class="sum-row">
              <span>Net Total</span>
              <span class="font-mono">₹ {{ netTotal() | number:'1.2-2' }}</span>
            </div>
            @if (roundOff() !== 0) {
              <div class="sum-row" [style.color]="roundOff() >= 0 ? '#15803d' : '#dc2626'">
                <span>R/Off</span>
                <span class="font-mono">{{ roundOff() >= 0 ? '+' : '-' }} ₹ {{ (roundOff() < 0 ? -roundOff() : roundOff()) | number:'1.2-2' }}</span>
              </div>
            }
            <div class="sum-grand">
              <span>🪙 NET AMOUNT</span>
              <span class="font-mono">₹ {{ netAmountRounded() | number:'1.0-0' }}</span>
            </div>
            @if (netAmountRounded() > 0) {
              <div class="sum-words">📝 {{ words(netAmountRounded()) }}</div>
            }

            <div class="sum-tax-head">TAX BREAKDOWN</div>
            @if (isInterState()) {
              <div class="sum-row sm">
                <span>IGST Total</span>
                <span class="font-mono">₹ {{ effIgst() | number:'1.2-2' }}</span>
              </div>
            } @else {
              <div class="sum-row sm">
                <span>SGST Total</span>
                <span class="font-mono">₹ {{ effSgst() | number:'1.2-2' }}</span>
              </div>
              <div class="sum-row sm">
                <span>CGST Total</span>
                <span class="font-mono">₹ {{ effCgst() | number:'1.2-2' }}</span>
              </div>
            }
            <div class="sum-row sm">
              <span>Total Items</span>
              <span class="font-mono">{{ lines().length }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Error -->
      @if (error()) {
        <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mt-3">
          {{ error() }}
        </div>
      }

      <!-- ============ SECTION 6: ORDER DOCUMENT UPLOAD ============ -->
      <div class="section-card mt-4">
        <div class="section-head">
          <span class="sec-ico">📎</span> ORDER DOCUMENT UPLOAD
          @if (uploadedDocName()) {
            <button type="button" (click)="previewDoc()" class="doc-eye-btn" title="Preview uploaded order doc">
              👁 View
            </button>
          }
        </div>
        <div class="mt-3">
          <label class="doc-upload">
            <input type="file" accept="image/*,application/pdf" hidden (change)="onDocUpload($event)">
            @if (uploadedDocName()) {
              <div class="doc-uploaded">
                <span class="doc-ico">✓</span>
                <div class="flex-1">
                  <div class="doc-name">{{ uploadedDocName() }}</div>
                  <div class="doc-hint">Click to replace · Use 🤖 Scan Order to auto-fill from this document</div>
                </div>
              </div>
            } @else {
              <div class="doc-empty">
                <span class="doc-ico-big">📄</span>
                <div>
                  <div class="doc-cta">📤 UPLOAD ORDER / PO</div>
                  <div class="doc-hint">JPG, PNG, PDF SUPPORTED</div>
                </div>
              </div>
            }
          </label>
        </div>
      </div>

      <!-- DOC PREVIEW MODAL -->
      @if (docPreviewUrl()) {
        <div class="doc-modal-overlay" (click)="closeDocPreview()">
          <div class="doc-modal" (click)="$event.stopPropagation()">
            <div class="doc-modal-head">
              <strong>📎 Order Document — {{ uploadedDocName() }}</strong>
              <button type="button" (click)="closeDocPreview()" class="doc-modal-close">✕</button>
            </div>
            <div class="doc-modal-body">
              @if (docPreviewType() === 'image') {
                <img [src]="docPreviewUrl()" alt="Order doc preview" class="doc-preview-img">
              } @else if (docPreviewType() === 'pdf') {
                <iframe [src]="docPreviewUrl()" class="doc-preview-pdf"></iframe>
              }
            </div>
          </div>
        </div>
      }

      <!-- ============ BOTTOM BAR ============ -->
      <div class="bottom-bar">
        <a routerLink="/trading/orders" class="btn-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
          Back
        </a>
        <div class="flex gap-3 items-center">
          @if (error()) {
            <span class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm font-semibold">
              ⚠️ {{ error() }}
            </span>
          }
          <button type="button" (click)="preview()" class="btn-preview" title="Preview">👁</button>
          <button type="button" (click)="save()" [disabled]="saving()" class="btn-save">
            {{ saving() ? (editMode ? 'Updating…' : 'Submitting…') : (editMode ? '✓ Update Order' : '✓ Submit Order') }}
          </button>
        </div>
      </div>

      <!-- RATE CHOICE popup — bill par rate clear nahi tha, user decide kare qty/rate -->
      @if (rateChoiceOpen() && rateChoiceItems().length) {
        <div class="rc-overlay" (click)="closeRateChoice()">
          <div class="rc-modal" (click)="$event.stopPropagation()">
            <div class="rc-head">⚠️ Rate bill par nahi hai</div>
            <p class="rc-sub">Is bill par item ka <b>RATE nahi chhpa</b>. Aap decide karein <b>Qty</b> kya leni hai —
              rate apne aap (Taxable ÷ Qty) lag jayega. (Dono option ka amount bill se match karega.)</p>
            @for (rc of rateChoiceItems(); track rc.idx) {
              <div class="rc-item">
                <div class="rc-name">{{ rc.name }} <span class="rc-tax">Taxable: ₹{{ rc.taxable | number:'1.2-2' }}</span></div>
                <div class="rc-opts">
                  @if (rc.optB) {
                    <button type="button" class="rc-opt" (click)="applyRateChoice(rc.idx, rc.optB!)">
                      <b>Qty {{ rc.optB.qty }} {{ rc.optB.unit }}</b> × ₹{{ rc.optB.rate }}
                      <span class="rc-hint">option 1</span>
                    </button>
                  }
                  <button type="button" class="rc-opt" (click)="applyRateChoice(rc.idx, rc.optA)">
                    <b>Qty {{ rc.optA.qty }} {{ rc.optA.unit }}</b> × ₹{{ rc.optA.rate }}
                    <span class="rc-hint">option 2</span>
                  </button>
                  <button type="button" class="rc-opt rc-raw" (click)="applyRateChoice(rc.idx, rc.raw)">
                    Jaisa AI ne padha: Qty {{ rc.raw.qty }} {{ rc.raw.unit }} × ₹{{ rc.raw.rate }}
                  </button>
                </div>
              </div>
            }
            <div class="rc-actions">
              <button type="button" class="rc-close" (click)="closeRateChoice()">Band karo — main khud bharunga</button>
            </div>
          </div>
        </div>
      }

      <!-- Quick-Add Transporter modal (pura form) -->
      @if (showAddTransporter()) {
        <app-transporter-quick-add
          (created)="onTransporterCreated($event)"
          (close)="showAddTransporter.set(false)">
        </app-transporter-quick-add>
      }

      <!-- Quick-Add Party modals (pre-filled from current search input + auto-fill fields) -->
      @if (showAddSupplier()) {
        <app-party-quick-add partyType="supplier"
                             [prefill]="supplierPrefill()"
                             (created)="onPartyCreated($event, 'supplier')"
                             (close)="showAddSupplier.set(false)"></app-party-quick-add>
      }
      @if (showAddBuyer()) {
        <app-party-quick-add partyType="buyer"
                             [prefill]="buyerPrefill()"
                             (created)="onPartyCreated($event, 'buyer')"
                             (close)="showAddBuyer.set(false)"></app-party-quick-add>
      }

    </div>
  `,
  styles: [`
    /* WhatsApp button — phone field ke side me */
    .wa-btn { width: 38px; border: 1px solid #86efac; background: #dcfce7; border-radius: 8px;
      cursor: pointer; font-size: 15px; flex: none; }
    .wa-btn:hover:not(:disabled) { background: #bbf7d0; }
    .wa-btn:disabled { opacity: .4; cursor: not-allowed; }

    /* Party Master status chip — saved / missing / idle */
    .pm-status { width: 100%; padding: 9px 10px; border-radius: 8px; font-size: 12px; font-weight: 800;
      text-align: center; font-family: inherit; }
    .pm-saved { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
    .pm-missing { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; cursor: pointer; }
    .pm-missing:hover { background: #fecaca; }
    .pm-idle { background: #f3f4f6; color: #9ca3af; border: 1px solid #e5e7eb; }

    /* ============ Anjaninex BRAND COLORS — NO gradient ============ */
    :host {
      display: block; background: #FAF7F0; min-height: 100vh; padding: 16px 0;
    }

    /* HEADER */
    .ord-header {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 14px 22px; border-radius: 12px 12px 0 0;
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px; box-shadow: 0 2px 8px rgba(27,46,92,0.12);
    }
    .oh-left { display: flex; align-items: center; gap: 12px; }
    .oh-logo {
      width: 44px; height: 44px; object-fit: contain;
      background: #fff; border-radius: 8px; padding: 4px;
    }
    .oh-title { font-size: 19px; font-weight: 800; margin: 0; letter-spacing: 0.3px; }
    .oh-sub { font-size: 12px; opacity: 0.85; margin: 0; }
    .oh-sub strong { color: #FCD34D; }
    .oh-right { display: flex; gap: 8px; }
    .oh-btn {
      padding: 8px 14px; border-radius: 8px; font-weight: 700; font-size: 12.5px;
      cursor: pointer; border: 0; font-family: inherit; text-decoration: none;
      transition: transform 0.1s, background 0.15s; display: inline-flex; align-items: center; gap: 4px;
    }
    .oh-btn-light { background: rgba(255,255,255,0.15); color: #fff; }
    .oh-btn-light:hover { background: rgba(255,255,255,0.25); }
    .oh-btn-wa { background: #25D366; color: #fff; }
    .oh-btn-wa:hover { background: #1FB957; }
    .oh-btn-close { background: #DC2626; color: #fff; }
    .oh-btn-close:hover { background: #B91C1C; }

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

    /* INPUTS */
    .lbl {
      display: block; font-size: 10px; font-weight: 700; color: #4A5878;
      letter-spacing: 0.5px; margin-bottom: 4px; text-transform: uppercase;
    }
    .ip {
      width: 100%; padding: 8px 10px; border: 1px solid #D6DDEA; border-radius: 6px;
      font-size: 13px; color: #1B2E5C; background: #fff; font-family: inherit;
      transition: border 0.15s, box-shadow 0.15s;
    }
    .ip:focus {
      outline: none; border-color: #DC2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.1);
    }
    .ip-auto {
      background: #ECFDF5; color: #047857; border-color: #A7F3D0; font-weight: 600;
    }
    .reconcile-note {
      margin-top: 8px; padding: 8px 12px; border-radius: 8px;
      background: #FEF3C7; border: 1px solid #FBBF24; color: #92400E;
      font-size: 12px; font-weight: 600; line-height: 1.4;
    }
    .rc-overlay { position: fixed; inset: 0; background: rgba(15,30,64,.55); z-index: 1000;
      display: flex; align-items: center; justify-content: center; padding: 16px; }
    .rc-modal { background: #fff; border-radius: 14px; max-width: 520px; width: 100%;
      padding: 20px; box-shadow: 0 20px 60px rgba(0,0,0,.3); max-height: 86vh; overflow-y: auto; }
    .rc-head { font-size: 17px; font-weight: 800; color: #1B2E5C; margin-bottom: 6px; }
    .rc-sub { font-size: 12.5px; color: #4A5878; margin-bottom: 14px; line-height: 1.5; }
    .rc-item { border: 1px solid #E5E9F2; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
    .rc-name { font-weight: 700; color: #1B2E5C; margin-bottom: 8px; font-size: 14px; }
    .rc-tax { font-weight: 600; color: #16A34A; font-size: 12px; margin-left: 6px; }
    .rc-opts { display: flex; flex-direction: column; gap: 8px; }
    .rc-opt { text-align: left; padding: 10px 12px; border-radius: 8px; cursor: pointer;
      border: 1.5px solid #1B2E5C; background: #F5F7FB; color: #1B2E5C; font-size: 14px; transition: all .12s; }
    .rc-opt:hover { background: #1B2E5C; color: #fff; }
    .rc-opt .rc-hint { display: block; font-size: 11px; font-weight: 600; opacity: .8; margin-top: 2px; }
    .rc-raw { border-color: #9CA3AF; background: #fff; color: #6B7280; font-size: 12.5px; }
    .rc-raw:hover { background: #6B7280; color: #fff; }
    .rc-actions { text-align: center; margin-top: 6px; }
    .rc-close { background: none; border: 0; color: #6B7280; font-size: 12.5px; cursor: pointer; text-decoration: underline; }
    select.ip { cursor: pointer; }

    /* ITEM TABLE */
    .btn-add-item {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 8px 16px; border-radius: 8px;
      font-size: 13px; font-weight: 700; border: 0; cursor: pointer; font-family: inherit;
    }
    .btn-add-item:hover { background: #142347; }

    .item-table-wrap { overflow-x: auto; border: 1px solid #D6DDEA; border-radius: 8px; }
    .item-table {
      width: 100%; min-width: 1360px; font-size: 12px; border-collapse: collapse; background: #fff;
    }
    /* Desktop: columns apni poori readable width me; table LEFT-RIGHT scroll karti hai */
    .item-table th:nth-child(2), .item-table td:nth-child(2){ min-width: 170px; }  /* Item Name */
    .item-table th:nth-child(3), .item-table td:nth-child(3){ min-width: 160px; }  /* Description */
    .item-table thead { background: var(--anjaninex-navy, #1B2E5C); color: #fff; }
    .item-table th {
      padding: 8px 6px; text-align: left; font-weight: 700; font-size: 10px;
      letter-spacing: 0.3px; text-transform: uppercase; white-space: nowrap;
    }
    .item-table td {
      padding: 6px 5px; border-bottom: 1px solid #F5EFE3; vertical-align: middle;
    }
    .item-table tbody tr:hover { background: #FAF7F0; }
    .item-table tfoot { background: #F5EFE3; font-weight: 800; color: #1B2E5C; }
    .item-table tfoot td { padding: 8px 6px; border-top: 2px solid #1B2E5C; }
    .total-cell { color: #DC2626; font-weight: 800; }

    .tip {
      width: 100%; padding: 7px 8px; border: 1px solid #E5E9F2; border-radius: 4px;
      font-size: 12px; color: #1B2E5C; background: #fff; font-family: inherit;
    }
    .tip:focus { outline: none; border-color: #DC2626; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .btn-del {
      background: transparent; border: 0; color: #DC2626; font-size: 14px;
      cursor: pointer; padding: 2px 6px;
    }

    /* PHOTO UPLOAD */
    .photo-upload {
      display: inline-flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border: 1px dashed #D6DDEA; border-radius: 6px;
      cursor: pointer; transition: border 0.15s, background 0.15s; background: #FAF7F0;
    }
    .photo-upload:hover { border-color: #DC2626; background: #FEF2F2; }
    .photo-upload img { width: 32px; height: 32px; object-fit: cover; border-radius: 4px; }
    .cam-ico { font-size: 16px; opacity: 0.6; }

    /* CD TOGGLE */
    .cd-block {
      background: #F5EFE3; padding: 12px 14px; border-radius: 8px; border: 1px solid #D6DDEA;
    }
    .cd-head {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 13px; font-weight: 700; color: #1B2E5C;
    }
    .toggle {
      display: inline-flex; align-items: center; gap: 8px;
      background: #E5E9F2; border: 0; border-radius: 999px; padding: 4px 12px 4px 4px;
      cursor: pointer; font-family: inherit; font-size: 11px; font-weight: 700;
      color: #4A5878; transition: background 0.15s;
    }
    .toggle .dot {
      width: 18px; height: 18px; background: #fff; border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: transform 0.2s;
    }
    .toggle.on { background: #10B981; color: #fff; }
    .toggle-text { letter-spacing: 0.5px; }

    /* SUMMARY CARD */
    .summary-card { background: #fff; }
    .sum-rows { font-size: 13px; }
    .sum-row {
      display: flex; justify-content: space-between; padding: 6px 0;
      border-bottom: 1px dashed #F5EFE3; color: #4A5878;
    }
    .sum-row.sm { font-size: 11.5px; padding: 4px 0; }
    .sum-row:last-of-type { border-bottom: 0; }
    .sum-divider { height: 1px; background: #D6DDEA; margin: 8px 0; }
    .sum-grand {
      display: flex; justify-content: space-between; padding: 10px 14px;
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; border-radius: 8px; margin: 8px 0;
      font-size: 14px; font-weight: 800;
    }
    .sum-words {
      font-size: 11.5px; color: #065f46;
      background: #ecfdf5; border-left: 3px solid #10b981;
      padding: 6px 10px; border-radius: 4px; margin: -4px 0 8px;
      font-style: italic; font-weight: 600; line-height: 1.4;
    }
    .sum-tax-head {
      font-size: 10px; font-weight: 800; color: #4A5878; letter-spacing: 0.5px;
      margin-top: 14px; padding-top: 8px; border-top: 1px solid #D6DDEA; text-transform: uppercase;
    }

    /* BOTTOM BAR */
    .bottom-bar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 0 8px; margin-top: 16px; border-top: 1px solid #D6DDEA;
    }
    .btn-back {
      padding: 9px 18px; background: #fff; border: 1px solid #D6DDEA; border-radius: 8px;
      font-size: 13px; font-weight: 700; color: #4A5878; text-decoration: none;
      display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s;
    }
    .btn-back:hover { background: #F5EFE3; border-color: #1B2E5C; color: #DC2626; }
    .btn-back svg { width: 14px; height: 14px; }
    .btn-preview {
      width: 38px; height: 38px; background: #fff; border: 1px solid #D6DDEA; border-radius: 8px;
      cursor: pointer; font-size: 16px;
    }
    .btn-preview:hover { background: #F5EFE3; }
    .qa-add-btn {
      padding: 6px 12px; background: linear-gradient(135deg, #16a34a, #15803d);
      color: #fff; border: none; border-radius: 6px; font-size: 11px; font-weight: 700;
      cursor: pointer; white-space: nowrap; font-family: inherit;
    }
    .qa-add-btn:hover { background: linear-gradient(135deg, #15803d, #166534); }

    /* AI Scan button in header */
    .oh-btn-ai {
      background: linear-gradient(135deg, #7c3aed, #5c1a8b); color: #fff;
      display: inline-flex; align-items: center; gap: 4px;
    }
    .oh-btn-ai:hover { background: linear-gradient(135deg, #5c1a8b, #4a1080); }

    /* AI info banner */
    .ai-banner {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 16px; margin: 10px 0; border-radius: 10px; font-size: 13px;
      background: linear-gradient(90deg, #f0e6ff, #ddc8f5); color: #4a1080;
      border-left: 4px solid #7c3aed;
    }
    .ai-banner-close {
      background: rgba(0,0,0,.1); border: none; width: 24px; height: 24px; border-radius: 6px;
      cursor: pointer; font-weight: 800; color: inherit;
    }
    .ai-banner-close:hover { background: rgba(0,0,0,.2); }

    /* DOCUMENT UPLOAD section (matches bill-entry style) */
    .doc-upload {
      display: block; cursor: pointer; border: 2px dashed #D6DDEA; border-radius: 10px;
      padding: 24px; background: #FAF7F0; transition: border 0.15s, background 0.15s;
    }
    .doc-upload:hover { border-color: #DC2626; background: #FEF2F2; }
    .doc-empty { display: flex; align-items: center; gap: 16px; }
    .doc-uploaded { display: flex; align-items: center; gap: 14px; }
    .doc-ico-big { font-size: 38px; }
    .doc-ico {
      width: 36px; height: 36px; background: #10B981; color: #fff; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center; font-weight: 800;
    }
    .doc-cta { font-size: 14px; font-weight: 800; color: #1B2E5C; }
    .doc-hint { font-size: 11px; color: #4A5878; margin-top: 2px; }
    .doc-name { font-size: 13px; font-weight: 700; color: #1B2E5C; }

    /* 👁 Eye/View button in section head */
    .doc-eye-btn {
      margin-left: auto; padding: 4px 10px; font-size: 11.5px; font-weight: 700;
      background: linear-gradient(135deg, #5c1a8b, #7c3aed); color: #fff;
      border: 0; border-radius: 6px; cursor: pointer;
    }
    .doc-eye-btn:hover { background: linear-gradient(135deg, #4a1370, #6b21a8); }

    /* Document preview modal */
    .doc-modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 30px;
    }
    .doc-modal {
      background: #fff; border-radius: 12px; max-width: 900px; width: 100%;
      max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .doc-modal-head {
      padding: 14px 20px; background: linear-gradient(135deg, #5c1a8b, #7c3aed); color: #fff;
      display: flex; align-items: center; justify-content: space-between;
    }
    .doc-modal-close {
      background: rgba(255,255,255,0.2); border: 0; color: #fff; width: 32px; height: 32px;
      border-radius: 50%; cursor: pointer; font-size: 18px; font-weight: 700;
    }
    .doc-modal-close:hover { background: rgba(255,255,255,0.35); }
    .doc-modal-body {
      flex: 1; overflow: auto; padding: 16px; background: #f8fafc;
      display: flex; align-items: center; justify-content: center;
    }
    .doc-preview-img { max-width: 100%; max-height: 75vh; object-fit: contain; border-radius: 6px; }
    .doc-preview-pdf { width: 100%; height: 75vh; border: 0; border-radius: 6px; }

    .hint-empty {
      margin-top: 6px; padding: 7px 12px;
      background: #fff8e1; border-left: 3px solid #f9a825; border-radius: 4px;
      font-size: 11.5px; color: #92400e;
    }
    /* COMBOBOX — single-field autocomplete (legacy-style) */
    .combo-wrap { position: relative; }
    .combo-dropdown {
      position: absolute; top: 100%; left: 0; right: 0; z-index: 50;
      background: #fff; border: 1px solid #D6DDEA; border-top: 0;
      border-radius: 0 0 8px 8px; max-height: 280px; overflow-y: auto;
      box-shadow: 0 8px 20px rgba(27,46,92,.12);
    }
    .combo-option {
      padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f1f5f9;
      transition: background 0.12s;
    }
    .combo-option:last-child { border-bottom: 0; }
    .combo-option:hover { background: #f5efe3; }
    .combo-option.kb-active { background: #e0e7ff; border-left: 3px solid #1B2E5C; }
    .disc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .disc-lbl { font-size: 12px; font-weight: 700; color: #6B7280; }
    .disc-hint { font-size: 11px; color: #9CA3AF; }
    .disc-chip { padding: 4px 12px; border-radius: 999px; border: 1.5px solid #E5E7EB; background: #fff;
                 font-size: 12px; font-weight: 700; color: #374151; cursor: pointer; }
    .disc-chip:hover { border-color: #1B2E5C; }
    .disc-chip.disc-on { background: #1B2E5C; color: #fff; border-color: #1B2E5C; }
    .combo-name { font-size: 13.5px; font-weight: 700; color: #1B2E5C; }
    .combo-sub  { font-size: 11px; color: #6b7280; margin-top: 2px; font-family: 'JetBrains Mono', monospace; }
    .combo-empty {
      padding: 12px 14px; font-size: 12px; color: #92400e;
      background: #fff8e1; border-left: 3px solid #f9a825;
    }

    .btn-save {
      padding: 11px 28px; background: #DC2626; color: #fff; border-radius: 8px;
      font-size: 14px; font-weight: 800; border: 0; cursor: pointer; font-family: inherit;
      box-shadow: 0 2px 6px rgba(220,38,38,0.3);
      transition: background 0.15s, transform 0.1s;
    }
    .btn-save:hover:not(:disabled) { background: #B91C1C; transform: translateY(-1px); }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

    @media (max-width: 640px) {
      :host { padding: 8px 0; }
      .ord-header { flex-wrap: wrap; gap: 8px; padding: 12px 14px; }
      .oh-right { flex-wrap: wrap; width: 100%; }
      .section-card { padding: 12px 12px; }
      /* All form grids → single column */
      .grid-cols-2, .grid-cols-3 { grid-template-columns: 1fr !important; }
      .col-span-2 { grid-column: span 1 !important; }
      .ip { width: 100% !important; }
      /* Mobile: har item ko CARD bana do — har field apne label ke saath
         upar-niche dikhe (15-column squeeze / side-scroll ki zaroorat nahi). */
      .item-table-wrap { display: block; overflow: visible; border: 0; }
      .item-table { min-width: 0; width: 100%; white-space: normal; table-layout: auto; }
      .item-table thead { display: none; }
      .item-table tbody { display: block; }
      .item-table tbody tr {
        display: block; background: #fff; border: 1px solid #D6DDEA;
        border-radius: 10px; padding: 6px 10px; margin-bottom: 12px;
        box-shadow: 0 1px 3px rgba(27,46,92,0.06);
      }
      .item-table tbody td {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; width: 100%; padding: 7px 0; border-bottom: 1px dashed #EEF1F7;
        text-align: right;
      }
      .item-table tbody td:last-child { border-bottom: 0; }
      .item-table tbody td::before {
        content: attr(data-label); flex: 0 0 42%; text-align: left;
        font-size: 11px; font-weight: 700; color: #4A5878; text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .item-table tbody td .tip { flex: 1; min-width: 0; font-size: 14px; padding: 9px 10px; }
      .item-table tbody td.sno-cell {
        justify-content: flex-start; background: var(--anjaninex-navy, #1B2E5C); color: #fff;
        margin: -6px -10px 6px; padding: 8px 12px; border-radius: 10px 10px 0 0;
        font-weight: 800; border-bottom: 0; text-align: left;
      }
      .item-table tbody td.sno-cell::before { content: "Item #"; color: #cdd6ec; flex: 0 0 auto; margin-right: 8px; }
      .item-table tfoot { display: block; }
      .item-table tfoot tr {
        display: block; background: #FFF7ED; border: 1px solid #FCD34D;
        border-radius: 10px; padding: 6px 12px; margin-top: 4px;
      }
      .item-table tfoot td {
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 0; border: 0; text-align: right;
      }
      .item-table tfoot td[data-label]::before {
        content: attr(data-label); text-align: left; font-size: 11px;
        font-weight: 700; color: #4A5878; text-transform: uppercase;
      }
      .item-table tfoot td.ft-label { justify-content: center; font-weight: 800; color: #1B2E5C; }
      .item-table tfoot td.ft-blank { display: none; }
      .photo-upload { margin-left: auto; }
      /* Summary card full width (was 1/3 column) */
      .summary-card { width: 100% !important; max-width: 100% !important; }
      /* Bottom action bar stacks */
      .bottom-bar { flex-wrap: wrap; gap: 10px; }
      .bottom-bar .flex { flex-wrap: wrap; }
      /* Doc preview modal fits */
      .doc-modal-overlay { padding: 8px; }
      .doc-modal { width: auto !important; max-width: 100% !important; }
      .doc-modal-body { padding: 8px; }
    }
  `]
})
export class OrderEntryComponent {
  private svc = inject(TradingService);
  features = inject(FeatureService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  private aiSvc = inject(AiService);
  auth = inject(AuthService);
  scanUse = signal<{ usedThisMonth: number; total: number; quotaMonthly: number; lastScanAt: string | null } | null>(null);

  loadScanUse() {
    this.aiSvc.usage().subscribe({ next: u => this.scanUse.set(u), error: () => {} });
  }

  // Scan kholne se pehle monthly limit check — quota khatam to popup, scanner na khole.
  openScan() {
    const u = this.scanUse();
    if (u && u.quotaMonthly > 0 && u.usedThisMonth >= u.quotaMonthly) {
      alert(`⚠️ Aapki AI scan limit (${u.usedThisMonth}/${u.quotaMonthly}) is mahine khatam ho gayi hai.\n\nAur scan karne ke liye Wallet recharge karein ya plan upgrade karein.`);
      return;
    }
    this.showScan.set(true);
  }

  // Document preview modal state
  docPreviewUrl   = signal<string | SafeResourceUrl | null>(null);
  docPreviewType  = signal<'image' | 'pdf' | null>(null);

  previewDoc() {
    if (!this.uploadedDocFile) return;
    const file = this.uploadedDocFile;
    const name = this.uploadedDocName();
    const isPdf = file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
    const rawUrl = URL.createObjectURL(file);
    const safeUrl = isPdf ? this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl) : rawUrl;
    this.docPreviewUrl.set(safeUrl);
    this.docPreviewType.set(isPdf ? 'pdf' : 'image');
  }
  closeDocPreview() {
    const url = this.docPreviewUrl();
    if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
    this.docPreviewUrl.set(null);
    this.docPreviewType.set(null);
  }

  // Data
  parties = signal<Party[]>([]);
  items = signal<Item[]>([]);
  saving = signal(false);
  error = signal('');

  // Edit-mode state
  editId: string | null = null;
  editMode = false;

  // Quick-Add Party modal state
  showAddSupplier = signal(false);
  showAddBuyer = signal(false);

  // AI Scan + Upload state
  showScan = signal(false);
  lastAiFill = signal<ExtractedBill | null>(null);
  uploadedDocName = signal('');
  uploadedDocFile: File | null = null;

  // AI-extracted party cache (for prefilling Quick Add)
  aiSupplier: Partial<{ displayName: string; gst: string; phone: string; address: string; city: string }> | null = null;
  aiBuyer: Partial<{ displayName: string; gst: string; phone: string; address: string; city: string }> | null = null;

  // GST/Name/Code filter signals (live-filter the supplier/buyer selects)
  supplierFilter = signal('');
  buyerFilter = signal('');
  filteredSuppliers = computed(() => this.matchParties(this.supplierFilter()).slice(0, 8));
  filteredGroups = computed(() => {
    const t = this.supplierFilter().toLowerCase().trim();
    if (!t) return [] as { name: string; count: number; firstId: string }[];
    const map = new Map<string, { name: string; count: number; firstId: string }>();
    for (const p of this.parties()) {
      const g = (p as any).groupName as string | null;
      if (g && g.toLowerCase().includes(t)) {
        if (!map.has(g)) map.set(g, { name: g, count: 0, firstId: p.id });
        map.get(g)!.count++;
      }
    }
    return [...map.values()].slice(0, 5);
  });
  filteredBuyers = computed(() => this.matchParties(this.buyerFilter()).slice(0, 8));

  // Combobox state (single-field autocomplete UX — like legacy)
  supplierDropdownOpen = signal(false);
  buyerDropdownOpen = signal(false);

  closeSupplierDropdownSoon() { setTimeout(() => this.supplierDropdownOpen.set(false), 200); }
  closeBuyerDropdownSoon()    { setTimeout(() => this.buyerDropdownOpen.set(false), 200); }

  selectSupplierFromCombo(p: Party) {
    this.aiGstTypeOverride.set(null);   // manual select → GST type state-code se decide ho
    this.supplierId = p.id;
    this.supplierFilter.set(p.displayName);
    this.supplierDropdownOpen.set(false);
    this.onSupplierChange(p.id);
  }
  selectGroupFromCombo(g: { name: string; firstId: string }) {
    this.aiGstTypeOverride.set(null);
    this.supplierGroupName = g.name;
    const first = this.parties().find(p => p.id === g.firstId);
    if (first) this.supplierId = first.id;
    this.supplierGstin = ''; this.supplierPan = ''; this.supplierAddress = ''; this.supplierMobile = ''; this.supplierWhatsapp = '';
    this.supplierFilter.set(g.name + ' (firm pending)');
    this.supplierDropdownOpen.set(false);
  }
  selectBuyerFromCombo(p: Party) {
    this.aiGstTypeOverride.set(null);   // manual select → GST type state-code se decide ho
    this.buyerId = p.id;
    this.buyerFilter.set(p.displayName);
    this.buyerDropdownOpen.set(false);
    this.onBuyerChange(p.id);
  }
  private matchParties(q: string): Party[] {
    const t = q.toLowerCase().trim();
    if (!t) return this.parties();
    return this.parties().filter(p =>
      (p.displayName || '').toLowerCase().includes(t) ||
      (p.gst || '').toLowerCase().includes(t) ||
      (p.partyCode || '').toLowerCase().includes(t) ||
      (p.city || '').toLowerCase().includes(t) ||
      (p.phone || '').toLowerCase().includes(t)
    );
  }

  // ---- Master party duplicate detect: SIRF GST no / PAN no se ----
  private pNorm(s?: string | null): string { return (s || '').replace(/\s+/g, '').toUpperCase(); }
  private findMasterParty(gst?: string | null, pan?: string | null): Party | undefined {
    const g = this.pNorm(gst), pa = this.pNorm(pan);
    if (!g && !pa) return undefined;
    return this.parties().find(p =>
      (!!g && this.pNorm(p.gst) === g) ||
      (!!pa && this.pNorm(p.pan) === pa)
    );
  }
  get supplierInMaster(): boolean {
    return !!this.supplierId || !!this.findMasterParty(this.supplierGstin, this.supplierPan);
  }
  get buyerInMaster(): boolean {
    return !!this.buyerId || !!this.findMasterParty(this.buyerGstin, this.buyerPan);
  }
  private linkPartiesFromMaster(): void {
    if (!this.supplierId) {
      const m = this.findMasterParty(this.supplierGstin, this.supplierPan);
      if (m) { this.supplierId = m.id; if (!this.supplierFilter()) this.supplierFilter.set(m.displayName); }
    }
    if (!this.buyerId) {
      const m = this.findMasterParty(this.buyerGstin, this.buyerPan);
      if (m) { this.buyerId = m.id; if (!this.buyerFilter()) this.buyerFilter.set(m.displayName); }
    }
  }

  /** Pre-fill the Quick Add modal — prefers AI cache, falls back to current form fields. */
  supplierPrefill() {
    return {
      displayName: this.aiSupplier?.displayName || this.supplierFilter() || '',
      gst: this.aiSupplier?.gst || this.supplierGstin || '',
      phone: this.aiSupplier?.phone || this.supplierMobile || '',
      address: this.aiSupplier?.address || this.supplierAddress || '',
      city: this.aiSupplier?.city || ''
    };
  }
  buyerPrefill() {
    return {
      displayName: this.aiBuyer?.displayName || this.buyerFilter() || '',
      gst: this.aiBuyer?.gst || this.buyerGstin || '',
      phone: this.aiBuyer?.phone || this.buyerMobile || '',
      address: this.aiBuyer?.address || this.buyerAddress || '',
      city: this.aiBuyer?.city || ''
    };
  }

  // Quick-Add: newly created party appended + auto-selected, clear AI cache
  onPartyCreated(p: Party, side: 'supplier' | 'buyer') {
    this.parties.update(arr => [p, ...arr]);
    if (side === 'supplier') {
      this.supplierId = p.id;
      this.onSupplierChange(p.id);
      this.supplierFilter.set('');
      this.aiSupplier = null;
    } else {
      this.buyerId = p.id;
      this.onBuyerChange(p.id);
      this.buyerFilter.set('');
      this.aiBuyer = null;
    }
  }

  /** Document upload — store file locally (order DTO doesn't have attachment field yet). */
  onDocUpload(event: any) {
    const file: File = event.target.files?.[0];
    if (!file) return;
    this.uploadedDocFile = file;
    this.uploadedDocName.set(file.name);
    alert(`📎 "${file.name}" attached. File will be uploaded when order is saved.\n\nTip: Click "🤖 Scan Order" to auto-fill from this document.`);
  }

  /** AI se aayi date (dd/mm/yyyy ya dd-mm-yyyy) ko <input type=date> ke liye yyyy-mm-dd banao. */
  private toIsoDate(s: string | null | undefined): string {
    const d = (s || '').trim();
    if (!d) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    let m = d.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = d.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return d;
  }

  /** AI extraction handler — same logic as bill-entry, mapped to order fields. */
  applyAiExtraction(data: ExtractedBill) {
    this.lastAiFill.set(data);
    this.loadScanUse();   // scan count + time turant refresh

    if (data.invoice?.date) this.orderDate = this.toIsoDate(data.invoice.date) || this.orderDate;
    // Order/PO par jo number chhapa hai (invoice.number) wo supplier order no me — warna PO number
    if (data.invoice?.number || data.invoice?.poNumber)
      this.supplierOrderNo = data.invoice.number || data.invoice.poNumber || this.supplierOrderNo;

    // ============ TAX TYPE — IGST vs CGST/SGST, scan se reliably decide ============
    {
      const supGst  = (data.supplier?.gst || '').replace(/\s/g, '').toUpperCase();
      const buyGst  = (data.buyer?.gst    || '').replace(/\s/g, '').toUpperCase();
      const firmGst = (this.features.firmGst() || '').replace(/\s/g, '').toUpperCase();
      const ig = +(data.totals?.igst ?? 0), cg = +(data.totals?.cgst ?? 0), sg = +(data.totals?.sgst ?? 0);
      const st = (g: string) => g.length >= 2 ? g.substring(0, 2) : '';
      let inter: boolean | null = null;
      if (st(supGst) && st(buyGst))       inter = st(supGst) !== st(buyGst);
      else if (st(supGst) && st(firmGst)) inter = st(supGst) !== st(firmGst);
      else if (st(buyGst) && st(firmGst)) inter = st(buyGst) !== st(firmGst);
      if (inter === null) {
        if (ig > 0 && cg === 0 && sg === 0) inter = true;
        else if (cg > 0 || sg > 0)          inter = false;
      }
      if (ig > 0 && cg === 0 && sg === 0)  inter = true;
      this.aiGstTypeOverride.set(inter === null ? null : (inter ? 'inter' : 'intra'));
    }

    // Match supplier in master
    if (data.supplier?.name) {
      // SAFE match: GST exact (15-char) YA naam exact. Loose/khali-GST match nahi
      // (warna "Sagar Lace" galti se "Sagar Cloth Store" utha leta tha).
      const sGst = (data.supplier.gst || '').trim().toUpperCase().replace(/\s/g, '');
      const sNm  = (data.supplier.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const match = this.parties().find(p => {
        const pGst = (p.gst || '').trim().toUpperCase().replace(/\s/g, '');
        const pNm  = (p.displayName || '').trim().toLowerCase().replace(/\s+/g, ' ');
        return (sGst.length >= 15 && pGst === sGst) || (!!sNm && pNm === sNm);
      });
      if (match) {
        this.supplierId = match.id;
        this.onSupplierChange(match.id);
        this.aiSupplier = null;
      } else {
        // No match → cache + fill search + auto-fill fields
        this.aiSupplier = {
          displayName: data.supplier.name,
          gst: data.supplier.gst ?? '',
          phone: data.supplier.phone ?? '',
          address: data.supplier.address ?? '',
          city: data.supplier.city ?? ''
        };
        this.supplierFilter.set(data.supplier.name);
        this.supplierGstin = data.supplier.gst ?? '';
        this.supplierPan = (data.supplier as any).pan ?? '';
        this.supplierAddress = data.supplier.address ?? data.supplier.city ?? '';
        this.supplierMobile = data.supplier.phone ?? '';
        this.supplierWhatsapp = data.supplier.phone ?? '';
        // REMARK ko mat chhedo — user jo khud type kare wahi save ho
      }
    }

    // Match buyer
    if (data.buyer?.name) {
      const bGst = (data.buyer.gst || '').trim().toUpperCase().replace(/\s/g, '');
      const bNm  = (data.buyer.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const match = this.parties().find(p => {
        const pGst = (p.gst || '').trim().toUpperCase().replace(/\s/g, '');
        const pNm  = (p.displayName || '').trim().toLowerCase().replace(/\s+/g, ' ');
        return (bGst.length >= 15 && pGst === bGst) || (!!bNm && pNm === bNm);
      });
      if (match) {
        this.buyerId = match.id;
        this.onBuyerChange(match.id);
        this.aiBuyer = null;
      } else {
        this.aiBuyer = {
          displayName: data.buyer.name,
          gst: data.buyer.gst ?? '',
          phone: data.buyer.phone ?? '',
          address: data.buyer.address ?? '',
          city: data.buyer.city ?? ''
        };
        this.buyerFilter.set(data.buyer.name);
        this.buyerGstin = data.buyer.gst ?? '';
        this.buyerPan = (data.buyer as any).pan ?? '';
        this.buyerAddress = data.buyer.address ?? data.buyer.city ?? '';
        this.buyerMobile = data.buyer.phone ?? '';
        this.buyerWhatsapp = data.buyer.phone ?? '';
      }
    }

    // Items → order lines
    if (data.items?.length) {
      const choices: RateChoice[] = [];
      this.lines.set(data.items.map((item, idx) => {
        const half = (item.taxRate || 5) / 2;
        const qty  = item.qty || 0;
        const rate = item.rate || 0;
        const unit = item.unit || 'MTR';
        const rd = item.discountPercent ? +(rate * item.discountPercent / 100).toFixed(2) : 0;
        const tx = +(item.taxableAmount || 0);
        if (qty > 0 && tx > 0 && Math.abs(qty * rate - qty * rd - tx) > 1) {
          choices.push({
            idx, name: item.name || `Item ${idx + 1}`, taxable: tx,
            optA: { qty, unit, rate: +(tx / qty).toFixed(4) },
            optB: rate > 0 ? { qty: rate, unit: 'MTR', rate: +(tx / rate).toFixed(4) } : null,
            raw:  { qty, unit, rate }
          });
        }
        return {
          itemId: null,
          itemName: item.name,
          description: '',
          hsnSac: item.hsnSac,
          qty, unit, rate, rd,
          sgstPct: half,
          cgstPct: half,
          igstPct: 0,
          photoFile: null,
          photoPreview: null
        };
      }));
      this.redistributeGst();
      this.rateChoiceItems.set(choices);
      this.rateChoiceOpen.set(choices.length > 0);
      this.reconcileNote.set(choices.length
        ? 'Kuch items par rate bill se clear nahi tha — popup me qty/rate choose karein (ya manually bharein).'
        : '');
    }

    // Transporter — AI ne jo naam padha wo search box me dikhao (match ho to user select kar le)
    if (data.transport?.name) {
      this.transporterFilter.set(data.transport.name);
      this.onTransporterTyped(data.transport.name);
    }
  }

  // Section 1
  company = 'namokara';
  orderDate = todayLocal();   // LOCAL date — UTC se ek din pichhe nahi jayegi
  tempOrderNo = '';  // New order me blank — save par backend real no dega (JPR-O5...)

  // Section 2 — Supplier
  supplierId = '';
  supplierGstin = '';
  supplierAddress = '';
  supplierMobile = '';
  supplierWhatsapp = '';
  supplierPan = '';

  // Section 3 — Buyer
  buyerId = '';
  buyerGstin = '';
  buyerAddress = '';
  buyerMobile = '';
  buyerWhatsapp = '';
  buyerPan = '';

  // Section 5 — Adjustments
  cdEnabled = signal(true);
  cdPct = signal(0);
  cdType = signal<'before' | 'after'>('before');    // before = GST se pehle discount | after = GST ke baad
  cdAmountOverride = signal<number | null>(null);   // null = use auto-computed; number = manual override
  setCdType(t: 'before' | 'after') {
    this.cdType.set(t);
    this.cdAmountOverride.set(null);   // type badla → amount dobara auto-compute
  }
  supplierOrderNo = '';
  supplierGroupName = '';
  paymentTerms = '';
  orderStatus = 'pending';
  remark = '';
  insuranceAmt = signal(0);   // INSURANCE — additive charge (net me jud kar). SIGNAL taaki netTotal computed track kare.
  transporterId = '';
  transporters = signal<Transporter[]>([]);

  // Searchable transporter combobox
  transporterFilter = signal('');
  transporterDropdownOpen = signal(false);
  transporterKbIdx = signal(0);
  transporterKey(e: KeyboardEvent) {
    const list = this.filteredTransporters();
    if (!this.transporterDropdownOpen() || list.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.transporterKbIdx.set(Math.min(this.transporterKbIdx() + 1, list.length - 1)); this.kbScrollSoon(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.transporterKbIdx.set(Math.max(this.transporterKbIdx() - 1, 0)); this.kbScrollSoon(); }
    else if (e.key === 'Enter') { e.preventDefault(); const t = list[this.transporterKbIdx()]; if (t) this.selectTransporterFromCombo(t); }
    else if (e.key === 'Escape') { this.transporterDropdownOpen.set(false); }
  }

  // Supplier/Buyer combo — keyboard se upar-niche + Enter se select
  supplierKbIdx = signal(0);
  supplierKey(e: KeyboardEvent) {
    const groups = this.filteredGroups();
    const total = groups.length + this.filteredSuppliers().length;
    if (!this.supplierDropdownOpen() || total === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.supplierKbIdx.set(Math.min(this.supplierKbIdx() + 1, total - 1)); this.kbScrollSoon(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.supplierKbIdx.set(Math.max(this.supplierKbIdx() - 1, 0)); this.kbScrollSoon(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = this.supplierKbIdx();
      if (idx < groups.length) { const g = groups[idx]; if (g) this.selectGroupFromCombo(g); }
      else { const p = this.filteredSuppliers()[idx - groups.length]; if (p) this.selectSupplierFromCombo(p); }
    }
    else if (e.key === 'Escape') { this.supplierDropdownOpen.set(false); }
  }

  buyerKbIdx = signal(0);
  buyerKey(e: KeyboardEvent) {
    const list = this.filteredBuyers();
    if (!this.buyerDropdownOpen() || list.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.buyerKbIdx.set(Math.min(this.buyerKbIdx() + 1, list.length - 1)); this.kbScrollSoon(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.buyerKbIdx.set(Math.max(this.buyerKbIdx() - 1, 0)); this.kbScrollSoon(); }
    else if (e.key === 'Enter') { e.preventDefault(); const p = list[this.buyerKbIdx()]; if (p) this.selectBuyerFromCombo(p); }
    else if (e.key === 'Escape') { this.buyerDropdownOpen.set(false); }
  }

  // Highlighted option list me scroll karke visible rakho
  private kbScrollSoon() {
    setTimeout(() => document.querySelector('.combo-dropdown .kb-active')
      ?.scrollIntoView({ block: 'nearest' }), 0);
  }
  filteredTransporters = computed(() => {
    const q = this.transporterFilter().trim().toLowerCase();
    const list = this.transporters();
    if (!q) return list.slice(0, 50);
    return list.filter(t =>
      (t.firmName || '').toLowerCase().includes(q) ||
      (t.gstNo || '').toLowerCase().includes(q) ||
      (t.mobile || '').toLowerCase().includes(q)
    ).slice(0, 50);
  });
  selectTransporterFromCombo(t: Transporter) {
    this.transporterId = t.id;
    this.transporterFilter.set(t.firmName);
    this.transporterDropdownOpen.set(false);
  }
  onTransporterTyped(v: string) { if (!v?.trim()) this.transporterId = ''; }
  closeTransporterDropdownSoon() { setTimeout(() => this.transporterDropdownOpen.set(false), 200); }
  private syncTransporterName() {
    const t = this.transporters().find(x => x.id === this.transporterId);
    if (t) this.transporterFilter.set(t.firmName);
  }

  /** WhatsApp kholo — number ke last 10 digit par (91 ke saath) */
  openWhatsApp(phone: string | null | undefined) {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return;
    const ten = digits.length > 10 ? digits.slice(-10) : digits;
    window.open('https://wa.me/91' + ten, '_blank');
  }

  /** Selected transporter — GST/Mobile display ke liye. */
  selTransporter(): Transporter | undefined {
    return this.transporters().find(t => t.id === this.transporterId);
  }

  /** + New — pura transporter form modal kholo. */
  showAddTransporter = signal(false);
  quickAddTransporter() { this.showAddTransporter.set(true); }
  onTransporterCreated(t: any) {
    this.transporters.update(arr => [t, ...arr]);
    this.transporterId = t.id;
    this.transporterFilter.set(t.firmName || '');
  }

  // Item lines
  lines = signal<LineRow[]>([this.newLine()]);

  newLine(): LineRow {
    return {
      itemId: null, itemName: '', description: '',
      hsnSac: '', qty: 0, unit: 'MTR', rate: 0, rd: 0,
      sgstPct: 2.5, cgstPct: 2.5, igstPct: 0,
      photoFile: null, photoPreview: null
    };
  }

  // ============ COMPUTED ============
  lineTaxable(idx: number): number {
    const l = this.lines()[idx];
    const gross = l.qty * l.rate;
    const afterRd = gross - (l.qty * l.rd);
    return Math.max(0, afterRd);
  }
  lineTax(idx: number): number {
    const taxable = this.lineTaxable(idx);
    const l = this.lines()[idx];
    return taxable * (l.sgstPct + l.cgstPct + l.igstPct) / 100;
  }
  lineTotal(idx: number): number {
    return this.lineTaxable(idx) + this.lineTax(idx);
  }

  totalQty = computed(() => this.lines().reduce((s, l) => s + (+l.qty || 0), 0));
  totalTaxable = computed(() => this.lines().reduce((s, _, i) => s + this.lineTaxable(i), 0));
  sgstTotal = computed(() => this.lines().reduce((s, _, i) => {
    const l = this.lines()[i];
    return s + this.lineTaxable(i) * (l.sgstPct / 100);
  }, 0));
  cgstTotal = computed(() => this.lines().reduce((s, _, i) => {
    const l = this.lines()[i];
    return s + this.lineTaxable(i) * (l.cgstPct / 100);
  }, 0));
  igstTotal = computed(() => this.lines().reduce((s, _, i) => {
    const l = this.lines()[i];
    return s + this.lineTaxable(i) * (l.igstPct / 100);
  }, 0));
  totalTax = computed(() => this.sgstTotal() + this.cgstTotal() + this.igstTotal());
  totalAmount = computed(() => this.totalTaxable() + this.totalTax());

  // CD Amount: manual override > auto from %.
  // Before GST → % taxable par | After GST → % (taxable + tax) par.
  cdAmount = computed(() => {
    if (!this.cdEnabled()) return 0;
    const override = this.cdAmountOverride();
    if (override !== null) return override;
    const base = this.cdType() === 'after' ? this.totalAmount() : this.totalTaxable();
    return +(base * (this.cdPct() / 100)).toFixed(2);
  });

  // 💸 SUPPLIER DISCOUNT (Normal + Exhibition) — % supplier master se auto-fill,
  // amount auto-calculate (CD jaisa: % badlo to amount, amount override editable).
  discNormalPct = signal(0);
  discNormalOverride = signal<number | null>(null);
  discExhPct = signal(0);
  discExhOverride = signal<number | null>(null);
  suppressAutoDisc = false;   // edit-load me master se auto-fill NAHI

  private discBase() {
    return this.cdType() === 'after' ? this.totalAmount() : this.totalTaxable();
  }
  discNormalAmt = computed(() => {
    const o = this.discNormalOverride();
    if (o !== null) return o;
    return +(this.discBase() * (this.discNormalPct() / 100)).toFixed(2);
  });
  discExhAmt = computed(() => {
    const o = this.discExhOverride();
    if (o !== null) return o;
    return +(this.discBase() * (this.discExhPct() / 100)).toFixed(2);
  });
  supplierDiscTotal = computed(() => this.discNormalAmt() + this.discExhAmt());
  /** CD + supplier discounts — net/tax me yahi total minus hota hai */
  allDiscAmt = computed(() => this.cdAmount() + this.supplierDiscTotal());
  onDiscNormalPct(v: number) { this.discNormalPct.set(+v || 0); this.discNormalOverride.set(null); }
  onDiscNormalAmt(v: number) { this.discNormalOverride.set(+v || 0); }
  onDiscExhPct(v: number) { this.discExhPct.set(+v || 0); this.discExhOverride.set(null); }
  onDiscExhAmt(v: number) { this.discExhOverride.set(+v || 0); }
  /** Supplier select hone par master ke % bhar do (edit-load me nahi) */
  fillDiscFromMaster(partyId: string) {
    if (this.suppressAutoDisc) return;
    const p = this.parties().find(x => x.id === partyId);
    this.discNormalPct.set(+(p?.discountNormal ?? 0));
    this.discExhPct.set(+(p?.discountExhibition ?? 0));
    this.discNormalOverride.set(null);
    this.discExhOverride.set(null);
  }

  /** Before-GST me tax discounted base par lagta hai — proportional factor (CD + supplier disc). */
  private cdTaxFactor = computed(() => {
    if (this.cdType() !== 'before') return 1;
    const taxable = this.totalTaxable();
    if (taxable <= 0) return 1;
    return Math.max(0, (taxable - this.allDiscAmt()) / taxable);
  });
  effSgst = computed(() => +(this.sgstTotal() * this.cdTaxFactor()).toFixed(2));
  effCgst = computed(() => +(this.cgstTotal() * this.cdTaxFactor()).toFixed(2));
  effIgst = computed(() => +(this.igstTotal() * this.cdTaxFactor()).toFixed(2));
  effTax = computed(() => this.effSgst() + this.effCgst() + this.effIgst());

  netTotal = computed(() => {
    const ins = (+this.insuranceAmt() || 0);
    if (this.cdType() === 'before') {
      // (taxable − sab discounts) + tax-on-discounted + insurance
      return (this.totalTaxable() - this.allDiscAmt()) + this.effTax() + ins;
    }
    // After GST: poora tax, discount total par + insurance
    return this.totalAmount() - this.allDiscAmt() + ins;
  });

  /** Net amount = Net Total rounded to nearest whole rupee. */
  netAmountRounded = computed(() => Math.round(this.netTotal()));

  /** Round-off difference (can be -0.49 to +0.50). Shown as separate line. */
  roundOff = computed(() => +(this.netAmountRounded() - this.netTotal()).toFixed(2));

  /** Indian number-to-words for display in totals + summary. */
  words = amountInWords;

  // Handlers for CD section
  toggleCd() {
    this.cdEnabled.set(!this.cdEnabled());
    this.cdAmountOverride.set(null);  // reset on toggle
  }
  onCdPctChange(val: number) {
    this.cdPct.set(+val || 0);
    this.cdAmountOverride.set(null);  // % change clears manual override → re-auto-compute
  }
  onCdAmountChange(val: number) {
    this.cdAmountOverride.set(+val || 0);   // user manually edited → lock to this value
  }

  canSave = computed(() => {
    return !!this.supplierId
        && !!this.buyerId
        && !!this.paymentTerms
        && this.netTotal() > 0
        && this.lines().some(l => l.itemName && l.qty > 0 && l.rate > 0);
  });

  // ============ LIFECYCLE ============
  ngOnInit() {
    this.loadScanUse();
    this.svc.listItems().subscribe(i => this.items.set(i));
    this.svc.listTransporters().subscribe({
      next: t => { this.transporters.set(t.filter(x => x.isActive !== false)); this.syncTransporterName(); },
      error: () => this.transporters.set([])
    });

    // Check for edit mode via :id route param
    const idParam = this.route.snapshot.paramMap.get('id');

    // In edit mode: load parties FIRST, then order — so the <select> options exist
    // when we set supplierId/buyerId, and onSupplierChange/onBuyerChange can find the party.
    if (idParam) {
      this.editId = idParam;
      this.editMode = true;
      this.svc.listParties().subscribe(p => {
        this.parties.set(p);
        this.loadOrderForEdit(idParam);
      });
    } else {
      // Create mode: parallel load is fine
      this.svc.listParties().subscribe(p => this.parties.set(p));
    }
  }

  private loadOrderForEdit(id: string) {
    this.svc.getOrder(id).subscribe({
      next: (o) => {
        // Header
        this.tempOrderNo = o.orderNo;
        this.orderDate = o.orderDate;
        // Supplier (partyId) + Buyer (buyerPartyId)
        this.supplierId = o.partyId;
        this.buyerId = o.buyerPartyId || '';
        // Section 5
        this.cdPct.set(Number(o.cdPercent) || 0);
        this.cdEnabled.set(this.cdPct() > 0);
        this.cdType.set(o.cdType === 'after' ? 'after' : 'before');
        this.cdAmountOverride.set(null);
        this.supplierOrderNo = o.supplierOrderNo || '';
        this.supplierGroupName = (o as any).supplierGroupName || '';
        this.paymentTerms = o.paymentTerms || '';
        this.orderStatus = o.status || 'pending';
        // Transporter restore (warna edit par blank ho jaata tha aur re-save par null chala jaata tha)
        this.transporterId = o.transporterId || '';
        this.syncTransporterName();
        {
          const n = o.notes || '';
          const insM = n.match(/Insurance:\s*₹?([\d.]+)/);
          if (insM) this.insuranceAmt.set(+insM[1] || 0);
          // 💸 Supplier discounts — saved % wapas (master se auto-fill edit me band)
          this.suppressAutoDisc = true;
          const ndM = n.match(/Normal Disc\s+([\d.]+)%/);
          this.discNormalPct.set(ndM ? +ndM[1] || 0 : 0);
          const exM = n.match(/Exhibition Disc\s+([\d.]+)%/);
          this.discExhPct.set(exM ? +exM[1] || 0 : 0);
          this.discNormalOverride.set(null);
          this.discExhOverride.set(null);
          this.remark = n
            .replace(/\s*\|?\s*Insurance:\s*₹?[\d.]+/, '')
            .replace(/\s*\|?\s*Normal Disc\s+[\d.]+%\s*=\s*₹?[\d.]+/, '')
            .replace(/\s*\|?\s*Exhibition Disc\s+[\d.]+%\s*=\s*₹?[\d.]+/, '')
            .trim();
        }
        // Lines
        if (o.lines && o.lines.length > 0) {
          this.lines.set(o.lines.map(l => ({
            itemId: l.itemId || null,
            itemName: l.itemName,
            description: l.description || '',
            hsnSac: l.hsnSac || '',
            qty: l.qty,
            unit: l.unit || 'MTR',
            rate: l.rate,
            rd: l.rd || 0,
            sgstPct: l.sgstPct || 2.5,
            cgstPct: l.cgstPct || 2.5,
            igstPct: 0,
            photoFile: null,
            photoPreview: null
          })));
        }
        // Auto-fill party detail fields from loaded supplier/buyer
        if (this.supplierId) this.onSupplierChange(this.supplierId);
        if (this.supplierGroupName) { this.supplierFilter.set(this.supplierGroupName + ' (firm pending)'); this.supplierGstin = ''; this.supplierPan = ''; this.supplierAddress = ''; this.supplierMobile = ''; this.supplierWhatsapp = ''; }
        if (this.buyerId) this.onBuyerChange(this.buyerId);
        // If the saved CD amount diverges from the auto-computed value
        // (e.g. a manual override at save time), restore it as an override
        // so the loaded total matches the saved total. Done after lines/party
        // are set so cdAmount() auto-compute is accurate for comparison.
        if (this.cdEnabled() && o.cdAmount != null) {
          const saved = +o.cdAmount;
          if (Math.abs(saved - this.cdAmount()) > 0.01) {
            this.cdAmountOverride.set(saved);
          }
        }
        // Load complete — ab user supplier BADLE to master se discounts fir aayen
        this.suppressAutoDisc = false;
      },
      error: () => alert('❌ Failed to load order for editing')
    });
  }

  // ============ LINE OPERATIONS ============
  updateLine(idx: number, field: keyof LineRow, value: any) {
    this.lines.update(arr => arr.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }
  addLine() { this.lines.update(arr => [...arr, this.newLine()]); }
  removeLine(idx: number) { this.lines.update(arr => arr.filter((_, i) => i !== idx)); }
  autoFillFromItem(idx: number, event: any) {
    const name = event.target.value;
    const item = this.items().find(i => i.name === name);
    if (item) {
      this.updateLine(idx, 'itemId', item.id);
      this.updateLine(idx, 'hsnSac', item.hsnSac ?? '');
      this.updateLine(idx, 'unit', item.unit);
      this.updateLine(idx, 'rate', item.defaultRate);
      const half = (item.taxRate || 5) / 2;
      this.updateLine(idx, 'sgstPct', half);
      this.updateLine(idx, 'cgstPct', half);
      this.updateLine(idx, 'igstPct', 0);
      this.redistributeGst();
    }
  }
  // Description (master) pick → HSN + Unit auto-fill
  onDescPick(idx: number, event: any) {
    const name = event.target.value;
    const item = this.items().find(i => i.name === name);
    if (item) {
      this.updateLine(idx, 'itemId', item.id);
      if (item.hsnSac) this.updateLine(idx, 'hsnSac', item.hsnSac);
      if (item.unit) this.updateLine(idx, 'unit', item.unit);
    }
  }
  onItemPhoto(idx: number, event: any) {
    const file: File = event.target.files?.[0];
    if (!file) return;
    this.updateLine(idx, 'photoFile', file);
    const reader = new FileReader();
    reader.onload = () => this.updateLine(idx, 'photoPreview', reader.result as string);
    reader.readAsDataURL(file);
  }

  // ============ PARTY AUTO-FILL ============
  onSupplierChange(id: string) {
    const p = this.parties().find(x => x.id === id);
    if (p) {
      this.supplierFilter.set(p.displayName);   // sync combobox input
      this.supplierGstin = p.gst ?? '';
      this.supplierPan = p.pan ?? '';
      this.supplierAddress = p.city ?? '';
      this.supplierMobile = p.phone ?? '';
      this.supplierWhatsapp = p.phone ?? '';
      this.fillDiscFromMaster(id);   // 💸 master ke discounts % auto-fill
    } else {
      this.supplierGstin = ''; this.supplierPan = ''; this.supplierAddress = '';
      this.supplierMobile = ''; this.supplierWhatsapp = '';
    }
    this.redistributeGst();
  }
  onBuyerChange(id: string) {
    const p = this.parties().find(x => x.id === id);
    if (p) {
      this.buyerFilter.set(p.displayName);       // sync combobox input
      this.buyerGstin = p.gst ?? '';
      this.buyerPan = p.pan ?? '';
      this.buyerAddress = p.city ?? '';
      this.buyerMobile = p.phone ?? '';
      this.buyerWhatsapp = p.phone ?? '';
    } else {
      this.buyerGstin = ''; this.buyerPan = ''; this.buyerAddress = '';
      this.buyerMobile = ''; this.buyerWhatsapp = '';
    }
    this.redistributeGst();
  }

  // ============ GST STATE LOGIC (intra vs inter-state) ============
  /** Compare firm GSTIN state-code (first 2 chars) vs counterparty GSTIN. Default intra-state. */
  /** AI scan ne bill/order se jo ASLI tax type padha (IGST vs CGST/SGST) — state-code se UPAR.
   *  Scan ke time set, manual party change ya reset par clear. */
  aiGstTypeOverride = signal<'inter' | 'intra' | null>(null);
  reconcileNote = signal<string>('');   // scan ne rate taxable se nikaala → warning note
  rateChoiceOpen = signal(false);
  rateChoiceItems = signal<RateChoice[]>([]);
  applyRateChoice(idx: number, opt: RateOpt) {
    this.updateLine(idx, 'qty', opt.qty);
    this.updateLine(idx, 'unit', opt.unit);
    this.updateLine(idx, 'rd', 0);
    this.updateLine(idx, 'rate', opt.rate);
    this.rateChoiceItems.update(arr => arr.filter(r => r.idx !== idx));
    if (!this.rateChoiceItems().length) { this.rateChoiceOpen.set(false); this.reconcileNote.set(''); }
  }
  closeRateChoice() { this.rateChoiceOpen.set(false); }
  isInterState(): boolean {
    const o = this.aiGstTypeOverride();
    if (o) return o === 'inter';
    const firm = (this.features.firmGst() || '').trim();
    const other = ((this.buyerGstin || '').trim() || (this.supplierGstin || '').trim());
    if (firm.length < 2 || other.length < 2) return false;
    return firm.substring(0, 2).toUpperCase() !== other.substring(0, 2).toUpperCase();
  }
  /** Auto move the total rate to the correct side (IGST vs SGST+CGST) based on state. */
  redistributeGst(): void {
    const inter = this.isInterState();
    this.lines.update(arr => arr.map(l => {
      const total = (+l.sgstPct || 0) + (+l.cgstPct || 0) + (+l.igstPct || 0);
      return inter
        ? { ...l, sgstPct: 0, cgstPct: 0, igstPct: total }
        : { ...l, sgstPct: total / 2, cgstPct: total / 2, igstPct: 0 };
    }));
  }

  // ============ ACTIONS ============
  preview() {
    const sup = this.parties().find(p => p.id === this.supplierId)?.displayName ?? '—';
    const buy = this.parties().find(p => p.id === this.buyerId)?.displayName ?? '—';
    alert(`📄 Order Preview\n\n` +
          `Supplier: ${sup}\n` +
          `Buyer: ${buy}\n` +
          `Items: ${this.lines().filter(l => l.itemName).length}\n` +
          `Gross: ₹${this.totalTaxable().toFixed(2)}\n` +
          `Tax: ₹${this.totalTax().toFixed(2)}\n` +
          `CD: -₹${this.cdAmount().toFixed(2)}\n` +
          `Net Total: ₹${this.netTotal().toFixed(2)}\n\n` +
          `(Full PDF preview coming soon)`);
  }
  downloadPdf() {
    alert('📄 PDF download will be enabled after Submit. Save the order first to generate PDF.');
  }
  sendWhatsApp() {
    const phone = this.buyerWhatsapp || this.supplierWhatsapp;
    if (!phone) {
      alert('No WhatsApp number — select Supplier/Buyer first.');
      return;
    }
    const sup = this.parties().find(p => p.id === this.supplierId)?.displayName ?? '';
    const buy = this.parties().find(p => p.id === this.buyerId)?.displayName ?? '';
    const msg = encodeURIComponent(
      `Order ${this.tempOrderNo || '(new)'}\n` +
      `Supplier: ${sup}\nBuyer: ${buy}\n` +
      `Items: ${this.lines().filter(l => l.itemName).length}\n` +
      `Net Total: ₹${this.netTotal().toFixed(2)}\n` +
      `— ${this.features.firmName() || 'Anjaninex'}`);
    const clean = phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
  }

  // ============ SAVE ============
  save() {
    // Detailed validation — show exactly what's missing
    this.linkPartiesFromMaster(); // GST/PAN se existing party link → duplicate na bane
    const missing: string[] = [];
    if (!this.supplierId) missing.push('SUPPLIER (top)');
    if (!this.buyerId) missing.push('BUYER (top)');
    if (!this.paymentTerms) missing.push('PAYMENT TERMS');
    if (this.netTotal() <= 0) missing.push('NET TOTAL must be > 0');
    if (!this.lines().some(l => l.itemName && l.qty > 0 && l.rate > 0)) {
      missing.push('AT LEAST ONE ITEM (with name, qty > 0, rate > 0)');
    }
    if (missing.length > 0) {
      const msg = '⚠️ Please fill the following:\n\n• ' + missing.join('\n• ');
      this.error.set(msg);
      alert(msg);
      return;
    }
    this.saving.set(true);
    this.error.set('');

    const validLines: OrderLine[] = this.lines()
      .filter(l => l.itemName && l.qty > 0 && l.rate > 0)
      .map((l, idx) => ({
        itemId: l.itemId,
        itemName: l.itemName,
        description: l.description || null,
        hsnSac: l.hsnSac || null,
        qty: l.qty,
        unit: l.unit,
        rate: l.rate,
        rd: l.rd || 0,
        // Backend re-splits by state — send TOTAL rate (sgst+cgst+igst) as half/half.
        sgstPct: (l.sgstPct + l.cgstPct + l.igstPct) / 2,
        cgstPct: (l.sgstPct + l.cgstPct + l.igstPct) / 2,
        taxableAmount: this.lineTaxable(idx),
        taxAmount: this.lineTax(idx),
        totalAmount: this.lineTotal(idx)
      }));

    const payload = {
      orderType: 'sales',
      orderDate: this.orderDate,
      partyId: this.supplierId,
      buyerPartyId: this.buyerId || null,
      cdPercent: this.cdEnabled() ? this.cdPct() : 0,
      cdType: this.cdType(),
      cdAmount: this.cdEnabled() ? this.cdAmount() : 0,
      supplierOrderNo: this.supplierOrderNo || undefined,
      supplierGroupName: this.supplierGroupName || undefined,
      transporterId: this.transporterId || null,
      paymentTerms: this.paymentTerms || undefined,
      status: this.orderStatus,
      notes: [
        this.remark,
        this.insuranceAmt() ? `Insurance: ₹${this.insuranceAmt()}` : '',
        this.discNormalAmt() > 0 ? `Normal Disc ${this.discNormalPct()}% = ₹${this.discNormalAmt().toFixed(2)}` : '',
        this.discExhAmt() > 0 ? `Exhibition Disc ${this.discExhPct()}% = ₹${this.discExhAmt().toFixed(2)}` : ''
      ].filter(Boolean).join(' | ') || undefined,
      lines: validLines
    };

    // EDIT MODE → in-place update (order number + id same rehte hain, renumber nahi)
    if (this.editMode && this.editId) {
      this.svc.updateOrder(this.editId, payload as any).subscribe({
        next: (o) => {
          this.toast.success(`Order ${o.orderNo} update ho gaya — Net Total ₹${o.total.toFixed(2)}`);
          this.router.navigate(['/trading/orders']);
        },
        error: (e) => {
          this.error.set(e?.error?.error ?? 'Failed to update order.');
          this.saving.set(false);
        }
      });
      return;
    }

    // CREATE MODE
    this.svc.createOrder(payload).subscribe({
      next: (o) => {
        this.toast.success(`Order ${o.orderNo} successfully submit ho gaya — Net Total ₹${o.total.toFixed(2)}`);
        this.router.navigate(['/trading/orders']);     // was '/trading/bills' (bug — wrong redirect)
      },
      error: (e) => {
        this.error.set(e?.error?.error ?? 'Failed to save order. Please check all required fields.');
        this.saving.set(false);
      }
    });
  }
}
