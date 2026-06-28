import { Component, inject, signal, computed } from '@angular/core';
import { DukanService } from '../../dukan.service';
import { Order } from '../../models';

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  template: `
  @if (sel(); as o) {
    <button class="btn ghost sm no-print" style="margin-bottom:12px" (click)="sel.set(null)">← Back to Billing</button>
    <div class="card printable" style="padding:26px;max-width:640px">
      <div class="row" style="justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--line);padding-bottom:14px">
        <div>
          <div style="font-family:Georgia,serif;font-size:24px;font-weight:800">Online Dukan</div>
          <div style="font-size:12px;color:var(--muted)">{{ ds.seller().city }} · GST {{ ds.seller().gst }}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;font-size:16px">TAX INVOICE</div>
          <div style="font-size:12.5px">{{ o.billNo }}</div>
          <div style="font-size:12px;color:var(--muted)">{{ o.date }}</div>
        </div>
      </div>
      <div style="margin:14px 0;font-size:13px">
        <div style="font-weight:700">Bill to:</div>
        <div>{{ o.receiver }}</div>
        <div style="color:var(--muted)">{{ o.address }}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">Order: {{ o.id }}</div>
      </div>
      <table class="tbl">
        <tr><th>Item</th><th>Qty</th><th>Rate</th><th style="text-align:right">Amount</th></tr>
        @for (it of o.items; track it.name) {
          <tr><td>{{ it.name }}</td><td>{{ it.qty }}</td><td>₹{{ it.rate }}</td><td style="text-align:right">₹{{ it.qty*it.rate }}</td></tr>
        }
      </table>
      <div style="margin-left:auto;max-width:260px;margin-top:14px;font-size:13.5px">
        <div class="row" style="justify-content:space-between;margin:4px 0"><span>Subtotal</span><b>₹{{ o.subtotal }}</b></div>
        <div class="row" style="justify-content:space-between;margin:4px 0"><span>Delivery</span><b>₹{{ o.delivery }}</b></div>
        <div class="row" style="justify-content:space-between;margin:4px 0"><span>GST ({{ ds.GST_PCT }}%)</span><b>₹{{ o.gst }}</b></div>
        <hr style="border:none;border-top:1px solid var(--line);margin:8px 0">
        <div class="row" style="justify-content:space-between;font-size:17px"><span>Grand Total</span><b style="color:var(--deep)">₹{{ o.total }}</b></div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:14px">Amount in words: <b style="color:var(--ink)">{{ ds.amountInWords(o.total) }}</b></div>
      <div class="row" style="justify-content:space-between;align-items:flex-end;margin-top:18px">
        <span class="badge off" style="font-size:13px;padding:5px 14px">PAID</span>
        <div style="text-align:right;font-size:12px;color:var(--muted)">For Online Dukan<br><br>Authorised Signatory</div>
      </div>
    </div>
    <div class="row no-print" style="gap:10px;margin-top:14px">
      <button class="btn" (click)="print()">🖨 Print / Save PDF</button>
      <a class="btn" [href]="waLink(o)" target="_blank" style="text-decoration:none;background:#25D366;color:#fff">📲 Share on WhatsApp</a>
    </div>
  } @else {
    <div class="grid stats" style="margin-bottom:6px">
      <div class="stat" style="background:#3A4252"><h4>Total Bills</h4><div class="v">{{ ds.orders().length }}</div></div>
      <div class="stat" style="background:#F2C200;color:#2A2300"><h4 style="opacity:.8">Total Billed</h4><div class="v">₹{{ totalBilled() }}</div></div>
    </div>
    @if (ds.orders().length === 0) {
      <div class="empty card" style="padding:50px">Abhi koi invoice nahi 🧾</div>
    } @else {
      <div class="sec-head">All Invoices</div>
      <div class="card" style="padding:6px 16px">
        <table class="tbl">
          <tr><th>Bill No</th><th>Order</th><th>Buyer</th><th>Date</th><th>Amount</th><th></th></tr>
          @for (o of ds.orders(); track o.id) {
            <tr>
              <td><b>{{ o.billNo }}</b></td><td>{{ o.id }}</td><td>{{ o.receiver }}</td>
              <td style="font-size:12px;color:var(--muted)">{{ o.date }}</td><td>₹{{ o.total }}</td>
              <td><button class="btn ghost sm" (click)="sel.set(o)">View</button></td>
            </tr>
          }
        </table>
      </div>
    }
  }
  `,
})
export class AdminBillingComponent {
  ds = inject(DukanService);
  sel = signal<Order | null>(null);
  totalBilled = computed(() => this.ds.orders().reduce((s, o) => s + o.total, 0));
  print() { window.print(); }

  waLink(o: Order): string {
    const s = this.ds.seller();
    const items = o.items.map(it => `• ${it.name} x${it.qty} = ₹${it.qty * it.rate}`).join('\n');
    const text =
`*Online Dukan — Tax Invoice*
Bill No: ${o.billNo}
Order: ${o.id}
Date: ${o.date}

${items}

Subtotal: ₹${o.subtotal}
Delivery: ₹${o.delivery}
GST (${this.ds.GST_PCT}%): ₹${o.gst}
*Grand Total: ₹${o.total}*
Status: PAID ✅

Bill to: ${o.receiver}
${o.address}

Pay via UPI: ${s.upi}
Thank you for your order!`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }
}
