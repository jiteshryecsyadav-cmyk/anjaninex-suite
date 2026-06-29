import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DukanService } from '../../dukan.service';

@Component({
  selector: 'app-buyer-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
  <div class="grid stats">
    <a [routerLink]="['/dukan/shop', ds.shopFirmId(), 'cart']" class="stat"><h4>Items in Cart</h4><div class="v">{{ ds.cartCount() }}</div></a>
    <a [routerLink]="['/dukan/shop', ds.shopFirmId(), 'orders']" class="stat"><h4>My Orders</h4><div class="v">{{ ds.orders().length }}</div></a>
    <div class="stat"><h4>Total Spent</h4><div class="v">₹{{ ds.totalSpent() }}</div></div>
    <a [routerLink]="['/dukan/shop', ds.shopFirmId(), 'bills']" class="stat"><h4>Bills</h4><div class="v">{{ ds.orders().length }}</div></a>
  </div>

  <div class="sec-head">Recent Activity</div>
  @if (ds.orders().length === 0) {
    <div class="empty card" style="padding:40px">Abhi koi order nahi. <a [routerLink]="['/dukan/shop', ds.shopFirmId(), 'catalog']" style="color:var(--brand);font-weight:700">Catalog dekho →</a></div>
  } @else {
    <div class="card" style="padding:6px 16px">
      <table class="tbl">
        <tr><th>Order</th><th>Bill</th><th>Date</th><th>Total</th><th>Status</th></tr>
        @for (o of ds.orders().slice(0,6); track o.id) {
          <tr><td>{{ o.id }}</td><td>{{ o.billNo }}</td><td style="font-size:12px;color:var(--muted)">{{ o.date }}</td><td>₹{{ o.total }}</td><td><span class="badge off">{{ o.status }}</span></td></tr>
        }
      </table>
    </div>
  }
  `,
})
export class BuyerDashboardComponent { ds = inject(DukanService); }
