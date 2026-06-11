import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SuppliersService, SupplierDetail, SupplierCategory } from '../services/suppliers.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-supplier-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DecimalPipe, BackButtonComponent],
  template: `
    <div class="max-w-5xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <a routerLink="/suppliers" class="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
          Back to Directory
        </a>
        @if (supplier(); as s) {
          <div class="flex gap-2">
            <a [routerLink]="['/suppliers', s.id, 'edit']" class="px-3 py-1.5 border border-[#5c1a8b] text-[#5c1a8b] rounded text-sm hover:bg-[#f0e6ff]">✏️ Edit</a>
            <button (click)="del()" class="px-3 py-1.5 border border-red-500 text-red-600 rounded text-sm hover:bg-red-50">🗑 Delete</button>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-500">Loading…</div>
      }
      @if (supplier(); as s) {

        <!-- Header card -->
        <div class="card mb-4">
          <div class="flex items-start gap-4">
            <div class="w-20 h-20 rounded-xl bg-gradient-to-br from-[#f0e6ff] to-[#ddc8f5] flex items-center justify-center text-3xl flex-shrink-0">
              @if (s.photos[0]) {
                <img [src]="s.photos[0].storageUrl" class="w-full h-full object-cover rounded-xl">
              } @else { 🏭 }
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-1">
                <h1 class="font-display font-black text-2xl text-[#5c1a8b]">{{ s.displayName }}</h1>
                <span class="font-mono text-xs bg-[#f0e6ff] text-[#5c1a8b] px-2 py-0.5 rounded">{{ s.supplierCode }}</span>
              </div>
              @if (s.legalName) { <div class="text-sm text-gray-600">{{ s.legalName }}</div> }
              <div class="flex flex-wrap gap-3 text-sm text-[#6b3fa0] mt-2">
                @if (s.businessType) { <span>🏷 {{ s.businessType }}</span> }
                @if (s.city) { <span>📍 {{ s.city }}, {{ s.state }}</span> }
                @if (s.gst) { <span class="font-mono">📋 {{ s.gst }}</span> }
              </div>
              @if (s.phone || s.waPhone) {
                <div class="flex gap-2 mt-3">
                  @if (s.phone) {
                    <a [href]="'tel:' + s.phone" class="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">📞 {{ s.phone }}</a>
                  }
                  @if (s.waPhone) {
                    <a [href]="waLink(s.waPhone)" target="_blank"
                       class="text-xs px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">💬 WhatsApp</a>
                  }
                  @if (s.email) {
                    <a [href]="'mailto:' + s.email" class="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">✉ {{ s.email }}</a>
                  }
                </div>
              }
            </div>
          </div>

          @if (s.categories.length > 0) {
            <div class="flex gap-1 flex-wrap mt-4 pt-3 border-t">
              @for (cat of s.categories; track cat) {
                <span class="px-2 py-1 bg-[#f0e6ff] text-[#5c1a8b] rounded text-xs font-semibold">{{ cat }}</span>
              }
            </div>
          }
        </div>

        <!-- Stats row -->
        <div class="grid grid-cols-4 gap-3 mb-4">
          <div class="card text-center" style="border-left:4px solid #16a34a; background:#16a34a0d;">
            <div class="text-2xl mb-1">⭐</div>
            <div class="text-xl font-bold" style="color:#16a34a;">{{ s.reliabilityScore ? s.reliabilityScore + '/5' : '—' }}</div>
            <div class="text-xs text-gray-500">Reliability</div>
          </div>
          <div class="card text-center" style="border-left:4px solid #0284c7; background:#0284c70d;">
            <div class="text-2xl mb-1">🚚</div>
            <div class="text-xl font-bold" style="color:#0284c7;">{{ s.deliveryLeadDays ? s.deliveryLeadDays + ' days' : '—' }}</div>
            <div class="text-xs text-gray-500">Lead Time</div>
          </div>
          <div class="card text-center" style="border-left:4px solid #d97706; background:#d977060d;">
            <div class="text-2xl mb-1">💰</div>
            <div class="text-xl font-bold font-mono" style="color:#d97706;">
              {{ s.minOrderValue ? '₹' + (s.minOrderValue | number:'1.0-0') : '—' }}
            </div>
            <div class="text-xs text-gray-500">Min Order</div>
          </div>
          <div class="card text-center" style="border-left:4px solid #9333ea; background:#9333ea0d;">
            <div class="text-2xl mb-1">📷</div>
            <div class="text-xl font-bold" style="color:#9333ea;">{{ s.photos.length }}</div>
            <div class="text-xs text-gray-500">Photos</div>
          </div>
        </div>

        <!-- Photos -->
        <div class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-display font-bold text-lg text-[#5c1a8b]">📷 Product Photos</h3>
            <button (click)="showAddPhoto.set(true)" class="text-sm text-[#5c1a8b] hover:underline">+ Add Photo</button>
          </div>

          @if (s.photos.length === 0) {
            <div class="text-center py-8 text-gray-400">
              No photos yet. <button (click)="showAddPhoto.set(true)" class="text-[#5c1a8b] underline">Add first photo</button>
            </div>
          } @else {
            <div class="grid grid-cols-4 gap-3">
              @for (p of s.photos; track p.id) {
                <div class="relative group">
                  <div class="aspect-square rounded-lg bg-[#f0e6ff] overflow-hidden">
                    <img [src]="p.storageUrl" [alt]="p.title" class="w-full h-full object-cover">
                  </div>
                  @if (p.title || p.rate) {
                    <div class="mt-1 text-xs">
                      @if (p.title) { <div class="font-semibold truncate">{{ p.title }}</div> }
                      @if (p.rate) {
                        <div class="font-mono text-[#5c1a8b]">₹{{ p.rate | number:'1.2-2' }} / {{ p.rateUnit }}</div>
                      }
                    </div>
                  }
                  <button (click)="deletePhoto(p.id)"
                          class="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition text-xs">×</button>
                </div>
              }
            </div>
          }

          <!-- Add photo modal -->
          @if (showAddPhoto()) {
            <div class="mt-4 border-t pt-4">
              <h4 class="text-sm font-bold mb-2">Add Photo (paste image URL)</h4>
              <div class="grid grid-cols-2 gap-2">
                <input [(ngModel)]="newPhotoUrl" placeholder="https://example.com/photo.jpg" class="input col-span-2">
                <input [(ngModel)]="newPhotoTitle" placeholder="Title (e.g., Design 3030)" class="input">
                <div class="flex gap-2">
                  <input [(ngModel)]="newPhotoRate" type="number" placeholder="Rate" class="input flex-1">
                  <input [(ngModel)]="newPhotoUnit" placeholder="mtr" class="input w-20">
                </div>
              </div>
              <div class="flex justify-end gap-2 mt-2">
                <button (click)="showAddPhoto.set(false)" class="text-sm px-3 py-1 border rounded">Cancel</button>
                <button (click)="addPhoto()" class="btn-primary text-sm py-1">Add Photo</button>
              </div>
            </div>
          }
        </div>

        <!-- Rates -->
        <div class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-display font-bold text-lg text-[#5c1a8b]">💰 Rates per Category</h3>
            <button (click)="showAddRate.set(true)" class="text-sm text-[#5c1a8b] hover:underline">+ Add Rate</button>
          </div>

          @if (s.rates.length === 0) {
            <div class="text-center py-6 text-gray-400">
              No rates set
            </div>
          } @else {
            <table class="w-full text-sm">
              <thead class="text-xs uppercase text-gray-500">
                <tr><th class="text-left">Category</th><th class="text-right">Rate</th><th class="text-right">Min Qty</th><th></th></tr>
              </thead>
              <tbody>
                @for (r of s.rates; track r.id) {
                  <tr class="border-t">
                    <td class="py-2">{{ r.categoryName }}</td>
                    <td class="py-2 text-right font-mono font-bold">₹{{ r.rate | number:'1.2-2' }} / {{ r.rateUnit }}</td>
                    <td class="py-2 text-right">{{ r.minQty ?? '—' }}</td>
                    <td class="py-2 text-right">
                      <button (click)="deleteRate(r.id)" class="text-red-500 text-xs hover:underline">Delete</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }

          @if (showAddRate()) {
            <div class="mt-4 border-t pt-4 grid grid-cols-4 gap-2">
              <select [(ngModel)]="newRateCategoryId" class="input">
                <option value="">— Category —</option>
                @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
              </select>
              <input [(ngModel)]="newRateAmount" type="number" placeholder="Rate" class="input">
              <input [(ngModel)]="newRateUnit" placeholder="mtr" class="input">
              <button (click)="addRate()" class="btn-primary text-sm py-1">+ Add</button>
            </div>
          }
        </div>

        @if (s.notes) {
          <div class="card">
            <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase mb-2">Notes</h3>
            <p class="text-sm">{{ s.notes }}</p>
          </div>
        }
      }
    </div>
  `
})
export class SupplierDetailComponent {
  private svc = inject(SuppliersService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  supplier = signal<SupplierDetail | null>(null);
  categories = signal<SupplierCategory[]>([]);
  loading = signal(true);
  showAddPhoto = signal(false);

  waLink(phone: string | null | undefined): string {
    return 'https://wa.me/' + (phone || '').replace(/[^0-9]/g, '');
  }
  showAddRate = signal(false);

  newPhotoUrl = '';
  newPhotoTitle = '';
  newPhotoRate: number | null = null;
  newPhotoUnit = 'mtr';

  newRateCategoryId = '';
  newRateAmount: number | null = null;
  newRateUnit = 'mtr';

  async ngOnInit() {
    this.svc.listCategories().subscribe(c => this.categories.set(c));
    const id = this.route.snapshot.paramMap.get('id');
    if (id) await this.reload(id);
  }

  async reload(id: string) {
    this.loading.set(true);
    const s = await firstValueFrom(this.svc.get(id));
    this.supplier.set(s);
    this.loading.set(false);
  }

  async addPhoto() {
    if (!this.newPhotoUrl || !this.supplier()) return;
    await firstValueFrom(this.svc.addPhoto(this.supplier()!.id, {
      storageUrl: this.newPhotoUrl,
      title: this.newPhotoTitle || undefined,
      rate: this.newPhotoRate ?? undefined,
      rateUnit: this.newPhotoUnit
    }));
    this.newPhotoUrl = '';
    this.newPhotoTitle = '';
    this.newPhotoRate = null;
    this.showAddPhoto.set(false);
    await this.reload(this.supplier()!.id);
  }

  async deletePhoto(id: string) {
    if (!confirm('Delete this photo?')) return;
    await firstValueFrom(this.svc.deletePhoto(id));
    await this.reload(this.supplier()!.id);
  }

  async addRate() {
    if (!this.newRateAmount || !this.supplier()) return;
    const cat = this.categories().find(c => c.id === this.newRateCategoryId);
    await firstValueFrom(this.svc.addRate(this.supplier()!.id, {
      categoryId: this.newRateCategoryId || undefined,
      categoryName: cat?.name,
      rate: this.newRateAmount,
      rateUnit: this.newRateUnit
    }));
    this.newRateCategoryId = '';
    this.newRateAmount = null;
    this.showAddRate.set(false);
    await this.reload(this.supplier()!.id);
  }

  async deleteRate(id: string) {
    if (!confirm('Delete this rate?')) return;
    await firstValueFrom(this.svc.deleteRate(id));
    await this.reload(this.supplier()!.id);
  }

  async del() {
    if (!this.supplier() || !confirm('Deactivate this supplier?')) return;
    await firstValueFrom(this.svc.delete(this.supplier()!.id));
    this.router.navigate(['/suppliers']);
  }
}
