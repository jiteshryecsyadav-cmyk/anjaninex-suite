import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BuyersService } from '../services/buyers.service';
import { SuppliersService, SupplierCategory } from '../services/suppliers.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';
import { INDIAN_STATES, citiesForState, matchIndiaState } from '../../../shared/india-data';
import { IndiaPincodeService } from '../../../shared/india-pincode.service';

@Component({
  selector: 'app-buyer-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BackButtonComponent],
  template: `
    <div class="max-w-3xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="mb-4">
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">
          {{ editingId ? '✏️ Edit Buyer' : '+ Add New Buyer' }}
        </h2>
        <p class="text-sm text-[#6b3fa0]">Customer / Boutique / Reseller details</p>
      </div>

      <form [formGroup]="form" (ngSubmit)="save()" class="card flex flex-col gap-4">
        @if (editingId && contactId) {
          <div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex items-center justify-between">
            <span>🔒 Naam / Phone / GST common data hai — yahan lock hai. Badalne ke liye Core Master me jao.</span>
            <a [routerLink]="['/core-master', contactId]" class="font-bold text-[#5c1a8b] underline whitespace-nowrap ml-2">🗂️ Edit in Core Master</a>
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
            <label class="lbl">Contact / Owner Name</label>
            <input formControlName="legalName" class="input"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
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
            <input formControlName="gst" class="input font-mono uppercase" maxlength="15"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
          </div>
          <div>
            <label class="lbl">PAN</label>
            <input formControlName="pan" class="input font-mono uppercase" maxlength="10"
                   [readonly]="lockCommon()" [class.bg-gray-100]="lockCommon()">
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
  saving = signal(false);
  error = signal('');
  categories = signal<SupplierCategory[]>([]);
  selectedCategoryIds = signal<string[]>([]);

  // Common fields lock tabhi jab edit mode + linked contact ho (Phase 2).
  lockCommon = () => !!(this.editingId && this.contactId);

  form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    legalName: [''],
    phone: [''],
    waPhone: [''],
    email: [''],
    gst: [''],
    pan: [''],
    address: [''],
    city: [''],
    state: [''],
    pincode: [''],
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

  ngOnInit() {
    this.supSvc.listCategories().subscribe(c => this.categories.set(c));
    this.editingId = this.route.snapshot.paramMap.get('id');
    if (this.editingId) {
      this.svc.get(this.editingId).subscribe(b => {
        this.contactId = b.contactId;
        this.form.patchValue({
          displayName: b.displayName,
          legalName: b.legalName ?? '',
          phone: b.phone ?? '',
          waPhone: b.waPhone ?? '',
          email: b.email ?? '',
          gst: b.gst ?? '',
          pan: b.pan ?? '',
          address: b.address ?? '',
          city: b.city ?? '',
          state: b.state ?? '',
          pincode: b.pincode ?? '',
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
