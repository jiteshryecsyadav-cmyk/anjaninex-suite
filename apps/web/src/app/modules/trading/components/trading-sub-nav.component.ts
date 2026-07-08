import { Component, signal, HostListener, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';

@Component({
  selector: 'app-trading-sub-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="trading-sub-nav">

      <!-- Master -->
      <div class="tn-dd" [class.tn-open]="open() === 'master'">
        <button type="button" class="tn-btn" (click)="toggle('master', $event)">📁 Master <span class="tn-caret">▼</span></button>
        <div class="tn-menu">
          <a routerLink="/trading/parties" (click)="close()">👥 Parties</a>
          <a routerLink="/trading/buyer-agents" (click)="close()">🤝 Buyer Agents</a>
          <a routerLink="/masters/branches" (click)="close()">🏢 Branches</a>
          <a routerLink="/masters/transporters" (click)="close()">🚚 Transporters</a>
          <a routerLink="/masters/credit-limits" (click)="close()">💳 Credit Limits</a>
          <div class="tn-divider"></div>
          <a routerLink="/masters/users" (click)="close()">👤 Users</a>
          <a routerLink="/masters/roles" (click)="close()">🛡️ Roles</a>
          <a routerLink="/masters/permissions" (click)="close()">🔐 Role Permissions</a>
        </div>
      </div>

      <div class="tn-dd" [class.tn-open]="open() === 'item'">
        <button type="button" class="tn-btn" (click)="toggle('item', $event)">📝 Category <span class="tn-caret">▼</span></button>
        <div class="tn-menu">
          <a routerLink="/trading/items" (click)="close()">📝 Category List</a>
          <a href="javascript:void(0)" (click)="goNewItem(); close()">➕ New Category</a>
        </div>
      </div>

      <div class="tn-dd" [class.tn-open]="open() === 'order'">
        <button type="button" class="tn-btn" (click)="toggle('order', $event)">📋 Order <span class="tn-caret">▼</span></button>
        <div class="tn-menu">
          <a routerLink="/trading/orders" (click)="close()">📋 Order List</a>
          <a routerLink="/trading/orders/new" (click)="close()">➕ New Order</a>
        </div>
      </div>

      <div class="tn-dd" [class.tn-open]="open() === 'bill'">
        <button type="button" class="tn-btn" (click)="toggle('bill', $event)">📄 Bill <span class="tn-caret">▼</span></button>
        <div class="tn-menu">
          <a routerLink="/trading/bills" (click)="close()">📄 Bill List</a>
          <a routerLink="/trading/bills/new" (click)="close()">➕ New Bill</a>
        </div>
      </div>

      <div class="tn-dd" [class.tn-open]="open() === 'gr'">
        <button type="button" class="tn-btn" (click)="toggle('gr', $event)">📦 GR <span class="tn-caret">▼</span></button>
        <div class="tn-menu">
          <a routerLink="/trading/gr" (click)="close()">📦 GR List</a>
          <a routerLink="/trading/gr/new" (click)="close()">➕ New GR</a>
        </div>
      </div>

      <div class="tn-dd" [class.tn-open]="open() === 'pay'">
        <button type="button" class="tn-btn" (click)="toggle('pay', $event)">💰 Payment <span class="tn-caret">▼</span></button>
        <div class="tn-menu">
          <a routerLink="/trading/payments" (click)="close()">💰 Payments List</a>
          <a routerLink="/trading/payments/new" (click)="close()">🪙 New Receipt</a>
        </div>
      </div>

      <div class="tn-dd" [class.tn-open]="open() === 'comm'">
        <button type="button" class="tn-btn" (click)="toggle('comm', $event)">🪙 Commission <span class="tn-caret">▼</span></button>
        <div class="tn-menu">
          <a routerLink="/trading/commission" (click)="close()">📊 Commission List</a>
          <a routerLink="/trading/commission/new" (click)="close()">➕ New Commission</a>
        </div>
      </div>

      <div class="tn-dd">
        <a routerLink="/trading/cheque-register" (click)="close()" class="tn-btn" style="text-decoration:none">🧾 Cheque Register</a>
      </div>

      <div class="tn-dd" [class.tn-open]="open() === 'rep'">
        <button type="button" class="tn-btn" (click)="toggle('rep', $event)">📊 Reports <span class="tn-caret">▼</span></button>
        <div class="tn-menu">
          <a routerLink="/reports/supplier-buyer" (click)="close()">Supplier vs Buyer</a>
          <a routerLink="/reports/cheque-handover" (click)="close()">Cheque Handover</a>
          <a routerLink="/trading/buyer-agents" (click)="close()">Buyer Agent Commission</a>
          <a routerLink="/reports/outstanding" (click)="close()">Outstanding</a>
          <a routerLink="/reports/sales-register" (click)="close()">Sales Register</a>
          <a routerLink="/reports/order-vs-bill" (click)="close()">Order vs Bill</a>
          <a routerLink="/reports/dashboard" (click)="close()">All Reports</a>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .trading-sub-nav {
      display: flex !important; gap: 4px; flex-wrap: wrap;
      padding: 4px; background: #fff;
      border: 1px solid #D6DDEA; border-radius: 10px;
      margin-bottom: 16px;
      align-items: center;
    }
    .trading-sub-nav .tn-link {
      padding: 9px 14px; font-size: 13px; font-weight: 700; color: #4A5878;
      text-decoration: none; border-radius: 6px; display: inline-block;
      transition: all 0.15s;
    }
    .trading-sub-nav .tn-link:hover { background: #FAF7F0; color: #1B2E5C; }
    .trading-sub-nav .tn-active { background: var(--anjaninex-navy, #1B2E5C) !important; color: #fff !important; }
    .trading-sub-nav .tn-dd {
      position: relative !important; display: inline-block !important;
    }
    .trading-sub-nav .tn-btn {
      padding: 9px 14px; font-size: 13px; font-weight: 700; color: #4A5878;
      background: transparent; border: 0; border-radius: 6px;
      cursor: pointer; font-family: inherit; transition: all 0.15s;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .trading-sub-nav .tn-btn:hover { background: #FAF7F0; color: #1B2E5C; }
    .trading-sub-nav .tn-caret { font-size: 9px; opacity: 0.7; transition: transform 0.2s; }
    .trading-sub-nav .tn-open .tn-btn { background: var(--anjaninex-navy, #1B2E5C) !important; color: #fff !important; }
    .trading-sub-nav .tn-open .tn-caret { transform: rotate(180deg); }
    .trading-sub-nav .tn-menu {
      position: absolute !important; top: calc(100% + 4px) !important; left: 0 !important;
      z-index: 100 !important;
      background: #fff !important; border: 1px solid #D6DDEA !important;
      border-radius: 8px !important;
      box-shadow: 0 8px 24px rgba(27,46,92,0.18) !important;
      min-width: 200px; padding: 6px;
      display: none !important;
    }
    .trading-sub-nav .tn-open .tn-menu {
      display: block !important;
    }
    .trading-sub-nav .tn-menu a {
      display: block !important; padding: 9px 12px; font-size: 13px; font-weight: 600;
      color: #1B2E5C !important; text-decoration: none; border-radius: 6px;
      transition: background 0.1s;
    }
    .trading-sub-nav .tn-menu a:hover {
      background: #FAF7F0 !important; color: #DC2626 !important;
    }
    .trading-sub-nav .tn-menu .tn-divider {
      height: 1px; background: #D6DDEA; margin: 6px 4px;
    }

    @media (max-width: 640px) {
      .trading-sub-nav { flex-wrap: wrap; }
      .trading-sub-nav .tn-btn { padding: 8px 10px; font-size: 12px; }
      .trading-sub-nav .tn-menu { min-width: 160px; max-width: calc(100vw - 24px); }
    }
  `]
})
export class TradingSubNavComponent {
  private router = inject(Router);
  open = signal<string | null>(null);

  // Har click pe unique 'new' param → items page hamesha modal khole (same-URL pe bhi)
  goNewItem() {
    this.router.navigate(['/trading/items'], { queryParams: { new: Date.now() } });
  }

  toggle(menu: string, event: MouseEvent) {
    event.stopPropagation();
    this.open.set(this.open() === menu ? null : menu);
  }

  close() {
    this.open.set(null);
  }

  @HostListener('document:click')
  onDocClick() {
    this.open.set(null);
  }
}
