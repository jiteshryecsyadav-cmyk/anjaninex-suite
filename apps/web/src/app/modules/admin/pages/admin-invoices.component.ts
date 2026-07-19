import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface InvoiceRow {
  id: string; invoiceNo: string; date: string | null; firmName: string | null;
  amount: number; taxable: number; gstAmount: number; gstRate: number;
}

import { BackButtonComponent } from '../../../shared/back-button.component';
@Component({
  selector: 'app-admin-invoices',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
    <div class="max-w-6xl mx-auto p-4">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🧾 Invoices</h2>
          <p class="text-sm text-[#6b3fa0]">Har approved payment ka bill/receipt — GST filing ke liye bhi</p>
        </div>
        <div class="flex gap-2 items-center">
          <input [(ngModel)]="search" placeholder="🔍 Firm ya invoice no..." class="input w-56">
          <button (click)="load()" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">🔄 Refresh</button>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="card text-center">
          <div class="text-2xl font-black text-[#5c1a8b]">{{ filtered().length }}</div>
          <div class="text-xs uppercase font-bold text-gray-500">Invoices</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-black text-green-700">₹{{ total() | number:'1.0-0' }}</div>
          <div class="text-xs uppercase font-bold text-gray-500">Total Amount</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-black text-orange-600">₹{{ totalGst() | number:'1.0-0' }}</div>
          <div class="text-xs uppercase font-bold text-gray-500">GST Collected</div>
        </div>
      </div>

      <div class="card p-0 overflow-x-auto">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading…</div> }
        @else if (filtered().length === 0) { <div class="p-8 text-center text-gray-400">Koi invoice nahi — pehla payment approve hote hi yahan aayega.</div> }
        @else {
          <table class="w-full text-sm">
            <thead class="bg-anjaninex-navy text-white uppercase text-xs">
              <tr>
                <th class="px-3 py-3 text-left">S.No</th>
                <th class="px-3 py-3 text-left">Invoice No</th>
                <th class="px-3 py-3 text-left">Date</th>
                <th class="px-3 py-3 text-left">Firm</th>
                <th class="px-3 py-3 text-right">Taxable</th>
                <th class="px-3 py-3 text-right">GST</th>
                <th class="px-3 py-3 text-right">Total</th>
                <th class="px-3 py-3 text-center">Download</th>
              </tr>
            </thead>
            <tbody>
              @for (inv of filtered(); track inv.id) {
                <tr class="border-t border-gray-100 hover:bg-[#faf7ff]">
                  <td class="px-3 py-2">{{ $index + 1 }}</td>
                  <td class="px-3 py-2 font-mono text-xs font-bold text-[#5c1a8b]">{{ inv.invoiceNo }}</td>
                  <td class="px-3 py-2 font-mono text-xs">{{ inv.date }}</td>
                  <td class="px-3 py-2 font-semibold">{{ inv.firmName }}</td>
                  <td class="px-3 py-2 text-right font-mono">₹{{ inv.taxable | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono">
                    @if (inv.gstRate > 0) { ₹{{ inv.gstAmount | number:'1.2-2' }} <span class="text-[10px] text-gray-400">({{ inv.gstRate }}%)</span> }
                    @else { <span class="text-[10px] text-gray-400">exempt</span> }
                  </td>
                  <td class="px-3 py-2 text-right font-mono font-bold">₹{{ inv.amount | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-center whitespace-nowrap">
                    <button (click)="openDoc(inv.id, 'bill')" class="doc">📄 Bill</button>
                    <button (click)="openDoc(inv.id, 'receipt')" class="doc">🧾 Receipt</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    .card { background:#fff; border:1.5px solid #ddc8f5; border-radius:12px; padding:14px; }
    .input { padding:8px 10px; border:1.5px solid #ddc8f5; border-radius:8px; font-size:13px; outline:none; background:#faf5ff; }
    .doc { font-size:11px; font-weight:700; border:1px solid #c9b3ec; background:#faf5ff; color:#5c1a8b; border-radius:6px; padding:3px 8px; cursor:pointer; margin:0 2px; }
    .doc:hover { background:#f0e6ff; }

    /* ===== MOBILE (<=640px) ===== */
    @media (max-width: 640px) {
      .card { padding: 10px; }
      .input { width: 100% !important; flex: 1; }
      table { white-space: nowrap; }
    }
  `]
})
export class AdminInvoicesComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/admin/books`;

  rows = signal<InvoiceRow[]>([]);
  loading = signal(true);
  search = '';

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.http.get<InvoiceRow[]>(`${this.base}/invoices`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  filtered() {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter(r =>
      (r.firmName || '').toLowerCase().includes(q) || r.invoiceNo.toLowerCase().includes(q));
  }

  total() { return this.filtered().reduce((s, r) => s + (+r.amount || 0), 0); }
  totalGst() { return this.filtered().reduce((s, r) => s + (+r.gstAmount || 0), 0); }

  openDoc(id: string, kind: 'bill' | 'receipt') {
    this.http.get<any>(`${this.base}/invoice/${id}`).subscribe({
      next: (inv) => this.printDoc(inv, kind),
      error: (e) => alert(e?.error?.error ?? 'Invoice nahi mila')
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
}
