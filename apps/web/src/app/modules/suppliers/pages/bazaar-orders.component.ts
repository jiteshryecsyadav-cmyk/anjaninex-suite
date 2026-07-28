import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';

interface BzOrder {
  id: string; orderCode: string | null; trackCode: string | null;
  buyerName: string | null; buyerPhone: string | null;
  supplierName: string | null; supplierPhone: string | null;
  categoryName: string | null; rate: number; rateUnit: string;
  quantity: number; amount: number; status: string; createdAt: string;
  tradingOrderNo: string | null; rejectReason: string | null;
  buyerCreditLimit: number | null; buyerRating: string | null;
}

// =============================================================================
// BAZAAR BOT ORDERS — AGENCY APPROVAL DESK
// Buyer+Supplier dono haan bol chuke orders yahan aate hain. Agency APPROVE kare
// tabhi Trading me asli order banta hai + supplier ko "dispatch karo" jata hai.
// =============================================================================
@Component({
  selector: 'app-bazaar-orders',
  standalone: true,
  imports: [CommonModule, DecimalPipe, DatePipe, RouterLink, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🛒 Bot Orders — Agency Approval</h2>
          <p class="text-sm text-[#6b3fa0]">Dono taraf haan ho chuki — aapki muhar lagte hi Trading order banega + supplier ko dispatch ka message jayega</p>
        </div>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/suppliers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🚚 Suppliers</a>
        <a routerLink="/suppliers/buyers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🛒 Buyers</a>
        <a routerLink="/suppliers/orders" class="px-4 py-2 text-sm font-semibold text-[#5c1a8b] border-b-2 border-[#5c1a8b]">🛒 Orders</a>
        <a routerLink="/suppliers/categories" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📂 Categories</a>
        <a routerLink="/suppliers/bot" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🤖 Bot</a>
      </div>

      <!-- Status filter chips -->
      <div class="flex gap-2 mb-4 flex-wrap">
        @for (f of filters; track f.key) {
          <button (click)="filter.set(f.key); load()"
                  class="px-3 py-1.5 rounded-full text-sm font-semibold border"
                  [class]="filter() === f.key ? 'bg-[#5c1a8b] text-white border-[#5c1a8b]' : 'bg-white text-gray-600 border-gray-300'">
            {{ f.label }}
            @if ((f.key === 'pending_agency' || f.key === '') && pendingCount() > 0) {
              <span class="ml-1 px-1.5 rounded-full bg-red-600 text-white text-xs">{{ pendingCount() }}</span>
            }
          </button>
        }
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-500 py-8">Loading…</div>
      } @else if (rows().length === 0) {
        <div class="card text-center text-gray-500 py-8">
          @if (filter() === 'pending_agency') { ✅ Koi order manzoori ke intezar me nahi — sab nipta hua! }
          @else if (filter() === '') { Abhi koi bot-order bana hi nahi — supplier ki photo se shuru hota hai. 📸 }
          @else { Is filter me koi order nahi. }
        </div>
      } @else {
        <div class="card p-0 overflow-x-auto">
          <table class="w-full text-sm" style="min-width:1000px">
            <thead class="bg-anjaninex-navy text-white uppercase text-xs">
              <tr>
                <th class="px-3 py-3 text-left">KAB</th>
                <th class="px-3 py-3 text-left">ORDER</th>
                <th class="px-3 py-3 text-left">SUPPLIER → BUYER</th>
                <th class="px-3 py-3 text-right">SAUDA</th>
                <th class="px-3 py-3 text-left">BUYER KI JHALAK</th>
                <th class="px-3 py-3 text-center">STATUS</th>
                <th class="px-3 py-3 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              @for (o of rows(); track o.id) {
                <tr class="border-t border-gray-100 hover:bg-[#faf7ff]">
                  <td class="px-3 py-2 text-xs whitespace-nowrap">{{ o.createdAt | date:'dd/MM/yy h:mm a' }}</td>
                  <td class="px-3 py-2">
                    <div class="font-mono font-bold text-[#5c1a8b]">{{ o.orderCode }}</div>
                    <div class="text-[11px] text-gray-400 font-mono">📷 {{ o.trackCode }}</div>
                  </td>
                  <td class="px-3 py-2">
                    <div class="font-semibold">{{ o.supplierName || o.supplierPhone || '—' }}</div>
                    <div class="text-xs text-gray-500">→ {{ o.buyerName || o.buyerPhone || '—' }}</div>
                  </td>
                  <td class="px-3 py-2 text-right whitespace-nowrap">
                    <div class="font-semibold">{{ o.quantity | number:'1.0-2' }} {{ o.rateUnit }} × ₹{{ o.rate | number:'1.0-2' }}</div>
                    <div class="font-black text-[#5c1a8b]">= ₹{{ o.amount | number:'1.0-2' }}</div>
                    @if (o.categoryName) { <div class="text-[11px] text-gray-400">{{ o.categoryName }}</div> }
                  </td>
                  <td class="px-3 py-2 text-xs">
                    @if (o.buyerCreditLimit != null) { <div>Credit: ₹{{ o.buyerCreditLimit | number:'1.0-0' }}</div> }
                    @if (o.buyerRating) { <div>Rating: <b>{{ o.buyerRating }}</b></div> }
                    @if (o.buyerCreditLimit == null && !o.buyerRating) { <span class="text-gray-400">—</span> }
                  </td>
                  <td class="px-3 py-2 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap" [class]="chipClass(o.status)">
                      {{ chipLabel(o.status) }}
                    </span>
                    @if (o.tradingOrderNo) {
                      <div class="text-[11px] text-green-700 font-mono mt-1">📦 {{ o.tradingOrderNo }}</div>
                    }
                    @if (o.rejectReason) {
                      <!-- Reject ki POORI wajah — kaat-chhaant nahi -->
                      <div class="text-[11px] text-red-500 mt-1 whitespace-normal" style="max-width:180px">
                        Wajah: {{ o.rejectReason }}
                      </div>
                    }
                  </td>
                  <td class="px-3 py-2 text-right whitespace-nowrap">
                    @if (o.status === 'pending_agency' || o.status === 'accepted') {
                      <button (click)="approve(o)" [disabled]="acting() === o.id"
                              class="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 mr-1">
                        {{ acting() === o.id ? '...' : '✓ APPROVE' }}
                      </button>
                      <button (click)="reject(o)" [disabled]="acting() === o.id"
                              class="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 border border-red-300 hover:bg-red-200">
                        ✗ Reject
                      </button>
                    } @else if (o.status === 'pending_supplier') {
                      <span class="text-xs text-gray-400">supplier ke jawab ka intezar</span>
                      <button (click)="reject(o)" [disabled]="acting() === o.id"
                              class="ml-1 px-2 py-1 rounded text-[11px] font-bold bg-red-50 text-red-600 border border-red-200">✗</button>
                    } @else { <span class="text-gray-300">—</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `
})
export class BazaarOrdersComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/api/bazaar-orders`;

  filters = [
    { key: '', label: '📋 Sab' },
    { key: 'pending_agency', label: '⏳ Manzoori baki' },
    { key: 'approved', label: '✓ Approved' },
    { key: 'rejected', label: '✗ Rejected' }
  ];
  // Default: SAB dikhe — manzoori-wale khud sabse upar aate hain, neeche poori history
  filter = signal('');
  rows = signal<BzOrder[]>([]);
  loading = signal(true);
  acting = signal<string | null>(null);
  pendingCount = computed(() => this.rows().filter(r => r.status === 'pending_agency').length);

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const params: any = {};
    if (this.filter()) params.status = this.filter();
    this.http.get<BzOrder[]>(this.base, { params }).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  chipLabel(s: string): string {
    return s === 'pending_agency' ? '⏳ MANZOORI BAKI'
         : s === 'approved' ? '✓ APPROVED'
         : s === 'rejected' ? '✗ REJECTED'
         : s === 'pending_supplier' ? '🕐 SUPPLIER BAKI'
         : s.toUpperCase();
  }
  chipClass(s: string): string {
    return s === 'pending_agency' ? 'bg-amber-100 text-amber-700'
         : s === 'approved' ? 'bg-green-100 text-green-700'
         : s === 'rejected' ? 'bg-red-100 text-red-600'
         : 'bg-gray-100 text-gray-500';
  }

  approve(o: BzOrder) {
    if (!confirm(`APPROVE karein?\n\n${o.orderCode} — ${o.supplierName} → ${o.buyerName}\n` +
        `${o.quantity} ${o.rateUnit} @ ₹${o.rate} = ₹${o.amount}\n\n` +
        `• Trading me asli order banega (remark me bazaar ka no + time)\n` +
        `• Supplier ko DISPATCH ka message jayega`)) return;
    this.acting.set(o.id);
    this.http.post<any>(`${this.base}/${o.id}/approve`, {}).subscribe({
      next: (r) => {
        this.acting.set(null);
        this.toast.success(`✓ Approved! Trading Order ${r.tradingOrderNo} ban gaya — supplier ko dispatch bol diya.`);
        this.load();
      },
      error: (e) => { this.acting.set(null); alert('⚠️ ' + (e?.error?.error ?? 'Approve nahi hua')); }
    });
  }

  reject(o: BzOrder) {
    const reason = prompt(`${o.orderCode} REJECT karne ki wajah (dono ko message jayega):`, '');
    if (reason === null) return;
    this.acting.set(o.id);
    this.http.post(`${this.base}/${o.id}/reject`, { reason }).subscribe({
      next: () => { this.acting.set(null); this.toast.info('Order reject — dono ko bata diya.'); this.load(); },
      error: (e) => { this.acting.set(null); alert('⚠️ ' + (e?.error?.error ?? 'Reject nahi hua')); }
    });
  }
}
