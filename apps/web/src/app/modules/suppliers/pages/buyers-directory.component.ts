import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BuyersService, BuyerListItem } from '../services/buyers.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';

@Component({
  selector: 'app-buyers-directory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DecimalPipe, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🛒 Buyer Directory</h2>
          <p class="text-sm text-[#6b3fa0]">{{ buyers().length }} active buyers</p>
        </div>
        <a routerLink="/suppliers/buyers/new" class="btn-primary no-underline">+ Add Buyer</a>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/suppliers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🚚 Suppliers</a>
        <a routerLink="/suppliers/buyers" class="px-4 py-2 text-sm font-semibold text-[#5c1a8b] border-b-2 border-[#5c1a8b]">🛒 Buyers</a>
        <a routerLink="/suppliers/categories" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📂 Categories</a>
      </div>

      <input [(ngModel)]="search" (input)="load()" type="text"
             placeholder="🔍 Buyer search by name, phone, GST..." class="input w-full mb-4">

      @if (loading()) {
        <div class="card text-center text-gray-500 py-8">Loading…</div>
      } @else if (buyers().length === 0) {
        <div class="card text-center text-gray-500 py-8">
          Koi buyer nahi. <a routerLink="/suppliers/buyers/new" class="text-[#5c1a8b] underline">Pehla buyer add karein</a>
        </div>
      } @else {
        <div class="card p-0 overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-anjaninex-navy text-white uppercase text-xs">
              <tr>
                <th class="px-3 py-3 text-left">#</th>
                <th class="px-3 py-3 text-left">Business Name</th>
                <th class="px-3 py-3 text-left">Type</th>
                <th class="px-3 py-3 text-left">Mobile</th>
                <th class="px-3 py-3 text-left">City</th>
                <th class="px-3 py-3 text-left">GST</th>
                <th class="px-3 py-3 text-right">Budget Range</th>
                <th class="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (b of buyers(); track b.id; let idx = $index) {
                <tr class="border-t border-gray-100 hover:bg-[#faf7ff]">
                  <td class="px-3 py-2 text-gray-400">{{ idx + 1 }}</td>
                  <td class="px-3 py-2">
                    <a [routerLink]="['/suppliers/buyers', b.id]" class="font-semibold text-[#5c1a8b] hover:underline">{{ b.displayName }}</a>
                    <div class="text-[11px] text-gray-400 font-mono">{{ b.buyerCode }}@if (b.brandName) { · {{ b.brandName }} }</div>
                  </td>
                  <td class="px-3 py-2 capitalize">{{ b.buyerType || '—' }}</td>
                  <td class="px-3 py-2 font-mono text-xs">{{ b.phone || '—' }}</td>
                  <td class="px-3 py-2">{{ b.city || '—' }}</td>
                  <td class="px-3 py-2 font-mono text-xs">{{ b.gst || '—' }}</td>
                  <td class="px-3 py-2 text-right text-[#6b3fa0] font-semibold whitespace-nowrap">
                    @if (b.budgetMin || b.budgetMax) { ₹{{ b.budgetMin || 0 | number }}–{{ b.budgetMax || 0 | number }}/{{ b.budgetUnit }} } @else { — }
                  </td>
                  <td class="px-3 py-2 text-right whitespace-nowrap">
                    <a [routerLink]="['/suppliers/buyers', b.id]" class="mr-2" title="View">👁</a>
                    <a [routerLink]="['/suppliers/buyers', b.id, 'edit']" class="mr-2" title="Edit">✏️</a>
                    @if (b.phone) { <a [href]="'tel:' + b.phone" title="Call">📞</a> }
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
export class BuyersDirectoryComponent {
  private svc = inject(BuyersService);
  private toast = inject(ToastService);

  buyers = signal<BuyerListItem[]>([]);
  loading = signal(true);
  search = '';

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.list(this.search || undefined).subscribe({
      next: (b) => { this.buyers.set(b); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}
