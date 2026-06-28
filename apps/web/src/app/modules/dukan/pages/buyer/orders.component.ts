import { Component, inject } from '@angular/core';
import { DukanService } from '../../dukan.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  template: `
  @if (ds.orders().length === 0) {
    <div class="empty card" style="padding:50px">Abhi koi order nahi 📦</div>
  } @else {
    @for (o of ds.orders(); track o.id) {
      <div class="card" style="padding:16px;margin-bottom:14px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
          <div><b>{{ o.id }}</b> · <span style="color:var(--muted);font-size:12.5px">{{ o.date }}</span></div>
          <span class="badge off">{{ o.status }} · {{ o.billNo }}</span>
        </div>
        <div style="font-size:13px;color:var(--muted);margin:8px 0">Ship to: {{ o.receiver }} — {{ o.address }}</div>
        <table class="tbl">
          <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
          @for (it of o.items; track it.name) {
            <tr><td>{{ it.name }}</td><td>{{ it.qty }}</td><td>₹{{ it.rate }}</td><td>₹{{ it.qty*it.rate }}</td></tr>
          }
        </table>
        <div class="row" style="justify-content:flex-end;gap:20px;margin-top:10px;font-size:13px">
          <span>Subtotal: <b>₹{{ o.subtotal }}</b></span>
          <span>GST: <b>₹{{ o.gst }}</b></span>
          <span>Delivery: <b>₹{{ o.delivery }}</b></span>
          <span style="font-size:16px">Total: <b style="color:var(--deep)">₹{{ o.total }}</b></span>
        </div>
      </div>
    }
  }
  `,
})
export class OrdersComponent { ds = inject(DukanService); }
