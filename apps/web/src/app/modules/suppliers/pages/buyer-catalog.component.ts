import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import { SupplierCategory } from '../services/suppliers.service';
import { BuyersService, BuyerVariety } from '../services/buyers.service';
import { ToastService } from '../../../shared/toast.service';

// =============================================================================
// BUYER PRODUCT CATALOG (Phase B) — clone of supplier-catalog.component.ts, but
// for a single buyer + a single catalogType ('demand' | 'supply').
// UX fixes over the supplier catalog: (a) inline validation when variety name is
// empty, (b) error handler on add/upload that surfaces the backend message via a
// toast — so failures are NOT silent.
// =============================================================================
@Component({
  selector: 'app-buyer-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="border border-[#ddc8f5] rounded-lg p-3">
      <p class="text-xs text-gray-500 mb-3">
        {{ catalogType === 'supply'
          ? 'Jo buyer khud banake bechta hai. Category ke andar variety banao, photo + rate add karo.'
          : 'Jo buyer khareedna chahta hai. Category ke andar variety banao (jaise "Cotton 60-60 plain"). Har variety me photo + rate add karo.' }}
      </p>

      <!-- Add variety -->
      <div class="grid grid-cols-12 gap-2 mb-1">
        <select [(ngModel)]="newCat" class="input col-span-3 text-sm">
          <option value="">Category…</option>
          @for (c of categories; track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          <option value="__custom">+ Custom</option>
        </select>
        @if (newCat === '__custom') {
          <input [(ngModel)]="newCatName" class="input col-span-3 text-sm" placeholder="Custom category">
        }
        <input [(ngModel)]="newName" class="input text-sm" [class.col-span-5]="newCat==='__custom'" [class.col-span-6]="newCat!=='__custom'" placeholder="Variety naam (e.g. Cotton 60-60 plain)">
        <input [(ngModel)]="newDno" class="input col-span-1 text-sm" placeholder="D.No">
        <button type="button" (click)="addVariety()" class="btn-primary col-span-2 text-sm whitespace-nowrap">+ Add Variety</button>
      </div>
      <!-- Inline validation (UX fix: empty naam par silent fail nahi) -->
      @if (nameError()) {
        <p class="text-xs text-red-600 mb-2">{{ nameError() }}</p>
      } @else {
        <div class="mb-2"></div>
      }

      @if (loading()) { <div class="text-sm text-gray-400 py-4 text-center">Loading…</div> }
      @else if (varieties().length === 0) { <div class="text-sm text-gray-400 py-4 text-center">Abhi koi variety nahi. Upar se add karo.</div> }
      @else {
        <div class="flex flex-col gap-3">
          @for (v of varieties(); track v.id) {
            <div class="border border-gray-200 rounded-lg p-3">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <span class="font-semibold text-[#5c1a8b]">{{ v.name }}</span>
                  @if (v.categoryName) { <span class="ml-2 text-[10px] px-2 py-0.5 bg-[#f0e6ff] text-[#5c1a8b] rounded">{{ v.categoryName }}</span> }
                  @if (v.dNo) { <span class="ml-2 text-xs text-gray-400">D.No: {{ v.dNo }}</span> }
                </div>
                <button type="button" (click)="delVariety(v)" class="text-xs text-red-600">🗑 Delete</button>
              </div>

              <!-- Photos -->
              <div class="flex gap-2 flex-wrap items-center mb-2">
                @for (p of v.photos; track p.id) {
                  <div class="relative">
                    <img [src]="img(p.url)" class="w-16 h-16 object-cover rounded border">
                    <button type="button" (click)="delPhoto(v, p.id)" class="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] leading-none">×</button>
                  </div>
                }
                <label class="w-16 h-16 border-2 border-dashed border-[#ddc8f5] rounded flex items-center justify-center cursor-pointer text-2xl text-gray-400 hover:bg-purple-50">
                  📷
                  <input type="file" accept="image/*" class="hidden" (change)="onPhoto(v, $event)">
                </label>
              </div>

              <!-- Rates -->
              <div class="flex flex-col gap-1">
                @for (r of v.rates; track r.id) {
                  <div class="flex items-center gap-2 text-sm">
                    <span class="font-mono">₹{{ r.rate | number:'1.0-2' }}/{{ r.unit }}</span>
                    @if (r.minQty) { <span class="text-xs text-gray-400">min {{ r.minQty }}</span> }
                    <button type="button" (click)="delRate(v, r.id)" class="text-xs text-red-500">×</button>
                  </div>
                }
                <div class="flex items-center gap-2 mt-1">
                  <input type="number" [(ngModel)]="rateInput[v.id]" placeholder="₹ Rate" class="input text-sm w-28">
                  <select [(ngModel)]="unitInput[v.id]" class="input text-sm w-24">
                    <option value="mtr">/mtr</option><option value="pcs">/pcs</option>
                    <option value="kg">/kg</option><option value="doz">/doz</option>
                  </select>
                  <button type="button" (click)="addRate(v)" class="btn-primary text-xs">+ Add Rate</button>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `
})
export class BuyerCatalogComponent {
  private svc = inject(BuyersService);
  private toast = inject(ToastService);
  @Input() buyerId!: string;
  @Input() catalogType: 'demand' | 'supply' = 'demand';
  @Input() categories: SupplierCategory[] = [];

  varieties = signal<BuyerVariety[]>([]);
  loading = signal(false);
  nameError = signal('');
  newCat = '';
  newCatName = '';
  newName = '';
  newDno = '';
  rateInput: Record<string, number | null> = {};
  unitInput: Record<string, string> = {};

  ngOnInit() { if (this.buyerId) this.load(); }

  img(url: string) { return url.startsWith('http') ? url : `${environment.apiUrl}${url}`; }

  /** Backend {error} ya generic message nikaalo — silent fail se bachne ke liye. */
  private msg(e: any, fallback: string) { return e?.error?.error ?? e?.message ?? fallback; }

  load() {
    this.loading.set(true);
    this.svc.listBuyerVarieties(this.buyerId, this.catalogType).subscribe({
      next: v => { this.varieties.set(v); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.toast.error(this.msg(e, 'Catalog load nahi hua')); }
    });
  }

  addVariety() {
    const name = this.newName.trim();
    // UX fix: empty naam par inline error (pehle silent return tha).
    if (!name) { this.nameError.set('Variety naam zaroori hai.'); return; }
    this.nameError.set('');
    let categoryId: string | null = null;
    let categoryName: string | null = null;
    if (this.newCat === '__custom') categoryName = this.newCatName.trim() || null;
    else if (this.newCat) {
      categoryId = this.newCat;
      categoryName = this.categories.find(c => c.id === this.newCat)?.name ?? null;
    }
    this.svc.addBuyerVariety(this.buyerId, { catalogType: this.catalogType, categoryId, categoryName, name, dNo: this.newDno.trim() || null })
      .subscribe({
        next: () => { this.newName = ''; this.newDno = ''; this.newCatName = ''; this.load(); },
        error: (e) => this.toast.error(this.msg(e, 'Variety add nahi hui'))   // UX fix: error surface
      });
  }

  delVariety(v: BuyerVariety) {
    if (!confirm(`Variety "${v.name}" delete karein?`)) return;
    this.svc.deleteBuyerVariety(v.id).subscribe({
      next: () => this.load(),
      error: (e) => this.toast.error(this.msg(e, 'Delete nahi hua'))
    });
  }

  addRate(v: BuyerVariety) {
    const rate = this.rateInput[v.id];
    if (rate == null || isNaN(rate)) { this.toast.error('Rate (₹) daalo.'); return; }
    this.svc.addBuyerVarietyRate(v.id, { rate, unit: this.unitInput[v.id] || 'mtr' })
      .subscribe({
        next: () => { this.rateInput[v.id] = null; this.load(); },
        error: (e) => this.toast.error(this.msg(e, 'Rate add nahi hua'))
      });
  }
  delRate(v: BuyerVariety, id: string) {
    this.svc.deleteBuyerVarietyRate(id).subscribe({
      next: () => this.load(),
      error: (e) => this.toast.error(this.msg(e, 'Rate delete nahi hua'))
    });
  }

  onPhoto(v: BuyerVariety, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.svc.uploadBuyerPhoto(v.id, file).subscribe({
      next: () => { input.value = ''; this.load(); },
      error: (e) => { input.value = ''; this.toast.error(this.msg(e, 'Photo upload nahi hui')); }   // UX fix
    });
  }
  delPhoto(v: BuyerVariety, id: string) {
    this.svc.deleteBuyerPhoto(id).subscribe({
      next: () => this.load(),
      error: (e) => this.toast.error(this.msg(e, 'Photo delete nahi hui'))
    });
  }
}
