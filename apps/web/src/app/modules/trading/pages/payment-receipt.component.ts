import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TradingService, Party, BillListItem } from '../services/trading.service';
import { environment } from '../../../../environments/environment';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { amountInWords } from '../../../shared/amount-in-words.util';
import { todayLocal, toLocalYmd } from '../../../shared/date.util';
import { ToastService } from '../../../shared/toast.service';
import { InDatePipe } from '../../../shared/in-date.pipe';
import { InvoicePreviewComponent, PreviewData } from '../../../shared/invoice-preview.component';
import { FeatureService } from '../../../shared/feature.service';

interface PayTxn {
  mode: 'Cheque' | 'NEFT' | 'RTGS' | 'UPI' | 'Cash';
  bankName: string;
  refNo: string;
  date: string;
  amount: number;
}

interface BillRow {
  selected: boolean;
  billId: string;
  billNo: string;
  dispNo?: string;   // display ke liye SUPPLIER ka bill no (internal fallback)
  date: string;
  type: string;
  netAmt: number;
  taxAmt: number;
  grAmt: number;       // gross
  rateDiff: number;
  disPct: number;
  disAmt: number;
  interest: number;
  adjAmt: number;
  packing: number;     // packing charge deduction
  other: number;       // other deduction
  gstMode: 'before' | 'after';  // deductions GST se pehle (taxable par) ya baad me (total par)
  entitledDisc: number;// buyer group ka banta-hua disc% (bill date ke hisaab se) — popup ke liye
  entitledDiscAmount: number; // ^ wahi % rupees me (backend, sahi base par) — popup ke liye
  baseNet: number;     // bill ka apna NET (grand total − GR, round-off bill-time se) — deductions isi par
  toPay: number;       // computed
  pending: number;
  commAmt: number;
  payTermsDays: number;
  dueDate: string;     // computed: billDate + payTermsDays
  actualDays: number;  // computed: receiptDate - billDate
  earlyLate: number;   // negative=early, positive=late
  status: 'pending' | 'on-time' | 'early' | 'late';
}

interface PartyBehavior {
  orders: number;
  returnRate: number;
  extraMaal: number;
  avgPayDays: number;
  onTimePct: number;
  rating: string;
  badge: string;
  badgeColor: string;
}

@Component({
  selector: 'app-payment-receipt',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent, InDatePipe, InvoicePreviewComponent],
  template: `
    <!-- 🚨 Group-disc blinking alert -->
    @if (discAlert()) {
      <div class="disc-alert-overlay" (click)="discAlert.set('')">
        <div class="disc-alert-box" (click)="$event.stopPropagation()">
          <div class="disc-alert-light">🚨</div>
          <div class="disc-alert-msg">{{ discAlert() }}</div>
          <button class="disc-alert-ok" (click)="discAlert.set('')">OK</button>
        </div>
      </div>
    }
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <!-- ============ HEADER ============ -->
      <div class="rcpt-header">
        <div class="rh-left">
          <img src="anjaninex-logo.jpeg" alt="Anjaninex" class="rh-logo">
          <div>
            <h2 class="rh-title">🪙 Payment Receipt</h2>
            <p class="rh-sub">Details of Received Amount</p>
          </div>
        </div>
        <div class="rh-right">
          <span class="rh-vno">V No: {{ vNo() || '—' }}</span>
        </div>
      </div>

      <!-- ============ SECTION 1: RECEIPT INFORMATION ============ -->
      <div class="section-card">
        <div class="section-head">
          <span class="sec-ico">🧾</span> RECEIPT INFORMATION
        </div>

        <div class="grid grid-cols-3 gap-4 mt-3">
          <div>
            <label class="lbl">COMPANY *</label>
            <select [(ngModel)]="company" class="ip">
              <option value="">— Select Company —</option>
              <option value="namokara">{{ features.firmName() || 'Anjaninex' }}{{ features.firmGst() ? '-' + features.firmGst() : '' }}</option>
            </select>
          </div>
          <div>
            <label class="lbl">V NO.</label>
            <input [(ngModel)]="manualVNo" type="text" placeholder="Auto / Manual" class="ip">
          </div>
          <div>
            <label class="lbl">RECEIPT DATE *</label>
            <input [(ngModel)]="receiptDate" type="date" (change)="recalcAllBills()" class="ip">
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
                     placeholder="🔍 Name ya GST No se search..." class="ip">
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
            <label class="lbl">CURR. BALANCE (SUPPLIER)</label>
            <div class="bal-row">
              <input type="text" disabled [value]="(supplierBalance() | number:'1.2-2') || '0.00'" class="ip ip-bal">
              <span class="bal-tag" [class.cr]="supplierBalance() <= 0" [class.dr]="supplierBalance() > 0">
                {{ supplierBalance() > 0 ? 'DR' : 'CR' }}
              </span>
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
                     placeholder="🔍 Name ya GST No se search..." class="ip">
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
        </div>

        <!-- BEHAVIOR CARDS -->
        <div class="grid grid-cols-2 gap-4 mt-4">
          <!-- Supplier card -->
          <div class="behav-card supplier-card">
            <div class="bc-head">
              <span class="bc-ico-sup">📦</span> SUPPLIER BEHAVIOUR
            </div>
            <div class="bc-body">
              <div class="bc-avatar bc-avatar-sup">
                {{ (supplier()?.displayName?.[0] || 'S').toUpperCase() }}
              </div>
              <div class="bc-info">
                <div class="bc-name">{{ supplier()?.displayName || 'Supplier' }}</div>
                <div class="bc-rating">
                  <span class="rate-badge">{{ supplierBehavior().rating }}</span>
                  <span class="stars">★★★★★</span>
                </div>
              </div>
              <div class="bc-stats">
                <div class="stat">
                  <div class="stat-num">{{ supplierBehavior().orders }}</div>
                  <div class="stat-lbl">Orders</div>
                </div>
                <div class="stat">
                  <div class="stat-num" style="color:#10B981">{{ supplierBehavior().returnRate }}%</div>
                  <div class="stat-lbl">Return Rate</div>
                </div>
                <div class="stat">
                  <div class="stat-num">{{ supplierBehavior().extraMaal }}</div>
                  <div class="stat-lbl">Extra Maal</div>
                </div>
              </div>
            </div>
            <div class="bc-badge" [class]="supplierBehavior().badgeColor">
              ✅ {{ supplierBehavior().badge }}
            </div>
          </div>

          <!-- Buyer card -->
          <div class="behav-card buyer-card">
            <div class="bc-head">
              <span class="bc-ico-buy">🛒</span> BUYER BEHAVIOUR
            </div>
            <div class="bc-body">
              <div class="bc-avatar bc-avatar-buy">
                {{ (buyer()?.displayName?.[0] || 'B').toUpperCase() }}
              </div>
              <div class="bc-info">
                <div class="bc-name">{{ buyer()?.displayName || 'Buyer' }}</div>
                <div class="bc-rating">
                  <span class="rate-badge">{{ buyerBehavior().rating }}</span>
                  <span class="stars">★★★★★</span>
                </div>
              </div>
              <div class="bc-stats">
                <div class="stat">
                  <div class="stat-num">{{ buyerBehavior().orders }}</div>
                  <div class="stat-lbl">Orders</div>
                </div>
                <div class="stat">
                  <div class="stat-num">{{ buyerBehavior().avgPayDays }}d</div>
                  <div class="stat-lbl">Avg Pay Days</div>
                </div>
                <div class="stat">
                  <div class="stat-num">{{ buyerBehavior().returnRate }}%</div>
                  <div class="stat-lbl">Return Rate</div>
                </div>
              </div>
              <div class="ontime-bar">
                <div class="bar-head">
                  <span>On-Time Payment</span>
                  <strong>{{ buyerBehavior().onTimePct }}%</strong>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" [style.width.%]="buyerBehavior().onTimePct"></div>
                </div>
              </div>
            </div>
            <div class="bc-badge" [class]="buyerBehavior().badgeColor">
              ✅ {{ buyerBehavior().badge }}
            </div>
          </div>
        </div>

        <!-- More info row -->
        <div class="grid grid-cols-4 gap-4 mt-4">
          <div>
            <label class="lbl">CURR. BALANCE (BUYER)</label>
            <div class="bal-row">
              <input type="text" disabled [value]="(buyerBalance() | number:'1.2-2') || '0.00'" class="ip ip-bal">
              <span class="bal-tag" [class.cr]="buyerBalance() <= 0" [class.dr]="buyerBalance() > 0">
                {{ buyerBalance() > 0 ? 'DR' : 'CR' }}
              </span>
            </div>
          </div>
<!-- COMMISSION fields hata diye — user request (06/06/26) -->
          <div>
            <label class="lbl">BILL NO
              @if (billNoPicked()) { <span class="bn-ok">✓ {{ billNoPicked() }} select ho gaya</span> }
            </label>
            <input [(ngModel)]="billNoPick" (ngModelChange)="onBillNoPick()" type="text"
                   list="prBillList" placeholder="Bill / supplier bill no daalo — supplier+buyer auto aa jayenge"
                   class="ip">
            <datalist id="prBillList">
              @for (b of bills(); track b.billId) {
                <option [value]="b.dispNo">₹{{ b.pending | number:'1.0-0' }} pending</option>
              }
            </datalist>
          </div>
          <div>
            <label class="lbl">REMARK</label>
            <input [(ngModel)]="remark" type="text" placeholder="Optional note..." class="ip">
          </div>
        </div>
      </div>

      <!-- ============ SECTION 2: PAYMENT TRANSACTIONS ============ -->
      <div class="section-card">
        <div class="flex items-center justify-between">
          <div class="section-head no-border">
            <span class="sec-ico">💳</span> PAYMENT TRANSACTIONS (MULTIPLE CHEQUE / NEFT / UPI)
          </div>
          <button type="button" (click)="addTxn()" class="btn-add">+ Add</button>
        </div>

        <label style="display:flex;align-items:center;gap:14px;margin:10px 0;padding:16px 18px;border:2px dashed #c4b5fd;border-radius:12px;background:#faf5ff;cursor:pointer">
          <span style="font-size:34px">🧾</span>
          <div style="flex:1">
            <div style="font-weight:800;color:#5c1a8b">{{ scanningCheque() ? '⏳ Scanning cheque...' : '📤 UPLOAD CHEQUE / SLIP — auto-fill' }}</div>
            <div style="font-size:12px;color:#8b7aa8">JPG, PNG supported · Bank, Cheque/UTR No, Date, Amount apne aap bhar jayega</div>
          </div>
          <input type="file" accept="image/*" hidden [disabled]="scanningCheque()" (change)="scanCheque($event)">
        </label>

        <div class="item-table-wrap mt-2">
          <table class="item-table">
            <thead>
              <tr>
                <th class="w-10">#</th>
                <th class="w-32">PAYMENT MODE</th>
                <th>BANK NAME</th>
                <th>CHEQUE / UTR NO.</th>
                <th class="w-32">CHEQUE DATE</th>
                <th class="w-28">AMOUNT (₹)</th>
                <th class="w-10">DEL</th>
              </tr>
            </thead>
            <tbody>
              @for (txn of txns(); track $index) {
                <tr>
                  <td class="text-center">{{ $index + 1 }}</td>
                  <td>
                    <select [ngModel]="txn.mode" (ngModelChange)="updateTxn($index, 'mode', $event)" class="tip">
                      <option>Cheque</option>
                      <option>NEFT</option>
                      <option>RTGS</option>
                      <option>UPI</option>
                      <option>Cash</option>
                    </select>
                  </td>
                  <td>
                    <input [ngModel]="txn.bankName" (ngModelChange)="updateTxn($index, 'bankName', $event)"
                           list="indiaBanks" placeholder="Bank name — type/select" class="tip" autocomplete="off">
                    <datalist id="indiaBanks">
                      @for (bk of bankNames; track bk) { <option [value]="bk"></option> }
                    </datalist>
                  </td>
                  <td>
                    <input [ngModel]="txn.refNo" (ngModelChange)="updateTxn($index, 'refNo', $event)"
                           placeholder="Cheque/UTR No." class="tip">
                  </td>
                  <td>
                    <input [ngModel]="txn.date" (ngModelChange)="updateTxn($index, 'date', $event)"
                           type="date" class="tip">
                  </td>
                  <td>
                    <input [ngModel]="txn.amount" (ngModelChange)="updateTxn($index, 'amount', +$event)"
                           type="number" step="0.01" class="tip text-right">
                  </td>
                  <td class="text-center">
                    @if (txns().length > 1) {
                      <button type="button" (click)="removeTxn($index)" class="btn-del">🗑</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="5" class="text-right">Total Received →</td>
                <td class="text-right font-mono total-cell">₹ {{ totalReceived() | number:'1.2-2' }}</td>
                <td></td>
              </tr>
              @if (totalReceived() > 0) {
                <tr>
                  <td colspan="7" class="text-right rcv-words">📝 {{ words(totalReceived()) }}</td>
                </tr>
              }
            </tfoot>
          </table>
        </div>
      </div>

      <!-- ============ SECTION 3: SUPPLIER-BUYER BILLS ============ -->
      <div class="section-card">
        <div class="section-head">
          <span class="sec-ico">📑</span> SUPPLIER-BUYER BILLS — SELECT FOR THIS PAYMENT
        </div>

        <div class="info-banner mt-3">
          ℹ️ Bill select karein → <strong>Pay Terms</strong> enter karein → System automatically batayega payment
          <span style="color:#DC2626;font-weight:800">LATE</span> aayi ya
          <span style="color:#10B981;font-weight:800">JALDI</span>.
        </div>

        <div class="legend">
          <span class="lg-item"><span class="dot dot-late"></span> Late — Terms se zyada din mein payment aayi</span>
          <span class="lg-item"><span class="dot dot-ontime"></span> On Time — Bilkul sahi din par</span>
          <span class="lg-item"><span class="dot dot-early"></span> Early — Terms se pehle payment aayi</span>
          <span class="lg-item"><span class="dot dot-pending"></span> Pending — Bill select nahi kiya</span>
        </div>

        <!-- SELECT BILL button — popup me pair ke bills tick karke lo -->
        <div class="flex justify-end mt-3">
          <button type="button" class="sel-bill-btn" (click)="openBillPicker()">📋 Select Bill</button>
        </div>

        <!-- BILL PICKER POPUP -->
        @if (billPickerOpen()) {
          <div class="bp-overlay" (click)="billPickerOpen.set(false)">
            <div class="bp-modal" (click)="$event.stopPropagation()">
              <div class="bp-head">
                📋 Supplier-Buyer ke Bills — tick karke select karo
                <button type="button" class="bp-close" (click)="billPickerOpen.set(false)">✕</button>
              </div>
              <div class="bp-body">
                @if (!supplierId && !buyerId) {
                  <div class="bp-empty">👆 Pehle upar Supplier aur Buyer select karo</div>
                } @else if (bills().length === 0) {
                  <div class="bp-empty">📭 Is pair ke beech koi UNPAID bill nahi mila</div>
                } @else {
                  <table class="bp-table">
                    <thead>
                      <tr><th class="w-8"></th><th>BILL NO</th><th>DATE</th><th class="text-right">PENDING (₹)</th></tr>
                    </thead>
                    <tbody>
                      @for (b of bills(); track b.billId; let i = $index) {
                        <tr (click)="toggleBill(i, !b.selected)" [class.bp-sel]="b.selected">
                          <td class="text-center">
                            <input type="checkbox" class="bp-check" [checked]="b.selected"
                                   (click)="$event.stopPropagation(); toggleBill(i, !b.selected)">
                          </td>
                          <td class="font-mono font-bold">{{ b.dispNo }}</td>
                          <td>{{ b.date | inDate }}</td>
                          <td class="text-right font-mono">{{ b.pending | number:'1.2-2' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              </div>
              <div class="bp-foot">
                <button type="button" class="bp-done" (click)="billPickerOpen.set(false)">✓ Done</button>
              </div>
            </div>
          </div>
        }

        <div class="bill-table-wrap mt-3">
          <table class="bill-table">
            <thead>
              <tr>
                <th class="w-10">✓</th>
                <th>SUPP BILL NO</th>
                <th>DATE</th>
                <th>TYPE</th>
                <th class="text-right">GROSS AMT</th>
                <th class="text-right">TAX AMT</th>
                <th class="text-right">GR AMT</th>
                <th class="text-right">RATE DIFF</th>
                <th class="text-right">DIS%</th>
                <th class="text-right">DIS AMT</th>
                <th class="text-right">INTEREST</th>
                <th class="text-right">ADJ AMT</th>
                <th class="text-right">PACKING</th>
                <th class="text-right">OTHER</th>
                <th class="text-center">GST</th>
                <th class="text-right">NET AMT</th>
                <th class="text-right">PENDING</th>
                <th class="text-right">COMM AMT</th>
                <th class="w-20 text-center">PAY TERMS<br><small>(DAYS)</small></th>
                <th>DUE DATE</th>
                <th class="text-right">ACTUAL DAYS</th>
                <th class="text-center">⌛ EARLY / LATE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              @if (bills().length === 0) {
                <tr>
                  <td colspan="21" class="empty-row">
                    @if (billsError()) {
                      ⚠️ {{ billsError() }}
                    } @else if (supplierId || buyerId) {
                      📭 Is supplier-buyer pair ke beech koi UNPAID bill nahi mila
                    } @else {
                      👆 Pehle Supplier aur Buyer select karein
                    }
                  </td>
                </tr>
              } @else {
                @for (b of bills(); track b.billId; let i = $index) {
                  <tr [class.row-selected]="b.selected">
                    <td class="text-center">
                      <input type="checkbox" [ngModel]="b.selected"
                             (ngModelChange)="toggleBill(i, $event)">
                    </td>
                    <td class="font-mono text-xs">{{ b.dispNo }}</td>
                    <td class="text-xs">{{ b.date | inDate }}</td>
                    <td>
                      <span class="type-tag" [class]="b.type">{{ b.type }}</span>
                    </td>
                    <td class="text-right font-mono">{{ b.netAmt | number:'1.2-2' }}</td>
                    <td class="text-right font-mono">{{ b.taxAmt | number:'1.2-2' }}</td>
                    <td class="text-right font-mono">{{ b.grAmt | number:'1.2-2' }}</td>
                    <td>
                      <input [ngModel]="b.rateDiff" (ngModelChange)="updateBill(i, 'rateDiff', +$event)"
                             type="number" step="0.01" class="tip text-right">
                    </td>
                    <td>
                      <input [ngModel]="b.disPct" (ngModelChange)="updateBill(i, 'disPct', +$event)"
                             type="number" step="0.01" class="tip text-right">
                    </td>
                    <td class="text-right font-mono">{{ b.disAmt | number:'1.2-2' }}</td>
                    <td>
                      <input [ngModel]="b.interest" (ngModelChange)="updateBill(i, 'interest', +$event)"
                             type="number" step="0.01" class="tip text-right">
                    </td>
                    <td>
                      <input [ngModel]="b.adjAmt" (ngModelChange)="updateBill(i, 'adjAmt', +$event)"
                             type="number" step="0.01" class="tip text-right">
                    </td>
                    <td>
                      <input [ngModel]="b.packing" (ngModelChange)="updateBill(i, 'packing', +$event)"
                             type="number" step="0.01" class="tip text-right">
                    </td>
                    <td>
                      <input [ngModel]="b.other" (ngModelChange)="updateBill(i, 'other', +$event)"
                             type="number" step="0.01" class="tip text-right">
                    </td>
                    <td class="text-center">
                      <button type="button" class="gst-toggle" [class.before]="b.gstMode === 'before'"
                              (click)="updateBill(i, 'gstMode', b.gstMode === 'before' ? 'after' : 'before')"
                              title="Deductions GST se pehle (taxable par) ya baad me (total par)">
                        {{ b.gstMode === 'before' ? 'Before GST' : 'After GST' }}
                      </button>
                    </td>
                    <td class="text-right font-mono total-cell">{{ b.toPay | number:'1.2-2' }}</td>
                    <td class="text-right font-mono">{{ b.pending | number:'1.2-2' }}</td>
                    <td class="text-right font-mono">{{ b.commAmt | number:'1.2-2' }}</td>
                    <td>
                      <input [ngModel]="b.payTermsDays" (ngModelChange)="updateBill(i, 'payTermsDays', +$event)"
                             type="number" min="0" class="tip text-center">
                    </td>
                    <td class="text-xs">{{ b.dueDate | inDate }}</td>
                    <td class="text-right font-mono">{{ b.actualDays }}</td>
                    <td class="text-center font-mono">
                      @if (b.selected) {
                        @if (b.earlyLate < 0) {
                          <span class="el-tag el-early">{{ b.earlyLate }}d Early</span>
                        } @else if (b.earlyLate === 0) {
                          <span class="el-tag el-ontime">On-Time</span>
                        } @else {
                          <span class="el-tag el-late">+{{ b.earlyLate }}d Late</span>
                        }
                      } @else {
                        <span class="el-tag el-pending">—</span>
                      }
                    </td>
                    <td>
                      <span class="status-tag" [class]="'st-' + b.status">{{ b.status }}</span>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- ============ SECTION 4: PAYMENT SUMMARY ============ -->
      <div class="section-card">
        <div class="section-head">
          <span class="sec-ico">📊</span> PAYMENT SUMMARY
        </div>
        <div class="grid grid-cols-4 gap-4 mt-3">
          <div class="sum-stat">
            <div class="stat-label">TOTAL BILL AMOUNT</div>
            <div class="stat-value">₹ {{ totalBillAmount() | number:'1.2-2' }}</div>
          </div>
          <div class="sum-stat sum-stat-received">
            <div class="stat-label">TOTAL RECEIVED</div>
            <div class="stat-value">₹ {{ totalReceived() | number:'1.2-2' }}</div>
            @if (totalReceived() > 0) {
              <div class="stat-words">📝 {{ words(totalReceived()) }}</div>
            }
          </div>
          <div class="sum-stat">
            <div class="stat-label">TOTAL DISCOUNT</div>
            <div class="stat-value">₹ {{ totalDiscount() | number:'1.2-2' }}</div>
          </div>
          <div class="sum-stat sum-stat-pending">
            <div class="stat-label">BALANCE PENDING</div>
            <div class="stat-value">₹ {{ balancePending() | number:'1.2-2' }}</div>
          </div>
        </div>

        <!-- Paisa kisko mila? — broker vs aadhat model (PILOT: abhi sirf Riddhi Agency) -->
        @if (pilotMoneyToggle()) {
        <div class="mt-4 p-3 rounded-lg border border-[#D6DDEA] bg-[#FAF7F0]">
          <div class="text-xs font-bold uppercase text-[#4A5878] mb-2">💸 Paisa kisko mila?</div>
          <div class="flex gap-6 flex-wrap">
            <label class="flex items-center gap-2 cursor-pointer text-sm font-semibold text-[#1B2E5C]">
              <input type="radio" name="moneyTo" [value]="false" [(ngModel)]="moneyToAgency">
              🤝 Seedha supplier ko gaya <span class="text-xs font-normal text-gray-500">(broker — sirf record)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer text-sm font-semibold text-[#1B2E5C]">
              <input type="radio" name="moneyTo" [value]="true" [(ngModel)]="moneyToAgency">
              🏦 Agency ko mila <span class="text-xs font-normal text-gray-500">(aadhat — cash/bank me aayega, fir supplier ko payment karna)</span>
            </label>
          </div>
          @if (moneyToAgency && bankLedgers().length === 0) {
            <p class="text-red-600 text-xs mt-2">⚠️ Agency ko paisa mila hai to Cash/Bank ledger chahiye — Accounting me pehle bana lo.</p>
          }
        </div>
        }
      </div>

      <!-- ============ SECTION 5: PAYMENT ANALYTICS (Simple SVG) ============ -->
      <div class="section-card">
        <div class="section-head">
          <span class="sec-ico">📈</span> PAYMENT ANALYTICS — FY 2025-26
        </div>

        <div class="grid grid-cols-3 gap-4 mt-3">
          <!-- Monthly collection bar chart -->
          <div class="chart-box">
            <div class="chart-title">MONTHLY COLLECTION VS OUTSTANDING (₹L)</div>
            <svg viewBox="0 0 320 160" class="chart-svg">
              <!-- Y axis labels -->
              <text x="10" y="20" class="ax-lbl">6L</text>
              <text x="10" y="55" class="ax-lbl">4L</text>
              <text x="10" y="90" class="ax-lbl">2L</text>
              <text x="10" y="125" class="ax-lbl">0L</text>
              <!-- Bars -->
              @for (m of monthData; track m.label; let i = $index) {
                <g [attr.transform]="'translate(' + (35 + i * 48) + ', 0)'">
                  <rect [attr.x]="0" [attr.y]="125 - m.collected" [attr.width]="20" [attr.height]="m.collected" fill="#1B2E5C"></rect>
                  <rect [attr.x]="0" [attr.y]="125 - m.collected - m.outstanding" [attr.width]="20" [attr.height]="m.outstanding" fill="#DC2626"></rect>
                  <text x="10" y="140" class="ax-lbl" text-anchor="middle">{{ m.label }}</text>
                </g>
              }
            </svg>
            <div class="chart-legend">
              <span><span class="lg-sw" style="background:#1B2E5C"></span> Collected</span>
              <span><span class="lg-sw" style="background:#DC2626"></span> Outstanding</span>
            </div>
          </div>

          <!-- Payment mode donut -->
          <div class="chart-box">
            <div class="chart-title">PAYMENT MODE SPLIT</div>
            <svg viewBox="0 0 200 160" class="chart-svg">
              <!-- Simple donut using stroke-dasharray -->
              <circle cx="100" cy="80" r="55" fill="none" stroke="#F5EFE3" stroke-width="22"></circle>
              <circle cx="100" cy="80" r="55" fill="none" stroke="#1B2E5C" stroke-width="22"
                      stroke-dasharray="166 346" transform="rotate(-90 100 80)"></circle>
              <circle cx="100" cy="80" r="55" fill="none" stroke="#DC2626" stroke-width="22"
                      stroke-dasharray="107 346" stroke-dashoffset="-166" transform="rotate(-90 100 80)"></circle>
              <circle cx="100" cy="80" r="55" fill="none" stroke="#10B981" stroke-width="22"
                      stroke-dasharray="73 346" stroke-dashoffset="-273" transform="rotate(-90 100 80)"></circle>
            </svg>
            <div class="chart-legend">
              <span><span class="lg-sw" style="background:#1B2E5C"></span> NEFT/RTGS 48%</span>
              <span><span class="lg-sw" style="background:#DC2626"></span> Cheque 31%</span>
              <span><span class="lg-sw" style="background:#10B981"></span> UPI 21%</span>
            </div>
          </div>

          <!-- On-time vs late donut -->
          <div class="chart-box">
            <div class="chart-title">ON-TIME VS LATE</div>
            <svg viewBox="0 0 200 160" class="chart-svg">
              <circle cx="100" cy="80" r="55" fill="none" stroke="#F5EFE3" stroke-width="22"></circle>
              <circle cx="100" cy="80" r="55" fill="none" stroke="#10B981" stroke-width="22"
                      stroke-dasharray="200 346" transform="rotate(-90 100 80)"></circle>
              <circle cx="100" cy="80" r="55" fill="none" stroke="#FCD34D" stroke-width="22"
                      stroke-dasharray="59 346" stroke-dashoffset="-200" transform="rotate(-90 100 80)"></circle>
              <circle cx="100" cy="80" r="55" fill="none" stroke="#DC2626" stroke-width="22"
                      stroke-dasharray="87 346" stroke-dashoffset="-259" transform="rotate(-90 100 80)"></circle>
            </svg>
            <div class="chart-legend">
              <span><span class="lg-sw" style="background:#10B981"></span> On-Time 58%</span>
              <span><span class="lg-sw" style="background:#FCD34D"></span> Early 17%</span>
              <span><span class="lg-sw" style="background:#DC2626"></span> Late 25%</span>
            </div>
          </div>
        </div>
      </div>

      @if (error()) {
        <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mt-3">
          {{ error() }}
        </div>
      }

      <!-- ============ BOTTOM ACTIONS ============ -->
      <div class="bottom-bar">
        <div></div>
        <div class="flex gap-2 items-center">
          <a routerLink="/trading/payments" class="btn-light">📋 Receipt List</a>
          <button type="button" (click)="printPreview()" class="btn-light">👁 Print Preview</button>
          <button type="button" (click)="enableEdit()" class="btn-edit">✏️ Edit</button>
          <button type="button" (click)="deleteReceipt()" class="btn-delete">🗑 Delete</button>
          <button type="button" (click)="save()" [disabled]="saving()" class="btn-save">
            {{ saving() ? 'Saving…' : '💾 Save Receipt' }}
          </button>
        </div>
      </div>

      @if (previewData()) {
        <app-invoice-preview [data]="previewData()!" (close)="previewData.set(null)"></app-invoice-preview>
      }

    </div>
  `,
  styles: [`
    @keyframes discBlink { 0%,100%{opacity:1} 50%{opacity:.25} }
    @keyframes discPulse { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.55)} 50%{box-shadow:0 0 0 14px rgba(220,38,38,0)} }
    .disc-alert-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999}
    .disc-alert-box{background:#fff;border:3px solid #DC2626;border-radius:16px;padding:22px 26px;max-width:420px;text-align:center;animation:discPulse 1s infinite}
    .disc-alert-light{font-size:44px;animation:discBlink .6s infinite}
    .disc-alert-msg{margin:10px 0 16px;font-weight:700;color:#1B2E5C;font-size:15px;line-height:1.4}
    .disc-alert-ok{background:#DC2626;color:#fff;border:none;border-radius:8px;padding:9px 30px;font-weight:800;cursor:pointer}
    /* ============ Anjaninex BRAND ============ */
    :host { display: block; background: #FAF7F0; min-height: 100vh; padding: 16px 0; }

    /* HEADER */
    .rcpt-header {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 14px 22px; border-radius: 12px 12px 0 0;
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px; box-shadow: 0 2px 8px rgba(27,46,92,0.12);
    }
    .rh-left { display: flex; align-items: center; gap: 12px; }
    .rh-logo { width: 44px; height: 44px; object-fit: contain; background: #fff; border-radius: 8px; padding: 4px; }
    .rh-title { font-size: 19px; font-weight: 800; margin: 0; }
    .rh-sub { font-size: 12px; opacity: 0.85; margin: 0; }
    .rh-vno { font-size: 13px; font-weight: 700; }

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
    .lbl { display: block; font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.5px; margin-bottom: 4px; text-transform: uppercase; }
    .ip {
      width: 100%; padding: 8px 10px; border: 1px solid #D6DDEA; border-radius: 6px;
      font-size: 13px; color: #1B2E5C; background: #fff; font-family: inherit;
      transition: border 0.15s, box-shadow 0.15s;
    }
    .ip:focus { outline: none; border-color: #DC2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.1); }
    .ip-required { background: #FFFBEB; border-color: #FCD34D; }
    .ip-bal { background: #FAF7F0; font-weight: 600; }
    .bal-row { display: flex; gap: 4px; align-items: stretch; }
    .bal-tag {
      display: inline-flex; align-items: center; padding: 0 10px;
      font-size: 11px; font-weight: 800; color: #DC2626;
      border: 1px solid #FCA5A5; border-radius: 6px; background: #FEE2E2;
    }
    .bal-tag.cr { color: #047857; border-color: #A7F3D0; background: #ECFDF5; }
    .bal-tag.dr { color: #DC2626; border-color: #FCA5A5; background: #FEE2E2; }

    /* SEARCH dropdown */
    .bn-ok { margin-left: 8px; font-size: 10px; font-weight: 800; color: #15803d;
      background: #dcfce7; border-radius: 6px; padding: 1px 8px; }
    .rcv-words { font-size: 11.5px; font-style: italic; font-weight: 700; color: #15803d;
      background: #f0fdf4; padding: 6px 10px !important; }

    /* SELECT BILL button + popup */
    .sel-bill-btn { background: #5c1a8b; color: #fff; border: 0; border-radius: 8px; padding: 8px 18px;
      font-size: 12px; font-weight: 800; cursor: pointer; font-family: inherit; }
    .sel-bill-btn:hover { background: #4a1570; }
    .bp-overlay { position: fixed; inset: 0; background: rgba(20,10,40,.55); z-index: 96;
      display: flex; align-items: center; justify-content: center; padding: 16px; }
    .bp-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 560px;
      max-height: 80vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
    .bp-head { background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 13px 18px; font-weight: 800; font-size: 14px;
      display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0;
      border-radius: 14px 14px 0 0; }
    .bp-close { background: rgba(255,255,255,.15); border: 0; color: #fff; width: 26px; height: 26px;
      border-radius: 50%; cursor: pointer; }
    .bp-body { padding: 14px 18px; }
    .bp-empty { text-align: center; color: #6b7280; padding: 24px 0; font-size: 13px; }
    .bp-table { width: 100%; font-size: 24px; border-collapse: collapse; }
    .bp-table input { font-size: 24px; font-weight: 600; }
    .bp-table td { font-weight: 600; }
    .bp-table thead { background: #f0e6ff; color: #5c1a8b; }
    .bp-table th { padding: 8px; text-align: left; font-size: 15px; font-weight: 800; text-transform: uppercase; }
    .bp-table th.text-right { text-align: right; }
    .bp-table td { padding: 10px 8px; border-bottom: 1px solid #f5f0ff; cursor: pointer; }
    .bp-table tr:hover { background: #faf5ff; }
    .bp-sel { background: #ede9fe !important; }
    .bp-check { width: 18px; height: 18px; accent-color: #5c1a8b; cursor: pointer; }
    .bp-foot { padding: 12px 18px; border-top: 1px solid #f0e6ff; text-align: right;
      position: sticky; bottom: 0; background: #fff; border-radius: 0 0 14px 14px; }
    .bp-done { background: #16a34a; color: #fff; border: 0; border-radius: 9px; padding: 9px 22px;
      font-size: 13px; font-weight: 800; cursor: pointer; font-family: inherit; }

    .search-wrap { position: relative; }
    .wa-mini { margin-left: 8px; border: 1px solid #86efac; background: #dcfce7; color: #15803d;
      border-radius: 6px; padding: 1px 8px; font-size: 10px; font-weight: 800; cursor: pointer; font-family: inherit; }
    .wa-mini:hover { background: #bbf7d0; }
    .search-dd {
      position: absolute; top: 100%; left: 0; right: 0; z-index: 80;
      background: #fff; border: 1px solid #D6DDEA; border-radius: 6px;
      box-shadow: 0 4px 12px rgba(27,46,92,0.15); max-height: 260px; overflow-y: auto;
    }
    .search-item {
      padding: 8px 10px; border-bottom: 1px solid #F5EFE3; cursor: pointer;
      display: flex; flex-direction: column; gap: 2px;
    }
    .search-item:hover { background: #FAF7F0; }
    .search-item.kb-active { background: #f0e6ff; border-left: 3px solid #5c1a8b; }
    .search-item strong { font-size: 13px; color: #1B2E5C; }
    .search-item small { font-size: 11px; color: #4A5878; }

    /* BEHAVIOR CARDS */
    .behav-card {
      border: 1px solid #D6DDEA; border-radius: 10px; padding: 14px;
      background: #FAF7F0;
    }
    .supplier-card { background: #F5EFE3; }
    .buyer-card { background: #FFFBEB; }
    .bc-head {
      font-size: 11px; font-weight: 800; color: #4A5878; letter-spacing: 0.5px;
      text-transform: uppercase; margin-bottom: 10px;
    }
    .bc-body { display: grid; grid-template-columns: auto auto 1fr; gap: 12px; align-items: center; }
    .bc-avatar {
      width: 44px; height: 44px; border-radius: 50%; display: inline-flex;
      align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 18px;
    }
    .bc-avatar-sup { background: var(--anjaninex-navy, #1B2E5C); }
    .bc-avatar-buy { background: #DC2626; }
    .bc-name { font-size: 14px; font-weight: 700; color: #1B2E5C; }
    .bc-rating { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
    .rate-badge {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 2px 6px; border-radius: 4px;
      font-size: 10px; font-weight: 800;
    }
    .stars { color: #FCD34D; font-size: 11px; letter-spacing: 1px; }
    .bc-stats { display: flex; justify-content: space-around; }
    .stat { text-align: center; }
    .stat-num { font-size: 16px; font-weight: 800; color: #1B2E5C; }
    .stat-lbl { font-size: 10px; color: #4A5878; text-transform: uppercase; margin-top: 2px; }
    .bc-badge {
      margin-top: 10px; padding: 6px 10px; border-radius: 6px; font-size: 12px;
      font-weight: 700; text-align: center;
    }
    .bc-badge.reliable, .bc-badge.good { background: #D1FAE5; color: #047857; }
    .bc-badge.average { background: #FEF3C7; color: #92400E; }
    .bc-badge.risky { background: #FEE2E2; color: #DC2626; }
    .ontime-bar { grid-column: 1 / -1; margin-top: 8px; }
    .bar-head { display: flex; justify-content: space-between; font-size: 11px; color: #4A5878; margin-bottom: 3px; }
    .bar-track { height: 5px; background: #E5E9F2; border-radius: 3px; overflow: hidden; }
    .bar-fill { height: 100%; background: #10B981; }

    /* PAYMENT TXN TABLE */
    .btn-add {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 8px 16px; border-radius: 8px;
      font-size: 13px; font-weight: 700; border: 0; cursor: pointer; font-family: inherit;
    }
    .btn-add:hover { background: #142347; }
    .item-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid #D6DDEA; border-radius: 8px; }
    /* Thick, always-visible horizontal scrollbar */
    .item-table-wrap::-webkit-scrollbar { height: 12px; }
    .item-table-wrap::-webkit-scrollbar-track { background: #EEF1F7; border-radius: 8px; }
    .item-table-wrap::-webkit-scrollbar-thumb { background: var(--anjaninex-navy, #1B2E5C); border-radius: 8px; }
    .item-table { width: 100%; min-width: 1000px; font-size: 12px; border-collapse: collapse; background: #fff; }
    .item-table thead { background: var(--anjaninex-navy, #1B2E5C); color: #fff; }
    .item-table th { padding: 8px 6px; text-align: left; font-weight: 700; font-size: 10px; letter-spacing: 0.3px; text-transform: uppercase; }
    .item-table td { padding: 4px 4px; border-bottom: 1px solid #F5EFE3; vertical-align: middle; }
    .item-table tfoot { background: #F5EFE3; font-weight: 800; color: #1B2E5C; }
    .item-table tfoot td { padding: 8px 6px; border-top: 2px solid #1B2E5C; }
    .total-cell { color: #DC2626; font-weight: 800; }
    .gst-toggle {
      font-size: 10px; font-weight: 700; white-space: nowrap;
      padding: 3px 7px; border-radius: 6px; cursor: pointer;
      border: 1px solid #7C3AED; background: #EDE9FE; color: #6D28D9;
    }
    .gst-toggle.before { background: #7C3AED; color: #fff; }
    .tip {
      width: 100%; padding: 5px 6px; border: 1px solid #E5E9F2; border-radius: 4px;
      font-size: 11.5px; color: #1B2E5C; background: #fff; font-family: inherit;
    }
    .tip:focus { outline: none; border-color: #DC2626; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .btn-del { background: transparent; border: 0; color: #DC2626; font-size: 14px; cursor: pointer; padding: 2px 6px; }

    /* INFO BANNER */
    .info-banner {
      background: #DBEAFE; border: 1px solid #93C5FD; color: #1E40AF;
      padding: 10px 14px; border-radius: 8px; font-size: 13px;
    }

    /* LEGEND */
    .legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 10px; font-size: 11.5px; color: #4A5878; }
    .lg-item { display: inline-flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .dot-late { background: #DC2626; }
    .dot-ontime { background: #10B981; }
    .dot-early { background: #16A34A; }
    .dot-pending { background: #FCD34D; }

    /* BILL TABLE */
    .bill-table-wrap { overflow-x: auto; border: 1px solid #D6DDEA; border-radius: 8px; margin-top: 10px; }
    .bill-table { width: 100%; font-size: 11px; border-collapse: collapse; background: #fff; min-width: 1700px; }
    .bill-table thead { background: #5c1a8b; color: #fff; }
    .bill-table th {
      padding: 8px 6px; text-align: left; font-weight: 700; font-size: 9.5px;
      letter-spacing: 0.3px; text-transform: uppercase; white-space: nowrap;
    }
    .bill-table th.text-right { text-align: right; }
    .bill-table th.text-center { text-align: center; }
    .bill-table td { padding: 4px 4px; border-bottom: 1px solid #F5EFE3; vertical-align: middle; }
    .bill-table tbody tr:hover { background: #FAF7F0; }
    .row-selected { background: #ECFDF5 !important; }
    .empty-row { text-align: center; padding: 24px; color: #9CA3AF; font-size: 13px; }

    .type-tag {
      display: inline-block; padding: 2px 6px; border-radius: 4px;
      font-size: 9.5px; font-weight: 700; background: var(--anjaninex-navy, #1B2E5C); color: #fff;
    }
    .el-tag {
      display: inline-block; padding: 2px 6px; border-radius: 4px;
      font-size: 10px; font-weight: 800;
    }
    .el-early { background: #D1FAE5; color: #047857; }
    .el-ontime { background: #D1FAE5; color: #10B981; }
    .el-late { background: #FEE2E2; color: #DC2626; }
    .el-pending { background: #FEF3C7; color: #92400E; }

    .status-tag {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 10px; font-weight: 700; text-transform: capitalize;
    }
    .st-pending { background: #FEF3C7; color: #92400E; }
    .st-on-time { background: #D1FAE5; color: #047857; }
    .st-early { background: #DCFCE7; color: #15803D; }
    .st-late { background: #FEE2E2; color: #DC2626; }

    /* SUMMARY */
    .sum-stat {
      background: #fff; border: 1px solid #D6DDEA; border-radius: 8px; padding: 14px;
    }
    .sum-stat-received { background: #F5EFE3; border-color: #5c1a8b; }
    .sum-stat-pending  { background: #FFFBEB; border-color: #FCD34D; }
    .stat-label { font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.5px; text-transform: uppercase; }
    .stat-value { font-size: 19px; font-weight: 800; color: #1B2E5C; margin-top: 6px; font-family: 'JetBrains Mono', monospace; }
    .stat-words {
      font-size: 10.5px; color: #065f46;
      background: #ecfdf5; border-left: 3px solid #10b981;
      padding: 4px 8px; border-radius: 4px; margin-top: 6px;
      font-style: italic; font-weight: 600; line-height: 1.4;
    }

    /* CHARTS */
    .chart-box {
      background: #fff; border: 1px solid #D6DDEA; border-radius: 8px; padding: 14px;
    }
    .chart-title {
      font-size: 11px; font-weight: 800; color: #4A5878; letter-spacing: 0.5px;
      text-transform: uppercase; margin-bottom: 8px;
    }
    .chart-svg { width: 100%; height: 160px; }
    .ax-lbl { font-size: 9px; fill: #6B7280; font-family: inherit; }
    .chart-legend {
      display: flex; flex-direction: column; gap: 4px; margin-top: 8px;
      font-size: 11px; color: #4A5878;
    }
    .lg-sw { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }

    /* BOTTOM BAR */
    .bottom-bar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 0 8px; margin-top: 8px; border-top: 1px solid #D6DDEA;
    }
    .btn-light, .btn-edit, .btn-delete, .btn-save {
      padding: 9px 18px; border-radius: 8px; font-weight: 700; font-size: 13px;
      cursor: pointer; border: 1px solid #D6DDEA; font-family: inherit; text-decoration: none;
      display: inline-flex; align-items: center; gap: 4px;
    }
    .btn-light { background: #fff; color: #4A5878; }
    .btn-light:hover { background: #F5EFE3; }
    .btn-edit { background: #fff; color: #1B2E5C; border-color: #1B2E5C; }
    .btn-edit:hover { background: #E5E9F2; }
    .btn-delete { background: #fff; color: #DC2626; border-color: #DC2626; }
    .btn-delete:hover { background: #FEE2E2; }
    .btn-save {
      background: #DC2626; color: #fff; border: 0;
      box-shadow: 0 2px 6px rgba(220,38,38,0.3);
      transition: background 0.15s, transform 0.1s;
    }
    .btn-save:hover:not(:disabled) { background: #B91C1C; transform: translateY(-1px); }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

    @media (max-width: 640px) {
      :host { padding: 8px 0; }
      .rcpt-header { flex-wrap: wrap; gap: 8px; padding: 12px 14px; }
      .section-card { padding: 12px 12px; }
      /* All form grids → single column */
      .grid-cols-2, .grid-cols-3, .grid-cols-4 { grid-template-columns: 1fr !important; }
      .col-span-2, .col-span-3 { grid-column: span 1 !important; }
      .ip { width: 100% !important; }
      /* Tables horizontally scrollable */
      .item-table-wrap, .bill-table-wrap { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .item-table, .bill-table, .bp-table { white-space: nowrap; }
      /* Bill-picker modal fits */
      .bp-overlay { padding: 8px; }
      .bp-modal { width: auto !important; max-width: 100% !important; }
      /* Bottom action bar stacks */
      .bottom-bar { flex-wrap: wrap; gap: 10px; }
    }
  `]
})
export class PaymentReceiptComponent {
  private svc = inject(TradingService);
  features = inject(FeatureService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  editId: string | null = null;
  editMode = false;
  editPaymentNo = '';   // edit me purana number reuse (renumber na ho)

  parties = signal<Party[]>([]);

  /** Party ka WhatsApp kholo — phone ke last 10 digit par (+91) */
  openWhatsAppParty(partyId: string) {
    const p = this.parties().find(x => x.id === partyId);
    const digits = (p?.phone || '').replace(/\D/g, '');
    if (!digits) { alert('Is party ka phone number save nahi hai'); return; }
    const ten = digits.length > 10 ? digits.slice(-10) : digits;
    window.open('https://wa.me/91' + ten, '_blank');
  }
  bankLedgers = signal<any[]>([]);
  saving = signal(false);
  error = signal('');
  // false = broker (paisa seedha supplier ko, sirf record) | true = aadhat (paisa agency ke cash/bank me)
  moneyToAgency = false;

  // PILOT: "Paisa kisko mila" toggle — sadmin panel ke Feature Flags se control hota hai.
  // (Admin → Feature Flags → 'money_to_agency' → pilot firm on karo ya "Sab firms" master switch.)
  pilotMoneyToggle(): boolean {
    return this.features.flag('money_to_agency');
  }

  // Section 1
  company = 'namokara';
  manualVNo = '';
  receiptDate = todayLocal();   // LOCAL date — UTC shift nahi
  remark = '';
  commissionPct = 0;

  // Supplier/Buyer search
  supplierSearch = '';
  buyerSearch = '';
  supplierId = '';
  buyerId = '';
  supplier = signal<Party | null>(null);
  buyer = signal<Party | null>(null);
  supplierResults = signal<Party[]>([]);
  buyerResults = signal<Party[]>([]);

  // Payment transactions
  txns = signal<PayTxn[]>([this.newTxn()]);
  bills = signal<BillRow[]>([]);

  // Static chart data (FY view)
  monthData = [
    { label: 'Sep', collected: 60, outstanding: 25 },
    { label: 'Oct', collected: 80, outstanding: 30 },
    { label: 'Nov', collected: 55, outstanding: 30 },
    { label: 'Dec', collected: 65, outstanding: 35 },
    { label: 'Jan', collected: 55, outstanding: 22 },
    { label: 'Feb', collected: 50, outstanding: 25 }
  ];

  // ============ COMPUTED ============
  // METHOD (computed nahi) — manualVNo plain property hai, signal track nahi karta
  vNo(): string { return this.manualVNo; }
  supplierBalance = computed(() => this.supplier()?.outstandingBalance ?? 0);
  buyerBalance = computed(() => this.buyer()?.outstandingBalance ?? 0);

  totalReceived = computed(() => this.txns().reduce((s, t) => s + (+t.amount || 0), 0));

  /** Indian number-to-words for display. */
  words = amountInWords;

  // Bill ka PAYABLE total (toPay = total with tax) — netAmt to sirf taxable hai
  totalBillAmount = computed(() => this.bills().filter(b => b.selected).reduce((s, b) => s + (b.toPay || b.pending || 0), 0));
  totalDiscount = computed(() => this.bills().filter(b => b.selected).reduce((s, b) => s + (b.disAmt || 0), 0));
  // NET AMT − received. Zyada aa gaya to NEGATIVE (advance/extra) dikhega — 0 par clamp nahi.
  // (totalDiscount yahan minus nahi — wo NET AMT/toPay me pehle se kat chuka hai)
  balancePending = computed(() => this.totalBillAmount() - this.totalReceived());

  commissionAmount = computed(() => {
    const base = this.totalBillAmount() || this.totalReceived();
    return base * (this.commissionPct / 100);
  });

  // Behavior calculation
  supplierBehavior = computed<PartyBehavior>(() => this.calcBehavior(this.supplier()));
  buyerBehavior = computed<PartyBehavior>(() => this.calcBehavior(this.buyer()));

  canSave = computed(() => {
    return !!this.supplierId
        && !!this.buyerId
        && this.totalReceived() > 0
        && this.bills().some(b => b.selected);
  });

  // ============ LIFECYCLE ============
  async ngOnInit() {
    this.parties.set(await firstValueFrom(this.svc.listParties()));
    try {
      const ledgers: any = await firstValueFrom(this.http.get(`${environment.apiUrl}/api/accounting/ledgers`));
      this.bankLedgers.set(ledgers.filter((l: any) =>
        l.subGroupName === 'Bank Accounts' || l.subGroupName === 'Cash-in-Hand'));
    } catch {}

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.editId = idParam;
      this.editMode = true;
      this.loadForEdit(idParam);
    } else {
      // Bills list ke "Create Receipt" button se aaye → bill no se supplier/buyer/bill auto-fill
      const billNoParam = this.route.snapshot.queryParamMap.get('billNo');
      if (billNoParam) {
        this.billNoPick = billNoParam;
        this.onBillNoPick();
      }
    }
  }

  /** Edit = purani receipt form me load; save par purani delete + nayi banti hai */
  private async loadForEdit(id: string) {
    try {
      const d: any = await firstValueFrom(this.svc.getPayment(id));
      this.editPaymentNo = d.paymentNo || '';   // same number par re-save
      this.receiptDate = d.paymentDate;
      this.moneyToAgency = !!d.moneyToAgency;   // toggle wapas set
      this.remark = '';

      // Buyer (receipt me partyId = buyer)
      const buyer = this.parties().find(x => x.id === d.partyId);
      if (buyer) { this.selectBuyer(buyer); }

      // Supplier — notes ke "Supplier: X" se
      const pieces: string[] = (d.notes || '').split(' | ');
      const supName = pieces.find(s => s.startsWith('Supplier: '))?.slice(10);
      if (supName) {
        const sup = this.parties().find(x => x.displayName.toLowerCase() === supName.toLowerCase());
        if (sup) this.selectSupplier(sup);
      }
      // Remark = TXN/CALC/Supplier hata kar jo bacha
      this.remark = pieces.filter(s => s && !s.startsWith('TXN:') && !s.startsWith('CALC:') && !s.startsWith('Supplier: ')).join(' | ');

      // Txns wapas banao
      const validMode = (m: string): PayTxn['mode'] => {
        const x = (m || '').trim();
        return (['Cheque', 'NEFT', 'RTGS', 'UPI', 'Cash'].includes(x) ? x : 'Cheque') as PayTxn['mode'];
      };
      const txns: PayTxn[] = pieces.filter(s => s.startsWith('TXN:')).map(s => {
        const [mode, bankName, refNo, date, amount] = s.slice(4).split('|');
        return { mode: validMode(mode), bankName: bankName || '', refNo: refNo || '', date: date || todayLocal(), amount: +amount || 0 };
      });
      if (txns.length) this.txns.set(txns);
      else this.txns.set([{ mode: validMode(d.paymentMode), bankName: d.bankName || '', refNo: d.referenceNo || '', date: d.paymentDate, amount: d.amount }]);

      // Allocated bills tick karo (bills load hone ke baad).
      // Purani allocation pending me WAPAS jodo — kyunki save par purani receipt
      // delete hogi to bill ka pending utna badh jayega.
      // selectBuyer/selectSupplier ne loadBills() fire kiya hai (fire-and-forget);
      // hum yahan explicitly dobara await karte hain taaki slow network par bhi
      // bills() bharne ke BAAD hi allocations apply ho (fixed timer ka race khatam).
      await this.loadBills();
      for (const a of (d.allocations || [])) {
        const idx = this.bills().findIndex(b => b.billId === a.billId);
        if (idx >= 0) {
          this.bills.update(arr => arr.map((b, i) =>
            i === idx ? { ...b, pending: b.pending + (a.allocated || 0) } : b));
          this.toggleBill(idx, true);
        }
      }

      this.toast.info(`Receipt ${d.paymentNo} edit mode me hai — save par purani delete hokar nayi banegi`);
    } catch {
      alert('Receipt load nahi hui — list se dobara try karo');
      this.router.navigate(['/trading/payments']);
    }
  }

  // ============ HELPERS ============
  newTxn(): PayTxn {
    return { mode: 'Cheque', bankName: '', refNo: '', date: todayLocal(), amount: 0 };
  }

  calcBehavior(p: Party | null): PartyBehavior {
    if (!p) return {
      orders: 0, returnRate: 0, extraMaal: 0, avgPayDays: 0, onTimePct: 0,
      rating: 'A+', badge: 'New', badgeColor: 'reliable'
    };
    // Derive simple ratings from existing party fields
    const credit = p.creditDays || 30;
    const onTimePct = Math.min(100, Math.max(0, 100 - (credit > 45 ? 20 : 0)));
    let rating = 'A+';
    let badge = 'Reliable';
    let badgeColor = 'reliable';
    if (p.outstandingBalance > p.creditLimit && p.creditLimit > 0) {
      rating = 'C'; badge = 'High Risk'; badgeColor = 'risky';
    } else if (p.outstandingBalance > 0.7 * p.creditLimit && p.creditLimit > 0) {
      rating = 'B+'; badge = 'Average'; badgeColor = 'average';
    } else {
      badge = p.partyType === 'buyer' ? 'Good buyer' : 'Reliable';
      badgeColor = 'reliable';
    }
    return {
      orders: 0, returnRate: 0, extraMaal: 0,
      avgPayDays: credit, onTimePct, rating, badge, badgeColor
    };
  }

  // ============ SEARCH (matches name, GST, code, city, phone) ============
  // Keyboard navigation — dropdown me arrow keys + Enter
  Math = Math;
  supIdx = 0;
  buyIdx = 0;

  filterSuppliers() {
    const q = this.supplierSearch.toLowerCase().trim();
    this.supIdx = 0;
    // User dobara type kar raha hai → purani selection hatao taaki dropdown wapas khule
    this.supplierId = ''; this.supplier.set(null);
    if (!q) { this.supplierResults.set([]); return; }
    // Supplier me sirf SELLER/BOTH
    this.supplierResults.set(this.matchParty(q)
      .filter(p => p.partyType === 'seller' || p.partyType === 'both').slice(0, 8));
  }
  filterBuyers() {
    const q = this.buyerSearch.toLowerCase().trim();
    this.buyIdx = 0;
    this.buyerId = ''; this.buyer.set(null);
    if (!q) { this.buyerResults.set([]); return; }
    // Buyer me sirf BUYER/BOTH
    this.buyerResults.set(this.matchParty(q)
      .filter(p => p.partyType === 'buyer' || p.partyType === 'both').slice(0, 8));
  }
  private matchParty(q: string): Party[] {
    return this.parties().filter(p =>
      (p.displayName || '').toLowerCase().includes(q)
      || (p.gst || '').toLowerCase().includes(q)
      || (p.partyCode || '').toLowerCase().includes(q)
      || (p.city || '').toLowerCase().includes(q)
      || (p.phone || '').toLowerCase().includes(q)
    );
  }
  selectSupplier(p: Party) {
    this.supplierId = p.id;
    this.supplier.set(p);
    this.supplierSearch = p.displayName;
    this.supplierResults.set([]);
    this.loadBills();
  }
  selectBuyer(p: Party) {
    this.buyerId = p.id;
    this.buyer.set(p);
    this.buyerSearch = p.displayName;
    this.buyerResults.set([]);
    this.loadBills();
  }

  // ============ BILLS ============
  billsError = signal('');

  // India ke major banks — BANK NAME field ke datalist dropdown ke liye (type/search + arrow keys)
  bankNames: string[] = [
    'State Bank of India', 'Punjab National Bank', 'Bank of Baroda', 'Canara Bank',
    'Union Bank of India', 'Bank of India', 'Indian Bank', 'Central Bank of India',
    'Indian Overseas Bank', 'UCO Bank', 'Bank of Maharashtra', 'Punjab & Sind Bank',
    'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'IndusInd Bank',
    'Yes Bank', 'IDFC First Bank', 'Federal Bank', 'South Indian Bank', 'RBL Bank',
    'Bandhan Bank', 'IDBI Bank', 'Karur Vysya Bank', 'City Union Bank',
    'Karnataka Bank', 'Tamilnad Mercantile Bank', 'Jammu & Kashmir Bank', 'DCB Bank',
    'Dhanlaxmi Bank', 'CSB Bank', 'Nainital Bank', 'AU Small Finance Bank',
    'Equitas Small Finance Bank', 'Ujjivan Small Finance Bank', 'Jana Small Finance Bank',
    'Suryoday Small Finance Bank', 'ESAF Small Finance Bank', 'Utkarsh Small Finance Bank',
    'Bank of Rajasthan', 'Saraswat Co-operative Bank', 'Cosmos Co-operative Bank',
    'Surat District Co-operative Bank', 'The Surat People\'s Co-operative Bank',
    'Gujarat State Co-operative Bank', 'Rajkot Nagarik Sahakari Bank',
    'Paytm Payments Bank', 'Airtel Payments Bank', 'India Post Payments Bank',
    'Citibank', 'HSBC Bank', 'Standard Chartered Bank', 'DBS Bank', 'Deutsche Bank',
    'Cash'
  ];

  // ===== BILL NO direct entry — type karte hi bill select ho jata hai =====
  billNoPick = '';
  billNoPicked = signal('');
  async onBillNoPick() {
    const q = (this.billNoPick || '').trim().toLowerCase();
    if (!q) { this.billNoPicked.set(''); return; }

    // 1) Pehle current loaded bills me dhoondo (supplier/buyer already select hain to)
    const idx = this.bills().findIndex(b =>
      (b.billNo || '').toLowerCase() === q || ((b as any).dispNo || '').toLowerCase() === q);
    if (idx >= 0) {
      this.toggleBill(idx, true);              // bill select → detail niche table me
      this.billNoPicked.set((this.bills()[idx] as any).dispNo || this.bills()[idx].billNo);
      return;
    }

    // 2) Nahi mila → FIRM-WIDE lookup (bill no YA supplier bill no se) → supplier+buyer auto-fill
    try {
      const res = await firstValueFrom(this.svc.listBills({ size: 500 }));
      const items = (res.items || []).filter(b => !b.isDeleted);
      const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();
      const bill =
        items.find(b => norm(b.billNo) === q || norm(b.supplierBillNo) === q) ||
        items.find(b => norm(b.billNo).includes(q) || norm(b.supplierBillNo).includes(q));
      if (!bill) {
        this.billNoPicked.set('');
        this.toast.error(`"${this.billNoPick}" se koi bill nahi mila. Sahi bill no daalein.`);
        return;
      }
      // Supplier + Buyer auto-select (parties master se)
      const sup = this.parties().find(p => p.id === bill.partyId);
      const buy = bill.buyerPartyId ? this.parties().find(p => p.id === bill.buyerPartyId) : null;
      if (sup) this.selectSupplier(sup);
      if (buy) this.selectBuyer(buy);

      // Dono set hone ke baad us pair ke outstanding bills fresh load karo
      await this.loadBills();
      const i2 = this.bills().findIndex(b =>
        b.billId === bill.id || (b.billNo || '').toLowerCase() === norm(bill.billNo));
      const dispFound = bill.supplierBillNo || bill.billNo;
      if (i2 >= 0) {
        this.toggleBill(i2, true);
        this.billNoPicked.set((this.bills()[i2] as any).dispNo || this.bills()[i2].billNo);
      } else {
        // Bill mila par outstanding nahi (shayad already paid) — supplier/buyer to bhar gaye
        this.billNoPicked.set(dispFound);
      }
      this.toast.success(`Bill ${dispFound} mil gaya — supplier/buyer auto-fill ho gaye ✓`);
    } catch {
      this.toast.error('Bill search nahi ho paya. Dobara try karein.');
    }
  }

  // ===== BILL PICKER POPUP =====
  billPickerOpen = signal(false);
  discAlert = signal<string>('');   // group-disc blinking alert message
  openBillPicker() {
    if (!this.supplierId && !this.buyerId) {
      alert('Pehle Supplier aur Buyer select karo');
      return;
    }
    if (this.bills().length === 0) this.loadBills();   // fresh fetch
    this.billPickerOpen.set(true);
  }

  async loadBills() {
    if (!this.supplierId && !this.buyerId) return;
    this.billsError.set('');
    // Purana disc alert hatao — warna party badalne par pichhli party ka bill no
    // aur % chipka reh jata tha aur galat party par claim ho sakta tha.
    this.discAlert.set('');
    const partyId = this.buyerId || this.supplierId;
    try {
      // Supplier + Buyer dono select hain to sirf US PAIR ke beech ke bills
      const bills = await firstValueFrom(this.svc.outstandingBills(
        partyId,
        (this.buyerId && this.supplierId) ? this.supplierId : undefined
      ));
      this.bills.set(bills.map(b => ({
        selected: false,
        billId: b.id,
        billNo: b.billNo,
        dispNo: b.supplierBillNo || b.billNo,   // display SUPPLIER ka bill no — internal fallback
        date: b.billDate,
        type: b.billType,
        netAmt: b.taxableAmount || b.total,   // Taxable Amt (bill jaisa)
        taxAmt: b.taxAmount || 0,             // CGST+SGST+IGST
        grAmt: b.grAmount || 0,               // ASLI GR — return na hua ho to 0
        rateDiff: 0, packing: 0, other: 0,
        gstMode: 'after',
        entitledDisc: +(b.entitledDisc ?? 0),
        entitledDiscAmount: +((b as any).entitledDiscAmount ?? 0),
        disPct: 0,
        disAmt: 0,
        interest: 0,
        adjAmt: 0,
        // Bill ka apna NET = grand total − GR (round-off bill-banate-waqt ka) — YAHI base
        baseNet: Math.round((b.total || ((b.taxableAmount || 0) + (b.taxAmount || 0))) - (b.grAmount || 0)),
        // NET AMT = bill ka net (abhi koi manual kat-kut nahi hui)
        toPay: Math.round((b.total || ((b.taxableAmount || 0) + (b.taxAmount || 0))) - (b.grAmount || 0)),
        pending: b.total - b.paidAmount,
        commAmt: 0,
        payTermsDays: this.buyer()?.creditDays || 30,
        dueDate: this.calcDueDate(b.billDate, this.buyer()?.creditDays || 30),
        actualDays: this.daysBetween(b.billDate, this.receiptDate),
        earlyLate: 0,
        status: 'pending' as const
      })));
      this.recalcAllBills();
    } catch (e: any) {
      console.warn('No outstanding bills', e);
      // Error chhupao mat — user ko dikhao kya hua (purana API chal raha ho to bhi pata chale)
      this.billsError.set('Bills load nahi hue — API restart karke dobara try karo ('
        + (e?.status ? 'HTTP ' + e.status : 'network error') + ')');
    }
  }
  toggleBill(idx: number, val: boolean) {
    this.bills.update(arr => arr.map((b, i) => {
      if (i !== idx) return b;
      const sel = val;
      const due = this.calcDueDate(b.date, b.payTermsDays);
      const actual = this.daysBetween(b.date, this.receiptDate);
      const earlyLate = actual - b.payTermsDays;
      let status: BillRow['status'] = 'pending';
      if (sel) {
        if (earlyLate < 0) status = 'early';
        else if (earlyLate === 0) status = 'on-time';
        else status = 'late';
      }
      return { ...b, selected: sel, dueDate: due, actualDays: actual, earlyLate, status };
    }));
    // 🎯 Supplier disc recovery alert — supplier ne jitna commit kiya (6%) usme se
    // bill pe jitna diya (3%) ghata ke jo bacha, wo agency ko recover karna hai.
    if (val) {
      const b = this.bills()[idx];
      if (b && (b.entitledDisc || 0) > 0) {
        // ⚠️ Buyer ko auto-fill NAHI karna — ye supplier se RECOVER karne wala disc hai,
        // jo commission bill me claim hota hai. Yaha sirf yaad-dilane wala alert.
        // % ke saath ₹ bhi — sirf % se pata nahi chalta kitna paisa banta hai.
        // Amount backend se (sahi base = Subtotal − Fold par nikla hua). netAmt se
        // multiply karna galat tha — wo discount ke BAAD ka taxable hai.
        const recAmt = b.entitledDiscAmount || ((b.netAmt || 0) * (b.entitledDisc || 0) / 100);
        const recStr = new Intl.NumberFormat('en-IN',
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(recAmt);
        this.discAlert.set(`${b.dispNo || b.billNo} — Supplier se ${b.entitledDisc}% discount lena BAAKI hai = ₹${recStr}. Ye commission bill me claim karo.`);
      }
    }
    // Bill select karte hi pehli payment txn me NET AMT (selected bills ka total) auto bhar do
    this.autoFillReceivedAmount();
  }

  /** Selected bills ka NET AMT total → pehli (single) payment txn me auto */
  autoFillReceivedAmount() {
    const totalNet = this.bills().filter(b => b.selected)
      .reduce((s, b) => s + Math.min(b.toPay, b.pending), 0);
    const txns = this.txns();
    // Sirf jab ek hi txn ho aur uska amount khali/0 ho — user ki manually bhari value mat chhedo
    if (txns.length === 1 && (!txns[0].amount || txns[0].amount === 0)) {
      this.txns.set([{ ...txns[0], amount: +totalNet.toFixed(2) }]);
    }
  }
  updateBill(idx: number, field: keyof BillRow, value: any) {
    this.bills.update(arr => arr.map((b, i) => {
      if (i !== idx) return b;
      const updated: any = { ...b, [field]: value };
      // Recompute discount amount (taxable par)
      updated.disAmt = updated.netAmt * (updated.disPct / 100);

      // Kul deductions (discount + rate diff + packing + other)
      const deduct = (updated.disAmt || 0) + (updated.rateDiff || 0)
                   + (updated.packing || 0) + (updated.other || 0);
      const addOn  = (updated.interest || 0) + (updated.adjAmt || 0);

      if (updated.gstMode === 'before') {
        // BEFORE GST: deductions taxable par lagti hain, phir GST kam-hue-taxable par dubara.
        const taxRate = updated.netAmt > 0 ? (updated.taxAmt / updated.netAmt) : 0;
        const newTaxable = updated.netAmt - deduct;
        const newTax     = newTaxable * taxRate;
        updated.toPay = newTaxable + newTax - updated.grAmt + addOn;
      } else {
        // AFTER GST (default): bill ke apne NET (baseNet) par deductions — bill ka round-off intact.
        updated.toPay = updated.baseNet - deduct + addOn;
      }
      // NET AMT round off (paisa nahi — nearest rupee)
      updated.toPay = Math.round(updated.toPay);
      // Recompute commission
      updated.commAmt = updated.netAmt * (this.commissionPct / 100);
      // Recompute due date + actual + early/late
      updated.dueDate = this.calcDueDate(updated.date, updated.payTermsDays);
      updated.actualDays = this.daysBetween(updated.date, this.receiptDate);
      updated.earlyLate = updated.actualDays - updated.payTermsDays;
      if (updated.selected) {
        if (updated.earlyLate < 0) updated.status = 'early';
        else if (updated.earlyLate === 0) updated.status = 'on-time';
        else updated.status = 'late';
      }
      return updated;
    }));
  }
  recalcAllBills() {
    this.bills.update(arr => arr.map(b => {
      const dueDate = this.calcDueDate(b.date, b.payTermsDays);
      const actualDays = this.daysBetween(b.date, this.receiptDate);
      const earlyLate = actualDays - b.payTermsDays;
      let status: BillRow['status'] = b.status;
      if (b.selected) {
        if (earlyLate < 0) status = 'early';
        else if (earlyLate === 0) status = 'on-time';
        else status = 'late';
      }
      return { ...b, dueDate, actualDays, earlyLate, status };
    }));
  }

  calcDueDate(billDate: string, days: number): string {
    if (!billDate) return '';
    const d = new Date(billDate);
    d.setDate(d.getDate() + (+days || 0));
    return toLocalYmd(d);   // LOCAL — UTC shift se due date 1 din pichhe na jaye
  }
  daysBetween(d1: string, d2: string): number {
    if (!d1 || !d2) return 0;
    const a = new Date(d1).getTime();
    const b = new Date(d2).getTime();
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  }

  // ============ TXNS ============
  updateTxn(idx: number, field: keyof PayTxn, value: any) {
    this.txns.update(arr => arr.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }
  addTxn() { this.txns.update(arr => [...arr, this.newTxn()]); }
  scanningCheque = signal(false);
  scanCheque(e: any) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    this.scanningCheque.set(true);
    const fd = new FormData();
    fd.append('image', file);
    this.http.post<any>(`${environment.apiUrl}/api/ai/extract-cheque`, fd).subscribe({
      next: (r) => {
        this.scanningCheque.set(false);
        const t0 = this.newTxn();
        const row: any = { mode: 'Cheque', bankName: r?.bankName || '', refNo: r?.chequeNo || '', date: r?.chequeDate || t0.date, amount: +r?.amount || 0 };
        const cur = this.txns();
        if (cur.length === 1 && !cur[0].amount && !cur[0].bankName && !cur[0].refNo) this.txns.set([row]);
        else this.txns.update(arr => [...arr, row]);
      },
      error: (err) => { this.scanningCheque.set(false); alert('Cheque scan fail: ' + (err?.error?.error || 'try again')); }
    });
    if (e?.target) e.target.value = '';
  }
  removeTxn(idx: number) { this.txns.update(arr => arr.filter((_, i) => i !== idx)); }

  // ============ ACTIONS ============
  previewData = signal<PreviewData | null>(null);

  /** Proper receipt preview — pura page print karne ki jagah sundar receipt modal */
  printPreview() {
    const buyer = this.buyer();
    if (!buyer) { alert('Pehle Buyer select karo'); return; }
    const selBills = this.bills().filter(b => b.selected);
    const partyCard = {
      id: buyer.id, name: buyer.displayName, gst: buyer.gst, mobile: buyer.phone,
      city: buyer.city, address: buyer.city ? `Address on file · ${buyer.city}` : null
    };
    // ASLI supplier dikhao (Rahul Prints etc.) — Namokara to broker hai
    const sup = this.supplier();
    const supCard = sup
      ? { id: sup.id, name: sup.displayName, gst: sup.gst, mobile: sup.phone, city: sup.city,
          address: sup.city ? `Address on file · ${sup.city}` : null }
      : { name: this.features.firmName() || 'Anjaninex', gst: this.features.firmGst(), mobile: null,
          city: 'Surat', address: 'Commission Agent · Surat, Gujarat' };
    this.previewData.set({
      type: 'payment',
      title: 'PAYMENT RECEIPT',
      number: this.manualVNo || '(Auto — save par milega)',
      date: this.receiptDate,
      firmName: this.features.firmName() || 'Anjaninex',
      firmGst: this.features.firmGst(),
      firmAddress: 'Commission Agent · Surat, Gujarat',
      supplier: supCard,            // asli supplier (broker Namokara footer me hai hi)
      buyer: partyCard,
      lines: [],
      grossAmount: this.totalReceived(),
      taxableAmount: this.totalReceived(),
      totalTax: 0,
      netAmount: this.totalReceived(),
      amount: this.totalReceived(),
      paymentMode: this.txns()[0]?.mode || '',
      // Txn-wise breakup — kitna cash/cheque/UPI, kis date ko, kis bank/ref se
      paymentTxns: this.txns()
        .filter(t => t.amount > 0)
        .map(t => ({ mode: t.mode, bank: t.bankName || null, refNo: t.refNo || null, date: t.date || null, amount: t.amount })),
      balancePending: this.balancePending(),
      // Kat-kut detail — sirf non-zero (rate diff/discount minus, interest/adj plus)
      adjustments: (() => {
        const sum = (f: (b: any) => number) => selBills.reduce((s, b) => s + (f(b) || 0), 0);
        const rows: { label: string; amount: number }[] = [];
        const gross = sum(b => b.netAmt), tax = sum(b => b.taxAmt), gr = sum(b => b.grAmt);
        const rd = sum(b => b.rateDiff), dis = sum(b => b.disAmt);
        const int_ = sum(b => b.interest), adj = sum(b => b.adjAmt);
        if (selBills.length) rows.push({ label: 'Bill Amount (Gross + Tax)', amount: gross + tax });
        if (gr) rows.push({ label: 'GR (Goods Return)', amount: -gr });
        if (rd) rows.push({ label: 'Rate Diff', amount: -rd });
        if (dis) rows.push({ label: 'Discount', amount: -dis });
        if (int_) rows.push({ label: 'Interest', amount: int_ });
        if (adj) rows.push({ label: 'Adjustment', amount: adj });
        if (selBills.length) rows.push({ label: 'NET AMT', amount: sum(b => b.toPay) });
        return rows.length ? rows : undefined;
      })(),
      notes: selBills.length
        ? 'Bills: ' + selBills.map(b => (b as any).dispNo || b.billNo).join(', ')
        : (this.remark || null)
    } as PreviewData);
  }
  enableEdit() {
    alert('Edit mode: All fields enabled (already editable in this form).');
  }
  deleteReceipt() {
    if (!confirm('Delete this draft receipt? Unsaved changes will be lost.')) return;
    this.reset();
  }
  reset() {
    this.supplierId = ''; this.buyerId = '';
    this.supplier.set(null); this.buyer.set(null);
    this.supplierSearch = ''; this.buyerSearch = '';
    this.txns.set([this.newTxn()]);
    this.bills.set([]);
    this.commissionPct = 0; this.remark = ''; this.manualVNo = '';
    this.moneyToAgency = false;
    this.error.set('');
  }

  // ============ SAVE ============
  save() {
    const missing: string[] = [];
    if (!this.supplierId) missing.push('SUPPLIER (top)');
    if (!this.buyerId) missing.push('BUYER (top)');
    if (missing.length > 0) {
      const msg = '⚠️ Please fill the following:\n\n• ' + missing.join('\n• ');
      this.error.set(msg);
      alert(msg);
      return;
    }
    this.saving.set(true);
    this.error.set('');

    // PILOT safety: toggle jis firm me nahi khula, wahan hamesha broker default
    if (!this.pilotMoneyToggle()) this.moneyToAgency = false;

    // Bank/cash ledger OPTIONAL — broker receipt me paisa firm ke paas aata hi nahi.
    // Par "Agency ko mila" (aadhat) chuna ho to ledger zaroori hai — paisa cash/bank me aayega.
    const bankLedgerId = this.bankLedgers()[0]?.id ?? null;
    if (this.moneyToAgency && !bankLedgerId) {
      const msg = 'Agency ko paisa mila hai to Cash/Bank ledger chahiye — Accounting → Ledgers me "Cash" (Cash-in-Hand) ya bank account banao, fir save karo.';
      this.error.set(msg);
      alert('⚠️ ' + msg);
      this.saving.set(false);
      return;
    }

    const primary = this.txns()[0];
    const partyId = this.buyerId;  // Receipt = money in from buyer

    // Allocation kabhi RECEIVED amount se zyada nahi — warna backend reject karta tha
    // (42,487 ke bill par 42,000 aaye to 42,000 hi allocate hoga, 487 pending rahega)
    let remaining = this.totalReceived();
    const allocations = this.bills()
      .filter(b => b.selected)
      .map(b => {
        // Received se bill ka pending bharo — NET se zyada mila to bill pura PAID
        // ho jayega (extra party ke khate me advance rahta hai)
        const a = Math.min(b.pending, Math.max(0, remaining));
        remaining -= a;
        return { billId: b.billId, billNo: b.billNo, allocated: +a.toFixed(2) };
      })
      .filter(a => a.allocated > 0);

    // Kat-kut totals (selected bills) — saved preview me NET AMT ka hisaab dikhane ke liye
    const sel = this.bills().filter(b => b.selected);
    const sum = (f: (b: any) => number) => sel.reduce((s, b) => s + (f(b) || 0), 0);
    const calcPiece = sel.length
      ? `CALC:${sum(b => b.netAmt)}|${sum(b => b.taxAmt)}|${sum(b => b.grAmt)}|${sum(b => b.rateDiff)}|${sum(b => b.disAmt)}|${sum(b => b.interest)}|${sum(b => b.adjAmt)}|${sum(b => b.toPay)}`
      : '';

    const notesPieces = [
      this.remark,
      this.supplier() ? `Supplier: ${this.supplier()!.displayName}` : '',
      calcPiece,
      // HAR txn structured save — preview me "kaise-kaise received hua" table isi se banti hai
      ...this.txns().filter(t => t.amount > 0)
        .map(t => `TXN:${t.mode}|${t.bankName || ''}|${t.refNo || ''}|${t.date || ''}|${t.amount}`)
    ].filter(Boolean);

    const doCreate = () => this.svc.createPayment({
      paymentType: 'receipt',
      paymentDate: this.receiptDate,
      partyId,
      paymentMode: primary.mode.toLowerCase(),
      amount: this.totalReceived(),
      referenceNo: primary.refNo || undefined,
      bankName: primary.bankName || undefined,
      bankLedgerId,
      notes: notesPieces.join(' | ') || undefined,
      allocations: allocations.length > 0 ? allocations : undefined,
      reuseNo: (this.editMode && this.editPaymentNo) ? this.editPaymentNo : undefined,   // edit me same number
      moneyToAgency: this.moneyToAgency
    }).subscribe({
      next: (p: any) => {
        // Cheque txns -> Cheque Handover Register (pending: taken_by khaali)
        const supName = this.supplier()?.displayName || '';
        const buyName = this.buyer()?.displayName || '';
        this.txns().filter(t => (t.mode || '').toLowerCase() === 'cheque' && t.amount > 0).forEach(t => {
          this.http.post(`${environment.apiUrl}/api/trading/cheque-handovers`, {
            supplierName: supName, buyerName: buyName, paymentRef: p.paymentNo, chequeNo: t.refNo || '', bankName: t.bankName || '',
            amount: t.amount, chequeDate: t.date || '', takenBy: '', handedDate: '', commissionPaid: false, commissionAmount: 0
          }).subscribe({ next: () => {}, error: () => {} });
        });
        this.toast.success(`Receipt ${p.paymentNo} successfully save ho gaya — ₹${this.totalReceived().toFixed(2)} received, ${allocations.length} bill clear.`);
        this.router.navigate(['/trading/payments']);
      },
      error: (e) => {
        const msg = e?.error?.error ?? 'Receipt save nahi hua — dobara try karo';
        this.error.set(msg);
        alert('⚠️ ' + msg);   // error chhupe nahi — turant dikhe
        this.saving.set(false);
      }
    });

    // EDIT MODE: purani receipt delete (voucher + allocation reverse), phir same number par nayi
    if (this.editMode && this.editId) {
      this.svc.deletePayment(this.editId).subscribe({
        next: () => doCreate(),
        error: (e) => {
          alert('⚠️ Purani receipt delete nahi hui: ' + (e?.error?.error ?? 'unknown'));
          this.saving.set(false);
        }
      });
    } else {
      doCreate();
    }
  }
}
