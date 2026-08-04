import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { WalletService } from './wallet.service';
import { RechargeModalComponent } from './recharge-modal.component';
import { PayRechargeComponent } from './pay-recharge.component';
import { SubscriptionService } from '../subscription/subscription.service';
import { WalletIconComponent } from '../../shared/wallet-icon.component';

type TxFilter = 'all' | 'recharge' | 'debit' | 'subscription' | 'refund';

import { BackButtonComponent } from '../../shared/back-button.component';
@Component({
  selector: 'app-wallet-page',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, FormsModule, DatePipe, RechargeModalComponent, PayRechargeComponent, WalletIconComponent],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
    <div class="wrap">

      <!-- Header -->
      <div class="page-head">
        <div>
          <h1 style="display:flex;align-items:center;gap:8px"><app-wallet-icon [size]="24"></app-wallet-icon> Wallet &amp; Billing</h1>
          <p>Balance, transactions, services &amp; auto-recharge — sab ek jagah</p>
        </div>
        <button class="btn-primary" (click)="openRecharge()">💳 Recharge Wallet</button>
      </div>

      <!-- Low balance alert -->
      @if (wallet.isLow()) {
        <div class="alert-low">
          <span class="al-ico">⚠️</span>
          <div class="al-txt">
            <strong>Balance kam hai</strong> — sirf {{ wallet.runwayDays() }} din ka runway bacha hai.
            Services ruk sakti hain. Abhi recharge karein.
          </div>
        </div>
      }

      <!-- HERO: balance + runway + trend -->
      <div class="hero">
        <div class="hero-bal">
          <div class="hb-label">Current Balance</div>
          <div class="hb-val">₹{{ wallet.balance() | number:'1.2-2' }}</div>
          <div class="hb-runway">
            <div class="hb-runway-top">
              <span>⛽ Runway</span>
              <strong>{{ wallet.runwayDays() }} days</strong>
            </div>
            <div class="hb-bar"><div class="hb-fill" [style.width.%]="runwayPct()"></div></div>
            <div class="hb-runway-sub">~₹{{ wallet.stats().avgDailySpend | number:'1.0-0' }}/day avg spend</div>
          </div>
          <div class="hb-actions">
            <button class="hb-chip" [disabled]="recharging()" (click)="quickRecharge(1000)">+₹1K</button>
            <button class="hb-chip" [disabled]="recharging()" (click)="quickRecharge(2500)">+₹2.5K</button>
            <button class="hb-chip" [disabled]="recharging()" (click)="quickRecharge(5000)">+₹5K</button>
            <button class="hb-chip ghost" (click)="openRecharge()">Custom →</button>
          </div>
        </div>

        <div class="hero-trend">
          <div class="ht-head">
            <div>
              <div class="ht-label">Spend — last 30 days</div>
              <div class="ht-val">₹{{ spend30().total | number:'1.0-0' }}</div>
            </div>
            <div class="ht-mini">
              <div class="ht-mini-row"><span class="dot cr"></span> In ₹{{ wallet.stats().rechargedMtd | number:'1.0-0' }}</div>
              <div class="ht-mini-row"><span class="dot dr"></span> Out ₹{{ wallet.stats().spentMtd | number:'1.0-0' }}</div>
            </div>
          </div>
          <svg class="spark" viewBox="0 0 320 90" preserveAspectRatio="none">
            <defs>
              <linearGradient id="spkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#D91E28" stop-opacity="0.28"/>
                <stop offset="100%" stop-color="#D91E28" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path [attr.d]="spend30().area" fill="url(#spkFill)"></path>
            <path [attr.d]="spend30().line" fill="none" stroke="#D91E28" stroke-width="2"
                  stroke-linejoin="round" stroke-linecap="round"></path>
          </svg>
          <div class="ht-axis"><span>30d ago</span><span>Today</span></div>
        </div>
      </div>

      <!-- Spend by service -->
      <div class="card breakdown">
        <div class="card-head"><h3>📊 Spend by Service (30 days)</h3></div>
        <div class="bd-body">
          @if (byType().length === 0) {
            <div class="bd-empty">Abhi koi spend nahi. Services use hone par yahan dikhega.</div>
          } @else {
            @for (b of byType(); track b.key) {
              <div class="bd-row">
                <div class="bd-name">{{ b.icon }} {{ b.label }}</div>
                <div class="bd-bar"><div class="bd-fill" [style.width.%]="b.pct" [style.background]="b.color"></div></div>
                <div class="bd-amt">₹{{ b.total | number:'1.0-0' }}</div>
              </div>
            }
          }
        </div>
      </div>

      <!-- Service Usage Report -->
      <div class="card usage-card">
        <div class="card-head">
          <div>
            <h3>📈 Service Usage Report</h3>
            <p>Kis service par kitna use kiya · kitna wallet se kata</p>
          </div>
          <div class="filters">
            <input type="date" class="search" [(ngModel)]="usageFrom" (change)="loadUsage()">
            <span style="font-size:11px;color:var(--xs)">to</span>
            <input type="date" class="search" [(ngModel)]="usageTo" (change)="loadUsage()">
          </div>
        </div>
        <div class="usage-body">
          @if (usage().summary.length === 0) {
            <div class="bd-empty">Is period me koi service use nahi hui.</div>
          } @else {
            <table class="txn-table usage-table">
              <thead>
                <tr><th>Service</th><th class="r">Used</th><th class="r">Units</th><th class="r">Rate</th><th class="r">Spent</th></tr>
              </thead>
              <tbody>
                @for (s of usage().summary; track s.code) {
                  <tr>
                    <td>{{ svcIcon(s.code) }} {{ s.name || s.code }}</td>
                    <td class="r">{{ s.count }}×</td>
                    <td class="r">{{ s.units | number:'1.0-0' }}</td>
                    <td class="r ref">₹{{ s.rate }}</td>
                    <td class="r dr">₹{{ s.amount | number:'1.2-2' }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr class="usage-total">
                  <td colspan="4">Total spent on services</td>
                  <td class="r">₹{{ usage().totalAmount | number:'1.2-2' }}</td>
                </tr>
              </tfoot>
            </table>

            <button class="link-btn" style="margin-top:10px" (click)="showLog.set(!showLog())">
              {{ showLog() ? '▲ Hide detail log' : '▼ Show detail log (' + usage().log.length + ')' }}
            </button>
            @if (showLog()) {
              <div class="table-wrap" style="margin-top:8px">
                <table class="txn-table">
                  <thead><tr><th>Date / Time</th><th>Service</th><th class="r">Units</th><th class="r">Charged</th><th>Mode</th><th>Ref</th></tr></thead>
                  <tbody>
                    @for (l of usage().log; track $index) {
                      <tr>
                        <td class="date">{{ l.createdAt | date:'dd-MMM-yy HH:mm' }}</td>
                        <td>{{ svcIcon(l.code) }} {{ l.name || l.code }}</td>
                        <td class="r">{{ l.units | number:'1.0-0' }}</td>
                        <td class="r dr">{{ l.amount > 0 ? '₹' + (l.amount | number:'1.2-2') : '—' }}</td>
                        <td><span class="flag" [class.fo]="l.mode==='self'" [class.fr]="l.mode!=='self'">{{ l.mode === 'self' ? 'OWN' : 'ANJANINEX' }}</span></td>
                        <td class="ref">{{ l.reference || '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        </div>
      </div>

      <div class="page-grid">
        <!-- LEFT: Transaction history -->
        <div class="card">
          <div class="card-head">
            <div>
              <h3>📜 Transaction History</h3>
              <p>{{ filtered().length }} of {{ wallet.history().length }} transactions</p>
            </div>
            <div class="filters">
              <input class="search" [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="🔍 Search…">
              <select [ngModel]="filter()" (ngModelChange)="filter.set($event)">
                <option value="all">All Types</option>
                <option value="recharge">Recharges</option>
                <option value="debit">Debits</option>
                <option value="subscription">Subscription</option>
                <option value="refund">Refunds</option>
              </select>
              <button class="btn-outline" (click)="exportCsv()">⬇ CSV</button>
            </div>
          </div>

          @if (wallet.loading()) {
            <div class="loader">Loading transactions…</div>
          } @else if (filtered().length === 0) {
            <div class="empty">
              <div class="empty-icon">💭</div>
              <div>No transactions found</div>
              <small>Recharge karke pehli entry banao</small>
            </div>
          } @else {
            <div class="table-wrap">
              <table class="txn-table">
                <thead>
                  <tr>
                    <th>Date / Time</th><th>Type</th><th>Description</th><th>Reference</th>
                    <th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of filtered(); track e.id) {
                    <tr [class.cr-row]="e.amount > 0">
                      <td class="date">{{ e.createdAt | date:'dd-MMM-yy HH:mm' }}</td>
                      <td>
                        <span class="flag" [class.fo]="e.amount > 0" [class.fr]="e.amount < 0">
                          {{ txnIcon(e.txnType) }} {{ txnLabel(e.txnType) }}
                        </span>
                      </td>
                      <td>{{ e.description }}</td>
                      <td class="ref">{{ e.referenceId || '—' }}</td>
                      <td class="r dr">{{ e.amount < 0 ? '− ₹' + (absNum(e.amount) | number:'1.2-2') : '—' }}</td>
                      <td class="r cr">{{ e.amount > 0 ? '+ ₹' + (e.amount | number:'1.2-2') : '—' }}</td>
                      <td class="r bal">₹{{ e.balanceAfter | number:'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <!-- RIGHT -->
        <div class="side-col">
          <!-- Plan card -->
          <div class="card plan-card">
            <div class="card-head"><h3>💼 Current Plan</h3></div>
            <div class="plan-body">
              <div class="plan-name">{{ sub.status()?.planName || 'Plan' }} <span class="plan-star">⭐</span></div>
              <div class="plan-price">
                @if (sub.status()?.monthlyPrice != null) { ₹{{ sub.status()!.monthlyPrice | number:'1.0-0' }} <small>/ month</small> }
                @else { <small>Price set nahi</small> }
              </div>
              <div class="plan-next">
                <div class="next-lbl">{{ sub.status()?.status === 'trial' ? 'Trial ends' : 'Next billing' }}</div>
                <div class="next-date">
                  {{ (sub.status()?.status === 'trial' ? sub.status()?.trialEndsAt : sub.status()?.subscriptionEndsAt) | date:'dd-MMM-yyyy' }}
                  ({{ sub.daysLeft() }} days)
                </div>
              </div>
              <div class="plan-status">{{ sub.statusLabel() }}</div>
            </div>
          </div>

          <!-- Quick recharge -->
          <div class="card">
            <div class="card-head"><h3>⚡ Quick Recharge</h3></div>
            <div class="quick-body">
              <div class="quick-grid">
                <button class="quick-btn" [disabled]="recharging()" (click)="quickRecharge(500)">₹500</button>
                <button class="quick-btn" [disabled]="recharging()" (click)="quickRecharge(1000)">₹1,000</button>
                <button class="quick-btn primary" [disabled]="recharging()" (click)="quickRecharge(2500)">₹2,500</button>
                <button class="quick-btn" [disabled]="recharging()" (click)="quickRecharge(5000)">₹5,000</button>
              </div>
              <button class="btn-primary block" (click)="openRecharge()">💳 Custom Amount &amp; Methods</button>
            </div>
          </div>

          <!-- Pay via UPI/Bank -->
          <app-pay-recharge></app-pay-recharge>

          <!-- Live per-service rates (admin-managed) -->
          <div class="card">
            <div class="card-head">
              <h3>💰 Service Rates</h3>
              <button class="link-btn" (click)="openRecharge()">Manage →</button>
            </div>
            <div class="rates-body">
              @if (rates().length === 0) {
                <div class="rate-empty">Rates load ho rahe hain…</div>
              } @else {
                @for (r of rates(); track r.id) {
                  <div class="rate-row">
                    <span>{{ r.icon }} {{ r.name }}<small *ngIf="r.enabled" class="on-tag">ON</small></span>
                    <strong>₹{{ r.rate }}<i>/{{ r.unit }}</i></strong>
                  </div>
                }
              }
            </div>
          </div>

          <!-- Auto-recharge -->
          <div class="card">
            <div class="card-head">
              <h3>🔁 Auto-Recharge</h3>
              <span class="flag ok">ACTIVE</span>
            </div>
            <div class="auto-body">
              <div class="auto-row"><span>Trigger below</span><strong>₹500</strong></div>
              <div class="auto-row"><span>Recharge amount</span><strong>₹5,000</strong></div>
              <div class="auto-row"><span>Monthly cap</span><strong>₹25,000</strong></div>
              <button class="btn-outline block" (click)="openRecharge()">⚙ Configure</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    @if (showModal()) {
      <app-recharge-modal [initialAmount]="presetAmount()" (closed)="showModal.set(false)"></app-recharge-modal>
    }
  `,
  styles: [`
    :host{display:block;background:var(--ax-cream);min-height:100vh}
    .wrap{max-width:1400px;margin:0 auto;padding:24px}

    .page-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
    .page-head h1{font-size:23px;font-weight:900;color:var(--ax-navy);margin:0}
    .page-head p{font-size:12px;color:var(--soft,#4A5878);margin:3px 0 0}

    .btn-primary{background:var(--ax-red);color:#fff;border:0;border-radius:9px;padding:11px 22px;font-weight:800;cursor:pointer;font-family:inherit;font-size:13px;box-shadow:0 4px 14px rgba(217,30,40,.25)}
    .btn-primary:hover{background:var(--ax-red-dark)}
    .btn-primary.block{display:block;width:100%;margin-top:10px;box-shadow:none}
    .btn-outline{background:transparent;color:var(--ax-navy);border:1.5px solid var(--border);border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px}
    .btn-outline:hover{border-color:var(--ax-navy);background:var(--ax-navy-soft)}
    .btn-outline.block{display:block;width:100%;margin-top:10px}
    .link-btn{background:none;border:0;color:var(--ax-red);font-size:11px;font-weight:800;cursor:pointer;font-family:inherit}

    /* Low alert */
    .alert-low{display:flex;align-items:center;gap:12px;background:linear-gradient(90deg,#FEF2F2,#FFF7ED);border:1px solid #FECACA;border-radius:12px;padding:12px 16px;margin-bottom:16px}
    .al-ico{font-size:22px}
    .al-txt{flex:1;font-size:13px;color:#7f1d1d}
    .al-btn{background:var(--ax-red);color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:800;cursor:pointer;font-family:inherit;font-size:12px}

    /* HERO */
    .hero{display:grid;grid-template-columns:1.1fr 1fr;gap:16px;margin-bottom:16px}
    .hero-bal{background:linear-gradient(135deg,#162a5c 0%,#21356b 55%,#2c1248 100%);color:#fff;border-radius:18px;padding:22px 24px;position:relative;overflow:hidden;box-shadow:0 12px 30px rgba(22,42,92,.28)}
    .hero-bal::after{content:'';position:absolute;right:-40px;top:-40px;width:180px;height:180px;background:radial-gradient(circle,rgba(217,30,40,.35),transparent 70%);border-radius:50%}
    .hb-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.7;font-weight:700}
    .hb-val{font-size:40px;font-weight:900;font-family:'DM Mono',monospace;margin:4px 0 16px;letter-spacing:-1px}
    .hb-runway{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 14px}
    .hb-runway-top{display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:7px}
    .hb-bar{height:7px;background:rgba(255,255,255,.15);border-radius:99px;overflow:hidden}
    .hb-fill{height:100%;background:linear-gradient(90deg,#22c55e,#86efac);border-radius:99px;transition:width .5s}
    .hb-runway-sub{font-size:10px;opacity:.65;margin-top:7px}
    .hb-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
    .hb-chip{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:99px;padding:7px 16px;font-weight:800;font-size:12px;cursor:pointer;font-family:inherit;transition:.15s}
    .hb-chip:hover{background:rgba(255,255,255,.26)}
    .hb-chip:disabled,.quick-btn:disabled{opacity:.5;cursor:not-allowed}
    .hb-chip.ghost{background:transparent;border-color:rgba(255,255,255,.35)}

    .hero-trend{background:#fff;border:1px solid var(--border);border-radius:18px;padding:18px 20px;box-shadow:0 2px 10px rgba(27,46,92,.06);display:flex;flex-direction:column}
    .ht-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
    .ht-label{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--xs);font-weight:800}
    .ht-val{font-size:26px;font-weight:900;color:var(--ax-navy);font-family:'DM Mono',monospace}
    .ht-mini{display:flex;flex-direction:column;gap:3px}
    .ht-mini-row{font-size:10px;color:var(--soft);font-weight:700;display:flex;align-items:center;gap:5px}
    .dot{width:8px;height:8px;border-radius:50%;display:inline-block}
    .dot.cr{background:var(--ok)} .dot.dr{background:var(--ax-red)}
    .spark{width:100%;height:90px;flex:1}
    .ht-axis{display:flex;justify-content:space-between;font-size:9px;color:var(--xs);font-weight:700;margin-top:2px}

    /* Breakdown */
    .breakdown{margin-bottom:16px}
    .bd-body{padding:14px 18px}
    .bd-empty{font-size:12px;color:var(--xs);padding:8px 0}
    .bd-row{display:grid;grid-template-columns:150px 1fr 80px;align-items:center;gap:12px;padding:6px 0}
    .bd-name{font-size:12px;font-weight:700;color:var(--ax-navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bd-bar{height:9px;background:var(--ax-navy-soft);border-radius:99px;overflow:hidden}
    .bd-fill{height:100%;border-radius:99px;transition:width .5s}
    .bd-amt{font-size:12px;font-weight:800;color:var(--ax-navy);font-family:'DM Mono',monospace;text-align:right}

    /* Usage report */
    .usage-card{margin-bottom:16px}
    .usage-body{padding:14px 18px}
    .usage-table{margin-top:0}
    .usage-table tfoot td{padding:10px 12px;border-top:2px solid var(--border);font-weight:800;color:var(--ax-navy);font-family:'DM Mono',monospace}
    .usage-total td{background:var(--ax-navy-soft)}
    .filters input[type=date]{padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:11px;font-family:inherit}

    .page-grid{display:grid;grid-template-columns:1fr 340px;gap:18px}
    .card{background:#fff;border-radius:14px;border:1px solid var(--border);box-shadow:0 2px 10px rgba(27,46,92,.06);overflow:hidden;margin-bottom:14px}
    .card-head{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;border-bottom:1px solid var(--border)}
    .card-head h3{font-size:12px;font-weight:800;color:var(--ax-navy);text-transform:uppercase;letter-spacing:.5px;margin:0}
    .card-head p{font-size:10px;color:var(--xs);margin:2px 0 0}

    .filters{display:flex;gap:8px;align-items:center}
    .filters .search{padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:11px;outline:none;font-family:inherit;width:120px}
    .filters .search:focus{border-color:var(--ax-navy)}
    .filters select{padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:11px;font-weight:600;outline:none;background:#fff;cursor:pointer;font-family:inherit}
    .filters select:focus{border-color:var(--ax-navy)}

    .loader{padding:40px;text-align:center;color:var(--xs)}
    .empty{padding:50px 20px;text-align:center;color:var(--soft)}
    .empty-icon{font-size:40px;margin-bottom:12px}
    .empty small{display:block;color:var(--xs);margin-top:6px;font-size:11px}

    .table-wrap{overflow-x:auto}
    .txn-table{width:100%;border-collapse:collapse;font-size:11px}
    .txn-table th{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--xs);padding:10px 12px;text-align:left;border-bottom:1px solid var(--border);background:var(--ax-navy-soft);position:sticky;top:0}
    .txn-table th.r{text-align:right}
    .txn-table td{padding:10px 12px;border-bottom:1px solid var(--border)}
    .txn-table td.r{text-align:right}
    .txn-table tbody tr:hover{background:var(--ax-cream)}
    .cr-row{background:#F0FDF4}
    .date{font-family:'DM Mono',monospace;font-size:10px;color:var(--soft)}
    .ref{font-family:'DM Mono',monospace;font-size:10px;color:var(--xs)}
    .cr{color:var(--ok);font-weight:700;font-family:'DM Mono',monospace}
    .dr{color:var(--ax-red);font-weight:700;font-family:'DM Mono',monospace}
    .bal{font-family:'DM Mono',monospace;font-weight:800;color:var(--ax-navy)}
    .flag{display:inline-flex;font-size:9px;font-weight:800;padding:2px 8px;border-radius:10px}
    .fr{background:#FEE2E2;color:#B91C1C} .fo{background:#DCFCE7;color:#16A34A}
    .ok{background:#DCFCE7;color:#16A34A}

    .plan-card{background:linear-gradient(180deg,#fff,var(--ax-cream))}
    .plan-body{padding:16px}
    .plan-name{font-size:18px;font-weight:800;color:var(--ax-red);margin-bottom:2px}
    .plan-price{font-size:22px;font-weight:800;color:var(--ax-navy);font-family:'DM Mono',monospace;margin-bottom:14px}
    .plan-price small{font-size:11px;color:var(--xs);font-weight:600}
    .plan-next{display:flex;justify-content:space-between;padding:10px 12px;background:var(--ax-navy-soft);border-radius:8px;margin-bottom:10px}
    .next-lbl{font-size:10px;color:var(--soft);font-weight:700;text-transform:uppercase}
    .next-date{font-size:11px;font-weight:800;color:var(--ax-navy)}
    .plan-status{font-size:11px;font-weight:700;color:var(--soft)}

    .quick-body{padding:14px}
    .quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
    .quick-btn{padding:12px;background:#fff;border:1.5px solid var(--border);border-radius:8px;font-weight:800;color:var(--ax-navy);font-size:13px;cursor:pointer;font-family:inherit}
    .quick-btn:hover{border-color:var(--ax-navy);background:var(--ax-navy-soft)}
    .quick-btn.primary{border-color:var(--ax-red);background:var(--ax-red-soft);color:var(--ax-red-dark)}

    .auto-body{padding:14px}
    .auto-row{display:flex;justify-content:space-between;font-size:11px;padding:7px 0;border-bottom:1px dashed var(--border)}
    .auto-row:last-of-type{border-bottom:none}

    .rates-body{padding:8px 14px}
    .rate-empty{font-size:11px;color:var(--xs);padding:8px 0}
    .rate-row{display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:7px 0;border-bottom:1px dashed var(--border)}
    .rate-row:last-child{border-bottom:none}
    .rate-row strong{font-family:'DM Mono',monospace;color:var(--ax-red);font-size:11px}
    .rate-row strong i{color:var(--xs);font-style:normal;font-weight:600;font-size:9px}
    .on-tag{margin-left:6px;background:#DCFCE7;color:#16A34A;font-size:8px;font-weight:800;padding:1px 5px;border-radius:6px}

    @media(max-width:1100px){
      .hero{grid-template-columns:1fr}
      .page-grid{grid-template-columns:1fr}
      .bd-row{grid-template-columns:110px 1fr 70px}
    }

    @media(max-width:640px){
      .wrap{padding:14px}
      .page-head{flex-direction:column;align-items:flex-start;gap:10px}
      .page-head .btn-primary{width:100%}
      .hero{grid-template-columns:1fr !important;gap:12px}
      .hero-bal{padding:18px}
      .hb-val{font-size:32px}
      .hb-actions{flex-wrap:wrap}
      .page-grid{grid-template-columns:1fr !important}
      .bd-row{grid-template-columns:1fr !important;gap:6px}
      .card-head{flex-wrap:wrap;gap:8px}
      .filters{flex-wrap:wrap;width:100%}
      .filters .search{width:100% !important}
      .filters select{width:100%}
      .filters input[type=date]{width:100%}
      .quick-grid{grid-template-columns:1fr 1fr}
      .table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .txn-table{white-space:nowrap}
    }
  `]
})
export class WalletPageComponent {
  wallet = inject(WalletService);
  sub = inject(SubscriptionService);
  private http = inject(HttpClient);

  filter = signal<TxFilter>('all');
  search = signal('');
  recharging = signal(false);
  showModal = signal(false);
  presetAmount = signal<number | null>(null);
  rates = signal<any[]>([]);

  // Usage report
  usage = signal<{ summary: any[]; log: any[]; totalAmount: number }>({ summary: [], log: [], totalAmount: 0 });
  usageFrom = '';
  usageTo = '';
  showLog = signal(false);

  filtered = computed(() => {
    const h = this.wallet.history();
    const q = this.search().trim().toLowerCase();
    const filter = this.filter();
    return h.filter(e => {
      // type filter
      const t = e.txnType.toLowerCase();
      let okType = true;
      if (filter === 'recharge') okType = t.includes('recharge') || e.amount > 0;
      else if (filter === 'subscription') okType = t.includes('subscription');
      else if (filter === 'refund') okType = t.includes('refund');
      else if (filter === 'debit') okType = e.amount < 0 && !t.includes('subscription');
      if (!okType) return false;
      // search
      if (!q) return true;
      return (e.description || '').toLowerCase().includes(q)
          || (e.referenceId || '').toLowerCase().includes(q)
          || t.includes(q);
    });
  });

  // Runway bar: cap at 30 days = full
  runwayPct = computed(() => Math.min(100, Math.round((this.wallet.runwayDays() / 30) * 100)));

  // 30-day daily spend sparkline (SVG path) + total
  spend30 = computed(() => {
    const W = 320, H = 90, pad = 6;
    const buckets = new Array(30).fill(0);
    const now = Date.now();
    let total = 0;
    for (const e of this.wallet.history()) {
      if (e.amount >= 0) continue;
      const days = Math.floor((now - new Date(e.createdAt).getTime()) / 86400000);
      if (days < 0 || days > 29) continue;
      const v = Math.abs(e.amount);
      buckets[29 - days] += v;
      total += v;
    }
    const max = Math.max(1, ...buckets);
    const step = (W - pad * 2) / 29;
    const pts = buckets.map((v, i) => {
      const x = pad + i * step;
      const y = H - pad - (v / max) * (H - pad * 2);
      return [x, y];
    });
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
    return { line, area, total };
  });

  // Spend grouped by service category
  byType = computed(() => {
    const now = Date.now();
    const map = new Map<string, number>();
    for (const e of this.wallet.history()) {
      if (e.amount >= 0) continue;
      if ((now - new Date(e.createdAt).getTime()) > 30 * 86400000) continue;
      const key = this.catKey(e.txnType, e.description);
      map.set(key, (map.get(key) || 0) + Math.abs(e.amount));
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    const meta: Record<string, { label: string; icon: string; color: string }> = {
      ai:           { label: 'AI / Bill Scan', icon: '🤖', color: '#7c3aed' },
      sms:          { label: 'SMS',            icon: '📱', color: '#0ea5e9' },
      whatsapp:     { label: 'WhatsApp',       icon: '💬', color: '#16a34a' },
      subscription: { label: 'Subscription',   icon: '💼', color: '#1b2e5c' },
      other:        { label: 'Other',          icon: '⚙️', color: '#d91e28' },
    };
    return [...map.entries()]
      .map(([key, val]) => ({
        key, total: val, pct: Math.round((val / total) * 100),
        label: meta[key]?.label ?? key, icon: meta[key]?.icon ?? '•', color: meta[key]?.color ?? '#94a3b8'
      }))
      .sort((a, b) => b.total - a.total);
  });

  constructor() {
    this.wallet.refresh(true);
    this.sub.refresh();
    this.http.get<any[]>(`${environment.apiUrl}/api/billing/services`)
      .subscribe({ next: r => this.rates.set(r || []), error: () => {} });
    // default usage range: last 30 days (local date, not UTC — avoids IST off-by-one)
    const today = new Date();
    const ago = new Date(Date.now() - 30 * 86400000);
    this.usageTo = this.ymd(today);
    this.usageFrom = this.ymd(ago);
    this.loadUsage();
  }

  loadUsage(): void {
    const params: any = {};
    if (this.usageFrom) params.from = this.usageFrom;
    if (this.usageTo) params.to = this.usageTo;
    this.http.get<any>(`${environment.apiUrl}/api/wallet/usage-report`, { params })
      .subscribe({
        next: r => this.usage.set({ summary: r?.summary || [], log: r?.log || [], totalAmount: r?.totalAmount || 0 }),
        error: () => {}
      });
  }

  svcIcon(code: string): string {
    return ({ bill_scan: '🤖', sms: '📱', whatsapp: '💬', voice_otp: '📞', email: '📧', storage: '💾', pdf: '📄', einvoice: '🔐' } as any)[code] ?? '⚙️';
  }

  absNum(n: number): number { return Math.abs(n); }

  // Local YYYY-MM-DD (avoids UTC off-by-one in IST)
  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // CSV cell escaping: quote when value has comma/quote/newline
  private csvCell(v: any): string {
    const s = (v ?? '').toString();
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  private catKey(t: string, desc = ''): string {
    const s = (t + ' ' + desc).toLowerCase();
    if (s.includes('subscription') || s.includes('plan')) return 'subscription';
    if (s.includes('ai') || s.includes('scan')) return 'ai';
    if (s.includes('sms')) return 'sms';
    if (s.includes('whatsapp') || s.includes('wa')) return 'whatsapp';
    return 'other';
  }

  txnLabel(t: string): string {
    const s = t.toLowerCase();
    if (s.includes('recharge')) return 'RECHARGE';
    if (s.includes('subscription')) return 'SUBSCRIPTION';
    if (s.includes('refund')) return 'REFUND';
    return 'DEBIT';
  }

  txnIcon(t: string): string {
    const s = t.toLowerCase();
    if (s.includes('recharge')) return '📥';
    if (s.includes('subscription')) return '💼';
    if (s.includes('refund')) return '↩️';
    return '📤';
  }

  openRecharge(): void { this.showModal.set(true); }

  // Quick amount buttons: seedha credit NAHI karte (woh free-recharge bug tha).
  // Ab recharge modal khulta hai jahan Razorpay se actual payment hota hai (auto-confirm).
  quickRecharge(amount: number): void {
    this.presetAmount.set(amount);
    this.showModal.set(true);
  }

  exportCsv(): void {
    const rows = [['Date', 'Type', 'Description', 'Reference', 'Debit', 'Credit', 'Balance']];
    this.filtered().forEach(e => {
      rows.push([
        new Date(e.createdAt).toLocaleString('en-IN'),
        e.txnType, e.description, e.referenceId || '',
        e.amount < 0 ? Math.abs(e.amount).toFixed(2) : '',
        e.amount > 0 ? e.amount.toFixed(2) : '',
        e.balanceAfter.toFixed(2)
      ]);
    });
    const csv = rows.map(r => r.map(c => this.csvCell(c)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-ledger-${this.ymd(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
