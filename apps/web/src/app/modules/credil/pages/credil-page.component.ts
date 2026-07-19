import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import { CredilService, CredilStatus, CredilRequestRow, CredilReport, CredilRequestResult } from '../credil.service';

import { BackButtonComponent } from '../../../shared/back-button.component';
@Component({
  standalone: true,
  selector: 'app-credil-page',
  imports: [BackButtonComponent, CommonModule, FormsModule],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
  <div class="credil-wrap">
    <div class="hdr">
      <div>
        <h1>CREDIL <span class="tag">Credit Index Link</span></h1>
        <p class="sub">Kisi bhi party ka network-wide payment &amp; trust score — GST se. Consent OTP ke saath.</p>
      </div>
    </div>

    @if (status() && !status()!.enabled) {
      <div class="card locked">
        <div class="lock-ico">🔒</div>
        <h3>CREDIL aapke liye enable nahi hai</h3>
        <p>Yeh premium feature hai. Anjaninex admin se apne firm ke liye enable karwayein.</p>
      </div>
    } @else if (status()) {
      <div class="tabs">
        <button [class.active]="tab()==='new'" (click)="tab.set('new')">＋ Nayi Report</button>
        <button [class.active]="tab()==='mine'" (click)="tab.set('mine'); loadMine()">📋 Meri Reports</button>
      </div>

      <!-- ============ NEW REQUEST WIZARD ============ -->
      @if (tab()==='new') {
        <div class="card">
          <!-- step indicator -->
          <div class="steps">
            <span [class.on]="step()>=1">1 GST + Components</span>
            <span [class.on]="step()>=2">2 OTP</span>
            <span [class.on]="step()>=3">3 Payment</span>
            <span [class.on]="step()>=4">4 Report</span>
          </div>

          @if (step()===1) {
            <label class="lbl">Party ka GST Number</label>
            <input class="inp" [(ngModel)]="gst" placeholder="24ABCDE1234F1Z5" maxlength="15"
                   (input)="gst = gst.toUpperCase()">

            <label class="lbl">Kaun se scores chahiye?</label>
            <div class="comp-grid">
              @for (c of status()!.components; track c) {
                <label class="comp" [class.sel]="picked[c]">
                  <input type="checkbox" [(ngModel)]="picked[c]" (change)="recalc()">
                  <span>{{ compLabel(c) }}</span>
                </label>
              }
            </div>

            <div class="price-row">
              <span>Report fee:</span>
              <strong>₹{{ price() }}</strong>
              <small>(saare = ₹{{ status()!.fullReportPrice }} full · per component ₹{{ status()!.perComponentPrice }})</small>
            </div>

            @if (err()) { <div class="err">{{ err() }}</div> }
            <button class="btn primary" [disabled]="busy()" (click)="submitRequest()">
              {{ busy() ? 'Bhej rahe hain…' : 'OTP bhejo (consent)' }}
            </button>
            <p class="note">Party ke registered mobile par consent OTP jayega. Unse OTP lekar hi report banegi.</p>
          }

          @if (step()===2 && reqResult()) {
            <div class="otp-box">
              <p>OTP bheja gaya: <strong>{{ reqResult()!.maskedMobile }}</strong>
                 @if (reqResult()!.partyName) { <span class="pname">({{ reqResult()!.partyName }})</span> }</p>
              @if (!reqResult()!.otpSent) {
                <div class="warn">WhatsApp se OTP send nahi ho paya (provider off/number WhatsApp par nahi). Party ko OTP alag se dena hoga.</div>
              }
              @if (reqResult()!.otpPreview) {
                <div class="dev">Admin test OTP: <strong>{{ reqResult()!.otpPreview }}</strong></div>
              }
              <label class="lbl">6-digit OTP</label>
              <input class="inp otp" [(ngModel)]="otp" placeholder="______" maxlength="6" inputmode="numeric">
              @if (err()) { <div class="err">{{ err() }}</div> }
              <button class="btn primary" [disabled]="busy()" (click)="submitOtp()">
                {{ busy() ? 'Check…' : 'OTP verify karo' }}
              </button>
            </div>
          }

          @if (step()===3) {
            <div class="pay-box">
              <p>OTP verified ✓. Ab report fee <strong>₹{{ price() }}</strong> pay karein.</p>
              @if (err()) { <div class="err">{{ err() }}</div> }
              <button class="btn primary" [disabled]="busy()" (click)="pay()">
                {{ busy() ? 'Kholte hain…' : '₹' + price() + ' pay karo (Razorpay)' }}
              </button>
            </div>
          }

          @if (step()===4) {
            <div class="done-box">
              <div class="tick">✓</div>
              <h3>Payment ho gaya!</h3>
              <p>Aapki request Anjaninex admin ke pass approval ke liye chali gayi hai.
                 Approve hote hi report yahin "Meri Reports" me aa jayegi (bell par notification bhi).</p>
              <button class="btn" (click)="resetWizard(); tab.set('mine'); loadMine()">Meri Reports dekho</button>
            </div>
          }
        </div>
      }

      <!-- ============ MY REPORTS ============ -->
      @if (tab()==='mine') {
        <div class="card">
          @if (mineLoading()) { <p class="muted">Load ho raha hai…</p> }
          @else if (mine().length === 0) { <p class="muted">Abhi koi request nahi. "Nayi Report" se shuru karein.</p> }
          @else {
            <table class="tbl">
              <thead><tr><th>GST</th><th>Components</th><th>Fee</th><th>Status</th><th>Date</th><th></th></tr></thead>
              <tbody>
                @for (r of mine(); track r.id) {
                  <tr>
                    <td class="mono">{{ r.targetGst }}</td>
                    <td>{{ r.components.length }} scores</td>
                    <td>₹{{ r.amount }}</td>
                    <td><span class="pill" [class]="pillClass(r.status)">{{ statusLabel(r.status) }}</span></td>
                    <td>{{ r.createdAt | date:'dd MMM, HH:mm' }}</td>
                    <td>
                      @if (r.status === 'delivered' && r.hasReport) {
                        <button class="btn sm primary" (click)="openReport(r)">View</button>
                      } @else if (r.status === 'rejected') {
                        <span class="rej" [title]="r.reviewNote || ''">rejected</span>
                      } @else { <span class="muted">—</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }
    }
  </div>

  <!-- ============ REPORT MODAL ============ -->
  @if (report()) {
    <div class="ovl" (click)="report.set(null)">
      <div class="report" (click)="$event.stopPropagation()" id="credil-report">
        <div class="rep-hdr">
          <div>
            <div class="rep-brand">CREDIL <small>Credit Index Link</small></div>
            <div class="rep-gst">GST: <strong>{{ report()!.gst }}</strong> · {{ report()!.entityType | titlecase }}</div>
          </div>
          <div class="gauge">
            <div class="gv">{{ report()!.totalScore }}</div>
            <div class="gb" [class]="bandClass(report()!.band)">{{ report()!.band }}</div>
          </div>
        </div>

        <div class="rep-range">
          <span>300</span>
          <div class="bar"><div class="marker" [style.left.%]="gaugePct()"></div></div>
          <span>900</span>
        </div>

        <div class="sub-scores">
          @for (c of report()!.components; track c.key) {
            <div class="ss">
              <div class="ss-top"><span>{{ c.label }}</span><strong>{{ c.score }}/100</strong></div>
              <div class="ss-bar"><div [style.width.%]="c.score" [class]="scoreClass(c.score)"></div></div>
            </div>
          }
        </div>

        @if (report()!.redFlags?.length) {
          <div class="flags">
            <h4>🚩 Red Flags</h4>
            @for (f of report()!.redFlags; track $index) {
              <div class="flag">{{ f.msg || f.type || f }}</div>
            }
          </div>
        } @else {
          <div class="noflag">✓ Koi red flag nahi</div>
        }

        <div class="meta">
          <span>Network firms: {{ report()!.firmsCount }}</span>
          <span>Data points: {{ report()!.dataPoints }}</span>
          @if (report()!.computedAt) { <span>Computed: {{ report()!.computedAt | date:'dd MMM yyyy' }}</span> }
        </div>

        <p class="disclaimer">Yeh report Anjaninex network ke internal transaction behaviour par based hai. Yeh RBI/CIBIL ka official credit score nahi hai; sirf trade reference ke liye.</p>

        <div class="rep-actions">
          <button class="btn" (click)="report.set(null)">Band karo</button>
          <button class="btn wa" (click)="shareWhatsApp()">📲 Share karo</button>
          <button class="btn primary" (click)="printReport()">🖨 Print / PDF</button>
        </div>
      </div>
    </div>
  }
  `,
  styles: [`
    .credil-wrap{max-width:940px;margin:0 auto;padding:18px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
    h1{font-size:26px;margin:0;color:#0f766e}
    .tag{font-size:12px;background:#ccfbf1;color:#0f766e;padding:2px 8px;border-radius:20px;vertical-align:middle}
    .sub{color:#64748b;margin:4px 0 0;font-size:13px}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
    .locked{text-align:center;padding:40px}
    .lock-ico{font-size:40px}
    .tabs{display:flex;gap:8px;margin-bottom:14px}
    .tabs button{border:1px solid #e2e8f0;background:#fff;padding:8px 16px;border-radius:10px;cursor:pointer;font-weight:600;color:#475569}
    .tabs button.active{background:#0d9488;color:#fff;border-color:#0d9488}
    .steps{display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap}
    .steps span{font-size:11px;padding:5px 10px;border-radius:20px;background:#f1f5f9;color:#94a3b8;font-weight:600}
    .steps span.on{background:#0d9488;color:#fff}
    .lbl{display:block;font-size:12px;font-weight:700;color:#475569;margin:14px 0 6px}
    .inp{width:100%;padding:11px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;box-sizing:border-box}
    .inp.otp{letter-spacing:8px;text-align:center;font-size:22px;font-weight:700}
    .comp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
    .comp{display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;cursor:pointer;font-size:14px}
    .comp.sel{border-color:#0d9488;background:#f0fdfa}
    .price-row{display:flex;align-items:center;gap:10px;margin:16px 0;font-size:14px}
    .price-row strong{font-size:20px;color:#0f766e}
    .price-row small{color:#94a3b8}
    .btn{border:1px solid #cbd5e1;background:#fff;padding:11px 18px;border-radius:10px;font-weight:700;cursor:pointer;color:#334155}
    .btn.primary{background:#0d9488;color:#fff;border-color:#0d9488}
    .btn.wa{background:#0f766e;color:#fff;border-color:#0f766e}
    .btn.sm{padding:6px 12px;font-size:13px}
    .btn:disabled{opacity:.6;cursor:default}
    .note{font-size:12px;color:#94a3b8;margin-top:10px}
    .err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:9px 12px;border-radius:9px;font-size:13px;margin:10px 0}
    .warn{background:#fffbeb;color:#b45309;border:1px solid #fde68a;padding:9px 12px;border-radius:9px;font-size:13px;margin:8px 0}
    .dev{background:#eff6ff;color:#1d4ed8;border:1px dashed #93c5fd;padding:9px 12px;border-radius:9px;font-size:14px;margin:8px 0}
    .otp-box .pname{color:#64748b}
    .done-box{text-align:center;padding:20px}
    .tick{width:56px;height:56px;border-radius:50%;background:#0d9488;color:#fff;font-size:30px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
    .tbl{width:100%;border-collapse:collapse;font-size:14px}
    .tbl th{text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;padding:8px}
    .tbl td{padding:10px 8px;border-top:1px solid #f1f5f9}
    .mono,.mono td{font-family:monospace;font-size:13px}
    .muted{color:#94a3b8}
    .pill{font-size:11px;padding:3px 9px;border-radius:20px;font-weight:700}
    .p-pending{background:#fef9c3;color:#a16207}.p-paid{background:#dbeafe;color:#1d4ed8}
    .p-delivered{background:#dcfce7;color:#15803d}.p-rejected{background:#fee2e2;color:#b91c1c}
    .rej{color:#b91c1c;font-size:12px}
    /* report */
    .ovl{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px}
    .report{background:#fff;border-radius:16px;max-width:560px;width:100%;padding:24px;max-height:92vh;overflow:auto}
    .rep-hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #f1f5f9;padding-bottom:14px}
    .rep-brand{font-size:22px;font-weight:800;color:#0f766e}.rep-brand small{font-size:11px;color:#94a3b8;font-weight:600;display:block}
    .rep-gst{font-size:13px;color:#475569;margin-top:6px}
    .gauge{text-align:center}
    .gv{font-size:34px;font-weight:800;color:#0f172a;line-height:1}
    .gb{font-size:12px;font-weight:700;padding:2px 10px;border-radius:20px;margin-top:4px}
    .b-excellent{background:#dcfce7;color:#15803d}.b-good{background:#d1fae5;color:#047857}
    .b-fair{background:#fef9c3;color:#a16207}.b-poor{background:#fee2e2;color:#b91c1c}
    .rep-range{display:flex;align-items:center;gap:8px;margin:16px 0;font-size:11px;color:#94a3b8}
    .rep-range .bar{flex:1;height:8px;border-radius:8px;background:linear-gradient(90deg,#ef4444,#f59e0b,#10b981);position:relative}
    .rep-range .marker{position:absolute;top:-4px;width:16px;height:16px;border-radius:50%;background:#0f172a;border:3px solid #fff;transform:translateX(-50%);box-shadow:0 1px 4px rgba(0,0,0,.3)}
    .sub-scores{display:flex;flex-direction:column;gap:12px;margin:18px 0}
    .ss-top{display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px}
    .ss-bar{height:8px;background:#f1f5f9;border-radius:8px;overflow:hidden}
    .ss-bar>div{height:100%;border-radius:8px}
    .sc-hi{background:#10b981}.sc-mid{background:#f59e0b}.sc-lo{background:#ef4444}
    .flags{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;margin:12px 0}
    .flags h4{margin:0 0 6px;color:#b91c1c;font-size:14px}
    .flag{font-size:13px;color:#991b1b;padding:3px 0}
    .noflag{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;border-radius:10px;padding:10px;font-size:13px;text-align:center;margin:12px 0}
    .meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#94a3b8;margin:12px 0}
    .disclaimer{font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:10px}
    .rep-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:12px}
    @media print{.ovl{position:static;background:#fff}.rep-actions,.tabs{display:none}}
  `]
})
export class CredilPageComponent implements OnInit {
  private svc = inject(CredilService);

  status = signal<CredilStatus | null>(null);
  tab = signal<'new' | 'mine'>('new');
  step = signal(1);
  busy = signal(false);
  err = signal('');

  gst = '';
  otp = '';
  picked: Record<string, boolean> = {};
  reqResult = signal<CredilRequestResult | null>(null);

  mine = signal<CredilRequestRow[]>([]);
  mineLoading = signal(false);
  report = signal<CredilReport | null>(null);

  price = computed(() => {
    const s = this.status(); if (!s) return 0;
    const picks = s.components.filter(c => this.picked[c]);
    const n = picks.length || s.components.length;
    if (n >= s.components.length) return s.fullReportPrice;
    return Math.min(s.fullReportPrice, s.perComponentPrice * n);
  });

  async ngOnInit() {
    try { this.status.set(await this.svc.status()); } catch { this.status.set(null); }
  }

  recalc() { /* price is computed */ }

  compLabel(c: string) {
    return ({ pay: 'Payment Score', default: 'Default Risk', trade: 'Trade / Returns', volume: 'Volume & Tenure' } as any)[c] || c;
  }

  private pickedList(): string[] {
    const s = this.status()!;
    const picks = s.components.filter(c => this.picked[c]);
    return picks.length ? picks : s.components;
  }

  async submitRequest() {
    this.err.set('');
    if (this.gst.trim().length < 10) { this.err.set('Sahi GST daalein.'); return; }
    this.busy.set(true);
    try {
      const res = await this.svc.createRequest(this.gst.trim(), this.pickedList());
      this.reqResult.set(res);
      this.step.set(2);
    } catch (e: any) { this.err.set(e?.error?.error || 'Request fail hui.'); }
    finally { this.busy.set(false); }
  }

  async submitOtp() {
    this.err.set('');
    if (this.otp.trim().length < 4) { this.err.set('OTP daalein.'); return; }
    this.busy.set(true);
    try {
      await this.svc.verifyOtp(this.reqResult()!.requestId, this.otp.trim());
      this.step.set(3);
    } catch (e: any) { this.err.set(e?.error?.error || 'OTP galat.'); }
    finally { this.busy.set(false); }
  }

  async pay() {
    this.err.set('');
    this.busy.set(true);
    const id = this.reqResult()!.requestId;
    try {
      const order = await this.svc.payOrder(id);
      const r = await this.svc.openCheckout(order);
      await this.svc.payVerify(id, r.orderId, r.paymentId, r.signature);
      this.step.set(4);
    } catch (e: any) { this.err.set(e?.error?.error || e?.message || 'Payment fail hui.'); }
    finally { this.busy.set(false); }
  }

  resetWizard() {
    this.step.set(1); this.gst = ''; this.otp = ''; this.picked = {};
    this.reqResult.set(null); this.err.set('');
  }

  async loadMine() {
    this.mineLoading.set(true);
    try { this.mine.set(await this.svc.myRequests()); } catch { this.mine.set([]); }
    finally { this.mineLoading.set(false); }
  }

  async openReport(r: CredilRequestRow) {
    try { this.report.set(await this.svc.getReport(r.id)); }
    catch (e: any) { alert(e?.error?.error || 'Report load nahi hui.'); }
  }

  printReport() { window.print(); }

  // ── WhatsApp share: PDF banao -> mobile pe seedha share sheet (WhatsApp attach),
  //    desktop pe PDF download + wa.me text (user attach kar dega) ──
  private buildPdf(): jsPDF {
    const r = this.report()!;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(24); doc.setTextColor(15, 118, 110); doc.setFont('helvetica', 'bold');
    doc.text('CREDIL', 14, 20);
    doc.setFontSize(9); doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'normal');
    doc.text('Credit Index Link — Payment & Trust Report', 14, 26);
    // Score (right)
    doc.setFontSize(32); doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold');
    doc.text(String(r.totalScore), pw - 14, 22, { align: 'right' });
    doc.setFontSize(11);
    const bandCol: Record<string, [number, number, number]> = {
      excellent: [21, 128, 61], good: [4, 120, 87], fair: [161, 98, 7], poor: [185, 28, 28]
    };
    const bc = bandCol[(r.band || '').toLowerCase()] || [100, 116, 139];
    doc.setTextColor(bc[0], bc[1], bc[2]);
    doc.text(r.band || '', pw - 14, 29, { align: 'right' });

    doc.setDrawColor(226, 232, 240); doc.line(14, 33, pw - 14, 33);
    doc.setFontSize(11); doc.setTextColor(51, 65, 85); doc.setFont('helvetica', 'normal');
    doc.text(`GST: ${r.gst}   ·   ${r.entityType || ''}`, 14, 41);

    // Sub-scores with bars
    let y = 52;
    for (const c of (r.components || [])) {
      doc.setFontSize(10); doc.setTextColor(71, 85, 105);
      doc.text(`${c.label}`, 14, y);
      doc.text(`${c.score}/100`, pw - 14, y, { align: 'right' });
      doc.setFillColor(241, 245, 249); doc.roundedRect(14, y + 2, pw - 28, 3.5, 1.5, 1.5, 'F');
      const col: [number, number, number] = c.score >= 70 ? [16, 185, 129] : c.score >= 40 ? [245, 158, 11] : [239, 68, 68];
      doc.setFillColor(col[0], col[1], col[2]);
      doc.roundedRect(14, y + 2, Math.max(3, (pw - 28) * Math.min(100, c.score) / 100), 3.5, 1.5, 1.5, 'F');
      y += 13;
    }

    // Red flags
    y += 2;
    if (r.redFlags?.length) {
      doc.setFontSize(11); doc.setTextColor(185, 28, 28); doc.setFont('helvetica', 'bold');
      doc.text('Red Flags', 14, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(153, 27, 27);
      for (const f of r.redFlags) {
        const msg = (f as any).msg || (f as any).type || String(f);
        doc.text('• ' + msg, 16, y, { maxWidth: pw - 32 }); y += 6;
      }
    } else {
      doc.setFontSize(10); doc.setTextColor(21, 128, 61);
      doc.text('✓ Koi red flag nahi', 14, y); y += 6;
    }

    // Meta + disclaimer
    y += 4;
    doc.setFontSize(9); doc.setTextColor(148, 163, 184);
    doc.text(`Network firms: ${r.firmsCount}   ·   Data points: ${r.dataPoints}   ·   ${new Date().toLocaleDateString('en-IN')}`, 14, y);
    y += 8;
    doc.setFontSize(8);
    doc.text('Yeh report Anjaninex network ke internal transaction behaviour par based hai. Yeh RBI/CIBIL ka official credit', 14, y);
    doc.text('score nahi hai; sirf trade reference ke liye. — Vyapaar Setu, an Anjaninex product', 14, y + 4);
    return doc;
  }

  private waText(): string {
    const r = this.report()!;
    const subs = (r.components || []).map((c: any) => `${c.label}: ${c.score}/100`).join('\n');
    const flags = r.redFlags?.length
      ? r.redFlags.map((f: any) => '🚩 ' + (f.msg || f.type || f)).join('\n')
      : '✓ Koi red flag nahi';
    return `*CREDIL Report*\nGST: ${r.gst}\nScore: *${r.totalScore}* (${r.band})\n\n${subs}\n\n${flags}\n\n— Vyapaar Setu (Anjaninex)`;
  }

  async shareWhatsApp() {
    const r = this.report()!;
    const blob = this.buildPdf().output('blob');
    const file = new File([blob], `CREDIL_${r.gst}.pdf`, { type: 'application/pdf' });
    const nav: any = navigator;
    // Mobile: native share sheet — WhatsApp select karo, PDF attach ho ke jayegi
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file], title: 'CREDIL Report', text: `CREDIL Report — ${r.gst}` }); } catch { /* user ne cancel kiya */ }
      return;
    }
    // Desktop fallback: PDF download + WhatsApp text kholo (attach manually)
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    window.open('https://wa.me/?text=' + encodeURIComponent(this.waText() + '\n\n(PDF download ho gayi hai — chat me attach kar dein)'), '_blank');
  }

  gaugePct() { const s = this.report()!.totalScore; return Math.max(0, Math.min(100, ((s - 300) / 600) * 100)); }
  bandClass(b: string) { return 'b-' + (b || '').toLowerCase(); }
  scoreClass(s: number) { return s >= 70 ? 'sc-hi' : s >= 40 ? 'sc-mid' : 'sc-lo'; }
  statusLabel(s: string) {
    return ({ pending: 'OTP pending', otp_ok: 'Pay pending', paid: 'Admin review', delivered: 'Ready', rejected: 'Rejected' } as any)[s] || s;
  }
  pillClass(s: string) {
    if (s === 'delivered') return 'p-delivered';
    if (s === 'paid') return 'p-paid';
    if (s === 'rejected') return 'p-rejected';
    return 'p-pending';
  }
}
