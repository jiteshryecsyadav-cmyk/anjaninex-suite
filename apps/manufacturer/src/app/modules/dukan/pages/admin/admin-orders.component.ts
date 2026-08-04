import { Component, inject } from '@angular/core';
import { DukanService } from '../../dukan.service';

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  template: `
  <h2 style="font-size:18px;margin-bottom:14px">All Orders</h2>
  @if (ds.orders().length === 0) {
    <div class="empty card" style="padding:40px">Abhi koi order nahi</div>
  } @else {
    <div class="card" style="padding:6px 16px">
      <table class="tbl">
        <tr><th>Order</th><th>Bill</th><th>Receiver</th><th>Address</th><th>Items</th><th>Total</th><th>Status</th></tr>
        @for (o of ds.orders(); track o.id) {
          <tr>
            <td>{{ o.id }}</td><td>{{ o.billNo }}</td><td>{{ o.receiver }}</td>
            <td style="max-width:180px;font-size:12px;color:var(--muted)">{{ o.address }}</td>
            <td>{{ o.items.length }}</td><td><b>₹{{ o.total }}</b></td>
            <td><span class="badge off">{{ o.status }}</span></td>
          </tr>
        }
      </table>
    </div>
  }
  `,
})
export class AdminOrdersComponent { ds = inject(DukanService); }
