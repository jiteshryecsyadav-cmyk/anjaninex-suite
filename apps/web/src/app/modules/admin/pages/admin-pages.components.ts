import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminService, FirmListItem, FirmDetail, WalletTxn, Plan, AgentCost, SavePlan, CreateFirmReq, AgentListItem } from '../services/admin.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

const subNav = `
  <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
    <a routerLink="/admin/dashboard" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       [routerLinkActiveOptions]="{exact:true}"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
    <a routerLink="/admin/firms" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🏢 Firms</a>
    <a routerLink="/admin/agents" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">👥 Agents</a>
    <a routerLink="/admin/firm-report" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📈 Report</a>
    <a routerLink="/admin/plans" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💼 Plans</a>
    <a routerLink="/admin/billing" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💳 Billing</a>
    <a routerLink="/admin/ai-monitor" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🤖 AI Monitor</a>
    <a routerLink="/admin/changelog" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📝 Changelog</a>
  </div>
`;

// =============================================================================
// FIRMS LIST
// =============================================================================
@Component({
  selector: 'app-admin-firms',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, DatePipe, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🏢 Tenant Firms</h2>
          <p class="text-sm text-[#6b3fa0]">All firms across the platform</p>
        </div>
        <div class="flex gap-2">
          <button (click)="openAddFirm()" class="btn-primary">🏢 + Add Firm</button>
          <button (click)="extendAll()" class="btn-primary">🗓️ Extend All</button>
        </div>
      </div>

      ${subNav}

      <div class="flex gap-3 mb-4">
        <input [(ngModel)]="search" (input)="onSearch()" placeholder="🔍 Search by name, GST, email..." class="input flex-1">
        <select [(ngModel)]="status" (change)="load()" class="input w-48">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspended</option>
          <option value="churned">Churned</option>
        </select>
      </div>

      <div class="card p-0 overflow-x-auto">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (firms().length === 0) {
          <div class="p-8 text-center text-gray-500">No firms found</div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-3 py-2 text-left">Firm</th>
                <th class="px-3 py-2 text-left">GST</th>
                <th class="px-3 py-2 text-left">Contact</th>
                <th class="px-3 py-2 text-left">Plan</th>
                <th class="px-3 py-2 text-center">Status</th>
                <th class="px-3 py-2 text-right">Wallet</th>
                <th class="px-3 py-2 text-right">MTD Spend</th>
                <th class="px-3 py-2 text-left">Joined</th>
                <th class="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (f of firms(); track f.id) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-3 py-2">
                    <a [routerLink]="['/admin/firms', f.id]" class="font-semibold text-[#5c1a8b] hover:underline">{{ f.name }}</a>
                    @if (f.city) { <div class="text-xs text-gray-500">{{ f.city }}</div> }
                  </td>
                  <td class="px-3 py-2 font-mono text-xs">{{ f.gst }}</td>
                  <td class="px-3 py-2 text-xs">{{ f.contactEmail }}</td>
                  <td class="px-3 py-2 text-xs uppercase font-bold text-[#5c1a8b]">{{ f.planCode }}</td>
                  <td class="px-3 py-2 text-center">
                    <span class="text-xs px-2 py-0.5 rounded uppercase font-bold"
                          [class.bg-green-100]="f.status === 'active'"
                          [class.text-green-700]="f.status === 'active'"
                          [class.bg-yellow-100]="f.status === 'trial'"
                          [class.text-yellow-700]="f.status === 'trial'"
                          [class.bg-red-100]="f.status === 'suspended'"
                          [class.text-red-700]="f.status === 'suspended'"
                          [class.bg-gray-100]="f.status === 'churned'"
                          [class.text-gray-700]="f.status === 'churned'">
                      {{ f.status }}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right font-mono"
                      [class.text-red-600]="f.walletBalance < 500"
                      [class.font-bold]="f.walletBalance < 500">
                    ₹{{ f.walletBalance | number:'1.2-2' }}
                  </td>
                  <td class="px-3 py-2 text-right font-mono">₹{{ f.mtdSpend | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-xs">{{ f.createdAt | date:'mediumDate' }}</td>
                  <td class="px-3 py-2 text-center">
                    <div class="flex gap-1 justify-center">
                      <a [routerLink]="['/admin/firms', f.id, 'subscription']"
                         title="Manage Plan & Modules"
                         class="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-[#5c1a8b] to-[#7c2dab] text-white rounded text-xs font-semibold hover:from-[#4a1570] hover:to-[#6a2599] no-underline shadow-sm whitespace-nowrap">
                        ⚙️ Manage
                      </a>
                      <a [routerLink]="['/admin/firms', f.id]"
                         title="View Detail"
                         class="inline-flex items-center px-2 py-1 border border-[#5c1a8b] text-[#5c1a8b] rounded text-xs font-semibold hover:bg-purple-50 no-underline">
                        👁
                      </a>
                      @if (f.status === 'suspended') {
                        <button (click)="toggleFirm(f)" [disabled]="busyId() === f.id"
                                title="Activate — firm phir se use kar payega"
                                class="inline-flex items-center px-2 py-1 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 whitespace-nowrap">
                          ✓ Activate
                        </button>
                      } @else {
                        <button (click)="toggleFirm(f)" [disabled]="busyId() === f.id"
                                title="Deactivate — firm kuch use nahi kar payega"
                                class="inline-flex items-center px-2 py-1 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 whitespace-nowrap">
                          ⛔ Deactivate
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Add Firm modal -->
      @if (showAdd()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="showAdd.set(false)">
          <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-5" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-[#5c1a8b] mb-1">🏢 Naya Firm + Admin</h3>
            <p class="text-xs text-gray-500 mb-3">Sirf firm + admin login banega. Admin khud login karke users / branches / roles set karega.</p>
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2"><label class="fl">Firm Name *</label><input [(ngModel)]="nf.name" class="fi"></div>
              <div><label class="fl">Firm Type</label>
                <select [(ngModel)]="nf.firmType" class="fi">
                  <option value="proprietorship">Proprietorship</option>
                  <option value="partnership">Partnership</option>
                  <option value="llp">LLP</option>
                  <option value="pvt_ltd">Pvt Ltd</option>
                </select>
              </div>
              <div><label class="fl">Legal Name</label><input [(ngModel)]="nf.legalName" class="fi"></div>
              <div><label class="fl">GST</label><input [(ngModel)]="nf.gst" class="fi font-mono uppercase"></div>
              <div><label class="fl">PAN</label><input [(ngModel)]="nf.pan" class="fi font-mono uppercase"></div>
              <div><label class="fl">Plan</label>
                <select [(ngModel)]="nf.planId" class="fi">
                  <option [ngValue]="null">— Trial (no plan) —</option>
                  @for (p of plans(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
                </select>
              </div>
              <div><label class="fl">City</label>
                <input [(ngModel)]="nf.city" class="fi" list="cityList" placeholder="Type/Select city">
                <datalist id="cityList">@for (c of cities; track c) { <option [value]="c"></option> }</datalist>
              </div>
              <div><label class="fl">State</label>
                <input [(ngModel)]="nf.state" class="fi" list="stateList" placeholder="Type/Select state">
                <datalist id="stateList">@for (s of states; track s) { <option [value]="s"></option> }</datalist>
              </div>
              <div><label class="fl">Contact Email *</label><input [(ngModel)]="nf.contactEmail" class="fi"></div>
              <div><label class="fl">Contact Phone</label><input [(ngModel)]="nf.contactPhone" class="fi"></div>
            </div>
            <h4 class="font-bold text-sm text-[#5c1a8b] mt-4 mb-2">🏦 Bank Details</h4>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="fl">Bank Name</label><input [(ngModel)]="nf.bankName" class="fi" placeholder="ICICI Bank"></div>
              <div><label class="fl">Account No.</label><input [(ngModel)]="nf.accountNo" class="fi font-mono"></div>
              <div><label class="fl">IFSC Code</label><input [(ngModel)]="nf.ifsc" class="fi font-mono uppercase" placeholder="ICIC0001234"></div>
            </div>
            <h4 class="font-bold text-sm text-[#5c1a8b] mt-4 mb-2">👤 Admin Login</h4>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="fl">Admin Name</label><input [(ngModel)]="nf.adminFullName" class="fi"></div>
              <div><label class="fl">Username *</label><input [(ngModel)]="nf.adminUsername" class="fi"></div>
              <div><label class="fl">Password * (min 6)</label><input [(ngModel)]="nf.adminPassword" class="fi"></div>
              <div><label class="fl">Mobile No</label><input [(ngModel)]="nf.adminMobile" class="fi font-mono" inputmode="numeric"></div>
              <div><label class="fl">WhatsApp No</label><input [(ngModel)]="nf.adminWhatsapp" class="fi font-mono" inputmode="numeric"></div>
            </div>

            <!-- Partners (extra admin, optional) -->
            <div class="flex items-center justify-between mt-4 mb-2">
              <h4 class="font-bold text-sm text-[#5c1a8b]">🤝 Partners (extra admin) — optional</h4>
              <button type="button" (click)="addPartner()" [disabled]="(nf.partners?.length ?? 0) >= 3"
                      class="text-xs px-2 py-1 rounded bg-[#f0e6ff] text-[#5c1a8b] font-bold disabled:opacity-40">+ Add Partner</button>
            </div>
            @for (p of nf.partners; track $index; let i = $index) {
              <div class="border border-[#e7d9fb] rounded-lg p-3 mb-2 bg-[#faf7ff]">
                <div class="flex items-center justify-between mb-2">
                  <span class="fl !mb-0">Partner {{ i + 1 }}</span>
                  <button type="button" (click)="removePartner(i)" class="text-xs text-red-600 font-bold hover:underline">✕ Hatao</button>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  <div><label class="fl">Name</label><input [(ngModel)]="p.fullName" class="fi"></div>
                  <div><label class="fl">Username</label><input [(ngModel)]="p.username" class="fi"></div>
                  <div><label class="fl">Password (min 6)</label><input [(ngModel)]="p.password" class="fi"></div>
                  <div><label class="fl">Mobile No</label><input [(ngModel)]="p.mobile" class="fi font-mono" inputmode="numeric"></div>
                  <div><label class="fl">WhatsApp No</label><input [(ngModel)]="p.whatsapp" class="fi font-mono" inputmode="numeric"></div>
                </div>
              </div>
            }
            @if ((nf.partners?.length ?? 0) > 0) {
              <p class="text-[10px] text-gray-400">Har partner ko full-access (Firm Owner) admin login milega.</p>
            }
            <h4 class="font-bold text-sm text-[#5c1a8b] mt-4 mb-2">👥 Referral (optional)</h4>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="fl">Agent (code + naam — search/select)</label>
                <input [(ngModel)]="nf.agentCode" (change)="onAgentPick(nf.agentCode!)" (blur)="checkAgentCode()"
                       class="fi font-mono" list="agentList" placeholder="Naam ya code se dhundo">
                <datalist id="agentList">
                  @for (a of agents(); track a.id) { <option [value]="a.code + ' — ' + a.name"></option> }
                </datalist>
                @if (agentName()) { <div class="text-xs text-green-700 mt-1">✓ {{ agentName() }}</div> }
                @if (agentErr()) { <div class="text-xs text-red-600 mt-1">{{ agentErr() }}</div> }
              </div>
            </div>
            @if (addErr()) { <div class="text-red-600 text-sm mt-2">{{ addErr() }}</div> }
            <div class="flex justify-end gap-2 mt-4">
              <button (click)="showAdd.set(false)" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button (click)="saveFirm()" [disabled]="addSaving()" class="btn-primary">{{ addSaving() ? 'Ban raha…' : 'Create Firm + Admin' }}</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .fl { font-size: 10px; font-weight: 800; color: #6b3fa0; text-transform: uppercase; display:block; margin-bottom:3px; }
    .fi { width: 100%; padding: 8px 10px; border: 1.5px solid #ddc8f5; border-radius: 8px; font-size: 13px; outline: none; }
    .fi:focus { border-color: #5c1a8b; }

    /* ===== MOBILE (<=640px) ===== */
    @media (max-width: 640px) {
      .grid-cols-2, .grid-cols-3 { grid-template-columns: 1fr !important; }
      .col-span-2 { grid-column: span 1 !important; }
    }
  `]
})
export class AdminFirmsComponent {
  private svc = inject(AdminService);
  firms = signal<FirmListItem[]>([]);
  loading = signal(true);
  busyId = signal<string | null>(null);
  search = '';
  status = '';

  // Active ⇄ Deactivate toggle. Deactivate → status 'suspended' → firm sab kuch use karna band.
  toggleFirm(f: FirmListItem) {
    const deactivating = f.status !== 'suspended';
    const msg = deactivating
      ? `"${f.name}" ko DEACTIVATE karein?\nFirm ke saare users login/feature use nahi kar payenge.`
      : `"${f.name}" ko ACTIVATE karein?\nFirm phir se normal use kar payegi.`;
    if (!confirm(msg)) return;
    this.busyId.set(f.id);
    const req = deactivating ? this.svc.suspend(f.id) : this.svc.activate(f.id);
    req.subscribe({
      next: () => { this.busyId.set(null); this.load(); },
      error: (e: any) => { this.busyId.set(null); alert(e?.error?.error ?? 'Status change nahi hua'); }
    });
  }

  plans = signal<Plan[]>([]);
  showAdd = signal(false);
  addSaving = signal(false);
  addErr = signal('');
  nf: CreateFirmReq = this.blankFirm();

  blankFirm(): CreateFirmReq {
    return { name: '', legalName: '', gst: '', pan: '', city: '', state: '',
             firmType: 'proprietorship',
             contactEmail: '', contactPhone: '', planId: null,
             bankName: '', accountNo: '', ifsc: '',
             adminFullName: '', adminUsername: '', adminPassword: '', adminMobile: '', adminWhatsapp: '', agentCode: '',
             partners: [] };
  }

  // Partner = extra admin login (firm_owner). Main admin + max 3 partner = 4 admin tak.
  addPartner() {
    if ((this.nf.partners?.length ?? 0) < 3)
      this.nf.partners!.push({ fullName: '', username: '', password: '', mobile: '', whatsapp: '' });
  }
  removePartner(i: number) { this.nf.partners!.splice(i, 1); }

  agentName = signal('');
  agentErr = signal('');
  checkAgentCode() {
    const code = (this.nf.agentCode || '').trim();
    this.agentName.set(''); this.agentErr.set('');
    if (!code) return;
    this.svc.resolveAgentCode(code).subscribe({
      next: (a) => this.agentName.set(`${a.name} (${a.status})`),
      error: () => this.agentErr.set('Agent code nahi mila')
    });
  }

  // Agent searchable dropdown — code + naam; select pe code auto-fill.
  agents = signal<AgentListItem[]>([]);
  // State/City searchable dropdowns (datalist).
  readonly states = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Puducherry','Chandigarh','Andaman and Nicobar Islands','Dadra and Nagar Haveli and Daman and Diu','Lakshadweep'];
  readonly cities = ['Mumbai','Delhi','Bengaluru','Hyderabad','Ahmedabad','Chennai','Kolkata','Surat','Pune','Jaipur','Lucknow','Kanpur','Nagpur','Indore','Bhopal','Patna','Ludhiana','Agra','Vadodara','Rajkot','Varanasi','Coimbatore','Madurai','Nashik','Faridabad','Ghaziabad','Amritsar','Jodhpur','Raipur','Ranchi','Guwahati','Chandigarh','Gurugram','Noida','Bhilwara','Erode','Tiruppur','Salem','Panipat','Bhiwandi'];

  // Agent datalist se "CODE — Naam" pick hone par code nikaal kar fill + resolve.
  onAgentPick(value: string) {
    const code = (value || '').split('—')[0].trim().toUpperCase();
    this.nf.agentCode = code;
    this.checkAgentCode();
  }

  ngOnInit() {
    this.load();
    this.svc.listPlans().subscribe(p => this.plans.set(p));
    this.svc.listAgents().subscribe({ next: a => this.agents.set(a), error: () => {} });
  }

  openAddFirm() { this.nf = this.blankFirm(); this.addErr.set(''); this.showAdd.set(true); }

  saveFirm() {
    const f = this.nf;
    if (!f.name?.trim() || !f.contactEmail?.trim() || !f.adminUsername?.trim() || !f.adminPassword?.trim()) {
      this.addErr.set('Firm Name, Contact Email, Username, Password zaroori hain.'); return;
    }
    if (f.adminPassword.length < 6) { this.addErr.set('Password kam se kam 6 character.'); return; }
    // Khali partner rows hatao; jisme username hai uska password 6+ zaroori.
    f.partners = (f.partners ?? []).filter(p => p.username?.trim());
    for (const p of f.partners) {
      if ((p.password ?? '').length < 6) { this.addErr.set(`Partner '${p.username}' ka password kam se kam 6 character.`); return; }
    }
    this.addSaving.set(true); this.addErr.set('');
    this.svc.createFirm(f).subscribe({
      next: (r) => {
        this.addSaving.set(false); this.showAdd.set(false);
        alert(`✓ Firm ban gaya!\nAdmin login → username: ${r.username}\npassword: ${f.adminPassword}\n\n(Admin login karke users/branches/roles set karega.)`);
        this.load();
      },
      error: (e) => { this.addSaving.set(false); this.addErr.set(e?.error?.error ?? 'Firm nahi bana'); }
    });
  }

  load() {
    this.loading.set(true);
    this.svc.listFirms(this.search || undefined, this.status || undefined).subscribe({
      next: (f) => { this.firms.set(f); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  private timer: any;
  onSearch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), 300);
  }

  // SAARE firms ko ek saath extend
  extendAll() {
    const d = prompt(`SAARE ${this.firms().length}+ firms ko kitne DIN extend karein? (30 = 1 month, 365 = 1 year)`, '30');
    if (d === null) return;
    const days = parseInt(d, 10);
    if (isNaN(days) || days <= 0) { alert('Sahi din number daalein.'); return; }
    if (!confirm(`Pakka? Sab firms ${days} din extend honge.`)) return;
    this.svc.extendBulk(days).subscribe({
      next: (r) => { alert(`✓ ${r.count} firms ${days} din extend ho gaye.`); this.load(); },
      error: (e) => alert(e?.error?.error ?? 'Extend nahi hua')
    });
  }
}

// =============================================================================
// FIRM DETAIL
// =============================================================================
@Component({
  selector: 'app-admin-firm-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DecimalPipe, DatePipe],
  template: `
    <div class="max-w-6xl mx-auto">
      <a routerLink="/admin/firms" class="back-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
        Back to Firms
      </a>

      @if (loading()) {
        <div class="card mt-4 text-center text-gray-500">Loading…</div>
      }
      @if (firm(); as f) {

        <!-- Header -->
        <div class="card mt-4 mb-4">
          <div class="flex items-start justify-between">
            <div>
              <h2 class="font-display font-black text-3xl text-[#5c1a8b]">{{ f.name }}</h2>
              @if (f.legalName) { <p class="text-sm text-gray-600">{{ f.legalName }}</p> }
              <div class="flex flex-wrap gap-3 mt-2 text-sm">
                <span class="px-2 py-0.5 rounded uppercase font-bold text-xs"
                      [class.bg-green-100]="f.status === 'active'"
                      [class.text-green-700]="f.status === 'active'"
                      [class.bg-yellow-100]="f.status === 'trial'"
                      [class.text-yellow-700]="f.status === 'trial'"
                      [class.bg-red-100]="f.status === 'suspended'"
                      [class.text-red-700]="f.status === 'suspended'">{{ f.status }}</span>
                <span class="text-gray-500">📋 {{ f.gst }}</span>
                <span class="text-gray-500">📍 {{ f.city }}, {{ f.state }}</span>
                <span class="text-gray-500">✉ {{ f.contactEmail }}</span>
                <span class="text-gray-500">📞 {{ f.contactPhone }}</span>
              </div>
            </div>
            <div class="flex gap-2">
              <a [routerLink]="['/admin/firms', f.id, 'subscription']"
                 class="px-3 py-1.5 border border-[#5c1a8b] text-[#5c1a8b] rounded text-sm hover:bg-purple-50 font-semibold no-underline">
                ⚙️ Subscription & Modules
              </a>
              @if (f.status === 'active') {
                <button (click)="suspend()" class="px-3 py-1.5 border border-red-500 text-red-600 rounded text-sm hover:bg-red-50">⏸ Suspend</button>
              } @else {
                <button (click)="activate()" class="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">✓ Activate</button>
              }
              <button (click)="showRecharge.set(true)" class="btn-primary text-sm py-1.5">+ Recharge Wallet</button>
            </div>
          </div>
        </div>

        <!-- Stats grid -->
        <div class="grid grid-cols-4 gap-3 mb-4">
          <div class="card">
            <div class="text-xs text-gray-500 uppercase font-bold">Plan</div>
            <div class="text-lg font-bold text-[#5c1a8b]">{{ f.planName }}</div>
            <div class="text-xs text-gray-400">₹{{ f.planMonthlyInr | number:'1.0-0' }}/mo</div>
          </div>
          <div class="card">
            <div class="text-xs text-gray-500 uppercase font-bold">Wallet Balance</div>
            <div class="text-lg font-bold" [class.text-red-600]="f.walletBalance < 500">
              ₹{{ f.walletBalance | number:'1.2-2' }}
            </div>
            <div class="text-xs text-gray-400">Credit: ₹{{ f.creditLimit | number:'1.0-0' }}</div>
          </div>
          <div class="card">
            <div class="text-xs text-gray-500 uppercase font-bold">Lifetime Revenue</div>
            <div class="text-lg font-bold text-green-600">₹{{ f.lifetimeRevenue | number:'1.2-2' }}</div>
          </div>
          <div class="card">
            <div class="text-xs text-gray-500 uppercase font-bold">Lifetime Spend</div>
            <div class="text-lg font-bold">₹{{ f.lifetimeSpend | number:'1.2-2' }}</div>
          </div>
        </div>

        <!-- Usage -->
        <div class="grid grid-cols-5 gap-3 mb-4">
          <div class="card text-center">
            <div class="text-2xl mb-1">🏪</div><div class="text-xl font-bold">{{ f.branchCount }}</div>
            <div class="text-xs text-gray-500">Branches</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl mb-1">👥</div><div class="text-xl font-bold">{{ f.userCount }}</div>
            <div class="text-xs text-gray-500">Users</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl mb-1">🧾</div><div class="text-xl font-bold">{{ f.billCount }}</div>
            <div class="text-xs text-gray-500">Bills</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl mb-1">📝</div><div class="text-xl font-bold">{{ f.voucherCount }}</div>
            <div class="text-xs text-gray-500">Vouchers</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl mb-1">🚚</div><div class="text-xl font-bold">{{ f.supplierCount }}</div>
            <div class="text-xs text-gray-500">Suppliers</div>
          </div>
        </div>

        <!-- Wallet history -->
        <div class="card p-0 overflow-hidden">
          <div class="px-4 py-3 border-b bg-[#f0e6ff]">
            <h3 class="font-display font-bold text-[#5c1a8b]">💰 Wallet History (last 50)</h3>
          </div>
          @if (wallet().length === 0) {
            <div class="p-6 text-center text-gray-400">No transactions</div>
          } @else {
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-xs uppercase">
                <tr>
                  <th class="px-3 py-2 text-left">Date</th>
                  <th class="px-3 py-2 text-left">Type</th>
                  <th class="px-3 py-2 text-right">Amount</th>
                  <th class="px-3 py-2 text-right">Balance After</th>
                  <th class="px-3 py-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                @for (w of wallet(); track w.id) {
                  <tr class="border-t">
                    <td class="px-3 py-2 text-xs">{{ w.createdAt | date:'short' }}</td>
                    <td class="px-3 py-2">
                      <span class="text-xs px-2 py-0.5 rounded uppercase"
                            [class.bg-green-100]="w.txnType.includes('recharge') || w.amount > 0"
                            [class.text-green-700]="w.txnType.includes('recharge') || w.amount > 0"
                            [class.bg-red-100]="w.amount < 0"
                            [class.text-red-700]="w.amount < 0">{{ w.txnType }}</span>
                    </td>
                    <td class="px-3 py-2 text-right font-mono font-bold"
                        [class.text-green-700]="w.amount > 0"
                        [class.text-red-700]="w.amount < 0">
                      {{ w.amount > 0 ? '+' : '' }}₹{{ w.amount | number:'1.2-2' }}
                    </td>
                    <td class="px-3 py-2 text-right font-mono">₹{{ w.balanceAfter | number:'1.2-2' }}</td>
                    <td class="px-3 py-2 text-xs text-gray-600">{{ w.description }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }

      <!-- Recharge modal -->
      @if (showRecharge()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="showRecharge.set(false)">
          <div class="bg-white rounded-2xl p-6 w-full max-w-md" (click)="$event.stopPropagation()">
            <h3 class="font-display font-bold text-lg text-[#5c1a8b] mb-4">Recharge {{ firm()?.name }}</h3>
            <div class="grid gap-3">
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Amount (₹) *</label>
                <input [(ngModel)]="rechargeAmount" type="number" step="0.01" class="input text-xl font-bold">
              </div>
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Source</label>
                <select [(ngModel)]="rechargeSource" class="input">
                  <option value="manual">Manual (Anjaninex)</option>
                  <option value="upi">UPI</option>
                  <option value="neft">NEFT/RTGS</option>
                  <option value="razorpay">Razorpay (future)</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Reference / UTR</label>
                <input [(ngModel)]="rechargeRef" class="input">
              </div>
              <div class="flex justify-end gap-2 mt-2">
                <button (click)="showRecharge.set(false)" class="px-4 py-2 border rounded text-sm">Cancel</button>
                <button (click)="doRecharge()" class="btn-primary" [disabled]="!rechargeAmount || rechargeAmount <= 0">
                  Confirm Recharge
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class AdminFirmDetailComponent {
  private svc = inject(AdminService);
  private route = inject(ActivatedRoute);

  firm = signal<FirmDetail | null>(null);
  wallet = signal<WalletTxn[]>([]);
  loading = signal(true);
  showRecharge = signal(false);

  rechargeAmount = 1000;
  rechargeSource = 'manual';
  rechargeRef = '';

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.reload(id);
  }

  async reload(id: string) {
    this.loading.set(true);
    this.firm.set(await firstValueFrom(this.svc.getFirm(id)));
    this.wallet.set(await firstValueFrom(this.svc.firmWalletHistory(id)));
    this.loading.set(false);
  }

  async doRecharge() {
    if (!this.firm() || this.rechargeAmount <= 0) return;
    await firstValueFrom(this.svc.recharge(this.firm()!.id, this.rechargeAmount, this.rechargeSource, this.rechargeRef));
    this.showRecharge.set(false);
    this.rechargeAmount = 1000;
    this.rechargeRef = '';
    await this.reload(this.firm()!.id);
  }

  async suspend() {
    if (!this.firm() || !confirm('Suspend this firm? They will lose access.')) return;
    await firstValueFrom(this.svc.suspend(this.firm()!.id));
    await this.reload(this.firm()!.id);
  }

  async activate() {
    if (!this.firm()) return;
    await firstValueFrom(this.svc.activate(this.firm()!.id));
    await this.reload(this.firm()!.id);
  }
}

// =============================================================================
// PLANS
// =============================================================================
@Component({
  selector: 'app-admin-plans',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">💼 Subscription Plans</h2>
          <p class="text-sm text-[#6b3fa0]">Pricing tiers for tenant firms</p>
        </div>
        <button (click)="openAdd()" class="btn-primary">+ Add Plan</button>
      </div>

      ${subNav}

      <div class="grid grid-cols-4 gap-4">
        @for (p of plans(); track p.id) {
          <div class="card border-t-4"
               [class.border-purple-500]="p.code === 'pro'"
               [class.border-blue-500]="p.code === 'enterprise'"
               [class.border-green-500]="p.code === 'starter'"
               [class.border-gray-300]="p.code === 'trial'">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-display font-bold text-lg">{{ p.name }}</h3>
              @if (p.isActive) { <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Active</span> }
              @else { <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Inactive</span> }
            </div>
            <div class="text-3xl font-black text-[#5c1a8b] mb-1">
              ₹{{ p.monthlyInr | number:'1.0-0' }}
              <span class="text-sm font-normal text-gray-500">/mo</span>
            </div>
            <div class="text-xs text-gray-500 mb-3">₹{{ p.annualInr | number:'1.0-0' }}/year</div>

            <div class="space-y-1 text-sm border-t pt-3">
              <div class="flex justify-between"><span class="text-gray-500">Branches</span><strong>{{ p.maxBranches }}</strong></div>
              <div class="flex justify-between"><span class="text-gray-500">Users</span><strong>{{ p.maxUsers }}</strong></div>
              <div class="flex justify-between"><span class="text-gray-500">AI calls/mo</span><strong>{{ p.maxAiCalls }}</strong></div>
              <div class="flex justify-between"><span class="text-gray-500">WhatsApp/mo</span><strong>{{ p.maxWaMessages }}</strong></div>
            </div>

            <div class="border-t pt-3 mt-3">
              <span class="text-xs text-gray-500">{{ p.firmCount }} firm{{ p.firmCount === 1 ? '' : 's' }} on this plan</span>
              <div class="flex gap-3 mt-2 text-xs flex-wrap">
                <button (click)="openEdit(p)" class="text-[#5c1a8b] hover:underline font-semibold">✏️ Edit</button>
                <button (click)="extendPlan(p)" class="text-green-700 hover:underline font-semibold">🗓️ Extend</button>
                <button (click)="toggle(p.id)" class="text-[#5c1a8b] hover:underline">{{ p.isActive ? 'Disable' : 'Enable' }}</button>
                <button (click)="del(p)" class="text-red-600 hover:underline">🗑 Delete</button>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Add / Edit modal -->
      @if (editing(); as m) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="editing.set(null)">
          <div class="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-5" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-[#5c1a8b] mb-3">{{ editingId ? 'Edit Plan' : 'Add Plan' }}</h3>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="text-xs font-bold text-[#6b3fa0] block mb-1">Code</label><input [(ngModel)]="m.code" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
              <div><label class="text-xs font-bold text-[#6b3fa0] block mb-1">Name</label><input [(ngModel)]="m.name" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
              <div><label class="text-xs font-bold text-[#6b3fa0] block mb-1">Monthly ₹</label><input type="number" [(ngModel)]="m.monthlyInr" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
              <div><label class="text-xs font-bold text-[#6b3fa0] block mb-1">Annual ₹</label><input type="number" [(ngModel)]="m.annualInr" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
              <div><label class="text-xs font-bold text-[#6b3fa0] block mb-1">Branches</label><input type="number" [(ngModel)]="m.maxBranches" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
              <div><label class="text-xs font-bold text-[#6b3fa0] block mb-1">Users</label><input type="number" [(ngModel)]="m.maxUsers" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
              <div><label class="text-xs font-bold text-[#6b3fa0] block mb-1">AI calls/mo</label><input type="number" [(ngModel)]="m.maxAiCalls" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
              <div><label class="text-xs font-bold text-[#6b3fa0] block mb-1">WhatsApp/mo</label><input type="number" [(ngModel)]="m.maxWaMessages" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
            </div>
            @if (err()) { <div class="text-red-600 text-sm mt-2">{{ err() }}</div> }
            <div class="flex justify-end gap-2 mt-4">
              <button (click)="editing.set(null)" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button (click)="savePlan()" [disabled]="saving()" class="btn-primary">{{ saving() ? 'Saving…' : 'Save' }}</button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class AdminPlansComponent {
  private svc = inject(AdminService);
  plans = signal<Plan[]>([]);
  editing = signal<SavePlan | null>(null);
  editingId: string | null = null;
  saving = signal(false);
  err = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.svc.listPlans().subscribe(p => this.plans.set(p));
  }

  toggle(id: string) {
    this.svc.togglePlan(id).subscribe(() => this.load());
  }

  openAdd() {
    this.editingId = null;
    this.err.set('');
    this.editing.set({ code: '', name: '', monthlyInr: 0, annualInr: 0, maxBranches: 1, maxUsers: 1, maxAiCalls: 0, maxWaMessages: 0, features: '{}' });
  }

  openEdit(p: Plan) {
    this.editingId = p.id;
    this.err.set('');
    this.editing.set({
      code: p.code, name: p.name, monthlyInr: p.monthlyInr, annualInr: p.annualInr,
      maxBranches: p.maxBranches, maxUsers: p.maxUsers, maxAiCalls: p.maxAiCalls,
      maxWaMessages: p.maxWaMessages, features: p.features || '{}'
    });
  }

  savePlan() {
    const m = this.editing();
    if (!m) return;
    if (!m.code?.trim() || !m.name?.trim()) { this.err.set('Code aur Name zaroori hai.'); return; }
    this.saving.set(true); this.err.set('');
    const obs = this.editingId ? this.svc.updatePlan(this.editingId, m) : this.svc.createPlan(m);
    obs.subscribe({
      next: () => { this.saving.set(false); this.editing.set(null); this.load(); },
      error: (e) => { this.saving.set(false); this.err.set(e?.error?.error ?? 'Save nahi hua'); }
    });
  }

  del(p: Plan) {
    if (!confirm(`Plan "${p.name}" delete karein?`)) return;
    this.svc.deletePlan(p.id).subscribe({
      next: () => this.load(),
      error: (e) => alert(e?.error?.error ?? 'Delete nahi hua')
    });
  }

  // Is plan ke SAARE firms ko ek saath extend
  extendPlan(p: Plan) {
    const d = prompt(`"${p.name}" ke ${p.firmCount} firm(s) ko kitne DIN extend karein? (jaise 30 = 1 month, 365 = 1 year)`, '30');
    if (d === null) return;
    const days = parseInt(d, 10);
    if (isNaN(days) || days <= 0) { alert('Sahi din number daalein.'); return; }
    this.svc.extendBulk(days, p.id).subscribe({
      next: (r) => { alert(`✓ ${r.count} firm(s) ${days} din extend ho gaye.`); this.load(); },
      error: (e) => alert(e?.error?.error ?? 'Extend nahi hua')
    });
  }
}

// =============================================================================
// AI MONITOR
// =============================================================================
@Component({
  selector: 'app-admin-ai-monitor',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, DecimalPipe],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🤖 AI Cost Monitor</h2>
          <p class="text-sm text-[#6b3fa0]">Per-agent revenue and margin tracking</p>
        </div>
      </div>

      ${subNav}

      <div class="card p-0 overflow-hidden">
        <div class="bg-gradient-to-r from-purple-50 to-orange-50 px-4 py-3 border-b">
          <h3 class="font-display font-bold text-[#5c1a8b]">Last 30 Days — By Agent</h3>
        </div>
        @if (agents().length === 0) {
          <div class="p-8 text-center text-gray-400">No AI usage yet</div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs uppercase">
              <tr>
                <th class="px-3 py-2 text-left">Agent</th>
                <th class="px-3 py-2 text-right">Calls</th>
                <th class="px-3 py-2 text-right">Avg Confidence</th>
                <th class="px-3 py-2 text-right">Revenue</th>
                <th class="px-3 py-2 text-right">Cost</th>
                <th class="px-3 py-2 text-right">Margin</th>
                <th class="px-3 py-2 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              @for (a of agents(); track a.agentName) {
                <tr class="border-t">
                  <td class="px-3 py-2 font-semibold">{{ formatAgent(a.agentName) }}</td>
                  <td class="px-3 py-2 text-right">{{ a.calls }}</td>
                  <td class="px-3 py-2 text-right">{{ (a.avgConfidence * 100).toFixed(0) }}%</td>
                  <td class="px-3 py-2 text-right font-mono">₹{{ a.revenueInr | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono text-red-600">₹{{ a.costInr | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono font-bold text-green-700">₹{{ a.marginInr | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-bold">
                    {{ a.revenueInr > 0 ? ((a.marginInr / a.revenueInr) * 100).toFixed(0) : 0 }}%
                  </td>
                </tr>
              }
            </tbody>
            <tfoot class="bg-gray-100 font-bold">
              <tr>
                <td colspan="3" class="px-3 py-2 text-right">TOTALS:</td>
                <td class="px-3 py-2 text-right font-mono">₹{{ sum('revenueInr') | number:'1.2-2' }}</td>
                <td class="px-3 py-2 text-right font-mono">₹{{ sum('costInr') | number:'1.2-2' }}</td>
                <td class="px-3 py-2 text-right font-mono text-green-700">₹{{ sum('marginInr') | number:'1.2-2' }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        }
      </div>
    </div>
  `
})
export class AdminAiMonitorComponent {
  private svc = inject(AdminService);
  agents = signal<AgentCost[]>([]);

  sum(field: keyof AgentCost) {
    return this.agents().reduce((s, a) => s + Number(a[field] || 0), 0);
  }

  formatAgent(name: string): string {
    return name.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  }

  ngOnInit() {
    this.svc.aiCostBreakdown(30).subscribe(a => this.agents.set(a));
  }
}

// =============================================================================
// CHANGELOG PUBLISHER
// =============================================================================
@Component({
  selector: 'app-admin-changelog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DatePipe],
  template: `
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📝 Changelog Publisher</h2>
          <p class="text-sm text-[#6b3fa0]">Release notes shown to all users via auto-update banner</p>
        </div>
        <button (click)="showForm.set(true)" class="btn-primary">+ Publish New Release</button>
      </div>

      ${subNav}

      @if (showForm()) {
        <div class="card mb-4">
          <h3 class="font-display font-bold text-[#5c1a8b] mb-3">New Release</h3>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs uppercase font-bold text-[#6b3fa0]">Version *</label>
              <input [(ngModel)]="newVersion" placeholder="1.6.0" class="input font-mono">
            </div>
            <div>
              <label class="text-xs uppercase font-bold text-[#6b3fa0]">Release Date *</label>
              <input [(ngModel)]="newDate" type="date" class="input">
            </div>
          </div>
          <div class="grid gap-3">
            <div>
              <label class="text-xs uppercase font-bold text-[#6b3fa0]">✨ New Features (one per line)</label>
              <textarea [(ngModel)]="newFeatures" rows="3" class="input" placeholder="HR module live&#10;Bulk leave approval"></textarea>
            </div>
            <div>
              <label class="text-xs uppercase font-bold text-[#6b3fa0]">⚡ Improvements (one per line)</label>
              <textarea [(ngModel)]="newImprovements" rows="2" class="input"></textarea>
            </div>
            <div>
              <label class="text-xs uppercase font-bold text-[#6b3fa0]">🐛 Fixes (one per line)</label>
              <textarea [(ngModel)]="newFixes" rows="2" class="input"></textarea>
            </div>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [(ngModel)]="forceUpdate">
              <strong>Force update</strong> (auto-reload all users in 5 seconds)
            </label>
          </div>
          <div class="flex justify-end gap-2 mt-3">
            <button (click)="showForm.set(false)" class="px-4 py-2 border rounded text-sm">Cancel</button>
            <button (click)="publish()" class="btn-primary" [disabled]="!newVersion || !newDate">
              🚀 Publish
            </button>
          </div>
        </div>
      }

      <div class="space-y-3">
        @for (entry of entries(); track entry.id) {
          <div class="card">
            <div class="flex items-center justify-between mb-2">
              <div>
                <span class="font-mono font-bold text-lg text-[#5c1a8b]">v{{ entry.version }}</span>
                <span class="text-xs text-gray-500 ml-2">{{ entry.releaseDate | date:'mediumDate' }}</span>
                @if (entry.requiresForceUpdate) {
                  <span class="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">⚠️ Force Update</span>
                }
              </div>
            </div>

            @if (parseJson(entry.newFeatures).length > 0) {
              <div class="mt-2">
                <strong class="text-sm">✨ New Features:</strong>
                <ul class="list-disc pl-6 text-sm">
                  @for (f of parseJson(entry.newFeatures); track f) {
                    <li>{{ f }}</li>
                  }
                </ul>
              </div>
            }

            @if (parseJson(entry.improvements).length > 0) {
              <div class="mt-2">
                <strong class="text-sm">⚡ Improvements:</strong>
                <ul class="list-disc pl-6 text-sm">
                  @for (f of parseJson(entry.improvements); track f) {
                    <li>{{ f }}</li>
                  }
                </ul>
              </div>
            }

            @if (parseJson(entry.fixes).length > 0) {
              <div class="mt-2">
                <strong class="text-sm">🐛 Fixes:</strong>
                <ul class="list-disc pl-6 text-sm">
                  @for (f of parseJson(entry.fixes); track f) {
                    <li>{{ f }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class AdminChangelogComponent {
  private svc = inject(AdminService);
  entries = signal<any[]>([]);
  showForm = signal(false);

  newVersion = '';
  newDate = new Date().toISOString().split('T')[0];
  newFeatures = '';
  newImprovements = '';
  newFixes = '';
  forceUpdate = false;

  ngOnInit() { this.load(); }

  load() {
    this.svc.listChangelog().subscribe(e => this.entries.set(e));
  }

  parseJson(json: any): string[] {
    if (Array.isArray(json)) return json;
    try { return JSON.parse(json) ?? []; } catch { return []; }
  }

  publish() {
    if (!this.newVersion || !this.newDate) return;
    this.svc.publishChangelog({
      version: this.newVersion,
      releaseDate: this.newDate,
      newFeatures: this.newFeatures.split('\n').filter(l => l.trim()),
      improvements: this.newImprovements.split('\n').filter(l => l.trim()),
      fixes: this.newFixes.split('\n').filter(l => l.trim()),
      breakingChanges: [],
      requiresForceUpdate: this.forceUpdate
    }).subscribe({
      next: () => {
        this.showForm.set(false);
        this.newVersion = '';
        this.newFeatures = '';
        this.newImprovements = '';
        this.newFixes = '';
        this.forceUpdate = false;
        this.load();
      },
      error: () => alert('Failed to publish')
    });
  }
}
