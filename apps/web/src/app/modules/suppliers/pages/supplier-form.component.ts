import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SuppliersService, SupplierCategory } from '../services/suppliers.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { SupplierCatalogComponent } from './supplier-catalog.component';
import { INDIAN_STATES, citiesForState, matchIndiaState } from '../../../shared/india-data';
import { IndiaPincodeService } from '../../../shared/india-pincode.service';

@Component({
  selector: 'app-supplier-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink, BackButtonComponent, SupplierCatalogComponent],
  template: `
    <div class="max-w-3xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">
            {{ editingId ? '✏️ Edit Supplier' : '+ Add New Supplier' }}
          </h2>
          <p class="text-sm text-[#6b3fa0]">Vendor / Manufacturer / Trader details</p>
        </div>
        <a routerLink="/suppliers" class="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
          Back to Directory
        </a>
      </div>

      <form [formGroup]="form" (ngSubmit)="save()" class="card flex flex-col gap-4">

        @if (editingId && contactId) {
          <div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex items-center justify-between">
            <span>🔒 Naam / Phone / GST common data hai — yahan lock hai. Badalne ke liye Core Master me jao.</span>
            <a [routerLink]="['/core-master', contactId]" class="font-bold text-[#5c1a8b] underline whitespace-nowrap ml-2">🗂️ Edit in Core Master</a>
          </div>
        }

        <!-- COMMON BLOCK (Core Master / Trading / AD — same) -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider">Common Details</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">Display / Business Name *</label>
            <input formControlName="displayName" class="input" placeholder="e.g., Parvati Export"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">Legal Name</label>
            <input formControlName="legalName" class="input" placeholder="Parvati Export Pvt Ltd"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">Phone</label>
            <input formControlName="phone" class="input" placeholder="+91 98765 43210"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">WhatsApp – Supplier</label>
            <input formControlName="waPhone" class="input" placeholder="Bechne wala no.">
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">WhatsApp – Buyer</label>
            <input formControlName="waBuyer" class="input" placeholder="Khareedne wala no.">
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">Email</label>
            <input formControlName="email" type="email" class="input"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">GST Number</label>
            <input formControlName="gst" class="input font-mono uppercase" maxlength="15"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">PAN</label>
            <input formControlName="pan" class="input font-mono uppercase" maxlength="10"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
        </div>

        <!-- Address -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider mt-2">Address</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">Address Line</label>
            <input formControlName="address" class="input" [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div><label class="text-xs font-bold text-[#6b3fa0] uppercase">Pincode <small class="text-gray-400 normal-case">(city/state auto)</small></label>
            <input formControlName="pincode" class="input" maxlength="6" (input)="onPincodeInput()"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()"></div>
          <div><label class="text-xs font-bold text-[#6b3fa0] uppercase">State</label>
            @if (lockCommon()) {
              <input formControlName="state" class="input bg-gray-100" readonly>
            } @else {
              <select formControlName="state" class="input">
                <option value="">— Select —</option>
                @for (s of indiaStates; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
              </select>
            }
          </div>
          <div><label class="text-xs font-bold text-[#6b3fa0] uppercase">City</label>
            <input formControlName="city" class="input" list="supCityList" (change)="onCityInput()"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
            <datalist id="supCityList">
              @for (c of cityOptions(); track c) { <option [value]="c"></option> }
            </datalist>
          </div>
          <!-- GPS location capture -->
          <div class="col-span-2 flex items-end gap-3">
            <div class="flex-1">
              <label class="text-xs font-bold text-[#6b3fa0] uppercase">📍 GPS Location (optional)</label>
              <input formControlName="gpsLocation" class="input" placeholder="Get current location se auto-fill hoga" readonly>
            </div>
            <button type="button" (click)="getCurrentLocation()" [disabled]="gpsLoading()"
                    class="btn-primary whitespace-nowrap">
              {{ gpsLoading() ? '📍 Getting…' : '📍 Get Current Location' }}
            </button>
          </div>
        </div>

        <!-- SUPPLIER DETAILS (AD-specific) -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider mt-2">Supplier Details</h3>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">Business Type</label>
            <select formControlName="businessType" class="input">
              <option value="manufacturer">Manufacturer</option>
              <option value="trader">Trader</option>
              <option value="wholesaler">Wholesaler</option>
              <option value="broker">Broker</option>
            </select>
          </div>
        </div>

        <!-- Categories selector + custom add (Favorites/Custom) -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider mt-2">
          Categories ({{ selectedCategoryIds().length }} selected)
        </h3>
        <div class="border border-[#ddc8f5] rounded-lg p-3 max-h-56 overflow-y-auto">
          <div class="flex gap-2 mb-2">
            <input [(ngModel)]="newCategoryName" [ngModelOptions]="{standalone:true}"
                   class="input flex-1" placeholder="Naya category likhein (Custom / Other)…">
            <button type="button" (click)="addCustomCategory()" class="btn-primary whitespace-nowrap">+ Add</button>
          </div>
          <div class="grid grid-cols-3 gap-1">
            @for (c of categories(); track c.id) {
              <label class="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#f0e6ff] cursor-pointer text-sm">
                <input type="checkbox"
                       [checked]="selectedCategoryIds().includes(c.id)"
                       (change)="toggleCategory(c.id)">
                {{ c.name }}
              </label>
            }
          </div>
        </div>

        <!-- Notes -->
        <div>
          <label class="text-xs font-bold text-[#6b3fa0] uppercase">Notes</label>
          <textarea formControlName="notes" rows="2" class="input" placeholder="Additional notes about this supplier"></textarea>
        </div>

        <!-- PRODUCT CATALOG (varieties + rates + photos) -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider mt-2">📦 Product Catalog</h3>
        @if (editingId) {
          <app-supplier-catalog [supplierId]="editingId!" [categories]="categories()"></app-supplier-catalog>
        } @else {
          <div class="border border-dashed border-[#ddc8f5] rounded-lg p-4 text-center text-sm text-gray-500">
            Variety + photo + rate add karne ke liye pehle supplier <b>Create</b> karo — fir edit me catalog khulega.
          </div>
        }

        @if (error()) {
          <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{{ error() }}</div>
        }

        <div class="flex justify-end gap-2 border-t pt-4">
          <a routerLink="/suppliers" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</a>
          <button type="submit" class="btn-primary" [disabled]="form.invalid || saving()">
            {{ saving() ? 'Saving…' : (editingId ? 'Update Supplier' : 'Create Supplier') }}
          </button>
        </div>
      </form>
    </div>
  `
})
export class SupplierFormComponent {
  private svc = inject(SuppliersService);
  private fb = inject(FormBuilder);
  private pinSvc = inject(IndiaPincodeService);

  // ===== India location helpers =====
  indiaStates = INDIAN_STATES;
  cityOptions(): string[] { return citiesForState(this.form?.value?.state || ''); }

  onPincodeInput() {
    if (this.lockCommon()) return;
    const p = (this.form.value.pincode || '').replace(/\D/g, '');
    if (p.length !== 6) return;
    this.pinSvc.byPin(p).subscribe({
      next: (res) => {
        const po = this.pinSvc.firstPo(res);
        if (!po) return;
        this.form.patchValue({
          city: po.District || this.form.value.city,
          state: matchIndiaState(po.State) || this.form.value.state
        });
      },
      error: () => {}
    });
  }

  onCityInput() {
    if (this.lockCommon()) return;
    const city = (this.form.value.city || '').trim();
    if (!city || (this.form.value.pincode || '').length === 6) return;
    this.pinSvc.byCity(city).subscribe({
      next: (res) => {
        const po = this.pinSvc.firstPo(res, this.form.value.state || undefined);
        if (!po) return;
        this.form.patchValue({
          pincode: po.Pincode || this.form.value.pincode,
          state: this.form.value.state || matchIndiaState(po.State)
        });
      },
      error: () => {}
    });
  }
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  editingId: string | null = null;
  contactId: string | null = null;
  saving = signal(false);
  error = signal('');
  categories = signal<SupplierCategory[]>([]);
  selectedCategoryIds = signal<string[]>([]);

  // Common fields lock tabhi jab edit + linked contact (Phase 2).
  lockCommon = () => !!(this.editingId && this.contactId);

  form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    legalName: [''],
    phone: [''],
    waPhone: [''],
    waBuyer: [''],
    email: [''],
    gst: [''],
    pan: [''],
    address: [''],
    city: [''],
    state: [''],
    pincode: [''],
    businessType: ['manufacturer'],
    gpsLocation: [''],
    notes: ['']
  });

  gpsLoading = signal(false);

  /** Capture device GPS and fill lat,long into the form (works on https / localhost). */
  getCurrentLocation() {
    if (!navigator.geolocation) {
      this.error.set('Is device/browser par GPS available nahi hai.');
      return;
    }
    this.gpsLoading.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        this.form.patchValue({ gpsLocation: `${lat}, ${lng}` });
        this.gpsLoading.set(false);
      },
      (err) => {
        this.error.set('Location nahi mili. Browser me location permission allow karein.');
        this.gpsLoading.set(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async ngOnInit() {
    this.svc.listCategories().subscribe(c => this.categories.set(c));

    this.editingId = this.route.snapshot.paramMap.get('id');
    if (this.editingId) {
      this.svc.get(this.editingId).subscribe(s => {
        this.contactId = s.contactId;
        this.form.patchValue({
          displayName: s.displayName,
          legalName: s.legalName ?? '',
          phone: s.phone ?? '',
          waPhone: s.waPhone ?? '',
          waBuyer: s.waBuyer ?? '',
          email: s.email ?? '',
          gst: s.gst ?? '',
          pan: s.pan ?? '',
          address: s.address ?? '',
          city: s.city ?? '',
          state: s.state ?? '',
          pincode: s.pincode ?? '',
          businessType: s.businessType ?? 'manufacturer',
          gpsLocation: (s as any).gpsLocation ?? '',
          notes: s.notes ?? ''
        });
        this.selectedCategoryIds.set(s.categoryIds);
        // City bhari ho aur pincode khali — auto le aao (lock ho to skip hota hai)
        setTimeout(() => this.onCityInput());
      });
    }
  }

  toggleCategory(id: string) {
    this.selectedCategoryIds.update(arr =>
      arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
    );
  }

  // Custom / Other — nayi category banao aur turant select kar lo.
  newCategoryName = '';
  addCustomCategory() {
    const name = this.newCategoryName.trim();
    if (!name) return;
    // pehle se hai to bas select
    const existing = this.categories().find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!this.selectedCategoryIds().includes(existing.id)) this.toggleCategory(existing.id);
      this.newCategoryName = '';
      return;
    }
    this.svc.createCategory(name).subscribe({
      next: (c) => {
        this.categories.update(arr => [...arr, c]);
        this.selectedCategoryIds.update(arr => [...arr, c.id]);
        this.newCategoryName = '';
      },
      error: (e) => this.error.set(e?.error?.error ?? 'Category add nahi hui')
    });
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');

    const data = {
      ...this.form.getRawValue(),
      categoryIds: this.selectedCategoryIds()
    } as any;

    const obs = this.editingId
      ? this.svc.update(this.editingId, data)
      : this.svc.create(data);

    obs.subscribe({
      next: (s) => this.router.navigate(['/suppliers', s.id]),
      error: (e) => {
        this.error.set(e?.error?.error ?? 'Failed to save');
        this.saving.set(false);
      }
    });
  }
}
