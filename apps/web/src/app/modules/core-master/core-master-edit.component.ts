import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { BackButtonComponent } from '../../shared/back-button.component';
import { ToastService } from '../../shared/toast.service';
import { INDIAN_STATES, citiesForState, matchIndiaState } from '../../shared/india-data';
import { IndiaPincodeService } from '../../shared/india-pincode.service';

interface CoreContact {
  id: string;
  displayName: string;
  legalName: string | null;
  phone: string | null;
  email: string | null;
  gst: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  isParty: boolean;
  isSupplier: boolean;
  isStaff: boolean;
  isBuyer?: boolean;
  supplierWa?: string | null;
  buyerWa?: string | null;
  groupName?: string | null;
}

@Component({
  selector: 'app-core-master-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, BackButtonComponent],
  template: `
    <div class="max-w-2xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="mb-4">
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🗂️ Core Master — {{ isNew ? 'Add' : 'Edit' }} Contact</h2>
        <p class="text-sm text-[#6b3fa0]">
          Ye common data hai. Yahan badloge to Trading, Bazaar Link aur HR — sab jagah update ho jayega.
        </p>
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-500 py-8">Loading…</div>
      } @else if (!model()) {
        <div class="card text-center text-gray-500 py-8">Contact nahi mila.</div>
      } @else {
        <div class="card flex flex-col gap-4">
          <!-- where this contact is used -->
          <div class="flex gap-2 flex-wrap text-xs">
            <span class="font-bold text-[#6b3fa0]">Used in:</span>
            @if (model()!.isParty)    { <span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">Trading</span> }
            @if (model()!.isSupplier) { <span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Bazaar Link</span> }
            @if (model()!.isStaff)    { <span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">HR</span> }
            @if (!model()!.isParty && !model()!.isSupplier && !model()!.isStaff) { <span class="text-gray-400">— abhi kisi module me nahi —</span> }
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="lbl">Display Name *</label>
              <input [(ngModel)]="model()!.displayName" class="input" placeholder="Party / Supplier / Staff name">
            </div>
            <div>
              <label class="lbl">Legal Name</label>
              <input [(ngModel)]="model()!.legalName" class="input">
            </div>
            <div>
              <label class="lbl">Group (sister firms)</label>
              <input [(ngModel)]="model()!.groupName" class="input" list="cmGroupList" placeholder="e.g. Gupta Group">
              <datalist id="cmGroupList">@for (g of groups(); track g) { <option [value]="g"></option> }</datalist>
            </div>
            <div>
              <label class="lbl">Phone / WhatsApp</label>
              <input [(ngModel)]="model()!.phone" class="input" placeholder="10-digit">
            </div>
            <div>
              <label class="lbl">Email</label>
              <input [(ngModel)]="model()!.email" type="email" class="input">
            </div>
            <div>
              <label class="lbl">GST Number</label>
              <input [(ngModel)]="model()!.gst" class="input font-mono uppercase" maxlength="15">
            </div>
            <div>
              <label class="lbl">PAN</label>
              <input [(ngModel)]="model()!.pan" class="input font-mono uppercase" maxlength="10">
            </div>
            <div class="col-span-2">
              <label class="lbl">Address</label>
              <input [(ngModel)]="model()!.address" class="input">
            </div>
            <div><label class="lbl">Pincode <small class="text-gray-400">(city/state auto)</small></label>
              <input [(ngModel)]="model()!.pincode" (ngModelChange)="onPincodeInput()" class="input" maxlength="6"></div>
            <div><label class="lbl">State</label>
              <select [(ngModel)]="model()!.state" class="input">
                <option value="">— Select —</option>
                @for (s of indiaStates; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
              </select>
            </div>
            <div><label class="lbl">City</label>
              <input [(ngModel)]="model()!.city" (change)="onCityInput()" class="input" list="cmCityList">
              <datalist id="cmCityList">
                @for (c of cityOptions(); track c) { <option [value]="c"></option> }
              </datalist>
            </div>
          </div>

          <!-- 2 WhatsApp number — COMMON (har form me same, bot inse pehchaanta hai). -->
          <div class="rounded-lg bg-purple-50 border border-purple-100 p-3">
            <p class="text-xs font-bold text-[#6b3fa0] uppercase mb-2">📲 WhatsApp Numbers (common)</p>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="lbl">WhatsApp – Supplier</label>
                <input [(ngModel)]="model()!.supplierWa" class="input" placeholder="Bechne wala no.">
              </div>
              <div>
                <label class="lbl">WhatsApp – Buyer</label>
                <input [(ngModel)]="model()!.buyerWa" class="input" placeholder="Khareedne wala no.">
              </div>
            </div>
            <p class="text-[11px] text-gray-400 mt-1">Both firm ho to 2 alag number rakhein — bot inse pehchaanega supplier ya buyer.</p>
          </div>

          @if (error()) {
            <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{{ error() }}</div>
          }

          <div class="flex justify-end gap-2 border-t pt-4">
            <button (click)="goBack()" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
            <button (click)="save()" [disabled]="saving()" class="btn-primary">
              {{ saving() ? 'Saving…' : '💾 Save (sab jagah update)' }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`.lbl{ display:block; font-size:10px; font-weight:800; color:#6b3fa0; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }`]
})
export class CoreMasterEditComponent {
  private pinSvc = inject(IndiaPincodeService);

  // ===== India location helpers =====
  indiaStates = INDIAN_STATES;
  cityOptions(): string[] { return citiesForState(this.model()?.state || ''); }

  onPincodeInput() {
    const m = this.model(); if (!m) return;
    const p = (m.pincode || '').replace(/\D/g, '');
    if (p.length !== 6) return;
    this.pinSvc.byPin(p).subscribe({
      next: (res) => {
        const po = this.pinSvc.firstPo(res);
        if (!po) return;
        m.city = po.District || m.city;
        m.state = matchIndiaState(po.State) || m.state;
      },
      error: () => {}
    });
  }

  onCityInput() {
    const m = this.model(); if (!m) return;
    const city = (m.city || '').trim();
    if (!city || (m.pincode || '').length === 6) return;
    this.pinSvc.byCity(city).subscribe({
      next: (res) => {
        const po = this.pinSvc.firstPo(res, m.state || undefined);
        if (!po) return;
        m.pincode = po.Pincode || m.pincode;
        if (!m.state) m.state = matchIndiaState(po.State);
      },
      error: () => {}
    });
  }

  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/api/core/contacts`;

  model = signal<CoreContact | null>(null);
  groups = signal<string[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  isNew = false;

  ngOnInit() {
    this.http.get<string[]>(`${this.base}/groups`).subscribe({ next: g => this.groups.set(g || []), error: () => {} });
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || id === 'new') {
      // Add mode — blank contact.
      this.isNew = true;
      this.model.set({
        id: '', displayName: '', legalName: null, phone: null, email: null,
        gst: null, pan: null, address: null, city: null, state: null, pincode: null,
        isParty: false, isSupplier: false, isStaff: false, isBuyer: false, supplierWa: null, buyerWa: null, groupName: null
      });
      this.loading.set(false);
      return;
    }
    this.http.get<CoreContact>(`${this.base}/${id}`).subscribe({
      next: (c) => {
        this.model.set(c);
        this.loading.set(false);
        // City bhari ho aur pincode khali — auto le aao
        setTimeout(() => this.onCityInput());
      },
      error: () => this.loading.set(false)
    });
  }

  save() {
    const m = this.model();
    if (!m) return;
    if (!m.displayName?.trim()) { this.error.set('Display Name zaroori hai.'); return; }
    this.saving.set(true);
    this.error.set('');
    const body = {
      displayName: m.displayName, legalName: m.legalName, phone: m.phone, email: m.email,
      gst: m.gst, pan: m.pan, address: m.address, city: m.city, state: m.state, pincode: m.pincode,
      supplierWa: m.supplierWa, buyerWa: m.buyerWa, groupName: m.groupName
    };
    const req = this.isNew
      ? this.http.post<CoreContact>(this.base, body)
      : this.http.put<CoreContact>(`${this.base}/${m.id}`, body);
    req.subscribe({
      next: () => {
        this.toast.success(this.isNew ? 'Naya contact add ho gaya!' : 'Core Master update ho gaya — sab module me reflect hoga.');
        this.saving.set(false);
        this.goBack();
      },
      error: (e) => {
        this.error.set(e?.error?.error ?? (this.isNew ? 'Add nahi hua' : 'Update nahi hua'));
        this.saving.set(false);
      }
    });
  }

  goBack() { history.back(); }
}
