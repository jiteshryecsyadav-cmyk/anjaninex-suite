import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TradingService, Party, Item, BillLine, Transporter, OrderListItem } from '../services/trading.service';
import { BillScanModalComponent } from '../../ai/components/bill-scan-modal.component';
import { ExtractedBill, AiService } from '../../ai/services/ai.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { PartyQuickAddComponent } from '../../../shared/party-quick-add.component';
import { TransporterQuickAddComponent } from '../../../shared/transporter-quick-add.component';
import { amountInWords } from '../../../shared/amount-in-words.util';
import { todayLocal } from '../../../shared/date.util';
import { ToastService } from '../../../shared/toast.service';
import { InDatePipe } from '../../../shared/in-date.pipe';
import { FeatureService } from '../../../shared/feature.service';
import { firstValueFrom } from 'rxjs';

interface RateOpt { qty: number; unit: string; rate: number; }
interface RateChoice {
  idx: number; name: string; taxable: number;
  optA: RateOpt;             // qty AI ka, rate = taxable/qty (per-piece type)
  optB: RateOpt | null;      // AI ka "rate" actually quantity (meters) — rate = taxable/that
  raw:  RateOpt;             // jo AI ne literally padha (no change)
}

interface LineRow {
  itemId: string | null;
  itemName: string;
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  rate: number;
  rd: number;             // Rate Discount per unit
  sgstPct: number;
  cgstPct: number;
  igstPct: number;
  photoFile: File | null;
  photoPreview: string | null;
}

@Component({
  selector: 'app-bill-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, BillScanModalComponent, BackButtonComponent, PartyQuickAddComponent, TransporterQuickAddComponent, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <!-- ============ HEADER (Anjaninex solid colors, NO gradient) ============ -->
      <div class="bill-header">
        <div class="bh-left">
          <img src="anjaninex-logo.jpeg" alt="Anjaninex" class="bh-logo">
          <div>
            <h2 class="bh-title">{{ features.firmName() || 'Anjaninex' }}</h2>
            <p class="bh-sub">Bill Entry · ✍️ Prepared by: <strong>{{ auth.user()?.fullName }}</strong></p>
          </div>
        </div>
        <div class="bh-right">
          <button type="button" (click)="openScan()" class="bh-btn-ai">
            🤖 Scan Bill
            @if (scanUse(); as u) {
              <span style="background:rgba(255,255,255,.25);border-radius:10px;padding:1px 8px;font-size:10px;margin-left:6px">
                {{ u.usedThisMonth }}{{ u.quotaMonthly ? '/' + u.quotaMonthly : '' }} is month
                @if (u.lastScanAt) { · last: {{ u.lastScanAt }} }
              </span>
            }
          </button>
          <a routerLink="/trading/bills" class="bh-btn-list">📄 Bill List</a>
          <button type="button" (click)="newEntry()" class="bh-btn-new">+ New Bill Entry</button>
        </div>
      </div>

      <!-- AI Scan modal -->
      @if (showScan()) {
        <app-bill-scan-modal
          (closed)="showScan.set(false)"
          (dataReady)="applyAiExtraction($event)">
        </app-bill-scan-modal>
      }

      @if (lastAiFill()) {
        <div class="ai-banner">
          <div>
            ✨ <strong>Auto-filled this form</strong> from scan
            ({{ (lastAiFill()!.confidence * 100).toFixed(0) }}% confidence)
            — please review and edit if needed.
          </div>
          <button type="button" (click)="lastAiFill.set(null)" class="ai-banner-close">✕</button>
        </div>
      }

      <!-- ============ SECTION 1: BILL DETAILS ============ -->
      <div class="section-card">
        <div class="section-head">
          <span class="sec-ico">📄</span> BILL DETAILS
        </div>
        <div class="grid grid-cols-4 gap-4 mt-3">
          <div>
            <label class="lbl">COMPANY *</label>
            <select [(ngModel)]="company" class="ip">
              <option value="namokara">{{ features.firmName() || 'Anjaninex' }}{{ features.firmGst() ? '-' + features.firmGst() : '' }}</option>
            </select>
          </div>
          <div>
            <label class="lbl">BILL ENTRY NO.</label>
            <input type="text" disabled [value]="editBillNo" placeholder="Auto — save par milega" class="ip ip-auto">
          </div>
          <div>
            <label class="lbl">ORDER NO. *</label>
            @if (editMode) {
              <!-- Edit me linked order seedha dikhe (billed order dropdown me nahi aata) -->
              <input type="text" disabled [value]="orderNo || '— No order linked —'" class="ip ip-auto">
            } @else {
              <select [(ngModel)]="selectedOrderId" (ngModelChange)="onOrderSelect($event)" class="ip">
                <option value="">Select Order</option>
                @for (o of ordersForPair(); track o.id) {
                  <option [value]="o.id">{{ o.orderNo }} — {{ o.partyName }} (₹{{ o.total | number:'1.0-0' }})</option>
                }
              </select>
              @if ((supplierId || buyerId) && ordersForPair().length === 0) {
                <small style="color:#9CA3AF;font-size:10px">Is supplier/buyer ka koi unbilled order nahi</small>
              }
            }
          </div>
          <div>
            <label class="lbl">SUPPLIER BILL NO. <span style="color:#dc2626;font-weight:800">*</span></label>
            <input [(ngModel)]="supplierBillNo" type="text"
                   placeholder="Supplier ka Bill Number (e.g. INV-2026/045)"
                   class="ip"
                   [class.ip-err]="submitted() && !supplierBillNo?.trim()"
                   maxlength="50">
            @if (submitted() && !supplierBillNo?.trim()) {
              <div class="hint-empty" style="margin-top:4px">⚠️ Supplier Bill No is required (helps detect duplicate bills)</div>
            }
          </div>
          <div>
            <label class="lbl">SUPPLIER BILL DATE * <small style="color:#9CA3AF">(bill par chhapi date — due isi se)</small></label>
            <input [(ngModel)]="billDate" type="date" class="ip">
          </div>
          <div class="col-span-2">
            <label class="lbl">ENTRY DATE <small style="color:#9CA3AF">(auto — aaj ki date, jab entry hui)</small></label>
            <input [(ngModel)]="recDate" type="date" class="ip ip-auto" disabled title="System date — apne aap aaj ki date">
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
            <label class="lbl">SUPPLIER *
              @if (supplierMatchLevel()) {
                <span class="match-badge"
                      [class.match-gst]="supplierMatchLevel() === 'gst'"
                      [class.match-name]="supplierMatchLevel() === 'name'"
                      [class.match-prefix]="supplierMatchLevel() === 'prefix'"
                      [class.match-none]="supplierMatchLevel() === 'none'">
                  {{ supplierBadge() }}
                </span>
              }
            </label>
            @if (billGroupName()) {
              <div class="mb-2 p-2 rounded-lg border border-amber-300 bg-amber-50">
                <div class="text-xs font-bold text-amber-800 mb-1">Ye order "{{ billGroupName() }}" ka hai - bill wali actual firm chuno:</div>
                <div class="flex flex-wrap gap-1">
                  @for (m of groupMembers(); track m.id) {
                    <button type="button" (click)="selectSupplierFromCombo(m)"
                      [class]="supplierId === m.id ? 'bg-[#5c1a8b] text-white' : 'bg-white text-[#5c1a8b] hover:bg-purple-50'"
                      class="px-2 py-1 text-xs font-semibold border border-[#ddc8f5] rounded">{{ m.displayName }}</button>
                  }
                </div>
              </div>
            }
            <!-- COMBOBOX: single autocomplete field (like legacy) -->
            <div class="combo-wrap">
              <div class="flex gap-1">
                <input type="text" [ngModel]="supplierFilter()" (ngModelChange)="supplierFilter.set($event); supplierDropdownOpen.set(true); supKbIdx.set(0)"
                       (focus)="supplierDropdownOpen.set(true)"
                       (blur)="closeSupplierDropdownSoon()"
                       (keydown)="supplierKey($event)"
                       placeholder="🔍 Name ya GST No se search..." class="ip flex-1">
                <button type="button" (click)="showAddSupplier.set(true)" class="qa-add-btn" title="Add new supplier to Party Master">+ New</button>
              </div>
              @if (supplierDropdownOpen() && filteredSuppliers().length > 0) {
                <div class="combo-dropdown">
                  @for (p of filteredSuppliers(); track p.id; let i = $index) {
                    <div class="combo-option" [class.kb-active]="i === supKbIdx()" (mousedown)="selectSupplierFromCombo(p)">
                      <div class="combo-name">{{ p.displayName }}</div>
                      <div class="combo-sub">GST: {{ p.gst || '—' }} {{ p.partyCode ? '· ' + p.partyCode : '' }}</div>
                    </div>
                  }
                </div>
              }
              @if (supplierDropdownOpen() && supplierFilter() && filteredSuppliers().length === 0) {
                <div class="combo-dropdown combo-empty">
                  ⚠️ No supplier found. Click <b class="text-green-600">+ New</b> to add "<i>{{ supplierFilter() }}</i>"
                </div>
              }
            </div>
          </div>
          <div>
            <label class="lbl">GSTIN</label>
            <input type="text" [value]="supplierGstin" disabled placeholder="Auto fill" class="ip ip-auto">
          </div>
          <div>
            <label class="lbl">PAN</label>
            <input type="text" [value]="supplierPan" disabled placeholder="Auto fill" class="ip ip-auto">
          </div>
          <div>
            <label class="lbl">ADDRESS</label>
            <input type="text" [value]="supplierAddress" disabled placeholder="Auto fill" class="ip ip-auto">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="lbl">MOBILE / WHATSAPP / PHONE NO</label>
              <div class="flex gap-1">
                <input type="text" [value]="supplierPhone" disabled placeholder="Auto fill" class="ip ip-auto flex-1">
                <button type="button" class="wa-btn" [disabled]="!supplierPhone"
                        (click)="openWhatsApp(supplierPhone)" title="WhatsApp karo">💬</button>
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
        <div class="grid grid-cols-3 gap-4 mt-3">
          <div>
            <label class="lbl">BUYER *
              @if (buyerMatchLevel()) {
                <span class="match-badge"
                      [class.match-gst]="buyerMatchLevel() === 'gst'"
                      [class.match-name]="buyerMatchLevel() === 'name'"
                      [class.match-prefix]="buyerMatchLevel() === 'prefix'"
                      [class.match-none]="buyerMatchLevel() === 'none'">
                  {{ buyerBadge() }}
                </span>
              }
            </label>
            <!-- COMBOBOX: single autocomplete field (like legacy) -->
            <div class="combo-wrap">
              <div class="flex gap-1">
                <input type="text" [ngModel]="buyerFilter()" (ngModelChange)="buyerFilter.set($event); buyerDropdownOpen.set(true); buyKbIdx.set(0)"
                       (focus)="buyerDropdownOpen.set(true)"
                       (blur)="closeBuyerDropdownSoon()"
                       (keydown)="buyerKey($event)"
                       placeholder="🔍 Name ya GST No se search..." class="ip flex-1">
                <button type="button" (click)="showAddBuyer.set(true)" class="qa-add-btn" title="Add new buyer to Party Master">+ New</button>
              </div>
              @if (buyerDropdownOpen() && filteredBuyers().length > 0) {
                <div class="combo-dropdown">
                  @for (p of filteredBuyers(); track p.id; let i = $index) {
                    <div class="combo-option" [class.kb-active]="i === buyKbIdx()" (mousedown)="selectBuyerFromCombo(p)">
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
            <label class="lbl">CITY</label>
            <input [(ngModel)]="buyerCity" type="text" placeholder="City" class="ip">
          </div>
          <div>
            <label class="lbl">BUYER GSTIN</label>
            <input type="text" [value]="buyerGstin" disabled placeholder="Auto fill" class="ip ip-auto">
          </div>
          <div>
            <label class="lbl">BUYER PAN</label>
            <input type="text" [value]="buyerPan" disabled placeholder="Auto fill" class="ip ip-auto">
          </div>
          <div class="col-span-2">
            <label class="lbl">BUYER ADDRESS</label>
            <input type="text" [value]="buyerAddress" disabled placeholder="Auto fill" class="ip ip-auto">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="lbl">MOBILE / WHATSAPP / PHONE NO</label>
              <div class="flex gap-1">
                <input type="text" [value]="buyerPhone" disabled placeholder="Auto fill" class="ip ip-auto flex-1">
                <button type="button" class="wa-btn" [disabled]="!buyerPhone"
                        (click)="openWhatsApp(buyerPhone)" title="WhatsApp karo">💬</button>
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
          <div class="flex items-center gap-2">
            <label class="lbl" style="margin:0;white-space:nowrap">📦 CASE/PARCEL/BALE</label>
            <input [(ngModel)]="caseParcel" type="number" min="0" placeholder="0" class="ip" style="width:90px">
            <button type="button" (click)="addLine()" class="btn-add-item">+ Add Item</button>
          </div>
        </div>

        @if (reconcileNote()) {
          <div class="reconcile-note">
            ⚠️ {{ reconcileNote() }}
          </div>
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
                <td class="text-right font-mono" data-label="Qty">{{ totalQty() | number:'1.0-2' }}</td>
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

      <!-- ============ SECTION 5: AMOUNT DETAILS + BILL SUMMARY ============ -->
      <div class="grid grid-cols-3 gap-4 mt-4">

        <!-- LEFT: Amount details (2/3 width) -->
        <div class="section-card col-span-2">
          <div class="section-head">
            <span class="sec-ico">₹</span> AMOUNT DETAILS
          </div>

          <div class="grid grid-cols-3 gap-3 mt-3">
            <div>
              <label class="lbl">GROSS AMT *</label>
              <input type="text" disabled [value]="'₹ ' + (grossAmt() | number:'1.2-2')" class="ip ip-auto">
            </div>

            <!-- CD Toggle -->
            <div class="col-span-2 cd-block">
              <div class="cd-head">
                <span>$ CD (Cash Discount)</span>
                <button type="button" class="toggle" [class.on]="cdEnabled()" (click)="toggleCd()">
                  <span class="dot"></span>
                  <span class="toggle-text">{{ cdEnabled() ? 'ON' : 'OFF' }}</span>
                </button>
              </div>
              @if (cdEnabled()) {
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
                    {{ cdType() === 'before' ? 'Discount pehle — GST kam amount par' : 'GST poore par — discount total par' }}
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

            <!-- 💸 SUPPLIER DISCOUNT — % master se auto aata hai, amount auto-calculate (editable).
                 Before/After GST wahi lagta hai jo upar CD me set hai. -->
            <div class="col-span-2 cd-block">
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

            <div>
              <label class="lbl">SWEET / L.S</label>
              <input [ngModel]="sweetLs()" (ngModelChange)="sweetLs.set(+$event || 0)" type="number" step="0.01" class="ip">
            </div>
            <!-- 🧵 FOLD LESS — GROSS me se PEHLE katta hai, bache balance par discount -->
            <div>
              <label class="lbl">🧵 FOLD LESS %</label>
              <input [ngModel]="foldPct()" (ngModelChange)="onFoldPct($event)"
                     type="number" step="0.01" min="0" class="ip">
            </div>
            <div>
              <label class="lbl">FOLD AMT (₹) — editable <small style="color:#9CA3AF">(gross se less)</small></label>
              <input [ngModel]="foldAmt()" (ngModelChange)="onFoldAmt($event)"
                     type="number" step="0.01" min="0" class="ip">
            </div>
            <div>
              <label class="lbl">BANK CHARGE <small style="color:#9CA3AF">(minus hota hai)</small></label>
              <input [ngModel]="bankCharge()" (ngModelChange)="bankCharge.set(+$event || 0)" type="number" step="0.01" min="0" class="ip">
            </div>
            <div>
              <label class="lbl">INTEREST AMT</label>
              <input [ngModel]="interestAmt()" (ngModelChange)="interestAmt.set(+$event || 0)" type="number" step="0.01" class="ip">
            </div>
            <div>
              <label class="lbl">INSURANCE</label>
              <input [ngModel]="insuranceAmt()" (ngModelChange)="insuranceAmt.set(+$event || 0)" type="number" step="0.01" class="ip">
            </div>
            <div>
              <label class="lbl">TAXABLE AMT *</label>
              <input type="text" disabled [value]="'₹ ' + (taxableAfterCd() | number:'1.2-2')" class="ip ip-auto">
            </div>

            <div>
              <label class="lbl">SGST AMT <small style="color:#9CA3AF">(discount ke baad)</small></label>
              <input type="text" disabled [value]="'₹ ' + (effSgst() | number:'1.2-2')" class="ip ip-auto">
            </div>
            <div>
              <label class="lbl">CGST AMT <small style="color:#9CA3AF">(discount ke baad)</small></label>
              <input type="text" disabled [value]="'₹ ' + (effCgst() | number:'1.2-2')" class="ip ip-auto">
            </div>
            <div>
              <label class="lbl">PAYMENT TERMS</label>
              <select [(ngModel)]="paymentTerms" (ngModelChange)="onTermsChange()" class="ip">
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
              <label class="lbl">TCS AMT</label>
              <input [ngModel]="tcsAmt()" (ngModelChange)="tcsAmt.set(+$event || 0)" type="number" step="0.01" class="ip">
            </div>
            <div>
              <label class="lbl">BILL AMT *</label>
              <input type="text" disabled [value]="'₹ ' + (eInvoiceAmt() | number:'1.2-2')" class="ip ip-auto">
            </div>
            <div>
              <label class="lbl">R/OFF</label>
              <input type="text" disabled
                     [value]="(roundOff() >= 0 ? '+ ₹ ' : '- ₹ ') + (roundOff() < 0 ? -roundOff() : roundOff()).toFixed(2)"
                     class="ip ip-auto"
                     [style.color]="roundOff() >= 0 ? '#15803d' : '#dc2626'">
            </div>
            <div>
              <label class="lbl">NET AMOUNT *</label>
              <input type="text" disabled [value]="'₹ ' + (netAmount() | number:'1.0-0')"
                     class="ip ip-auto"
                     style="font-weight:800; color:#1B2E5C; background:#FEF3C7; border-color:#F59E0B">
            </div>
            <div>
              <label class="lbl">ORDER STATUS</label>
              <select [(ngModel)]="orderStatus" class="ip">
                <option value="billed">Billed</option>
                <option value="pending">Pending</option>
                <option value="dispatched">Dispatched</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>

            <div>
              <label class="lbl">TRANSPORTER *
                @if (transporterMatchLevel()) {
                  <span class="match-badge" [class]="'match-' + transporterMatchLevel()"
                        [title]="transporterMatchHint()">
                    {{ transporterMatchIcon() }} {{ transporterMatchLevel() }}
                  </span>
                }
              </label>
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
                        <div class="combo-sub">GST: {{ t.gstNo || '—' }} {{ t.mobile ? '· ' + t.mobile : '' }}</div>
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
              @if (transporterMatchLevel() === 'none' && lastAiFill()) {
                <div class="hint-empty">
                  ⚠️ AI ne <b>"{{ aiTransporterName() }}"</b> {{ aiTransporterGst() ? '(GST: ' + aiTransporterGst() + ')' : '' }}
                  detect kiya but master me nahi mila.
                  <button type="button" (click)="quickAddTransporter()" class="text-green-600 underline ml-1">+ Add as new</button>
                </div>
              }
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
              <label class="lbl">LR NO. *</label>
              <input [(ngModel)]="lrNo" type="text" placeholder="LR Number" class="ip">
            </div>
            <div>
              <label class="lbl">LR DATE</label>
              <input [(ngModel)]="lrDate" type="date" class="ip">
            </div>
            <div>
              <label class="lbl">E-WAY BILL NO</label>
              <input [(ngModel)]="ewayBillNo" (blur)="syncEwayDate()" type="text" placeholder="12-digit eWay No" maxlength="20" class="ip">
            </div>
            <div>
              <label class="lbl">E-WAY BILL DATE</label>
              <input [(ngModel)]="ewayBillDate" type="date" class="ip">
            </div>

            <div class="col-span-3">
              <label class="lbl">REMARK</label>
              <textarea [(ngModel)]="remark" rows="2" placeholder="Optional remark..." class="ip"></textarea>
            </div>
          </div>
        </div>

        <!-- RIGHT: Bill Summary (1/3 width) -->
        <div class="section-card summary-card">
          <div class="section-head">
            <span class="sec-ico">🧾</span> BILL SUMMARY
          </div>
          <div class="sum-rows mt-3">
            <div class="sum-row">
              <span>Gross Amount</span>
              <span class="font-mono">₹ {{ grossAmt() | number:'1.2-2' }}</span>
            </div>
            @if (foldAmt() > 0) {
              <div class="sum-row">
                <span>🧵 Fold Less</span>
                <span class="font-mono text-red-600">- ₹ {{ foldAmt() | number:'1.2-2' }}</span>
              </div>
              <div class="sum-row">
                <span>Balance (Fold ke baad)</span>
                <span class="font-mono">₹ {{ baseAfterFold() | number:'1.2-2' }}</span>
              </div>
            }
            <div class="sum-row">
              <span>CD Amount</span>
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
            <div class="sum-row">
              <span>Sweet / L.s</span>
              <span class="font-mono">₹ {{ sweetLs() | number:'1.2-2' }}</span>
            </div>
            <div class="sum-row">
              <span>Interest</span>
              <span class="font-mono">₹ {{ interestAmt() | number:'1.2-2' }}</span>
            </div>
            @if (bankCharge() > 0) {
              <div class="sum-row">
                <span>Bank Charge</span>
                <span class="font-mono text-red-600">- ₹ {{ bankCharge() | number:'1.2-2' }}</span>
              </div>
            }
            <div class="sum-row">
              <span>Insurance</span>
              <span class="font-mono">₹ {{ insuranceAmt() | number:'1.2-2' }}</span>
            </div>
            @if (caseParcel) {
              <div class="sum-row">
                <span>📦 Case/Parcel/Bale</span>
                <span class="font-mono">{{ caseParcel }}</span>
              </div>
            }
            <div class="sum-row">
              <span>Taxable Amt</span>
              <span class="font-mono">₹ {{ taxableAfterCd() | number:'1.2-2' }}</span>
            </div>
            <div class="sum-divider"></div>
            @if (isInterState()) {
              <div class="sum-row">
                <span>IGST {{ cdType() === 'before' && allDiscAmt() > 0 ? '(discount ke baad)' : '' }}</span>
                <span class="font-mono">₹ {{ effIgst() | number:'1.2-2' }}</span>
              </div>
            } @else {
              <div class="sum-row">
                <span>SGST {{ cdType() === 'before' && allDiscAmt() > 0 ? '(disc. baad)' : '' }}</span>
                <span class="font-mono">₹ {{ effSgst() | number:'1.2-2' }}</span>
              </div>
              <div class="sum-row">
                <span>CGST {{ cdType() === 'before' && allDiscAmt() > 0 ? '(disc. baad)' : '' }}</span>
                <span class="font-mono">₹ {{ effCgst() | number:'1.2-2' }}</span>
              </div>
            }
            <div class="sum-row">
              <span>TCS</span>
              <span class="font-mono">₹ {{ tcsAmt() | number:'1.2-2' }}</span>
            </div>
            <div class="sum-divider"></div>
            <div class="sum-row">
              <span>Bill Amt</span>
              <span class="font-mono">₹ {{ eInvoiceAmt() | number:'1.2-2' }}</span>
            </div>
            @if (roundOff() !== 0) {
              <div class="sum-row" [style.color]="roundOff() >= 0 ? '#15803d' : '#dc2626'">
                <span>R/Off</span>
                <span class="font-mono">{{ roundOff() >= 0 ? '+' : '-' }} ₹ {{ roundOff() < 0 ? -roundOff() : roundOff() | number:'1.2-2' }}</span>
              </div>
            }
            <div class="sum-grand">
              <span>🪙 NET AMOUNT</span>
              <span class="font-mono">₹ {{ netAmount() | number:'1.0-0' }}</span>
            </div>
            @if (netAmount() > 0) {
              <div class="sum-words">📝 {{ words(netAmount()) }}</div>
            }

            <div class="sum-tax-head">TAX BREAKDOWN</div>
            <div class="sum-row sm">
              <span>Total Items</span>
              <span class="font-mono">{{ lines().length }}</span>
            </div>
            <div class="sum-row sm">
              <span>Total Qty</span>
              <span class="font-mono">{{ totalQty() | number:'1.2-2' }}</span>
            </div>
            <div class="sum-row sm">
              <span>Total Tax {{ cdType() === 'before' && allDiscAmt() > 0 ? '(discount ke baad)' : '' }}</span>
              <span class="font-mono">₹ {{ (effSgst() + effCgst() + effIgst()) | number:'1.2-2' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ SECTION 6: DOCUMENT UPLOADS ============ -->
      <div class="grid grid-cols-2 gap-4 mt-4">
        <!-- BILL DOC -->
        <div class="section-card">
          <div class="section-head">
            <span class="sec-ico">📎</span> BILL DOCUMENT UPLOAD
            @if (billDocName()) {
              <button type="button" (click)="previewDoc('bill')" class="doc-eye-btn" title="Preview uploaded bill">
                👁 View
              </button>
              <button type="button" (click)="deleteBillDoc()" class="doc-del-btn" title="Remove uploaded bill">
                🗑 Delete
              </button>
            }
          </div>
          <div class="mt-3">
            <label class="doc-upload">
              <input type="file" accept="image/*,application/pdf" hidden (change)="onBillDocUpload($event)">
              @if (billDocName()) {
                <div class="doc-uploaded">
                  <span class="doc-ico">✓</span>
                  <div class="flex-1">
                    <div class="doc-name">{{ billDocName() }}</div>
                    <div class="doc-hint">Click to replace</div>
                  </div>
                </div>
              } @else {
                <div class="doc-empty">
                  <span class="doc-ico-big">📄</span>
                  <div>
                    <div class="doc-cta">📤 UPLOAD BILL / INVOICE</div>
                    <div class="doc-hint">JPG, PNG, PDF SUPPORTED</div>
                  </div>
                </div>
              }
            </label>
          </div>
        </div>

        <!-- LR / TRANSPORT DOC -->
        <div class="section-card">
          <div class="section-head">
            <span class="sec-ico">🚛</span> LR / TRANSPORT DOCUMENT
            @if (lrDocName()) {
              <button type="button" (click)="previewDoc('lr')" class="doc-eye-btn" title="Preview uploaded LR">
                👁 View
              </button>
              <button type="button" (click)="deleteLrDoc()" class="doc-del-btn" title="Remove uploaded LR">
                🗑 Delete
              </button>
            }
          </div>
          <div class="mt-3">
            <label class="doc-upload">
              <input type="file" accept="image/*,application/pdf" hidden (change)="onLrDocUpload($event)">
              @if (lrDocName()) {
                <div class="doc-uploaded">
                  <span class="doc-ico">✓</span>
                  <div class="flex-1">
                    <div class="doc-name">{{ lrDocName() }}</div>
                    <div class="doc-hint">Click to replace</div>
                  </div>
                </div>
              } @else {
                <div class="doc-empty">
                  <span class="doc-ico-big">🚛</span>
                  <div>
                    <div class="doc-cta">📤 UPLOAD LR / E-WAY BILL</div>
                    <div class="doc-hint">JPG, PNG, PDF SUPPORTED</div>
                  </div>
                </div>
              }
            </label>
          </div>
        </div>
      </div>

      <!-- DUPLICATE BILL MODAL -->
      @if (duplicateBill(); as dup) {
        <div class="dup-overlay" (click)="closeDuplicateModal()">
          <div class="dup-modal" (click)="$event.stopPropagation()">
            <div class="dup-head">
              <span>🚫 DUPLICATE BILL</span>
              <button type="button" (click)="closeDuplicateModal()" class="dup-close">✕</button>
            </div>
            <div class="dup-body">
              <div class="dup-warn">
                Same <b>Supplier</b> + <b>Supplier Bill No</b> + <b>Date</b> ke saath bill <b>pehle se save hai</b>.
              </div>
              <div class="dup-card">
                <div class="dup-row"><span>Bill No:</span><b>{{ dup.billNo }}</b></div>
                <div class="dup-row"><span>Bill Date:</span><b>{{ dup.billDate | inDate }}</b></div>
                <div class="dup-row"><span>Amount:</span><b>₹ {{ dup.total | number:'1.2-2' }}</b></div>
                <div class="dup-row"><span>Status:</span>
                  <span class="dup-status"
                        [class.bg-green-100]="dup.status === 'paid'"
                        [class.text-green-700]="dup.status === 'paid'"
                        [class.bg-yellow-100]="dup.status === 'pending'"
                        [class.text-yellow-700]="dup.status === 'pending'">
                    {{ dup.status }}
                  </span>
                </div>
              </div>
              <div class="dup-hint">
                ⚠️ Same GSTIN par 2 bills allowed nahi — double-save accounting books bigad sakta hai.
              </div>
              <div class="dup-actions">
                <button type="button" (click)="viewDuplicateBill()" class="dup-btn-primary">
                  👁 View Existing Bill
                </button>
                <button type="button" (click)="closeDuplicateModal()" class="dup-btn-secondary">
                  ✕ Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- DOC PREVIEW MODAL -->
      @if (docPreviewUrl()) {
        <div class="doc-modal-overlay" (click)="closeDocPreview()">
          <div class="doc-modal" (click)="$event.stopPropagation()">
            <div class="doc-modal-head">
              <strong>{{ docPreviewTitle() }}</strong>
              <button type="button" (click)="closeDocPreview()" class="doc-modal-close">✕</button>
            </div>
            <div class="doc-modal-body">
              @if (docPreviewType() === 'image') {
                <img [src]="docPreviewUrl()" alt="Document preview" class="doc-preview-img">
              } @else if (docPreviewType() === 'pdf') {
                <iframe [src]="docPreviewUrl()" class="doc-preview-pdf"></iframe>
              }
            </div>
          </div>
        </div>
      }

      <!-- Error -->
      @if (error()) {
        <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mt-3">
          {{ error() }}
        </div>
      }

      <!-- ============ BOTTOM BUTTONS ============ -->
      <div class="bottom-bar">
        <a routerLink="/trading/bills" class="btn-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
          Back
        </a>
        <div class="flex gap-3 items-center">
          <button type="button" (click)="preview()" class="btn-preview" title="Preview">👁</button>
          <button type="button" (click)="save()" [disabled]="saving()" class="btn-save">
            {{ saving() ? 'Saving…' : '✓ Save Bill Entry' }}
          </button>
        </div>
      </div>

      <!-- ORDER LINK POPUP — scan ke baad: is supplier/buyer ke pending orders -->
      @if (orderLinkOpen()) {
        <div class="olp-overlay" (click)="orderLinkOpen.set(false)">
          <div class="olp-modal" (click)="$event.stopPropagation()">
            <div class="olp-head">
              📋 Is Supplier/Buyer ke PENDING Orders mile!
              <button type="button" (click)="orderLinkOpen.set(false)" class="olp-close">✕</button>
            </div>
            <div class="olp-body">
              <p class="olp-hint">
                Ye bill kisi order ka hai? Tick karke jodo — save hote hi wo order
                <b>BILLED</b> ho jayega aur pending me nahi atkega.
              </p>
              <table class="olp-table">
                <thead>
                  <tr>
                    <th class="w-8"></th>
                    <th>ORDER NO</th>
                    <th>DATE</th>
                    <th class="text-right">ITEMS</th>
                    <th class="text-right">QTY</th>
                    <th class="text-right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of orderLinkRows(); track r.id) {
                    <tr (click)="toggleOrderLinkSel(r.id)" [class.olp-sel]="orderLinkSel === r.id">
                      <td class="text-center">
                        <input type="checkbox" class="olp-check"
                               [checked]="orderLinkSel === r.id"
                               (click)="$event.stopPropagation(); toggleOrderLinkSel(r.id)">
                      </td>
                      <td class="font-mono font-bold">{{ r.orderNo }}</td>
                      <td>{{ r.orderDate | inDate }}</td>
                      <td class="text-right font-mono">{{ r.items }}</td>
                      <td class="text-right font-mono">{{ r.qty | number:'1.0-0' }}</td>
                      <td class="text-right font-mono font-bold">₹ {{ r.total | number:'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="olp-foot">
              <button type="button" (click)="orderLinkOpen.set(false)" class="olp-btn olp-btn-cancel">
                ✗ Koi order nahi — aise hi save karunga
              </button>
              <button type="button" (click)="linkSelectedOrder()" [disabled]="!orderLinkSel" class="olp-btn olp-btn-link">
                ✓ Is Order se Jodo
              </button>
            </div>
          </div>
        </div>
      }

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

      <!-- Quick-Add Transporter modal (pura form — AI naam/GST prefill) -->
      @if (showAddTransporter()) {
        <app-transporter-quick-add
          [prefill]="{ firmName: aiTransporterName(), gstNo: aiTransporterGst() }"
          (created)="onTransporterCreated($event)"
          (close)="showAddTransporter.set(false)">
        </app-transporter-quick-add>
      }

      <!-- Quick-Add Party modals (pre-filled from AI scan when available) -->
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

    /* ============ ORDER LINK POPUP ============ */
    .olp-overlay { position: fixed; inset: 0; background: rgba(20,10,40,.55); z-index: 96;
      display: flex; align-items: center; justify-content: center; padding: 16px; }
    .olp-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 680px;
      max-height: 85vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
    .olp-head { background: linear-gradient(90deg, var(--anjaninex-navy, #1B2E5C), #2a4178); color: #fff;
      padding: 14px 18px; font-weight: 800; font-size: 14px;
      display: flex; justify-content: space-between; align-items: center;
      border-radius: 14px 14px 0 0; position: sticky; top: 0; }
    .olp-close { background: rgba(255,255,255,.15); border: 0; color: #fff; width: 26px; height: 26px;
      border-radius: 50%; cursor: pointer; }
    .olp-body { padding: 14px 18px; }
    .olp-hint { font-size: 12.5px; color: #4A5878; background: #FEF3C7; border-left: 4px solid #F59E0B;
      padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; }
    .olp-table { width: 100%; font-size: 13px; border-collapse: collapse; }
    .olp-table thead { background: #f0e6ff; color: #5c1a8b; }
    .olp-table th { padding: 8px; text-align: left; font-size: 10px; font-weight: 800;
      text-transform: uppercase; letter-spacing: .3px; }
    .olp-table th.text-right { text-align: right; }
    .olp-table td { padding: 10px 8px; border-bottom: 1px solid #f5f0ff; cursor: pointer; }
    .olp-table tr:hover { background: #faf5ff; }
    .olp-sel { background: #ede9fe !important; }
    .olp-check { width: 18px; height: 18px; accent-color: #5c1a8b; cursor: pointer; }
    .olp-foot { display: flex; justify-content: space-between; gap: 10px; padding: 12px 18px;
      border-top: 1px solid #f0e6ff; position: sticky; bottom: 0; background: #fff;
      border-radius: 0 0 14px 14px; }
    .olp-btn { padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 700;
      cursor: pointer; font-family: inherit; border: 0; }
    .olp-btn-cancel { background: #fff; border: 1px solid #d1d5db; color: #374151; }
    .olp-btn-link { background: #16a34a; color: #fff; }
    .olp-btn-link:disabled { opacity: .5; cursor: not-allowed; }

    /* ============ Anjaninex BRAND COLORS ============
       Primary Red:   #DC2626
       Navy:          #1B2E5C
       Cream:         #FAF7F0
       Light Cream:   #F5EFE3
       Border gray:   #D6DDEA
       Subtle BG:     #FFFFFF
    */
    :host {
      display: block;
      background: #FAF7F0;
      min-height: 100vh;
      padding: 16px 0;
    }

    /* HEADER */
    .bill-header {
      background: var(--anjaninex-navy, #1B2E5C);
      color: #fff;
      padding: 14px 22px;
      border-radius: 12px 12px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(27,46,92,0.12);
    }
    .bh-left { display: flex; align-items: center; gap: 12px; }
    .bh-logo { width: 44px; height: 44px; object-fit: contain; background: #fff; border-radius: 8px; padding: 4px; }
    .bh-title { font-size: 19px; font-weight: 800; margin: 0; letter-spacing: 0.3px; }
    .bh-sub { font-size: 12px; opacity: 0.85; margin: 0; }
    .bh-right { display: flex; gap: 8px; }
    .bh-btn-ai, .bh-btn-list, .bh-btn-new {
      padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 13px;
      cursor: pointer; border: 0; font-family: inherit; text-decoration: none;
      transition: transform 0.1s, background 0.15s;
    }
    .bh-btn-ai { background: #DC2626; color: #fff; }
    .bh-btn-ai:hover { background: #B91C1C; transform: translateY(-1px); }
    .bh-btn-list { background: rgba(255,255,255,0.15); color: #fff; }
    .bh-btn-list:hover { background: rgba(255,255,255,0.25); }
    .bh-btn-new { background: #fff; color: #1B2E5C; }
    .bh-btn-new:hover { background: #F5EFE3; }

    /* AI BANNER */
    .ai-banner {
      background: #FEF3C7;
      border: 1px solid #FCD34D;
      color: #92400E;
      padding: 10px 16px;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ai-banner-close {
      background: transparent; border: 0; color: #92400E; font-size: 16px; cursor: pointer; padding: 0 6px;
    }

    /* SECTION CARDS */
    .section-card {
      background: #fff;
      border: 1px solid #D6DDEA;
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 14px;
      box-shadow: 0 1px 3px rgba(27,46,92,0.04);
    }
    .section-head {
      font-size: 13px;
      font-weight: 800;
      color: #DC2626;
      letter-spacing: 0.5px;
      padding-bottom: 8px;
      border-bottom: 1px solid #F5EFE3;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-head.no-border { border-bottom: 0; padding-bottom: 0; }
    .sec-ico { font-size: 15px; }

    /* LABELS + INPUTS */
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
      background: #ECFDF5;
      color: #047857;
      border-color: #A7F3D0;
      font-weight: 600;
    }
    .reconcile-note {
      margin-top: 8px; padding: 8px 12px; border-radius: 8px;
      background: #FEF3C7; border: 1px solid #FBBF24; color: #92400E;
      font-size: 12px; font-weight: 600; line-height: 1.4;
    }
    /* Rate-choice popup */
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
      border: 1.5px solid #1B2E5C; background: #F5F7FB; color: #1B2E5C; font-size: 14px;
      transition: all .12s; }
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
    .item-table th { white-space: nowrap; }
    .item-table th:nth-child(2), .item-table td:nth-child(2){ min-width: 170px; }  /* Item Name */
    .item-table th:nth-child(3), .item-table td:nth-child(3){ min-width: 160px; }  /* Description */
    .item-table thead {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff;
    }
    .item-table th {
      padding: 8px 6px; text-align: left; font-weight: 700; font-size: 10px;
      letter-spacing: 0.3px; text-transform: uppercase; white-space: nowrap;
    }
    .item-table th.text-right { text-align: right; }
    .item-table th.text-center { text-align: center; }
    .item-table td {
      padding: 6px 5px; border-bottom: 1px solid #F5EFE3; vertical-align: middle;
    }
    .item-table tbody tr:hover { background: #FAF7F0; }
    .item-table tfoot {
      background: #F5EFE3; font-weight: 800; color: #1B2E5C;
    }
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
    .photo-upload img {
      width: 32px; height: 32px; object-fit: cover; border-radius: 4px;
    }
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
    .toggle.on .dot { transform: translateX(0); background: #fff; }
    .toggle-text { letter-spacing: 0.5px; }

    /* SUMMARY CARD */
    .summary-card { background: linear-gradient(180deg, #fff 0%, #FAF7F0 100%); }
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
      margin-top: 14px; padding-top: 8px; border-top: 1px solid #D6DDEA;
      text-transform: uppercase;
    }

    /* DOCUMENT UPLOAD */
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

    /* Eye/View button in section head */
    .doc-eye-btn {
      margin-left: auto; padding: 4px 10px; font-size: 11.5px; font-weight: 700;
      background: linear-gradient(135deg, #5c1a8b, #7c3aed); color: #fff;
      border: 0; border-radius: 6px; cursor: pointer;
    }
    .doc-eye-btn:hover { background: linear-gradient(135deg, #4a1370, #6b21a8); }
    .doc-del-btn {
      margin-left: 8px; padding: 4px 10px; font-size: 11.5px; font-weight: 700;
      background: linear-gradient(135deg, #dc2626, #991b1b); color: #fff;
      border: 0; border-radius: 6px; cursor: pointer;
    }
    .doc-del-btn:hover { background: linear-gradient(135deg, #991b1b, #7f1d1d); }

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

    /* DUPLICATE BILL MODAL — red theme (strict block) */
    .dup-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .dup-modal {
      background: #fff; border-radius: 12px; max-width: 480px; width: 100%;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5); overflow: hidden;
    }
    .dup-head {
      padding: 16px 20px; background: linear-gradient(135deg, #DC2626, #991B1B); color: #fff;
      display: flex; align-items: center; justify-content: space-between;
      font-weight: 900; font-size: 15px; letter-spacing: 0.5px;
    }
    .dup-close {
      background: rgba(255,255,255,0.2); border: 0; color: #fff;
      width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-weight: 700;
    }
    .dup-body { padding: 20px; }
    .dup-warn {
      background: #FEF2F2; border-left: 4px solid #DC2626; padding: 12px 14px;
      border-radius: 6px; font-size: 13px; color: #7F1D1D; margin-bottom: 14px; line-height: 1.5;
    }
    .dup-card {
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;
      padding: 14px 16px; margin-bottom: 14px;
    }
    .dup-row {
      display: flex; justify-content: space-between; padding: 6px 0;
      font-size: 13px; border-bottom: 1px solid #F1F5F9;
    }
    .dup-row:last-child { border-bottom: 0; }
    .dup-row span:first-child { color: #6b7280; }
    .dup-row b { color: #1B2E5C; font-weight: 700; }
    .dup-status { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .dup-hint {
      font-size: 11.5px; color: #92400E; background: #FFFBEB; border-left: 3px solid #F59E0B;
      padding: 8px 12px; border-radius: 4px; margin-bottom: 16px; line-height: 1.5;
    }
    .dup-actions { display: flex; gap: 10px; }
    .dup-btn-primary {
      flex: 1; padding: 10px 16px; background: linear-gradient(135deg, #5c1a8b, #7c3aed);
      color: #fff; border: 0; border-radius: 8px; font-weight: 800; font-size: 13px; cursor: pointer;
    }
    .dup-btn-primary:hover { background: linear-gradient(135deg, #4a1370, #6b21a8); }
    .dup-btn-secondary {
      padding: 10px 16px; background: #F1F5F9; color: #475569;
      border: 0; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer;
    }
    .dup-btn-secondary:hover { background: #E2E8F0; }

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
    .hint-empty {
      margin-top: 6px; padding: 7px 12px;
      background: #fff8e1; border-left: 3px solid #f9a825; border-radius: 4px;
      font-size: 11.5px; color: #92400e;
    }
    /* Red border on inputs when mandatory fields are missing */
    .ip-err { border-color: #dc2626 !important; background: #fef2f2 !important; }
    .ip-err:focus { box-shadow: 0 0 0 3px rgba(220,38,38,.15) !important; }

    /* AI match-level badge next to labels (Supplier / Buyer / Transporter) */
    .match-badge {
      display: inline-block; margin-left: 8px; padding: 2px 8px; font-size: 10px;
      font-weight: 800; border-radius: 10px; letter-spacing: 0.3px;
      vertical-align: middle;
    }
    .match-gst    { background: #d1fae5; color: #065f46; }   /* green — 🥇 GST */
    .match-name   { background: #d1fae5; color: #065f46; }   /* green — 🥉 NAME */
    .match-prefix { background: #fef3c7; color: #92400e; }   /* yellow — 🤖 AI */
    .match-none   { background: #fef3c7; color: #92400e; }   /* yellow — ⚠️ NONE */
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
      .bill-header { flex-wrap: wrap; gap: 8px; padding: 12px 14px; }
      .bh-right { flex-wrap: wrap; width: 100%; }
      .section-card { padding: 12px 12px; }
      /* All form grids → single column */
      .grid-cols-2, .grid-cols-3, .grid-cols-4 { grid-template-columns: 1fr !important; }
      .col-span-2, .col-span-3 { grid-column: span 1 !important; }
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
      /* SNO row banner-style */
      .item-table tbody td.sno-cell {
        justify-content: flex-start; background: var(--anjaninex-navy, #1B2E5C); color: #fff;
        margin: -6px -10px 6px; padding: 8px 12px; border-radius: 10px 10px 0 0;
        font-weight: 800; border-bottom: 0; text-align: left;
      }
      .item-table tbody td.sno-cell::before { content: "Item #"; color: #cdd6ec; flex: 0 0 auto; margin-right: 8px; }
      /* tfoot totals as a card too */
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
      /* Modals fit small screens */
      .dup-overlay, .doc-modal-overlay, .olp-overlay { padding: 8px; }
      .dup-modal, .doc-modal, .olp-modal { width: auto !important; max-width: 100% !important; }
      .doc-modal-body { padding: 8px; }
      .olp-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
      .dup-actions { flex-wrap: wrap; }
    }
  `]
})
export class BillEntryComponent {
  private svc = inject(TradingService);
  features = inject(FeatureService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  auth = inject(AuthService);
  private sanitizer = inject(DomSanitizer);
  private toast = inject(ToastService);
  private aiSvc = inject(AiService);
  scanUse = signal<{ usedThisMonth: number; total: number; quotaMonthly: number; lastScanAt: string | null } | null>(null);

  // Data
  parties = signal<Party[]>([]);
  billGroupName = signal('');
  groupMembers = computed(() => {
    const g = this.billGroupName();
    return g ? this.parties().filter((p: any) => p.groupName === g) : [];
  });
  items = signal<Item[]>([]);
  saving = signal(false);
  error = signal('');
  showScan = signal(false);
  lastAiFill = signal<ExtractedBill | null>(null);
  billDocName = signal('');
  billDocFile: File | null = null;
  lrDocName = signal('');               // NEW — LR / e-Way bill document
  lrDocFile: File | null = null;
  submitted = signal(false);            // toggled by save() to show red error borders

  // Document preview modal state
  docPreviewUrl   = signal<string | SafeResourceUrl | null>(null);
  docPreviewTitle = signal('');
  docPreviewType  = signal<'image' | 'pdf' | null>(null);

  // Section 1: Bill details
  company = 'namokara';
  billType: 'sales' | 'purchase' = 'sales';
  orderNo = '';
  selectedOrderId = '';
  orders = signal<OrderListItem[]>([]);

  /** Order dropdown: supplier/buyer chune ho to SIRF unke relation ke orders dikhen.
      Kuch na chuna ho to saare unbilled orders (pehle jaisa). */
  ordersForPair(): OrderListItem[] {
    return this.orders().filter(o =>
      (!this.supplierId || o.partyId === this.supplierId)
      && (!this.buyerId || !o.buyerPartyId || o.buyerPartyId === this.buyerId)
    );
  }

  /** Order select → puri order detail auto-fill (supplier, buyer, items, CD).
      AI scan ki zaroorat nahi — order se hi bill ban jata hai. */
  onOrderSelect(id: string) {
    if (!id) { this.orderNo = ''; this.billGroupName.set(''); return; }
    this.svc.getOrder(id).subscribe({
      next: (od) => {
        this.orderNo = od.orderNo;
        this.billGroupName.set((od as any).supplierGroupName || '');

        // Supplier + Buyer auto-select (GST/address/phone bhi bhar jayenge)
        if (od.partyId) {
          this.supplierId = od.partyId;
          this.onSupplierChange(od.partyId);
        }
        if (od.buyerPartyId) {
          this.buyerId = od.buyerPartyId;
          this.onBuyerChange(od.buyerPartyId);
        }

        // Items — order ki saari lines bill me
        if (od.lines?.length) {
          this.lines.set(od.lines.map(l => ({
            itemId: l.itemId ?? null,
            itemName: l.itemName,
            description: l.description || '',
            hsnSac: l.hsnSac || '',
            qty: +l.qty || 0,
            unit: l.unit || 'PCS',
            rate: +l.rate || 0,
            rd: +l.rd || 0,
            sgstPct: +l.sgstPct || 0,
            cgstPct: +l.cgstPct || 0,
            igstPct: 0,
            photoFile: null, photoPreview: null
          })));
          this.redistributeGst();
        }

        // CD bhi order se (type samet)
        if (od.cdPercent > 0) {
          this.cdEnabled.set(true);
          this.cdPct.set(+od.cdPercent);
          this.cdType.set(od.cdType === 'after' ? 'after' : 'before');
          this.cdAmountOverride.set(null);
        }

        // 💸 Supplier discounts — order me % badle the to wahi bill me aayen (warna master wale)
        const on = (od as any).notes || '';
        const ndM = on.match(/Normal Disc\s+([\d.]+)%/);
        if (ndM) { this.discNormalPct.set(+ndM[1] || 0); this.discNormalOverride.set(null); }
        const exM = on.match(/Exhibition Disc\s+([\d.]+)%/);
        if (exM) { this.discExhPct.set(+exM[1] || 0); this.discExhOverride.set(null); }

        // Transporter bhi order se
        if (od.transporterId) { this.transporterId = od.transporterId; this.syncTransporterName(); }

        // Payment terms order se — bill me wahi dikhega jo order me hai
        if (od.paymentTerms) { this.paymentTerms = od.paymentTerms; this.onTermsChange(); }
      },
      error: () => {}
    });
  }
  supplierBillNo = '';
  billDate = todayLocal();   // LOCAL date — UTC se ek din pichhe nahi jayegi
  recDate = todayLocal();

  // Section 2: Supplier (auto-fill from party)
  supplierId = '';
  supplierGstin = '';
  supplierPan = '';
  supplierAddress = '';
  supplierPhone = '';

  // Section 3: Buyer
  buyerId = '';
  buyerCity = '';
  buyerGstin = '';
  buyerPan = '';
  buyerAddress = '';
  buyerPhone = '';

  // GST/Name/Code filter signals
  supplierFilter = signal('');
  buyerFilter = signal('');
  // Supplier dropdown me sirf SELLER/BOTH, buyer me sirf BUYER/BOTH — mix na ho
  filteredSuppliers = computed(() => this.matchParties(this.supplierFilter())
    .filter(p => p.partyType === 'seller' || p.partyType === 'both').slice(0, 8));
  filteredBuyers = computed(() => this.matchParties(this.buyerFilter())
    .filter(p => p.partyType === 'buyer' || p.partyType === 'both').slice(0, 8));

  // Keyboard navigation (arrow up/down + enter + escape) for comboboxes
  supKbIdx = signal(0);
  buyKbIdx = signal(0);
  supplierKey(e: KeyboardEvent) {
    const list = this.filteredSuppliers();
    if (!this.supplierDropdownOpen() || list.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.supKbIdx.set(Math.min(this.supKbIdx() + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.supKbIdx.set(Math.max(this.supKbIdx() - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const p = list[this.supKbIdx()]; if (p) this.selectSupplierFromCombo(p); }
    else if (e.key === 'Escape') { this.supplierDropdownOpen.set(false); }
  }
  buyerKey(e: KeyboardEvent) {
    const list = this.filteredBuyers();
    if (!this.buyerDropdownOpen() || list.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.buyKbIdx.set(Math.min(this.buyKbIdx() + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.buyKbIdx.set(Math.max(this.buyKbIdx() - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const p = list[this.buyKbIdx()]; if (p) this.selectBuyerFromCombo(p); }
    else if (e.key === 'Escape') { this.buyerDropdownOpen.set(false); }
  }

  // Combobox dropdown state (single-field autocomplete UX)
  supplierDropdownOpen = signal(false);
  buyerDropdownOpen = signal(false);

  // AI match level signals (badge in label) — gst / name / prefix / none / null
  supplierMatchLevel = signal<'gst' | 'name' | 'prefix' | 'none' | null>(null);
  buyerMatchLevel    = signal<'gst' | 'name' | 'prefix' | 'none' | null>(null);

  /** Smart match for party (supplier or buyer) — GST first, then name. */
  private matchParty(name: string, gst: string): { id: string; level: 'gst' | 'name' | 'prefix' | 'none' } {
    const list = this.parties();
    if (list.length === 0) return { id: '', level: 'none' };
    const cleanGst  = (gst  || '').trim().toUpperCase().replace(/\s/g, '');
    const cleanName = (name || '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '');

    const normGst = (g: string | null | undefined) => (g || '').trim().toUpperCase().replace(/\s/g, '');
    const normNm  = (n: string | null | undefined) => (n || '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

    // 🥇 GST exact (15) — sabse bharosemand
    if (cleanGst.length >= 15) {
      const byGst = list.find(p => normGst(p.gst) === cleanGst);
      if (byGst) return { id: byGst.id, level: 'gst' };
    }
    // 🥈 Same PAN (GST ke first 12 = state+PAN) — branch / OCR last-3 mismatch ke liye.
    //    (Purana 7-char prefix HATAYA — wo alag party utha leta tha.)
    if (cleanGst.length >= 12) {
      const pan12 = cleanGst.substring(0, 12);
      const byPan = list.find(p => { const g = normGst(p.gst); return g.length >= 12 && g.substring(0, 12) === pan12; });
      if (byPan) return { id: byPan.id, level: 'gst' };
    }

    // 🥉 Naam EXACT match hi (loose prefix/contains HATAYA — "Sagar Lace" galti se
    //    "Sagar Cloth Store" utha leta tha). Match na mile to scanned naam+GST waisा rahe.
    const nm = normNm(name);
    if (nm) {
      const byName = list.find(p => normNm(p.displayName) === nm);
      if (byName) return { id: byName.id, level: 'name' };
    }

    return { id: '', level: 'none' };
  }

  supplierBadge = () => this.partyBadgeIcon(this.supplierMatchLevel());
  buyerBadge    = () => this.partyBadgeIcon(this.buyerMatchLevel());
  private partyBadgeIcon(lvl: 'gst' | 'name' | 'prefix' | 'none' | null): string {
    return lvl === 'gst'    ? '🥇 GST'
         : lvl === 'name'   ? '🥉 NAME'
         : lvl === 'prefix' ? '🤖 AI'
         : lvl === 'none'   ? '⚠️ NONE'
         : '';
  }

  /** Close dropdown after a tiny delay so the click event on an option still fires. */
  closeSupplierDropdownSoon() { setTimeout(() => this.supplierDropdownOpen.set(false), 200); }
  closeBuyerDropdownSoon()    { setTimeout(() => this.buyerDropdownOpen.set(false), 200); }

  /** User clicked an option in the supplier dropdown — set ID, fill display name, close dropdown. */
  selectSupplierFromCombo(p: Party) {
    this.aiGstTypeOverride.set(null);   // manual select → GST type state-code se decide ho
    this.supplierId = p.id;
    this.supplierFilter.set(p.displayName);
    this.supplierDropdownOpen.set(false);
    this.onSupplierChange(p.id);
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
  /** GST ya PAN se master me party dhoondo (phone/naam par match NAHI). */
  private findMasterParty(gst?: string | null, pan?: string | null): Party | undefined {
    const g = this.pNorm(gst), pa = this.pNorm(pan);
    if (!g && !pa) return undefined;
    return this.parties().find(p =>
      (!!g && this.pNorm(p.gst) === g) ||
      (!!pa && this.pNorm(p.pan) === pa)
    );
  }
  /** Badge: id linked ho YA GST/PAN se master me mile to "save hai". */
  get supplierInMaster(): boolean {
    return !!this.supplierId || !!this.findMasterParty(this.supplierGstin, this.supplierPan);
  }
  get buyerInMaster(): boolean {
    return !!this.buyerId || !!this.findMasterParty(this.buyerGstin, this.buyerPan);
  }
  /** Save se pehle: id na ho par GST/PAN master me mile to link kar do (duplicate na bane). */
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

  // Quick-Add Party modal state + handler
  showAddSupplier = signal(false);
  showAddBuyer = signal(false);

  // AI-extracted party data — used to prefill Quick Add modal
  aiSupplier: Partial<{ displayName: string; gst: string; pan: string; phone: string; address: string; city: string }> | null = null;
  aiBuyer: Partial<{ displayName: string; gst: string; pan: string; phone: string; address: string; city: string }> | null = null;

  /** Compute prefill data for Quick Add modal from form fields + AI extraction. */
  supplierPrefill() {
    return {
      displayName: this.aiSupplier?.displayName || this.supplierFilter() || '',
      gst: this.aiSupplier?.gst || this.supplierGstin || '',
      pan: this.aiSupplier?.pan || '',
      phone: this.aiSupplier?.phone || this.supplierPhone || '',
      address: this.aiSupplier?.address || this.supplierAddress || '',
      city: this.aiSupplier?.city || ''
    };
  }
  buyerPrefill() {
    return {
      displayName: this.aiBuyer?.displayName || this.buyerFilter() || '',
      gst: this.aiBuyer?.gst || this.buyerGstin || '',
      pan: this.aiBuyer?.pan || '',
      phone: this.aiBuyer?.phone || this.buyerPhone || '',
      address: this.aiBuyer?.address || this.buyerAddress || '',
      city: this.aiBuyer?.city || this.buyerCity || ''
    };
  }

  onPartyCreated(p: Party, side: 'supplier' | 'buyer') {
    this.parties.update(arr => [p, ...arr]);
    if (side === 'supplier') {
      this.supplierId = p.id;
      this.onSupplierChange(p.id);
      this.aiSupplier = null;          // clear AI cache so re-open doesn't pre-fill stale data
      this.supplierFilter.set('');
    } else {
      this.buyerId = p.id;
      this.onBuyerChange(p.id);
      this.aiBuyer = null;
      this.buyerFilter.set('');
    }
  }

  // Section 5: Amount details
  cdEnabled = signal(true);
  cdPct = signal(0);
  cdType = signal<'before' | 'after'>('before');   // before = GST se pehle | after = GST ke baad
  cdAmountOverride = signal<number | null>(null);
  setCdType(t: 'before' | 'after') {
    this.cdType.set(t);
    this.cdAmountOverride.set(null);
    this.discNormalOverride.set(null);
    this.discExhOverride.set(null);
  }

  // 🧵 FOLD LESS — GROSS me se PEHLE less hota hai; discounts bache balance par lagti hain
  foldPct = signal(0);
  foldOverride = signal<number | null>(null);
  foldAmt = computed(() => {
    const o = this.foldOverride();
    if (o !== null) return o;
    return +(this.grossAmt() * (this.foldPct() / 100)).toFixed(2);
  });
  /** Gross − Fold = wo balance jis par CD/discounts % lagta hai */
  baseAfterFold = computed(() => Math.max(0, this.grossAmt() - this.foldAmt()));
  onFoldPct(v: number) { this.foldPct.set(+v || 0); this.foldOverride.set(null); }
  onFoldAmt(v: number) { this.foldOverride.set(+v || 0); }

  // 💸 SUPPLIER DISCOUNT (Normal + Exhibition) — % supplier master se auto-fill,
  // amount auto-calculate (CD jaisa hi: % badlo to amount, amount override bhi editable).
  discNormalPct = signal(0);
  discNormalOverride = signal<number | null>(null);
  discExhPct = signal(0);
  discExhOverride = signal<number | null>(null);
  suppressAutoDisc = false;   // edit-load me master se auto-fill NAHI (saved % hi rahe)

  private discBase() {
    // Fold Less ke BAAD wala balance — usi par discount % lagta hai
    return this.cdType() === 'after'
      ? this.baseAfterFold() + this.sgstTotal() + this.cgstTotal() + this.igstTotal()
      : this.baseAfterFold();
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
  /** CD + supplier discounts — sab jagah net/tax me yahi total minus hota hai */
  allDiscAmt = computed(() => this.cdAmount() + this.supplierDiscTotal());
  onDiscNormalPct(v: number) { this.discNormalPct.set(+v || 0); this.discNormalOverride.set(null); }
  onDiscNormalAmt(v: number) { this.discNormalOverride.set(+v || 0); }
  onDiscExhPct(v: number) { this.discExhPct.set(+v || 0); this.discExhOverride.set(null); }
  onDiscExhAmt(v: number) { this.discExhOverride.set(+v || 0); }
  /** Supplier select hone par master ke % yahan bhar do (edit-load me nahi) */
  fillDiscFromMaster(partyId: string) {
    if (this.suppressAutoDisc) return;
    const p = this.parties().find(x => x.id === partyId);
    this.discNormalPct.set(+(p?.discountNormal ?? 0));
    this.discExhPct.set(+(p?.discountExhibition ?? 0));
    this.discNormalOverride.set(null);
    this.discExhOverride.set(null);
  }
  // Additive charges — SIGNALS (computed eInvoiceAmt/taxableAfterCd inhe track kare,
  // warna value badalne par net amount recompute nahi hota tha — wahi bug tha).
  sweetLs = signal(0);
  interestAmt = signal(0);
  insuranceAmt = signal(0);   // INSURANCE — additive charge (taxable me jud kar net me)
  bankCharge = signal(0);     // BANK CHARGE — net me MINUS hota hai (GST par asar nahi)
  caseParcel: number | null = null;   // 📦 pure bill ka total case/parcel count
  paymentTerms = '';   // order jaisa hi dropdown (net15/net30/.../advance/cod/loa)
  days = 45;           // internal — terms se derive hota hai (due/remark ke liye)
  tcsAmt = signal(0);
  orderStatus = 'billed';
  transporter = '';                          // legacy free-text (still used in notes)
  transporterId = '';                        // NEW — selected transporter UUID
  lrNo = '';
  lrDate = '';
  ewayBillNo = '';                           // NEW — 12-digit e-Way bill no
  ewayBillDate = '';                         // NEW — e-Way bill generation date
  remark = '';

  // Transporter master + AI smart-match state
  transporters = signal<Transporter[]>([]);
  transporterMatchLevel = signal<'gst'|'name'|'prefix'|'none'|null>(null);
  aiTransporterName = signal('');
  aiTransporterGst  = signal('');

  // Searchable transporter combobox (type karke filter)
  transporterFilter = signal('');
  transporterDropdownOpen = signal(false);
  transporterKbIdx = signal(0);
  transporterKey(e: KeyboardEvent) {
    const list = this.filteredTransporters();
    if (!this.transporterDropdownOpen() || list.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.transporterKbIdx.set(Math.min(this.transporterKbIdx() + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.transporterKbIdx.set(Math.max(this.transporterKbIdx() - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const t = list[this.transporterKbIdx()]; if (t) this.selectTransporterFromCombo(t); }
    else if (e.key === 'Escape') { this.transporterDropdownOpen.set(false); }
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
    this.transporterMatchLevel.set('name');
    this.transporterDropdownOpen.set(false);
  }
  onTransporterTyped(v: string) {
    // text khali/badla — selection clear (dobara list se chuno)
    if (!v?.trim()) this.transporterId = '';
  }
  closeTransporterDropdownSoon() { setTimeout(() => this.transporterDropdownOpen.set(false), 200); }
  /** transporterId set hone par display naam sync karo (scan/edit ke baad). */
  private syncTransporterName() {
    const t = this.transporters().find(x => x.id === this.transporterId);
    if (t) this.transporterFilter.set(t.firmName);
  }

  /** Smart matcher — 5 priority levels (GST > full name > prefix > fuzzy > none). */
  private matchTransporter(aiName: string, aiGst: string): { id: string; level: 'gst'|'name'|'prefix'|'none' } {
    const list = this.transporters();
    if (list.length === 0) return { id: '', level: 'none' };

    const cleanGst = (aiGst || '').trim().toUpperCase().replace(/\s/g, '');
    const cleanName = (aiName || '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '');

    // 🥇 LEVEL 1: GST exact match (most reliable)
    if (cleanGst.length >= 15) {
      const byGst = list.find(t => (t.gstNo || '').trim().toUpperCase() === cleanGst);
      if (byGst) return { id: byGst.id, level: 'gst' };
    }

    // 🥈 LEVEL 2: GST prefix (first 7 chars — state + PAN partial)
    if (cleanGst.length >= 7) {
      const byGstPfx = list.find(t => (t.gstNo || '').trim().toUpperCase().startsWith(cleanGst.substring(0, 7)));
      if (byGstPfx) return { id: byGstPfx.id, level: 'gst' };
    }

    if (!cleanName) return { id: '', level: 'none' };

    // 🥉 LEVEL 3: full name exact (case-insensitive)
    const byName = list.find(t => (t.firmName || '').trim().toUpperCase() === cleanName);
    if (byName) return { id: byName.id, level: 'name' };

    // 4️⃣ LEVEL 4: name prefix (first 5 chars)
    const prefix = cleanName.substring(0, Math.min(5, cleanName.length));
    const prefixMatches = list.filter(t => (t.firmName || '').trim().toUpperCase().startsWith(prefix));
    if (prefixMatches.length === 1) return { id: prefixMatches[0].id, level: 'prefix' };

    // 4b: fuzzy contains
    const contains = list.find(t =>
      (t.firmName || '').trim().toUpperCase().includes(prefix)
      || cleanName.includes((t.firmName || '').trim().toUpperCase().substring(0, 5))
    );
    if (contains) return { id: contains.id, level: 'prefix' };

    // 5️⃣ no match
    return { id: '', level: 'none' };
  }

  transporterMatchIcon = () => {
    const lvl = this.transporterMatchLevel();
    return lvl === 'gst' ? '🥇' : lvl === 'name' ? '🥉' : lvl === 'prefix' ? '🤖' : '⚠️';
  };
  transporterMatchHint = () => {
    const lvl = this.transporterMatchLevel();
    return lvl === 'gst'    ? 'Matched by GST — 100% accurate'
         : lvl === 'name'   ? 'Matched by exact name'
         : lvl === 'prefix' ? 'AI suggested (name prefix match)'
         : 'No transporter found in master';
  };

  /** Selected transporter — GST/Mobile display ke liye. */
  selTransporter(): Transporter | undefined {
    return this.transporters().find(t => t.id === this.transporterId);
  }

  /** Open Quick Add Transporter — pura form modal (AI naam/GST prefill ke saath). */
  showAddTransporter = signal(false);
  quickAddTransporter() { this.showAddTransporter.set(true); }
  onTransporterCreated(t: any) {
    this.transporters.update(arr => [t, ...arr]);
    this.transporterId = t.id;
    this.transporterFilter.set(t.firmName || '');
    this.transporterMatchLevel.set('name');
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

  // ============ COMPUTED TOTALS ============
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

  grossAmt = computed(() => {
    return this.lines().reduce((s, _, i) => s + this.lineTaxable(i), 0);
  });
  cdAmount = computed(() => {
    if (!this.cdEnabled()) return 0;
    const override = this.cdAmountOverride();
    if (override !== null) return override;
    // Fold Less ke baad wale balance par CD lagta hai
    const base = this.cdType() === 'after'
      ? this.baseAfterFold() + this.sgstTotal() + this.cgstTotal() + this.igstTotal()
      : this.baseAfterFold();
    return +(base * (this.cdPct() / 100)).toFixed(2);
  });

  /** Before-GST: tax (gross − fold − discounts) base par — proportional factor. */
  cdTaxFactor = computed(() => {
    const gross = this.grossAmt();
    if (gross <= 0) return 1;
    if (this.cdType() !== 'before') {
      // After-GST me bhi FOLD to base me se pehle hi katta hai
      return Math.max(0, (gross - this.foldAmt()) / gross);
    }
    return Math.max(0, (gross - this.foldAmt() - this.allDiscAmt()) / gross);
  });
  effSgst = computed(() => +(this.sgstTotal() * this.cdTaxFactor()).toFixed(2));
  effCgst = computed(() => +(this.cgstTotal() * this.cdTaxFactor()).toFixed(2));
  effIgst = computed(() => +(this.igstTotal() * this.cdTaxFactor()).toFixed(2));
  toggleCd() {
    this.cdEnabled.set(!this.cdEnabled());
    this.cdAmountOverride.set(null);
  }
  onCdPctChange(val: number) {
    this.cdPct.set(+val || 0);
    this.cdAmountOverride.set(null);
  }
  onCdAmountChange(val: number) {
    this.cdAmountOverride.set(+val || 0);
  }
  taxableAfterCd = computed(() => {
    return this.grossAmt() - this.foldAmt() - this.allDiscAmt() + this.sweetLs() + this.interestAmt()
         + (+this.insuranceAmt() || 0) - (+this.bankCharge() || 0);
  });
  sgstTotal = computed(() => {
    return this.lines().reduce((s, _, i) => {
      const l = this.lines()[i];
      return s + this.lineTaxable(i) * (l.sgstPct / 100);
    }, 0);
  });
  cgstTotal = computed(() => {
    return this.lines().reduce((s, _, i) => {
      const l = this.lines()[i];
      return s + this.lineTaxable(i) * (l.cgstPct / 100);
    }, 0);
  });
  igstTotal = computed(() => {
    return this.lines().reduce((s, _, i) => {
      const l = this.lines()[i];
      return s + this.lineTaxable(i) * (l.igstPct / 100);
    }, 0);
  });
  totalTaxable = computed(() => this.lines().reduce((s, _, i) => s + this.lineTaxable(i), 0));
  totalTax = computed(() => this.sgstTotal() + this.cgstTotal() + this.igstTotal());
  totalAmount = computed(() => this.totalTaxable() + this.totalTax());

  /** Indian number-to-words for display in totals + summary. */
  words = amountInWords;
  totalQty = computed(() => this.lines().reduce((s, l) => s + (+l.qty || 0), 0));

  eInvoiceAmt = computed(() => {
    if (this.cdType() === 'after') {
      // GST (fold ke baad) poore par, discount total par
      return this.baseAfterFold() + this.sweetLs() + this.interestAmt() + (+this.insuranceAmt() || 0)
           + this.effSgst() + this.effCgst() + this.effIgst() + (+this.tcsAmt() || 0)
           - this.allDiscAmt() - (+this.bankCharge() || 0);
    }
    // Before GST: discounted base + scaled tax
    return this.taxableAfterCd() + this.effSgst() + this.effCgst() + this.effIgst() + (+this.tcsAmt() || 0);
  });

  /** Net amount = e-Invoice Amt rounded to nearest whole rupee. */
  netAmount = computed(() => Math.round(this.eInvoiceAmt()));

  /** Round-off difference (can be -0.49 to +0.50). Shown as separate line. */
  roundOff = computed(() => +(this.netAmount() - this.eInvoiceAmt()).toFixed(2));

  canSave = computed(() => {
    return !!this.supplierId
        && !!this.buyerId
        && this.eInvoiceAmt() > 0
        && this.lines().some(l => l.itemName && l.qty > 0 && l.rate > 0);
  });

  // ============ LIFECYCLE ============
  editId: string | null = null;
  editMode = false;
  editBillNo = '';   // edit mode me existing BILL ENTRY NO dikhane ke liye
  loadScanUse() {
    this.aiSvc.usage().subscribe({ next: u => this.scanUse.set(u), error: () => {} });
  }

  // Scan Bill kholne se pehle monthly limit check — quota khatam to popup, scanner na khole.
  openScan() {
    const u = this.scanUse();
    if (u && u.quotaMonthly > 0 && u.usedThisMonth >= u.quotaMonthly) {
      alert(`⚠️ Aapki AI scan limit (${u.usedThisMonth}/${u.quotaMonthly}) is mahine khatam ho gayi hai.\n\nAur bill scan karne ke liye Wallet recharge karein ya plan upgrade karein.`);
      return;
    }
    this.showScan.set(true);
  }

  ngOnInit() {
    this.loadScanUse();
    this.svc.listItems().subscribe(i => this.items.set(i));
    // Orders dropdown — sirf UN-BILLED orders (billed/cancelled hat jate hain)
    this.svc.listOrders({ size: 100 }).subscribe({
      next: r => this.orders.set(
        r.items.filter(o => !o.isDeleted && o.status !== 'billed' && o.status !== 'cancelled' && o.status !== 'completed')
      ),
      error: () => this.orders.set([])
    });
    this.svc.listTransporters().subscribe({
      next: t => { this.transporters.set(t); this.syncTransporterName(); },
      error: () => this.transporters.set([])    // soft-fail if endpoint missing
    });

    const idParam = this.route.snapshot.paramMap.get('id');

    if (idParam) {
      // Edit mode: load parties FIRST so selects can render the loaded supplier/buyer
      this.editId = idParam;
      this.editMode = true;
      this.svc.listParties().subscribe(parties => {
        this.parties.set(parties);
        this.loadBillForEdit(idParam);
      });
    } else {
      this.svc.listParties().subscribe(p => {
        this.parties.set(p);
        // Orders list ke "Create Bill" button se aaye → order auto-select + auto-fill.
        // (parties load hone ke BAAD chalao taaki supplier/buyer GST/address bhar jayein.)
        const orderIdParam = this.route.snapshot.queryParamMap.get('orderId');
        if (orderIdParam) {
          this.selectedOrderId = orderIdParam;
          this.onOrderSelect(orderIdParam);
        }
      });
    }
  }

  private loadBillForEdit(idParam: string) {
    this.svc.getBill(idParam).subscribe({
        next: (b) => {
          this.billType = b.billType as any;
          this.billDate = b.billDate;
          // ENTRY DATE = jab originally entry hui (createdAt), bill date nahi
          this.recDate = b.createdAt ? String(b.createdAt).substring(0, 10) : b.billDate;
          this.orderNo = b.poNumber || '';
          this.editBillNo = b.billNo || '';   // BILL ENTRY NO — edit me existing no dikhe

          // ALWAYS: bills.party_id = SUPPLIER, bills.buyer_party_id = BUYER.
          // List bhi yahi mapping dikhati hai — isliye form aur list ab match karenge.
          // (Pehle sales bill me legacy-swap partyId ko BUYER bana deta tha → mismatch.)
          this.supplierId = b.partyId || '';
          this.buyerId = b.buyerPartyId || '';

          // Combobox display text + GST/address SEEDHE bill se (parties list me na mile to bhi dikhe)
          this.supplierFilter.set(b.partyName || '');
          this.supplierGstin = b.partyGst || '';
          this.buyerFilter.set(b.buyerName || '');
          this.buyerGstin = b.buyerGst || '';

          // Phir auto-fill (party master se address/phone bhar de, agar party mil jaye)
          // EDIT me discounts master se AUTO-FILL nahi hote — saved % (notes se) hi rehte hain
          this.suppressAutoDisc = true;
          if (this.supplierId) this.onSupplierChange(this.supplierId);
          if (this.buyerId) this.onBuyerChange(this.buyerId);

          // Parse notes back into structured fields.
          // Pieces ab '\n' se jude hain (purane bills me ' | ' se) — dono ke liye [^\n|]+ se rok do.
          const notes = b.notes || '';
          // REMARK = sirf user ka text — known structured prefixes wali lines/pieces hata do
          const knownPrefix = /^(Supplier Bill|Transporter|LR|CD\s|Fold Less|Normal Disc|Exhibition Disc|Bank Charge|Case\/Parcel|Sweet\/L\.S|Interest|Insurance|TCS|Payment Terms|Credit Days)\b/i;
          this.remark = notes
            .split(/\n| \| /)
            .map(s => s.trim())
            .filter(s => s && !knownPrefix.test(s))
            .join('\n');
          // Supplier bill no — pehle DTO se (sahi source), warna notes se regex (legacy)
          const supBillMatch = notes.match(/Supplier Bill:\s*([^\n|]+)/);
          this.supplierBillNo = (b.supplierBillNo || (supBillMatch ? supBillMatch[1].trim() : '')) ?? '';
          // e-Way / transporter / LR — ab DB columns se SEEDHE (notes-regex scraping nahi).
          // Backend Get ab in fields ko BillDetailDto me lautata hai (B3).
          this.ewayBillNo = b.ewayBillNo || '';
          this.ewayBillDate = b.ewayBillDate || '';
          this.transporterId = b.transporterId || '';
          this.lrNo = b.lrNo || '';
          this.lrDate = b.lrDate || '';
          this.syncTransporterName();
          // CD: "CD 2% = ₹500.00"
          const cdMatch = notes.match(/CD\s+([\d.]+)%/);
          if (cdMatch) {
            const pct = +cdMatch[1] || 0;
            this.cdPct.set(pct);
            this.cdEnabled.set(pct > 0);
          }
          // 🧵 Fold Less: "Fold Less 2% = ₹800.00"
          const foldMatch = notes.match(/Fold Less\s+([\d.]+)%/);
          this.foldPct.set(foldMatch ? +foldMatch[1] || 0 : 0);
          this.foldOverride.set(null);
          // 💸 Supplier discounts: "Normal Disc 5% = ₹100.00" / "Exhibition Disc 8% = ₹160.00"
          const ndMatch = notes.match(/Normal Disc\s+([\d.]+)%/);
          this.discNormalPct.set(ndMatch ? +ndMatch[1] || 0 : 0);
          const exMatch = notes.match(/Exhibition Disc\s+([\d.]+)%/);
          this.discExhPct.set(exMatch ? +exMatch[1] || 0 : 0);
          this.discNormalOverride.set(null);
          this.discExhOverride.set(null);
          // Sweet/L.S, Interest, TCS
          const sweetMatch = notes.match(/Sweet\/L\.S:\s*₹?([\d.]+)/);
          if (sweetMatch) this.sweetLs.set(+sweetMatch[1] || 0);
          const bankMatch = notes.match(/Bank Charge:\s*₹?([\d.]+)/);
          if (bankMatch) this.bankCharge.set(+bankMatch[1] || 0);
          const caseMatch = notes.match(/Case\/Parcel:\s*([\d.]+)/);
          if (caseMatch) this.caseParcel = +caseMatch[1] || null;
          const intMatch = notes.match(/Interest:\s*₹?([\d.]+)/);
          if (intMatch) this.interestAmt.set(+intMatch[1] || 0);
          const insMatch = notes.match(/Insurance:\s*₹?([\d.]+)/);
          if (insMatch) this.insuranceAmt.set(+insMatch[1] || 0);

          if (b.lines && b.lines.length > 0) {
            this.lines.set(b.lines.map(l => ({
              itemId: l.itemId || null,
              itemName: l.itemName,
              description: l.description || '',
              hsnSac: l.hsnSac || '',
              qty: l.qty,
              unit: l.unit || 'MTR',
              rate: l.rate,
              rd: l.discountPct || 0,
              sgstPct: (l.taxRate || 5) / 2,
              cgstPct: (l.taxRate || 5) / 2,
              igstPct: 0,
              photoFile: null,
              photoPreview: null
            })));
            this.redistributeGst();
          }
          // Load complete — ab user supplier BADLE to master se discounts fir aayen
          this.suppressAutoDisc = false;
        },
        error: () => alert('❌ Failed to load bill for editing')
      });
  }

  // ============ LINE OPERATIONS ============
  updateLine(idx: number, field: keyof LineRow, value: any) {
    this.lines.update(arr => arr.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }
  addLine() {
    this.lines.update(arr => [...arr, this.newLine()]);
  }
  removeLine(idx: number) {
    this.lines.update(arr => arr.filter((_, i) => i !== idx));
  }
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
  // Description (master) pick → HSN + Unit + rate/tax auto-fill
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
      this.supplierPhone = p.phone ?? '';
    } else {
      this.supplierGstin = ''; this.supplierPan = ''; this.supplierAddress = ''; this.supplierPhone = '';
    }
    this.fillDiscFromMaster(id);   // 💸 master ke discounts % auto-fill
    this.redistributeGst();
  }
  onBuyerChange(id: string) {
    const p = this.parties().find(x => x.id === id);
    if (p) {
      this.buyerFilter.set(p.displayName);      // sync combobox input
      this.buyerGstin = p.gst ?? '';
      this.buyerPan = p.pan ?? '';
      this.buyerAddress = p.city ?? '';
      this.buyerPhone = p.phone ?? '';
      this.buyerCity = p.city ?? '';
    } else {
      this.buyerGstin = ''; this.buyerPan = ''; this.buyerAddress = ''; this.buyerPhone = ''; this.buyerCity = '';
    }
    this.redistributeGst();
  }

  // ============ GST STATE LOGIC (intra vs inter-state) ============
  /** AI scan ne bill se jo ASLI tax type padha (IGST vs CGST/SGST) — state-code se UPAR.
   *  Kyunki kabhi same-state par bhi IGST hota hai (place-of-supply alag). Scan ke time set,
   *  manual party change ya reset par clear. */
  aiGstTypeOverride = signal<'inter' | 'intra' | null>(null);
  /** Scan ne kis item ka rate taxable se nikaala (bill par rate column nahi tha) — warning note. */
  reconcileNote = signal<string>('');
  // Rate-choice popup: jab qty×rate, bill ke taxable se match na kare → user decide kare
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
  /** Compare firm GSTIN state-code (first 2 chars) vs counterparty GSTIN. Default intra-state. */
  isInterState(): boolean {
    // Scan ne bill se jo padha wahi sahi — state-code guess se pehle.
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

  // ============ DOCUMENT UPLOAD ============
  onBillDocUpload(event: any) {
    const file: File = event.target.files?.[0];
    if (!file) return;
    this.billDocFile = file;
    this.billDocName.set(file.name);
  }
  onLrDocUpload(event: any) {
    const file: File = event.target.files?.[0];
    if (!file) return;
    this.lrDocFile = file;
    this.lrDocName.set(file.name);
  }

  /** Remove uploaded bill document — with confirm. */
  deleteBillDoc() {
    if (!confirm(`Delete uploaded bill document "${this.billDocName()}"?`)) return;
    this.billDocFile = null;
    this.billDocName.set('');
  }
  /** Remove uploaded LR / transport document — with confirm. */
  deleteLrDoc() {
    if (!confirm(`Delete uploaded LR document "${this.lrDocName()}"?`)) return;
    this.lrDocFile = null;
    this.lrDocName.set('');
  }

  /** Open the uploaded document in an inline preview modal (image or PDF). */
  previewDoc(which: 'bill' | 'lr') {
    const file = which === 'bill' ? this.billDocFile : this.lrDocFile;
    const name = which === 'bill' ? this.billDocName() : this.lrDocName();
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
    const rawUrl = URL.createObjectURL(file);

    // PDFs need DomSanitizer so iframe doesn't strip blob: URLs
    const safeUrl = isPdf ? this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl) : rawUrl;

    this.docPreviewUrl.set(safeUrl);
    this.docPreviewTitle.set(`${which === 'bill' ? '📎 Bill' : '🚛 LR / Transport'} — ${name}`);
    this.docPreviewType.set(isPdf ? 'pdf' : 'image');
  }
  closeDocPreview() {
    // Revoke the blob URL to free memory (best-effort — if it was a SafeUrl we wrapped)
    const url = this.docPreviewUrl();
    if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
    this.docPreviewUrl.set(null);
    this.docPreviewType.set(null);
    this.docPreviewTitle.set('');
  }

  // ============ AI EXTRACTION ============
  /** AI se aayi date (dd/mm/yyyy ya dd-mm-yyyy) ko <input type=date> ke liye yyyy-mm-dd banao.
   *  Pehle se ISO ho to waise hi. Parse na ho to original (taaki data loss na ho). */
  private toIsoDate(s: string | null | undefined): string {
    const d = (s || '').trim();
    if (!d) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;                         // already ISO
    let m = d.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);        // dd/mm/yyyy
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = d.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);            // yyyy/mm/dd
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return d;
  }
  applyAiExtraction(data: ExtractedBill) {
    this.lastAiFill.set(data);
    this.loadScanUse();   // scan count turant refresh

    if (data.invoice?.date) this.billDate = this.toIsoDate(data.invoice.date) || this.billDate;
    if (data.invoice?.poNumber) this.orderNo = data.invoice.poNumber;
    if (data.invoice?.number) this.supplierBillNo = data.invoice.number;
    // 📦 CASE/PARCEL/BALE — scan se packing count auto-fill
    { const c = +((data.invoice as any)?.cases ?? 0); if (c > 0) this.caseParcel = c; }

    // ============ TAX TYPE — bill se padho (IGST vs CGST/SGST), state-code se UPAR ============
    // Bill par IGST amount hai aur CGST/SGST nahi → inter-state (IGST). Warna intra (CGST+SGST).
    // Ye onSupplierChange/redistributeGst se PEHLE set karna zaroori hai taaki wo isi ko maane.
    {
      // Sabse reliable: dono party ke GSTIN ke STATE-CODE (pehle 2 digit) — alag = IGST.
      // (AI ka totals.igst bharosa-mand nahi, isliye GSTIN states ko authority banaya.)
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
      if (ig > 0 && cg === 0 && sg === 0)  inter = true;   // bill par clearly IGST = final authority
      this.aiGstTypeOverride.set(inter === null ? null : (inter ? 'inter' : 'intra'));
    }

    // 🧵 FOLD LESS — bill par chhapa ho to AI se auto-fill (% pehle, warna sirf amount)
    const foldP = +((data.totals as any)?.foldLessPercent ?? 0);
    const foldA = +((data.totals as any)?.foldLessAmount ?? 0);
    if (foldP > 0) { this.foldPct.set(foldP); this.foldOverride.set(null); }
    else if (foldA > 0) { this.foldPct.set(0); this.foldOverride.set(foldA); }

    // 💸 DISCOUNT (Disc/Disc Less/Less/CD/Vatav...) — AI se CD me auto-fill
    const dP = +((data.totals as any)?.discountPercent ?? 0);
    const dA = +((data.totals as any)?.discountAmount ?? 0);
    if (dP > 0) { this.cdEnabled.set(true); this.cdPct.set(dP); this.cdAmountOverride.set(null); }
    else if (dA > 0) { this.cdEnabled.set(true); this.cdPct.set(0); this.cdAmountOverride.set(dA); }

    // ============ SUPPLIER smart match (5 levels — same as transporter) ============
    if (data.supplier?.name || data.supplier?.gst) {
      const sName = data.supplier?.name ?? '';
      const sGst  = data.supplier?.gst  ?? '';
      const m = this.matchParty(sName, sGst);
      if (m.id) {
        // 🥇 / 🥉 / 🤖 — found in master
        this.supplierId = m.id;
        this.supplierMatchLevel.set(m.level);
        this.onSupplierChange(m.id);
        this.aiSupplier = null;
      } else {
        // ⚠️ NONE — cache + auto-open Quick Add modal pre-filled
        this.supplierMatchLevel.set('none');
        this.aiSupplier = {
          displayName: sName,
          gst: sGst,
          pan: (data.supplier as any)?.pan ?? '',
          phone: data.supplier?.phone ?? '',
          address: data.supplier?.address ?? '',
          city: data.supplier?.city ?? ''
        };
        this.supplierFilter.set(sName);
        this.supplierGstin   = sGst;
        this.supplierPan     = (data.supplier as any)?.pan ?? '';
        this.supplierAddress = data.supplier?.address ?? data.supplier?.city ?? '';
        this.supplierPhone   = data.supplier?.phone ?? '';
        // AUTO-OPEN — user just clicks Save in modal
        setTimeout(() => this.showAddSupplier.set(true), 300);
      }
    }

    // ============ BUYER smart match ============
    if (data.buyer?.name || data.buyer?.gst) {
      const bName = data.buyer?.name ?? '';
      const bGst  = data.buyer?.gst  ?? '';
      const m = this.matchParty(bName, bGst);
      if (m.id) {
        this.buyerId = m.id;
        this.buyerMatchLevel.set(m.level);
        this.onBuyerChange(m.id);
        this.aiBuyer = null;
      } else {
        this.buyerMatchLevel.set('none');
        this.aiBuyer = {
          displayName: bName,
          gst: bGst,
          pan: (data.buyer as any)?.pan ?? '',
          phone: data.buyer?.phone ?? '',
          address: data.buyer?.address ?? '',
          city: data.buyer?.city ?? ''
        };
        this.buyerFilter.set(bName);
        this.buyerGstin   = bGst;
        this.buyerPan     = (data.buyer as any)?.pan ?? '';
        this.buyerAddress = data.buyer?.address ?? '';
        this.buyerPhone   = data.buyer?.phone   ?? '';
        this.buyerCity    = data.buyer?.city    ?? '';
        // AUTO-OPEN — but only if supplier didn't already open (avoid 2 modals stacking)
        if (!this.showAddSupplier()) {
          setTimeout(() => this.showAddBuyer.set(true), 350);
        }
      }
    }

    // Replace lines — AI ke RAW qty/rate hi bharo (app khud decide na kare).
    // Agar qty × rate, bill ke TAXABLE se match na kare → user ko popup me choose karne do.
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

    // Transport
    // Transport / e-Way auto-fill (migration 19 additions)
    if (data.transport?.lrNo)       this.lrNo = data.transport.lrNo;
    if (data.transport?.lrDate)     this.lrDate = this.toIsoDate(data.transport.lrDate);
    if (data.transport?.name)       this.transporter = data.transport.name;
    if ((data.transport as any)?.ewayBillNo) this.ewayBillNo = (data.transport as any).ewayBillNo;
    if ((data.transport as any)?.ewayBillDate) this.ewayBillDate = this.toIsoDate((data.transport as any).ewayBillDate);
    this.syncEwayDate();   // e-Way No hai par date nahi → bill ki date hi e-Way date

    // SMART TRANSPORTER MATCH — GST first, then name
    const tName = data.transport?.name ?? '';
    const tGst  = (data.transport as any)?.gst ?? '';
    if (tName || tGst) {
      this.aiTransporterName.set(tName);
      this.aiTransporterGst.set(tGst);
      const match = this.matchTransporter(tName, tGst);
      if (match.id) {
        this.transporterId = match.id;
        this.syncTransporterName();
        this.transporterMatchLevel.set(match.level);
      } else {
        this.transporterMatchLevel.set('none');
        this.transporterFilter.set(this.aiTransporterName());   // AI ne jo padha wo dikhe
      }
    }

    // SCAN ke baad: is supplier(/buyer) ke PENDING orders hain? To link-popup kholo
    // — taaki staff order select kare aur order auto-BILLED ho (pending na atka rahe).
    this.maybeOfferOrderLink();
  }

  // ============ ORDER LINK POPUP (scan ke baad) ============
  orderLinkOpen = signal(false);
  orderLinkRows = signal<{ id: string; orderNo: string; orderDate: string; items: number; qty: number; total: number }[]>([]);
  orderLinkSel = '';

  private maybeOfferOrderLink() {
    if (this.selectedOrderId || !this.supplierId) return;

    // Unbilled orders me se: same supplier (+ buyer match agar dono jagah hai)
    const candidates = this.orders().filter(o =>
      o.partyId === this.supplierId
      && (!this.buyerId || !o.buyerPartyId || o.buyerPartyId === this.buyerId)
    );
    if (!candidates.length) return;

    // Har candidate ki detail lao (items count + qty dikhane ke liye)
    const rows: { id: string; orderNo: string; orderDate: string; items: number; qty: number; total: number }[] = [];
    let pending = candidates.length;
    for (const c of candidates) {
      this.svc.getOrder(c.id).subscribe({
        next: (od) => {
          rows.push({
            id: c.id,
            orderNo: c.orderNo,
            orderDate: c.orderDate,
            items: od.lines?.length ?? 0,
            qty: (od.lines ?? []).reduce((s, l) => s + (+l.qty || 0), 0),
            total: +c.total || 0
          });
          if (--pending === 0) {
            rows.sort((a, b) => a.orderNo.localeCompare(b.orderNo));
            this.orderLinkRows.set(rows);
            this.orderLinkSel = rows.length === 1 ? rows[0].id : '';
            this.orderLinkOpen.set(true);
          }
        },
        error: () => {
          rows.push({ id: c.id, orderNo: c.orderNo, orderDate: c.orderDate, items: 0, qty: 0, total: +c.total || 0 });
          if (--pending === 0) { this.orderLinkRows.set(rows); this.orderLinkOpen.set(true); }
        }
      });
    }
  }

  /** WhatsApp kholo — number ke last 10 digit par (91 ke saath) */
  openWhatsApp(phone: string | null | undefined) {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return;
    const ten = digits.length > 10 ? digits.slice(-10) : digits;
    window.open('https://wa.me/91' + ten, '_blank');
  }

  /** Tick box toggle — ek hi order link ho sakta hai, dobara tick = untick */
  toggleOrderLinkSel(id: string) {
    this.orderLinkSel = this.orderLinkSel === id ? '' : id;
  }

  /** "net90" / "Net 90 Days" → 90. Advance/COD → 0. Pata na chale to null. */
  private termsToDays(terms: string | null | undefined): number | null {
    if (!terms) return null;
    const t = terms.toLowerCase();
    if (t.includes('advance') || t.includes('cod') || t.includes('cash')) return 0;
    const m = t.match(/(\d+)/);
    return m ? +m[1] : null;
  }

  /** Payment terms dropdown badla → days bhi update */
  onTermsChange() {
    const d = this.termsToDays(this.paymentTerms);
    if (d !== null) this.days = d;
  }

  /** Dropdown value → readable text (notes/print ke liye) */
  private termsLabel(t: string): string {
    const map: Record<string, string> = {
      advance: 'Advance Payment', net15: 'Net 15 Days', net30: 'Net 30 Days',
      net45: 'Net 45 Days', net60: 'Net 60 Days', net90: 'Net 90 Days',
      cod: 'COD', loa: 'LOA'
    };
    return map[t] || t;
  }

  /** Staff ne order tick kiya — bill ko us order se jodo (save par order auto-BILLED). */
  linkSelectedOrder() {
    const row = this.orderLinkRows().find(r => r.id === this.orderLinkSel);
    if (!row) { this.orderLinkOpen.set(false); return; }
    this.selectedOrderId = row.id;
    this.orderNo = row.orderNo;
    this.orderLinkOpen.set(false);
    // Order ki payment terms + transporter bill me bhi lao (scan wala data preserve)
    this.svc.getOrder(row.id).subscribe({
      next: (od) => {
        if (od.paymentTerms) { this.paymentTerms = od.paymentTerms; this.onTermsChange(); }
        if (od.transporterId && !this.transporterId) { this.transporterId = od.transporterId; this.syncTransporterName(); }
      },
      error: () => {}
    });
    this.toast.success(`Bill order ${row.orderNo} se jud gaya — save par order BILLED ho jayega`);
  }

  // ============ NEW ENTRY ============
  /** "+ New Bill Entry" — form ko 100% fresh karo. Edit-mode/scan/party-name sab clear ho jaye.
   *  Agar abhi edit URL par hain to /new par jao; warna component ko dobara load karke
   *  bilkul khaali form do (navigate-away-and-back trick). */
  newEntry() {
    this.reset();
    this.router.navigateByUrl('/trading/bills', { skipLocationChange: true })
      .then(() => this.router.navigate(['/trading/bills/new']));
  }

  // ============ RESET / PREVIEW ============
  reset() {
    // Edit/scan/order-link state bhi clear — warna purana data atka rehta hai
    this.editMode = false; this.editId = null;
    this.selectedOrderId = ''; this.editBillNo = '';
    this.lastAiFill.set(null); this.duplicateBill.set(null);
    this.supplierFilter.set(''); this.buyerFilter.set('');
    this.billDate = todayLocal(); this.recDate = todayLocal();
    this.lines.set([this.newLine()]);
    this.supplierId = ''; this.buyerId = '';
    this.supplierGstin = ''; this.supplierAddress = ''; this.supplierPhone = '';
    this.buyerCity = ''; this.buyerGstin = ''; this.buyerAddress = ''; this.buyerPhone = '';
    this.orderNo = ''; this.supplierBillNo = '';
    this.paymentTerms = ''; this.days = 45;
    this.cdPct.set(0); this.cdAmountOverride.set(null); this.cdEnabled.set(true);
    this.discNormalPct.set(0); this.discNormalOverride.set(null);
    this.discExhPct.set(0); this.discExhOverride.set(null);
    this.suppressAutoDisc = false;
    this.bankCharge.set(0); this.caseParcel = null;
    this.foldPct.set(0); this.foldOverride.set(null);
    this.sweetLs.set(0); this.interestAmt.set(0); this.insuranceAmt.set(0); this.tcsAmt.set(0);
    this.lrNo = ''; this.lrDate = ''; this.transporter = ''; this.transporterId = ''; this.transporterFilter.set('');
    this.ewayBillNo = ''; this.ewayBillDate = ''; this.transporterMatchLevel.set(null);
    this.aiTransporterName.set(''); this.aiTransporterGst.set('');
    this.supplierMatchLevel.set(null); this.buyerMatchLevel.set(null);
    this.aiSupplier = null; this.aiBuyer = null;
    this.aiGstTypeOverride.set(null);   // GST type override bhi clear
    this.reconcileNote.set('');
    this.rateChoiceItems.set([]); this.rateChoiceOpen.set(false);
    this.remark = '';
    this.billDocName.set(''); this.billDocFile = null;
    this.lrDocName.set(''); this.lrDocFile = null;
    this.submitted.set(false);
    this.error.set('');
  }

  preview() {
    alert(`📄 Preview\n\nSupplier: ${this.parties().find(p => p.id === this.supplierId)?.displayName ?? '—'}\nBuyer: ${this.parties().find(p => p.id === this.buyerId)?.displayName ?? '—'}\nItems: ${this.lines().filter(l => l.itemName).length}\nGross: ₹${this.grossAmt().toFixed(2)}\nBill Amt: ₹${this.eInvoiceAmt().toFixed(2)}\n\n(Full PDF preview coming soon)`);
  }

  /** e-Way Bill No diya hai par e-Way date khali → bill ki date hi e-Way date maan lo. */
  syncEwayDate() {
    if (this.ewayBillNo?.trim() && !this.ewayBillDate && this.billDate) {
      this.ewayBillDate = this.billDate;
    }
  }

  // ============ SAVE ============
  save() {
    this.submitted.set(true);    // turn on red borders / hint for missing fields
    this.linkPartiesFromMaster(); // GST/PAN se existing party link → duplicate na bane
    const missing: string[] = [];
    if (!this.supplierId)                missing.push('SUPPLIER (top)');
    if (!this.buyerId)                   missing.push('BUYER (top)');
    if (!this.supplierBillNo?.trim())    missing.push('SUPPLIER BILL NO. (required for duplicate detection)');
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

    const validLines: BillLine[] = this.lines()
      .filter(l => l.itemName && l.qty > 0 && l.rate > 0)
      .map((l, idx) => ({
        itemId: l.itemId,
        itemName: l.itemName,
        description: l.description || null,
        hsnSac: l.hsnSac || null,
        qty: l.qty,
        unit: l.unit,
        rate: l.rate,
        discountPct: 0,
        taxRate: l.sgstPct + l.cgstPct + l.igstPct,
        taxableAmount: this.lineTaxable(idx),
        totalAmount: this.lineTotal(idx)
      }));

    // NEW (post-migration 18): bills.party_id = SUPPLIER, bills.buyer_party_id = BUYER.
    // Always send supplier as partyId (goods provider) + buyer as buyerPartyId.
    const partyId = this.supplierId || this.buyerId;        // fallback for purchases without separate supplier
    const buyerPartyId = this.buyerId || null;

    const notes = [
      this.remark,
      this.supplierBillNo ? `Supplier Bill: ${this.supplierBillNo}` : '',
      this.transporter ? `Transporter: ${this.transporter}` : '',
      this.lrNo ? `LR: ${this.lrNo}${this.lrDate ? ' (' + this.lrDate + ')' : ''}` : '',
      this.foldAmt() > 0 ? `Fold Less ${this.foldPct()}% = ₹${this.foldAmt().toFixed(2)}` : '',
      this.cdEnabled() && this.cdPct() > 0 ? `CD ${this.cdPct()}% = ₹${this.cdAmount().toFixed(2)}` : '',
      this.discNormalAmt() > 0 ? `Normal Disc ${this.discNormalPct()}% = ₹${this.discNormalAmt().toFixed(2)}` : '',
      this.discExhAmt() > 0 ? `Exhibition Disc ${this.discExhPct()}% = ₹${this.discExhAmt().toFixed(2)}` : '',
      this.sweetLs() ? `Sweet/L.S: ₹${this.sweetLs()}` : '',
      this.bankCharge() ? `Bank Charge: ₹${this.bankCharge()}` : '',
      this.caseParcel ? `Case/Parcel/Bale: ${this.caseParcel}` : '',
      this.interestAmt() ? `Interest: ₹${this.interestAmt()}` : '',
      this.insuranceAmt() ? `Insurance: ₹${this.insuranceAmt()}` : '',
      this.tcsAmt() ? `TCS: ₹${this.tcsAmt()}` : '',
      this.paymentTerms ? `Payment Terms: ${this.termsLabel(this.paymentTerms)}` : (this.days ? `Credit Days: ${this.days}` : '')
    ].filter(Boolean).join('\n');

    const payload = {
      billType: this.billType,
      billDate: this.billDate,
      partyId,                       // SUPPLIER
      buyerPartyId,                  // BUYER (separate from supplier)
      invoiceType: this.billType,
      poNumber: this.orderNo || undefined,
      orderId: this.selectedOrderId || undefined,   // order auto-BILLED ho jayega
      supplierBillNo: this.supplierBillNo?.trim() || undefined,
      deliveryDate: this.lrDate || undefined,
      ewayBillNo: this.ewayBillNo?.trim() || undefined,
      // e-Way No diya hai par date khali → bill ki date hi e-Way date
      ewayBillDate: (this.ewayBillDate?.trim() || (this.ewayBillNo?.trim() ? this.billDate : '')) || undefined,
      transporterId: this.transporterId || undefined,
      lrNo: this.lrNo?.trim() || undefined,
      lrDate: this.lrDate || undefined,
      // Fold Less + CD + Normal + Exhibition — backend isi total se tax-factor aur net nikalta hai
      discount: this.foldAmt() + this.allDiscAmt(),
      // Sweet/L.S + Interest + Insurance + TCS − Bank Charge — backend total me bhi jude
      // (pehle sirf notes me jate the → list ka total entry screen se alag dikhta tha)
      otherCharges: this.sweetLs() + this.interestAmt() + (+this.insuranceAmt() || 0)
                  + (+this.tcsAmt() || 0) - (+this.bankCharge() || 0),
      cdType: this.cdType(),
      roundOff: this.roundOff(),
      notes: notes || undefined,
      lines: validLines
    };

    // EDIT mode: in-place update (Bill no + voucher same rehte hain, renumber nahi)
    if (this.editMode && this.editId) {
      this.svc.updateBill(this.editId, payload as any).subscribe({
        next: (b) => {
          this.toast.success(`Bill ${b.billNo} update ho gaya!`);
          this.router.navigate(['/trading/bills']);
        },
        error: (e) => {
          this.error.set(e?.error?.error ?? 'Failed to update bill.');
          this.saving.set(false);
        }
      });
      return;
    }

    // CREATE mode
    this.svc.createBill(payload).subscribe({
      next: (b) => {
        this.toast.success(`Bill ${b.billNo} successfully save ho gaya! Voucher ${b.voucherNo ?? '(pending)'} accounting me post ho gaya.`);
        this.router.navigate(['/trading/bills']);
      },
      error: (e) => {
        // 409 Conflict → DUPLICATE_BILL — show structured modal
        if (e?.status === 409 && e?.error?.error === 'DUPLICATE_BILL') {
          this.duplicateBill.set(e.error.existing);
          this.saving.set(false);
          return;
        }
        this.error.set(e?.error?.error ?? 'Failed to save bill. Please check all required fields.');
        this.saving.set(false);
      }
    });
  }

  /** Duplicate bill modal state. */
  duplicateBill = signal<{ id: string; billNo: string; billDate: string; total: number; status: string } | null>(null);
  closeDuplicateModal() { this.duplicateBill.set(null); }
  viewDuplicateBill() {
    const dup = this.duplicateBill();
    if (dup) this.router.navigate(['/trading/bills', dup.id, 'edit']);
  }
}
