import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradingSubNavComponent } from '../../trading/components/trading-sub-nav.component';
import { TradingService, Party } from '../../trading/services/trading.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { PaginatorComponent } from '../../../shared/paginator.component';

interface CreditRow {
  party: Party;
  limit: number;
  days: number;
  savedAt: number | null;   // timestamp of last save (for "Saved!" indicator)
  saving: boolean;
}

@Component({
  selector: 'app-credit-limits',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, TradingSubNavComponent, BackButtonComponent, PaginatorComponent],
  template: `
  <div class="max-w-7xl mx-auto">
    <div class="page-top-bar"><app-back-button></app-back-button></div>

    <!-- HEADER -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="font-display font-black text-2xl text-[#1B2E5C]">💳 Credit Limit Settings</h2>
        <p class="text-sm text-[#4A5878]">
          Owner seedha yahan se har buyer ki limit type karo aur Enter dabao — instantly save
        </p>
      </div>
      <div class="flex gap-2">
        <button (click)="applyAutoPresets()" class="btn-auto" title="Set sensible defaults">⚡ Auto Presets</button>
        <button (click)="saveAll()" class="btn-saveall" [disabled]="dirtyCount() === 0">
          💾 Save All ({{ dirtyCount() }})
        </button>
      </div>
    </div>

    <app-trading-sub-nav></app-trading-sub-nav>

    <!-- HELP STRIP -->
    <div class="help-strip">
      <span class="hs-ico">💡</span>
      <strong>Kaise use karein:</strong>
      Kisi bhi buyer ki <strong>Credit Limit</strong> column me amount type karo
      → <kbd>Enter</kbd> ya <kbd>Tab</kbd> dabao → automatically save ho jayega.
      Credit Days bhi seedha change karo. Koi Submit button nahi chahiye!
    </div>

    <!-- KPI CARDS -->
    <div class="grid grid-cols-6 gap-3 mb-4">
      <div class="kpi" style="border-left:4px solid #1B2E5C; background:#1B2E5C0d;"><div class="kpi-ico">🛒</div><div class="kpi-val" style="color:#1B2E5C;">{{ totalBuyers() }}</div><div class="kpi-lbl">TOTAL BUYERS</div></div>
      <div class="kpi" style="border-left:4px solid #16a34a; background:#16a34a0d;"><div class="kpi-ico">💳</div><div class="kpi-val" style="color:#16a34a;">{{ limitsSet() }}/{{ totalBuyers() }}</div><div class="kpi-lbl">LIMITS SET</div></div>
      <div class="kpi" style="border-left:4px solid #0284c7; background:#0284c70d;"><div class="kpi-ico">❓</div><div class="kpi-val" style="color:#0284c7;">{{ noLimitSet() }}</div><div class="kpi-lbl">NO LIMIT SET</div></div>
      <div class="kpi kpi-red"><div class="kpi-ico">⛔</div><div class="kpi-val">{{ limitExceed() }}</div><div class="kpi-lbl">LIMIT EXCEED</div></div>
      <div class="kpi kpi-yellow"><div class="kpi-ico">⚠️</div><div class="kpi-val">{{ nearLimit() }}</div><div class="kpi-lbl">NEAR LIMIT(75%+)</div></div>
      <div class="kpi kpi-orange"><div class="kpi-ico">⚠️</div><div class="kpi-val">{{ overdueBills() }}</div><div class="kpi-lbl">OVERDUE BILLS</div></div>
    </div>

    <!-- TABLE -->
    <div class="card p-0 overflow-hidden">
      <div class="table-head-bar">
        <div class="thb-left">
          <span class="thb-ico">🛒</span>
          <div>
            <div class="thb-title">Buyer Credit Limits — Seedha Edit Karein</div>
            <div class="thb-sub">Limit type karo → Enter dabao → <span class="auto-save-pill">✓ Auto save</span></div>
          </div>
        </div>
        <div class="thb-right">
          <div class="search-wrap">
            <span class="search-ico">🔍</span>
            <input [(ngModel)]="searchTerm" (ngModelChange)="onSearch()"
                   placeholder="Buyer search..." class="search-input">
          </div>
          <select [(ngModel)]="filterMode" (change)="onFilterChange()" class="filter-sel">
            <option value="all">All Buyers</option>
            <option value="no-limit">No Limit Set</option>
            <option value="exceed">Limit Exceeded</option>
            <option value="near">Near Limit (75%+)</option>
          </select>
        </div>
      </div>

      @if (loading()) {
        <div class="p-8 text-center text-gray-500">Loading buyers…</div>
      } @else if (filteredRows().length === 0) {
        <div class="p-8 text-center text-gray-500">
          <div class="text-4xl mb-2">🛒</div>
          No buyers found.
        </div>
      } @else {
        <table class="cl-table">
          <thead>
            <tr>
              <th class="t-num">#</th>
              <th>BUYER NAME</th>
              <th>CITY / RATING</th>
              <th class="t-right">CURRENT O/S</th>
              <th class="t-limit">💳 CREDIT LIMIT (₹) — SEEDHA TYPE KAREIN</th>
              <th class="t-center">📅 CREDIT DAYS</th>
              <th>UTILIZATION</th>
              <th class="t-center">STATUS</th>
            </tr>
          </thead>
          <tbody>
            @for (r of pagedRows(); track r.party.id; let i = $index) {
              <tr [class.exceed]="utilization(r) > 100" [class.near]="utilization(r) > 75 && utilization(r) <= 100">
                <td class="t-num">{{ (pageClamped()-1)*pageSize() + i + 1 }}</td>
                <td>
                  <div class="font-bold text-[#1B2E5C]">{{ r.party.displayName }}</div>
                  @if (r.party.outstandingBalance > r.limit && r.limit > 0) {
                    <span class="overdue-tag">⚠️ Limit exceeded</span>
                  }
                </td>
                <td>
                  <div class="text-sm">{{ r.party.city || '—' }}</div>
                  <div class="text-xs text-gray-500">
                    {{ ratingLetter(r.party) }} · {{ ratingStars(r.party) }} ⭐
                  </div>
                </td>
                <td class="t-right font-mono font-bold">₹ {{ r.party.outstandingBalance | number:'1.2-2' }}</td>
                <td class="t-limit">
                  <div class="limit-cell">
                    <div class="limit-input-wrap">
                      <span class="cur-ico">₹</span>
                      <input type="number"
                             [ngModel]="r.limit"
                             (ngModelChange)="onLimitChange(r, $event)"
                             (blur)="saveRow(r)"
                             (keydown.enter)="saveRow(r)"
                             class="limit-input"
                             [class.has-changes]="isDirty(r)">
                    </div>
                    @if (recentlySaved(r)) {
                      <div class="saved-tag">✅ Saved!</div>
                    }
                    @if (r.saving) {
                      <div class="saving-tag">Saving…</div>
                    }
                    <div class="preset-row">
                      <button type="button" (click)="setPreset(r, 500000)" class="preset-btn">₹5L</button>
                      <button type="button" (click)="setPreset(r, 1000000)" class="preset-btn">₹10L</button>
                      <button type="button" (click)="setPreset(r, 1500000)" class="preset-btn">₹15L</button>
                      <button type="button" (click)="setPreset(r, 2500000)" class="preset-btn preset-active">₹25L</button>
                      <button type="button" (click)="setPreset(r, 5000000)" class="preset-btn">₹50L</button>
                      <button type="button" (click)="setPreset(r, 0)" class="preset-btn preset-clear">✕</button>
                    </div>
                  </div>
                </td>
                <td class="t-center">
                  <select [(ngModel)]="r.days" (ngModelChange)="markDirty(r)" (change)="saveRow(r)" class="days-sel">
                    <option [ngValue]="0">No Term</option>
                    <option [ngValue]="15">15 Days</option>
                    <option [ngValue]="30">30 Days</option>
                    <option [ngValue]="45">45 Days</option>
                    <option [ngValue]="60">60 Days</option>
                    <option [ngValue]="90">90 Days</option>
                    <option [ngValue]="120">120 Days</option>
                  </select>
                </td>
                <td>
                  <div class="util-cell">
                    <div class="util-text">
                      <span>Used: ₹{{ r.party.outstandingBalance | number:'1.2-2' }}</span>
                      @if (r.limit > 0) {
                        <span>Avail: ₹{{ availableCredit(r) | number:'1.2-2' }}</span>
                      }
                    </div>
                    <div class="util-bar">
                      <div class="util-fill"
                           [style.width.%]="utilizationWidth(r)"
                           [class.util-green]="utilization(r) <= 75 && r.limit > 0"
                           [class.util-yellow]="utilization(r) > 75 && utilization(r) <= 100"
                           [class.util-red]="utilization(r) > 100"></div>
                    </div>
                    <div class="util-pct">{{ r.limit > 0 ? (utilization(r) | number:'1.0-0') + '% used' : 'No limit set' }}</div>
                  </div>
                </td>
                <td class="t-center">
                  <span class="status-pill" [ngClass]="statusClass(r)">
                    {{ statusText(r) }}
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-paginator [total]="filteredRows().length" [page]="pageClamped()" [pageSize]="pageSize()"
                       (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event); page.set(1)"></app-paginator>
      }
    </div>

  </div>
  `,
  styles: [`
    .card { background:#fff; border:1px solid #D6DDEA; border-radius:10px; }

    /* Buttons */
    .btn-saveall { padding:9px 14px; background:#10B981; color:#fff; border:0; border-radius:6px;
      font-weight:700; font-size:13px; cursor:pointer; }
    .btn-saveall:disabled { background:#9CA3AF; cursor:not-allowed; }
    .btn-saveall:hover:not(:disabled) { background:#059669; }
    .btn-auto { padding:9px 14px; background:#fff; color:#1B2E5C; border:1px solid #D6DDEA;
      border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }
    .btn-auto:hover { background:#FAF7F0; border-color:#1B2E5C; }

    /* Help strip */
    .help-strip { background:#FEF3C7; border:1px solid #FCD34D; border-radius:8px;
      padding:10px 14px; margin-bottom:14px; font-size:13px; color:#92400E; }
    .help-strip .hs-ico { margin-right:6px; }
    .help-strip kbd { background:#fff; border:1px solid #D6DDEA; border-radius:4px;
      padding:1px 6px; font-size:11px; font-family:monospace; }

    /* KPI cards */
    .kpi { background:#fff; border:1px solid #D6DDEA; border-radius:10px; padding:14px 12px;
      display:flex; flex-direction:column; align-items:flex-start; gap:2px; }
    .kpi-ico { font-size:22px; margin-bottom:4px; }
    .kpi-val { font-size:24px; font-weight:900; color:#1B2E5C; line-height:1; }
    .kpi-lbl { font-size:10px; font-weight:700; color:#4A5878; letter-spacing:0.4px; }
    .kpi-red { border-left:4px solid #DC2626; }
    .kpi-yellow { border-left:4px solid #F59E0B; }
    .kpi-orange { border-left:4px solid #F97316; }

    /* Table head bar */
    .table-head-bar { display:flex; justify-content:space-between; align-items:center;
      padding:12px 16px; background:#FAF7F0; border-bottom:1px solid #D6DDEA; }
    .thb-left { display:flex; align-items:center; gap:10px; }
    .thb-ico { font-size:22px; }
    .thb-title { font-weight:900; color:#1B2E5C; font-size:15px; }
    .thb-sub { font-size:11px; color:#4A5878; }
    .auto-save-pill { background:#D1FAE5; color:#065F46; padding:1px 6px; border-radius:4px;
      font-weight:700; font-size:10px; margin-left:4px; }
    .thb-right { display:flex; gap:8px; align-items:center; }
    .search-wrap { position:relative; }
    .search-ico { position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:13px; }
    .search-input { padding:7px 10px 7px 28px; font-size:13px; border:1px solid #D6DDEA;
      border-radius:6px; width:220px; }
    .filter-sel { padding:7px 10px; font-size:13px; border:1px solid #D6DDEA; border-radius:6px; background:#fff; }

    /* TABLE */
    .cl-table { width:100%; border-collapse:collapse; font-size:13px; }
    .cl-table th { background:var(--anjaninex-navy, #1B2E5C); color:#fff; padding:10px 12px; text-align:left;
      font-size:11px; font-weight:700; letter-spacing:0.3px; }
    .cl-table .t-num { width:40px; text-align:center; }
    .cl-table .t-right { text-align:right; }
    .cl-table .t-center { text-align:center; }
    .cl-table .t-limit { width:280px; }
    .cl-table td { padding:12px; border-bottom:1px solid #E5E7EB; vertical-align:top; }
    .cl-table tr:hover td { background:#FAF7F0; }
    .cl-table tr.exceed td { background:#FEF2F2; }
    .cl-table tr.exceed:hover td { background:#FEE2E2; }
    .cl-table tr.near td { background:#FEFCE8; }

    .overdue-tag { display:inline-block; padding:1px 6px; background:#FEF3C7; color:#92400E;
      font-size:10px; font-weight:700; border-radius:4px; margin-top:2px; }

    /* Limit cell */
    .limit-cell { display:flex; flex-direction:column; gap:4px; }
    .limit-input-wrap { position:relative; }
    .cur-ico { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#4A5878; font-weight:700; }
    .limit-input { padding:8px 10px 8px 24px; font-size:14px; font-weight:700; color:#1B2E5C;
      border:1px solid #D6DDEA; border-radius:6px; width:100%; font-family:monospace; }
    .limit-input:focus { outline:none; border-color:#DC2626; box-shadow:0 0 0 2px rgba(220,38,38,0.1); background:#FFFBEB; }
    .limit-input.has-changes { border-color:#F59E0B; background:#FFFBEB; }
    .saved-tag { font-size:10px; color:#065F46; font-weight:700; margin-top:2px; }
    .saving-tag { font-size:10px; color:#4A5878; font-style:italic; margin-top:2px; }

    .preset-row { display:flex; gap:3px; flex-wrap:wrap; }
    .preset-btn { padding:2px 6px; font-size:10px; font-weight:700; border:1px solid #D6DDEA;
      background:#fff; color:#4A5878; border-radius:4px; cursor:pointer; font-family:monospace; }
    .preset-btn:hover { background:#FAF7F0; border-color:#1B2E5C; color:#1B2E5C; }
    .preset-btn.preset-active { background:var(--anjaninex-navy, #1B2E5C); color:#fff; border-color:var(--anjaninex-navy, #1B2E5C); }
    .preset-btn.preset-clear { background:#FEE2E2; color:#991B1B; border-color:#FCA5A5; }
    .preset-btn.preset-clear:hover { background:#FEE2E2; }

    .days-sel { padding:7px 10px; font-size:13px; border:1px solid #D6DDEA; border-radius:6px;
      background:#fff; color:#1B2E5C; min-width:110px; }

    /* Utilization */
    .util-cell { min-width:170px; }
    .util-text { display:flex; justify-content:space-between; font-size:11px; color:#4A5878; margin-bottom:3px; }
    .util-bar { height:6px; background:#E5E7EB; border-radius:3px; overflow:hidden; }
    .util-fill { height:100%; transition:width 0.2s; }
    .util-green { background:#10B981; }
    .util-yellow { background:#F59E0B; }
    .util-red { background:#DC2626; }
    .util-pct { font-size:10px; color:#4A5878; margin-top:3px; font-weight:600; }

    /* Status */
    .status-pill { display:inline-block; padding:4px 10px; font-size:11px; font-weight:700; border-radius:6px; }
    .status-green { background:#D1FAE5; color:#065F46; }
    .status-yellow { background:#FEF3C7; color:#92400E; }
    .status-red { background:#FEE2E2; color:#991B1B; }
    .status-grey { background:#E5E7EB; color:#4B5563; }

    @media (max-width: 640px) {
      /* Table head bar stacks; search + filter go full width */
      .table-head-bar { flex-direction:column; align-items:stretch; gap:10px; padding:10px 12px; }
      .thb-right { flex-wrap:wrap; gap:8px; }
      .search-wrap { flex:1 1 100%; }
      .search-input { width:100% !important; }
      .filter-sel { flex:1 1 100%; width:100%; }
      /* Make the table horizontally scrollable instead of clipped */
      .card { overflow-x:auto !important; -webkit-overflow-scrolling:touch; }
      .cl-table { display:block; overflow-x:auto; -webkit-overflow-scrolling:touch; white-space:nowrap; }
      .cl-table .t-limit { width:auto; min-width:240px; }
      .cl-table td, .cl-table th { padding:8px; }
      .preset-row { flex-wrap:wrap; }
    }
  `]
})
export class CreditLimitsComponent {
  private svc = inject(TradingService);

  rows = signal<CreditRow[]>([]);
  loading = signal(true);
  searchTerm = '';
  filterMode = 'all';
  now = Date.now();
  private searchDebounce: any = null;

  // Filtered rows based on search + filter mode
  filteredRows = computed(() => {
    let result = this.rows();
    const search = this.searchTerm.toLowerCase().trim();
    if (search) {
      result = result.filter(r =>
        r.party.displayName.toLowerCase().includes(search) ||
        (r.party.city ?? '').toLowerCase().includes(search) ||
        (r.party.phone ?? '').includes(search)
      );
    }
    if (this.filterMode === 'no-limit') result = result.filter(r => r.limit === 0);
    else if (this.filterMode === 'exceed') result = result.filter(r => r.party.outstandingBalance > r.limit && r.limit > 0);
    else if (this.filterMode === 'near') {
      result = result.filter(r => {
        if (r.limit <= 0) return false;
        const u = (r.party.outstandingBalance / r.limit) * 100;
        return u > 75 && u <= 100;
      });
    }
    return result;
  });

  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageClamped = computed(() => {
    const pages = Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });
  pagedRows = computed(() => {
    const st = (this.pageClamped() - 1) * this.pageSize();
    return this.filteredRows().slice(st, st + this.pageSize());
  });

  // KPIs
  totalBuyers = computed(() => this.rows().length);
  limitsSet = computed(() => this.rows().filter(r => r.limit > 0).length);
  noLimitSet = computed(() => this.rows().filter(r => r.limit === 0).length);
  limitExceed = computed(() => this.rows().filter(r => r.limit > 0 && r.party.outstandingBalance > r.limit).length);
  nearLimit = computed(() => this.rows().filter(r => {
    if (r.limit <= 0) return false;
    const u = (r.party.outstandingBalance / r.limit) * 100;
    return u > 75 && u <= 100;
  }).length);
  overdueBills = computed(() => this.rows().reduce((sum, r) =>
    sum + (r.party.outstandingBalance > 0 && r.days > 0 ? 1 : 0), 0));

  dirtyCount = computed(() => this.rows().filter(r =>
    r.limit !== r.party.creditLimit || r.days !== r.party.creditDays).length);

  ngOnInit() {
    this.load();
    // Refresh "Saved!" indicator visibility every 500ms
    setInterval(() => { this.now = Date.now(); }, 500);
  }

  load() {
    this.loading.set(true);
    this.svc.listParties().subscribe({
      next: (parties) => {
        // Show buyers + multi-role parties (anyone we might extend credit to)
        const buyers = parties.filter(p =>
          p.isActive && (p.partyType === 'buyer' || p.partyType === 'multi'));
        this.rows.set(buyers.map(p => ({
          party: p,
          limit: p.creditLimit ?? 0,
          days: p.creditDays ?? 0,
          savedAt: null,
          saving: false
        })));
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onSearch() {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      // computed will recompute on signal change
      this.rows.set([...this.rows()]);
    }, 250);
  }

  onFilterChange() {
    this.rows.set([...this.rows()]);
  }

  utilization(r: CreditRow): number {
    if (r.limit <= 0) return 0;
    return (r.party.outstandingBalance / r.limit) * 100;
  }

  recentlySaved(r: CreditRow): boolean {
    return r.savedAt !== null && (this.now - r.savedAt) < 2500;
  }

  availableCredit(r: CreditRow): number {
    return Math.max(0, r.limit - r.party.outstandingBalance);
  }

  utilizationWidth(r: CreditRow): number {
    return Math.min(100, this.utilization(r));
  }

  isDirty(r: CreditRow): boolean {
    return r.limit !== r.party.creditLimit || r.days !== r.party.creditDays;
  }

  markDirty(r: CreditRow) {
    // Force change detection via signal update
    this.rows.set([...this.rows()]);
  }

  onLimitChange(r: CreditRow, val: any) {
    r.limit = Number(val) || 0;
    this.markDirty(r);
  }

  setPreset(r: CreditRow, val: number) {
    r.limit = val;
    this.markDirty(r);
    this.saveRow(r);
  }

  saveRow(r: CreditRow) {
    if (!this.isDirty(r) || r.saving) return;
    r.saving = true;
    this.rows.set([...this.rows()]);
    this.svc.updatePartyCredit(r.party.id, r.limit, r.days).subscribe({
      next: () => {
        // Update underlying party so isDirty becomes false
        r.party.creditLimit = r.limit;
        r.party.creditDays = r.days;
        r.savedAt = Date.now();
        r.saving = false;
        this.rows.set([...this.rows()]);
      },
      error: (e) => {
        r.saving = false;
        alert('Failed to save: ' + (e?.error?.error ?? 'unknown error'));
        this.rows.set([...this.rows()]);
      }
    });
  }

  saveAll() {
    const dirty = this.rows().filter(r => this.isDirty(r));
    dirty.forEach(r => this.saveRow(r));
  }

  applyAutoPresets() {
    // Auto-assign sensible default credit limits based on rating
    const msg = "Apply auto presets? This will set credit limit based on each buyer's rating:\n\nA+ → ₹25L · A → ₹15L · B → ₹10L · C → ₹5L · No rating → ₹5L";
    if (!confirm(msg)) return;
    this.rows().forEach(r => {
      const rating = this.ratingLetter(r.party);
      let preset = 500000;     // ₹5L default
      if (rating === 'A+') preset = 2500000;
      else if (rating === 'A') preset = 1500000;
      else if (rating === 'B') preset = 1000000;
      else if (rating === 'C') preset = 500000;
      if (r.limit !== preset || r.days === 0) {
        r.limit = preset;
        if (r.days === 0) r.days = 45;
        this.saveRow(r);
      }
    });
  }

  // Rating display helpers — parties don't currently have rating in API,
  // so we derive a synthetic rating from outstanding history for now
  ratingLetter(p: Party): string {
    // Placeholder: A+ if no overdue, A if low overdue, etc.
    // In real backend this would come from party.rating
    if (p.outstandingBalance === 0) return 'A+';
    if (p.outstandingBalance < 200000) return 'A';
    if (p.outstandingBalance < 500000) return 'B';
    return 'C';
  }

  ratingStars(p: Party): number {
    const letter = this.ratingLetter(p);
    return letter === 'A+' ? 5 : letter === 'A' ? 4 : letter === 'B' ? 3 : 2;
  }

  statusClass(r: CreditRow): string {
    if (r.limit <= 0) return 'status-grey';
    const u = this.utilization(r);
    if (u > 100) return 'status-red';
    if (u > 75) return 'status-yellow';
    return 'status-green';
  }

  statusText(r: CreditRow): string {
    if (r.limit <= 0) return 'No limit';
    const u = this.utilization(r);
    if (u > 100) return Math.round(u) + '%';
    return Math.round(u) + '%';
  }
}
