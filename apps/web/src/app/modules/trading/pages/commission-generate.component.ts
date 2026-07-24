import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TradingSubNavComponent } from '../components/trading-sub-nav.component';
import { TradingService, Party, BillListItem } from '../services/trading.service';
import { firstValueFrom } from 'rxjs';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { amountInWords } from '../../../shared/amount-in-words.util';
import { ToastService } from '../../../shared/toast.service';
import { InDatePipe } from '../../../shared/in-date.pipe';
import { todayLocal, toLocalYmd } from '../../../shared/date.util';
import { printElement } from '../../../shared/print.util';
import { FeatureService } from '../../../shared/feature.service';

interface CommRow {
  selected: boolean;
  bill: BillListItem;
  commPct: number;
  commAmt: number;
}

import { UppercaseDirective } from '../../../shared/uppercase.directive';
import { FldDirective } from '../../../shared/fld.directive';
import { FieldConfigService } from '../../../shared/field-config.service';
@Component({
  selector: 'app-commission-generate',
  standalone: true,
  imports: [UppercaseDirective, CommonModule, FormsModule, RouterLink, DecimalPipe, TradingSubNavComponent, BackButtonComponent, InDatePipe, FldDirective],
  template: `
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
    <div class="page-top-bar flex items-center justify-between">
      <app-back-button></app-back-button>
      <!-- BAL DISC % Group Master ke PURCHASE DISC se aata hai — wahi set karne ka raasta -->
      <a href="/core-master/groups?from=commission" target="_blank"
         class="text-xs font-bold text-[#5c1a8b] border border-[#ddc8f5] rounded-lg px-3 py-1.5 hover:bg-purple-50 no-underline"
         title="Supplier ka discount % yahan set hota hai (naya tab khulega)">
        👥 Group Master — Supplier Disc %
      </a>
    </div>


    <!-- HEADER -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="font-display font-black text-2xl text-[#1B2E5C]">🧾 Generate Commission e-Invoice</h2>
        <p class="text-sm text-[#4A5878]">Select buyer + date range — auto-pulls unbilled commissions and creates one consolidated e-invoice</p>
      </div>
      <a routerLink="/trading/commission" class="back-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
        Back to Commission List
      </a>
    </div>

    <app-trading-sub-nav></app-trading-sub-nav>

    <!-- STEP 1 — FILTER -->
    <div class="card p-4 mb-4">
      <div class="text-xs font-bold text-[#DC2626] uppercase tracking-wide mb-3">STEP 1 — SELECT PARTY &amp; DATE RANGE</div>
      <div class="grid grid-cols-6 gap-3 items-end">
        <div>
          <label class="lbl">SUPPLIER <small style="color:#9CA3AF">({{ partyNames().length }})</small></label>
          <input [(ngModel)]="supplierSearch" (ngModelChange)="supplierId = ''"
                 list="cgPartyList" placeholder="🔍 Supplier naam / GST..." class="ip" autocomplete="off">
        </div>
        <div *fld="'commission_generate.buyer_filter'">
          <label class="lbl">{{ fl('buyer_filter') }}</label>
          <input [(ngModel)]="buyerSearch" (ngModelChange)="buyerId = ''"
                 list="cgPartyList" placeholder="🔍 Buyer naam / GST..." class="ip" autocomplete="off">
        </div>
        <datalist id="cgPartyList">@for (n of partyNames(); track n) { <option [value]="n"></option> }</datalist>
        <div>
          <label class="lbl">FROM DATE *</label>
          <input [(ngModel)]="fromDate" type="date" class="ip">
        </div>
        <div>
          <label class="lbl">TO DATE *</label>
          <input [(ngModel)]="toDate" type="date" class="ip">
        </div>
        <div>
          <label class="lbl">COMMISSION % <small style="color:#9CA3AF">(sab bills par)</small></label>
          <input [(ngModel)]="commPctAll" (ngModelChange)="applyCommPctAll()"
                 type="number" step="0.01" min="0" class="ip" placeholder="0">
        </div>
        <div class="flex gap-2">
          <button (click)="fetchBills()" class="btn-fetch">
            🎯 Fetch Bills
          </button>
        </div>
      </div>
      @if (selectedBuyer(); as b) {
        <div class="mt-3 p-2 rounded bg-[#FAF7F0] text-sm text-[#1B2E5C]">
          <strong>{{ b.displayName }}</strong>
          @if (b.gst) { <span class="text-xs text-[#4A5878]"> · GST: {{ b.gst }}</span> }
          <span class="text-xs text-[#4A5878]"> · Commission Rate: <strong>{{ b.commissionRate }}%</strong></span>
        </div>
      }
    </div>

    <!-- STEP 2 — BILLS PREVIEW -->
    @if (rows().length > 0) {
      <div class="card p-0 mb-4 overflow-hidden">
        <div class="px-4 py-3 bg-anjaninex-navy text-white text-xs font-bold uppercase tracking-wide flex justify-between items-center">
          <span>
            STEP 2 — REVIEW &amp; SELECT BILLS ({{ selectedCount() }} of {{ rows().length }} selected)
            @if (alreadyBilled() > 0) {
              <span class="font-normal opacity-90"> · {{ alreadyBilled() }} bill ka commission pehle ho chuka, wo hata diye</span>
            }
          </span>
          <div class="flex gap-2">
            <button (click)="selectAll(true)" class="text-xs px-2 py-1 bg-white text-[#1B2E5C] rounded font-bold">Select All</button>
            <button (click)="selectAll(false)" class="text-xs px-2 py-1 bg-white text-[#1B2E5C] rounded font-bold">Clear</button>
          </div>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-[#FAF7F0] text-[#1B2E5C] text-xs uppercase">
            <tr>
              <th class="px-3 py-2 w-10 text-center">✓</th>
              <th class="px-3 py-2 text-left">S.NO</th>
              <th class="px-3 py-2 text-left">Bill No</th>
              <th class="px-3 py-2 text-left" title="Supplier ka apna invoice number">Supp. Bill No</th>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-right">Bill Amt (₹)</th>
              <th class="px-3 py-2 text-center w-24">Comm %</th>
              <th class="px-3 py-2 text-right">Comm Amt (₹)</th>
              <th class="px-3 py-2 text-center" title="Supplier se recover karna hai (purchase − sales)">Bal Disc %</th>
              <th class="px-3 py-2 text-right">Disc Amt (₹)</th>
              <th class="px-3 py-2 text-right">Row Total (₹)</th>
              <th class="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.bill.id; let i = $index) {
              <tr class="border-t hover:bg-[#FAF7F0]" [class.bg-red-50]="r.selected">
                <td class="px-3 py-2 text-center">
                  <input type="checkbox" [(ngModel)]="r.selected" (ngModelChange)="recompute()">
                </td>
                <td class="px-3 py-2 font-mono text-xs">{{ i + 1 }}</td>
                <td class="px-3 py-2 font-mono text-xs font-bold">{{ r.bill.billNo }}</td>
                <!-- Supplier ka apna bill no — uske invoice se milaan ke liye -->
                <td class="px-3 py-2 font-mono text-xs">
                  {{ r.bill.supplierBillNo || '—' }}
                </td>
                <td class="px-3 py-2 text-xs">{{ r.bill.billDate | inDate }}</td>
                <td class="px-3 py-2 text-right font-mono">{{ r.bill.total | number:'1.2-2' }}</td>
                <td class="px-3 py-2 text-center">
                  <input type="number" step="0.01" [(ngModel)]="r.commPct" (ngModelChange)="recomputeRow(r)"
                         class="w-20 px-1 py-0.5 text-right border border-gray-300 rounded text-xs">
                </td>
                <td class="px-3 py-2 text-right font-mono font-bold text-[#DC2626]">{{ r.commAmt | number:'1.2-2' }}</td>
                <td class="px-3 py-2 text-center text-xs font-bold text-[#7C3AED]">{{ balDisc(r) | number:'1.0-2' }}%</td>
                <td class="px-3 py-2 text-right font-mono text-[#7C3AED]">{{ discAmt(r) | number:'1.2-2' }}</td>
                <td class="px-3 py-2 text-right font-mono font-bold">{{ (r.commAmt + discAmt(r)) | number:'1.2-2' }}</td>
                <td class="px-3 py-2 text-center">
                  <span class="text-xs px-2 py-0.5 rounded uppercase font-bold"
                        [class.bg-green-100]="r.bill.status === 'paid'"
                        [class.text-green-700]="r.bill.status === 'paid'"
                        [class.bg-yellow-100]="r.bill.status !== 'paid'"
                        [class.text-yellow-700]="r.bill.status !== 'paid'">
                    {{ r.bill.status }}
                  </span>
                </td>
              </tr>
            }
          </tbody>
          <tfoot class="bg-anjaninex-navy text-white">
            <tr>
              <!-- colspan 4 -> 5: 'Supp. Bill No' column jodne se ek column badh gaya -->
              <td colspan="5" class="px-3 py-3 text-right font-bold text-xs uppercase">Selected Totals →</td>
              <td class="px-3 py-3 text-right font-mono font-bold">{{ selectedBillTotal() | number:'1.2-2' }}</td>
              <td></td>
              <td class="px-3 py-3 text-right font-mono font-bold text-yellow-300">{{ selectedCommTotal() | number:'1.2-2' }}</td>
              <td></td>
              <td class="px-3 py-3 text-right font-mono font-bold text-[#C4B5FD]">{{ totalDiscRecovery() | number:'1.2-2' }}</td>
              <td class="px-3 py-3 text-right font-mono font-black">{{ grandWithRecovery() | number:'1.2-2' }}</td>
              <td></td>
            </tr>
            <tr class="border-t border-white/25 text-xs">
              <td colspan="7" class="px-3 py-2 text-right font-bold uppercase opacity-80">Supplier se lena hai →</td>
              <td colspan="2" class="px-3 py-2 text-right">
                <span class="opacity-75">Total Commission</span><br>
                <strong class="font-mono text-yellow-300 text-sm">₹{{ selectedCommTotal() | number:'1.2-2' }}</strong>
              </td>
              <td colspan="1" class="px-3 py-2 text-right">
                <span class="opacity-75">Disc Recovery</span><br>
                <strong class="font-mono text-[#C4B5FD] text-sm">₹{{ totalDiscRecovery() | number:'1.2-2' }}</strong>
              </td>
              <td colspan="2" class="px-3 py-2 text-right bg-[#DC2626]">
                <span class="opacity-90">GRAND TOTAL</span><br>
                <strong class="font-mono text-sm font-black">₹{{ grandWithRecovery() | number:'1.2-2' }}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- STEP 3 — GENERATE -->
      <div class="card p-4 mb-4">
        <div class="text-xs font-bold text-[#DC2626] uppercase tracking-wide mb-3">STEP 3 — INVOICE SETTINGS &amp; GENERATE</div>

        <!-- Commission base toggle: GST se pehle (taxable) ya GST ke baad (total) -->
        <div class="mb-3">
          <label class="lbl">COMMISSION KIS PAR LAGE?</label>
          <div class="base-toggle">
            <button type="button" (click)="setBase('before')" [class.active]="commBase === 'before'">
              Before GST <small>(Taxable Amt)</small>
            </button>
            <button type="button" (click)="setBase('after')" [class.active]="commBase === 'after'">
              After GST <small>(Total Amt)</small>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-3 items-end">
          <div>
            <label class="lbl">INVOICE NO</label>
            <input [(ngModel)]="invoiceNo" class="ip" placeholder="Auto">
          </div>
          <div *fld="'commission_generate.invoice_date'">
            <label class="lbl">{{ fl('invoice_date') }}</label>
            <input [(ngModel)]="invoiceDate" type="date" class="ip">
          </div>
          <div *fld="'commission_generate.gst_pct'">
            <label class="lbl">{{ fl('gst_pct') }}</label>
            <input appUpper [(ngModel)]="gstPct" type="number" step="0.01" class="ip">
          </div>
          <div class="flex gap-2">
            <button (click)="generate()" [disabled]="selectedCount() === 0 || saving()" class="btn-primary flex-1">
              {{ saving() ? '⏳ Saving…' : '✨ Generate, Save &amp; Preview' }}
            </button>
          </div>
        </div>

        <!-- summary strip -->
        <div class="mt-4 grid grid-cols-5 gap-3">
          <div class="summary-card">
            <div class="sc-lbl">SELECTED BILLS</div>
            <div class="sc-val">{{ selectedCount() }}</div>
          </div>
          <div class="summary-card">
            <div class="sc-lbl">TOTAL COMMISSION</div>
            <div class="sc-val">₹{{ selectedCommTotal() | number:'1.2-2' }}</div>
          </div>
          <div class="summary-card">
            <div class="sc-lbl">GST &#64; {{ gstPct }}%</div>
            <div class="sc-val text-[#1B2E5C]">₹{{ gstAmt() | number:'1.2-2' }}</div>
          </div>
          <div class="summary-card" style="border-color:#7C3AED;">
            <div class="sc-lbl" style="color:#7C3AED;">TOTAL DISC RECOVERY</div>
            <div class="sc-val text-[#7C3AED]">₹{{ totalDiscRecovery() | number:'1.2-2' }}</div>
            <div style="font-size:10px;font-weight:600;color:#7C3AED;opacity:.75;">purchase − sales disc</div>
          </div>
          <div class="summary-card bg-[#DC2626] text-white">
            <div class="sc-lbl text-white opacity-90">GRAND TOTAL</div>
            <div class="sc-val">₹{{ payableTotal() | number:'1.2-2' }}</div>
            @if (payRoundOff() !== 0) {
              <div style="font-size:11px;font-weight:600;margin-top:4px;color:#FCD34D;">
                R/Off: {{ payRoundOff() >= 0 ? '+' : '-' }} ₹ {{ (payRoundOff() < 0 ? -payRoundOff() : payRoundOff()) | number:'1.2-2' }}
              </div>
            }
            @if (payRoundOff() !== 0) {
              <div style="font-size:14px;font-weight:900;margin-top:4px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.3);">
                NET: ₹{{ netPayable() | number:'1.0-0' }}
              </div>
            }
          </div>
        </div>
        @if (netPayable() > 0) {
          <div class="cg-amt-words">📝 {{ words(netPayable()) }}</div>
        }
      </div>
    } @else if (fetched()) {
      <div class="card p-8 text-center text-gray-500">
        <div class="text-4xl mb-2">📭</div>
        <div class="font-semibold">Is date range me koi bill nahi mila.</div>
        @if (alreadyBilled() > 0) {
          <div class="text-xs text-green-700 mt-2">
            ✓ <b>{{ alreadyBilled() }}</b> bill ka commission pehle hi ban chuka hai —
            isliye wo yahan nahi dikhaye (dobara invoice na bane).
          </div>
        }
        @if (lastFetchInfo(); as f) {
          <div class="text-xs text-gray-500 mt-2">
            Supplier ke <b>{{ f.total }}</b> bill mile {{ fromDate }} → {{ toDate }} me.
            @if (f.total > 0 && f.afterBuyer === 0) {
              <span class="text-amber-700">Par un me se kisi ka buyer <b>{{ buyerSearch }}</b> nahi hai.</span>
            }
          </div>
        }
        @if (outOfRange(); as o) {
          <div class="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-300 inline-block text-left">
            <div class="text-sm text-amber-900">
              💡 Is supplier ke <b>{{ o.count }}</b> bill hain — par aapki date range ke <b>bahar</b>:
              sabse purana <b>{{ o.oldest | inDate }}</b>, sabse naya <b>{{ o.newest | inDate }}</b>.
            </div>
            <button (click)="widenRange()" class="btn-primary mt-2 text-sm">
              📅 Poora range dekho ({{ o.oldest | inDate }} se)
            </button>
          </div>
        }
        <div class="text-xs text-gray-400 mt-2">
          ⚠️ Yaad rakho: yahan <b>BILL ki date</b> se dhoonda jata hai, payment ki date se nahi.
          Purane bill ki payment aaj hui ho to bill ki apni date wala range chuno.
        </div>
      </div>
    }

    <!-- PRINT PREVIEW MODAL -->
    @if (showPreview()) {
      <div class="modal-overlay" (click)="closePreview()">
        <div class="modal-paper" (click)="$event.stopPropagation()">
          <div class="invoice-paper" id="invoicePaper" data-print-root>
            <div class="wm">NAMOKARA</div>

            <!-- Premium header band -->
            <div class="inv-band">
              <div class="ib-left">
                <div class="ib-firm">{{ features.firmName() || 'Anjaninex' }}</div>
                <div class="ib-tag">Commission Agent &amp; Brokerage Services</div>
                <div class="ib-meta">GSTIN: {{ features.firmGst() }} &nbsp;·&nbsp; Surat, Gujarat — 395003 &nbsp;·&nbsp; +91 98765 43210</div>
              </div>
              <div class="ib-right">
                <div class="ib-doctype">COMMISSION TAX INVOICE</div>
                <div class="ib-chip">{{ invoiceNo || 'COMM / ' + (invoiceDate | date:'yyyy') + ' / AUTO' }}</div>
                <div class="ib-date">Date: {{ invoiceDate | inDate }}</div>
              </div>
            </div>
            <div class="gold-rule"></div>

            <!-- Quick chips -->
            <div class="chips">
              <div class="chip"><span>BILLS</span><strong>{{ selectedCount() }}</strong></div>
              <div class="chip"><span>BILLS AMOUNT</span><strong>₹ {{ selectedBillTotal() | number:'1.0-0' }}</strong></div>
              <div class="chip"><span>COMM. BASE</span><strong>{{ commBase === 'before' ? 'Before GST' : 'After GST' }}</strong></div>
              <div class="chip chip-accent"><span>TOTAL PAYABLE</span><strong>₹ {{ netPayable() | number:'1.0-0' }}</strong></div>
            </div>

            <!-- FROM / TO -->
            <div class="inv-fromto">
              <div class="ft-box">
                <div class="ft-lbl">FROM &mdash; COMMISSION AGENT</div>
                <div class="ft-name">{{ features.firmName() || 'Anjaninex' }}</div>
                <div class="ft-line">GSTIN: {{ features.firmGst() }}</div>
                <div class="ft-line">Surat, Gujarat — 395003</div>
                <div class="ft-line">+91 98765 43210</div>
              </div>
              <div class="ft-arrow">➜</div>
              <div class="ft-box ft-to">
                <div class="ft-lbl">TO &mdash; {{ supplierId ? 'SUPPLIER' : 'BUYER' }}</div>
                @if (selectedBuyer(); as b) {
                  <div class="ft-name">{{ b.displayName }}</div>
                  @if (b.gst)   { <div class="ft-line">GSTIN: {{ b.gst }}</div> }
                  <div class="ft-line">Address: {{ b.city ? ('Address on file · ' + b.city) : (b.city || '—') }}</div>
                  <div class="ft-line">Mobile: {{ b.phone || '—' }}</div>
                  @if (b.email) { <div class="ft-line">Email: {{ b.email }}</div> }
                }
              </div>
            </div>

            <!-- Bills table -->
            <table class="inv-table">
              <thead>
                <tr>
                  <th class="t-sr">SR</th>
                  <th>BILL NO</th>
                  <th>BUYER</th>
                  <th>BILL DATE</th>
                  <th class="t-right">BILL AMT (₹)</th>
                  <th class="t-right">COMM %</th>
                  <th class="t-right">COMM AMT (₹)</th>
                  <th class="t-right">BAL DISC %</th>
                  <th class="t-right">DISC AMT (₹)</th>
                  <th class="t-right">ROW TOTAL (₹)</th>
                </tr>
              </thead>
              <tbody>
                @for (r of selectedRows(); track r.bill.id; let i = $index) {
                  <tr>
                    <td class="t-sr">{{ i + 1 }}</td>
                    <td class="mono">{{ r.bill.billNo }}</td>
                    <td>{{ r.bill.buyerName || '—' }}</td>
                    <td>{{ r.bill.billDate | inDate }}</td>
                    <td class="t-right mono">{{ r.bill.total | number:'1.2-2' }}</td>
                    <td class="t-right">{{ r.commPct }}%</td>
                    <td class="t-right mono">{{ r.commAmt | number:'1.2-2' }}</td>
                    <td class="t-right">{{ balDisc(r) | number:'1.0-2' }}%</td>
                    <td class="t-right mono">{{ discAmt(r) | number:'1.2-2' }}</td>
                    <td class="t-right mono"><strong>{{ (r.commAmt + discAmt(r)) | number:'1.2-2' }}</strong></td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="4" class="t-right"><strong>TOTALS →</strong></td>
                  <td class="t-right mono"><strong>{{ selectedBillTotal() | number:'1.2-2' }}</strong></td>
                  <td></td>
                  <td class="t-right mono"><strong>{{ selectedCommTotal() | number:'1.2-2' }}</strong></td>
                  <td></td>
                  <td class="t-right mono"><strong>{{ totalDiscRecovery() | number:'1.2-2' }}</strong></td>
                  <td class="t-right mono"><strong>{{ grandWithRecovery() | number:'1.2-2' }}</strong></td>
                </tr>
              </tfoot>
            </table>

            <!-- Payable card -->
            <div class="inv-pay-wrap">
              <div class="inv-bank">
                <div class="bank-h">BANK DETAILS</div>
                <div class="bank-l">Bank: ICICI Bank &nbsp;·&nbsp; A/C: XXXXXXXXXXX</div>
                <div class="bank-l">IFSC: ICIC0000XXX &nbsp;·&nbsp; Surat Branch</div>
                <div class="bank-words">In words: {{ words(netPayable()) }}</div>
              </div>
              <div class="inv-pay">
                <div class="pay-row"><span>Total Commission</span><strong>₹ {{ selectedCommTotal() | number:'1.2-2' }}</strong></div>
                <div class="pay-row"><span>GST &#64; {{ gstPct }}% (SAC 997119)</span><strong>₹ {{ gstAmt() | number:'1.2-2' }}</strong></div>
                @if (totalDiscRecovery() > 0) {
                  <div class="pay-row"><span>Total Disc Recovery (purchase − sales)</span><strong>₹ {{ totalDiscRecovery() | number:'1.2-2' }}</strong></div>
                }
                @if (payRoundOff() !== 0) {
                  <div class="pay-row"><span>Round Off</span><strong>{{ payRoundOff() >= 0 ? '+' : '−' }} ₹ {{ (payRoundOff() < 0 ? -payRoundOff() : payRoundOff()) | number:'1.2-2' }}</strong></div>
                }
                <div class="pay-total">
                  <span>TOTAL PAYABLE</span>
                  <strong>₹ {{ netPayable() | number:'1.0-0' }}</strong>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="inv-foot2">
              <div class="foot-terms">
                Commission payable within 7 days of invoice date. Subject to Surat jurisdiction.<br>
                This is a computer-generated invoice — no signature required.
              </div>
              <div class="foot-sig">
                For <strong>{{ features.firmName() || 'Anjaninex' }}</strong>
                <div class="sig-space"></div>
                Authorised Signatory
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button (click)="closePreview()" class="btn-cancel">Close</button>
            <button (click)="printInvoice()" class="btn-primary">🖨️ Print / Download</button>
            <button (click)="goToList()" class="btn-primary">📋 Commission List</button>
          </div>
        </div>
      </div>
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
    .card { background:#fff; border:1px solid #D6DDEA; border-radius:10px; }
    .back-link { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:700;
      color:#1B2E5C; text-decoration:none; padding:7px 12px; border:1px solid #D6DDEA;
      border-radius:6px; background:#fff; transition:all 0.15s; }
    .back-link:hover { background:#FAF7F0; border-color:#1B2E5C; color:#DC2626; }
    .back-link svg { width:14px; height:14px; }
    .lbl { display:block; font-size:10px; font-weight:700; color:#4A5878; letter-spacing:0.5px; margin-bottom:4px; }
    .ip { width:100%; padding:8px 10px; font-size:13px; border:1px solid #D6DDEA; border-radius:6px; background:#fff; color:#1B2E5C; }
    .party-dd { position:absolute; top:100%; left:0; right:0; z-index:80; background:#fff;
      border:1px solid #D6DDEA; border-radius:6px; box-shadow:0 4px 12px rgba(27,46,92,.15);
      max-height:260px; overflow-y:auto; margin-top:2px; }
    .party-opt { padding:8px 10px; border-bottom:1px solid #F5EFE3; cursor:pointer;
      display:flex; flex-direction:column; gap:2px; }
    .party-opt:hover { background:#FAF7F0; }
    .party-opt.party-active { background:#f0e6ff; border-left:3px solid #5c1a8b; }
    .party-opt strong { font-size:13px; color:#1B2E5C; }
    .party-opt small { font-size:11px; color:#4A5878; }
    .party-empty { padding:10px; font-size:12px; color:#9ca3af; }
    .ip:focus { outline:none; border-color:#1B2E5C; box-shadow:0 0 0 2px rgba(27,46,92,0.08); }
    .btn-primary { padding:9px 16px; background:#DC2626; color:#fff; border:0; border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }
    .btn-primary:disabled { background:#9CA3AF; cursor:not-allowed; }
    .btn-primary:hover:not(:disabled) { background:#B91C1C; }
    .btn-fetch { padding:9px 16px; background:var(--anjaninex-navy, #1B2E5C); color:#fff; border:0; border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }
    .btn-fetch:disabled { background:#9CA3AF; cursor:not-allowed; }
    .btn-cancel { padding:9px 16px; background:#fff; color:#1B2E5C; border:1px solid #D6DDEA; border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }
    .summary-card { background:#FAF7F0; border:1px solid #D6DDEA; border-radius:8px; padding:10px 12px; }
    .sc-lbl { font-size:10px; font-weight:700; color:#4A5878; letter-spacing:0.5px; margin-bottom:4px; }
    .sc-val { font-size:18px; font-weight:800; color:#1B2E5C; }

    /* Commission base toggle */
    .base-toggle { display:inline-flex; border:1px solid #D6DDEA; border-radius:8px; overflow:hidden; background:#fff; }
    .base-toggle button { padding:8px 16px; font-size:12px; font-weight:700; color:#4A5878; background:#fff; border:0; cursor:pointer; border-right:1px solid #D6DDEA; }
    .base-toggle button:last-child { border-right:0; }
    .base-toggle button small { display:block; font-size:9px; font-weight:600; opacity:0.7; margin-top:1px; }
    .base-toggle button.active { background:var(--anjaninex-navy, #1B2E5C); color:#fff; }

    /* MODAL */
    .modal-overlay { position:fixed; inset:0; background:rgba(27,46,92,0.55); z-index:1000; display:flex; align-items:flex-start; justify-content:center; padding:30px 20px; overflow:auto; }
    .modal-paper { background:#fff; max-width:800px; width:100%; border-radius:12px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
    .invoice-paper { padding:0 0 32px; font-family:'Inter', system-ui, sans-serif; color:#1B2E5C; position:relative; overflow:hidden; }

    /* Watermark */
    .wm { position:absolute; top:46%; left:50%; transform:translate(-50%,-50%) rotate(-22deg);
      font-size:96px; font-weight:900; letter-spacing:8px; color:rgba(27,46,92,0.05);
      pointer-events:none; user-select:none; white-space:nowrap; z-index:0; }
    .invoice-paper > *:not(.wm) { position:relative; z-index:1; }

    /* Premium header band */
    .inv-band { display:flex; justify-content:space-between; align-items:flex-start;
      background:linear-gradient(120deg,var(--anjaninex-navy, #1B2E5C) 0%,#2a4180 60%,#5c1a8b 100%);
      color:#fff; padding:24px 36px; }
    .ib-firm { font-size:26px; font-weight:900; letter-spacing:.3px; color:#fff; }
    .ib-tag { font-size:11.5px; color:#cdd6ec; margin-top:3px; letter-spacing:.4px; }
    .ib-meta { font-size:10.5px; color:#aab6d6; margin-top:8px; }
    .ib-right { text-align:right; }
    .ib-doctype { font-size:11px; font-weight:800; letter-spacing:2px; color:#e9c46a; }
    .ib-chip { display:inline-block; margin-top:6px; background:#DC2626; color:#fff;
      font-weight:800; font-size:13px; padding:5px 12px; border-radius:6px; letter-spacing:.5px; }
    .ib-date { font-size:11px; color:#cdd6ec; margin-top:6px; }

    /* From / To */
    .inv-fromto { display:flex; align-items:stretch; gap:0; padding:22px 36px 6px; }
    .ft-box { flex:1; border:1px solid #E2E6F0; border-radius:10px; padding:14px 16px; background:#FAFBFE; }
    .ft-to { border-color:#f1d9e8; background:#fcf7fb; }
    .ft-arrow { display:flex; align-items:center; padding:0 14px; color:#9aa6c4; font-size:20px; }
    .ft-lbl { font-size:9.5px; font-weight:800; letter-spacing:1px; color:#8a93ad; margin-bottom:6px; }
    .ft-name { font-size:16px; font-weight:800; color:#1B2E5C; }
    .ft-line { font-size:11.5px; color:#56607a; margin-top:2px; }

    /* Table refinements */
    .inv-table { margin:18px 36px 0; width:calc(100% - 72px); }
    .inv-table thead th { background:var(--anjaninex-navy, #1B2E5C); }
    .inv-table tfoot td { background:#FAF7F0; padding:9px 6px; font-size:11.5px; border-top:2px solid #1B2E5C; }

    /* Payable + bank row */
    .inv-pay-wrap { display:flex; gap:16px; align-items:stretch; padding:18px 36px 0; }
    .inv-bank { flex:1; border:1px dashed #cfd6e6; border-radius:10px; padding:14px 16px; background:#fff; }
    .bank-h { font-size:9.5px; font-weight:800; letter-spacing:1px; color:#8a93ad; margin-bottom:6px; }
    .bank-l { font-size:11.5px; color:#56607a; margin-top:2px; }
    .bank-words { font-size:11px; color:#065f46; font-style:italic; font-weight:600; margin-top:10px; }
    .inv-pay { width:320px; border:1px solid #E2E6F0; border-radius:10px; overflow:hidden; }
    .pay-row { display:flex; justify-content:space-between; padding:9px 16px; font-size:12.5px; color:#56607a; border-bottom:1px solid #EEF1F7; }
    .pay-row strong { color:#1B2E5C; font-family:'JetBrains Mono',monospace; }
    .pay-total { display:flex; justify-content:space-between; align-items:center; padding:13px 16px;
      background:linear-gradient(120deg,var(--anjaninex-navy, #1B2E5C),#5c1a8b); color:#fff; }
    .pay-total span { font-size:11px; font-weight:800; letter-spacing:1px; }
    .pay-total strong { font-size:20px; font-weight:900; font-family:'JetBrains Mono',monospace; }

    /* Footer */
    .inv-foot2 { display:flex; justify-content:space-between; align-items:flex-end;
      padding:26px 36px 0; margin-top:18px; }
    .foot-terms { font-size:10px; color:#9aa3b8; line-height:1.6; max-width:60%; }
    .foot-sig { text-align:right; font-size:11px; color:#56607a; }
    .foot-sig strong { color:#1B2E5C; }
    .sig-space { height:44px; }
    .inv-head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #DC2626; padding-bottom:14px; margin-bottom:20px; }
    .inv-firm-name { font-size:22px; font-weight:900; color:#DC2626; letter-spacing:0.5px; }
    .inv-firm-sub { font-size:11px; color:#4A5878; margin-top:2px; }
    .inv-no { font-size:15px; font-weight:800; color:#1B2E5C; }
    .inv-date { font-size:12px; color:#4A5878; margin-top:2px; }
    .inv-billto { margin-bottom:16px; padding:10px; background:#FAF7F0; border-radius:6px; }
    .bt-lbl { font-size:10px; font-weight:700; color:#4A5878; letter-spacing:0.5px; margin-bottom:4px; }
    .bt-name { font-size:15px; font-weight:800; color:#1B2E5C; }
    .bt-line { font-size:12px; color:#4A5878; margin-top:2px; }
    .inv-table { width:calc(100% - 72px); border-collapse:collapse; font-size:12px; margin-bottom:16px; table-layout:fixed; }
    .inv-table th, .inv-table td { overflow:hidden; text-overflow:ellipsis; }
    .inv-table th { background:var(--anjaninex-navy, #1B2E5C); color:#fff; padding:8px 6px; text-align:left; font-size:11px; font-weight:700; }
    .inv-table td { border-bottom:1px solid #E5E7EB; padding:7px 6px; }
    .inv-table .t-sr { width:30px; text-align:center; }
    .inv-table .t-right { text-align:right; }
    .inv-table .mono { font-family:'JetBrains Mono', monospace; font-size:11px; }
    .inv-totals { border-top:2px solid #1B2E5C; padding-top:10px; margin-top:10px; }
    .inv-totals .row { display:flex; justify-content:space-between; padding:4px 8px; font-size:13px; }
    .inv-totals .row.grand { font-size:16px; font-weight:900; color:#DC2626; border-top:2px solid #DC2626; margin-top:6px; padding-top:8px; }
    .inv-totals .row.words-row { font-size: 11px; color: #065f46; padding: 4px 8px; font-style: italic; font-weight: 600; }
    .inv-totals .row.words-row em { font-style: italic; }
    .cg-amt-words {
      font-size: 12px; color: #065f46;
      background: #ecfdf5; border-left: 4px solid #10b981;
      padding: 8px 12px; border-radius: 6px; margin-top: 8px;
      font-style: italic; font-weight: 600; line-height: 1.4;
    }
    .inv-foot { margin-top:28px; display:flex; justify-content:space-between; align-items:flex-end; font-size:11px; color:#4A5878; border-top:1px solid #E5E7EB; padding-top:14px; }
    .inv-foot .sig { text-align:right; font-weight:700; color:#1B2E5C; }
    .modal-actions { padding:14px 20px; background:#FAF7F0; border-top:1px solid #D6DDEA; display:flex; gap:8px; justify-content:flex-end; }

    @media print {
      body * { visibility:hidden; }
      #invoicePaper, #invoicePaper * { visibility:visible; }
      #invoicePaper { position:absolute; left:0; top:0; width:100%; padding:20px; }
      .modal-actions, .modal-overlay { display:none !important; }
    }

    @media (max-width: 640px) {
      /* All grids → single column */
      .grid-cols-4, .grid-cols-5 { grid-template-columns: 1fr !important; }
      .summary-card { width: 100% !important; max-width: 100% !important; }
      /* Invoice preview modal fits screen */
      .modal-overlay { padding: 8px; }
      .modal-paper { width: auto !important; max-width: 100% !important; }
      .inv-table { margin: 12px 8px 0; width: calc(100% - 16px); display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
      .modal-actions { flex-wrap: wrap; }
    }
  `]
})
export class CommissionGenerateComponent {
  private svc = inject(TradingService);
  features = inject(FeatureService);
  private fieldCfg = inject(FieldConfigService);
  private router = inject(Router);
  private toast = inject(ToastService);

  /** Field ka naam — firm ne Screen & Fields me badla ho to wahi dikhega. */
  fl(key: string): string { return this.fieldCfg.label('commission_generate', key); }

  buyers = signal<Party[]>([]);
  // Datalist options: naam + GST dono (report jaisa proven pattern).
  partyNames = computed(() => {
    const set = new Set<string>();
    for (const p of this.buyers()) { if (p.displayName) set.add(p.displayName); if (p.gst) set.add(p.gst); }
    return [...set].sort();
  });
  buyerId = '';
  supplierId = '';
  fromDate = this.firstOfMonth();
  toDate = this.today();
  invoiceNo = '';
  invoiceDate = this.today();
  gstPct = 18;
  // Commission base — 'after' = bill total (GST included), 'before' = taxable (GST se pehle)
  commBase: 'before' | 'after' = 'after';

  /** Jis amount par commission lagega (toggle ke hisaab se). */
  baseAmt(b: BillListItem): number {
    if (this.commBase === 'after') return b.total;
    // Before GST = taxable amount. List me taxable na ho to total se tax ghata do, warna total.
    if (b.taxableAmount && b.taxableAmount > 0) return b.taxableAmount;
    if (b.taxAmount && b.taxAmount > 0) return b.total - b.taxAmount;
    return b.total;
  }
  /** Toggle change — saare rows ka commission dobara calculate. */
  setBase(v: 'before' | 'after') {
    this.commBase = v;
    this.rows.update(rs => rs.map(r => ({
      ...r,
      commAmt: +(this.baseAmt(r.bill) * r.commPct / 100).toFixed(2)
    })));
  }

  rows = signal<CommRow[]>([]);
  discAlert = signal<string>('');   // group-disc blinking alert
  fetched = signal(false);
  showPreview = signal(false);
  saving = signal(false);
  savedId = signal<string | null>(null);

  // Bills se nikale gaye role-wise party IDs (broker model — role transactions se)
  supplierIds = signal<Set<string>>(new Set());
  buyerIds = signal<Set<string>>(new Set());

  // Party type ke hisaab se dropdown filter.
  // DETERMINISTIC: party master type OR bills se mila role — dono ka union.
  // (Pehle sirf bills-derived role par depend karta tha jo async listBills ke
  //  load-timing par nirbhar tha — isliye alag desktop/refresh par alag result
  //  aata tha. Ab master partyType bhi shaamil — har jagah same list.)
  supplierList = computed(() => {
    const sup = this.supplierIds();
    const isSup = (p: Party) => p.partyType === 'seller' || p.partyType === 'both' || sup.has(p.id);
    return this.buyers().filter(isSup);
  });
  buyerList = computed(() => {
    const buy = this.buyerIds();
    const isBuy = (p: Party) => p.partyType === 'buyer' || p.partyType === 'both' || buy.has(p.id);
    return this.buyers().filter(isBuy);
  });

  // Searchable party combo (method — computed plain-prop track nahi karta)
  Math = Math;
  supplierSearch = '';
  buyerSearch = '';
  supDropOpen = false; supIdx = 0;
  buyDropOpen = false; buyIdx = 0;
  /** Normalize — space/hyphen/punctuation hata do taaki "shiv sag" = "Shiv-Sagar" match kare */
  private norm(s: string): string {
    return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  searchSuppliers(): Party[] {
    const q = this.norm(this.supplierSearch);
    const base = this.buyers();
    if (!q) return base.slice(0, 50);
    return base.filter(p => this.norm(p.displayName).includes(q) || this.norm(p.gst || '').includes(q)).slice(0, 50);
  }
  searchBuyers(): Party[] {
    const q = this.norm(this.buyerSearch);
    const base = this.buyers();
    if (!q) return base.slice(0, 50);
    return base.filter(p => this.norm(p.displayName).includes(q) || this.norm(p.gst || '').includes(q)).slice(0, 50);
  }
  pickSupplier(p: Party) { this.supplierId = p.id; this.supplierSearch = p.displayName; this.supDropOpen = false; }
  pickBuyer(p: Party) { this.buyerId = p.id; this.buyerSearch = p.displayName; this.buyDropOpen = false; }
  closeSupSoon() { setTimeout(() => this.supDropOpen = false, 200); }
  closeBuySoon() { setTimeout(() => this.buyDropOpen = false, 200); }
  targetId(): string { return this.supplierId || this.buyerId; }

  // METHOD (computed nahi) — buyerId plain property hai, signal use track nahi karta
  selectedBuyer(): Party | undefined { return this.buyers().find(p => p.id === this.targetId()); }
  // Invoice save hote hi wo bills rows() se hat jate hain (double-save rok). Par preview
  // modal inhi computeds se chhapta hai — isliye save ke waqt rows FREEZE kar dete hain,
  // warna preview me table khali aur sab total 0 aa jata hai.
  frozenRows = signal<CommRow[] | null>(null);
  selectedRows = computed(() => this.frozenRows() ?? this.rows().filter(r => r.selected));
  selectedCount = computed(() => this.selectedRows().length);
  selectedBillTotal = computed(() => this.selectedRows().reduce((s, r) => s + r.bill.total, 0));
  selectedCommTotal = computed(() => this.selectedRows().reduce((s, r) => s + r.commAmt, 0));
  gstAmt = computed(() => +(this.selectedCommTotal() * this.gstPct / 100).toFixed(2));
  grandTotal = computed(() => +(this.selectedCommTotal() + this.gstAmt()).toFixed(2));

  /** Net amount = grandTotal rounded to nearest whole rupee. */
  netAmount = computed(() => Math.round(this.grandTotal()));

  /** Round-off difference. */
  roundOff = computed(() => +(this.netAmount() - this.grandTotal()).toFixed(2));

  /** Indian number-to-words for display. */
  words = amountInWords;

  canFetch = computed(() => !!(this.supplierId || this.buyerId) && !!this.fromDate && !!this.toDate);

  ngOnInit() {
    this.loadBilled();   // pehle se commission ho chuke bills — inhe hatana hai
    this.svc.listParties().subscribe(ps => {
      this.buyers.set(ps || []);
    });
    // Bills se role pata karo — partyId = supplier, buyerPartyId = buyer
    this.svc.listBills({ size: 1000 }).subscribe(res => {
      const sup = new Set<string>(), buy = new Set<string>();
      for (const b of res.items) {
        if (b.isDeleted) continue;
        if (b.partyId) sup.add(b.partyId);
        if (b.buyerPartyId) buy.add(b.buyerPartyId);
      }
      this.supplierIds.set(sup);
      this.buyerIds.set(buy);
    });
  }

  /** Type kiya naam/GST -> party (agar dropdown se pick nahi kiya). Ek hi match ho to auto-select. */
  private resolveTyped(text: string): { id: string; name: string } | 'many' | null {
    const q = this.norm(text);
    if (!q) return null;
    const hits = this.buyers().filter(p => this.norm(p.displayName).includes(q) || this.norm(p.gst || '').includes(q));
    const exact = hits.find(p => this.norm(p.displayName) === q);
    if (exact) return { id: exact.id, name: exact.displayName };
    if (hits.length === 1) return { id: hits[0].id, name: hits[0].displayName };
    if (hits.length > 1) return 'many';
    return null;
  }

  fetchBills() {
    // Purana disc alert hatao — party/date badle to pichhla alert nahi dikhna chahiye
    this.discAlert.set('');
    // Agar naam type kiya par dropdown se select nahi kiya -> auto-resolve
    if (!this.supplierId && this.supplierSearch.trim()) {
      const r = this.resolveTyped(this.supplierSearch);
      if (r === 'many') { alert('Supplier: "' + this.supplierSearch + '" se kai parties match hui - dropdown se ek chuno.'); return; }
      if (r) { this.supplierId = r.id; this.supplierSearch = r.name; }
      else { alert('Supplier: "' + this.supplierSearch + '" se koi party match nahi hui. Sahi naam type karo ya dropdown se chuno.'); return; }
    }
    if (!this.buyerId && this.buyerSearch.trim()) {
      const r = this.resolveTyped(this.buyerSearch);
      if (r === 'many') { alert('Buyer: "' + this.buyerSearch + '" se kai parties match hui - dropdown se ek chuno.'); return; }
      if (r) { this.buyerId = r.id; this.buyerSearch = r.name; }
      else { alert('Buyer: "' + this.buyerSearch + '" se koi party match nahi hui. Sahi naam type karo ya dropdown se chuno.'); return; }
    }
    const missing: string[] = [];
    if (!this.supplierId && !this.buyerId) missing.push('SUPPLIER ya BUYER (naam type karo ya dropdown se select karo)');
    if (!this.fromDate) missing.push('FROM DATE');
    if (!this.toDate) missing.push('TO DATE');
    if (missing.length > 0) {
      alert('⚠️ Please fill the following:\n\n• ' + missing.join('\n• '));
      return;
    }
    const buyFilter = this.buyerId;
    this.svc.listBills({
      partyId: this.supplierId || undefined,
      from: this.fromDate,
      to: this.toDate,
      // size na bhejo to backend default 50 leta hai — busy supplier ke 50 se zyada
      // bills hone par baaki chhut jate the aur "No bills found" aa jata tha.
      // 99999 = practically "sab" — commission ke liye poora range chahiye,
      // aadha data aane se commission kam ban jata (paise ka nuksaan).
      size: 99999
    }).subscribe({
      next: (res) => {
        // Commission % — STEP 1 me bhara ho to WAHI (sab bills par), warna Party Master ka rate.
        // (Party master me 0 ho to pehle har row me haath se bharna padta tha.)
        const party = this.buyers().find(p => p.id === this.targetId());
        const partyPct = +(party?.commissionRate ?? 0);
        const typedPct = +(this.commPctAll ?? 0);
        const defaultPct = typedPct > 0 ? typedPct : partyPct;
        // Field khali ho to party ka rate usme dikha do — user ko pata rahe kya lag raha hai.
        if (typedPct <= 0 && partyPct > 0) this.commPctAll = partyPct;
        let items = res.items.filter(b => !b.isDeleted);
        const supplierBillCount = items.length;
        // Jin bills ka commission PEHLE SE ban chuka hai unhe hata do — warna wahi
        // bill dobara aa jate the aur bilkul same duplicate invoice ban jati thi.
        const done = this.billedIds();
        const beforeBilled = items.length;
        if (done.size > 0) items = items.filter(b => !done.has(b.id));
        this.alreadyBilled.set(beforeBilled - items.length);
        if (buyFilter) items = items.filter(b => b.buyerPartyId === buyFilter);
        // Khali nateeje par user ko batane ke liye: supplier ke kitne bill mile the,
        // aur buyer filter ne kitne bachaye — taaki pata chale kahan chhanta gaya.
        this.lastFetchInfo.set({ total: supplierBillCount, afterBuyer: items.length });

        // Range me 0 mile? To bina date-filter ke dekho — bills HAIN par range ke
        // bahar, ya sach me hain hi nahi. Dono ka message alag hai.
        this.outOfRange.set(null);
        if (supplierBillCount === 0 && this.supplierId) {
          this.svc.listBills({ partyId: this.supplierId, size: 99999 }).subscribe({
            next: (all) => {
              const alive = all.items.filter((b: any) => !b.isDeleted && b.billDate);
              if (!alive.length) return;   // sach me koi bill nahi — purana message theek hai
              const dates = alive.map((b: any) => String(b.billDate)).sort();
              this.outOfRange.set({ count: alive.length, oldest: dates[0], newest: dates[dates.length - 1] });
            },
            error: () => { /* diagnostic hi hai — fail ho to chup rehna theek */ }
          });
        }
        const rows: CommRow[] = items.map(b => ({
          selected: true,
          bill: b,
          commPct: defaultPct,
          commAmt: +(this.baseAmt(b) * defaultPct / 100).toFixed(2)
        }));
        this.rows.set(rows);
        this.fetched.set(true);
        // 🎯 Group disc alert — jin bills ke buyer ko group me disc banta hai, unhe warn karo
        // (commission base = taxable; disc kam laga ho to base zyada hoga — user check kar le).
        const discBills = rows.filter(r => this.balDisc(r) > 0);
        if (discBills.length > 0) {
          const totalRec = discBills.reduce((s, r) => s + this.discAmt(r), 0);
          const inr = (n: number) => new Intl.NumberFormat('en-IN',
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
          // Bill-wise "% = ₹amount" — sirf kul amount se pata nahi chalta ki kis bill par
          // kitna % baaki hai. Table wale balDisc()/discAmt() se hi banate hain taaki
          // popup aur table ke numbers hamesha match karein.
          const MAX = 6;
          const parts = discBills.slice(0, MAX).map(r =>
            `${r.bill.billNo}: ${this.balDisc(r)}% = ₹${inr(this.discAmt(r))}`);
          const more = discBills.length > MAX ? ` …aur ${discBills.length - MAX} bill` : '';
          this.discAlert.set(discBills.length === 1
            ? `1 bill me supplier se discount lena BAAKI hai — ${parts[0]}. Ye commission me claim karo.`
            : `${discBills.length} bill me supplier se discount lena BAAKI hai — ${parts.join(' · ')}${more} · KUL ₹${inr(totalRec)}. Ye commission me claim karo.`);
        }
      },
      error: (e) => {
        alert('Failed to fetch bills: ' + (e?.error?.error ?? 'unknown error'));
      }
    });
  }

  // ── Supplier disc recovery (purchase − sales = balance, agency claim karti hai) ──
  balDisc(r: CommRow): number { return +((r.bill as any).entitledDisc || 0); }
  /**
   * Disc recovery ke RUPEES backend se aate hain — wahan sahi base (Subtotal − Fold,
   * yaani discount se pehle ka gross) par nikle hote hain, usi base par jis par % nikla.
   * Yahan baseAmt() se multiply NAHI karna: wo taxable (disc ke baad) ya total (GST samet)
   * deta hai — dono galat, aur Before/After GST toggle se recovery badal jaati thi
   * jabki supplier ka discount commission base se koi lena-dena nahi rakhta.
   * Fallback purane behaviour par sirf tab jab backend ne amount na bheja ho.
   */
  discAmt(r: CommRow): number {
    const fromApi = +((r.bill as any).entitledDiscAmount ?? 0);
    if (fromApi > 0) return fromApi;
    return +(this.baseAmt(r.bill) * this.balDisc(r) / 100).toFixed(2);
  }
  // Totals — GST sirf COMMISSION par (disc recovery service nahi hai)
  totalDiscRecovery = computed(() => +(this.selectedRows().reduce((s, r) => s + this.discAmt(r), 0)).toFixed(2));
  /** Table footer ka Grand Total = commission + disc recovery (GST se pehle). */
  grandWithRecovery = computed(() => +(this.selectedCommTotal() + this.totalDiscRecovery()).toFixed(2));
  /** Supplier se kul lena = commission + GST + disc recovery. */
  payableTotal = computed(() => +(this.grandTotal() + this.totalDiscRecovery()).toFixed(2));
  netPayable = computed(() => Math.round(this.payableTotal()));
  payRoundOff = computed(() => +(this.netPayable() - this.payableTotal()).toFixed(2));

  // Khali nateeja aane par diagnostic: supplier ke kitne bill mile, buyer filter ke baad kitne bache.
  lastFetchInfo = signal<{ total: number; afterBuyer: number } | null>(null);

  // Range ke BAHAR wale bills — "0 mila" par user ko wajah + 1-click ilaaj dikhane ke liye.
  // (Asli case: bill 13/01/24 ka tha, default range 01/04/24 se — user ko lagta tha
  //  bill hai hi nahi, jabki wo bas purana tha.)
  outOfRange = signal<{ count: number; oldest: string; newest: string } | null>(null);

  /** "Poora range dekho" — FROM ko supplier ke sabse purane bill par le jao aur dobara fetch. */
  widenRange() {
    const o = this.outOfRange();
    if (!o) return;
    this.fromDate = o.oldest;
    this.fetchBills();
  }

  /** Jin bills ka commission pehle se ban chuka — dobara nahi dikhane hain. */
  billedIds = signal<Set<string>>(new Set());
  /** Is fetch me kitne bill 'pehle se ho chuke' kehkar hataye — user ko batana hai. */
  alreadyBilled = signal(0);

  private loadBilled() {
    this.svc.billedBillIds().subscribe({
      next: (ids) => this.billedIds.set(new Set(ids || [])),
      error: () => { /* na mile to purana behaviour — sab bill dikhenge */ }
    });
  }

  // STEP 1 ka COMMISSION % — sab bills par ek saath lagta hai.
  // Khali/0 rakho to Party Master ka rate chalega (fetch ke waqt).
  commPctAll: number | null = null;

  /** STEP 1 ka % badla → saare rows ka commission dobara. Row me alag % chahiye
   *  to wahan bhi edit kar sakte ho (ye sirf sab par ek saath lagane ke liye hai). */
  applyCommPctAll() {
    const p = +(this.commPctAll ?? 0);
    if (!(p >= 0) || this.rows().length === 0) return;
    this.rows.set(this.rows().map(r => ({
      ...r, commPct: p, commAmt: +(this.baseAmt(r.bill) * p / 100).toFixed(2)
    })));
  }

  recomputeRow(r: CommRow) {
    r.commAmt = +(this.baseAmt(r.bill) * r.commPct / 100).toFixed(2);
    this.rows.set([...this.rows()]);  // trigger signal change
  }

  recompute() {
    this.rows.set([...this.rows()]);
  }

  selectAll(val: boolean) {
    const updated = this.rows().map(r => ({ ...r, selected: val }));
    this.rows.set(updated);
  }

  generate() {
    if (this.selectedCount() === 0) {
      alert('Please select at least one bill.');
      return;
    }
    if (!this.supplierId && !this.buyerId) {
      alert('Please select a party first.');
      return;
    }
    if (this.saving()) return;

    const rows = this.selectedRows();
    const effPct = this.selectedBillTotal() > 0
      ? +(this.selectedCommTotal() / this.selectedBillTotal() * 100).toFixed(2)
      : 0;
    const payload = {
      partyId: this.targetId(),
      commissionPct: effPct,
      gstPct: this.gstPct,
      notes: `Period ${this.fromDate} to ${this.toDate}`,
      lines: rows.map(r => ({
        billId: r.bill.id,
        billNo: r.bill.billNo,
        billDate: r.bill.billDate,
        billAmount: r.bill.total,
        commissionPct: r.commPct,
        commissionAmount: r.commAmt,
        // Supplier se recover karne wala bacha hua discount — pehle ye sirf screen par
        // dikhta tha aur save nahi hota tha, isliye invoice ka total kam save ho raha tha.
        balDiscPct: this.balDisc(r),
        discAmount: this.discAmt(r),
      })),
    };

    this.saving.set(true);
    this.svc.createCommissionInvoice(payload).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.savedId.set(res.id);
        this.invoiceNo = res.invoiceNo;
        // Neeche rows() se ye bills hat jayenge — preview ke liye pehle snapshot le lo
        this.frozenRows.set(rows);
        this.showPreview.set(true);
        // DOUBLE-SAVE ROK: jin bills ka invoice ABHI bana, unhe list se TURANT
        // hatao — pehle wo pade rehte the aur dobara Generate dabate hi wahi
        // bills phir submit ho jate the (Ho-C26/C27 jaisi jodi ban jati thi).
        const doneIds = new Set(rows.map(r => r.bill.id));
        this.rows.update(list => list.filter(r => !doneIds.has(r.bill.id)));
        // Agli baar Fetch par bhi ye bills na aayein
        this.loadBilled();
        this.toast.success(`✓ Commission invoice ${res.invoiceNo} save ho gaya!`);
      },
      error: (e) => {
        this.saving.set(false);
        alert('Save fail: ' + (e?.error?.error ?? e?.message ?? 'unknown error'));
      },
    });
  }

  closePreview() {
    this.showPreview.set(false);
    this.frozenRows.set(null);   // ab wapas live rows par
  }

  printInvoice() {
    // Sirf invoice-paper nayi saaf window me — poora page/form kabhi nahi chhapega
    printElement(document.getElementById('invoicePaper'));
  }

  goToList() {
    this.router.navigate(['/trading/commission']);
  }

  private today(): string {
    return todayLocal();
  }

  private firstOfMonth(): string {
    const d = new Date();
    return toLocalYmd(new Date(d.getFullYear(), d.getMonth(), 1));
  }
}
