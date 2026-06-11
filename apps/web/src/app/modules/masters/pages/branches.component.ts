import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MastersService, Branch } from '../services/masters.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { INDIAN_STATES, citiesForState, matchIndiaState } from '../../../shared/india-data';
import { IndiaPincodeService } from '../../../shared/india-pincode.service';

@Component({
  selector: 'app-branches',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">

      <div class="page-top-bar">
        <app-back-button></app-back-button>
      </div>

      <div class="bm-header">
        <div class="bmh-left">
          <span class="bmh-ico">🏢</span>
          <div>
            <h2 class="bmh-title">Branch Master</h2>
            <p class="bmh-sub">Offices / locations — list, add, edit, delete</p>
          </div>
        </div>
        <div class="bmh-right">
          <div class="search-wrap">
            <span class="search-ico">🔍</span>
            <input [(ngModel)]="searchQuery" (input)="onSearch()" type="text" placeholder="Code, name, city, phone..." class="search-input">
          </div>
          <button (click)="openAdd()" class="btn-add">+ Add Branch</button>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi" style="border-left:4px solid #1B2E5C; background:#1B2E5C0d;"><div class="kpi-ico">🏢</div><div class="kpi-num" style="color:#1B2E5C;">{{ branches().length }}</div><div class="kpi-lbl">TOTAL BRANCHES</div></div>
        <div class="kpi" style="border-left:4px solid #16a34a; background:#16a34a0d;"><div class="kpi-ico">✅</div><div class="kpi-num" style="color:#16a34a;">{{ activeCount() }}</div><div class="kpi-lbl">ACTIVE</div></div>
        <div class="kpi" style="border-left:4px solid #d91e28; background:#d91e280d;"><div class="kpi-ico">⏸️</div><div class="kpi-num" style="color:#d91e28;">{{ inactiveCount() }}</div><div class="kpi-lbl">INACTIVE</div></div>
        <div class="kpi" style="border-left:4px solid #0284c7; background:#0284c70d;"><div class="kpi-ico">🏛️</div><div class="kpi-num" style="color:#0284c7;">{{ hoCount() }}</div><div class="kpi-lbl">HEAD OFFICE</div></div>
      </div>

      <div class="card-wrap mt-4">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
        @else if (filtered().length === 0) {
          <div class="p-8 text-center text-gray-500">No branches found. <a (click)="openAdd()" class="link">Add your first branch</a></div>
        }
        @else {
          <table class="br-table">
            <thead>
              <tr><th class="w-8">#</th><th>BRANCH</th><th>CODE</th><th>CITY</th><th>PHONE</th><th>EMAIL</th><th class="text-center">STATUS</th><th class="text-center">ACTIONS</th></tr>
            </thead>
            <tbody>
              @for (b of filtered(); track b.id; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td>
                    <div class="cell-name">
                      <div class="avatar" [style.background]="avatarColor(b.name)">{{ initials(b.name) }}</div>
                      <div>
                        <div class="name-text">{{ b.name }} @if (b.isHeadOffice) { <span class="ho-badge">HO</span> }</div>
                        <div class="name-sub">{{ b.state || '' }}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="code-tag">{{ b.code || '—' }}</span></td>
                  <td>{{ b.city || '—' }}</td>
                  <td class="font-mono text-xs">{{ b.phone || '—' }}</td>
                  <td class="text-xs">{{ b.email || '—' }}</td>
                  <td class="text-center">
                    <span class="status-tag" [class.st-active]="b.isActive" [class.st-inactive]="!b.isActive">
                      {{ b.isActive ? '● Active' : '○ Inactive' }}
                    </span>
                  </td>
                  <td class="text-center">
                    <button (click)="edit(b)" class="act-btn act-edit" title="Edit">✏️</button>
                    <button (click)="del(b.id)" class="act-btn act-del" title="Delete">🗑</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <div class="pagination">
            <span>Showing {{ filtered().length }} of {{ branches().length }} · Page 1 of 1</span>
          </div>
        }
      </div>

      @if (showForm()) {
        <div class="modal-backdrop" (click)="closeForm()">
          <div class="modal-box" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <div class="modal-title">🏢 {{ editingId() ? 'Edit Branch' : 'Add Branch' }}</div>
              <button (click)="closeForm()" class="modal-close">✕</button>
            </div>
            <div class="modal-body">
              <div class="step-head">📋 BRANCH DETAILS</div>
              <form [formGroup]="form" class="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label class="lbl">BRANCH CODE</label>
                  <input formControlName="code" placeholder="e.g. SUR-01" class="ip">
                </div>
                <div>
                  <label class="lbl">BRANCH NAME *</label>
                  <input formControlName="name" placeholder="Surat Main" class="ip ip-req">
                </div>
                <div>
                  <label class="lbl">PHONE</label>
                  <input formControlName="phone" placeholder="0261-XXXXXXX" class="ip">
                </div>
                <div>
                  <label class="lbl">EMAIL</label>
                  <input formControlName="email" placeholder="branch@example.com" class="ip">
                </div>
                <div>
                  <label class="lbl">PIN CODE <small style="color:#9CA3AF">(city/state auto)</small></label>
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
                         list="brCityList" (change)="onCityInput()">
                  <datalist id="brCityList">
                    @for (c of cityOptions(); track c) { <option [value]="c"></option> }
                  </datalist>
                </div>
                <div>
                  <label class="lbl">STATUS</label>
                  <select formControlName="isActive" class="ip">
                    <option [ngValue]="true">Active</option>
                    <option [ngValue]="false">Inactive</option>
                  </select>
                </div>
                <div class="col-span-2">
                  <label class="lbl">ADDRESS</label>
                  <textarea formControlName="address" placeholder="Full address" rows="3" class="ip"></textarea>
                </div>
                <div class="col-span-2">
                  <label class="lbl">REMARK</label>
                  <input formControlName="remark" placeholder="Internal note" class="ip">
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button (click)="closeForm()" class="btn-cancel">Cancel</button>
              <button (click)="save()" [disabled]="form.invalid || saving()" class="btn-save">
                {{ saving() ? 'Saving...' : '✓ Save' }}
              </button>
            </div>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: block; background: #FAF7F0; min-height: 100vh; padding: 16px 24px; }

    .bm-header {
      background: #1B2E5C; color: #fff; padding: 14px 22px; border-radius: 12px;
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;
    }
    .bmh-left { display: flex; align-items: center; gap: 12px; }
    .bmh-ico { font-size: 26px; }
    .bmh-title { font-size: 19px; font-weight: 800; margin: 0; }
    .bmh-sub { font-size: 12px; opacity: 0.85; margin: 0; }
    .bmh-right { display: flex; gap: 10px; align-items: center; }

    .search-wrap { position: relative; width: 280px; }
    .search-ico { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; opacity: 0.7; }
    .search-input {
      width: 100%; padding: 8px 14px 8px 32px; border: 1px solid rgba(255,255,255,0.3);
      border-radius: 999px; background: rgba(255,255,255,0.15); color: #fff;
      font-size: 12px; font-family: inherit;
    }
    .search-input::placeholder { color: rgba(255,255,255,0.7); }
    .search-input:focus { outline: none; background: rgba(255,255,255,0.25); border-color: rgba(255,255,255,0.5); }

    .btn-add {
      padding: 9px 18px; background: #DC2626; color: #fff; border: 0; border-radius: 8px;
      font-size: 13px; font-weight: 800; cursor: pointer; font-family: inherit;
      box-shadow: 0 2px 6px rgba(220,38,38,0.3);
    }
    .btn-add:hover { background: #B91C1C; }

    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .kpi {
      background: #fff; border: 1px solid #D6DDEA; border-radius: 10px; padding: 14px;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .kpi:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(27,46,92,0.08); }
    .kpi-ico { font-size: 22px; }
    .kpi-num { font-size: 26px; font-weight: 900; color: #1B2E5C; font-family: 'JetBrains Mono', monospace; margin-top: 4px; }
    .kpi-lbl { font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.3px; text-transform: uppercase; margin-top: 4px; }

    .card-wrap { background: #fff; border: 1px solid #D6DDEA; border-radius: 12px; overflow: hidden; }
    .br-table { width: 100%; font-size: 13px; border-collapse: collapse; }
    .br-table thead { background: #1B2E5C; color: #fff; }
    .br-table th { padding: 12px 10px; text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
    .br-table th.text-center { text-align: center; }
    .br-table td { padding: 14px 10px; border-bottom: 1px solid #F5EFE3; vertical-align: middle; }
    .br-table tbody tr:hover { background: #FAF7F0; }

    .cell-name { display: flex; align-items: center; gap: 10px; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; }
    .name-text { font-weight: 700; color: #1B2E5C; }
    .name-sub { font-size: 10px; color: #6B7280; margin-top: 2px; }
    .ho-badge { background: #FCD34D; color: #92400E; padding: 1px 6px; border-radius: 4px; font-size: 9px; margin-left: 4px; }
    .code-tag { background: #F5EFE3; color: #5c1a8b; padding: 3px 8px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; }
    .status-tag { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; }
    .st-active { background: #D1FAE5; color: #047857; }
    .st-inactive { background: #FEE2E2; color: #DC2626; }
    .act-btn { background: #FEE2E2; border: 0; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; margin: 0 2px; font-size: 13px; }
    .act-edit { background: #FEF3C7; }
    .act-del { background: #FEE2E2; }
    .act-btn:hover { transform: scale(1.1); }

    .pagination { padding: 12px 14px; font-size: 12px; color: #6B7280; border-top: 1px solid #F5EFE3; }
    .link { color: #DC2626; text-decoration: underline; cursor: pointer; }
    .text-center { text-align: center; }
    .text-xs { font-size: 11px; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .col-span-2 { grid-column: span 2; }

    /* Modal */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(27,46,92,0.6); z-index: 100;
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .modal-box {
      background: #fff; border-radius: 14px; width: 100%; max-width: 700px;
      max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;
      box-shadow: 0 24px 64px rgba(0,0,0,0.3);
    }
    .modal-header {
      background: #1B2E5C; color: #fff; padding: 16px 24px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal-title { font-size: 18px; font-weight: 800; }
    .modal-close { background: #DC2626; color: #fff; border: 0; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 16px; }
    .modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
    .modal-footer { padding: 14px 24px; border-top: 1px solid #F5EFE3; display: flex; justify-content: flex-end; gap: 10px; }

    .step-head { font-size: 12px; font-weight: 800; color: #DC2626; letter-spacing: 0.5px; padding-bottom: 6px; border-bottom: 1px solid #F5EFE3; }

    .lbl { display: block; font-size: 10px; font-weight: 700; color: #4A5878; letter-spacing: 0.4px; margin-bottom: 4px; text-transform: uppercase; }
    .ip {
      width: 100%; padding: 8px 10px; border: 1px solid #D6DDEA; border-radius: 6px;
      font-size: 13px; color: #1B2E5C; background: #FAF7F0; font-family: inherit;
    }
    .ip:focus { outline: none; border-color: #DC2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.1); }
    .ip-req { background: #FFFBEB; border-color: #FCD34D; }
    select.ip, textarea.ip { font-family: inherit; }

    .btn-cancel { padding: 9px 20px; background: #fff; border: 1px solid #D6DDEA; color: #4A5878; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .btn-cancel:hover { background: #F5EFE3; }
    .btn-save { padding: 9px 24px; background: #DC2626; color: #fff; border: 0; border-radius: 8px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 6px rgba(220,38,38,0.3); }
    .btn-save:hover:not(:disabled) { background: #B91C1C; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class BranchesComponent {
  private svc = inject(MastersService);
  private fb = inject(FormBuilder);
  private pinSvc = inject(IndiaPincodeService);

  // ===== India location helpers =====
  indiaStates = INDIAN_STATES;
  cityOptions(): string[] { return citiesForState(this.form?.value?.state || ''); }

  onPincodeInput() {
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

  branches = signal<Branch[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editingId = signal<string | null>(null);
  searchQuery = '';

  form = this.fb.group({
    code: [''],
    name: ['', Validators.required],
    phone: [''],
    email: [''],
    city: [''],
    state: [''],
    pincode: [''],
    address: [''],
    remark: [''],
    isActive: [true]
  });

  activeCount = computed(() => this.branches().filter(b => b.isActive).length);
  inactiveCount = computed(() => this.branches().filter(b => !b.isActive).length);
  hoCount = computed(() => this.branches().filter(b => b.isHeadOffice).length);

  filtered = computed(() => {
    const q = this.searchQuery.toLowerCase();
    if (!q) return this.branches();
    return this.branches().filter(b =>
      b.name.toLowerCase().includes(q)
      || (b.code || '').toLowerCase().includes(q)
      || (b.city || '').toLowerCase().includes(q)
      || (b.phone || '').includes(q)
    );
  });

  initials(name: string): string {
    return name.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
  }
  avatarColor(name: string): string {
    const colors = ['#5c1a8b', '#1B2E5C', '#DC2626', '#F97316', '#10B981', '#3B82F6'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
    return colors[Math.abs(hash) % colors.length];
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.listBranches(this.searchQuery || undefined).subscribe({
      next: (b) => { this.branches.set(b); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  private searchTimer: any;
  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  openAdd() {
    this.editingId.set(null);
    this.form.reset({ isActive: true });
    this.showForm.set(true);
  }
  edit(b: Branch) {
    this.editingId.set(b.id);
    this.form.patchValue({
      code: b.code, name: b.name, phone: b.phone ?? '', email: b.email ?? '',
      city: b.city ?? '', state: b.state ?? '', pincode: b.pincode ?? '',
      address: b.address ?? '', isActive: b.isActive
    });
    this.showForm.set(true);
    // City bhari ho aur pincode khali — auto le aao
    setTimeout(() => this.onCityInput());
  }
  closeForm() { this.showForm.set(false); }

  del(id: string) {
    if (!confirm('Deactivate this branch?')) return;
    this.svc.deleteBranch(id).subscribe({
      next: () => this.load(),
      error: (e) => alert('Failed: ' + (e?.error?.error ?? 'unknown'))
    });
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v: any = this.form.value;
    const data: any = {
      code: v.code || '', name: v.name, phone: v.phone, email: v.email,
      address: v.address, city: v.city, state: v.state, pincode: v.pincode,
      isActive: v.isActive
    };
    const id = this.editingId();
    const obs = id ? this.svc.updateBranch(id, data) : this.svc.createBranch(data);
    obs.subscribe({
      next: () => { this.saving.set(false); this.closeForm(); this.load(); },
      error: (e) => { this.saving.set(false); alert('Failed: ' + (e?.error?.error ?? 'unknown')); }
    });
  }
}
