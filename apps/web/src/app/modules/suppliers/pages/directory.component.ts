import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { SuppliersService, SupplierListItem, SupplierCategory, LinkableContact } from '../services/suppliers.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';

@Component({
  selector: 'app-suppliers-directory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🚚 Bazaar Link</h2>
          <p class="text-sm text-[#6b3fa0]">
            {{ suppliers().length }} {{ filteredCategory ? 'matching' : 'active' }} suppliers · 🛒 {{ buyerCount() }} buyers · ↔️ {{ bothCount() }} both · 👨‍💼 {{ staffCount() }} staff
          </p>
        </div>
        <!-- +Add dropdown: Supplier (yahin) ya Buyer (Trading party banta hai, Core Master shared) -->
        <div class="relative">
          <button type="button" (click)="addMenuOpen.set(!addMenuOpen())" class="btn-primary no-underline">
            + Add ▾
          </button>
          @if (addMenuOpen()) {
            <div class="absolute right-0 mt-1 w-44 bg-white border border-[#ddc8f5] rounded-lg shadow-lg z-20 overflow-hidden">
              <a routerLink="/suppliers/new" (click)="addMenuOpen.set(false)"
                 class="block px-4 py-2 text-sm hover:bg-[#f0e6ff] text-[#5c1a8b] font-semibold">🏭 Supplier</a>
              <a routerLink="/trading/parties" [queryParams]="{ add: 'buyer' }" (click)="addMenuOpen.set(false)"
                 class="block px-4 py-2 text-sm hover:bg-[#f0e6ff] text-[#5c1a8b] font-semibold border-t border-[#f0e6ff]">🛒 Buyer</a>
              <button type="button" (click)="openLinkModal()"
                 class="block w-full text-left px-4 py-2 text-sm hover:bg-[#f0e6ff] text-[#5c1a8b] font-semibold border-t border-[#f0e6ff]">🔗 Existing se laao</button>
            </div>
          }
        </div>
      </div>

      <!-- COUNT CARDS -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div class="rounded-xl bg-white border border-[#eee] p-3 text-center" style="border-left:4px solid #0284c7;background:#0ea5e90d">
          <div class="text-2xl">🚚</div>
          <div class="text-2xl font-black text-[#5c1a8b]" style="color:#0284c7">{{ supplierCount() }}</div>
          <div class="text-[11px] text-gray-500 uppercase font-semibold">Suppliers</div>
        </div>
        <div class="rounded-xl bg-white border border-[#eee] p-3 text-center" style="border-left:4px solid #16a34a;background:#16a34a0d">
          <div class="text-2xl">🛒</div>
          <div class="text-2xl font-black text-[#5c1a8b]" style="color:#16a34a">{{ buyerCount() }}</div>
          <div class="text-[11px] text-gray-500 uppercase font-semibold">Buyers</div>
        </div>
        <div class="rounded-xl bg-white border border-[#eee] p-3 text-center" style="border-left:4px solid #9333ea;background:#9333ea0d">
          <div class="text-2xl">↔️</div>
          <div class="text-2xl font-black text-[#5c1a8b]" style="color:#9333ea">{{ bothCount() }}</div>
          <div class="text-[11px] text-gray-500 uppercase font-semibold">Both</div>
        </div>
        <div class="rounded-xl bg-white border border-[#eee] p-3 text-center" style="border-left:4px solid #d97706;background:#d977060d">
          <div class="text-2xl">👨‍💼</div>
          <div class="text-2xl font-black text-[#5c1a8b]" style="color:#d97706">{{ staffCount() }}</div>
          <div class="text-[11px] text-gray-500 uppercase font-semibold">Staff</div>
        </div>
      </div>

      <!-- LINK EXISTING CONTACT MODAL (Phase 3) — Trading party ko ek-click Directory me laao -->
      @if (linkModalOpen()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="linkModalOpen.set(false)">
          <div class="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" (click)="$event.stopPropagation()">
            <div class="px-5 py-4 border-b bg-[#5c1a8b] text-white flex items-center justify-between">
              <h3 class="font-bold">🔗 Existing contact ko Directory me laao</h3>
              <button (click)="linkModalOpen.set(false)" class="text-2xl">×</button>
            </div>
            <div class="p-4">
              <input [(ngModel)]="linkSearch" (input)="loadLinkable()" type="text"
                     placeholder="🔍 Naam / phone / GST se dhundo..." class="input w-full mb-3">
              <div class="overflow-y-auto" style="max-height:50vh">
                @if (linkable().length === 0) {
                  <div class="text-center text-gray-500 py-6 text-sm">Koi naya contact nahi mila. (Sab pehle se directory me hain, ya Trading me party banao.)</div>
                } @else {
                  @for (c of linkable(); track c.contactId) {
                    <div class="flex items-center justify-between border-b py-2">
                      <div>
                        <div class="font-semibold text-sm">{{ c.displayName }}</div>
                        <div class="text-xs text-gray-500">{{ c.phone || '—' }} · {{ c.gst || 'No GST' }} · {{ c.city || '' }}</div>
                      </div>
                      <button (click)="linkContact(c)" [disabled]="linkingId() === c.contactId"
                              class="btn-primary text-xs px-3 py-1">
                        {{ linkingId() === c.contactId ? '...' : '+ Add' }}
                      </button>
                    </div>
                  }
                }
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/suppliers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           [routerLinkActiveOptions]="{exact:true}"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🚚 Suppliers</a>
        <a routerLink="/suppliers/buyers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🛒 Buyers</a>
        <a routerLink="/suppliers/appointments" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📅 Appointments</a>
        <a routerLink="/suppliers/match" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🎯 Match</a>
        <a routerLink="/suppliers/search" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🔍 Search</a>
        <a routerLink="/suppliers/categories" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📂 Categories</a>
        <a routerLink="/suppliers/bot" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🤖 Bot</a>
      </div>

      <!-- Search + Category Filter -->
      <div class="flex gap-3 mb-4">
        <input [(ngModel)]="searchQuery" (input)="onSearch()" type="text"
               placeholder="🔍 Search supplier by name, phone, GST..." class="input flex-1">
        <select [(ngModel)]="filteredCategory" (change)="load()" class="input w-56">
          <option value="">All Categories</option>
          @for (c of categories(); track c.id) {
            <option [value]="c.id">{{ c.name }} ({{ c.supplierCount }})</option>
          }
        </select>
      </div>

      <!-- Quick category chips -->
      <div class="flex gap-2 mb-4 flex-wrap">
        <button (click)="filteredCategory = ''; load()"
                [class]="filteredCategory === ''
                  ? 'px-3 py-1 rounded-full text-xs font-bold bg-[#5c1a8b] text-white'
                  : 'px-3 py-1 rounded-full text-xs font-semibold bg-white border border-[#ddc8f5] text-[#5c1a8b] hover:bg-[#f0e6ff]'">
          All
        </button>
        @for (c of topCategories(); track c.id) {
          <button (click)="filteredCategory = c.id; load()"
                  [class]="filteredCategory === c.id
                    ? 'px-3 py-1 rounded-full text-xs font-bold bg-[#5c1a8b] text-white'
                    : 'px-3 py-1 rounded-full text-xs font-semibold bg-white border border-[#ddc8f5] text-[#5c1a8b] hover:bg-[#f0e6ff]'">
            {{ c.name }} <span class="opacity-70">({{ c.supplierCount }})</span>
          </button>
        }
      </div>

      <!-- Grid of supplier cards -->
      @if (loading()) {
        <div class="card text-center text-gray-500">Loading suppliers…</div>
      } @else if (suppliers().length === 0) {
        <div class="card text-center text-gray-500">
          No suppliers found. <a routerLink="/suppliers/new" class="text-[#5c1a8b] underline">Add first supplier</a>
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
                <th class="px-3 py-3 text-left">Categories</th>
                <th class="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (s of suppliers(); track s.id; let idx = $index) {
                <tr class="border-t border-gray-100 hover:bg-[#faf7ff]">
                  <td class="px-3 py-2 text-gray-400">{{ idx + 1 }}</td>
                  <td class="px-3 py-2">
                    <a [routerLink]="['/suppliers', s.id]" class="font-semibold text-[#5c1a8b] hover:underline">{{ s.displayName }}</a>
                    <div class="text-[11px] text-gray-400 font-mono">{{ s.supplierCode }}@if (s.gst) { · GST: {{ s.gst }} }</div>
                  </td>
                  <td class="px-3 py-2 capitalize">{{ s.businessType || '—' }}</td>
                  <td class="px-3 py-2 font-mono text-xs">{{ s.phone || '—' }}</td>
                  <td class="px-3 py-2">{{ s.city || '—' }}</td>
                  <td class="px-3 py-2 font-mono text-xs">{{ s.gst || '—' }}</td>
                  <td class="px-3 py-2">
                    <div class="flex gap-1 flex-wrap">
                      @for (cat of s.categories.slice(0,3); track cat) {
                        <span class="px-2 py-0.5 bg-[#f0e6ff] text-[#5c1a8b] rounded text-[10px] font-semibold">{{ cat }}</span>
                      }
                      @if (s.categories.length > 3) { <span class="text-[10px] text-gray-400">+{{ s.categories.length - 3 }}</span> }
                    </div>
                  </td>
                  <td class="px-3 py-2 text-right whitespace-nowrap">
                    <a [routerLink]="['/suppliers', s.id]" class="mr-2" title="View">👁</a>
                    <a [routerLink]="['/suppliers', s.id, 'edit']" class="mr-2" title="Edit">✏️</a>
                    @if (s.phone) {
                      <a [href]="'tel:' + s.phone" class="mr-1" title="Call">📞</a>
                      <a [href]="waLink(s.phone)" target="_blank" class="mr-1" title="WhatsApp">💬</a>
                    }
                    <button type="button" (click)="del(s)" title="Delete"
                            style="border:0;background:transparent;cursor:pointer;font-size:14px">🗑️</button>
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
export class SuppliersDirectoryComponent {
  private svc = inject(SuppliersService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  addMenuOpen = signal(false);
  supplierCount = signal(0);
  buyerCount = signal(0);
  bothCount = signal(0);
  staffCount = signal(0);

  // Link-existing-contact modal (Phase 3)
  linkModalOpen = signal(false);
  linkSearch = '';
  linkable = signal<LinkableContact[]>([]);
  linkingId = signal<string | null>(null);

  openLinkModal() {
    this.addMenuOpen.set(false);
    this.linkModalOpen.set(true);
    this.linkSearch = '';
    this.loadLinkable();
  }
  loadLinkable() {
    this.svc.listLinkable(this.linkSearch || undefined).subscribe({
      next: (list) => this.linkable.set(list),
      error: () => this.linkable.set([])
    });
  }
  linkContact(c: LinkableContact) {
    this.linkingId.set(c.contactId);
    this.svc.addFromContact(c.contactId).subscribe({
      next: () => {
        this.toast.success(`${c.displayName} Directory me add ho gaya!`);
        this.linkingId.set(null);
        this.linkable.update(l => l.filter(x => x.contactId !== c.contactId));
        this.load();
      },
      error: (e) => {
        this.toast.error(e?.error?.error ?? 'Add nahi hua');
        this.linkingId.set(null);
      }
    });
  }

  suppliers = signal<SupplierListItem[]>([]);
  categories = signal<SupplierCategory[]>([]);
  loading = signal(true);
  searchQuery = '';
  filteredCategory = '';

  topCategories = computed(() =>
    this.categories()
      .filter(c => c.supplierCount > 0)
      .sort((a, b) => b.supplierCount - a.supplierCount)
      .slice(0, 8)
  );

  waLink(phone: string): string {
    return 'https://wa.me/' + (phone || '').replace(/[^0-9]/g, '');
  }

  ngOnInit() {
    // Counts (suppliers/buyers/both) from Core Master counts endpoint — accurate.
    this.http.get<{ suppliers: number; buyers: number; both: number; staff: number }>(`${environment.apiUrl}/api/core/contacts/counts`)
      .subscribe({ next: c => { this.supplierCount.set(c.suppliers); this.buyerCount.set(c.buyers); this.bothCount.set(c.both); this.staffCount.set(c.staff); }, error: () => {} });
    this.svc.listCategories().subscribe(c => this.categories.set(c));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.list(this.searchQuery || undefined, this.filteredCategory || undefined).subscribe({
      next: (s) => { this.suppliers.set(s); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  private searchTimer: any;
  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  del(s: SupplierListItem) {
    if (!confirm(`"${s.displayName}" ko delete karna hai?`)) return;
    this.svc.delete(s.id).subscribe({
      next: () => { this.toast.success(`${s.displayName} delete ho gaya`); this.load(); },
      error: (e) => alert('Delete fail: ' + (e?.error?.error ?? e?.error?.message ?? 'unknown'))
    });
  }
}
