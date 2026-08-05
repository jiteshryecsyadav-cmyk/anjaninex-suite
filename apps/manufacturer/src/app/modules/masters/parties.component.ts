import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { FldDirective } from '../../shared/fld.directive';
import { FieldConfigService } from '../../shared/field-config.service';
import { environment } from '../../../environments/environment';

export interface Party {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  gst: string | null;
  city: string | null;
  partyType: string;
  creditLimit: number;
  creditDays: number;
  outstandingBalance: number;
  isActive: boolean;
  discountNormal: number;
  udyamNo: string | null;
  msmeType: string | null;
  contactPerson: string | null;
}

/**
 * Customers aur Suppliers — EK hi screen, do darwaze.
 *
 * Dono ka kaam bilkul ek jaisa hai (naam, phone, GST, chhoot, udhaar ke din).
 * Do alag component banate to har sudhaar do jagah karna padta aur ek din ek
 * jagah reh jata. Farak sirf itna: kaunsi list aur kaunse shabd.
 */
@Component({
  selector: 'mfg-parties',
  standalone: true,
  imports: [CommonModule, FormsModule, FldDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-top-bar">
      <input class="input max-w-[280px]" [placeholder]="'🔍 ' + word().dhoondho"
             [(ngModel)]="search" (ngModelChange)="load()">
      @if (auth.can('masters.customer.create.firm')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">
          ＋ {{ word().naya }}</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">{{ word().khali }}</div>
    } @else {
      <div class="space-y-2">
        @for (p of rows(); track p.id) {
          <div class="card flex gap-3 items-center">
            <div class="w-11 h-11 rounded-xl bg-anjaninex-navy-soft grid place-items-center text-xl">
              {{ word().icon }}</div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm">
                {{ p.displayName }}
                @if (p.partyType === 'both') {
                  <span class="chip bg-amber-50 text-amber-700 ml-1"
                        title="Isse khareedte bhi hain aur isko bechte bhi hain">DONO</span>
                }
              </div>
              <div class="text-xs text-slate-500">
                @if (p.contactPerson) { {{ p.contactPerson }} · }
                @if (p.phone) { 📞 {{ p.phone }} }
              </div>
              <div class="text-xs text-slate-500">
                {{ p.city || '—' }}
                @if (p.discountNormal) { · <b class="text-anjaninex-navy">{{ p.discountNormal }}% chhoot</b> }
                @if (p.creditDays) { · {{ p.creditDays }} din udhaar }
                <!-- MSME hai to 45 din ka kanoon lagta hai — supplier ki list
                     me ye dikhna zaroori hai, warna byaj lag jata hai -->
                @if (kind() === 'supplier' && p.msmeType) {
                  · <b class="text-amber-700">MSME {{ p.msmeType }} — 45 din</b>
                }
              </div>
            </div>
            <div class="text-right shrink-0">
              @if (p.outstandingBalance) {
                <div class="font-extrabold"
                     [class]="p.outstandingBalance > 0 ? 'text-anjaninex-red' : 'text-emerald-700'">
                  ₹{{ abs(p.outstandingBalance) | number:'1.0-0' }}</div>
                <div class="text-[11px] text-slate-500">
                  {{ p.outstandingBalance > 0 ? word().baki : 'advance' }}</div>
              } @else {
                <div class="text-[11px] font-bold text-emerald-700">khata saaf</div>
              }
              @if (auth.can('masters.customer.edit.firm')) {
                <button class="text-[11px] font-bold text-anjaninex-navy mt-1.5"
                        (click)="openEdit(p)">BADLO</button>
              }
            </div>
          </div>
        }
      </div>
    }

    @if (form()) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="form.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-3">
            {{ editId() ? word().badlo : word().naya }}</h3>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="label" style="color:#DC2626">{{ word().naam }} *</label>
              <input class="input" [(ngModel)]="form()!.displayName">
            </div>
            <div *fld="'mfg_party.contact'"><label class="label">{{ cfg.label('mfg_party.contact') }}</label>
              <input class="input" [(ngModel)]="form()!.contactPerson"></div>
            <div *fld="'mfg_party.mobile'"><label class="label">{{ cfg.label('mfg_party.mobile') }}</label>
              <input class="input" [(ngModel)]="form()!.phone" inputmode="numeric"></div>
            <div *fld="'mfg_party.gst'"><label class="label">{{ cfg.label('mfg_party.gst') }}</label>
              <input class="input font-mono uppercase" [(ngModel)]="form()!.gst" maxlength="15"></div>
            <div *fld="'mfg_party.pan'"><label class="label">{{ cfg.label('mfg_party.pan') }}</label>
              <input class="input font-mono uppercase" [(ngModel)]="form()!.pan" maxlength="10"></div>
            <div *fld="'mfg_party.city'"><label class="label">{{ cfg.label('mfg_party.city') }}</label>
              <input class="input" [(ngModel)]="form()!.city"></div>
            <div *fld="'mfg_party.state'"><label class="label">{{ cfg.label('mfg_party.state') }}</label>
              <input class="input" [(ngModel)]="form()!.state"></div>
            <div class="col-span-2" *fld="'mfg_party.address'"><label class="label">{{ cfg.label('mfg_party.address') }}</label>
              <textarea class="input" rows="2" [(ngModel)]="form()!.address"></textarea></div>

            <!-- Ye do khaane har bill par apne aap lagte hain — pehle har baar
                 haath se likhne padte the aur ek hi party ko kabhi 8% kabhi 10% -->
            <div *fld="'mfg_party.discount'"><label class="label">{{ cfg.label('mfg_party.discount') }}</label>
              <input class="input" type="number" [(ngModel)]="form()!.discountNormal"></div>
            <div *fld="'mfg_party.credit_days'"><label class="label">{{ cfg.label('mfg_party.credit_days') }}</label>
              <input class="input" type="number" [(ngModel)]="form()!.creditDays"></div>

            @if (kind() === 'supplier') {
              <div *fld="'mfg_party.udyam_type'"><label class="label">{{ cfg.label('mfg_party.udyam_type') }}</label>
                <select class="input" [(ngModel)]="form()!.msmeType">
                  <option [ngValue]="null">— MSME nahi hai —</option>
                  <option value="micro">Micro</option>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                </select></div>
              <div *fld="'mfg_party.udyam_no'"><label class="label">{{ cfg.label('mfg_party.udyam_no') }}</label>
                <input class="input font-mono" [(ngModel)]="form()!.udyamNo"
                       placeholder="UDYAM-RJ-24-0050711"></div>
              @if (form()!.msmeType) {
                <div class="col-span-2 text-[11.5px] text-amber-700 bg-amber-50 rounded-lg p-2.5">
                  ⚠️ MSME supplier hai — kanoon ke hisab se <b>45 din</b> me paisa
                  dena hota hai, warna byaj lag sakta hai
                </div>
              }
            }
          </div>

          <div class="flex gap-2 mt-5">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : 'SAVE KARO' }}</button>
            <button class="btn-line" (click)="form.set(null)">Cancel</button>
          </div>
        </div>
      </div>
    }
  `
})
export class PartiesComponent {
  /** Route se aata hai: 'customer' ya 'supplier'. */
  kind = input.required<string>();

  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg/parties`;
  auth = inject(AuthService);
  /** Firm ne kaunsa field on/off kiya — template isi se poochta hai. */
  cfg = inject(FieldConfigService);

  /** Dono ke liye shabd alag — kaam ek. */
  word = computed(() => this.kind() === 'supplier'
    ? { icon: '🚛', naam: 'Supplier / mill ka naam', naya: 'NAYA SUPPLIER',
        badlo: 'Supplier badlo', dhoondho: 'mill, naam ya GST se dhoondho',
        khali: 'Koi supplier nahi mila', baki: 'humein dena hai' }
    : { icon: '🏢', naam: 'Firm / agency ka naam', naya: 'NAYA CUSTOMER',
        badlo: 'Customer badlo', dhoondho: 'firm, naam ya GST se dhoondho',
        khali: 'Koi customer nahi mila', baki: 'bakaya' });

  rows = signal<Party[]>([]);
  loading = signal(true);
  err = signal('');
  search = '';

  form = signal<any | null>(null);
  editId = signal<string | null>(null);
  formErr = signal('');
  saving = signal(false);

  abs = Math.abs;

  constructor() { queueMicrotask(() => this.load()); }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams({ kind: this.kind() });
    if (this.search) q.set('search', this.search);

    this.http.get<Party[]>(`${this.base}?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => {
        this.err.set(e?.error?.error ?? 'List nahi aa payi — dobara koshish kijiye');
        this.loading.set(false);
      }
    });
  }

  openNew() {
    this.editId.set(null);
    this.formErr.set('');
    this.form.set({
      displayName: '', legalName: null, phone: null, email: null,
      gst: null, pan: null, address: null, city: null, state: null, pincode: null,
      partyType: this.kind(),
      creditLimit: 0, creditDays: 0, commissionRate: 0,
      openingBalance: 0, openingType: 'dr',
      discountNormal: 0, discountExhibition: 0, discountSpecial: 0,
      udyamNo: null, msmeType: null, contactPerson: null
    });
  }

  openEdit(p: Party) {
    this.editId.set(p.id);
    this.formErr.set('');
    // Get se poora record lete hain — list me sab khaane nahi aate
    this.http.get<any>(`${this.base}/${p.id}`).subscribe({
      next: full => this.form.set({ ...full, openingBalance: 0, openingType: 'dr' }),
      error: () => this.form.set({ ...p, openingBalance: 0, openingType: 'dr' })
    });
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    const id = this.editId();
    const req = id
      ? this.http.put<Party>(`${this.base}/${id}`, f)
      : this.http.post<Party>(this.base, f);

    req.subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }
}
