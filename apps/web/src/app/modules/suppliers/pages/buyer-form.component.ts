import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BuyersService, BuyerDuplicateMatch } from '../services/buyers.service';
import { SuppliersService, SupplierCategory, LinkableContact } from '../services/suppliers.service';
import { debounceTime } from 'rxjs/operators';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';
import { BuyerCatalogComponent } from './buyer-catalog.component';
import { INDIAN_STATES, citiesForState, matchIndiaState } from '../../../shared/india-data';
import { IndiaPincodeService } from '../../../shared/india-pincode.service';

import { UppercaseDirective } from '../../../shared/uppercase.directive';
@Component({
  selector: 'app-buyer-form',
  standalone: true,
  imports: [UppercaseDirective, CommonModule, ReactiveFormsModule, FormsModule, RouterLink, BackButtonComponent, BuyerCatalogComponent],
  template: `
    <div class="max-w-3xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="mb-4">
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">
          {{ editingId ? '✏️ Edit Buyer' : '+ Add New Buyer' }}
          <!-- TYPE tag — buyer hai ya DONO (supplier directory me bhi wahi contact) -->
          @if (editingId) {
            @if (isAlsoSupplier()) {
              <span class="align-middle ml-2 px-2 py-0.5 rounded text-xs font-bold bg-[#5c1a8b] text-white"
                    title="Ye Buyer BHI hai aur Supplier BHI (dono directory me)">🔁 DONO</span>
            } @else {
              <span class="align-middle ml-2 px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">BUYER</span>
              <!-- Ek click me isi contact ko Supplier directory me bhi jodo → DONO -->
              <button type="button" (click)="makeSupplierToo()" [disabled]="makingSupplier()"
                      class="align-middle ml-2 px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300"
                      title="Isi contact ko Supplier directory me bhi jodo — naam/GST/phone wahi rahega, duplicate nahi banega">
                {{ makingSupplier() ? '...' : '➕ Supplier bhi banao' }}
              </button>
            }
          }
        </h2>
        <p class="text-sm text-[#6b3fa0]">Customer / Boutique / Reseller details</p>
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
                    {{ picking() === c.contactId ? '...' : '+ Buyer banao' }}
                  </button>
                </div>
              }
            </div>
          } @else if (existSearch.trim().length >= 2 && existSearched()) {
            @if (existDone().length) {
              <div class="text-xs text-green-700 mt-2 font-semibold">
                ✓ "{{ existDone()[0] }}" pehle se BUYER ban chuka hai — Buyers tab me dekho.
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
                  <a [routerLink]="['/suppliers/buyers', d.id]" class="font-bold underline">{{ d.displayName }}</a>
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

        <!-- Basic -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider">Basic Info</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="lbl">Buyer / Business Name *</label>
            <input formControlName="displayName" class="input" placeholder="e.g. Style Boutique"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="lbl">Legal Name</label>
            <input formControlName="legalName" class="input"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="lbl">Contact Person</label>
            <input formControlName="ownerName" class="input" placeholder="Sampark vyakti ka naam">
          </div>
          <div>
            <label class="lbl">Buyer Type</label>
            <select formControlName="buyerType" class="input">
              <option value="">— Select —</option>
              <option value="boutique">Boutique</option>
              <option value="retailer">Retailer</option>
              <option value="wholesaler">Wholesaler</option>
              <option value="designer">Designer</option>
              <option value="online_store">Online Store</option>
              <option value="bulk_buyer">Bulk Buyer</option>
              <option value="reseller">Reseller</option>
              <option value="tailor">Tailor</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label class="lbl">Brand Name</label>
            <input formControlName="brandName" class="input" placeholder="(optional)">
          </div>
          <div>
            <label class="lbl">Phone / WhatsApp</label>
            <input formControlName="phone" class="input" placeholder="+91 98765 43210"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="lbl">Alternate Mobile</label>
            <input formControlName="altPhone" class="input" placeholder="Doosra mobile no.">
          </div>
          <div>
            <label class="lbl">Buyer WhatsApp (bot)</label>
            <input formControlName="waPhone" class="input" placeholder="Khareed ke liye WhatsApp no.">
            <p class="text-[11px] text-gray-400 mt-0.5">Both firm ho to buyer ka alag WhatsApp — bot isse pehchaanega.</p>
          </div>
          <div>
            <label class="lbl">Email</label>
            <input formControlName="email" type="email" class="input"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="lbl">GST Number</label>
            <input appUpper formControlName="gst" class="input font-mono uppercase" maxlength="15"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="lbl">PAN</label>
            <input appUpper formControlName="pan" class="input font-mono uppercase" maxlength="10"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="lbl">Website</label>
            <input formControlName="website" class="input" placeholder="https://example.com">
          </div>
          <div>
            <label class="lbl">Instagram / Social</label>
            <input formControlName="instagram" class="input" placeholder="@handle ya link">
          </div>
          <div class="col-span-2">
            <label class="flex items-center gap-2 px-2 py-2 rounded bg-[#f7f0ff] cursor-pointer text-sm font-bold text-[#5c1a8b]">
              <input type="checkbox" formControlName="isSupplier">
              Yeh buyer supplier bhi hai (dual role)
            </label>
          </div>
        </div>

        <!-- Address -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider mt-2">Address</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label class="lbl">Address Line</label><input formControlName="address" class="input" [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()"></div>
          <div><label class="lbl">Pincode <small class="text-gray-400">(city/state auto)</small></label>
            <input formControlName="pincode" class="input" maxlength="6" (input)="onPincodeInput()"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()"></div>
          <div><label class="lbl">State</label>
            @if (lockCommon()) {
              <input formControlName="state" class="input bg-gray-100" readonly>
            } @else {
              <select formControlName="state" class="input">
                <option value="">— Select —</option>
                @for (s of indiaStates; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
              </select>
            }
          </div>
          <div><label class="lbl">City</label>
            <input formControlName="city" class="input" list="buyCityList" (change)="onCityInput()"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
            <datalist id="buyCityList">
              @for (c of cityOptions(); track c) { <option [value]="c"></option> }
            </datalist>
          </div>
          <!-- GPS location capture (supplier-form jaisa) -->
          <div class="col-span-2 flex items-end gap-3">
            <div class="flex-1">
              <label class="lbl">📍 GPS Location (optional)</label>
              <input formControlName="gpsLocation" class="input" placeholder="Get current location se auto-fill hoga" readonly>
            </div>
            <button type="button" (click)="getCurrentLocation()" [disabled]="gpsLoading()"
                    class="btn-primary whitespace-nowrap">
              {{ gpsLoading() ? '📍 Getting…' : '📍 Get Current Location' }}
            </button>
          </div>
        </div>

        <!-- Buying preferences -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider mt-2">Budget & Buying Preferences</h3>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="lbl">Budget Min (₹)</label><input formControlName="budgetMin" type="number" class="input"></div>
          <div><label class="lbl">Budget Max (₹)</label><input formControlName="budgetMax" type="number" class="input"></div>
          <div>
            <label class="lbl">Unit</label>
            <select formControlName="budgetUnit" class="input">
              <option value="mtr">Per Meter</option>
              <option value="pcs">Per Piece</option>
              <option value="kg">Per Kg</option>
            </select>
          </div>
          <div>
            <label class="lbl">Order Frequency</label>
            <select formControlName="orderFrequency" class="input">
              <option value="">—</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="occasional">Occasional</option>
            </select>
          </div>
          <div>
            <label class="lbl">Quality Pref</label>
            <select formControlName="qualityPref" class="input">
              <option value="">—</option>
              <option value="premium">Premium</option>
              <option value="standard">Standard</option>
              <option value="economy">Economy</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label class="lbl">Target Customer</label>
            <select formControlName="targetCustomer" class="input">
              <option value="">—</option>
              <option value="b2b">B2B</option>
              <option value="b2c">B2C</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div class="col-span-3"><label class="lbl">Payment Terms</label><input formControlName="paymentTerms" class="input" placeholder="e.g. 30 days credit"></div>
        </div>

        <!-- Categories of interest -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider mt-2">
          Interested Categories ({{ selectedCategoryIds().length }})
        </h3>
        <div class="border border-[#ddc8f5] rounded-lg p-3 max-h-48 overflow-y-auto">
          <div class="grid grid-cols-3 gap-1">
            @for (c of categories(); track c.id) {
              <label class="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#f0e6ff] cursor-pointer text-sm">
                <input type="checkbox" [checked]="selectedCategoryIds().includes(c.id)" (change)="toggleCategory(c.id)">
                {{ c.name }}
              </label>
            }
          </div>
        </div>

        <div>
          <label class="lbl">Notes</label>
          <textarea formControlName="notes" rows="2" class="input"></textarea>
        </div>

        <!-- PRODUCT CATALOG (Phase B) — Demand (always) + Supply (only when isSupplier) -->
        <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase tracking-wider mt-2">📦 Product Catalog</h3>
        @if (editingId) {
          <!-- Demand Catalog — jo khareedna hai (hamesha) -->
          <div>
            <h4 class="font-bold text-xs text-[#6b3fa0] uppercase tracking-wider mb-2">🛒 Demand Catalog — jo khareedna hai</h4>
            <app-buyer-catalog [buyerId]="editingId!" catalogType="demand" [categories]="categories()"></app-buyer-catalog>
          </div>

          <!-- Supply Catalog — jo banake bechta hai (sirf jab isSupplier on) -->
          @if (isSupplier()) {
            <div class="mt-3">
              <h4 class="font-bold text-xs text-[#6b3fa0] uppercase tracking-wider mb-2">🏭 Supply Catalog — jo banake bechta hai</h4>
              <app-buyer-catalog [buyerId]="editingId!" catalogType="supply" [categories]="categories()"></app-buyer-catalog>
            </div>
          } @else {
            <p class="text-xs text-gray-400 mt-2">Supply Catalog dikhane ke liye upar "Yeh buyer supplier bhi hai" check karo.</p>
          }
        } @else {
          <div class="border border-dashed border-[#ddc8f5] rounded-lg p-4 text-center text-sm text-gray-500">
            Variety + photo + rate add karne ke liye pehle buyer <b>Create</b> karo — fir edit me catalog khulega.
          </div>
        }

        @if (error()) {
          <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{{ error() }}</div>
        }

        <div class="flex justify-end gap-2 border-t pt-4">
          <a routerLink="/suppliers/buyers" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</a>
          <button type="submit" class="btn-primary" [disabled]="form.invalid || saving()">
            {{ saving() ? 'Saving…' : (editingId ? 'Update Buyer' : 'Create Buyer') }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`.lbl{ display:block; font-size:10px; font-weight:800; color:#6b3fa0; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }`]
})
export class BuyerFormComponent {
  private svc = inject(BuyersService);
  private supSvc = inject(SuppliersService);
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
  private toast = inject(ToastService);

  editingId: string | null = null;
  contactId: string | null = null;
  isAlsoSupplier = signal(false);   // same contact Supplier Directory me bhi — header ka "DONO" tag
  makingSupplier = signal(false);

  // ---- Core Master/Trading se seedha laao (Add mode ka searchable picker) ----
  existSearch = '';
  existResults = signal<LinkableContact[]>([]);
  existDone = signal<string[]>([]);   // jo pehle se Buyer ban chuke — naam dikhane ko
  existSearched = signal(false);
  picking = signal<string | null>(null);
  private existTimer: any;
  onExistSearch() {
    clearTimeout(this.existTimer);
    const q = this.existSearch.trim();
    if (q.length < 2) { this.existResults.set([]); this.existSearched.set(false); return; }
    this.existTimer = setTimeout(() => {
      this.supSvc.listLinkable(q).subscribe({
        next: l => {
          // Jo pehle se bazaar-buyer hai use chhupao; Trading ke BUYER/DONO upar dikhao
          const rank = (c: LinkableContact) =>
            c.tradingType === 'buyer' ? 0 : c.tradingType === 'both' ? 1 : c.tradingType === 'seller' ? 3 : 2;
          this.existResults.set(l.filter(c => !c.isBazaarBuyer).sort((a, b) => rank(a) - rank(b)));
          // "Ban chuka hai" wale alag batao — warna "koi nahi mila" se lagta hai kho gaya
          this.existDone.set(l.filter(c => !!c.isBazaarBuyer).map(c => c.displayName));
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
        alert(`✅ ${c.displayName} Buyer ban gaya!\nAb Budget Range / Categories bhar lo — Bazaar Bot isi se photo bhejta hai.`);
        this.router.navigate(['/suppliers/buyers', res.id, 'edit']);
      },
      error: (e) => { this.picking.set(null); alert('⚠️ ' + (e?.error?.error ?? 'Add nahi hua — dobara try karo')); }
    });
  }

  // Ek-click: isi contact ko Supplier directory me bhi jodo (wahi contact, duplicate nahi)
  makeSupplierToo() {
    if (!this.contactId || this.makingSupplier()) return;
    if (!confirm('Is buyer ko SUPPLIER directory me bhi jodna hai?\n(Category/rate baad me Supplier edit se bhar sakte ho)')) return;
    this.makingSupplier.set(true);
    this.supSvc.addFromContact(this.contactId).subscribe({
      next: () => {
        this.makingSupplier.set(false);
        this.isAlsoSupplier.set(true);
        alert('✅ Supplier directory me jud gaya — ab ye DONO hai.\nCategory/rate set karne ke liye Suppliers list me edit kholo.');
      },
      error: (e) => { this.makingSupplier.set(false); alert('⚠️ ' + (e?.error?.error ?? 'Jud nahi paya — dobara try karo')); }
    });
  }
  saving = signal(false);
  error = signal('');
  categories = signal<SupplierCategory[]>([]);
  selectedCategoryIds = signal<string[]>([]);
  // Supply Catalog tab tabhi dikhao jab "isSupplier" checkbox on ho (live track).
  isSupplier = signal(false);

  // Common fields lock tabhi jab edit mode + linked contact ho (Phase 2).
  lockCommon = () => !!(this.editingId && this.contactId);

  form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    legalName: [''],
    ownerName: [''],
    phone: [''],
    altPhone: [''],
    waPhone: [''],
    email: [''],
    website: [''],
    instagram: [''],
    gst: [''],
    pan: [''],
    address: [''],
    city: [''],
    state: [''],
    pincode: [''],
    gpsLocation: [''],
    isSupplier: [false],
    buyerType: [''],
    brandName: [''],
    budgetMin: [null as number | null],
    budgetMax: [null as number | null],
    budgetUnit: ['mtr'],
    orderFrequency: [''],
    paymentTerms: [''],
    qualityPref: [''],
    targetCustomer: [''],
    notes: ['']
  });

  // ===== GPS capture (supplier-form se same) =====
  gpsLoading = signal(false);

  /** Capture device GPS and fill lat,long into the form (https / localhost). */
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
      () => {
        this.error.set('Location nahi mili. Browser me location permission allow karein.');
        this.gpsLoading.set(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ===== Live duplicate-check (debounced) =====
  duplicates = signal<BuyerDuplicateMatch[]>([]);

  /** GST/mobile par live duplicate-check — matches mile to warning banner. */
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

  ngOnInit() {
    this.supSvc.listCategories().subscribe(c => this.categories.set(c));

    // Supply Catalog tab toggle ke saath live update (checkbox on/off).
    this.isSupplier.set(this.form.controls.isSupplier.value);
    this.form.controls.isSupplier.valueChanges.subscribe(v => this.isSupplier.set(!!v));

    // Live duplicate-check — GST ya mobile badle to ~500ms baad check karo.
    this.form.controls.gst.valueChanges.pipe(debounceTime(500)).subscribe(() => this.runDuplicateCheck());
    this.form.controls.phone.valueChanges.pipe(debounceTime(500)).subscribe(() => this.runDuplicateCheck());

    this.editingId = this.route.snapshot.paramMap.get('id');
    if (this.editingId) {
      this.svc.get(this.editingId).subscribe(b => {
        this.contactId = b.contactId;
        this.isAlsoSupplier.set(!!(b as any).isAlsoSupplier);
        this.form.patchValue({
          displayName: b.displayName,
          legalName: b.legalName ?? '',
          ownerName: (b as any).ownerName ?? '',
          phone: b.phone ?? '',
          altPhone: (b as any).altPhone ?? '',
          waPhone: b.waPhone ?? '',
          email: b.email ?? '',
          website: (b as any).website ?? '',
          instagram: (b as any).instagram ?? '',
          gst: b.gst ?? '',
          pan: b.pan ?? '',
          address: b.address ?? '',
          city: b.city ?? '',
          state: b.state ?? '',
          pincode: b.pincode ?? '',
          gpsLocation: (b as any).gpsLocation ?? '',
          isSupplier: (b as any).isSupplier ?? false,
          buyerType: b.buyerType ?? '',
          brandName: b.brandName ?? '',
          budgetMin: b.budgetMin,
          budgetMax: b.budgetMax,
          budgetUnit: b.budgetUnit ?? 'mtr',
          orderFrequency: b.orderFrequency ?? '',
          paymentTerms: b.paymentTerms ?? '',
          qualityPref: b.qualityPref ?? '',
          targetCustomer: b.targetCustomer ?? '',
          notes: b.notes ?? ''
        });
        this.selectedCategoryIds.set(b.categoryIds);
        // City bhari ho aur pincode khali — auto le aao (lock ho to skip)
        setTimeout(() => this.onCityInput());
      });
    }
  }

  toggleCategory(id: string) {
    this.selectedCategoryIds.update(arr => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');
    const data = { ...this.form.getRawValue(), categoryIds: this.selectedCategoryIds() } as any;
    const obs = this.editingId ? this.svc.update(this.editingId, data) : this.svc.create(data);
    obs.subscribe({
      next: (b) => {
        this.toast.success(this.editingId ? 'Buyer successfully edit ho gaya!' : 'Buyer successfully add ho gaya!');
        this.router.navigate(['/suppliers/buyers', b.id]);
      },
      error: (e) => {
        this.error.set(e?.error?.error ?? 'Save nahi hua');
        this.saving.set(false);
      }
    });
  }
}
