import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface C { id: string; displayName: string; gst?: string | null; groupName?: string | null; }

// Party Groups (sister firms) - ek jagah se group bana ke member firms tick karo.
import { BackButtonComponent } from '../../shared/back-button.component';
@Component({
  selector: 'app-party-groups',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
  <div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div>
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Party Groups (Sister Firms)</h2>
        <p class="text-sm text-[#6b3fa0]">Ek group banao, uske andar ki saari firms tick karo. Jaise "Gupta Group" me Gupta Sons, Gupta Brothers, Gupta Textile.</p>
      </div>
      <a routerLink="/party-group-report" class="px-3 py-1.5 text-sm rounded text-white bg-gradient-to-r from-[#5c1a8b] to-[#9333ea] mr-2 no-underline">Group Report</a><a routerLink="/core-master" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">&larr; Back</a>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Existing groups -->
      <div class="card">
        <h3 class="font-bold text-[#5c1a8b] mb-2">Groups</h3>
        <!-- Pehle sirf NAAM banao — list me turant aa jayega, firms baad me tick karo -->
        <div class="flex gap-1 mb-3">
          <input [(ngModel)]="newGroupName" (keydown.enter)="createGroup()"
                 placeholder="Naya group naam..." class="input flex-1 text-sm">
          <button (click)="createGroup()" [disabled]="creating()"
                  class="px-3 py-1.5 bg-[#5c1a8b] text-white rounded font-bold text-sm whitespace-nowrap disabled:opacity-50">
            ➕ Banao
          </button>
        </div>
        @if (groups().length === 0) { <p class="text-sm text-gray-400">Abhi koi group nahi. Naya banao &uarr;</p> }
        <div class="flex flex-col gap-1">
          @for (g of groups(); track g) {
            <button (click)="openGroup(g)"
              [class]="groupName === g ? 'bg-[#5c1a8b] text-white' : 'hover:bg-purple-50 text-[#5c1a8b]'"
              class="text-left px-3 py-2 rounded text-sm font-semibold border border-[#ddc8f5]">
              {{ g }} <span class="text-xs opacity-70">({{ countIn(g) }})</span>
            </button>
          }
        </div>
      </div>

      <!-- Member picker + GROUP MASTER detail -->
      <div class="card md:col-span-2">
        <div class="flex flex-wrap gap-2 items-end mb-3">
          <div class="flex-1 min-w-[200px]">
            <label class="text-xs text-gray-500">Group naam</label>
            <input [(ngModel)]="groupName" list="pgGroups" class="input" placeholder="e.g. Gupta Group">
            <datalist id="pgGroups">@for (g of groups(); track g) { <option [value]="g"></option> }</datalist>
          </div>
          <button (click)="save()" [disabled]="saving()"
            class="px-4 py-2 bg-[#5c1a8b] text-white rounded font-semibold disabled:opacity-50">
            {{ saving() ? 'Saving...' : 'Save Group' }}
          </button>
        </div>

        <!-- GROUP MASTER — ye detail SAB sister firms me auto-sync hoti hai (jo bhari ho wahi) -->
        <div class="border border-[#ddc8f5] rounded-lg p-3 mb-3 bg-[#faf7ff]">
          <div class="text-xs font-bold text-[#6b3fa0] uppercase mb-2">
            👤 Group Master detail <small class="normal-case font-normal text-gray-400">(save par sab sister firms me auto-sync)</small>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div><label class="text-[10px] text-gray-500 block">OWNER NAME</label>
              <input [(ngModel)]="gOwner" class="input" placeholder="Malik ka naam"></div>
            <div><label class="text-[10px] text-gray-500 block">MOBILE NO</label>
              <input [(ngModel)]="gMobile" class="input" placeholder="9876543210"></div>
            <div><label class="text-[10px] text-gray-500 block">WHATSAPP NO</label>
              <input [(ngModel)]="gWhatsapp" class="input" placeholder="9876543210"></div>
            <div><label class="text-[10px] text-gray-500 block">PARTY TYPE</label>
              <select [(ngModel)]="gPartyType" class="input">
                <option value="supplier">Supplier</option>
                <option value="buyer">Buyer</option>
                <option value="both">Both (Supplier + Buyer)</option>
              </select></div>
            @if (gPartyType === 'buyer' || gPartyType === 'both') {
              <div><label class="text-[10px] text-gray-500 block">BUYER TYPE</label>
                <select [(ngModel)]="gBuyerType" class="input">
                  <option value="">Select...</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="retailer">Retailer</option>
                  <option value="distributor">Distributor</option>
                  <option value="semi_wholesale">Semi-Wholesale</option>
                  <option value="other">Other</option>
                </select></div>
            }
            <div class="col-span-2 md:col-span-3"><label class="text-[10px] text-gray-500 block">ADDRESS 1</label>
              <input [(ngModel)]="gAddress" class="input" placeholder="Shop / office address"></div>
            <div class="col-span-2 md:col-span-3"><label class="text-[10px] text-gray-500 block">ADDRESS 2</label>
              <input [(ngModel)]="gAddress2" class="input" placeholder="Godown / branch address (optional)"></div>
            <div><label class="text-[10px] text-gray-500 block">PINCODE <span class="text-[#9333ea]">(→ auto city/state)</span></label>
              <input [(ngModel)]="gPincode" (ngModelChange)="onPincode($event)" class="input" placeholder="395002" maxlength="6" inputmode="numeric"></div>
            <div><label class="text-[10px] text-gray-500 block">CITY {{ pinLoading() ? '⏳' : '' }}</label>
              <input [(ngModel)]="gCity" class="input" placeholder="Surat"></div>
            <div><label class="text-[10px] text-gray-500 block">STATE</label>
              <input [(ngModel)]="gState" class="input" placeholder="Gujarat"></div>
            <div><label class="text-[10px] text-gray-500 block">COMMISSION %</label>
              <input [(ngModel)]="gCommission" type="number" step="0.1" min="0" class="input" placeholder="0"></div>
            <div><label class="text-[10px] text-gray-500 block">PAYMENT TERMS</label>
              <select [(ngModel)]="gTerms" class="input">
                <option value="">Select...</option>
                <option value="advance">Advance Payment</option>
                <option value="net15">Net 15 Days</option>
                <option value="net30">Net 30 Days</option>
                <option value="net45">Net 45 Days</option>
                <option value="net60">Net 60 Days</option>
                <option value="net90">Net 90 Days</option>
                <option value="cod">COD (Cash on Delivery)</option>
                <option value="loa">LOA (Letter of Authorization)</option>
              </select></div>
            <div><label class="text-[10px] text-gray-500 block">PURCHASE DISC % <span class="text-[9px] text-purple-600">(supplier ka committed)</span></label>
              <input [(ngModel)]="gPurchDisc" type="number" step="0.1" min="0" class="input" placeholder="e.g. 6"></div>
            <div><label class="text-[10px] text-gray-500 block">NORMAL DISC %</label>
              <input [(ngModel)]="gDiscN" type="number" step="0.1" min="0" class="input" placeholder="0"></div>
            <div><label class="text-[10px] text-gray-500 block">SPECIAL DISC %</label>
              <input [(ngModel)]="gDiscS" type="number" step="0.1" min="0" class="input" placeholder="0"></div>
            <div><label class="text-[10px] text-gray-500 block">EXHIBITION DISC %</label>
              <input [(ngModel)]="gDiscE" type="number" step="0.1" min="0" class="input" placeholder="0"></div>
            <div><label class="text-[10px] text-gray-500 block">EXHIBITION FROM</label>
              <input [(ngModel)]="gExhFrom" type="date" class="input"></div>
            <div><label class="text-[10px] text-gray-500 block">EXHIBITION TO</label>
              <input [(ngModel)]="gExhTo" type="date" class="input"></div>

            <!-- Party Master jaise baaki fields — group me bharo, sab sister firms me sync -->
            <div><label class="text-[10px] text-gray-500 block">CREDIT LIMIT (₹)</label>
              <input [(ngModel)]="gCreditLimit" type="number" step="1" min="0" class="input" placeholder="0"></div>
            <div><label class="text-[10px] text-gray-500 block">CREDIT DAYS</label>
              <input [(ngModel)]="gCreditDays" type="number" step="1" min="0" class="input" placeholder="Payment terms se"></div>
            <div><label class="text-[10px] text-gray-500 block">SUPPLIER TYPE</label>
              <select [(ngModel)]="gSupplierType" class="input">
                <option value="">Select...</option>
                <option value="Wholesaler">Wholesaler</option>
                <option value="Manufacturer">Manufacturer</option>
                <option value="Trader">Trader</option>
                <option value="Agent">Agent</option>
              </select></div>
            <div><label class="text-[10px] text-gray-500 block">EMAIL</label>
              <input [(ngModel)]="gEmail" type="email" class="input" placeholder="firm@example.com"></div>
            <div><label class="text-[10px] text-gray-500 block">WHATSAPP – BUYER</label>
              <input [(ngModel)]="gWaBuyer" class="input" placeholder="Khareedne wala no."></div>
            <div><label class="text-[10px] text-gray-500 block">WHATSAPP – EXTRA</label>
              <input [(ngModel)]="gWaExtra" class="input" placeholder="9825828256"></div>
            <div><label class="text-[10px] text-gray-500 block">EXTRA WA – ROLE</label>
              <select [(ngModel)]="gWaExtraRole" class="input">
                <option value="">Select...</option>
                <option value="Manager">Manager</option>
                <option value="Accountant">Accountant</option>
                <option value="Owner">Owner</option>
                <option value="Other">Other</option>
              </select></div>
            <div><label class="text-[10px] text-gray-500 block">SUB AGENT</label>
              <input [(ngModel)]="gSubAgent" class="input" placeholder="Naam"></div>
            <div><label class="text-[10px] text-gray-500 block">SUB AGENT %</label>
              <input [(ngModel)]="gSubAgentPct" type="number" step="0.1" min="0" class="input" placeholder="0"></div>
            <div><label class="text-[10px] text-gray-500 block">INCENTIVE %</label>
              <input [(ngModel)]="gIncentivePct" type="number" step="0.1" min="0" class="input" placeholder="0"></div>
            <div><label class="text-[10px] text-gray-500 block">AGENT SHARE %</label>
              <input [(ngModel)]="gAgentSharePct" type="number" step="0.1" min="0" class="input" placeholder="0"></div>
          </div>
          <p class="text-[10px] text-gray-400 mt-1">Exhibition Disc sirf FROM–TO date ke beech ke bill par lagta hai. Warna Normal/Special disc.</p>
          <p class="text-[10px] text-gray-400">Jo field yahan bharoge wahi sab sister firms me jaayegi — khali chhodi field kisi firm ka apna data nahi mitati. GSTIN / PAN / Udyam / Opening Balance jaan-boojh kar yahan nahi hain (har firm ki apni pehchan).</p>
        </div>
        @if (msg()) { <p class="text-sm mb-2" [class]="msg().includes('Error') || msg().includes('daalein') ? 'text-red-600' : 'text-green-600'">{{ msg() }}</p> }

        <input [ngModel]="search()" (ngModelChange)="search.set($event); onSearch()"
               placeholder="Firm dhoondo (naam / GST)..." class="input mb-2">
        <p class="text-xs text-gray-500 mb-1">Ticked = is group me. Selected: <b>{{ picked().size }}</b></p>
        <div class="border border-[#eee] rounded max-h-[52vh] overflow-y-auto divide-y">
          @for (c of filtered(); track c.id) {
            <label class="flex items-center gap-3 px-3 py-2 hover:bg-[#faf5ff]"
                   [class.cursor-pointer]="!isLocked(c)"
                   [class.opacity-60]="isLocked(c)"
                   [title]="isLocked(c) ? c.displayName + ' pehle se ' + c.groupName + ' me hai — pehle wahan se hatao' : ''">
              <input type="checkbox" [checked]="isPicked(c.id)" [disabled]="isLocked(c)"
                     (change)="toggle(c.id)" class="w-4 h-4">
              <span class="flex-1">
                <span class="font-semibold text-sm">{{ c.displayName }}</span>
                @if (c.gst) { <span class="text-xs text-gray-400 font-mono ml-2">{{ c.gst }}</span> }
              </span>
              @if (c.groupName && c.groupName !== groupName) {
                <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">🔒 {{ c.groupName }}</span>
              }
            </label>
          }
          @if (filtered().length === 0) { <p class="p-4 text-center text-gray-400 text-sm">Koi firm nahi mili.</p> }
        </div>
      </div>
    </div>
  </div>
  `,
})
export class PartyGroupsComponent {
  private http = inject(HttpClient);
  base = `${environment.apiUrl}/api/core/contacts`;
  all = signal<C[]>([]);
  groups = signal<string[]>([]);
  groupName = '';
  // SIGNAL hona zaroori hai — plain property hoti to computed() ko badalne ka pata hi
  // nahi chalta aur list kabhi filter nahi hoti (typing par kuch na hota).
  search = signal('');
  picked = signal<Set<string>>(new Set<string>());
  saving = signal(false);
  msg = signal('');

  filtered = computed(() => {
    const s = this.search().trim().toLowerCase();
    return this.all().filter(c => !s
      || c.displayName.toLowerCase().includes(s)
      || (c.gst || '').toLowerCase().includes(s));
  });

  counts = signal<Record<string, number>>({});

  constructor() { this.load(); }

  load() {
    this.http.get<C[]>(this.base).subscribe({ next: r => this.all.set(r || []), error: () => {} });
    this.http.get<string[]>(`${this.base}/groups`).subscribe({ next: g => this.groups.set(g || []), error: () => {} });
    this.http.get<any[]>(`${this.base}/groups/detail`).subscribe({ next: d => this.details.set(d || []), error: () => {} });
    this.loadCounts();
  }

  private loadCounts() {
    this.http.get<{ name: string; count: number }[]>(`${this.base}/groups/counts`).subscribe({
      next: (r) => this.counts.set(Object.fromEntries((r || []).map(x => [x.name, x.count]))),
      error: () => {}
    });
  }

  // SERVER-side search — default list sirf pehle 300 naam (A-Z) deti hai, isliye
  // 'V' se shuru hone wali firm client-side filter me kabhi milti hi nahi thi.
  // Ab har keystroke (debounced) par server se poori firm-list me dhoondte hain.
  private searchTimer: any;
  onSearch() {
    clearTimeout(this.searchTimer);
    const q = this.search().trim();
    this.searchTimer = setTimeout(() => {
      const url = q ? `${this.base}?search=${encodeURIComponent(q)}` : this.base;
      this.http.get<C[]>(url).subscribe({
        next: (r) => this.mergeIntoAll(r || []),
        error: () => {}
      });
    }, 300);
  }

  // GROUP MASTER detail fields (sab sister firms me auto-sync hote hain)
  details = signal<any[]>([]);
  gOwner = ''; gMobile = ''; gWhatsapp = ''; gAddress = ''; gAddress2 = '';
  gCity = ''; gPincode = ''; gState = ''; gPartyType = 'supplier'; gBuyerType = '';
  gCommission = 0; gDiscN = 0; gDiscE = 0; gDiscS = 0; gTerms = '';
  gExhFrom = ''; gExhTo = ''; gPurchDisc = 0;
  // Party Master jaise baaki fields (group -> sister firms sync)
  gCreditLimit = 0; gCreditDays: number | null = null;
  gSupplierType = ''; gEmail = ''; gWaBuyer = ''; gWaExtra = ''; gWaExtraRole = '';
  gSubAgent = ''; gSubAgentPct: number | null = null;
  gIncentivePct: number | null = null; gAgentSharePct: number | null = null;
  pinLoading = signal(false);

  // Pincode 6 digit hote hi city + state auto-fill (India Post free API).
  onPincode(v: string) {
    const pin = (v || '').replace(/\D/g, '');
    this.gPincode = pin;
    if (pin.length !== 6) return;
    this.pinLoading.set(true);
    fetch(`https://api.postalpincode.in/pincode/${pin}`)
      .then(r => r.json())
      .then(d => {
        const po = d?.[0]?.PostOffice?.[0];
        if (po) {
          this.gCity = po.District || this.gCity;
          this.gState = po.State || this.gState;
        }
      })
      .catch(() => {})
      .finally(() => this.pinLoading.set(false));
  }

  private fillDetail(name: string) {
    const d = this.details().find(x => (x.name || '').toLowerCase() === name.toLowerCase());
    this.gOwner = d?.ownerName || ''; this.gMobile = d?.mobile || '';
    this.gWhatsapp = d?.whatsapp || ''; this.gAddress = d?.address || ''; this.gAddress2 = d?.address2 || '';
    this.gCity = d?.city || ''; this.gPincode = d?.pincode || ''; this.gState = d?.state || '';
    this.gPartyType = d?.partyType || 'supplier'; this.gBuyerType = d?.buyerType || '';
    this.gCommission = +(d?.commission ?? 0); this.gTerms = d?.paymentTerms || '';
    this.gDiscN = +(d?.discountNormal ?? 0); this.gDiscE = +(d?.discountExhibition ?? 0);
    this.gDiscS = +(d?.discountSpecial ?? 0);
    this.gExhFrom = d?.exhibitionFrom || ''; this.gExhTo = d?.exhibitionTo || '';
    this.gPurchDisc = +(d?.purchaseDiscPct ?? 0);
    this.gCreditLimit = +(d?.creditLimit ?? 0);
    this.gCreditDays = d?.creditDays ?? null;
    this.gSupplierType = d?.supplierType || ''; this.gEmail = d?.email || '';
    this.gWaBuyer = d?.waBuyer || ''; this.gWaExtra = d?.waExtra || '';
    this.gWaExtraRole = d?.waExtraRole || '';
    this.gSubAgent = d?.subAgent || '';
    this.gSubAgentPct = d?.subAgentPct ?? null;
    this.gIncentivePct = d?.incentivePct ?? null;
    this.gAgentSharePct = d?.agentSharePct ?? null;
  }

  // Khali/0 ko null bhejo — taaki backend COALESCE member ka apna value bacha le
  private numOrNull(v: number | null): number | null {
    return (v === null || v === undefined || (v as any) === '' || +v === 0) ? null : +v;
  }

  private detailPayload(name: string) {
    return {
      name,
      ownerName: this.gOwner || null, address: this.gAddress || null, address2: this.gAddress2 || null,
      partyType: this.gPartyType || 'supplier', buyerType: this.gBuyerType || null,
      mobile: this.gMobile || null, whatsapp: this.gWhatsapp || null,
      city: this.gCity || null, pincode: this.gPincode || null, state: this.gState || null,
      commission: +this.gCommission || 0,
      discountNormal: +this.gDiscN || 0, discountExhibition: +this.gDiscE || 0,
      discountSpecial: +this.gDiscS || 0,
      exhibitionFrom: this.gExhFrom || null, exhibitionTo: this.gExhTo || null,
      purchaseDiscPct: +this.gPurchDisc || 0,
      paymentTerms: this.gTerms || null,
      creditLimit: +this.gCreditLimit || 0,
      creditDays: this.numOrNull(this.gCreditDays),
      supplierType: this.gSupplierType || null,
      email: this.gEmail || null,
      waBuyer: this.gWaBuyer || null,
      waExtra: this.gWaExtra || null,
      waExtraRole: this.gWaExtraRole || null,
      subAgent: this.gSubAgent || null,
      subAgentPct: this.numOrNull(this.gSubAgentPct),
      incentivePct: this.numOrNull(this.gIncentivePct),
      agentSharePct: this.numOrNull(this.gAgentSharePct)
    };
  }

  // Pehle sirf group ka NAAM save — left list me turant, firms baad me tick karke Save Group
  newGroupName = '';
  creating = signal(false);
  createGroup() {
    const name = this.newGroupName.trim();
    if (!name) return;
    if (this.groups().some(g => g.toLowerCase() === name.toLowerCase())) {
      this.openGroup(this.groups().find(g => g.toLowerCase() === name.toLowerCase())!);
      this.newGroupName = '';
      return;
    }
    this.creating.set(true);
    this.http.post(`${this.base}/groups`, { name }).subscribe({
      next: () => {
        this.creating.set(false);
        this.newGroupName = '';
        this.groups.update(g => [...g, name].sort((a, b) => a.localeCompare(b)));
        this.openGroup(name);   // turant select — ab firms tick karke Save Group dabao
        this.msg.set(`"${name}" ban gaya — ab firms tick karke Save Group dabao`);
      },
      error: () => { this.creating.set(false); this.msg.set('Error - dobara try karein.'); }
    });
  }

  // Count DB se (groups/counts) — apni loaded list par ginna galat tha, wo 300 par kati hai.
  countIn(g: string) { return this.counts()[g] ?? 0; }

  openGroup(name: string) {
    this.groupName = name;
    this.fillDetail(name);   // Group Master detail form bharo
    this.msg.set('');
    // Members SERVER se — poore group ke (chahe naam 'V' se shuru ho aur default
    // 300-wali list me na aata ho). Inhe all() me merge bhi karo taaki ticked
    // firms list me dikhein, warna tick to hai par row hi nahi milti.
    this.http.get<C[]>(`${this.base}?group=${encodeURIComponent(name)}`).subscribe({
      next: (mem) => {
        this.picked.set(new Set<string>((mem || []).map(c => c.id)));
        this.mergeIntoAll(mem || []);
      },
      error: () => this.picked.set(new Set<string>())
    });
  }

  // Nayi rows ko all() me daalo (duplicate id skip) — search/group ke results add hote rahein.
  private mergeIntoAll(rows: C[]) {
    if (!rows.length) return;
    const byId = new Map(this.all().map(c => [c.id, c]));
    for (const r of rows) byId.set(r.id, r);
    this.all.set([...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)));
  }

  toggle(id: string) {
    const set = new Set(this.picked());
    if (set.has(id)) { set.delete(id); this.picked.set(set); return; }
    // EK PARTY = EK GROUP: dusre group wali party yahan add nahi ho sakti —
    // pehle us group se hatao (wahan untick karke save), fir yahan add karo.
    const c = this.all().find(x => x.id === id);
    if (c?.groupName && c.groupName.toLowerCase() !== this.groupName.trim().toLowerCase()) {
      this.msg.set(`"${c.displayName}" pehle se "${c.groupName}" group me hai — pehle wahan se hatao, fir yahan add karo.`);
      return;
    }
    set.add(id);
    this.picked.set(set);
  }
  isPicked(id: string) { return this.picked().has(id); }
  // Dusre group wali party — checkbox band
  isLocked(c: C): boolean {
    return !!c.groupName && c.groupName.toLowerCase() !== this.groupName.trim().toLowerCase();
  }

  save() {
    const name = this.groupName.trim();
    if (!name) { this.msg.set('Group naam daalein.'); return; }
    this.saving.set(true); this.msg.set('');
    // 1) Group Master detail save (+ members me auto-sync) → 2) members set (+ sync)
    this.http.post(`${this.base}/groups`, this.detailPayload(name)).subscribe({
      next: () => {
        this.http.post(`${this.base}/groups/save-members`, { groupName: name, memberIds: [...this.picked()] }).subscribe({
          next: () => { this.saving.set(false); this.msg.set('Saved! Detail sab sister firms me sync ho gayi ✓'); this.load(); },
          error: (e) => { this.saving.set(false); this.msg.set(e?.error?.error || 'Error - dobara try karein.'); }
        });
      },
      error: () => { this.saving.set(false); this.msg.set('Error - dobara try karein.'); }
    });
  }
}
