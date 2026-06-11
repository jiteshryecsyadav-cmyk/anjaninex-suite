import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MastersService, Transporter } from '../services/masters.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { PaginatorComponent } from '../../../shared/paginator.component';
import { INDIAN_STATES, citiesForState, matchIndiaState } from '../../../shared/india-data';
import { IndiaPincodeService } from '../../../shared/india-pincode.service';

@Component({
  selector: 'app-transporters',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, BackButtonComponent, PaginatorComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <div class="tm-header">
        <div class="tmh-left">
          <span class="tmh-ico">🚚</span>
          <div>
            <h2 class="tmh-title">Transporter Master</h2>
            <p class="tmh-sub">Freight & delivery partners</p>
          </div>
        </div>
        <div class="tmh-right">
          <div class="search-wrap">
            <span class="search-ico">🔍</span>
            <input [(ngModel)]="searchQuery" (input)="onSearch()" type="text" placeholder="Name, GSTIN, city, mobile, contact..." class="search-input">
          </div>
          <button (click)="openAdd()" class="btn-add">+ Add Transporter</button>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi" style="border-left:4px solid #1B2E5C; background:#1B2E5C0d;"><div class="kpi-ico">🚚</div><div class="kpi-num" style="color:#1B2E5C;">{{ list().length }}</div><div class="kpi-lbl">TOTAL</div></div>
        <div class="kpi" style="border-left:4px solid #16a34a; background:#16a34a0d;"><div class="kpi-ico">✅</div><div class="kpi-num" style="color:#16a34a;">{{ activeCount() }}</div><div class="kpi-lbl">ACTIVE</div></div>
        <div class="kpi" style="border-left:4px solid #d97706; background:#d977060d;"><div class="kpi-ico">⭐</div><div class="kpi-num" style="color:#d97706;">{{ aRating() }}</div><div class="kpi-lbl">A+ / A RATED</div></div>
        <div class="kpi" style="border-left:4px solid #0284c7; background:#0284c70d;"><div class="kpi-ico">📊</div><div class="kpi-num" style="color:#0284c7;">{{ avgDelivery() }}d</div><div class="kpi-lbl">AVG DELIVERY</div></div>
      </div>

      <div class="card-wrap mt-4">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
        @else if (filtered().length === 0) {
          <div class="p-8 text-center text-gray-500">No transporters. <a (click)="openAdd()" class="link">Add first transporter</a></div>
        }
        @else {
          <table class="t-table">
            <thead>
              <tr><th class="w-8">#</th><th>FIRM NAME</th><th>CONTACT PERSON</th><th>MOBILE</th><th>GST NO.</th><th>CITY</th><th class="text-center">AVG DELIVERY DAYS</th><th class="text-center">DAMAGE RATE %</th><th class="text-center">RATING</th><th>REMARK</th><th class="text-center">ACTIONS</th></tr>
            </thead>
            <tbody>
              @for (t of pagedTransporters(); track t.id; let i = $index) {
                <tr>
                  <td>{{ (pageClamped()-1)*pageSize() + i + 1 }}</td>
                  <td>
                    <div class="cell-name">
                      <div class="avatar" [style.background]="avatarColor(t.firmName)">{{ initials(t.firmName) }}</div>
                      <div>
                        <div class="name-text">{{ t.firmName }}</div>
                        <div class="name-mob">{{ t.mobile || '—' }}</div>
                      </div>
                    </div>
                  </td>
                  <td>{{ t.contactPerson || '—' }}</td>
                  <td class="font-mono text-xs">{{ t.mobile || '—' }}</td>
                  <td class="font-mono text-xs">{{ t.gstNo || '—' }}</td>
                  <td>{{ t.city || '—' }}</td>
                  <td class="text-center font-mono">{{ t.avgDeliveryDays ?? '—' }}</td>
                  <td class="text-center font-mono">{{ t.damageRate ?? '0' }}</td>
                  <td class="text-center">
                    <span class="rating-tag" [class.r-aplus]="t.rating === 'A+'" [class.r-a]="t.rating === 'A'" [class.r-b]="t.rating === 'B'" [class.r-c]="t.rating === 'C'">
                      {{ t.rating || 'A' }}
                    </span>
                  </td>
                  <td class="text-xs">{{ t.remark || '—' }}</td>
                  <td class="text-center">
                    <button (click)="edit(t)" class="act-btn act-edit" title="Edit">✏️</button>
                    <button (click)="chat(t)" class="act-btn act-chat" title="WhatsApp">💬</button>
                    <button (click)="del(t.id)" class="act-btn act-del" title="Delete">🗑</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <app-paginator [total]="filtered().length" [page]="pageClamped()" [pageSize]="pageSize()"
                         (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event); page.set(1)"></app-paginator>
        }
      </div>

      @if (showForm()) {
        <div class="modal-backdrop" (click)="closeForm()">
          <div class="modal-box" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <div class="modal-title">🚚 {{ editingId() ? 'Edit Transporter' : 'Add Transporter' }}</div>
              <button (click)="closeForm()" class="modal-close">✕</button>
            </div>
            <div class="modal-body">

              <div class="step-head">📋 TRANSPORTER DETAILS</div>
              <form [formGroup]="form" class="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label class="lbl">FIRM NAME *</label>
                  <input formControlName="firmName" placeholder="ADINATH TRANSPORT" class="ip ip-req">
                </div>
                <div>
                  <label class="lbl">CONTACT PERSON</label>
                  <input formControlName="contactPerson" placeholder="Responsible person" class="ip">
                </div>
                <div>
                  <label class="lbl">MOBILE *</label>
                  <input formControlName="mobile" placeholder="9876543210" class="ip">
                </div>
                <div>
                  <label class="lbl">WHATSAPP</label>
                  <input formControlName="whatsapp" placeholder="Same as mobile if blank" class="ip">
                </div>
                <div>
                  <label class="lbl">GST NO.</label>
                  <div class="flex gap-1">
                    <input formControlName="gstNo" placeholder="24XXXXX0000X1ZX" class="ip">
                    <button type="button" (click)="fetchGst()" class="btn-fetch">🔍 Get GST</button>
                  </div>
                </div>
                <div>
                  <label class="lbl">PAN</label>
                  <input formControlName="pan" placeholder="XXXXX0000X" class="ip">
                </div>
                <div>
                  <label class="lbl">PIN CODE <small style="color:#9CA3AF">(dalte hi city/state auto)</small></label>
                  <input formControlName="pincode" placeholder="395002" class="ip" maxlength="6"
                         (input)="onPincodeInput()">
                </div>
                <div>
                  <label class="lbl">STATE</label>
                  <select formControlName="state" class="ip">
                    <option value="">— Select —</option>
                    @for (s of indiaStates; track s.name) {
                      <option [value]="s.name">{{ s.name }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="lbl">CITY</label>
                  <input formControlName="city" placeholder="Type ya choose" class="ip"
                         list="trCityList" (change)="onCityInput()">
                  <datalist id="trCityList">
                    @for (c of cityOptions(); track c) { <option [value]="c"></option> }
                  </datalist>
                </div>
                <div>
                  <label class="lbl">EMAIL</label>
                  <input formControlName="email" placeholder="email@example.com" class="ip">
                </div>
                <div class="col-span-2">
                  <label class="lbl">ADDRESS</label>
                  <textarea formControlName="address" placeholder="Office address" rows="2" class="ip"></textarea>
                </div>
                <div>
                  <label class="lbl">CONTACT MOBILE</label>
                  <input formControlName="contactMobile" placeholder="9876543210" class="ip">
                </div>
                <div>
                  <label class="lbl">OFFICE / LANDLINE</label>
                  <input formControlName="landline" placeholder="0261-XXXXXXX" class="ip">
                </div>
              </form>

              <div class="step-head mt-4">📊 PERFORMANCE METRICS</div>
              <form [formGroup]="form" class="grid grid-cols-4 gap-3 mt-3">
                <div>
                  <label class="lbl">AVG DELIVERY DAYS</label>
                  <input formControlName="avgDeliveryDays" type="number" placeholder="3" class="ip">
                </div>
                <div>
                  <label class="lbl">DAMAGE RATE %</label>
                  <input formControlName="damageRate" type="number" step="0.1" placeholder="0.5" class="ip">
                </div>
                <div>
                  <label class="lbl">RATING</label>
                  <select formControlName="rating" class="ip">
                    <option value="A+">A+ (Excellent)</option>
                    <option value="A">A (Good)</option>
                    <option value="B">B (Average)</option>
                    <option value="C">C (Risky)</option>
                  </select>
                </div>
                <div>
                  <label class="lbl">STARS</label>
                  <select formControlName="stars" class="ip">
                    <option [ngValue]="5">★★★★★</option>
                    <option [ngValue]="4">★★★★☆</option>
                    <option [ngValue]="3">★★★☆☆</option>
                    <option [ngValue]="2">★★☆☆☆</option>
                    <option [ngValue]="1">★☆☆☆☆</option>
                  </select>
                </div>
                <div class="col-span-4">
                  <label class="lbl">REMARK / NOTE</label>
                  <input formControlName="remark" placeholder="Internal note" class="ip">
                </div>
              </form>

            </div>
            <div class="modal-footer">
              <button (click)="closeForm()" class="btn-cancel">Cancel</button>
              <button (click)="save()" [disabled]="form.invalid || saving()" class="btn-save">
                {{ saving() ? 'Saving...' : '✓ Save Transporter' }}
              </button>
            </div>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: block; background: #FAF7F0; min-height: 100vh; padding: 16px 24px; }
    .tm-header { background: #1B2E5C; color: #fff; padding: 14px 22px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .tmh-left { display: flex; align-items: center; gap: 12px; }
    .tmh-ico { font-size: 26px; }
    .tmh-title { font-size: 19px; font-weight: 800; margin: 0; }
    .tmh-sub { font-size: 12px; opacity: 0.85; margin: 0; }
    .tmh-right { display: flex; gap: 10px; align-items: center; }
    .search-wrap { position: relative; width: 280px; }
    .search-ico { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; opacity: 0.7; }
    .search-input { width: 100%; padding: 8px 14px 8px 32px; border: 1px solid rgba(255,255,255,0.3); border-radius: 999px; background: rgba(255,255,255,0.15); color: #fff; font-size: 12px; font-family: inherit; }
    .search-input::placeholder { color: rgba(255,255,255,0.7); }
    .search-input:focus { outline: none; background: rgba(255,255,255,0.25); }
    .btn-add { padding: 9px 18px; background: #DC2626; color: #fff; border: 0; border-radius: 8px; font-size: 13px; font-weight: 800; cursor: pointer; font-family: inherit; box-shadow: 0 2px 6px rgba(220,38,38,0.3); }
    .btn-add:hover { background: #B91C1C; }
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .kpi { background: #fff; border: 1px solid #D6DDEA; border-radius: 10px; padding: 14px; transition: transform 0.15s; }
    .kpi:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(27,46,92,0.08); }
    .kpi-ico { font-size: 22px; }
    .kpi-num { font-size: 26px; font-weight: 900; color: #1B2E5C; font-family: 'JetBrains Mono', monospace; margin-top: 4px; }
    .kpi-lbl { font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.3px; text-transform: uppercase; margin-top: 4px; }
    .card-wrap { background: #fff; border: 1px solid #D6DDEA; border-radius: 12px; overflow: auto; }
    .t-table { width: 100%; font-size: 12px; border-collapse: collapse; min-width: 1200px; }
    .t-table thead { background: #1B2E5C; color: #fff; }
    .t-table th { padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
    .t-table th.text-center { text-align: center; }
    .t-table td { padding: 12px 8px; border-bottom: 1px solid #F5EFE3; vertical-align: middle; }
    .t-table tbody tr:hover { background: #FAF7F0; }
    .cell-name { display: flex; align-items: center; gap: 10px; }
    .avatar { width: 34px; height: 34px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; }
    .name-text { font-weight: 700; color: #1B2E5C; }
    .name-mob { font-size: 10px; color: #6B7280; font-family: 'JetBrains Mono', monospace; }
    .rating-tag { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; font-weight: 800; font-size: 12px; }
    .r-aplus { background: #D1FAE5; color: #047857; }
    .r-a { background: #D1FAE5; color: #047857; }
    .r-b { background: #FEF3C7; color: #92400E; }
    .r-c { background: #FEE2E2; color: #DC2626; }
    .act-btn { background: #FEE2E2; border: 0; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; margin: 0 2px; font-size: 13px; }
    .act-edit { background: #FEF3C7; }
    .act-chat { background: #D1FAE5; }
    .act-del { background: #FEE2E2; }
    .act-btn:hover { transform: scale(1.1); }
    .text-center { text-align: center; }
    .text-xs { font-size: 11px; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .col-span-2 { grid-column: span 2; }
    .col-span-4 { grid-column: span 4; }
    .link { color: #DC2626; text-decoration: underline; cursor: pointer; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(27,46,92,0.6); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .modal-box { background: #fff; border-radius: 14px; width: 100%; max-width: 800px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.3); }
    .modal-header { background: #1B2E5C; color: #fff; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    .modal-title { font-size: 18px; font-weight: 800; }
    .modal-close { background: #DC2626; color: #fff; border: 0; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 16px; }
    .modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
    .modal-footer { padding: 14px 24px; border-top: 1px solid #F5EFE3; display: flex; justify-content: flex-end; gap: 10px; }
    .step-head { font-size: 12px; font-weight: 800; color: #DC2626; letter-spacing: 0.5px; padding-bottom: 6px; border-bottom: 1px solid #F5EFE3; }
    .lbl { display: block; font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.4px; margin-bottom: 4px; text-transform: uppercase; }
    .ip { width: 100%; padding: 8px 10px; border: 1px solid #D6DDEA; border-radius: 6px; font-size: 13px; color: #1B2E5C; background: #FAF7F0; font-family: inherit; }
    .ip:focus { outline: none; border-color: #DC2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.1); }
    .ip-req { background: #FFFBEB; border-color: #FCD34D; }
    .btn-fetch { padding: 8px 12px; background: #1B2E5C; color: #fff; border: 0; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
    .btn-cancel { padding: 9px 20px; background: #fff; border: 1px solid #D6DDEA; color: #4A5878; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .btn-save { padding: 9px 24px; background: #DC2626; color: #fff; border: 0; border-radius: 8px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 6px rgba(220,38,38,0.3); }
    .btn-save:hover:not(:disabled) { background: #B91C1C; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

    @media (max-width: 640px) {
      :host { padding: 12px; }
      /* Header stacks; search + add full width */
      .tm-header { flex-direction: column; align-items: stretch; gap: 12px; padding: 14px 16px; }
      .tmh-right { flex-wrap: wrap; gap: 8px; }
      .search-wrap { width: 100%; }
      .btn-add { width: 100%; }
      /* KPIs two-up */
      .kpi-row { grid-template-columns: 1fr 1fr; }
      /* Table already scrolls (min-width:1200px) — ensure touch scroll */
      .card-wrap { -webkit-overflow-scrolling: touch; }
      /* Modal full width + forms single column */
      .modal-backdrop { padding: 12px; align-items: flex-start; }
      .modal-box { max-width: 100%; width: 100%; }
      .modal-body form { grid-template-columns: 1fr !important; }
      .col-span-2, .col-span-4 { grid-column: span 1; }
    }
  `]
})
export class TransportersComponent {
  private svc = inject(MastersService);
  private fb = inject(FormBuilder);
  private pin = inject(IndiaPincodeService);

  // ===== India location helpers =====
  indiaStates = INDIAN_STATES;
  cityOptions(): string[] { return citiesForState(this.form.value.state || ''); }

  onPincodeInput() {
    const p = (this.form.value.pincode || '').replace(/\D/g, '');
    if (p.length !== 6) return;
    this.pin.byPin(p).subscribe({
      next: (res) => {
        const po = this.pin.firstPo(res);
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
    const city = (this.form.value.city || '').trim();
    if (!city || (this.form.value.pincode || '').length === 6) return;
    this.pin.byCity(city).subscribe({
      next: (res) => {
        const po = this.pin.firstPo(res, this.form.value.state || undefined);
        if (!po) return;
        this.form.patchValue({
          pincode: po.Pincode || this.form.value.pincode,
          state: this.form.value.state || matchIndiaState(po.State)
        });
      },
      error: () => {}
    });
  }

  list = signal<Transporter[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editingId = signal<string | null>(null);
  searchQuery = '';

  form = this.fb.group({
    firmName: ['', Validators.required],
    contactPerson: [''],
    mobile: [''],
    whatsapp: [''],
    gstNo: [''],
    pan: [''],
    city: [''],
    state: [''],
    pincode: [''],
    email: [''],
    address: [''],
    contactMobile: [''],
    landline: [''],
    avgDeliveryDays: [3],
    damageRate: [0.5],
    rating: ['A'],
    stars: [4],
    remark: [''],
    isActive: [true]
  });

  activeCount = computed(() => this.list().filter(t => t.isActive).length);
  aRating = computed(() => this.list().filter(t => t.rating === 'A+' || t.rating === 'A').length);
  avgDelivery = computed(() => {
    const vals = this.list().filter(t => t.avgDeliveryDays).map(t => t.avgDeliveryDays!);
    if (vals.length === 0) return 0;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  });

  filtered = computed(() => {
    const q = this.searchQuery.toLowerCase();
    if (!q) return this.list();
    return this.list().filter(t =>
      t.firmName.toLowerCase().includes(q)
      || (t.mobile || '').includes(q)
      || (t.gstNo || '').toLowerCase().includes(q)
      || (t.city || '').toLowerCase().includes(q)
      || (t.contactPerson || '').toLowerCase().includes(q)
    );
  });

  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageClamped = computed(() => {
    const pages = Math.max(1, Math.ceil(this.filtered().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });
  pagedTransporters = computed(() => {
    const st = (this.pageClamped() - 1) * this.pageSize();
    return this.filtered().slice(st, st + this.pageSize());
  });

  initials(name: string): string { return name.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase(); }
  avatarColor(name: string): string {
    const colors = ['#5c1a8b', '#1B2E5C', '#DC2626', '#F97316', '#10B981', '#3B82F6'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
    return colors[Math.abs(hash) % colors.length];
  }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.svc.listTransporters(this.searchQuery || undefined).subscribe({
      next: (t) => { this.list.set(t); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
  private searchTimer: any;
  onSearch() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.load(), 300); }

  openAdd() {
    this.editingId.set(null);
    this.form.reset({ rating: 'A', stars: 4, avgDeliveryDays: 3, damageRate: 0.5, isActive: true });
    this.showForm.set(true);
  }
  edit(t: Transporter) {
    this.editingId.set(t.id);
    this.form.patchValue({
      firmName: t.firmName, contactPerson: t.contactPerson ?? '', mobile: t.mobile ?? '',
      whatsapp: t.whatsapp ?? '', gstNo: t.gstNo ?? '', pan: t.pan ?? '',
      city: t.city ?? '', state: t.state ?? '', pincode: t.pincode ?? '', email: t.email ?? '',
      address: t.address ?? '', contactMobile: t.contactMobile ?? '', landline: t.landline ?? '',
      avgDeliveryDays: t.avgDeliveryDays ?? 3, damageRate: t.damageRate ?? 0,
      rating: t.rating ?? 'A', stars: t.stars ?? 4, remark: t.remark ?? '',
      isActive: t.isActive
    });
    this.showForm.set(true);
    // City pehle se bhari ho aur pincode khali — to pincode auto le aao
    setTimeout(() => this.onCityInput());
  }
  closeForm() { this.showForm.set(false); }

  fetchGst() {
    const gst = this.form.value.gstNo;
    if (!gst || gst.length < 15) { alert('Enter 15-char GSTIN'); return; }
    alert('🔍 Fetching GST for ' + gst + '... (Coming soon)');
  }
  chat(t: Transporter) {
    const phone = (t.mobile || '').replace(/[^0-9]/g, '');
    if (phone) window.open('https://wa.me/' + phone, '_blank');
  }
  del(id: string) {
    if (!confirm('Transporter delete karna hai?')) return;
    this.svc.deleteTransporter(id).subscribe({
      next: (r: any) => {
        if (r?.soft) alert(r.message || 'Bills me use hua hai — inactive kiya gaya');
        this.load();
      },
      error: (e) => alert('Failed: ' + (e?.error?.error ?? 'unknown'))
    });
  }
  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const data: any = this.form.value;
    const id = this.editingId();
    const obs = id ? this.svc.updateTransporter(id, data) : this.svc.createTransporter(data);
    obs.subscribe({
      next: () => { this.saving.set(false); this.closeForm(); this.load(); },
      error: (e) => { this.saving.set(false); alert('Failed: ' + (e?.error?.error ?? 'unknown')); }
    });
  }
}
