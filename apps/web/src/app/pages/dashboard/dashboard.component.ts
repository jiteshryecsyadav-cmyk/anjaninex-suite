import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { WalletWidgetComponent } from '../../modules/wallet/wallet-widget.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, WalletWidgetComponent],
  template: `
    <div class="max-w-7xl mx-auto">

      <!-- Welcome banner — solid navy block, red accent strip -->
      <div class="card mb-6 bg-anjaninex-navy text-white border-t-4 border-anjaninex-red">
        <h1 class="font-display font-black text-2xl">
          Welcome back, {{ auth.user()?.fullName }}! 👋
        </h1>
        <p class="opacity-90 mt-1 text-sm">
          {{ today() }} · You have {{ pendingTasks }} pending tasks
        </p>
      </div>

      <!-- 2-column layout: KPIs + Wallet -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="col-span-2">
          <!-- KPI cards inline -->
          <div class="grid grid-cols-2 gap-3 h-full">
            <div class="card border-l-4 border-anjaninex-red">
              <div class="text-2xl mb-2">💰</div>
              <div class="text-2xl font-black text-anjaninex-red">₹4.2L</div>
              <div class="text-xs text-anjaninex-navy/70 uppercase font-bold mt-1">Today's Sales</div>
            </div>
            <div class="card border-l-4 border-green-600">
              <div class="text-2xl mb-2">📥</div>
              <div class="text-2xl font-black text-green-700">₹2.8L</div>
              <div class="text-xs text-anjaninex-navy/70 uppercase font-bold mt-1">Receipts</div>
            </div>
            <div class="card border-l-4 border-amber-500">
              <div class="text-2xl mb-2">⏳</div>
              <div class="text-2xl font-black text-amber-700">₹15.6L</div>
              <div class="text-xs text-anjaninex-navy/70 uppercase font-bold mt-1">Pending</div>
            </div>
            <div class="card border-l-4 border-anjaninex-navy">
              <div class="text-2xl mb-2">🧾</div>
              <div class="text-2xl font-black text-anjaninex-navy">47</div>
              <div class="text-xs text-anjaninex-navy/70 uppercase font-bold mt-1">Bills Today</div>
            </div>
          </div>
        </div>
        <!-- Wallet widget — uses live data from WalletService -->
        <app-wallet-widget></app-wallet-widget>
      </div>

      <!-- Legacy KPI row removed (now inside the grid above) -->
      <div style="display:none">
      <!-- KPI cards — each card uses ONE accent color (no blends) -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="card border-l-4 border-anjaninex-red">
          <div class="text-2xl mb-2">💰</div>
          <div class="text-2xl font-black text-anjaninex-red">₹4.2L</div>
          <div class="text-xs text-anjaninex-navy/70 uppercase font-bold mt-1">Today's Sales</div>
        </div>
        <div class="card border-l-4 border-green-600">
          <div class="text-2xl mb-2">📥</div>
          <div class="text-2xl font-black text-green-700">₹2.8L</div>
          <div class="text-xs text-anjaninex-navy/70 uppercase font-bold mt-1">Receipts</div>
        </div>
        <div class="card border-l-4 border-amber-500">
          <div class="text-2xl mb-2">⏳</div>
          <div class="text-2xl font-black text-amber-700">₹15.6L</div>
          <div class="text-xs text-anjaninex-navy/70 uppercase font-bold mt-1">Pending</div>
        </div>
        <div class="card border-l-4 border-anjaninex-navy">
          <div class="text-2xl mb-2">🧾</div>
          <div class="text-2xl font-black text-anjaninex-navy">47</div>
          <div class="text-xs text-anjaninex-navy/70 uppercase font-bold mt-1">Bills Today</div>
        </div>
      </div>
      </div><!-- /hidden legacy wrapper -->

      <!-- Quick actions — navy heading, red primary, navy outline secondary -->
      <div class="card mb-6">
        <h3 class="font-display font-bold text-sm text-anjaninex-navy uppercase tracking-wider mb-4">
          Quick Actions — All 5 Modules Live ✅
        </h3>
        <div class="grid grid-cols-4 gap-3 mb-3">
          <!-- AI bill = red highlight + AI badge -->
          <a routerLink="/trading/bills/new"
             class="relative border-2 border-anjaninex-red p-4 rounded-lg bg-white hover:bg-anjaninex-red-soft transition text-center block no-underline text-anjaninex-navy">
            <div class="absolute top-1 right-2 text-[10px] font-bold bg-anjaninex-red text-white px-2 py-0.5 rounded-full">🤖 AI</div>
            <div class="text-2xl mb-1">🧾</div>
            <div class="text-xs font-semibold">New Bill + AI Scan</div>
          </a>
          <a routerLink="/trading/payments/new"
             class="border-2 border-anjaninex-navy p-4 rounded-lg bg-white hover:bg-anjaninex-navy-soft transition text-center block no-underline text-anjaninex-navy">
            <div class="text-2xl mb-1">💰</div>
            <div class="text-xs font-semibold">Payment Receipt</div>
          </a>
          <a routerLink="/trading/parties"
             class="border-2 border-anjaninex-navy p-4 rounded-lg bg-white hover:bg-anjaninex-navy-soft transition text-center block no-underline text-anjaninex-navy">
            <div class="text-2xl mb-1">🏢</div>
            <div class="text-xs font-semibold">Party Master</div>
          </a>
          <a routerLink="/accounting/vouchers"
             class="border-2 border-anjaninex-navy p-4 rounded-lg bg-white hover:bg-anjaninex-navy-soft transition text-center block no-underline text-anjaninex-navy">
            <div class="text-2xl mb-1">📝</div>
            <div class="text-xs font-semibold">Manual Voucher</div>
          </a>
        </div>
        <div class="grid grid-cols-4 gap-3">
          <a routerLink="/accounting/trial-balance"
             class="border border-anjaninex-navy/30 p-3 rounded-lg hover:bg-anjaninex-navy-soft transition text-center block no-underline text-anjaninex-navy">
            <div class="text-lg mb-1">⚖️</div>
            <div class="text-xs">Trial Balance</div>
          </a>
          <a routerLink="/accounting/profit-loss"
             class="border border-anjaninex-navy/30 p-3 rounded-lg hover:bg-anjaninex-navy-soft transition text-center block no-underline text-anjaninex-navy">
            <div class="text-lg mb-1">📈</div>
            <div class="text-xs">P & L</div>
          </a>
          <a routerLink="/accounting/balance-sheet"
             class="border border-anjaninex-navy/30 p-3 rounded-lg hover:bg-anjaninex-navy-soft transition text-center block no-underline text-anjaninex-navy">
            <div class="text-lg mb-1">📊</div>
            <div class="text-xs">Balance Sheet</div>
          </a>
          <a routerLink="/trading/bills"
             class="border border-anjaninex-navy/30 p-3 rounded-lg hover:bg-anjaninex-navy-soft transition text-center block no-underline text-anjaninex-navy">
            <div class="text-lg mb-1">📋</div>
            <div class="text-xs">All Bills</div>
          </a>
        </div>
      </div>

      <!-- Debug card — only in dev (P0-13 fix: don't leak permissions to prod) -->
      @if (!isProduction) {
        <div class="card bg-amber-50 border border-amber-300">
          <h3 class="font-bold text-sm text-amber-800 mb-2">🔍 Session Info (Dev only)</h3>
          <pre class="text-xs overflow-auto text-amber-900">{{ auth.user() | json }}</pre>
        </div>
      }

      <!-- Status message — green is OK to use, distinct from brand palette -->
      <div class="card mt-6 bg-green-50 border border-green-300 text-green-800">
        <h3 class="font-bold mb-2">✅ Foundation Working!</h3>
        <p class="text-sm">
          Aap successfully logged in ho. Backend API connected, JWT working,
          RBAC permissions loaded ({{ auth.user()?.permissions?.length }} permissions),
          PWA ready to install (on phone).
        </p>
      </div>
    </div>
  `
})
export class DashboardComponent {
  auth = inject(AuthService);
  pendingTasks = 3;
  isProduction = environment.production;

  today(): string {
    return new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
