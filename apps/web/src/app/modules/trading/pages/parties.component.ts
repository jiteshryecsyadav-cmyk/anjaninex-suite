import { Component, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TradingSubNavComponent } from '../components/trading-sub-nav.component';
import { TradingService, Party } from '../services/trading.service';

type FilterKey = 'all' | 'supplier' | 'buyer' | 'both' | 'aplus';
type PartyType = 'supplier' | 'buyer' | 'both';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { PaginatorComponent } from '../../../shared/paginator.component';
import { INDIAN_STATES, citiesForState, matchIndiaState } from '../../../shared/india-data';
import { IndiaPincodeService } from '../../../shared/india-pincode.service';
import { amountInWords } from '../../../shared/amount-in-words.util';
import { AccountingService } from '../../accounting/services/accounting.service';
import { LedgerStatementComponent } from '../../accounting/components/ledger-statement.component';

@Component({
  selector: 'app-parties',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive, DecimalPipe, TradingSubNavComponent, BackButtonComponent, PaginatorComponent, LedgerStatementComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <!-- ============ HEADER ============ -->
      <div class="pm-header">
        <div class="pmh-left">
          <span class="pmh-ico">👥</span>
          <div>
            <h2 class="pmh-title">Party Master</h2>
            <p class="pmh-sub">{{ totalCount() }} parties · 🛍️ {{ supCount() }} suppliers · 🛒 {{ buyCount() }} buyers · ↔️ {{ multiCount() }} both · 👨‍💼 {{ staffCount() }} staff</p>
          </div>
        </div>
        <div class="pmh-right">
          <span class="pmh-fy">FY 2025-26</span>
          <a routerLink="/accounting/ledgers" class="pmh-btn">📒 Accounting →</a>
        </div>
      </div>

      <!-- ============ SUB-NAV (trading) ============ -->
      <app-trading-sub-nav></app-trading-sub-nav>

            <!-- ============ 6 KPI CARDS ============ -->
      <div class="kpi-row">
        <div class="kpi" style="border-left:4px solid #1B2E5C;background:#1b2e5c0d"><div class="kpi-ico">👥</div><div class="kpi-num" style="color:#1B2E5C">{{ totalCount() }}</div><div class="kpi-lbl">TOTAL PARTIES</div></div>
        <div class="kpi" style="border-left:4px solid #0ea5e9;background:#0ea5e90d"><div class="kpi-ico">🛍️</div><div class="kpi-num" style="color:#0284c7">{{ supCount() }}</div><div class="kpi-lbl">SUPPLIERS</div></div>
        <div class="kpi" style="border-left:4px solid #16a34a;background:#16a34a0d"><div class="kpi-ico">🛒</div><div class="kpi-num" style="color:#16a34a">{{ buyCount() }}</div><div class="kpi-lbl">BUYERS</div></div>
        <div class="kpi" style="border-left:4px solid #9333ea;background:#9333ea0d"><div class="kpi-ico">🔄</div><div class="kpi-num" style="color:#9333ea">{{ multiCount() }}</div><div class="kpi-lbl">MULTI-ROLE</div></div>
        <div class="kpi" style="border-left:4px solid #d97706;background:#d977060d"><div class="kpi-ico">👨‍💼</div><div class="kpi-num" style="color:#d97706">{{ staffCount() }}</div><div class="kpi-lbl">STAFF</div></div>
        <div class="kpi kpi-money"><div class="kpi-money-v">{{ buyerOS() | number:'1.2-2' }}</div><div class="kpi-lbl">💰 BUYER OUTSTANDING</div>@if (inWords(buyerOS())) {<div class="kpi-words">{{ inWords(buyerOS()) }}</div>}</div>
        <div class="kpi kpi-money kpi-money-r"><div class="kpi-money-v">{{ supplierPay() | number:'1.2-2' }}</div><div class="kpi-lbl">💸 SUPPLIER PAYABLE</div>@if (inWords(supplierPay())) {<div class="kpi-words">{{ inWords(supplierPay()) }}</div>}</div>
      </div>

      <!-- ============ 3 CHARTS ============ -->
      <div class="grid grid-cols-3 gap-4 mt-4">
        <div class="widget col-span-1" style="grid-column: span 2">
          <div class="widget-head"><h3>📊 PARTY-WISE OUTSTANDING (₹)</h3></div>
          <svg viewBox="0 0 580 200" class="chart-svg">
            <text x="5" y="25" class="ax-lbl">{{ outAxis(1) }}</text>
            <text x="5" y="100" class="ax-lbl">{{ outAxis(0.5) }}</text>
            <text x="15" y="175" class="ax-lbl">0</text>
            @for (p of topParties(); track p.name; let i = $index) {
              <g [attr.transform]="'translate(' + (50 + i * 95) + ', 0)'">
                <rect [attr.x]="0" [attr.y]="170 - p.receivable" [attr.width]="28" [attr.height]="p.receivable" fill="#5c1a8b" rx="2"/>
                <rect [attr.x]="34" [attr.y]="170 - p.payable" [attr.width]="28" [attr.height]="p.payable" fill="#DC2626" rx="2"/>
                <text x="31" y="190" class="ax-lbl" text-anchor="middle">{{ p.name.substring(0, 12) }}</text>
              </g>
            }
          </svg>
          <div class="legend-row"><span><span class="lg-dot" style="background:#5c1a8b"></span> Receivable (₹)</span> <span><span class="lg-dot" style="background:#DC2626"></span> Payable (₹)</span></div>
        </div>

        <div class="widget">
          <div class="widget-head"><h3>👥 PARTY TYPE MIX</h3></div>
          @if (typeMix().length) {
            <svg viewBox="0 0 200 180" class="chart-svg-donut">
              <circle cx="100" cy="90" r="65" fill="none" stroke="#F5EFE3" stroke-width="22"/>
              @for (s of typeMix(); track s.label) {
                <circle cx="100" cy="90" r="65" fill="none" [attr.stroke]="s.color" stroke-width="22"
                        [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 100 90)"/>
              }
            </svg>
            <div class="legend-row legend-wrap">
              @for (s of typeMix(); track s.label) {
                <span><span class="lg-dot" [style.background]="s.color"></span> {{ s.label }} {{ s.pct }}% ({{ s.value }})</span>
              }
            </div>
          } @else {
            <div class="chart-empty-p">Abhi koi party nahi</div>
          }
        </div>
      </div>

      <div class="widget mt-4">
        <div class="widget-head">
          <h3>🌆 CITY-WISE PARTIES</h3>
          @if (cityChips().hidden > 0) {
            <span class="text-xs text-gray-400">+{{ cityChips().hidden }} aur cities</span>
          }
        </div>
        @if (cityChips().chips.length) {
          <div class="city-chips">
            @for (c of cityChips().chips; track c.name) {
              <span class="city-chip" [style.borderColor]="c.color">
                <span class="city-dot" [style.background]="c.color"></span>
                {{ c.name }}
                <strong>{{ c.count }}</strong>
              </span>
            }
          </div>
        } @else {
          <div class="chart-empty-p">Abhi koi party nahi</div>
        }
      </div>

      <!-- ============ SEARCH + FILTERS + ADD ============ -->
      <div class="search-row mt-4">
        <div class="search-wrap">
          <span class="search-ico">🔍</span>
          <input [(ngModel)]="searchQuery" (input)="onSearch()" type="text" placeholder="Name, GSTIN, city, mobile, PAN..." class="search-input">
        </div>
        <div class="filter-tabs">
          <button (click)="filter.set('all')" [class.ft-active]="filter() === 'all'" class="ft-btn">All</button>
          <button (click)="filter.set('supplier')" [class.ft-active]="filter() === 'supplier'" class="ft-btn">🛍️ Supplier</button>
          <button (click)="filter.set('buyer')" [class.ft-active]="filter() === 'buyer'" class="ft-btn">🛒 Buyer</button>
          <button (click)="filter.set('both')" [class.ft-active]="filter() === 'both'" class="ft-btn">🔄 Sup+Buy</button>
          <button (click)="filter.set('aplus')" [class.ft-active]="filter() === 'aplus'" class="ft-btn">⭐ A+ Rating</button>
        </div>
        <button (click)="openAdd()" class="btn-add">+ Add Party</button>
      </div>

      <!-- ============ RICH TABLE ============ -->
      <div class="card p-0 overflow-hidden mt-3">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
        @else if (filtered().length === 0) {
          <div class="p-8 text-center text-gray-500">No parties match the filters</div>
        }
        @else {
          <table class="party-table">
            <thead>
              <tr><th class="w-8">#</th><th>PARTY NAME</th><th>TYPE</th><th>CITY / GSTIN</th><th>MOBILE</th><th>RATING</th><th class="text-right">BUYER O/S (RECEIVABLE)</th><th class="text-right">SUPPLIER O/S (PAYABLE)</th><th class="text-right">CREDIT LIMIT</th><th class="text-center">ACTIONS</th></tr>
            </thead>
            <tbody>
              @for (p of pagedParties(); track p.id; let i = $index) {
                <tr>
                  <td>{{ (pageClamped()-1)*pageSize() + i + 1 }}</td>
                  <td>
                    <div class="cell-name">
                      <div class="avatar" [style.background]="avatarColor(p)">{{ initials(p.displayName) }}</div>
                      <div>
                        <div class="name-text">{{ p.displayName }}
                          @if (behOf(p.id); as bh) {
                            <span class="beh-chip" [class]="'bc-' + (bh.grade === 'A+' ? 'ap' : bh.grade.toLowerCase())"
                                  [title]="bh.badge || ''">{{ bh.grade }}</span>
                            <span class="beh-stars-sm">{{ stars(bh.stars) }}</span>
                          }
                        </div>
                        <div class="name-mob">{{ p.phone || '—' }}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="type-badge" [class.type-sup]="p.partyType === 'seller'" [class.type-buy]="p.partyType === 'buyer'" [class.type-both]="p.partyType === 'both'">
                      @if (p.partyType === 'seller') { 🛍️ Supplier }
                      @else if (p.partyType === 'buyer') { 🛒 Buyer }
                      @else { 🔄 Sup+Buy }
                    </span>
                  </td>
                  <td>
                    <div class="cell-city">{{ p.city || '—' }}</div>
                    <div class="cell-gst">{{ p.gst || '—' }}</div>
                  </td>
                  <td class="font-mono text-xs">{{ p.phone || '—' }}</td>
                  <td>
                    <span class="rate-badge">A+</span>
                    <span class="stars">★★★★★</span>
                    <div class="rate-note">{{ p.partyType === 'seller' ? 'Best supplier — zero issues' : 'Excellent — hamesha time par' }}</div>
                  </td>
                  <td class="text-right">
                    @if (p.partyType === 'buyer' || p.partyType === 'both') {
                      <div class="font-mono font-bold text-red-600">₹ {{ (p.outstandingBalance > 0 ? p.outstandingBalance : 0) | number:'1.2-2' }}</div>
                      <div class="credit-bar"><div class="credit-fill credit-warn" [style.width.%]="creditPct(p)"></div></div>
                    } @else { — }
                  </td>
                  <td class="text-right">
                    @if (p.partyType === 'seller' || p.partyType === 'both') {
                      <div class="font-mono font-bold">₹ {{ (p.outstandingBalance < 0 ? -p.outstandingBalance : 0) | number:'1.2-2' }}</div>
                    } @else { — }
                  </td>
                  <td class="text-right">
                    @if (p.creditLimit > 0) {
                      <div class="font-mono">₹ {{ p.creditLimit | number:'1.2-2' }}</div>
                      <div class="credit-pct">
                        <span class="credit-tag" [class.tag-ok]="creditPct(p) < 60" [class.tag-warn]="creditPct(p) >= 60 && creditPct(p) < 80" [class.tag-red]="creditPct(p) >= 80">
                          {{ creditPct(p) < 60 ? '✅ OK' : creditPct(p) < 80 ? '⚠️ ' + creditPct(p) + '%' : '🔴 ' + creditPct(p) + '%' }}
                        </span>
                      </div>
                    } @else { — }
                  </td>
                  <td class="text-center">
                    <button (click)="view(p)" class="act-btn act-view">👁</button>
                    <button (click)="openLedger(p)" class="act-btn act-ledger" title="Ledger / Khata">📒</button>
                    <button (click)="edit(p)" class="act-btn act-edit">✏️</button>
                    <button (click)="chat(p)" class="act-btn act-chat">💬</button>
                    <button (click)="del(p.id)" class="act-btn act-del">🗑</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <app-paginator [total]="filtered().length" [page]="pageClamped()" [pageSize]="pageSize()"
                         (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event); page.set(1)"></app-paginator>
        }
      </div>

      <!-- ============ ADD PARTY MODAL (4 steps) ============ -->
      @if (showForm()) {
        <div class="modal-backdrop" (click)="closeForm()">
          <div class="modal-box" (click)="$event.stopPropagation()">

            <div class="modal-header">
              <div class="modal-title">👤 {{ editingId() ? 'Edit Party' : 'Add New Party' }}</div>
              <button (click)="closeForm()" class="modal-close">✕</button>
            </div>

            <div class="modal-body">

              <!-- STEP 1: PARTY TYPE -->
              <div class="step-head">
                <span class="step-num">1️⃣</span>
                <span class="step-title">PARTY TYPE (CONDITION)</span>
              </div>
              <div class="type-cards">
                <div class="type-card" [class.tc-active]="newType() === 'supplier'" (click)="newType.set('supplier')">
                  <div class="tc-ico">🛍️</div>
                  <div class="tc-name">Supplier Only</div>
                  <div class="tc-desc">Hum inse maal khareedte hain</div>
                  <div class="tc-desc-hi">Outstanding = Hum unhe dena hai</div>
                </div>
                <div class="type-card" [class.tc-active]="newType() === 'buyer'" (click)="newType.set('buyer')">
                  <div class="tc-ico">🛒</div>
                  <div class="tc-name">Buyer Only</div>
                  <div class="tc-desc">Ye humse maal khareedte hain</div>
                  <div class="tc-desc-hi">Outstanding = Ye humein dena hai</div>
                </div>
                <div class="type-card" [class.tc-active]="newType() === 'both'" (click)="newType.set('both')">
                  <div class="tc-ico">🔄</div>
                  <div class="tc-name">Supplier + Buyer Both</div>
                  <div class="tc-desc">Ek hi party — dono roles</div>
                  <div class="tc-desc-hi">Dono outstanding alag track</div>
                </div>
              </div>

              <!-- STEP 2: BASIC INFO -->
              <div class="step-head">
                <span class="step-num">2️⃣</span>
                <span class="step-title">BASIC INFORMATION</span>
              </div>
              <form [formGroup]="form" class="grid grid-cols-3 gap-3 mt-3">
                <div class="col-span-2">
                  <label class="lbl">PARTY / FIRM NAME *</label>
                  <input formControlName="displayName" placeholder="Full firm name" class="ip">
                </div>
                <div>
                  <label class="lbl">GSTIN</label>
                  <div class="flex gap-1">
                    <input formControlName="gst" placeholder="24XXXXX0000X1ZX" class="ip">
                    <button type="button" (click)="fetchGst()" class="btn-fetch">🔍 Fetch</button>
                  </div>
                </div>
                <div>
                  <label class="lbl">PAN NUMBER <small>10 chars · ABCDE1234F</small></label>
                  <input formControlName="pan" placeholder="ABCDE1234F" class="ip">
                </div>
                <div>
                  <label class="lbl">MOBILE *</label>
                  <input formControlName="phone" placeholder="9876543210" class="ip">
                </div>
                <div>
                  <label class="lbl">WHATSAPP – SUPPLIER</label>
                  <input formControlName="waSupplier" placeholder="Bechne wala no." class="ip">
                </div>
                <div>
                  <label class="lbl">WHATSAPP – BUYER</label>
                  <input formControlName="waBuyer" placeholder="Khareedne wala no." class="ip">
                </div>
                <div>
                  <label class="lbl">GROUP (SISTER FIRMS)</label>
                  <input formControlName="groupName" list="partyGroupsList" placeholder="Group choose ya naya" class="ip">
                  <datalist id="partyGroupsList">
                    @for (g of partyGroups(); track g) { <option [value]="g"></option> }
                  </datalist>
                </div>
                @if (newType() === 'supplier' || newType() === 'both') {
                <div>
                  <label class="lbl">SUPPLIER TYPE</label>
                  <select formControlName="supplierType" class="ip">
                    <option value="">Select...</option>
                    <option value="manufacturer">Manufacturer</option>
                    <option value="wholesaler">Wholesaler</option>
                    <option value="trader">Trader</option>
                    <option value="weaver_mill">Weaver / Mill</option>
                    <option value="processor">Processor / Dyeing</option>
                    <option value="job_worker">Job Worker</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                }
                @if (newType() === 'buyer' || newType() === 'both') {
                <div>
                  <label class="lbl">BUYER TYPE</label>
                  <select formControlName="buyerType" class="ip">
                    <option value="">Select...</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="retailer">Retailer</option>
                    <option value="distributor">Distributor</option>
                    <option value="semi_wholesale">Semi-Wholesale</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                }
                <div>
                  <label class="lbl">WHATSAPP – EXTRA</label>
                  <input formControlName="waExtra" placeholder="Accountant/Manager no." class="ip">
                </div>
                <div>
                  <label class="lbl">EXTRA WA – ROLE</label>
                  <select formControlName="waExtraRole" class="ip">
                    <option value="">Select...</option>
                    <option value="accountant">Accountant</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
                <div>
                  <label class="lbl">UDYAM AADHAAR NO</label>
                  <input formControlName="udyamNo" placeholder="UDYAM-XX-00-0000000" class="ip">
                </div>
                <div>
                  <label class="lbl">MSME TYPE</label>
                  <select formControlName="msmeType" class="ip">
                    <option value="">Select...</option>
                    <option value="micro">Micro</option>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="small_trader">Small (Trader)</option>
                    <option value="micro_trader">Micro (Trader)</option>
                    <option value="not_registered">Not Registered</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                @if (newType() === 'buyer' || newType() === 'both') {
                <div>
                  <label class="lbl">🤝 BUYER AGENT (payment guarantee)</label>
                  <select formControlName="buyerAgentId" class="ip" (change)="onAgentChange()">
                    <option value="">- None -</option>
                    @for (a of agents(); track a.id) {
                      <option [value]="a.id">{{ a.name }}{{ a.city ? ' (' + a.city + ')' : '' }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="lbl">AGENT SHARE % <small style="color:#9CA3AF">(hamari commission ka)</small></label>
                  <input formControlName="buyerAgentSharePct" type="number" step="0.01" placeholder="e.g. 25" class="ip">
                </div>
                }
                <div class="col-span-3">
                  <label class="lbl">ADDRESS</label>
                  <textarea formControlName="address" placeholder="Shop / office address" rows="2" class="ip"></textarea>
                </div>
                <div>
                  <label class="lbl">PIN CODE <small style="color:#9CA3AF">(city/state auto)</small></label>
                  <input formControlName="pincode" placeholder="395002" class="ip" maxlength="6"
                         (input)="onPincodeInput()">
                </div>
                <div>
                  <label class="lbl">STATE</label>
                  <select formControlName="state" class="ip">
                    <option value="">— Select —</option>
                    @for (s of indiaStates; track s.name) {
                      <option [value]="s.name">{{ s.name }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="lbl">CITY *</label>
                  <input formControlName="city" placeholder="Type ya choose" class="ip"
                         list="ptCityList" (change)="onCityInput()">
                  <datalist id="ptCityList">
                    @for (c of cityOptions(); track c) { <option [value]="c"></option> }
                  </datalist>
                </div>
                <div class="col-span-2">
                  <label class="lbl">EMAIL</label>
                  <input formControlName="email" placeholder="email@example.com" class="ip">
                </div>
                <div>
                  <label class="lbl">BRANCH</label>
                  <select formControlName="branch" class="ip">
                    <option value="">— None —</option>
                    <option value="jaipur">Jaipur HQ</option>
                    <option value="delhi">Delhi</option>
                    <option value="surat">Surat</option>
                    <option value="mumbai">Mumbai</option>
                  </select>
                </div>
              </form>

              <!-- STEP 3: CONTACT -->
              <div class="step-head">
                <span class="step-num">3️⃣</span>
                <span class="step-title">CONTACT PERSON</span>
              </div>
              <form [formGroup]="form" class="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <label class="lbl">CONTACT PERSON</label>
                  <input formControlName="contactPerson" placeholder="Name" class="ip">
                </div>
                <div>
                  <label class="lbl">CONTACT MOBILE</label>
                  <input formControlName="contactMobile" placeholder="9876543210" class="ip">
                </div>
                <div>
                  <label class="lbl">OFFICE / LANDLINE</label>
                  <input formControlName="landline" placeholder="0261-XXXXXXX" class="ip">
                </div>
              </form>

              <!-- STEP 4: RATING & PERFORMANCE -->
              <div class="step-head">
                <span class="step-num">4️⃣</span>
                <span class="step-title">RATING & PERFORMANCE</span>
              </div>
              <form [formGroup]="form" class="grid grid-cols-5 gap-3 mt-3">
                <div>
                  <label class="lbl">RATING</label>
                  <select formControlName="rating" class="ip">
                    <option value="A+">A+ (Excellent)</option>
                    <option value="A">A (Good)</option>
                    <option value="B">B (Average)</option>
                    <option value="C">C (Risky)</option>
                  </select>
                </div>
                <div>
                  <label class="lbl">STARS (1-5)</label>
                  <select formControlName="stars" class="ip">
                    <option value="5">★★★★★</option>
                    <option value="4">★★★★☆</option>
                    <option value="3">★★★☆☆</option>
                    <option value="2">★★☆☆☆</option>
                    <option value="1">★☆☆☆☆</option>
                  </select>
                </div>
                <div>
                  <label class="lbl">AVG PAY DAYS (BUYER)</label>
                  <input formControlName="avgPayDays" type="number" placeholder="45" class="ip">
                </div>
                <div>
                  <label class="lbl">RETURN RATE %</label>
                  <input formControlName="returnRate" type="number" step="0.1" placeholder="2.5" class="ip">
                </div>
                <div>
                  <label class="lbl">COMMISSION % <small style="color:#9CA3AF">(optional)</small></label>
                  <input formControlName="commission" type="number" step="0.1" placeholder="0" class="ip">
                </div>
                <div class="col-span-5">
                  <label class="lbl">FLAG / SPECIAL NOTE</label>
                  <input formControlName="note" placeholder="e.g. ⚠️ Late payer — extra follow up needed" class="ip">
                </div>
                <div class="col-span-5">
                  <label class="lbl">💸 DISCOUNTS % <small style="color:#9CA3AF">(supplier deta hai — Order/Bill me 1-click apply)</small></label>
                  <div class="grid grid-cols-3 gap-3">
                    <div>
                      <input formControlName="discountNormal" type="number" step="0.1" min="0" placeholder="0" class="ip">
                      <small style="color:#6B7280;font-size:11px">Normal</small>
                    </div>
                    <div>
                      <input formControlName="discountExhibition" type="number" step="0.1" min="0" placeholder="0" class="ip">
                      <small style="color:#6B7280;font-size:11px">Exhibition</small>
                    </div>
                    <div>
                      <input formControlName="discountSpecial" type="number" step="0.1" min="0" placeholder="0" class="ip">
                      <small style="color:#6B7280;font-size:11px">Special</small>
                    </div>
                  </div>
                </div>
              </form>

              <!-- STEP 5: OPENING (conditional) -->
              @if (newType()) {
                <div class="step-head">
                  <span class="step-num">5️⃣</span>
                  <span class="step-title">OPENING OUTSTANDING</span>
                </div>
                <form [formGroup]="form" class="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <label class="lbl">CREDIT LIMIT (₹)</label>
                    <input formControlName="creditLimit" type="number" placeholder="50000" class="ip">
                    @if (form.value.creditLimit && inWords(form.value.creditLimit)) {
                      <div class="amt-words">{{ inWords(form.value.creditLimit) }}</div>
                    }
                  </div>
                  <div>
                    <label class="lbl">CREDIT DAYS</label>
                    <input formControlName="creditDays" type="number" placeholder="30" class="ip">
                  </div>
                  <div>
                    <label class="lbl">OPENING BALANCE</label>
                    <input formControlName="openingBalance" type="number" placeholder="0" class="ip">
                  </div>
                </form>
              } @else {
                <div class="open-hint">👆 Pehle party type select karein — tab outstanding fields aayenge</div>
              }

            </div>

            <div class="modal-footer">
              <button (click)="closeForm()" class="btn-cancel">Cancel</button>
              <button (click)="save()" [disabled]="form.invalid || saving() || !newType()" class="btn-save">
                {{ saving() ? 'Saving...' : '✓ Save Party' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Ledger / Khata statement modal (Party Master shortcut) -->
      @if (ledgerStmtId()) {
        <app-ledger-statement
          [ledgerId]="ledgerStmtId()!"
          [initialName]="ledgerStmtName()"
          (close)="ledgerStmtId.set(null)">
        </app-ledger-statement>
      }

    </div>
  `,
  styles: [`
    :host { display: block; background: #FAF7F0; min-height: 100vh; padding: 16px 24px; }

    .pm-header {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 14px 22px; border-radius: 12px;
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;
      box-shadow: 0 2px 8px rgba(27,46,92,0.12);
    }
    .pmh-left { display: flex; align-items: center; gap: 12px; }
    .pmh-ico { font-size: 26px; }
    .pmh-title { font-size: 19px; font-weight: 800; margin: 0; }
    .pmh-sub { font-size: 12px; opacity: 0.85; margin: 0; }
    .pmh-right { display: flex; align-items: center; gap: 10px; }
    .pmh-fy { background: rgba(255,255,255,0.15); padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .pmh-btn { background: #DC2626; color: #fff; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; text-decoration: none; }
    .pmh-btn:hover { background: #B91C1C; }

    /* KPIs */
    .kpi-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
    .kpi {
      background: #fff; border: 1px solid #D6DDEA; border-radius: 10px; padding: 14px;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .kpi:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(27,46,92,0.08); }
    .kpi-ico { font-size: 22px; }
    .kpi-num { font-size: 26px; font-weight: 900; color: #1B2E5C; font-family: 'JetBrains Mono', monospace; margin-top: 4px; }
    .kpi-lbl { font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.3px; text-transform: uppercase; margin-top: 4px; }
    .kpi-money { border-top: 4px solid #DC2626; }
    .kpi-money-r { border-top-color: #F97316; }
    .kpi-money-v { font-size: 17px; font-weight: 800; color: #DC2626; font-family: 'JetBrains Mono', monospace; }
    .kpi-money-r .kpi-money-v { color: #F97316; }
    .kpi-words { font-size: 10px; font-weight: 600; color: #4A5878; font-style: italic; margin-top: 3px; line-height: 1.3; }

    /* Widgets */
    .widget { background: #fff; border: 1px solid #D6DDEA; border-radius: 12px; padding: 14px; }
    .widget-head h3 { font-size: 12px; font-weight: 800; color: #1B2E5C; margin: 0 0 8px; letter-spacing: 0.4px; }
    .chart-svg { width: 100%; max-height: 220px; }
    .chart-svg-donut { width: 100%; max-height: 180px; }
    .ax-lbl { font-size: 9px; fill: #6B7280; }
    .legend-row { display: flex; gap: 14px; margin-top: 8px; font-size: 11px; color: #4A5878; }
    .chart-empty-p { padding: 40px 10px; text-align: center; color: #9CA3AF; font-size: 11px; }

    /* City chip cloud — kitni bhi cities, height compact */
    .city-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .city-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;
      background: #FAF7F0; border: 1.5px solid; color: #1B2E5C;
    }
    .city-chip strong {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; border-radius: 999px;
      padding: 1px 7px; font-size: 10px;
    }
    .city-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .legend-wrap { flex-wrap: wrap; }
    .lg-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; }

    /* Search + Filters */
    .search-row { display: flex; gap: 10px; align-items: center; }
    .search-wrap { flex: 1; position: relative; }
    .search-ico { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; opacity: 0.6; }
    .search-input {
      width: 100%; padding: 10px 14px 10px 36px; border: 1px solid #D6DDEA; border-radius: 999px;
      font-size: 13px; color: #1B2E5C; background: #fff; font-family: inherit;
    }
    .search-input:focus { outline: none; border-color: #DC2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.1); }
    .filter-tabs { display: flex; gap: 4px; }
    .ft-btn {
      padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 700;
      background: #fff; border: 1px solid #D6DDEA; color: #4A5878; cursor: pointer; font-family: inherit;
    }
    .ft-btn:hover { border-color: #1B2E5C; }
    .ft-active { background: var(--anjaninex-navy, #1B2E5C) !important; color: #fff !important; border-color: var(--anjaninex-navy, #1B2E5C) !important; }
    .btn-add {
      padding: 10px 20px; background: #DC2626; color: #fff; border-radius: 999px;
      font-size: 13px; font-weight: 800; border: 0; cursor: pointer; font-family: inherit;
      box-shadow: 0 2px 6px rgba(220,38,38,0.3);
    }
    .btn-add:hover { background: #B91C1C; }

    /* Table */
    .party-table { width: 100%; font-size: 12px; border-collapse: collapse; background: #fff; }
    .party-table thead { background: var(--anjaninex-navy, #1B2E5C); color: #fff; }
    .party-table th { padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
    .party-table th.text-right { text-align: right; }
    .party-table th.text-center { text-align: center; }
    .party-table td { padding: 12px 8px; border-bottom: 1px solid #F5EFE3; vertical-align: middle; }
    .party-table tbody tr:hover { background: #FAF7F0; }
    .cell-name { display: flex; align-items: center; gap: 10px; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; }
    .name-text { font-weight: 700; color: #1B2E5C; }
    .name-mob { font-size: 10px; color: #6B7280; font-family: 'JetBrains Mono', monospace; }
    .beh-chip { display: inline-block; font-size: 9px; font-weight: 900; padding: 1px 6px;
      border-radius: 6px; margin-left: 6px; vertical-align: middle; }
    .bc-ap { background: #dcfce7; color: #15803d; }
    .bc-a  { background: #d1fae5; color: #047857; }
    .bc-b  { background: #fef3c7; color: #b45309; }
    .bc-c  { background: #fee2e2; color: #b91c1c; }
    .beh-stars-sm { color: #f59e0b; font-size: 10px; margin-left: 3px; letter-spacing: 1px; }
    .cell-city { font-weight: 600; color: #1B2E5C; }
    .cell-gst { font-size: 10px; color: #6B7280; font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
    .type-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; }
    .type-sup { background: #FED7AA; color: #C2410C; }
    .type-buy { background: #DBEAFE; color: #1E40AF; }
    .type-both { background: #EDE9FE; color: #5c1a8b; }
    .rate-badge { display: inline-block; padding: 2px 6px; background: var(--anjaninex-navy, #1B2E5C); color: #fff; border-radius: 4px; font-size: 10px; font-weight: 800; margin-right: 4px; }
    .stars { color: #FCD34D; font-size: 11px; }
    .rate-note { font-size: 10px; color: #047857; margin-top: 4px; background: #D1FAE5; padding: 2px 6px; border-radius: 4px; display: inline-block; }
    .credit-bar { width: 100%; max-width: 100px; height: 4px; background: #E5E9F2; border-radius: 2px; margin-top: 4px; overflow: hidden; }
    .credit-fill { height: 100%; transition: width 0.4s; }
    .credit-warn { background: #DC2626; }
    .credit-pct { margin-top: 4px; }
    .credit-tag { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
    .amt-words { font-size: 10px; font-style: italic; color: #6b7280; margin-top: 3px; text-transform: capitalize; }
    .tag-ok { background: #D1FAE5; color: #047857; }
    .tag-warn { background: #FEF3C7; color: #92400E; }
    .tag-red { background: #FEE2E2; color: #DC2626; }
    .act-btn { background: #FEE2E2; border: 0; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; margin: 0 2px; font-size: 12px; }
    .act-view { background: #DBEAFE; }
    .act-ledger { background: #EDE9FE; }
    .act-edit { background: #FEF3C7; }
    .act-chat { background: #D1FAE5; }
    .act-del { background: #FEE2E2; }
    .act-btn:hover { transform: scale(1.1); }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .text-red-600 { color: #DC2626; }
    .text-xs { font-size: 11px; }
    .col-span-2 { grid-column: span 2; }
    .col-span-3 { grid-column: span 3; }
    .col-span-5 { grid-column: span 5; }

    /* Modal */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(27,46,92,0.6); z-index: 100;
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .modal-box {
      background: #fff; border-radius: 14px; width: 100%; max-width: 900px;
      max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;
      box-shadow: 0 24px 64px rgba(0,0,0,0.3);
    }
    .modal-header {
      background: var(--anjaninex-navy, #1B2E5C); color: #fff; padding: 16px 24px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal-title { font-size: 18px; font-weight: 800; }
    .modal-close {
      background: #DC2626; color: #fff; border: 0; width: 32px; height: 32px;
      border-radius: 8px; cursor: pointer; font-size: 16px;
    }
    .modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
    .modal-footer {
      padding: 14px 24px; border-top: 1px solid #F5EFE3; display: flex; justify-content: flex-end; gap: 10px;
    }
    .btn-cancel { padding: 9px 20px; background: #fff; border: 1px solid #D6DDEA; color: #4A5878; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .btn-cancel:hover { background: #F5EFE3; }
    .btn-save {
      padding: 9px 24px; background: #DC2626; color: #fff; border: 0; border-radius: 8px;
      font-weight: 800; cursor: pointer; box-shadow: 0 2px 6px rgba(220,38,38,0.3);
    }
    .btn-save:hover:not(:disabled) { background: #B91C1C; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

    .step-head {
      display: flex; align-items: center; gap: 8px; margin: 18px 0 4px;
      padding-bottom: 6px; border-bottom: 1px solid #F5EFE3;
    }
    .step-head:first-child { margin-top: 0; }
    .step-num { font-size: 16px; }
    .step-title { font-size: 12px; font-weight: 800; color: #DC2626; letter-spacing: 0.5px; }

    /* Type cards */
    .type-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
    .type-card {
      background: #FAF7F0; border: 2px solid #D6DDEA; border-radius: 10px; padding: 16px;
      text-align: center; cursor: pointer; transition: all 0.15s;
    }
    .type-card:hover { border-color: #1B2E5C; background: #fff; }
    .tc-active { border-color: #5c1a8b !important; background: #F5EFE3 !important; box-shadow: 0 0 0 3px rgba(92,26,139,0.15); }
    .tc-ico { font-size: 32px; }
    .tc-name { font-size: 14px; font-weight: 800; color: #5c1a8b; margin-top: 6px; }
    .tc-desc { font-size: 11px; color: #4A5878; margin-top: 6px; }
    .tc-desc-hi { font-size: 10px; color: #6B7280; margin-top: 2px; font-style: italic; }

    /* Form */
    .lbl { display: block; font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.4px; margin-bottom: 4px; text-transform: uppercase; }
    .lbl small { font-weight: 400; color: #9CA3AF; text-transform: none; }
    .ip {
      width: 100%; padding: 8px 10px; border: 1px solid #D6DDEA; border-radius: 6px;
      font-size: 13px; color: #1B2E5C; background: #FAF7F0; font-family: inherit;
    }
    .ip:focus { outline: none; border-color: #DC2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.1); }
    .ip-req { background: #FFFBEB; border-color: #FCD34D; }
    select.ip { cursor: pointer; }
    textarea.ip { resize: vertical; }
    .btn-fetch {
      padding: 8px 12px; background: var(--anjaninex-navy, #1B2E5C); color: #fff; border: 0; border-radius: 6px;
      font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap;
    }
    .btn-fetch:hover { background: #142347; }
    .open-hint {
      background: #FFFBEB; border: 1px solid #FCD34D; color: #92400E;
      padding: 12px 14px; border-radius: 8px; font-size: 12px; margin-top: 10px;
    }

    @media (max-width: 640px) {
      :host { padding: 8px 12px; }
      .pm-header { flex-wrap: wrap; gap: 8px; padding: 12px 14px; }
      .pmh-right { flex-wrap: wrap; }
      /* KPI cards → single column */
      .kpi-row { grid-template-columns: 1fr !important; }
      /* Chart / form / type-card grids → single column */
      .grid-cols-2, .grid-cols-3, .grid-cols-5 { grid-template-columns: 1fr !important; }
      .col-span-2, .col-span-3, .col-span-5 { grid-column: span 1 !important; }
      .widget[style*="grid-column"] { grid-column: span 1 !important; }
      .type-cards { grid-template-columns: 1fr !important; }
      /* Search + filter row stacks */
      .search-row { flex-wrap: wrap; }
      .search-wrap { flex: 1 1 100%; }
      .search-input { width: 100% !important; }
      .filter-tabs { flex-wrap: wrap; }
      .btn-add { width: 100%; }
      /* Table scrollable */
      .card { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
      .party-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; width: 100%; }
      /* Modal full width */
      .modal-backdrop { padding: 8px; }
      .modal-box { width: auto !important; max-width: 100% !important; }
      .modal-header { padding: 12px 14px; }
      .modal-body { padding: 14px 14px; }
      .modal-footer { padding: 12px 14px; }
    }
  `]
})
export class PartiesComponent {
  readonly inWords = amountInWords;   // card amount → words (Indian Lakh/Crore)
  private svc = inject(TradingService);
  private fb = inject(FormBuilder);
  private pinSvc = inject(IndiaPincodeService);
  private acctSvc = inject(AccountingService);

  // Ledger / Khata statement modal (per-party shortcut)
  ledgerStmtId = signal<string | null>(null);
  ledgerStmtName = signal<string | null>(null);

  openLedger(p: Party) {
    // Fast path: party already carries its ledgerId.
    if (p.ledgerId) {
      this.ledgerStmtName.set(p.displayName);
      this.ledgerStmtId.set(p.ledgerId);
      return;
    }
    // Else resolve on the backend (contact fallback / friendly 404 if none yet).
    this.acctSvc.partyLedger(p.id).subscribe({
      next: (res) => {
        this.ledgerStmtName.set(res.ledgerName || p.displayName);
        this.ledgerStmtId.set(res.ledgerId);
      },
      error: (e) => {
        if (e?.status === 404) {
          alert(`📒 ${p.displayName}\n\nIs party ka abhi koi accounting entry nahi — ledger tab banega jab pehla bill/payment hoga.`);
        } else {
          alert('Ledger load nahi ho paya: ' + (e?.error?.error ?? 'unknown'));
        }
      }
    });
  }

  // ===== India location helpers (Add Party form) =====
  indiaStates = INDIAN_STATES;
  cityOptions(): string[] { return citiesForState(this.form.value.state || ''); }

  onPincodeInput() {
    const p = (this.form.value.pincode || '').replace(/\D/g, '');
    if (p.length !== 6) return;
    this.pinSvc.byPin(p).subscribe({
      next: (res) => {
        const po = this.pinSvc.firstPo(res);
        if (!po) return;
        this.form.patchValue({
          city: po.District || this.form.value.city,
          state: matchIndiaState(po.State) || this.form.value.state
        });
      },
      error: () => {}
    });
  }

  onCityInput() {
    const city = (this.form.value.city || '').trim();
    if (!city || (this.form.value.pincode || '').length === 6) return;
    this.pinSvc.byCity(city).subscribe({
      next: (res) => {
        const po = this.pinSvc.firstPo(res, this.form.value.state || undefined);
        if (!po) return;
        this.form.patchValue({
          pincode: po.Pincode || this.form.value.pincode,
          state: this.form.value.state || matchIndiaState(po.State)
        });
      },
      error: () => {}
    });
  }
  private http = inject(HttpClient);
  staffCount = signal(0);

  parties = signal<Party[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editingId = signal<string | null>(null);
  newType = signal<PartyType | null>(null);
  searchQuery = '';
  filter = signal<FilterKey>('all');

  form = this.fb.group({
    displayName: ['', Validators.required],
    legalName: [''],
    gst: [''],
    pan: [''],
    phone: [''],
    whatsapp: [''],
    waSupplier: [''],
    waBuyer: [''],
    waExtra: [''],
    waExtraRole: [''],
    groupName: [''],
    supplierType: [''],
    buyerType: [''],
    udyamNo: [''],
    msmeType: [''],
    buyerAgentId: [''],
    buyerAgentSharePct: [''],
    address: [''],
    city: [''],
    state: [''],
    pincode: [''],
    email: [''],
    branch: [''],
    contactPerson: [''],
    contactMobile: [''],
    landline: [''],
    rating: ['A'],
    stars: ['5'],
    avgPayDays: [45],
    returnRate: [2.5],
    commission: [0],
    discountNormal: [0],
    discountExhibition: [0],
    discountSpecial: [0],
    note: [''],
    creditLimit: [50000],
    creditDays: [30],
    openingBalance: [0]
  });

  // Computed stats
  totalCount = computed(() => this.parties().length);
  // Single source — Core Master /counts (sab screen same definition).
  supCount = signal(0);
  buyCount = signal(0);
  multiCount = signal(0);
  buyerOS = computed(() => this.parties().filter(p => p.outstandingBalance > 0).reduce((s, p) => s + p.outstandingBalance, 0));
  supplierPay = computed(() => Math.abs(this.parties().filter(p => p.outstandingBalance < 0).reduce((s, p) => s + p.outstandingBalance, 0)));

  // REAL — top 6 by |outstanding|, bars max-scaled
  topParties = computed(() => {
    const list = this.parties().slice()
      .sort((a, b) => Math.abs(b.outstandingBalance) - Math.abs(a.outstandingBalance))
      .slice(0, 6);
    const max = Math.max(...list.map(p => Math.abs(p.outstandingBalance)), 1);
    return list.map(p => ({
      name: p.displayName,
      receivable: p.outstandingBalance > 0 ? (p.outstandingBalance / max) * 145 : 0,
      payable: p.outstandingBalance < 0 ? (Math.abs(p.outstandingBalance) / max) * 145 : 0
    }));
  });
  outMax = computed(() => Math.max(...this.parties().map(p => Math.abs(p.outstandingBalance)), 0));
  outAxis(f: number): string {
    const v = this.outMax() * f;
    if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
    if (v >= 1000) return '₹' + Math.round(v / 1000) + 'K';
    return '₹' + Math.round(v);
  }

  // REAL — Supplier / Buyer / Both mix donut (r=65 → C≈408)
  typeMix = computed(() => {
    let sup = 0, buy = 0, both = 0;
    for (const p of this.parties()) {
      if (p.partyType === 'both') both++;
      else if (p.partyType === 'seller') sup++;
      else buy++;
    }
    const parts = [
      { label: 'Suppliers', value: sup, color: '#5c1a8b' },
      { label: 'Buyers', value: buy, color: '#F97316' },
      { label: 'Both', value: both, color: '#10B981' }
    ];
    const C = 2 * Math.PI * 65;
    const total = sup + buy + both;
    if (!total) return [];
    let off = 0;
    return parts.filter(p => p.value > 0).map(p => {
      const dash = (p.value / total) * C;
      const seg = { ...p, pct: Math.round((p.value / total) * 100), dash: `${dash} ${C}`, off: -off };
      off += dash;
      return seg;
    });
  });

  // City chips — compact cloud. Naam normalize (trim + Title Case) taaki
  // 'Surat' / 'SURAT' / ' surat ' alag-alag na ginein. Top 12 + baki ka count.
  cityChips = computed(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const p of this.parties()) {
      const raw = (p.city || 'Other').trim();
      const key = raw.toLowerCase();
      const label = raw.replace(/\b\w/g, ch => ch.toUpperCase());
      const cur = map.get(key) ?? { name: label, count: 0 };
      cur.count++;
      map.set(key, cur);
    }
    const colors = ['#5c1a8b', '#3B82F6', '#06B6D4', '#F97316', '#10B981', '#DC2626', '#FCD34D', '#8B5CF6'];
    const all = Array.from(map.values()).sort((a, b) => b.count - a.count);
    return {
      chips: all.slice(0, 12).map((c, i) => ({ ...c, color: colors[i % colors.length] })),
      hidden: Math.max(0, all.length - 12)
    };
  });

  filtered = computed(() => {
    let list = this.parties();
    const f = this.filter();
    if (f === 'supplier') list = list.filter(p => p.partyType === 'seller');
    else if (f === 'buyer') list = list.filter(p => p.partyType === 'buyer');
    else if (f === 'both') list = list.filter(p => p.partyType === 'both');
    else if (f === 'aplus') list = list.filter(p => this.behOf(p.id)?.grade === 'A+');
    const q = this.searchQuery.toLowerCase();
    if (q) {
      list = list.filter(p =>
        p.displayName.toLowerCase().includes(q)
        || (p.gst || '').toLowerCase().includes(q)
        || (p.phone || '').toLowerCase().includes(q)
        || (p.city || '').toLowerCase().includes(q)
      );
    }
    return list;
  });

  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageClamped = computed(() => {
    const pages = Math.max(1, Math.ceil(this.filtered().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });
  pagedParties = computed(() => {
    const st = (this.pageClamped() - 1) * this.pageSize();
    return this.filtered().slice(st, st + this.pageSize());
  });

  initials(name: string): string {
    return name.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
  }
  avatarColor(p: Party): string {
    const colors = ['#5c1a8b', '#1B2E5C', '#DC2626', '#F97316', '#10B981', '#3B82F6'];
    let hash = 0;
    for (let i = 0; i < p.displayName.length; i++) hash = (hash << 5) - hash + p.displayName.charCodeAt(i);
    return colors[Math.abs(hash) % colors.length];
  }
  creditPct(p: Party): number {
    if (!p.creditLimit || p.creditLimit === 0) return 0;
    // Sirf RECEIVABLE (positive outstanding) credit limit ke against ginein.
    // Cr balance (advance/jama) wale ko 0% (OK) — abs() use karne se galat red aata tha.
    const receivable = p.outstandingBalance > 0 ? p.outstandingBalance : 0;
    return Math.round((receivable / p.creditLimit) * 100);
  }

  // ===== BEHAVIOUR RATING — naam ke aage grade + stars (real data se computed) =====
  behMap = signal<Map<string, { grade: string; stars: number; badge: string }>>(new Map());
  behOf(id: string) { return this.behMap().get(id); }
  stars(n: number): string { return '★'.repeat(Math.max(0, Math.min(5, n || 0))); }
  loadBehaviour() {
    this.http.get<any>(`${environment.apiUrl}/api/dashboard/behaviour`).subscribe({
      next: (d) => {
        const m = new Map<string, { grade: string; stars: number; badge: string }>();
        for (const s of (d?.suppliers || [])) m.set(s.partyId, { grade: s.grade, stars: s.stars, badge: s.badge });
        for (const b of (d?.buyers || [])) {
          // both-type party: kharab grade jeetata hai (warning pehle dikhe)
          const ex = m.get(b.partyId);
          if (!ex || b.stars < ex.stars) m.set(b.partyId, { grade: b.grade, stars: b.stars, badge: b.badge });
        }
        this.behMap.set(m);
      },
      error: () => {}
    });
  }

  agents = signal<any[]>([]);
  onAgentChange() {
    const id = this.form.value.buyerAgentId;
    const a = this.agents().find(x => x.id === id);
    if (a && !this.form.value.buyerAgentSharePct) this.form.patchValue({ buyerAgentSharePct: a.defaultSharePct });
  }

  ngOnInit() {
    this.load();
    this.loadBehaviour();
    // Counts Core Master se — supplier/buyer/both/staff har screen pe same.
    this.http.get<{ suppliers: number; buyers: number; both: number; staff: number }>(`${environment.apiUrl}/api/core/contacts/counts`)
      .subscribe({ next: c => {
        this.supCount.set(c.suppliers); this.buyCount.set(c.buyers);
        this.multiCount.set(c.both); this.staffCount.set(c.staff);
      }, error: () => {} });
    this.http.get<any[]>(`${environment.apiUrl}/api/trading/buyer-agents`)
      .subscribe({ next: a => this.agents.set(a || []), error: () => {} });
    // Group Master me save groups — dropdown me choose karne ke liye.
    this.http.get<string[]>(`${environment.apiUrl}/api/core/contacts/groups`)
      .subscribe({ next: g => this.partyGroups.set(g || []), error: () => {} });
  }

  partyGroups = signal<string[]>([]);

  load() {
    this.loading.set(true);
    this.svc.listParties(this.searchQuery || undefined).subscribe({
      next: (p) => { this.parties.set(p); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  private searchTimer: any;
  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  openAdd() {
    this.editingId.set(null);
    this.newType.set(null);
    this.form.reset({ rating: 'A', stars: '5', avgPayDays: 45, returnRate: 2.5, commission: 0, creditLimit: 50000, creditDays: 30, openingBalance: 0 });
    this.showForm.set(true);
  }
  closeForm() { this.showForm.set(false); }

  fetchGst() {
    const gst = this.form.value.gst;
    if (!gst || gst.length < 15) { alert('Please enter valid 15-char GSTIN first'); return; }
    alert('🔍 Fetching GST details for ' + gst + '...\n\n(GST API integration coming soon)');
  }

  view(p: Party) {
    alert(`👁 ${p.displayName}\n\nGST: ${p.gst || '—'}\nCity: ${p.city || '—'}\nPhone: ${p.phone || '—'}\nOutstanding: ₹${p.outstandingBalance.toFixed(2)}\nCredit Limit: ₹${p.creditLimit.toFixed(2)}`);
  }
  edit(p: Party) {
    this.editingId.set(p.id);
    this.newType.set(p.partyType === 'seller' ? 'supplier' : p.partyType === 'buyer' ? 'buyer' : 'both');
    this.form.patchValue({
      displayName: p.displayName, phone: p.phone ?? '', gst: p.gst ?? '',
      pan: p.pan ?? '',                    // PAN bhi load karo — warna save par ud jata tha
      email: p.email ?? '',
      city: p.city ?? '', creditLimit: p.creditLimit, creditDays: p.creditDays,
      commission: p.commissionRate || 0,
      discountNormal: p.discountNormal || 0,
      discountExhibition: p.discountExhibition || 0,
      discountSpecial: p.discountSpecial || 0,
      waSupplier: p.waSupplier ?? '', waBuyer: p.waBuyer ?? '',
      waExtra: (p as any).waExtra ?? '', waExtraRole: (p as any).waExtraRole ?? '',
      groupName: (p as any).groupName ?? '',
      supplierType: (p as any).supplierType ?? '', buyerType: (p as any).buyerType ?? '',
      udyamNo: (p as any).udyamNo ?? '', msmeType: (p as any).msmeType ?? '',
      buyerAgentId: (p as any).buyerAgentId ?? '',
      buyerAgentSharePct: (p as any).buyerAgentSharePct ?? ''
    });
    this.showForm.set(true);
    // City bhari ho aur pincode khali — auto le aao
    setTimeout(() => this.onCityInput());
  }
  chat(p: Party) {
    const phone = (p.phone || '').replace(/[^0-9]/g, '');
    if (phone) window.open('https://wa.me/' + phone, '_blank');
    else alert('No phone number to message');
  }
  del(id: string) {
    if (!confirm('Delete this party?')) return;
    this.svc.deleteParty(id).subscribe({
      next: () => this.load(),
      error: (e) => alert('Failed: ' + (e?.error?.error ?? 'unknown'))
    });
  }

  save() {
    if (this.form.invalid || !this.newType()) return;
    this.saving.set(true);
    const v: any = this.form.value;
    const partyType = this.newType() === 'supplier' ? 'seller' : this.newType() === 'buyer' ? 'buyer' : 'both';
    const data: any = {
      displayName: v.displayName, phone: v.phone, email: v.email, gst: v.gst, pan: v.pan,
      address: v.address, city: v.city, state: v.state, pincode: v.pincode,
      partyType, creditLimit: v.creditLimit || 0, creditDays: v.creditDays || 30,
      commissionRate: v.commission || 0,
      discountNormal: v.discountNormal || 0,
      discountExhibition: v.discountExhibition || 0,
      discountSpecial: v.discountSpecial || 0,
      openingBalance: v.openingBalance || 0, openingType: 'Dr',
      waSupplier: v.waSupplier || null, waBuyer: v.waBuyer || null,
      waExtra: v.waExtra || null, waExtraRole: v.waExtraRole || null,
      groupName: v.groupName || null,
      supplierType: v.supplierType || null, buyerType: v.buyerType || null,
      udyamNo: v.udyamNo || null, msmeType: v.msmeType || null,
      buyerAgentId: v.buyerAgentId || null,
      buyerAgentSharePct: (v.buyerAgentSharePct === '' || v.buyerAgentSharePct == null) ? null : Number(v.buyerAgentSharePct)
    };
    const id = this.editingId();
    const obs = id ? this.svc.updateParty(id, data) : this.svc.createParty(data);
    obs.subscribe({
      next: () => { this.saving.set(false); this.closeForm(); this.load(); },
      error: (e) => { this.saving.set(false); alert('Failed: ' + (e?.error?.error ?? 'unknown')); }
    });
  }
}
