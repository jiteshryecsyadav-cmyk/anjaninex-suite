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
          <button type="button" (click)="showScan.set(true)" class="bh-btn-ai">
            🤖 Scan Bill
            @if (scanUse(); as u) {
              <span style="background:rgba(255,255,255,.25);border-radius:10px;padding:1px 8px;font-size:10px;margin-left:6px">
                {{ u.usedThisMonth }}{{ u.quotaMonthly ? '/' + u.quotaMonthly : '' }} is month
                @if (u.lastScanAt) { · last: {{ u.lastScanAt }} }
              </span>
            }
          </button>
          <a routerLink="/trading/bills" class="bh-btn-list">📄 Bill List</a>
          <button type="button" (click)="reset()" class="bh-btn-new">+ New Bill Entry</button>
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
            <label class="lbl">E-INVOICE TYPE *</label>
            <select [(ngModel)]="billType" class="ip">
              <option value="sales">Sales</option>
              <option value="purchase">Purchase</option>
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
                @for (o of orders(); track o.id) {
                  <option [value]="o.id">{{ o.orderNo }} — {{ o.partyName }} (₹{{ o.total | number:'1.0-0' }})</option>
                }
              </select>
            }
          </div>
          <div>
            <label class="lbl">SUPPLIER BILL NO. (E-INVOICE NO) <span style="color:#dc2626;font-weight:800">*</span></label>
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
              @if (supplierId) {
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
              @if (buyerId) {
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

        <div class="item-table-wrap mt-2">
          <table class="item-table">
            <thead>
              <tr>
                <th class="w-10">SNO.</th>
                <th>ITEM NAME</th>
                <th>DESCRIPTION</th>
                <th class="w-16">QTY.</th>
                <th class="w-20">UNIT</th>
                <th class="w-20">PRICE</th>
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
                  <td data-label="Description">
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
                      <option value="MTR">MTR</option>
                      <option value="PCS">PCS</option>
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

            <div>
              <label class="lbl">SWEET / L.S</label>
              <input [(ngModel)]="sweetLs" type="number" step="0.01" class="ip">
            </div>
            <div>
              <label class="lbl">INTEREST AMT</label>
              <input [(ngModel)]="interestAmt" type="number" step="0.01" class="ip">
            </div>
            <div>
              <label class="lbl">INSURANCE</label>
              <input [(ngModel)]="insuranceAmt" type="number" step="0.01" class="ip">
            </div>
            <div>
              <label class="lbl">TAXABLE AMT *</label>
              <input type="text" disabled [value]="'₹ ' + (taxableAfterCd() | number:'1.2-2')" class="ip ip-auto">
            </div>

            <div>
              <label class="lbl">SGST AMT</label>
              <input type="text" disabled [value]="'₹ ' + (sgstTotal() | number:'1.2-2')" class="ip ip-auto">
            </div>
            <div>
              <label class="lbl">CGST AMT</label>
              <input type="text" disabled [value]="'₹ ' + (cgstTotal() | number:'1.2-2')" class="ip ip-auto">
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
              <input [(ngModel)]="tcsAmt" type="number" step="0.01" class="ip">
            </div>
            <div>
              <label class="lbl">E-INVOICE AMT *</label>
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
                         (ngModelChange)="transporterFilter.set($event); transporterDropdownOpen.set(true); onTransporterTyped($event)"
                         (focus)="transporterDropdownOpen.set(true)"
                         (blur)="closeTransporterDropdownSoon()"
                         placeholder="🔍 Transporter name ya GST se search..." class="ip flex-1">
                  <button type="button" (click)="quickAddTransporter()"
                          class="px-3 rounded-lg text-xs font-bold bg-anjaninex-navy text-white hover:bg-[#2a4178] whitespace-nowrap"
                          title="Naya transporter add karo">+ New</button>
                </div>
                @if (transporterDropdownOpen() && filteredTransporters().length > 0) {
                  <div class="combo-dropdown">
                    @for (t of filteredTransporters(); track t.id) {
                      <div class="combo-option" (mousedown)="selectTransporterFromCombo(t)">
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
            <div class="sum-row">
              <span>Disc. Amount</span>
              <span class="font-mono text-red-600">- ₹ {{ cdAmount() | number:'1.2-2' }}</span>
            </div>
            <div class="sum-row">
              <span>Sweet / L.s</span>
              <span class="font-mono">₹ {{ sweetLs | number:'1.2-2' }}</span>
            </div>
            <div class="sum-row">
              <span>Interest</span>
              <span class="font-mono">₹ {{ interestAmt | number:'1.2-2' }}</span>
            </div>
            <div class="sum-row">
              <span>Insurance</span>
              <span class="font-mono">₹ {{ insuranceAmt | number:'1.2-2' }}</span>
            </div>
            <div class="sum-row">
              <span>Taxable Amt</span>
              <span class="font-mono">₹ {{ taxableAfterCd() | number:'1.2-2' }}</span>
            </div>
            <div class="sum-divider"></div>
            @if (isInterState()) {
              <div class="sum-row">
                <span>IGST</span>
                <span class="font-mono">₹ {{ totalTax() | number:'1.2-2' }}</span>
              </div>
            } @else {
              <div class="sum-row">
                <span>SGST</span>
                <span class="font-mono">₹ {{ sgstTotal() | number:'1.2-2' }}</span>
              </div>
              <div class="sum-row">
                <span>CGST</span>
                <span class="font-mono">₹ {{ cgstTotal() | number:'1.2-2' }}</span>
              </div>
            }
            <div class="sum-row">
              <span>TCS</span>
              <span class="font-mono">₹ {{ tcsAmt | number:'1.2-2' }}</span>
            </div>
            <div class="sum-divider"></div>
            <div class="sum-row">
              <span>e-Invoice Amt</span>
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
              <span>Total Tax</span>
              <span class="font-mono">₹ {{ totalTax() | number:'1.2-2' }}</span>
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

  /** Order select → puri order detail auto-fill (supplier, buyer, items, CD).
      AI scan ki zaroorat nahi — order se hi bill ban jata hai. */
  onOrderSelect(id: string) {
    if (!id) { this.orderNo = ''; return; }
    this.svc.getOrder(id).subscribe({
      next: (od) => {
        this.orderNo = od.orderNo;

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
  filteredSuppliers = computed(() => this.matchParties(this.supplierFilter()).slice(0, 8));
  filteredBuyers = computed(() => this.matchParties(this.buyerFilter()).slice(0, 8));

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
    this.supplierId = p.id;
    this.supplierFilter.set(p.displayName);
    this.supplierDropdownOpen.set(false);
    this.onSupplierChange(p.id);
  }
  selectBuyerFromCombo(p: Party) {
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
  }
  sweetLs = 0;
  interestAmt = 0;
  insuranceAmt = 0;   // INSURANCE — additive charge (taxable me jud kar net me)
  paymentTerms = '';   // order jaisa hi dropdown (net15/net30/.../advance/cod/loa)
  days = 45;           // internal — terms se derive hota hai (due/remark ke liye)
  tcsAmt = 0;
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
    const base = this.cdType() === 'after'
      ? this.grossAmt() + this.sgstTotal() + this.cgstTotal() + this.igstTotal()   // GST samet total par
      : this.grossAmt();                                        // sirf taxable par
    return +(base * (this.cdPct() / 100)).toFixed(2);
  });

  /** Before-GST: tax discounted base par — proportional factor. */
  cdTaxFactor = computed(() => {
    if (!this.cdEnabled() || this.cdType() !== 'before') return 1;
    const gross = this.grossAmt();
    if (gross <= 0) return 1;
    return Math.max(0, (gross - this.cdAmount()) / gross);
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
    return this.grossAmt() - this.cdAmount() + this.sweetLs + this.interestAmt + (+this.insuranceAmt || 0);
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
      // GST poore par, discount total par
      return this.grossAmt() + this.sweetLs + this.interestAmt + (+this.insuranceAmt || 0)
           + this.sgstTotal() + this.cgstTotal() + this.igstTotal() + (+this.tcsAmt || 0)
           - this.cdAmount();
    }
    // Before GST: discounted base + scaled tax
    return this.taxableAfterCd() + this.effSgst() + this.effCgst() + this.effIgst() + (+this.tcsAmt || 0);
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
      this.svc.listParties().subscribe(p => this.parties.set(p));
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
          if (this.supplierId) this.onSupplierChange(this.supplierId);
          if (this.buyerId) this.onBuyerChange(this.buyerId);

          // Parse notes back into structured fields.
          // Pieces ab '\n' se jude hain (purane bills me ' | ' se) — dono ke liye [^\n|]+ se rok do.
          const notes = b.notes || '';
          // REMARK = sirf user ka text — known structured prefixes wali lines/pieces hata do
          const knownPrefix = /^(Supplier Bill|Transporter|LR|CD\s|Sweet\/L\.S|Interest|TCS|Payment Terms|Credit Days)\b/i;
          this.remark = notes
            .split(/\n| \| /)
            .map(s => s.trim())
            .filter(s => s && !knownPrefix.test(s))
            .join('\n');
          // Supplier bill no — pehle DTO se (sahi source), warna notes se regex (legacy)
          const supBillMatch = notes.match(/Supplier Bill:\s*([^\n|]+)/);
          this.supplierBillNo = (b.supplierBillNo || (supBillMatch ? supBillMatch[1].trim() : '')) ?? '';
          const transMatch = notes.match(/Transporter:\s*([^\n|]+)/);
          this.transporter = transMatch ? transMatch[1].trim() : '';
          const lrMatch = notes.match(/LR:\s*([^\s\(|]+)\s*\(?([\d-]*)\)?/);
          this.lrNo = lrMatch ? lrMatch[1].trim() : '';
          this.lrDate = lrMatch && lrMatch[2] ? lrMatch[2].trim() : '';
          // E-Way bill no/date — structured fields from the loaded bill (if present)
          this.ewayBillNo = (b as any).ewayBillNo || '';
          this.ewayBillDate = (b as any).ewayBillDate || '';
          // CD: "CD 2% = ₹500.00"
          const cdMatch = notes.match(/CD\s+([\d.]+)%/);
          if (cdMatch) {
            const pct = +cdMatch[1] || 0;
            this.cdPct.set(pct);
            this.cdEnabled.set(pct > 0);
          }
          // Sweet/L.S, Interest, TCS
          const sweetMatch = notes.match(/Sweet\/L\.S:\s*₹?([\d.]+)/);
          if (sweetMatch) this.sweetLs = +sweetMatch[1] || 0;
          const intMatch = notes.match(/Interest:\s*₹?([\d.]+)/);
          if (intMatch) this.interestAmt = +intMatch[1] || 0;
          const insMatch = notes.match(/Insurance:\s*₹?([\d.]+)/);
          if (insMatch) this.insuranceAmt = +insMatch[1] || 0;

          if (b.lines && b.lines.length > 0) {
            this.lines.set(b.lines.map(l => ({
              itemId: l.itemId || null,
              itemName: l.itemName,
              description: '',
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
  /** Compare firm GSTIN state-code (first 2 chars) vs counterparty GSTIN. Default intra-state. */
  isInterState(): boolean {
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
  applyAiExtraction(data: ExtractedBill) {
    this.lastAiFill.set(data);
    this.loadScanUse();   // scan count turant refresh

    if (data.invoice?.date) this.billDate = data.invoice.date;
    if (data.invoice?.poNumber) this.orderNo = data.invoice.poNumber;
    if (data.invoice?.number) this.supplierBillNo = data.invoice.number;

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

    // Replace lines
    if (data.items?.length) {
      this.lines.set(data.items.map(item => {
        const half = (item.taxRate || 5) / 2;
        return {
          itemId: null,
          itemName: item.name,
          description: '',
          hsnSac: item.hsnSac,
          qty: item.qty,
          unit: item.unit || 'MTR',
          rate: item.rate,
          rd: 0,
          sgstPct: half,
          cgstPct: half,
          igstPct: 0,
          photoFile: null,
          photoPreview: null
        };
      }));
      this.redistributeGst();
    }

    // Transport
    // Transport / e-Way auto-fill (migration 19 additions)
    if (data.transport?.lrNo)       this.lrNo = data.transport.lrNo;
    if (data.transport?.lrDate)     this.lrDate = data.transport.lrDate;
    if (data.transport?.name)       this.transporter = data.transport.name;
    if ((data.transport as any)?.ewayBillNo) this.ewayBillNo = (data.transport as any).ewayBillNo;
    if ((data.transport as any)?.ewayBillDate) this.ewayBillDate = (data.transport as any).ewayBillDate;
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

  // ============ RESET / PREVIEW ============
  reset() {
    this.lines.set([this.newLine()]);
    this.supplierId = ''; this.buyerId = '';
    this.supplierGstin = ''; this.supplierAddress = ''; this.supplierPhone = '';
    this.buyerCity = ''; this.buyerGstin = ''; this.buyerAddress = ''; this.buyerPhone = '';
    this.orderNo = ''; this.supplierBillNo = '';
    this.paymentTerms = ''; this.days = 45;
    this.cdPct.set(0); this.cdAmountOverride.set(null); this.cdEnabled.set(true);
    this.sweetLs = 0; this.interestAmt = 0; this.insuranceAmt = 0; this.tcsAmt = 0;
    this.lrNo = ''; this.lrDate = ''; this.transporter = ''; this.transporterId = ''; this.transporterFilter.set('');
    this.ewayBillNo = ''; this.ewayBillDate = ''; this.transporterMatchLevel.set(null);
    this.aiTransporterName.set(''); this.aiTransporterGst.set('');
    this.supplierMatchLevel.set(null); this.buyerMatchLevel.set(null);
    this.aiSupplier = null; this.aiBuyer = null;
    this.remark = '';
    this.billDocName.set(''); this.billDocFile = null;
    this.lrDocName.set(''); this.lrDocFile = null;
    this.submitted.set(false);
    this.error.set('');
  }

  preview() {
    alert(`📄 Preview\n\nSupplier: ${this.parties().find(p => p.id === this.supplierId)?.displayName ?? '—'}\nBuyer: ${this.parties().find(p => p.id === this.buyerId)?.displayName ?? '—'}\nItems: ${this.lines().filter(l => l.itemName).length}\nGross: ₹${this.grossAmt().toFixed(2)}\nE-Invoice Amt: ₹${this.eInvoiceAmt().toFixed(2)}\n\n(Full PDF preview coming soon)`);
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
      this.cdEnabled() && this.cdPct() > 0 ? `CD ${this.cdPct()}% = ₹${this.cdAmount().toFixed(2)}` : '',
      this.sweetLs ? `Sweet/L.S: ₹${this.sweetLs}` : '',
      this.interestAmt ? `Interest: ₹${this.interestAmt}` : '',
      this.insuranceAmt ? `Insurance: ₹${this.insuranceAmt}` : '',
      this.tcsAmt ? `TCS: ₹${this.tcsAmt}` : '',
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
      discount: this.cdAmount(),
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
