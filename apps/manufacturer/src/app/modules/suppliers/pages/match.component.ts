import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatchService, MatchResult } from '../services/match.service';
import { BuyersService, BuyerListItem } from '../services/buyers.service';
import { SuppliersService, SupplierCategory } from '../services/suppliers.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-match',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DecimalPipe, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="mb-4">
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🎯 Match</h2>
        <p class="text-sm text-[#6b3fa0]">Buyer ki demand se matching suppliers dhundho</p>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/suppliers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🚚 Suppliers</a>
        <a routerLink="/suppliers/buyers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🛒 Buyers</a>
        <a routerLink="/suppliers/appointments" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📅 Appointments</a>
        <a routerLink="/suppliers/match" class="px-4 py-2 text-sm font-semibold text-[#5c1a8b] border-b-2 border-[#5c1a8b]">🎯 Match</a>
      </div>

      <div class="card flex flex-col gap-3 mb-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="lbl">Buyer (uski demand auto-use hogi)</label>
            <select [(ngModel)]="buyerId" (ngModelChange)="onBuyerPick()" class="input">
              <option [ngValue]="null">— Manual (neeche bharo) —</option>
              @for (b of buyers(); track b.id) { <option [ngValue]="b.id">{{ b.displayName }}</option> }
            </select>
          </div>
          <div>
            <label class="lbl">City (optional)</label>
            <input [(ngModel)]="city" class="input" placeholder="e.g. Surat">
          </div>
          <div><label class="lbl">Rate Min (₹)</label><input type="number" [(ngModel)]="rateMin" class="input"></div>
          <div><label class="lbl">Rate Max (₹)</label><input type="number" [(ngModel)]="rateMax" class="input"></div>
        </div>
        <div>
          <label class="lbl">Categories ({{ selectedCats().length }})</label>
          <div class="border border-[#ddc8f5] rounded-lg p-2 grid grid-cols-3 gap-1 max-h-40 overflow-y-auto">
            @for (c of categories(); track c.id) {
              <label class="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#f0e6ff] cursor-pointer text-sm">
                <input type="checkbox" [checked]="selectedCats().includes(c.id)" (change)="toggleCat(c.id)">
                {{ c.name }}
              </label>
            }
          </div>
        </div>
        <div class="flex justify-end">
          <button (click)="runMatch()" [disabled]="loading()" class="btn-primary">
            {{ loading() ? 'Matching…' : '🎯 Find Suppliers' }}
          </button>
        </div>
      </div>

      @if (searched()) {
        @if (results().length === 0) {
          <div class="card text-center text-gray-500 py-8">Koi matching supplier nahi mila.</div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            @for (r of results(); track r.supplierId) {
              <a [routerLink]="['/suppliers', r.supplierId]" class="card hover:shadow-lg transition no-underline block">
                <div class="flex items-start justify-between">
                  <div class="font-bold text-[#5c1a8b]">{{ r.displayName }}</div>
                  <span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">⭐ {{ r.score }}</span>
                </div>
                <div class="text-xs text-gray-600 mt-1">📞 {{ r.phone || '—' }} · 📍 {{ r.city || '—' }}</div>
                @if (r.bestRate) { <div class="text-xs text-[#6b3fa0] mt-1">Best rate: ₹{{ r.bestRate | number }}</div> }
                @if (r.matchedCategories.length) {
                  <div class="flex gap-1 flex-wrap mt-2">
                    @for (mc of r.matchedCategories; track mc) {
                      <span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{{ mc }}</span>
                    }
                  </div>
                }
              </a>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`.lbl{ display:block; font-size:10px; font-weight:800; color:#6b3fa0; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }`]
})
export class MatchComponent {
  private svc = inject(MatchService);
  private buyerSvc = inject(BuyersService);
  private supSvc = inject(SuppliersService);

  buyers = signal<BuyerListItem[]>([]);
  categories = signal<SupplierCategory[]>([]);
  results = signal<MatchResult[]>([]);
  selectedCats = signal<string[]>([]);
  loading = signal(false);
  searched = signal(false);

  buyerId: string | null = null;
  city = '';
  rateMin: number | null = null;
  rateMax: number | null = null;

  ngOnInit() {
    this.buyerSvc.list().subscribe(b => this.buyers.set(b));
    this.supSvc.listCategories().subscribe(c => this.categories.set(c));
  }

  onBuyerPick() {
    // When a buyer is chosen, clear manual category filter (backend uses buyer's own).
    if (this.buyerId) this.selectedCats.set([]);
  }

  toggleCat(id: string) {
    this.selectedCats.update(arr => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  }

  runMatch() {
    this.loading.set(true);
    this.svc.match({
      buyerId: this.buyerId,
      categoryIds: this.selectedCats(),
      rateMin: this.rateMin,
      rateMax: this.rateMax,
      city: this.city || undefined
    }).subscribe({
      next: (r) => { this.results.set(r); this.searched.set(true); this.loading.set(false); },
      error: () => { this.results.set([]); this.searched.set(true); this.loading.set(false); }
    });
  }
}
