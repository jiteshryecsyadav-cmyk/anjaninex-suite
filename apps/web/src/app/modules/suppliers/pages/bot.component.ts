import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { BackButtonComponent } from '../../../shared/back-button.component';

interface BotOrder {
  orderCode: string; trackCode: string; buyerPhone: string; buyerName: string | null;
  supplierPhone: string; supplierName: string | null; categoryName: string | null;
  rate: number | null; rateUnit: string | null; quantity: number | null; amount: number | null;
  imagePath: string | null; imageUrl: string | null; status: string; createdAt: string | null;
  commissionPct: number | null; commissionAmount: number | null;
}
interface BotInbox {
  fromPhone: string; caption: string | null; rate: number | null; rateUnit: string | null;
  categoryName: string | null; trackCode: string | null; status: string; modelUsed: string | null;
  imagePath: string | null; imageUrl: string | null; createdAt: string | null;
}
interface BotMetrics {
  photos: number; processed: number; awaiting: number;
  orders: number; pending: number; accepted: number; commission: number; forwards: number;
}

@Component({
  selector: 'app-bot',
  standalone: true,
  imports: [CommonModule, DecimalPipe, DatePipe, RouterLink, RouterLinkActive, BackButtonComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🤖 WhatsApp Bot</h2>
        <button (click)="loadAll()" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">🔄 Refresh</button>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-5 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/suppliers" [routerLinkActiveOptions]="{exact:true}" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🚚 Suppliers</a>
        <a routerLink="/suppliers/buyers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🛒 Buyers</a>
        <a routerLink="/suppliers/appointments" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📅 Appointments</a>
        <a routerLink="/suppliers/match" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🎯 Match</a>
        <a routerLink="/suppliers/search" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🔍 Search</a>
        <a routerLink="/suppliers/bot" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🤖 Bot</a>
      </div>

      <!-- Status banner -->
      <div class="rounded-lg p-3 mb-4 flex items-center gap-3 text-sm"
           [class.bg-green-50]="status().connected" [class.bg-red-50]="!status().connected">
        <span class="w-2.5 h-2.5 rounded-full" [class.bg-green-500]="status().connected" [class.bg-red-500]="!status().connected"></span>
        <span class="font-bold" [class.text-green-700]="status().connected" [class.text-red-700]="!status().connected">
          Bot: {{ status().connected ? 'Connected' : 'Disconnected' }}
        </span>
        @if (status().lastSeen) { <span class="text-gray-500">Last message: {{ status().lastSeen | date:'dd MMM, HH:mm' }}</span> }
        @if (!status().connected) { <span class="text-gray-500">— bot terminal me <code>npm start</code> chalu hai? QR scan hua?</span> }
      </div>

      <!-- Tabs -->
      <div class="flex gap-2 mb-4">
        <button (click)="tab.set('orders')" [class]="tabCls('orders')">🛒 Orders ({{ orders().length }})</button>
        <button (click)="tab.set('inbox')" [class]="tabCls('inbox')">📥 WA Inbox ({{ inbox().length }})</button>
        <button (click)="tab.set('metrics')" [class]="tabCls('metrics')">📊 Metrics</button>
        <button (click)="tab.set('device'); startPairPolling()" [class]="tabCls('device')">📱 Link Device</button>
      </div>

      <!-- ORDERS -->
      @if (tab() === 'orders') {
        <div class="flex gap-1.5 mb-3 flex-wrap">
          @for (s of orderStatuses; track s.key) {
            <button (click)="orderFilter.set(s.key); loadOrders()" [class]="chipCls(orderFilter()===s.key)">{{ s.label }}</button>
          }
        </div>
        @if (orders().length === 0) {
          <div class="card text-center text-gray-400 py-8">Koi order nahi. Buyer "ORDER &lt;code&gt;" bheje to yahan aayega.</div>
        } @else {
          <div class="card overflow-x-auto p-0">
            <table class="w-full text-sm">
              <thead class="bg-purple-50 text-[#6b3fa0] text-xs uppercase">
                <tr>
                  <th class="text-left px-3 py-2">Order</th><th class="text-left px-3 py-2">Buyer</th>
                  <th class="text-left px-3 py-2">Supplier</th><th class="text-left px-3 py-2">Item</th>
                  <th class="text-right px-3 py-2">Qty</th><th class="text-right px-3 py-2">Rate</th>
                  <th class="text-right px-3 py-2">Total</th><th class="text-center px-3 py-2">Status</th>
                  <th class="text-right px-3 py-2">Commission</th><th class="text-left px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                @for (o of orders(); track o.orderCode) {
                  <tr class="border-t border-gray-100">
                    <td class="px-3 py-2 font-mono text-xs">
                      <div class="flex items-center gap-2">
                        @if (o.imageUrl) { <img [src]="o.imageUrl" alt="" class="w-9 h-9 rounded object-cover border cursor-zoom-in" referrerpolicy="no-referrer" (dblclick)="zoom.set({ img: o.imageUrl, code: o.trackCode, label: (o.categoryName || 'Fabric') + (o.rate ? ' · ₹' + o.rate + '/' + o.rateUnit : '') })" title="Double-click to enlarge"> }
                        <div>{{ o.orderCode }}<div class="text-gray-400">{{ o.trackCode }}</div></div>
                      </div>
                    </td>
                    <td class="px-3 py-2">{{ o.buyerName || o.buyerPhone }}<div class="text-gray-400 text-xs">{{ o.buyerPhone }}</div></td>
                    <td class="px-3 py-2">{{ o.supplierName || o.supplierPhone }}<div class="text-gray-400 text-xs">{{ o.supplierPhone }}</div></td>
                    <td class="px-3 py-2">{{ o.categoryName || 'Fabric' }}</td>
                    <td class="px-3 py-2 text-right">{{ o.quantity }} {{ o.rateUnit }}</td>
                    <td class="px-3 py-2 text-right">₹{{ o.rate }}</td>
                    <td class="px-3 py-2 text-right font-semibold">₹{{ o.amount | number:'1.0-2' }}</td>
                    <td class="px-3 py-2 text-center"><span [class]="statusCls(o.status)">{{ statusLabel(o.status) }}</span></td>
                    <td class="px-3 py-2 text-right">
                      @if (o.commissionAmount != null) {
                        <span class="text-green-700 font-semibold">₹{{ o.commissionAmount | number:'1.0-2' }}</span>
                        <span class="text-gray-400 text-xs"> ({{ o.commissionPct }}%)</span>
                        <button (click)="setCommission(o)" class="ml-1 text-xs text-[#5c1a8b]">✎</button>
                      } @else {
                        <button (click)="setCommission(o)" class="text-xs px-2 py-1 rounded bg-purple-50 text-[#5c1a8b] font-semibold">💰 Set</button>
                      }
                    </td>
                    <td class="px-3 py-2 text-gray-500 text-xs">{{ o.createdAt | date:'dd MMM, HH:mm' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }

      <!-- INBOX -->
      @if (tab() === 'inbox') {
        <div class="flex gap-1.5 mb-3 flex-wrap">
          @for (s of inboxStatuses; track s.key) {
            <button (click)="inboxFilter.set(s.key); loadInbox()" [class]="chipCls(inboxFilter()===s.key)">{{ s.label }}</button>
          }
        </div>
        @if (inbox().length === 0) {
          <div class="card text-center text-gray-400 py-8">📭 Koi message nahi. Bot connected hai? Supplier ne photo bheji?</div>
        } @else {
          <div class="grid gap-2">
            @for (m of inbox(); track $index) {
              <div class="card flex items-center gap-3 py-2.5">
                @if (m.imageUrl) {
                  <img [src]="m.imageUrl" alt="photo" class="w-12 h-12 rounded object-cover border cursor-zoom-in" referrerpolicy="no-referrer"
                       (dblclick)="zoom.set({ img: m.imageUrl, code: m.trackCode, label: (m.categoryName || 'Fabric') + (m.rate ? ' · ₹' + m.rate + '/' + m.rateUnit : '') })"
                       title="Double-click to enlarge">
                } @else {
                  <span class="text-2xl">📷</span>
                }
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold truncate">{{ m.caption || '(no caption)' }}</div>
                  <div class="text-xs text-gray-500">
                    {{ m.fromPhone }} · {{ m.categoryName || '—' }}
                    @if (m.rate) { · ₹{{ m.rate }}/{{ m.rateUnit }} }
                    @if (m.trackCode) { · <span class="font-mono">{{ m.trackCode }}</span> }
                  </div>
                </div>
                <span [class]="statusCls(m.status)">{{ statusLabel(m.status) }}</span>
                <span class="text-xs text-gray-400 whitespace-nowrap">{{ m.createdAt | date:'dd MMM, HH:mm' }}</span>
              </div>
            }
          </div>
        }
      }

      <!-- METRICS -->
      @if (tab() === 'metrics') {
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="card text-center"><div class="text-3xl">📷</div><div class="text-2xl font-black text-[#5c1a8b]">{{ metrics().photos }}</div><div class="text-xs text-gray-500 uppercase">Photos</div></div>
          <div class="card text-center"><div class="text-3xl">✅</div><div class="text-2xl font-black text-[#5c1a8b]">{{ metrics().processed }}</div><div class="text-xs text-gray-500 uppercase">Processed</div></div>
          <div class="card text-center"><div class="text-3xl">⏳</div><div class="text-2xl font-black text-[#5c1a8b]">{{ metrics().awaiting }}</div><div class="text-xs text-gray-500 uppercase">Rate Awaited</div></div>
          <div class="card text-center"><div class="text-3xl">📤</div><div class="text-2xl font-black text-[#5c1a8b]">{{ metrics().forwards }}</div><div class="text-xs text-gray-500 uppercase">Broadcasts</div></div>
          <div class="card text-center"><div class="text-3xl">🛒</div><div class="text-2xl font-black text-[#5c1a8b]">{{ metrics().orders }}</div><div class="text-xs text-gray-500 uppercase">Orders</div></div>
          <div class="card text-center"><div class="text-3xl">🕒</div><div class="text-2xl font-black text-amber-600">{{ metrics().pending }}</div><div class="text-xs text-gray-500 uppercase">Pending</div></div>
          <div class="card text-center"><div class="text-3xl">🎉</div><div class="text-2xl font-black text-green-600">{{ metrics().accepted }}</div><div class="text-xs text-gray-500 uppercase">Accepted</div></div>
          <div class="card text-center"><div class="text-3xl">💰</div><div class="text-2xl font-black text-green-700">₹{{ metrics().commission | number:'1.0-0' }}</div><div class="text-xs text-gray-500 uppercase">Commission</div></div>
        </div>
      }

      <!-- LINK DEVICE (WhatsApp Web jaisा QR + phone-code) -->
      @if (tab() === 'device') {
        <div class="card max-w-md mx-auto text-center">
          @if (pair().connected) {
            <div class="text-5xl mb-2">✅</div>
            <div class="font-bold text-green-700 text-lg">Device Linked</div>
            <div class="text-sm text-gray-500 mt-1">WhatsApp bot connected hai. Re-link karna ho to neeche dabao.</div>
          } @else {
            <div class="font-bold text-[#5c1a8b] text-lg mb-1">📱 Link WhatsApp Device</div>
            <div class="text-sm text-gray-500 mb-3">WhatsApp Web jaisा — QR scan karo, ya phone-code daalo.</div>
            @if (pair().qr) {
              <img [src]="pair().qr" width="280" height="280" class="mx-auto border rounded-lg" alt="WhatsApp QR">
              <div class="text-xs text-gray-500 mt-2">WhatsApp → Linked Devices → Link a Device → ye QR scan karo</div>
            }
            @if (pair().code) {
              <div class="mt-3 p-3 bg-purple-50 rounded-lg inline-block">
                <div class="text-xs text-gray-500">Ya "Link with phone number instead" me ye code daalo:</div>
                <div class="font-mono font-black text-2xl tracking-widest text-[#5c1a8b]">{{ pair().code }}</div>
              </div>
            }
            @if (!pair().qr && !pair().code) {
              <div class="text-sm text-gray-400 py-6">
                @if (pair().offline) { ⚠️ Bot service offline hai (VPS pe bot band hai?). }
                @else { QR/code laaya ja raha hai… 2-3 sec ruko ya "Re-link" dabao. }
              </div>
            }
          }
          <div class="mt-4">
            <button (click)="relink()" [disabled]="relinking()"
                    class="px-4 py-2 rounded-lg bg-[#5c1a8b] text-white text-sm font-semibold disabled:opacity-50">
              {{ relinking() ? 'Restarting…' : '🔄 Re-link Device (naya QR/code)' }}
            </button>
          </div>
          <div class="text-[11px] text-gray-400 mt-2">QR/code 2-3 min me expire hota hai. Na aaye to Re-link dabao.</div>
        </div>
      }
    </div>

    <!-- Lightbox: bada photo (watermark ke saath) + QR code -->
    @if (zoom(); as z) {
      <div class="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4" (click)="zoom.set(null)">
        <div class="bg-white rounded-xl p-4 max-w-[94vw] max-h-[94vh] overflow-auto flex flex-col md:flex-row gap-4 items-center" (click)="$event.stopPropagation()">
          <img [src]="z.img" class="max-h-[82vh] max-w-[70vw] rounded-lg" referrerpolicy="no-referrer">
          <div class="text-center min-w-[180px]">
            @if (z.label) { <div class="font-semibold text-[#5c1a8b] mb-2">{{ z.label }}</div> }
            @if (z.code) {
              <img [src]="qr(z.code)" width="170" height="170" class="mx-auto border rounded" alt="QR">
              <div class="font-mono text-xs mt-1">{{ z.code }}</div>
              <div class="text-[11px] text-gray-400">Scan QR — order code</div>
            }
            <button (click)="zoom.set(null)" class="mt-4 px-4 py-1.5 bg-[#5c1a8b] text-white rounded text-sm">Close ✕</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`.card{ background:#fff; border:1px solid #eee; border-radius:12px; padding:14px; }`]
})
export class BotComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/bot`;

  tab = signal<'orders' | 'inbox' | 'metrics' | 'device'>('orders');
  pair = signal<{ connected: boolean; qr: string | null; code: string | null; offline?: boolean }>({ connected: false, qr: null, code: null });
  relinking = signal(false);
  private pairTimer: any = null;
  orders = signal<BotOrder[]>([]);
  inbox = signal<BotInbox[]>([]);
  metrics = signal<BotMetrics>({ photos: 0, processed: 0, awaiting: 0, orders: 0, pending: 0, accepted: 0, commission: 0, forwards: 0 });
  status = signal<{ connected: boolean; lastSeen: string | null }>({ connected: false, lastSeen: null });
  zoom = signal<{ img: string; code: string | null; label: string } | null>(null);

  orderFilter = signal('all');
  inboxFilter = signal('all');

  orderStatuses = [
    { key: 'all', label: 'All' },
    { key: 'pending_supplier', label: 'Pending' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'rejected', label: 'Rejected' }
  ];
  inboxStatuses = [
    { key: 'all', label: 'All' },
    { key: 'processed', label: 'Processed' },
    { key: 'awaiting_rate', label: 'Rate Awaited' },
    { key: 'failed', label: 'Failed' }
  ];

  ngOnInit() { this.loadAll(); }

  loadAll() { this.loadStatus(); this.loadOrders(); this.loadInbox(); this.loadMetrics(); }

  loadStatus() {
    this.http.get<{ connected: boolean; lastSeen: string | null }>(`${this.base}/status`)
      .subscribe({ next: s => this.status.set(s), error: () => {} });
  }
  loadOrders() {
    const q = this.orderFilter() === 'all' ? '' : `?status=${this.orderFilter()}`;
    this.http.get<BotOrder[]>(`${this.base}/orders${q}`).subscribe({ next: o => this.orders.set(o), error: () => {} });
  }
  loadInbox() {
    const q = this.inboxFilter() === 'all' ? '' : `?status=${this.inboxFilter()}`;
    this.http.get<BotInbox[]>(`${this.base}/inbox${q}`).subscribe({ next: i => this.inbox.set(i), error: () => {} });
  }
  loadMetrics() {
    this.http.get<BotMetrics>(`${this.base}/metrics`).subscribe({ next: m => this.metrics.set(m), error: () => {} });
  }

  // ---- Link Device (WhatsApp Web jaisा QR + phone-code) ----
  loadPair() {
    this.http.get<any>(`${this.base}/pair`).subscribe({
      next: p => { this.pair.set(p); if (p.connected) this.stopPairPolling(); },
      error: () => {}
    });
  }
  startPairPolling() {
    this.loadPair();
    this.stopPairPolling();
    this.pairTimer = setInterval(() => this.loadPair(), 3000);
  }
  stopPairPolling() { if (this.pairTimer) { clearInterval(this.pairTimer); this.pairTimer = null; } }
  ngOnDestroy() { this.stopPairPolling(); }

  relink() {
    if (!confirm('Device re-link karein? Purana WhatsApp link hat jayega, naya QR/code aayega.')) return;
    this.relinking.set(true);
    this.http.post(`${this.base}/pair/restart`, {}).subscribe({
      next: () => setTimeout(() => { this.relinking.set(false); this.startPairPolling(); }, 4000),
      error: () => { this.relinking.set(false); alert('Bot service reachable nahi. VPS pe bot chal raha hai?'); }
    });
  }

  // Track code ka QR (free qrserver — browser me render).
  qr(code: string) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(code)}`;
  }

  setCommission(o: BotOrder) {
    const cur = o.commissionPct != null ? String(o.commissionPct) : '';
    const input = prompt(`Commission % for order ${o.orderCode} (deal ₹${o.amount}):`, cur);
    if (input === null) return;
    const pct = parseFloat(input);
    if (isNaN(pct) || pct < 0 || pct > 100) { alert('Sahi % daalein (0-100).'); return; }
    this.http.post(`${this.base}/orders/${o.orderCode}/commission`, { pct }).subscribe({
      next: () => { this.loadOrders(); this.loadMetrics(); },
      error: (e) => alert(e?.error?.error ?? 'Save nahi hua')
    });
  }

  tabCls(t: string) {
    const on = this.tab() === t;
    return `px-4 py-2 rounded-lg text-sm font-semibold ${on ? 'bg-[#5c1a8b] text-white' : 'bg-purple-50 text-[#6b3fa0]'}`;
  }
  chipCls(on: boolean) {
    return `px-3 py-1 rounded-full text-xs font-semibold ${on ? 'bg-[#5c1a8b] text-white' : 'bg-gray-100 text-gray-600'}`;
  }
  statusLabel(s: string) {
    return { pending_supplier: 'Pending', accepted: 'Accepted', rejected: 'Rejected',
             processed: 'Processed', awaiting_rate: 'Rate Awaited', processing: 'Processing', failed: 'Failed' }[s] || s;
  }
  statusCls(s: string) {
    const map: any = {
      accepted: 'bg-green-100 text-green-700', processed: 'bg-green-100 text-green-700',
      pending_supplier: 'bg-amber-100 text-amber-700', awaiting_rate: 'bg-amber-100 text-amber-700',
      rejected: 'bg-red-100 text-red-700', failed: 'bg-red-100 text-red-700'
    };
    return `px-2 py-0.5 rounded-full text-xs font-semibold ${map[s] || 'bg-gray-100 text-gray-600'}`;
  }
}
