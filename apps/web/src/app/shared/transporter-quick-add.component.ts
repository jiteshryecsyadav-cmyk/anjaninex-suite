import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { INDIAN_STATES, citiesForState, matchIndiaState } from './india-data';
import { IndiaPincodeService } from './india-pincode.service';

/**
 * TRANSPORTER QUICK ADD — Order/Bill entry ke andar se pura transporter form.
 * Party Quick Add jaisa modal: naam, contact, mobile, GST/PAN,
 * pincode→city/state auto, address. Save hote hi parent ko naya transporter milta hai.
 */
@Component({
  selector: 'app-transporter-quick-add',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tqa-overlay" (click)="close.emit()">
      <div class="tqa-modal" (click)="$event.stopPropagation()">
        <div class="tqa-head">
          🚚 Quick Add Transporter
          <button type="button" (click)="close.emit()" class="tqa-close">✕</button>
        </div>

        <div class="tqa-body">
          @if (error()) {
            <div class="tqa-err">{{ error() }}</div>
          }

          <div class="tqa-row">
            <div class="tqa-field tqa-2">
              <label>FIRM NAME <span class="req">*</span></label>
              <input type="text" [(ngModel)]="firmName" placeholder="e.g. R Yadav Express Cargo" class="tqa-ip"
                     [class.tqa-ip-err]="submitted() && !firmName.trim()">
            </div>
            <div class="tqa-field">
              <label>CONTACT PERSON</label>
              <input type="text" [(ngModel)]="contactPerson" placeholder="Manager ka naam" class="tqa-ip">
            </div>
          </div>

          <div class="tqa-row">
            <div class="tqa-field">
              <label>MOBILE</label>
              <input type="text" [(ngModel)]="mobile" maxlength="10" inputmode="numeric" placeholder="10-digit" class="tqa-ip">
            </div>
            <div class="tqa-field">
              <label>WHATSAPP</label>
              <input type="text" [(ngModel)]="whatsapp" maxlength="10" inputmode="numeric" placeholder="Same as mobile if blank" class="tqa-ip">
            </div>
            <div class="tqa-field">
              <label>EMAIL</label>
              <input type="email" [(ngModel)]="email" placeholder="optional" class="tqa-ip">
            </div>
          </div>

          <div class="tqa-row">
            <div class="tqa-field">
              <label>GST NO</label>
              <input type="text" [(ngModel)]="gstNo" maxlength="15" placeholder="optional"
                     (input)="gstNo = gstNo.toUpperCase()" class="tqa-ip">
            </div>
            <div class="tqa-field">
              <label>PAN</label>
              <input type="text" [(ngModel)]="pan" maxlength="10" placeholder="optional"
                     (input)="pan = pan.toUpperCase()" class="tqa-ip">
            </div>
            <div class="tqa-field">
              <label>PINCODE <small>(city/state auto)</small></label>
              <input type="text" [(ngModel)]="pincode" (ngModelChange)="onPincode()" maxlength="6"
                     inputmode="numeric" placeholder="395002" class="tqa-ip">
            </div>
          </div>

          <div class="tqa-row">
            <div class="tqa-field">
              <label>STATE</label>
              <select [(ngModel)]="state" class="tqa-ip">
                <option value="">— Select —</option>
                @for (s of states; track s.name) { <option [value]="s.name">{{ s.name }} ({{ s.gstCode }})</option> }
              </select>
            </div>
            <div class="tqa-field">
              <label>CITY</label>
              <input type="text" [(ngModel)]="city" (change)="onCity()" list="tqaCityList"
                     placeholder="Type ya choose" class="tqa-ip">
              <datalist id="tqaCityList">
                @for (c of cityOptions(); track c) { <option [value]="c"></option> }
              </datalist>
            </div>
            <div class="tqa-field">
              <label>AVG DELIVERY DAYS</label>
              <input type="number" [(ngModel)]="avgDeliveryDays" min="1" class="tqa-ip">
            </div>
          </div>

          <div class="tqa-row">
            <div class="tqa-field tqa-full">
              <label>ADDRESS</label>
              <input type="text" [(ngModel)]="address" placeholder="Transport nagar / office address" class="tqa-ip">
            </div>
          </div>
        </div>

        <div class="tqa-foot">
          <button type="button" (click)="close.emit()" class="tqa-btn tqa-btn-cancel">Cancel</button>
          <button type="button" (click)="save()" [disabled]="saving()" class="tqa-btn tqa-btn-save">
            {{ saving() ? 'Saving…' : '✓ Save & Use' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tqa-overlay { position: fixed; inset: 0; background: rgba(20,10,40,.55); z-index: 95;
      display: flex; align-items: center; justify-content: center; padding: 16px; }
    .tqa-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 640px;
      max-height: 92vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
    .tqa-head { background: linear-gradient(90deg, #5c1a8b, #7c3aed); color: #fff;
      padding: 14px 18px; font-weight: 800; font-size: 15px;
      display: flex; justify-content: space-between; align-items: center;
      border-radius: 14px 14px 0 0; position: sticky; top: 0; }
    .tqa-close { background: rgba(255,255,255,.15); border: 0; color: #fff; width: 26px; height: 26px;
      border-radius: 50%; cursor: pointer; font-size: 13px; }
    .tqa-body { padding: 16px 18px; }
    .tqa-row { display: flex; gap: 12px; margin-bottom: 12px; }
    .tqa-field { flex: 1; }
    .tqa-2 { flex: 2; }
    .tqa-full { flex: 1 1 100%; }
    .tqa-field label { display: block; font-size: 10px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .4px; margin-bottom: 4px; }
    .tqa-field label small { color: #9CA3AF; text-transform: none; font-weight: 600; }
    .req { color: #dc2626; }
    .tqa-ip { width: 100%; padding: 8px 10px; border: 1px solid #ddc8f5; border-radius: 8px;
      font-size: 13px; font-family: inherit; }
    .tqa-ip:focus { outline: 2px solid #c4a6ee; }
    .tqa-ip-err { border-color: #dc2626; background: #fef2f2; }
    .tqa-err { background: #fef2f2; border-left: 4px solid #dc2626; color: #b91c1c;
      padding: 8px 12px; border-radius: 8px; font-size: 12.5px; font-weight: 600; margin-bottom: 12px; white-space: pre-line; }
    .tqa-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 18px;
      border-top: 1px solid #f0e6ff; position: sticky; bottom: 0; background: #fff; border-radius: 0 0 14px 14px; }
    .tqa-btn { padding: 9px 18px; border-radius: 9px; font-size: 13px; font-weight: 700;
      cursor: pointer; font-family: inherit; border: 0; }
    .tqa-btn-cancel { background: #fff; border: 1px solid #d1d5db; color: #374151; }
    .tqa-btn-save { background: #1B2E5C; color: #fff; }
    .tqa-btn-save:disabled { opacity: .6; cursor: not-allowed; }
  `]
})
export class TransporterQuickAddComponent {
  private http = inject(HttpClient);
  private pinSvc = inject(IndiaPincodeService);

  /** AI scan ya kahin se prefill (naam/GST). */
  @Input() prefill: Partial<{ firmName: string; gstNo: string }> | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<any>();

  states = INDIAN_STATES;

  firmName = '';
  contactPerson = '';
  mobile = '';
  whatsapp = '';
  email = '';
  gstNo = '';
  pan = '';
  pincode = '';
  state = '';
  city = '';
  address = '';
  avgDeliveryDays = 3;

  saving = signal(false);
  submitted = signal(false);
  error = signal('');

  ngOnInit() {
    if (this.prefill?.firmName) this.firmName = this.prefill.firmName;
    if (this.prefill?.gstNo) this.gstNo = this.prefill.gstNo.toUpperCase();
  }

  cityOptions(): string[] { return citiesForState(this.state); }

  onPincode() {
    const p = (this.pincode || '').replace(/\D/g, '');
    if (p.length !== 6) return;
    this.pinSvc.byPin(p).subscribe({
      next: (res) => {
        const po = this.pinSvc.firstPo(res);
        if (!po) return;
        this.city = po.District || this.city;
        this.state = matchIndiaState(po.State) || this.state;
      },
      error: () => {}
    });
  }

  onCity() {
    const c = (this.city || '').trim();
    if (!c || this.pincode.length === 6) return;
    this.pinSvc.byCity(c).subscribe({
      next: (res) => {
        const po = this.pinSvc.firstPo(res, this.state || undefined);
        if (!po) return;
        this.pincode = po.Pincode || this.pincode;
        if (!this.state) this.state = matchIndiaState(po.State);
      },
      error: () => {}
    });
  }

  save() {
    this.submitted.set(true);
    if (!this.firmName.trim()) { this.error.set('Firm name zaroori hai'); return; }

    this.error.set('');
    this.saving.set(true);
    this.http.post(`${environment.apiUrl}/api/core/transporters`, {
      firmName: this.firmName.trim(),
      contactPerson: this.contactPerson || null,
      mobile: this.mobile || null,
      whatsapp: this.whatsapp || this.mobile || null,
      gstNo: this.gstNo || null,
      pan: this.pan || null,
      city: this.city || null,
      state: this.state || null,
      pincode: this.pincode || null,
      email: this.email || null,
      address: this.address || null,
      avgDeliveryDays: +this.avgDeliveryDays || 3,
      damageRate: 0,
      rating: 'A',
      stars: 4,
      isActive: true
    }).subscribe({
      next: (t) => {
        this.saving.set(false);
        this.created.emit(t);
        this.close.emit();
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(e?.error?.error ?? 'Save fail — dobara try karo');
      }
    });
  }
}
