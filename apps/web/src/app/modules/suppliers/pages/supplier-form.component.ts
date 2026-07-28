import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SuppliersService, SupplierCategory, DuplicateMatch, LinkableContact } from '../services/suppliers.service';
import { BuyersService } from '../services/buyers.service';
import { debounceTime } from 'rxjs/operators';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { SupplierCatalogComponent } from './supplier-catalog.component';
import { INDIAN_STATES, citiesForState, matchIndiaState } from '../../../shared/india-data';
import { IndiaPincodeService } from '../../../shared/india-pincode.service';

import { UppercaseDirective } from '../../../shared/uppercase.directive';
@Component({
  selector: 'app-supplier-form',
  standalone: true,
  imports: [UppercaseDirective, CommonModule, ReactiveFormsModule, FormsModule, RouterLink, BackButtonComponent, SupplierCatalogComponent],
  template: `
    <div class="max-w-3xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">
            {{ editingId ? '✏️ Edit Supplier' : '+ Add New Supplier' }}
            <!-- TYPE tag — supplier hai ya DONO (buyer directory me bhi wahi contact) -->
            @if (editingId) {
              @if (isAlsoBuyer()) {
                <span class="align-middle ml-2 px-2 py-0.5 rounded text-xs font-bold bg-[#5c1a8b] text-white"
                      title="Ye Supplier BHI hai aur Buyer BHI (dono directory me)">🔁 DONO</span>
              } @else {
                <span class="align-middle ml-2 px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">SUPPLIER</span>
                <!-- Ek click me isi contact ko Buyer directory me bhi jodo → DONO -->
                <button type="button" (click)="makeBuyerToo()" [disabled]="makingBuyer()"
                        class="align-middle ml-2 px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 border border-green-300"
                        title="Isi contact ko Buyer directory me bhi jodo — naam/GST/phone wahi rahega, duplicate nahi banega">
                  {{ makingBuyer() ? '...' : '➕ Buyer bhi banao' }}
                </button>
              }
            }
          </h2>
          <p class="text-sm text-[#6b3fa0]">Vendor / Manufacturer / Trader details</p>
        </div>
        <a routerLink="/suppliers" class="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
          Back to Directory
        </a>
      </div>

      <!-- 📇 CORE MASTER / TRADING se seedha laao — dobara typing nahi (sirf naya add karte waqt) -->
      @if (!editingId) {
        <div class="card mb-4" style="background:#faf7ff;border:1.5px dashed #b794d4">
          <div class="text-sm font-bold text-[#5c1a8b] mb-2">📇 Core Master / Trading me pehle se hai? Yahan se dhundo — ek click me ban jayega</div>
          <input [(ngModel)]="existSearch" [ngModelOptions]="{standalone: true}" (input)="onExistSearch()"
                 type="text" placeholder="🔍 Naam / phone / GST likho (kam se kam 2 akshar)..." class="input w-full">
          @if (existResults().length) {
            <div class="mt-2 overflow-y-auto" style="max-height:230px">
              @for (c of existResults(); track c.contactId) {
                <div class="flex items-center justify-between border-b border-[#eee] py-1.5 gap-2">
                  <div class="min-w-0">
                    <span class="font-semibold text-sm">{{ c.displayName }}</span>
                    @if (c.tradingType) {
                      <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                            [class]="c.tradingType === 'buyer' ? 'bg-green-100 text-green-700'
                                   : c.tradingType === 'seller' ? 'bg-blue-100 text-blue-700'
                                   : 'bg-purple-100 text-purple-700'">
                        Trading: {{ c.tradingType === 'seller' ? 'SUPPLIER' : c.tradingType === 'both' ? 'DONO' : 'BUYER' }}
                      </span>
                    }
                    <div class="text-xs text-gray-500 truncate">{{ c.phone || '—' }} · {{ c.gst || 'No GST' }} · {{ c.city || '' }}</div>
                  </div>
                  <button type="button" (click)="pickExisting(c)" [disabled]="picking() === c.contactId"
                          class="btn-primary text-xs px-3 py-1 shrink-0">
                    {{ picking() === c.contactId ? '...' : '+ Supplier banao' }}
                  </button>
                </div>
              }
            </div>
          } @else if (existSearch.trim().length >= 2 && existSearched()) {
            @if (existDone().length) {
              <div class="text-xs text-green-700 mt-2 font-semibold">
                ✓ "{{ existDone()[0] }}" pehle se SUPPLIER ban chuka hai — Suppliers list me dekho.
              </div>
            } @else {
              <div class="text-xs text-gray-500 mt-2">Koi nahi mila — neeche naya bhar lo. 👇</div>
            }
          }
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="save()" class="card flex flex-col gap-4">

        @if (editingId && contactId) {
          <div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex items-center justify-between">
            <span>🔒 Naam / Phone / GST common data hai — yahan lock hai. Badalne ke liye Core Master me jao.</span>
            <a [routerLink]="['/core-master', contactId]" class="font-bold text-[#5c1a8b] underline whitespace-nowrap ml-2">🗂️ Edit in Core Master</a>
          </div>
        }

        <!-- Live duplicate-check warning -->
        @if (duplicates().length) {
          <div class="bg-orange-50 border border-orange-300 rounded-lg px-3 py-2 text-xs text-orange-800">
            <div class="font-bold mb-1">⚠️ Milti-julti party pehle se directory me hai:</div>
            <ul class="list-disc ml-5 space-y-0.5">
              @for (d of duplicates(); track d.id) {
                <li>
                  <a [routerLink]="['/suppliers', d.id]" class="font-bold underline">{{ d.displayName }}</a>
                  <span class="text-orange-600">
                    — {{ d.matchOn === 'gst' ? 'GST' : 'Mobile' }} match
                    @if (d.gst) { · {{ d.gst }} }
                    @if (d.phone) { · {{ d.phone }} }
                  </span>
                </li>
              }
            </ul>
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
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">Owner / Proprietor Name</label>
            <input formControlName="ownerName" class="input" placeholder="Sampark vyakti ka naam">
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
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">Website</label>
            <input formControlName="website" class="input" placeholder="https://example.com">
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">GST Number</label>
            <input appUpper formControlName="gst" class="input font-mono uppercase" maxlength="15"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">PAN</label>
            <input appUpper formControlName="pan" class="input font-mono uppercase" maxlength="10"
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

        <!-- RATE RANGE -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider mt-2">Rate Range</h3>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="text-xs font-bold text-[#6b3fa0] uppercase">Min (₹)</label>
            <input formControlName="rateMin" type="number" min="0" class="input" placeholder="0"></div>
          <div><label class="text-xs font-bold text-[#6b3fa0] uppercase">Max (₹)</label>
            <input formControlName="rateMax" type="number" min="0" class="input" placeholder="0"></div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase">Unit</label>
            <select formControlName="rateUnit" class="input">
              <option value="mtr">Per Meter</option>
              <option value="pc">Per Piece</option>
              <option value="kg">Per Kg</option>
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
  private buyersSvc = inject(BuyersService);
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
  isAlsoBuyer = signal(false);   // same contact Buyer Directory me bhi — header ka "DONO" tag
  makingBuyer = signal(false);

  // ---- Core Master/Trading se seedha laao (Add mode ka searchable picker) ----
  existSearch = '';
  existResults = signal<LinkableContact[]>([]);
  existDone = signal<string[]>([]);   // jo pehle se Supplier ban chuke — naam dikhane ko
  existSearched = signal(false);
  picking = signal<string | null>(null);
  private existTimer: any;
  onExistSearch() {
    clearTimeout(this.existTimer);
    const q = this.existSearch.trim();
    if (q.length < 2) { this.existResults.set([]); this.existSearched.set(false); return; }
    this.existTimer = setTimeout(() => {
      this.svc.listLinkable(q).subscribe({
        next: l => {
          // Jo pehle se bazaar-supplier hai use chhupao; Trading ke SUPPLIER/DONO upar dikhao
          const rank = (c: LinkableContact) =>
            c.tradingType === 'seller' ? 0 : c.tradingType === 'both' ? 1 : c.tradingType === 'buyer' ? 3 : 2;
          this.existResults.set(l.filter(c => !c.isBazaarSupplier).sort((a, b) => rank(a) - rank(b)));
          // "Ban chuka hai" wale alag batao — warna "koi nahi mila" se lagta hai kho gaya
          this.existDone.set(l.filter(c => !!c.isBazaarSupplier).map(c => c.displayName));
          this.existSearched.set(true);
        },
        error: () => { this.existResults.set([]); this.existSearched.set(true); }
      });
    }, 350);
  }
  pickExisting(c: LinkableContact) {
    if (this.picking()) return;
    this.picking.set(c.contactId);
    this.svc.addFromContact(c.contactId).subscribe({
      next: (res: any) => {
        this.picking.set(null);
        alert(`✅ ${c.displayName} Supplier ban gaya!\nAb category/rate waghairah bhar lo.`);
        this.router.navigate(['/suppliers', res.id, 'edit']);
      },
      error: (e) => { this.picking.set(null); alert('⚠️ ' + (e?.error?.error ?? 'Add nahi hua — dobara try karo')); }
    });
  }

  // Ek-click: isi contact ko Buyer directory me bhi jodo (wahi contact, duplicate nahi)
  makeBuyerToo() {
    if (!this.contactId || this.makingBuyer()) return;
    if (!confirm('Is supplier ko BUYER directory me bhi jodna hai?\n(Budget/Category baad me Buyer edit se bhar sakte ho)')) return;
    this.makingBuyer.set(true);
    this.buyersSvc.addFromContact(this.contactId).subscribe({
      next: () => {
        this.makingBuyer.set(false);
        this.isAlsoBuyer.set(true);
        alert('✅ Buyer directory me jud gaya — ab ye DONO hai.\nBudget/Category set karne ke liye Buyers list me edit kholo (khali = sab rate/category me interest).');
      },
      error: (e) => { this.makingBuyer.set(false); alert('⚠️ ' + (e?.error?.error ?? 'Jud nahi paya — dobara try karo')); }
    });
  }
  saving = signal(false);
  error = signal('');
  categories = signal<SupplierCategory[]>([]);
  selectedCategoryIds = signal<string[]>([]);

  // Common fields lock tabhi jab edit + linked contact (Phase 2).
  lockCommon = () => !!(this.editingId && this.contactId);

  form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    legalName: [''],
    ownerName: [''],
    phone: [''],
    waPhone: [''],
    waBuyer: [''],
    email: [''],
    website: [''],
    gst: [''],
    pan: [''],
    address: [''],
    city: [''],
    state: [''],
    pincode: [''],
    businessType: ['manufacturer'],
    rateMin: [null as number | null],
    rateMax: [null as number | null],
    rateUnit: ['mtr'],
    gpsLocation: [''],
    notes: ['']
  });

  // ===== Live duplicate-check (debounced) =====
  duplicates = signal<DuplicateMatch[]>([]);

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

    // Live duplicate-check — GST ya mobile badle to ~500ms baad check karo.
    this.form.controls.gst.valueChanges.pipe(debounceTime(500)).subscribe(() => this.runDuplicateCheck());
    this.form.controls.phone.valueChanges.pipe(debounceTime(500)).subscribe(() => this.runDuplicateCheck());

    this.editingId = this.route.snapshot.paramMap.get('id');
    if (this.editingId) {
      this.svc.get(this.editingId).subscribe(s => {
        this.contactId = s.contactId;
        this.isAlsoBuyer.set(!!(s as any).isAlsoBuyer);
        this.form.patchValue({
          displayName: s.displayName,
          legalName: s.legalName ?? '',
          ownerName: (s as any).ownerName ?? '',
          phone: s.phone ?? '',
          waPhone: s.waPhone ?? '',
          waBuyer: s.waBuyer ?? '',
          email: s.email ?? '',
          website: (s as any).website ?? '',
          gst: s.gst ?? '',
          pan: s.pan ?? '',
          address: s.address ?? '',
          city: s.city ?? '',
          state: s.state ?? '',
          pincode: s.pincode ?? '',
          businessType: s.businessType ?? 'manufacturer',
          rateMin: (s as any).rateMin ?? null,
          rateMax: (s as any).rateMax ?? null,
          rateUnit: s.rateUnit ?? 'mtr',
          gpsLocation: (s as any).gpsLocation ?? '',
          notes: s.notes ?? ''
        });
        this.selectedCategoryIds.set(s.categoryIds);
        // City bhari ho aur pincode khali — auto le aao (lock ho to skip hota hai)
        setTimeout(() => this.onCityInput());
      });
    }
  }

  /** GST/mobile par live duplicate-check — matches mile to warning banner dikhao. */
  private runDuplicateCheck() {
    const gst = (this.form.value.gst || '').trim();
    const phone = (this.form.value.phone || '').trim();
    if (!gst && !phone) { this.duplicates.set([]); return; }
    this.svc.checkDuplicate({
      gst: gst || undefined,
      phone: phone || undefined,
      excludeId: this.editingId || undefined
    }).subscribe({
      next: (m) => this.duplicates.set(m),
      error: () => this.duplicates.set([])
    });
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
