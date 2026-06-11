import { Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface PayInfo {
  payeeName: string | null; upiId: string | null; bankName: string | null;
  accountName: string | null; accountNo: string | null; ifsc: string | null;
  qrImageUrl: string | null; instructions: string | null;
}
interface MyReq {
  id: string; amount: number; method: string | null; reference: string | null;
  note: string | null; status: string; createdAt: string | null; reviewNote: string | null;
}

@Component({
  selector: 'app-pay-recharge',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <!-- BYOK: AI scan recharge — firm apne provider ke console par khud recharge kare -->
    @if (ai(); as a) {
      <div class="card">
        <div class="ch"><h3>🤖 AI Bill-Scan Recharge ({{ a.providerName }})</h3></div>
        <div class="bd">
          @if (a.keySet) {
            <p class="muted" style="margin:0 0 10px">
              Aapki firm ke bill-scan ke liye <b>{{ a.providerName }}</b> ki API key lagi hui hai.
              Scan ka kharcha aapke {{ a.providerName }} account se jata hai —
              balance/recharge wahi par manage hota hai:
            </p>
            <a [href]="a.consoleUrl" target="_blank" rel="noopener" class="btn" style="display:block;text-align:center;text-decoration:none">
              ↗ {{ a.providerName }} Console kholo (Recharge / Balance)
            </a>
          } @else {
            <p class="muted" style="margin:0">
              Bill-scan AI key abhi set nahi hai — Anjaninex admin se sampark karein.
            </p>
          }
        </div>
      </div>
    }

    <div class="card">
      <div class="ch"><h3>📲 Pay to Recharge (UPI / Bank)</h3></div>
      <div class="bd">
        @if (!info()) {
          <div class="muted">Loading payment details…</div>
        } @else if (!info()!.upiId && !info()!.accountNo) {
          <div class="muted">Admin ne abhi payment details set nahi kiye. Support se sampark karein.</div>
        } @else {
          @if (info()!.upiId) {
            <div class="qrbox">
              <img [src]="qrSrc()" width="160" height="160" alt="UPI QR" class="qr">
              <div class="upi">{{ info()!.payeeName }}<br><b>{{ info()!.upiId }}</b></div>
            </div>
          }
          @if (info()!.qrImageUrl) {
            <img [src]="info()!.qrImageUrl" alt="QR" class="qr2">
          }
          @if (info()!.accountNo) {
            <div class="bank">
              <div><span>Bank</span><b>{{ info()!.bankName }}</b></div>
              <div><span>A/C Name</span><b>{{ info()!.accountName }}</b></div>
              <div><span>A/C No</span><b>{{ info()!.accountNo }}</b></div>
              <div><span>IFSC</span><b>{{ info()!.ifsc }}</b></div>
            </div>
          }
          @if (info()!.instructions) { <div class="instr">📝 {{ info()!.instructions }}</div> }

          <div class="form">
            <div class="fhead">Payment ke baad yahan bharein:</div>
            <input type="number" [(ngModel)]="amount" placeholder="Amount (₹)" class="ip">
            <input type="text" [(ngModel)]="reference" placeholder="UTR / Txn reference" class="ip">
            <input type="text" [(ngModel)]="note" placeholder="Note (optional)" class="ip">
            <button class="btn" (click)="submit()" [disabled]="saving()">{{ saving() ? 'Bhej rahe…' : '✅ Submit payment claim' }}</button>
            @if (msg()) { <div class="ok">{{ msg() }}</div> }
            @if (err()) { <div class="bad">{{ err() }}</div> }
          </div>
        }

        @if (mine().length) {
          <div class="reqs">
            <div class="fhead">Aapke requests</div>
            @for (r of mine(); track r.id) {
              <div class="req">
                <div>
                  <b>₹{{ r.amount }}</b> <span class="muted">{{ r.reference || '' }}</span>
                  <div class="muted xs">{{ r.createdAt | date:'dd MMM, HH:mm' }}</div>
                  @if (r.reviewNote) { <div class="bad xs">{{ r.reviewNote }}</div> }
                </div>
                <span class="tag" [class.p]="r.status==='pending'" [class.a]="r.status==='approved'" [class.r]="r.status==='rejected'">{{ r.status }}</span>
                @if (r.status === 'approved') {
                  <span class="docbtns">
                    <button class="doc" (click)="openDoc(r.id, 'bill')" title="Tax Invoice / Bill download">📄 Bill</button>
                    <button class="doc" (click)="openDoc(r.id, 'receipt')" title="Payment Receipt download">🧾 Receipt</button>
                  </span>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .card{background:#fff;border-radius:12px;border:1px solid var(--border,#eee);overflow:hidden;margin-bottom:14px}
    .ch{padding:12px 16px;border-bottom:1px solid var(--border,#eee)} .ch h3{margin:0;font-size:12px;font-weight:800;color:var(--ax-navy,#1B2E5C);text-transform:uppercase;letter-spacing:.5px}
    .bd{padding:14px}
    .muted{color:#888;font-size:12px} .xs{font-size:10px}
    .qrbox{text-align:center;margin-bottom:10px}
    .qr{border:1px solid #eee;border-radius:10px} .qr2{display:block;max-width:160px;margin:0 auto 10px;border:1px solid #eee;border-radius:10px}
    .upi{font-size:12px;margin-top:6px;color:#333}
    .bank{font-size:12px;background:#f7f5fb;border-radius:8px;padding:10px;margin-bottom:10px}
    .bank div{display:flex;justify-content:space-between;padding:2px 0} .bank span{color:#888}
    .instr{font-size:11px;background:#fff7e6;border:1px solid #ffe2a8;border-radius:8px;padding:8px;margin-bottom:10px}
    .form{border-top:1px dashed #ddd;padding-top:10px} .fhead{font-size:11px;font-weight:700;color:#6b3fa0;margin-bottom:6px}
    .ip{width:100%;padding:8px 10px;border:1.5px solid #e3d8f5;border-radius:8px;margin-bottom:8px;font-size:13px;box-sizing:border-box}
    .btn{width:100%;background:#5c1a8b;color:#fff;border:0;border-radius:8px;padding:10px;font-weight:700;cursor:pointer}
    .btn:disabled{opacity:.6}
    .ok{color:#16A34A;font-size:12px;margin-top:6px} .bad{color:#B91C1C;font-size:12px;margin-top:6px}
    .reqs{border-top:1px dashed #ddd;margin-top:12px;padding-top:10px}
    .req{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0}
    .tag{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;text-transform:uppercase}
    .tag.p{background:#FEF3C7;color:#B45309} .tag.a{background:#DCFCE7;color:#16A34A} .tag.r{background:#FEE2E2;color:#B91C1C}
    .docbtns{display:inline-flex;gap:4px;margin-left:6px}
    .doc{font-size:10px;font-weight:700;border:1px solid #c9b3ec;background:#faf5ff;color:#5c1a8b;border-radius:6px;padding:2px 7px;cursor:pointer}
    .doc:hover{background:#f0e6ff}

    @media(max-width:640px){
      .req{flex-wrap:wrap;gap:6px}
      .docbtns{margin-left:0;flex-wrap:wrap}
      .bank div{flex-wrap:wrap}
      .ip{width:100% !important}
    }
  `]
})
export class PayRechargeComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/billing`;

  info = signal<PayInfo | null>(null);
  ai = signal<{ provider: string; providerName: string; keySet: boolean; consoleUrl: string; mapsKeySet: boolean } | null>(null);
  mine = signal<MyReq[]>([]);
  amount: number | null = null;
  reference = '';
  note = '';
  saving = signal(false);
  msg = signal('');
  err = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.http.get<PayInfo>(`${this.base}/pay-info`).subscribe({ next: i => this.info.set(i), error: () => {} });
    this.http.get<any>(`${this.base}/ai-info`).subscribe({ next: a => this.ai.set(a), error: () => {} });
    this.http.get<MyReq[]>(`${this.base}/my-claims`).subscribe({ next: m => this.mine.set(m), error: () => {} });
  }

  // Bill (Tax Invoice) ya Receipt — print window se download/PDF
  openDoc(id: string, kind: 'bill' | 'receipt') {
    this.http.get<any>(`${this.base}/invoice/${id}`).subscribe({
      next: (inv) => this.printDoc(inv, kind),
      error: (e) => alert(e?.error?.error ?? 'Document nahi mila')
    });
  }

  private printDoc(inv: any, kind: 'bill' | 'receipt') {
    const isBill = kind === 'bill';
    const title = isBill ? (inv.gstRate > 0 ? 'TAX INVOICE' : 'INVOICE') : 'PAYMENT RECEIPT';
    const gstRow = inv.gstRate > 0
      ? `<tr><td>GST @ ${inv.gstRate}%</td><td style="text-align:right">₹${(+inv.gstAmount).toFixed(2)}</td></tr>`
      : `<tr><td colspan="2" style="color:#888;font-size:11px">GST not applicable — turnover below ₹20 lakh threshold (Sec 22, CGST Act)</td></tr>`;
    const html = `
      <html><head><title>${title} ${inv.invoiceNo}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#222;padding:30px;max-width:640px;margin:auto}
        h1{color:#5c1a8b;font-size:20px;margin:0} .muted{color:#777;font-size:12px}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #5c1a8b;padding-bottom:12px;margin-bottom:16px}
        .box{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
        td{padding:7px 10px;border-bottom:1px solid #eee}
        .total td{font-weight:800;font-size:15px;border-top:2px solid #5c1a8b;border-bottom:none}
        .stamp{margin-top:26px;text-align:right;font-size:12px;color:#555}
        .paid{display:inline-block;border:2px solid #16A34A;color:#16A34A;font-weight:800;padding:4px 14px;border-radius:8px;transform:rotate(-6deg)}
      </style></head><body>
        <div class="head">
          <div>
            <h1>${inv.payeeName}</h1>
            ${inv.payeeGstin ? `<div class="muted">GSTIN: ${inv.payeeGstin}</div>` : ''}
            <div class="muted">Business Suite — Subscription Services</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800;font-size:16px">${title}</div>
            <div class="muted">No: <b>${inv.invoiceNo}</b></div>
            <div class="muted">Date: ${inv.date}</div>
          </div>
        </div>
        <div class="box">
          <b>${isBill ? 'Billed To' : 'Received From'}:</b> ${inv.firmName}<br>
          ${inv.firmGst ? `GSTIN: ${inv.firmGst}<br>` : ''}
          ${[inv.firmCity, inv.firmState].filter(Boolean).join(', ')}
        </div>
        <table>
          <tr><td><b>Description</b></td><td style="text-align:right"><b>Amount</b></td></tr>
          <tr><td>Business Suite — Subscription / Wallet Recharge${inv.reference ? ` (Ref: ${inv.reference})` : ''}</td>
              <td style="text-align:right">₹${(+inv.taxable).toFixed(2)}</td></tr>
          ${gstRow}
          <tr class="total"><td>TOTAL ${isBill ? '' : 'RECEIVED'}</td><td style="text-align:right">₹${(+inv.amount).toFixed(2)}</td></tr>
        </table>
        ${!isBill ? `<div style="margin-top:18px"><span class="paid">✓ PAID</span>
          <span class="muted" style="margin-left:10px">Mode: ${inv.method || 'UPI'}${inv.reference ? ' · Ref: ' + inv.reference : ''}</span></div>` : ''}
        <div class="stamp">For <b>${inv.payeeName}</b><br><br><br>Authorised Signatory</div>
        <div class="muted" style="margin-top:24px;text-align:center">Computer generated ${isBill ? 'invoice' : 'receipt'} — signature ki zaroorat nahi.</div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Popup block ho gaya — allow karein.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  qrSrc() {
    const i = this.info();
    const data = `upi://pay?pa=${i?.upiId}&pn=${encodeURIComponent(i?.payeeName || '')}&cu=INR`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(data)}`;
  }

  submit() {
    this.msg.set(''); this.err.set('');
    if (!this.amount || this.amount <= 0) { this.err.set('Amount daalein.'); return; }
    this.saving.set(true);
    this.http.post(`${this.base}/claim`, {
      amount: this.amount, method: 'upi', reference: this.reference || null, note: this.note || null
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.msg.set('✅ Request bhej di! Admin approve karega to wallet recharge ho jayega.');
        this.amount = null; this.reference = ''; this.note = '';
        this.load();
      },
      error: (e) => { this.saving.set(false); this.err.set(e?.error?.error ?? 'Submit nahi hua'); }
    });
  }
}
