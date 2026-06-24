import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradingSubNavComponent } from '../../trading/components/trading-sub-nav.component';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';
import {
  MastersService, RoleItem, AppScreen, ScreenPermRow
} from '../services/masters.service';

// ============================================================================
// ROLE PERMISSIONS — SCREEN-BASED CRUD MATRIX
// One row per app SCREEN (sidebar/menu item). Each row → C/R/U/D checkboxes
// for the selected role. USER TYPE filters/groups the role dropdown
// (client-side only). "All Read on/off" toggles R for every visible screen.
// "Save matrix" persists via PUT /api/core/roles/{id}/screen-permissions.
//
// NOTE: This configures permissions only — no route-guard ENFORCEMENT yet
// (that is a separate task). It just stores who-should-be-able-to-do-what.
// ============================================================================

interface Cell { c: boolean; r: boolean; u: boolean; d: boolean; }

@Component({
  selector: 'app-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule, TradingSubNavComponent, BackButtonComponent],
  template: `
  <div class="max-w-7xl mx-auto">
    <div class="page-top-bar"><app-back-button></app-back-button></div>

    <!-- Header -->
    <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
      <div>
        <h2 class="font-display font-black text-2xl text-[#1B2E5C]">🔐 Role permissions</h2>
        <p class="text-sm text-[#4A5878]">Map each permission to Create / Read / Update / Delete for the selected role</p>
      </div>

      <!-- Top-right controls -->
      <div class="flex items-end gap-2 flex-wrap">
        <div>
          <label class="lbl">User type</label>
          <select [(ngModel)]="userTypeModel" (ngModelChange)="onUserTypeChange($event)" class="ip w-40">
            <option [ngValue]="'all'">All roles</option>
            <option [ngValue]="'company'">Company (system)</option>
            <option [ngValue]="'custom'">Custom</option>
          </select>
        </div>
        <div>
          <label class="lbl">Role</label>
          <select [(ngModel)]="roleIdModel" (ngModelChange)="onRoleChange($event)" class="ip w-56">
            <option [ngValue]="''">— Select role —</option>
            @for (r of filteredRoles(); track r.id) {
              <option [ngValue]="r.id">{{ r.name }} ({{ grantedCount(r) }})</option>
            }
          </select>
        </div>
        <button (click)="setAllRead(true)"  [disabled]="!roleId()" class="btn-ghost">All Read on</button>
        <button (click)="setAllRead(false)" [disabled]="!roleId()" class="btn-ghost">All Read off</button>
        <button (click)="save()" [disabled]="!roleId() || saving() || loadingPerms()" class="btn-primary">
          {{ saving() ? 'Saving…' : '💾 Save matrix' }}
        </button>
      </div>
    </div>

    <app-trading-sub-nav></app-trading-sub-nav>

    @if (selectedRole()?.code === 'super_admin' ||
         (selectedRole()?.isSystem && (selectedRole()?.code === 'firm_admin' || selectedRole()?.code === 'firm_owner'))) {
      <div class="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
        🔒 This role is locked — its matrix cannot be saved (to avoid admin lockout).
      </div>
    }

    @if (!roleId()) {
      <div class="card p-10 text-center text-[#4A5878]">Select a role above — its screen-permission matrix opens here.</div>
    } @else if (loadingScreens() || loadingPerms()) {
      <div class="card p-10 text-center text-gray-500">Loading matrix…</div>
    } @else {
      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-[#FAF7F0] text-[#1B2E5C] text-xs uppercase">
            <tr>
              <th class="px-3 py-2 text-left">Permission</th>
              <th class="px-3 py-2 text-left">Code</th>
              <th class="px-3 py-2 text-left">Route</th>
              <th class="px-2 py-2 text-center w-12" title="Create">C</th>
              <th class="px-2 py-2 text-center w-12" title="Read">R</th>
              <th class="px-2 py-2 text-center w-12" title="Update">U</th>
              <th class="px-2 py-2 text-center w-12" title="Delete">D</th>
            </tr>
          </thead>
          <tbody>
            @for (g of grouped(); track g.module) {
              <tr class="bg-[#F3EFE6]">
                <td colspan="7" class="px-3 py-1.5 font-extrabold text-[#1B2E5C] text-xs uppercase tracking-wide">
                  {{ g.module }}
                </td>
              </tr>
              @for (s of g.screens; track s.code) {
                <tr class="border-t hover:bg-[#FAF7F0]">
                  <td class="px-3 py-2 font-semibold text-[#1B2E5C]">{{ s.label }}</td>
                  <td class="px-3 py-2 font-mono text-xs text-[#4A5878]">{{ s.code }}</td>
                  <td class="px-3 py-2 font-mono text-xs text-[#4A5878]">{{ s.route || '—' }}</td>
                  <td class="px-2 py-2 text-center">
                    <input type="checkbox" [checked]="cell(s.code).c" (change)="toggle(s.code, 'c')">
                  </td>
                  <td class="px-2 py-2 text-center">
                    <input type="checkbox" [checked]="cell(s.code).r" (change)="toggle(s.code, 'r')">
                  </td>
                  <td class="px-2 py-2 text-center">
                    <input type="checkbox" [checked]="cell(s.code).u" (change)="toggle(s.code, 'u')">
                  </td>
                  <td class="px-2 py-2 text-center">
                    <input type="checkbox" [checked]="cell(s.code).d" (change)="toggle(s.code, 'd')">
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="7" class="px-3 py-10 text-center text-gray-400">No screens in catalog.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  </div>
  `,
  styles: [`
    .card { background:#fff; border:1px solid #D6DDEA; border-radius:10px; }
    .lbl { display:block; font-size:10px; font-weight:700; color:#4A5878; letter-spacing:0.5px; margin-bottom:4px; }
    .ip { padding:8px 10px; font-size:13px; border:1px solid #D6DDEA; border-radius:6px; background:#fff; color:#1B2E5C; }
    .ip:focus { outline:none; border-color:#1B2E5C; box-shadow:0 0 0 2px rgba(27,46,92,0.08); }
    .btn-primary { padding:9px 16px; background:#DC2626; color:#fff; border:0; border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }
    .btn-primary:hover:not(:disabled) { background:#B91C1C; }
    .btn-primary:disabled { background:#9CA3AF; cursor:not-allowed; }
    .btn-ghost { padding:9px 12px; background:#fff; color:#1B2E5C; border:1px solid #D6DDEA; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer; }
    .btn-ghost:hover:not(:disabled) { background:#F3F4F6; }
    .btn-ghost:disabled { opacity:.5; cursor:not-allowed; }
    input[type="checkbox"] { width:16px; height:16px; cursor:pointer; accent-color:#1B2E5C; }
  `]
})
export class PermissionsComponent {
  private svc = inject(MastersService);
  private toast = inject(ToastService);

  roles = signal<RoleItem[]>([]);
  screens = signal<AppScreen[]>([]);
  /** screenCode → CRUD cell (current edit state). */
  matrix = signal<Map<string, Cell>>(new Map());

  roleId = signal('');
  roleIdModel = '';
  userType = signal<'all' | 'company' | 'custom'>('all');
  userTypeModel: 'all' | 'company' | 'custom' = 'all';

  loadingScreens = signal(false);
  loadingPerms = signal(false);
  saving = signal(false);

  selectedRole = computed(() => this.roles().find(r => r.id === this.roleId()) ?? null);

  // USER TYPE = client-side grouping: "company" = system roles, "custom" = firm roles.
  filteredRoles = computed(() => {
    const t = this.userType();
    return this.roles().filter(r =>
      t === 'all' ? true : t === 'company' ? r.isSystem : !r.isSystem);
  });

  // Screens grouped by module, preserving sort_order from the API.
  grouped = computed(() => {
    const groups: { module: string; screens: AppScreen[] }[] = [];
    const idx = new Map<string, number>();
    for (const s of this.screens()) {
      const m = s.module || 'Other';
      if (!idx.has(m)) { idx.set(m, groups.length); groups.push({ module: m, screens: [] }); }
      groups[idx.get(m)!].screens.push(s);
    }
    return groups;
  });

  ngOnInit() {
    this.svc.listRoles().subscribe({ next: r => this.roles.set(r) });
    this.loadingScreens.set(true);
    this.svc.screens().subscribe({
      next: s => { this.screens.set(s); this.loadingScreens.set(false); },
      error: () => { this.loadingScreens.set(false); this.toast.error('Screen catalog load nahi hua'); }
    });
  }

  /** Granted count = screens where this role has ANY of C/R/U/D (best-effort label). */
  grantedCount(r: RoleItem): number {
    if (r.id === this.roleId()) {
      let n = 0;
      for (const c of this.matrix().values()) if (c.c || c.r || c.u || c.d) n++;
      return n;
    }
    return 0;
  }

  onUserTypeChange(t: 'all' | 'company' | 'custom') {
    this.userType.set(t);
    // If current role no longer visible under the new filter, clear selection.
    if (this.roleId() && !this.filteredRoles().some(r => r.id === this.roleId())) {
      this.roleIdModel = '';
      this.onRoleChange('');
    }
  }

  onRoleChange(id: string) {
    this.roleId.set(id);
    this.resetMatrix();
    if (!id) return;
    this.loadingPerms.set(true);
    this.svc.getRoleScreenPerms(id).subscribe({
      next: rows => {
        const m = this.blankMatrix();
        for (const row of rows) {
          if (m.has(row.screenCode)) m.set(row.screenCode, { c: row.c, r: row.r, u: row.u, d: row.d });
        }
        this.matrix.set(m);
        this.loadingPerms.set(false);
      },
      error: () => { this.loadingPerms.set(false); this.toast.error('Role permissions load nahi hue'); }
    });
  }

  // ── matrix helpers ─────────────────────────────────────────────────────────
  private blankMatrix(): Map<string, Cell> {
    const m = new Map<string, Cell>();
    for (const s of this.screens()) m.set(s.code, { c: false, r: false, u: false, d: false });
    return m;
  }
  private resetMatrix() { this.matrix.set(this.blankMatrix()); }

  cell(code: string): Cell {
    return this.matrix().get(code) ?? { c: false, r: false, u: false, d: false };
  }

  toggle(code: string, key: keyof Cell) {
    this.matrix.update(m => {
      const n = new Map(m);
      const cur = n.get(code) ?? { c: false, r: false, u: false, d: false };
      n.set(code, { ...cur, [key]: !cur[key] });
      return n;
    });
  }

  /** "All Read on/off" — toggle R for every screen in catalog. */
  setAllRead(on: boolean) {
    this.matrix.update(m => {
      const n = new Map(m);
      for (const s of this.screens()) {
        const cur = n.get(s.code) ?? { c: false, r: false, u: false, d: false };
        n.set(s.code, { ...cur, r: on });
      }
      return n;
    });
  }

  // ── save ──────────────────────────────────────────────────────────────────
  save() {
    const id = this.roleId();
    if (!id) return;
    const rows: ScreenPermRow[] = [];
    for (const [code, c] of this.matrix().entries()) {
      if (c.c || c.r || c.u || c.d) rows.push({ screenCode: code, c: c.c, r: c.r, u: c.u, d: c.d });
    }
    this.saving.set(true);
    this.svc.saveRoleScreenPerms(id, rows).subscribe({
      next: res => {
        this.saving.set(false);
        this.toast.success(`Matrix saved (${res.count} screens)`);
      },
      error: (e) => { this.saving.set(false); this.toast.error(e?.error?.error ?? 'Save fail'); }
    });
  }
}
