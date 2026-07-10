import { Component, EventEmitter, Output, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { WalletService, PayMethod } from './wallet.service';
import { WalletIconComponent } from '../../shared/wallet-icon.component';
import { environment } from '../../../environments/environment';

type Tab = 'recharge' | 'history' | 'pricing' | 'auto';

@Component({
  selector: 'app-recharge-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, WalletIconComponent],
  template: `
    <div class="modal-backdrop" (click)="onBackdropClick($event)">
      <div class="modal" (click)="$event.stopPropagation()">

        <!-- HEAD -->
        <div class="modal-head">
          <div>
            <h2 style="display:flex;align-items:center;gap:8px"><app-wallet-icon [size]="22"></app-wallet-icon> Recharge Wallet</h2>
            <div class="sub">Top-up your Anjaninex wallet · Used for AI scans, SMS, WhatsApp</div>
          </div>
          <button class="sp-close" (click)="close()">✕</button>
        </div>

        <!-- BODY -->
        <div class="modal-body">
          <!-- Tab switcher -->
          <div class="modal-tabs">
            <button class="modal-tab" [class.active]="activeTab() === 'recharge'" (click)="activeTab.set('recharge')">💳 Recharge</button>
            <button class="modal-tab" [class.active]="activeTab() === 'history'" (click)="activeTab.set('history')">📜 History</button>
            <button class="modal-tab" [class.active]="activeTab() === 'pricing'" (click)="activeTab.set('pricing')">🧩 Services</button>
            <button class="modal-tab" [class.active]="activeTab() === 'auto'" (click)="activeTab.set('auto')">🔁 Auto-Recharge</button>
          </div>

          <!-- ═══ TAB: RECHARGE ═══ -->
          @if (activeTab() === 'recharge') {

            <!-- BYOK: AI scan recharge — provider console par hota hai, yahan nahi -->
            @if (ai(); as a) {
              @if (a.keySet) {
                <div style="display:flex;align-items:center;gap:10px;background:#f0e9ff;border:1.5px solid #c9b3ec;border-radius:10px;padding:10px 14px;margin-bottom:14px">
                  <span style="font-size:18px">🤖</span>
                  <div style="flex:1;font-size:12px;color:#3c1d63">
                    <b>AI Bill-Scan ka recharge alag hai</b> — aapki firm <b>{{ a.providerName }}</b> use karti hai,
                    uska balance/recharge unke console par hota hai.
                  </div>
                  <a [href]="a.consoleUrl" target="_blank" rel="noopener"
                     style="white-space:nowrap;background:#5c1a8b;color:#fff;font-size:12px;font-weight:700;padding:8px 12px;border-radius:8px;text-decoration:none">
                    ↗ {{ a.providerName }} Recharge
                  </a>
                </div>
              }
            }

            <!-- Balance card -->
            <div class="bal-card" [class.low]="wallet.isLow()">
              <div class="left">
                <div class="label">Current Balance</div>
                <div class="amt">₹{{ wallet.balance() | number:'1.2-2' }}</div>
                <div class="meta">{{ statusLine() }}</div>
              </div>
              <div class="right">
                <div class="runway">⏱ Runway</div>
                <div class="runway-days">~{{ wallet.runwayDays() }} days</div>
                <div style="font-size:10px;opacity:0.8">at current usage</div>
              </div>
            </div>

            <div class="modal-grid">
              <div>
                <!-- Quick amounts -->
                <div class="sec-title">Quick Amount</div>
                <div class="amt-grid">
                  @for (q of quickAmounts; track q.value) {
                    <button class="amt-btn" [class.selected]="amount() === q.value" (click)="selectAmount(q.value)"
                            [style.border-color]="q.color"
                            [style.color]="q.color"
                            [style.background]="amount() === q.value ? q.color + '18' : '#fff'">
                      ₹{{ q.label }}
                      @if (q.tag) {<span class="pop" [style.background]="q.color">{{ q.tag }}</span>}
                      @if (q.save) {<span class="save" [style.color]="q.color">Save ₹{{ q.save }}</span>}
                    </button>
                  }
                </div>

                <!-- Custom amount -->
                <div class="custom-amt">
                  <span class="rs">₹</span>
                  <input type="number" [ngModel]="customInput()" (ngModelChange)="onCustom($event)"
                         placeholder="Koi bhi amount daalo (₹1+)" min="1" max="500000">
                  <span class="gst"></span>
                </div>

                <!-- Payment methods -->
                <div class="sec-title" style="margin-top:18px">Payment Method</div>
                <div class="pay-methods">
                  @for (m of methods; track m.id) {
                    <div class="pay-method" [class.selected]="method() === m.id" (click)="method.set(m.id)"
                         [style.border-left]="'4px solid ' + m.color"
                         [style.background]="method() === m.id ? m.color + '14' : '#fff'"
                         [style.border-color]="method() === m.id ? m.color : ''">
                      <div class="ico" [style.background]="m.color + '1f'" [style.color]="m.color">{{ m.icon }}</div>
                      <div class="info">
                        <div class="name" [style.color]="m.color">{{ m.name }}</div>
                        <div class="desc">{{ m.desc }}</div>
                      </div>
                      <div class="fee" [class.paid]="m.feePercent > 0">{{ m.fee }}</div>
                    </div>
                  }
                </div>

                <!-- UPI details (only when UPI selected) -->
                @if (method() === 'upi') {
                  <div class="upi-box">
                    <div style="display:flex;align-items:center;gap:14px">
                      @if (qrUrl()) {
                        <img [src]="qrUrl()" alt="UPI QR" width="100" height="100"
                             style="border:2px solid var(--ax-red);border-radius:8px;background:#fff;flex-shrink:0">
                      } @else {
                        <div class="qr-box">QR<br><small>UPI ID set nahi</small></div>
                      }
                      <div style="flex:1">
                        <div style="font-size:11px;color:var(--soft);margin-bottom:4px">Pay to UPI ID</div>
                        <div class="upi-id">
                          {{ payUpiId() || '—' }}
                          <button class="copy-btn" (click)="copyUpi()">📋 Copy</button>
                        </div>
                        <div style="font-size:10px;color:var(--soft);line-height:1.5">
                          After payment, paste transaction ID. Balance updates in 1-2 min.
                        </div>
                      </div>
                    </div>
                    <input type="text" class="upi-input" placeholder="Enter UPI Reference / Transaction ID"
                           [(ngModel)]="upiTxnId">
                  </div>
                }

                <!-- GSTIN -->
                <div class="sec-title" style="margin-top:14px">GST Invoice (Optional)</div>
                <input type="text" class="input" [(ngModel)]="gstin"
                       placeholder="Your GSTIN (for input tax credit)">
                <div style="font-size:10px;color:var(--xs);margin-top:5px">
                  ✓ GST invoice emailed · Eligible for full ITC claim
                </div>
              </div>

              <!-- Summary panel -->
              <div class="summary-panel">
                <div class="sec-title" style="margin-bottom:14px">Payment Summary</div>
                <div class="sum-row">
                  <span class="sum-label">Recharge amount</span>
                  <span class="sum-val">₹{{ breakdown().amount | number:'1.2-2' }}</span>
                </div>
                <div class="sum-row">
                  <span class="sum-label">GST (20L tak 0%)</span>
                  <span class="sum-val">₹{{ breakdown().gst | number:'1.2-2' }}</span>
                </div>
                <div class="sum-row">
                  <span class="sum-label">Gateway fee</span>
                  <span class="sum-val" [style.color]="breakdown().fee > 0 ? 'var(--warn)' : 'var(--ok)'">
                    {{ breakdown().fee > 0 ? '₹' + (breakdown().fee | number:'1.2-2') : 'FREE' }}
                  </span>
                </div>
                @if (breakdown().cashback > 0) {
                  <div class="sum-row">
                    <span class="sum-label">Cashback</span>
                    <span class="sum-val" style="color:var(--ok)">— ₹{{ breakdown().cashback | number:'1.2-2' }}</span>
                  </div>
                }
                <div class="sum-row total">
                  <span>Total to pay</span>
                  <span>₹{{ breakdown().total | number:'1.2-2' }}</span>
                </div>

                <div class="after-box">
                  <div class="after-title">After Recharge</div>
                  <div class="after-row">💰 New balance: <strong>₹{{ wallet.balance() + amount() | number:'1.0-0' }}</strong></div>
                  <div class="after-row">⏱ Runway: <strong>~{{ newRunwayDays() }} days</strong></div>
                  <div class="after-row">🤖 AI scans: <strong>{{ ((wallet.balance() + amount()) / 0.25) | number:'1.0-0' }}+</strong></div>
                  <div class="after-row">📱 SMS: <strong>{{ ((wallet.balance() + amount()) / 0.15) | number:'1.0-0' }}+</strong></div>
                </div>

                <div class="ssl-note">
                  🔒 Secure payment by Razorpay<br>
                  All transactions encrypted with 256-bit SSL
                </div>
              </div>
            </div>
          }

          <!-- ═══ TAB: HISTORY ═══ -->
          @if (activeTab() === 'history') {
            <div class="sec-title">Recent Transactions</div>
            @if (wallet.loading()) {
              <div style="padding:30px;text-align:center;color:var(--xs)">Loading...</div>
            } @else if (wallet.history().length === 0) {
              <div style="padding:30px;text-align:center;color:var(--xs)">No transactions yet</div>
            } @else {
              <div style="overflow-x:auto">
                <table class="txn-table">
                  <thead>
                    <tr><th>Date</th><th>Type</th><th>Description</th><th>Reference</th>
                        <th style="text-align:right">Debit</th><th style="text-align:right">Credit</th>
                        <th style="text-align:right">Balance</th></tr>
                  </thead>
                  <tbody>
                    @for (e of wallet.history(); track e.id) {
                      <tr [class.cr-row]="e.amount > 0">
                        <td>{{ e.createdAt | date:'dd-MMM HH:mm' }}</td>
                        <td><span class="flag" [class.fo]="e.amount > 0" [class.fr]="e.amount < 0">{{ txnLabel(e.txnType) }}</span></td>
                        <td>{{ e.description }}</td>
                        <td class="mono" style="font-size:10px">{{ e.referenceId | slice:0:14 }}</td>
                        <td style="text-align:right" class="txn-dr">{{ e.amount < 0 ? ('— ₹' + (-e.amount | number:'1.2-2')) : '—' }}</td>
                        <td style="text-align:right" class="txn-cr">{{ e.amount > 0 ? '+ ₹' + (e.amount | number:'1.2-2') : '—' }}</td>
                        <td style="text-align:right" class="mono"><strong>₹{{ e.balanceAfter | number:'1.2-2' }}</strong></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px">
              <div class="stat-mini ok"><div class="v">₹{{ wallet.stats().rechargedMtd | number:'1.0-0' }}</div><div class="l">Recharged (MTD)</div></div>
              <div class="stat-mini red"><div class="v">₹{{ wallet.stats().spentMtd | number:'1.0-0' }}</div><div class="l">Spent (MTD)</div></div>
              <div class="stat-mini navy"><div class="v">₹{{ wallet.balance() | number:'1.0-0' }}</div><div class="l">Current</div></div>
              <div class="stat-mini amber"><div class="v">₹{{ wallet.stats().avgDailySpend | number:'1.0-0' }}</div><div class="l">Avg Daily</div></div>
            </div>

            <button class="btn-block" style="margin-top:14px" (click)="exportLedger()">📊 Export Full Ledger (Excel)</button>
          }

          <!-- ═══ TAB: PRICING ═══ -->
          @if (activeTab() === 'pricing') {
            <div class="sec-title">Extra Services — jo chahiye tick karein</div>
            <div style="font-size:11px;color:var(--soft);margin-bottom:12px;line-height:1.5">
              Jo service Anjaninex se lena chahein, tick karein (charge wallet se katega).
              Agar koi service aap <strong>khud direct</strong> lena chahein (apna account/keys),
              to "Khud (direct)" choose karein — Anjaninex sirf app me integrate karega, koi charge nahi.
            </div>

            @if (svcItems.length === 0) {
              <div style="font-size:12px;color:var(--soft);padding:14px 0">Koi extra service available nahi.</div>
            }
            <div class="svc-list">
              @for (s of svcItems; track s.id) {
                <div class="svc-card" [class.on]="s.enabled">
                  <label class="svc-main">
                    <input type="checkbox" [(ngModel)]="s.enabled">
                    <span class="svc-ico">{{ s.icon }}</span>
                    <span class="svc-info">
                      <span class="svc-name">{{ s.name }}</span>
                      <span class="svc-note">{{ s.freeNote }}</span>
                    </span>
                    <span class="svc-rate">₹{{ s.rate }}<small> / {{ s.unit }}</small></span>
                  </label>

                  @if (s.enabled) {
                    <div class="svc-mode">
                      <label class="md-opt" [class.sel]="s.mode !== 'self'">
                        <input type="radio" [name]="'md_'+s.id" value="anjaninex" [(ngModel)]="s.mode"> Anjaninex se
                      </label>
                      @if (s.allowSelf) {
                        <label class="md-opt" [class.sel]="s.mode === 'self'">
                          <input type="radio" [name]="'md_'+s.id" value="self" [(ngModel)]="s.mode"> Khud (direct)
                        </label>
                      }
                      @if (s.mode === 'self' && s.allowSelf) {
                        <input class="svc-self" [(ngModel)]="s.selfNote" placeholder="Apna provider / account ref (optional)">
                      }
                    </div>
                  }
                </div>
              }
            </div>

            <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:12px">
              @if (svcMsg()) { <span style="font-size:12px;color:#15803d;font-weight:700">{{ svcMsg() }}</span> }
              <button class="btn-block primary" style="width:auto;padding:9px 22px;font-size:13px"
                      [disabled]="svcSaving()" (click)="saveServices()">
                {{ svcSaving() ? 'Saving…' : '💾 Save My Services' }}
              </button>
            </div>

            <div class="sec-title" style="margin-top:22px">Subscription Plans</div>
            <div class="plans-box">
              @for (pl of plans; track pl.name) {
                <div class="plan-row" [class.featured]="pl.featured">
                  <div>
                    <strong>{{ pl.name }}</strong>
                    <span style="font-size:10px;color:var(--xs)">— {{ pl.features }}</span>
                  </div>
                  <div class="mono" style="display:flex;align-items:center;gap:8px">
                    <strong>₹{{ pl.price | number:'1.0-0' }}/mo</strong>
                    <button class="plan-pay-btn" (click)="openPlanQr(pl)">💳 Pay</button>
                  </div>
                </div>
              }
            </div>

            <div class="cashback-note">
              💡 <strong>Bulk recharge cashback:</strong>
              ₹10K → ₹150 back · ₹25K → ₹500 back · ₹50K → ₹1,200 back
            </div>
          }

          <!-- ═══ TAB: AUTO-RECHARGE ═══ -->
          @if (activeTab() === 'auto') {
            <div class="sec-title">Auto-Recharge Settings</div>
            <div style="font-size:11px;color:var(--soft);margin-bottom:14px">
              Never run out — wallet auto-tops-up when balance drops below threshold.
            </div>

            <div class="auto-box">
              <div class="info">
                <div class="title">🔁 Enable Auto-Recharge</div>
                <div class="desc">Use saved Razorpay method · Cancel anytime</div>
              </div>
              <div class="toggle-switch" [class.on]="autoOn()" (click)="autoOn.set(!autoOn())"></div>
            </div>

            @if (autoOn()) {
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
                <div>
                  <label class="form-lbl">When balance drops below</label>
                  <div class="rs-input">
                    <span>₹</span>
                    <input type="number" [(ngModel)]="autoThreshold" min="100" max="5000">
                  </div>
                  <div class="form-hint">Min ₹100 · Max ₹5,000</div>
                </div>
                <div>
                  <label class="form-lbl">Auto-recharge amount</label>
                  <div class="rs-input">
                    <span>₹</span>
                    <input type="number" [(ngModel)]="autoAmount" min="500" max="100000">
                  </div>
                  <div class="form-hint">Recommended: 30 days usage</div>
                </div>
              </div>

              <div class="sec-title" style="margin-top:18px">Saved Payment Method</div>
              <div class="card-display">
                <div class="card-brand">VISA</div>
                <div class="card-type">Razorpay Card</div>
                <div class="card-num">•••• •••• •••• 4521</div>
                <div class="card-foot">
                  <div><div class="card-lbl">CARD HOLDER</div><div>RAJESH YADAV</div></div>
                  <div><div class="card-lbl">EXPIRES</div><div>12/27</div></div>
                </div>
              </div>
              <button class="btn-block" style="margin-top:10px">+ Add Another Card / UPI</button>

              <div class="sec-title" style="margin-top:18px">Monthly Cap</div>
              <div class="cap-grid">
                @for (c of capOptions; track c) {
                  <label class="cap-radio" [class.selected]="autoCap() === c">
                    <input type="radio" name="cap" [value]="c" [ngModel]="autoCap()" (ngModelChange)="autoCap.set($event)">
                    {{ c === 0 ? 'Unlimited' : '₹' + (c | number:'1.0-0') }}
                  </label>
                }
              </div>

              <div class="status-ok">
                ✅ <strong>Auto-recharge ACTIVE</strong> · Last triggered May 15 (₹5,000)
              </div>
            }
          }
        </div>

        <!-- FOOT -->
        <div class="modal-foot">
          <div style="font-size:11px;color:var(--soft)">
            🔒 256-bit SSL · PCI-DSS · Razorpay-powered
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn-block" style="width:auto;padding:10px 20px" (click)="close()">Cancel</button>
            @if (activeTab() === 'recharge') {
              <button class="btn-block primary" style="width:auto;padding:10px 26px;font-size:13px"
                      [disabled]="amount() < 1"
                      (click)="openRechargePay()">
                💳 Pay ₹{{ breakdown().total | number:'1.0-0' }}
              </button>
            } @else if (activeTab() === 'auto') {
              <button class="btn-block primary" style="width:auto;padding:10px 26px" (click)="saveAuto()">💾 Save Settings</button>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- ============ PLAN PAY → QR POPUP (Option B) ============ -->
    @if (payPlan(); as pp) {
      <div class="qr-pop-backdrop" (click)="closePlanQr()">
        <div class="qr-pop" (click)="$event.stopPropagation()">
          <div class="qr-pop-head">
            <div>
              <div class="qr-pop-title">{{ pp.name }} Plan</div>
              <div class="qr-pop-sub">Scan karke payment karein</div>
            </div>
            <button class="qr-pop-x" (click)="closePlanQr()">✕</button>
          </div>

          <div class="qr-pop-amt">
            <span>Total Payable</span>
            <strong>₹{{ breakdown().total | number:'1.0-0' }}</strong>
            <small>Bina GST (20 lakh tak)</small>
          </div>

          <div class="qr-pop-img" style="position:relative">
            <img [src]="qrUrl()" alt="Payment QR" width="220" height="220"
                 [style.filter]="qrExpired() ? 'blur(5px) grayscale(1)' : 'none'" />
            @if (qrExpired()) {
              <div class="qr-expired" (click)="refreshQr()">
                <div style="font-weight:800;margin-bottom:6px">⏱ QR Expired</div>
                <button class="qr-refresh-btn" (click)="refreshQr()">🔄 Refresh QR</button>
              </div>
            }
          </div>

          <div class="qr-timer" [class.qr-timer-red]="qrLeft() <= 30 && !qrExpired()">
            @if (!qrExpired()) { ⏱ Valid for <strong>{{ qrClock() }}</strong> } @else { ⛔ QR expired — Refresh karein }
          </div>

          <div class="qr-pop-upi">
            <span class="mono">{{ payUpiId() || 'UPI ID set nahi hai' }}</span>
            @if (payUpiId()) {
              <button class="qr-copy" (click)="copyUpi()">📋 Copy</button>
            }
          </div>

          @if (payInfo()?.accountNo || payInfo()?.bankName) {
            <div class="qr-bank">
              <div class="qr-bank-head">🏦 Bank Transfer (NEFT / IMPS)</div>
              @if (payInfo()?.accountName) { <div class="qr-bank-row"><span>Name</span><b>{{ payInfo()?.accountName }}</b></div> }
              @if (payInfo()?.bankName) { <div class="qr-bank-row"><span>Bank</span><b>{{ payInfo()?.bankName }}</b></div> }
              @if (payInfo()?.accountNo) { <div class="qr-bank-row"><span>A/C No</span><b class="mono">{{ payInfo()?.accountNo }}</b></div> }
              @if (payInfo()?.ifsc) { <div class="qr-bank-row"><span>IFSC</span><b class="mono">{{ payInfo()?.ifsc }}</b></div> }
            </div>
          }

          <div class="qr-pop-note">
            UPI app (GPay / PhonePe / Paytm) se QR scan karein — amount
            <strong>₹{{ breakdown().total | number:'1.0-0' }}</strong> already set hai.
          </div>

          <button class="qr-gateway-btn" (click)="payViaGateway()">💳 Pay via Card / Net Banking</button>

          <label class="qr-pop-lbl">Payment ke baad UPI Transaction ID daalein</label>
          <input class="qr-pop-input" [(ngModel)]="upiTxnId" placeholder="e.g. 4039XXXXXXXX" />

          <button class="qr-pop-submit" [disabled]="processing() || !upiTxnId"
                  (click)="submit()">
            {{ processing() ? 'Processing...' : '✅ Payment Done — Submit' }}
          </button>
          <button class="qr-pop-cancel" (click)="closePlanQr()">Cancel</button>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ===== Plan Pay QR popup (Option B) ===== */
    .qr-pop-backdrop{position:fixed;inset:0;background:rgba(15,30,64,0.62);backdrop-filter:blur(4px);z-index:720;display:flex;align-items:center;justify-content:center;padding:18px;animation:fadeIn 0.18s ease}
    .qr-pop{background:#fff;border-radius:16px;width:100%;max-width:380px;box-shadow:0 24px 70px rgba(0,0,0,0.35);max-height:92vh;overflow-y:auto;animation:fadeIn 0.22s ease}
    .qr-pop-head{background:var(--ax-navy);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid var(--ax-red)}
    .qr-pop-title{font-size:16px;font-weight:800}
    .qr-pop-sub{font-size:11px;opacity:0.85;margin-top:1px}
    .qr-pop-x{background:rgba(255,255,255,0.15);border:0;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px}
    .qr-pop-x:hover{background:rgba(255,255,255,0.3)}
    .qr-pop-amt{text-align:center;padding:16px 18px 8px;display:flex;flex-direction:column;gap:2px}
    .qr-pop-amt span{font-size:11px;color:var(--soft);text-transform:uppercase;letter-spacing:.5px}
    .qr-pop-amt strong{font-size:30px;font-weight:900;color:var(--ax-navy)}
    .qr-pop-amt small{font-size:11px;color:var(--soft)}
    .qr-pop-img{display:flex;justify-content:center;padding:6px 18px}
    .qr-pop-img img{border:1px solid var(--border);border-radius:12px;padding:8px;background:#fff}
    .qr-pop-upi{display:flex;justify-content:center;align-items:center;gap:8px;padding:8px 18px}
    .qr-pop-upi .mono{font-family:ui-monospace,monospace;font-size:13px;font-weight:700;color:var(--ax-navy)}
    .qr-copy{background:var(--ax-cream);border:1px solid var(--border);border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}
    .qr-pop-note{font-size:11px;color:var(--soft);text-align:center;padding:4px 22px 10px;line-height:1.5}
    .qr-pop-lbl{display:block;font-size:11px;font-weight:700;color:var(--ax-navy);padding:0 18px 4px}
    .qr-pop-input{width:calc(100% - 36px);margin:0 18px;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box}
    .qr-pop-input:focus{outline:none;border-color:var(--ax-navy)}
    .qr-pop-submit{width:calc(100% - 36px);margin:12px 18px 8px;padding:12px;background:var(--ax-navy);color:#fff;border:0;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit}
    .qr-pop-submit:disabled{opacity:0.5;cursor:not-allowed}
    .qr-pop-submit:not(:disabled):hover{background:#13234d}
    .qr-pop-cancel{width:calc(100% - 36px);margin:0 18px 16px;padding:9px;background:transparent;color:var(--soft);border:1px solid var(--border);border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}
    /* QR timer + expire + bank + gateway */
    .qr-timer{text-align:center;font-size:12px;color:var(--soft);padding:2px 18px 4px}
    .qr-timer strong{color:var(--ax-navy);font-family:ui-monospace,monospace}
    .qr-timer-red strong, .qr-timer.qr-timer-red{color:var(--ax-red)}
    .qr-expired{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.72);border-radius:12px;cursor:pointer}
    .qr-refresh-btn{background:var(--ax-red);color:#fff;border:0;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit}
    .qr-bank{margin:6px 18px 4px;border:1px solid var(--border);border-radius:10px;padding:8px 12px;background:var(--ax-cream)}
    .qr-bank-head{font-size:11px;font-weight:800;color:var(--ax-navy);margin-bottom:4px}
    .qr-bank-row{display:flex;justify-content:space-between;font-size:12px;padding:1px 0}
    .qr-bank-row span{color:var(--soft)}
    .qr-bank-row b{color:var(--ax-navy)}
    .qr-gateway-btn{width:calc(100% - 36px);margin:4px 18px 6px;padding:10px;background:#fff;color:var(--ax-navy);border:1.5px solid var(--ax-navy);border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit}
    .qr-gateway-btn:hover{background:var(--ax-navy);color:#fff}

    .modal-backdrop{position:fixed;inset:0;background:rgba(15,30,64,0.55);backdrop-filter:blur(3px);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn 0.2s ease}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    .modal{background:#fff;border-radius:16px;width:100%;max-width:820px;max-height:92vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column}
    .modal-head{background:var(--ax-navy);color:#fff;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid var(--ax-red);flex-shrink:0}
    .modal-head h2{font-size:18px;font-weight:800;margin:0}
    .modal-head .sub{font-size:11px;opacity:0.8;margin-top:1px}
    .sp-close{background:rgba(255,255,255,0.15);border:0;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}
    .sp-close:hover{background:rgba(255,255,255,0.30)}
    .modal-body{padding:22px;overflow-y:auto;flex:1}
    .modal-foot{padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--ax-cream);flex-shrink:0}

    .modal-tabs{display:flex;gap:0;border-bottom:1.5px solid var(--border);margin-bottom:18px}
    .modal-tab{padding:10px 16px;font-size:12px;font-weight:700;color:var(--soft);background:transparent;border:0;border-bottom:3px solid transparent;cursor:pointer;font-family:inherit}
    .modal-tab:hover{color:var(--ax-navy)}
    .modal-tab.active{color:var(--ax-red);border-bottom-color:var(--ax-red)}

    .bal-card{background:var(--ax-navy);color:#fff;border-radius:12px;padding:18px 20px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;position:relative;overflow:hidden}
    .bal-card::before{content:'';position:absolute;top:0;right:0;width:100px;height:100%;background:var(--ax-red);clip-path:polygon(40% 0,100% 0,100% 100%,0 100%);opacity:0.9}
    .bal-card .left,.bal-card .right{position:relative;z-index:2}
    .bal-card .label{font-size:11px;opacity:0.85;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:4px}
    .bal-card .amt{font-size:34px;font-weight:800;font-family:'DM Mono',monospace;line-height:1}
    .bal-card .meta{font-size:11px;opacity:0.85;margin-top:6px}
    .bal-card .right{text-align:right}
    .bal-card .runway{font-size:12px;font-weight:700;margin-bottom:2px}
    .bal-card .runway-days{font-size:24px;font-weight:800;font-family:'DM Mono',monospace}
    .bal-card.low{background:var(--ax-navy-dark)}

    .modal-grid{display:grid;grid-template-columns:1fr 280px;gap:20px}
    .summary-panel{background:var(--ax-cream);border-radius:10px;padding:16px;border:1px solid var(--border);height:fit-content;position:sticky;top:0}
    .sum-row{display:flex;justify-content:space-between;font-size:12px;padding:7px 0;border-bottom:1px dashed var(--border)}
    .sum-row.total{font-size:15px;font-weight:800;color:var(--ax-red);padding-top:10px;margin-top:6px;border-top:2px solid var(--ax-red);border-bottom:none}
    .sum-label{color:var(--soft);font-weight:600}
    .sum-val{color:var(--text);font-weight:700;font-family:'DM Mono',monospace}
    .after-box{background:#fff;border-radius:8px;padding:12px;margin-top:14px;border:1.5px solid var(--ok)}
    .after-title{font-size:10px;font-weight:800;color:var(--ok);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
    .after-row{font-size:11px;line-height:1.7}
    .ssl-note{font-size:10px;color:var(--xs);text-align:center;margin-top:10px;line-height:1.5}

    .sec-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--ax-navy);margin-bottom:10px;display:flex;align-items:center;gap:6px}
    .sec-title::before{content:'';width:3px;height:14px;background:var(--ax-red);border-radius:2px}

    .amt-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
    .amt-btn{padding:14px 8px;border:2px solid var(--border);background:#fff;border-radius:10px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:800;color:var(--ax-navy);position:relative}
    .amt-btn:hover{border-color:var(--ax-navy);background:var(--ax-navy-soft)}
    .amt-btn.selected{border-color:var(--ax-red);background:var(--ax-red-soft);color:var(--ax-red-dark)}
    .amt-btn .save{display:block;font-size:9px;color:var(--ok);font-weight:700;margin-top:3px}
    .amt-btn .pop{position:absolute;top:-8px;right:-4px;background:var(--ax-red);color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:8px}

    .custom-amt{position:relative;margin-bottom:14px}
    .custom-amt input{width:100%;padding:14px 16px 14px 40px;border:2px solid var(--border);border-radius:10px;font-size:18px;font-weight:800;font-family:'DM Mono',monospace;color:var(--ax-navy);outline:none}
    .custom-amt input:focus{border-color:var(--ax-red)}
    .custom-amt .rs{position:absolute;left:16px;top:50%;transform:translateY(-50%);font-size:18px;font-weight:800;color:var(--soft)}
    .custom-amt .gst{position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--xs);font-weight:600}

    .pay-methods{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px}
    .pay-method{padding:12px 14px;border:2px solid var(--border);border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:12px;background:#fff}
    .pay-method:hover{border-color:var(--ax-navy)}
    .pay-method.selected{border-color:var(--ax-red);background:var(--ax-red-soft)}
    .pay-method .ico{font-size:24px;width:36px;text-align:center;flex-shrink:0}
    .pay-method .info{flex:1;min-width:0}
    .pay-method .name{font-size:12px;font-weight:800;color:var(--ax-navy);margin-bottom:1px}
    .pay-method .desc{font-size:10px;color:var(--xs);font-weight:500}
    .pay-method .fee{font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;background:#DCFCE7;color:#16A34A}
    .pay-method .fee.paid{background:#FEF3C7;color:#92400E}

    .upi-box{background:var(--ax-red-soft);border:1.5px dashed var(--ax-red);border-radius:10px;padding:14px;margin-bottom:10px}
    .qr-box{width:80px;height:80px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;border:2px solid var(--ax-red);flex-shrink:0;font-size:11px;text-align:center;color:var(--ax-navy);font-weight:700;line-height:1.3}
    .qr-box small{font-size:8px;opacity:0.7}
    .upi-id{font-size:16px;font-weight:800;color:var(--ax-navy);font-family:'DM Mono',monospace;margin-bottom:6px}
    .copy-btn{border:0;background:var(--ax-navy);color:#fff;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;margin-left:6px;font-family:inherit}
    .upi-input{width:100%;padding:10px 12px;margin-top:10px;border:1.5px solid var(--ax-red);border-radius:6px;font-family:'DM Mono',monospace;font-size:12px;outline:none}

    .input{width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Mono',monospace;font-size:12px;outline:none;color:var(--text);background:#fff}
    .input:focus{border-color:var(--ax-navy)}

    .txn-table{width:100%;border-collapse:collapse;font-size:11px}
    .txn-table th{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;color:var(--xs);padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);background:var(--ax-navy-soft)}
    .txn-table td{padding:9px 10px;border-bottom:1px solid var(--border)}
    .cr-row{background:#DCFCE7}
    .txn-cr{color:var(--ok);font-weight:700;font-family:'DM Mono',monospace}
    .txn-dr{color:var(--ax-red);font-weight:700;font-family:'DM Mono',monospace}
    .mono{font-family:'DM Mono',monospace}
    .flag{display:inline-flex;font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px}
    .fr{background:#FEE2E2;color:#B91C1C}
    .fo{background:#DCFCE7;color:#16A34A}

    .stat-mini{padding:12px;border-radius:10px;border:1px solid var(--border);background:#fff}
    .stat-mini.ok{border-left:3px solid var(--ok)}
    .stat-mini.red{border-left:3px solid var(--ax-red)}
    .stat-mini.navy{border-left:3px solid var(--ax-navy)}
    .stat-mini.amber{border-left:3px solid var(--warn)}
    .stat-mini .v{font-size:16px;font-weight:800;font-family:'DM Mono',monospace;color:var(--ax-navy)}
    .stat-mini .l{font-size:9px;color:var(--xs);text-transform:uppercase;font-weight:700;margin-top:4px}

    .pricing-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px}
    .pricing-item{padding:10px 12px;background:var(--ax-cream);border:1px solid var(--border);border-radius:8px}
    .p-svc{font-weight:700;color:var(--ax-navy);font-size:12px;margin-bottom:2px}
    .p-cost{color:var(--ax-red);font-weight:800;font-family:'DM Mono',monospace;font-size:13px}

    /* Add-on services (firm pick list) */
    .svc-list{display:flex;flex-direction:column;gap:8px}
    .svc-card{border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:#fff;transition:border-color .15s}
    .svc-card.on{border-color:var(--ax-navy);background:var(--ax-cream)}
    .svc-main{display:flex;align-items:center;gap:10px;cursor:pointer}
    .svc-main input[type=checkbox]{width:17px;height:17px;flex-shrink:0;accent-color:var(--ax-navy)}
    .svc-ico{font-size:18px}
    .svc-info{flex:1;display:flex;flex-direction:column}
    .svc-name{font-weight:700;color:var(--ax-navy);font-size:13px}
    .svc-note{font-size:10px;color:var(--soft)}
    .svc-rate{color:var(--ax-red);font-weight:800;font-family:'DM Mono',monospace;font-size:13px;white-space:nowrap}
    .svc-rate small{color:var(--soft);font-weight:600;font-size:10px}
    .svc-mode{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px;padding-left:27px}
    .md-opt{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--soft);border:1px solid var(--border);border-radius:20px;padding:3px 10px;cursor:pointer}
    .md-opt.sel{border-color:var(--ax-navy);color:var(--ax-navy);background:#fff}
    .md-opt input{accent-color:var(--ax-navy)}
    .svc-self{flex:1;min-width:160px;padding:5px 9px;border:1px solid var(--border);border-radius:7px;font-size:11px;font-family:inherit}

    .plans-box{background:var(--ax-cream);border-radius:10px;padding:12px;border:1px solid var(--border)}
    .plan-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);font-size:12px}
    .plan-row:last-child{border-bottom:none}
    .plan-pay-btn{background:var(--ax-red);color:#fff;border:0;border-radius:7px;padding:7px 18px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;box-shadow:0 2px 6px rgba(217,30,40,.3)}
    .plan-pay-btn:hover{background:var(--ax-red-dark)}
    .plan-row.featured strong{color:var(--ax-red)}
    .plan-row.featured strong::after{content:' ⭐'}
    .plan-row.featured .mono{color:var(--ax-red)}

    .cashback-note{background:var(--ax-red-soft);border:1px solid var(--ax-red);border-radius:8px;padding:12px;margin-top:14px;font-size:11px;line-height:1.6}

    .auto-box{background:var(--ax-navy-soft);border:1.5px solid var(--ax-navy);border-radius:10px;padding:12px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:14px}
    .auto-box .info{flex:1}
    .auto-box .title{font-size:12px;font-weight:800;color:var(--ax-navy);margin-bottom:2px}
    .auto-box .desc{font-size:10px;color:var(--soft)}
    .toggle-switch{width:38px;height:22px;background:#CCC;border-radius:11px;position:relative;cursor:pointer;flex-shrink:0;transition:background 0.2s}
    .toggle-switch.on{background:var(--ax-red)}
    .toggle-switch::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:transform 0.2s}
    .toggle-switch.on::after{transform:translateX(16px)}
    .form-lbl{font-size:11px;font-weight:700;color:var(--ax-navy);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:block}
    .form-hint{font-size:10px;color:var(--xs);margin-top:4px}
    .rs-input{position:relative}
    .rs-input span{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-weight:800;color:var(--soft)}
    .rs-input input{width:100%;padding:11px 14px 11px 30px;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Mono',monospace;font-size:14px;font-weight:700;outline:none}
    .card-display{background:var(--ax-navy);color:#fff;border-radius:12px;padding:18px;font-family:'DM Mono',monospace;position:relative;overflow:hidden}
    .card-brand{position:absolute;top:14px;right:14px;font-size:14px;font-weight:800;background:var(--ax-red);padding:3px 10px;border-radius:4px}
    .card-type{font-size:11px;opacity:0.8;margin-bottom:18px;text-transform:uppercase;letter-spacing:1px}
    .card-num{font-size:20px;letter-spacing:4px;margin-bottom:14px}
    .card-foot{display:flex;justify-content:space-between;font-size:11px}
    .card-lbl{opacity:0.7;font-size:9px}
    .cap-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px}
    .cap-radio{display:flex;align-items:center;gap:8px;padding:10px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;font-size:12px}
    .cap-radio.selected{border-color:var(--ax-red);background:var(--ax-red-soft);color:var(--ax-red-dark);font-weight:700}
    .cap-radio input{accent-color:var(--ax-red)}
    .status-ok{background:#DCFCE7;border:1px solid var(--ok);border-radius:8px;padding:12px;margin-top:18px;font-size:11px}

    .btn-block{width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--border);background:#fff;color:var(--soft);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}
    .btn-block:hover{background:var(--ax-navy-soft);color:var(--ax-navy);border-color:var(--ax-navy)}
    .btn-block.primary{background:var(--ax-red);color:#fff;border-color:var(--ax-red)}
    .btn-block.primary:hover{background:var(--ax-red-dark)}
    .btn-block.primary:disabled{opacity:0.5;cursor:not-allowed}

    @media(max-width:768px){
      .modal{max-width:100%;max-height:100vh;border-radius:0}
      .modal-grid{grid-template-columns:1fr}
      .summary-panel{position:static}
      .amt-grid{grid-template-columns:repeat(3,1fr)}
      .pay-methods{grid-template-columns:1fr}
    }

    @media(max-width:640px){
      .modal-backdrop{padding:0}
      .modal{width:auto !important;max-width:100% !important;max-height:100vh;border-radius:0}
      .modal-body{padding:14px}
      .modal-head{padding:14px 16px}
      .modal-foot{padding:12px 14px;flex-wrap:wrap;gap:10px}
      .modal-tabs{flex-wrap:wrap}
      .modal-grid{grid-template-columns:1fr !important}
      .amt-grid{grid-template-columns:repeat(2,1fr) !important}
      .pay-methods{grid-template-columns:1fr !important}
      .bal-card{flex-wrap:wrap;gap:10px;padding:14px}
      .bal-card .right{text-align:left}
      .cap-grid{grid-template-columns:1fr !important}
      .pricing-grid{grid-template-columns:1fr !important}
      .txn-table{white-space:nowrap}
      .qr-pop{max-width:100% !important}
    }
  `]
})
export class RechargeModalComponent {
  @Output() closed = new EventEmitter<void>();
  wallet = inject(WalletService);
  private http = inject(HttpClient);

  // BYOK: firm ka AI provider + console recharge link
  ai = signal<{ provider: string; providerName: string; keySet: boolean; consoleUrl: string } | null>(null);

  // Admin-configured payment details (UPI/QR) — recharge modal me dikhane ke liye
  payInfo = signal<{ payeeName?: string; upiId?: string; qrImageUrl?: string; bankName?: string; accountName?: string; accountNo?: string; ifsc?: string; instructions?: string } | null>(null);
  payUpiId(): string { return this.payInfo()?.upiId || ''; }

  // ── QR 2-min validity timer ──
  qrLeft = signal(120);
  qrNonce = signal(0);
  qrExpired = computed(() => this.qrLeft() <= 0);
  qrClock = computed(() => { const s = Math.max(0, this.qrLeft()); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; });
  private qrTimer: any = null;
  private startQrTimer(): void {
    this.qrLeft.set(120);
    this.qrNonce.set(Date.now());
    clearInterval(this.qrTimer);
    this.qrTimer = setInterval(() => {
      this.qrLeft.update(v => v - 1);
      if (this.qrLeft() <= 0) clearInterval(this.qrTimer);
    }, 1000);
  }
  refreshQr(): void { this.startQrTimer(); }
  ngOnDestroy(): void { clearInterval(this.qrTimer); }
  qrUrl(): string {
    const p = this.payInfo();
    if (!p) return '';
    // UPI ID ho to AMOUNT-embedded QR banao (scan par UPI app me amount auto-bhar jaayega)
    if (p.upiId) {
      const amt = (this.breakdown().total || 0).toFixed(2);
      const note = encodeURIComponent('Anjaninex subscription');
      const data = `upi://pay?pa=${p.upiId}&pn=${encodeURIComponent(p.payeeName || '')}&am=${amt}&cu=INR&tn=${note}`;
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
    }
    if (p.qrImageUrl) return p.qrImageUrl;   // fallback: admin ki static custom QR (amount nahi aata)
    return '';
  }

  ngOnInit() {
    this.http.get<any>(`${environment.apiUrl}/api/billing/ai-info`).subscribe({
      next: (a) => this.ai.set(a),
      error: () => {}
    });
    this.http.get<any>(`${environment.apiUrl}/api/billing/pay-info`).subscribe({
      next: (p) => this.payInfo.set(p),
      error: () => {}
    });
    this.loadServices();
  }

  // ── Add-on services (firm) ──
  svcItems: any[] = [];
  svcSaving = signal(false);
  svcMsg = signal('');

  loadServices() {
    this.http.get<any[]>(`${environment.apiUrl}/api/billing/services`).subscribe({
      next: (list) => this.svcItems = (list || []).map(s => ({ ...s, mode: s.mode || 'anjaninex' })),
      error: () => {}
    });
  }

  saveServices() {
    this.svcSaving.set(true); this.svcMsg.set('');
    const items = this.svcItems.map(s => ({
      serviceId: s.id, enabled: !!s.enabled,
      mode: s.mode === 'self' ? 'self' : 'anjaninex',
      selfNote: s.mode === 'self' ? (s.selfNote || null) : null
    }));
    this.http.post(`${environment.apiUrl}/api/billing/services`, { items }).subscribe({
      next: () => { this.svcSaving.set(false); this.svcMsg.set('✅ Saved'); setTimeout(() => this.svcMsg.set(''), 2500); },
      error: (e) => { this.svcSaving.set(false); alert('Save nahi hua: ' + (e?.error?.error ?? 'error')); }
    });
  }

  activeTab = signal<Tab>('recharge');
  amount = signal<number>(2500);
  customInput = signal<string>('');
  method = signal<PayMethod>('upi');
  gstin = '';
  upiTxnId = '';
  processing = signal<boolean>(false);

  // Auto-recharge state
  autoOn = signal<boolean>(true);
  autoThreshold = 500;
  autoAmount = 5000;
  autoCap = signal<number>(25000);
  capOptions = [10000, 25000, 0];

  quickAmounts = [
    { value: 500,   label: '500',    color: '#0ea5e9' },
    { value: 1000,  label: '1,000',  color: '#16a34a' },
    { value: 2500,  label: '2,500', tag: 'Popular', color: '#d91e28' },
    { value: 5000,  label: '5,000', save: 50,  color: '#9333ea' },
    { value: 10000, label: '10,000', save: 150, color: '#d97706' }
  ];

  methods = [
    { id: 'upi'      as PayMethod, icon: '📱', name: 'UPI',                     desc: 'Instant · PhonePe, GPay, Paytm',     fee: 'FREE', feePercent: 0, color: '#16a34a' },
    { id: 'razorpay' as PayMethod, icon: '💳', name: 'Razorpay (Card/NetBanking)', desc: 'Visa · Mastercard · RuPay · 50+ banks', fee: '+2%',  feePercent: 2, color: '#2563eb' },
    { id: 'neft'     as PayMethod, icon: '🏦', name: 'NEFT / RTGS / IMPS',       desc: 'Bank transfer · Manual confirm',     fee: 'FREE', feePercent: 0, color: '#9333ea' }
  ];

  plans = [
    { name: 'Starter',    price: 999,  features: '100 bills/mo, 50 AI scans, 2 users, 5GB' },
    { name: 'Pro',        price: 2499, features: '500 bills/mo, 200 AI scans, 5 users, 25GB, HR', featured: true },
    { name: 'Enterprise', price: 6999, features: 'Unlimited everything, white-label, API' }
  ];

  breakdown = computed(() => WalletService.computeBreakdown(this.amount(), this.method()));
  newRunwayDays = computed(() => {
    const avg = this.wallet.stats().avgDailySpend || 38;
    return Math.floor((this.wallet.balance() + this.amount()) / avg);
  });

  constructor() {
    this.wallet.refresh();
    // Keep custom input in sync when a quick button is clicked
    effect(() => {
      const a = this.amount();
      if (!this.quickAmounts.some(q => q.value === a)) {
        this.customInput.set(String(a));
      } else {
        this.customInput.set('');
      }
    });
  }

  statusLine(): string {
    const h = this.wallet.history();
    if (h.length === 0) return 'No recent transactions';
    const last = h[0];
    const sign = last.amount > 0 ? '+ ₹' : '— ₹';
    return `Last ${last.amount > 0 ? 'recharge' : 'debit'}: ${sign}${Math.abs(last.amount).toLocaleString('en-IN')} · ${last.description}`;
  }

  txnLabel(t: string): string {
    if (t.includes('recharge')) return 'RECHARGE';
    if (t.includes('subscription')) return 'SUBSCRIPTION';
    if (t.includes('refund')) return 'REFUND';
    return 'DEBIT';
  }

  selectAmount(v: number): void {
    this.amount.set(v);
    this.customInput.set('');
  }

  onCustom(v: string): void {
    this.customInput.set(v);
    const n = parseInt(v) || 0;
    if (n > 0) this.amount.set(n);
  }

  // Plan "Pay" → QR popup khole us plan ke amount ka (scan karke pay)
  payPlan = signal<{ name: string; price: number } | null>(null);
  openPlanQr(plan: { name: string; price: number }): void {
    this.amount.set(plan.price);
    this.customInput.set('');
    this.method.set('upi');
    this.upiTxnId = '';
    this.payPlan.set(plan);
    this.startQrTimer();
  }
  /** Recharge tab ka Pay button — same QR popup (Wallet Recharge naam se) */
  openRechargePay(): void {
    if (this.amount() < 1) return;
    this.method.set('upi');
    this.upiTxnId = '';
    this.payPlan.set({ name: 'Wallet Recharge', price: this.amount() });
    this.startQrTimer();
  }
  closePlanQr(): void { this.payPlan.set(null); clearInterval(this.qrTimer); }

  async copyUpi(): Promise<void> {
    const upi = this.payUpiId();
    if (!upi) { alert('UPI ID abhi set nahi hai.'); return; }
    try {
      await navigator.clipboard.writeText(upi);
      alert('Copied: ' + upi);
    } catch {}
  }

  private loadRzpScript(): Promise<void> {
    return new Promise((res, rej) => {
      if ((window as any).Razorpay) { res(); return; }
      const sc = document.createElement('script');
      sc.src = 'https://checkout.razorpay.com/v1/checkout.js';
      sc.onload = () => res();
      sc.onerror = () => rej(new Error('checkout.js load fail'));
      document.body.appendChild(sc);
    });
  }

  async payViaGateway(): Promise<void> {
    const amt = this.payPlan()?.price ?? this.amount();
    if (!amt || amt < 1) { alert('Amount sahi nahi hai.'); return; }
    this.processing.set(true);
    try {
      await this.loadRzpScript();
      const order: any = await new Promise((res, rej) =>
        this.http.post(`${environment.apiUrl}/api/billing/razorpay/order`, { amount: amt })
          .subscribe({ next: r => res(r), error: e => rej(e) }));
      const Rzp = (window as any).Razorpay;
      if (!Rzp) throw new Error('Razorpay load nahi hua');
      const rzp = new Rzp({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: order.name || 'Vyapaar Setu',
        description: this.payPlan()?.name || 'Wallet Recharge',
        theme: { color: '#5c1a8b' },
        handler: (resp: any) => {
          this.http.post<any>(`${environment.apiUrl}/api/billing/razorpay/verify`, {
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
            amount: amt
          }).subscribe({
            next: () => {
              this.processing.set(false);
              alert('\u2705 Payment successful! Wallet update ho gaya.');
              this.wallet.refresh();
              this.closePlanQr();
            },
            error: (e) => {
              this.processing.set(false);
              alert('\u26A0\uFE0F Payment hua par verify fail: ' + (e?.error?.error ?? 'unknown') + '\nSupport se sampark karo.');
            }
          });
        },
        modal: { ondismiss: () => this.processing.set(false) }
      });
      rzp.on('payment.failed', (r: any) => {
        this.processing.set(false);
        alert('\u274C Payment fail: ' + (r?.error?.description ?? ''));
      });
      rzp.open();
    } catch (e: any) {
      this.processing.set(false);
      alert('\u26A0\uFE0F Gateway error: ' + (e?.error?.error ?? e?.message ?? 'unknown'));
    }
  }

  async submit(): Promise<void> {
    if (this.amount() < 1) return;
    this.processing.set(true);
    try {
      const newBal = await this.wallet.recharge({
        amount: this.amount(),
        source: this.method(),
        reference: this.upiTxnId || `${this.method()}_${Date.now()}`,
        gstin: this.gstin
      });
      alert(`✅ Recharge successful! New balance: ₹${newBal.toLocaleString('en-IN')}`);
      this.close();
    } catch (e: any) {
      alert('❌ Recharge failed: ' + (e?.error?.error ?? e?.message ?? 'unknown error'));
    } finally {
      this.processing.set(false);
    }
  }

  saveAuto(): void {
    // Would call /api/wallet/auto-recharge in real backend
    alert(`✅ Auto-recharge saved: ₹${this.autoAmount} when balance < ₹${this.autoThreshold}`);
    this.close();
  }

  // CSV cell escaping: quote when value has comma/quote/newline
  private csvCell(v: any): string {
    const s = (v ?? '').toString();
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  exportLedger(): void {
    const rows = [['Date', 'Type', 'Description', 'Reference', 'Amount', 'Balance']];
    this.wallet.history().forEach(e => {
      rows.push([
        new Date(e.createdAt).toLocaleString('en-IN'),
        e.txnType, e.description, e.referenceId,
        e.amount.toFixed(2), e.balanceAfter.toFixed(2)
      ]);
    });
    const csv = rows.map(r => r.map(c => this.csvCell(c)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `wallet-ledger-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) this.close();
  }

  close(): void { this.closed.emit(); }
}
