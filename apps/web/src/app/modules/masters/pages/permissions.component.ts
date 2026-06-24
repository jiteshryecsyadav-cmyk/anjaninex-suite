import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradingSubNavComponent } from '../../trading/components/trading-sub-nav.component';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';
import {
  MastersService, RoleItem, PermissionModule, PermissionResource, PermissionCell
} from '../services/masters.service';

// Column order for the matrix — sirf wahi columns dikhte hain jo catalog me hain.
const ACTION_COLS: { key: string; label: string }[] = [
  { key: 'create', label: 'Create' },
  { key: 'view',   label: 'Read' },     // view + viewown dono yahan
  { key: 'edit',   label: 'Update' },   // edit + update dono yahan
  { key: 'delete', label: 'Delete' },
  { key: 'approve', label: 'Approve' },
  { key: 'export', label: 'Export' },
  { key: 'bulk',   label: 'Bulk' },     // bulk + use + send + recharge jaise extra
];

// Action ko column-key me normalize karo (synonyms ek hi column me).
function colKey(action: string): string {
  if (action === 'viewown') return 'view';
  if (action === 'update') return 'edit';
  if (['create', 'view', 'edit', 'delete', 'approve', 'export'].includes(action)) return action;
  return 'bulk'; // use, send, recharge, bulk … sab "Bulk/Other" me
}

@Component({
  selector: 'app-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule, TradingSubNavComponent, BackButtonComponent],
  template: `
  <div class="max-w-7xl mx-auto">
    <div class="page-top-bar"><app-back-button></app-back-button></div>

    <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
      <div>
        <h2 class="font-display font-black text-2xl text-[#1B2E5C]">🔐 Role Permissions</h2>
        <p class="text-sm text-[#4A5878]">Ek role chuno, uske rights tick karo, phir Save — Create / Read / Update / Delete / Approve / Export / Bulk</p>
      </div>
      @if (roleId()) {
        <button (click)="save()" class="btn-primary" [disabled]="saving() || loadingPerms()">
          {{ saving() ? 'Saving…' : '✓ Save Permissions' }}
        </button>
      }
    </div>

    <app-trading-sub-nav></app-trading-sub-nav>

    <!-- Role selector + presets -->
    <div class="card p-4 mb-4">
      <div class="flex items-end gap-3 flex-wrap">
        <div class="min-w-[240px]">
          <label class="lbl">ROLE</label>
          <select [(ngModel)]="roleIdModel" (ngModelChange)="onRoleChange($event)" class="ip">
            <option [ngValue]="''">— Role chuno —</option>
            @for (r of roles(); track r.id) {
              <option [ngValue]="r.id">{{ r.name }} ({{ r.permissionCount }})</option>
            }
          </select>
        </div>

        @if (roleId()) {
          <div class="flex-1">
            <label class="lbl">QUICK PRESETS</label>
            <div class="flex gap-2 flex-wrap">
              <button (click)="applyPreset('viewer')"  class="preset preset-blue">👁 Viewer</button>
              <button (click)="applyPreset('editor')"  class="preset preset-green">✏️ Editor</button>
              <button (click)="applyPreset('manager')" class="preset preset-amber">📋 Manager</button>
              <button (click)="applyPreset('admin')"   class="preset preset-red">⚡ Admin (sab)</button>
              <button (click)="clearAll()"             class="preset preset-grey">✖ Clear</button>
            </div>
          </div>
        }
      </div>
      @if (selectedRole()?.isSystem && (selectedRole()?.code === 'firm_admin' || selectedRole()?.code === 'firm_owner')) {
        <div class="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
          🔒 Admin/Owner role lock hai — iske rights save nahi honge (lockout se bachne ke liye).
        </div>
      }
    </div>

    @if (!roleId()) {
      <div class="card p-10 text-center text-[#4A5878]">Upar se ek role chuno — uska permission matrix yahan khulega.</div>
    } @else if (loadingCatalog()) {
      <div class="card p-10 text-center text-gray-500">Loading catalog…</div>
    } @else {
      @for (m of catalog(); track m.module) {
        <div class="card mb-3 overflow-hidden">
          <button (click)="toggleModule(m.module)" class="mod-head">
            <span>{{ collapsed().has(m.module) ? '▸' : '▾' }} {{ m.label }}</span>
            <span class="flex items-center gap-2">
              <span class="mod-count">{{ moduleCheckedCount(m) }}/{{ moduleTotal(m) }}</span>
              <span (click)="$event.stopPropagation(); toggleWholeModule(m)"
                    class="mod-all" [class.on]="moduleAllChecked(m)" title="Pure module ke sab rights">
                {{ moduleAllChecked(m) ? '✓ All' : 'Select all' }}
              </span>
            </span>
          </button>

          @if (!collapsed().has(m.module)) {
            <table class="w-full text-sm">
              <thead class="bg-[#FAF7F0] text-[#1B2E5C] text-xs uppercase">
                <tr>
                  <th class="px-3 py-2 text-left">Resource</th>
                  @for (c of cols; track c.key) {
                    <th class="px-2 py-2 text-center w-16">{{ c.label }}</th>
                  }
                  <th class="px-2 py-2 text-center w-16">Row</th>
                </tr>
              </thead>
              <tbody>
                @for (res of m.resources; track res.resource) {
                  <tr class="border-t hover:bg-[#FAF7F0]">
                    <td class="px-3 py-2 font-semibold text-[#1B2E5C]">{{ res.label }}</td>
                    @for (c of cols; track c.key) {
                      <td class="px-2 py-2 text-center">
                        @if (cellFor(res, c.key); as cell) {
                          @if (cell.scopes.length > 1) {
                            <!-- Same action, multiple scopes → small scope dropdown -->
                            <select class="scope-sel"
                                    [ngModel]="pickedScope(res, c.key, cell.scopes)"
                                    (ngModelChange)="pickScope(res, c.key, cell.scopes, $event)">
                              <option [ngValue]="''">—</option>
                              @for (s of cell.scopes; track s.code) {
                                <option [ngValue]="s.code">{{ scopeLabel(s.scope) }}</option>
                              }
                            </select>
                          } @else {
                            <input type="checkbox"
                                   [checked]="has(cell.scopes[0].code)"
                                   (change)="toggle(cell.scopes[0].code)"
                                   [title]="cell.scopes[0].description || cell.scopes[0].code">
                          }
                        }
                      </td>
                    }
                    <td class="px-2 py-2 text-center bg-[#FAF7F0]">
                      <input type="checkbox" [checked]="rowAllChecked(res)" (change)="toggleRow(res)"
                             title="Is resource ke saare rights ek saath">
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      } @empty {
        <div class="card p-10 text-center text-gray-400">Permissions catalog khali hai.</div>
      }
    }
  </div>
  `,
  styles: [`
    .card { background:#fff; border:1px solid #D6DDEA; border-radius:10px; }
    .lbl { display:block; font-size:10px; font-weight:700; color:#4A5878; letter-spacing:0.5px; margin-bottom:4px; }
    .ip { width:100%; padding:8px 10px; font-size:13px; border:1px solid #D6DDEA; border-radius:6px; background:#fff; color:#1B2E5C; }
    .ip:focus { outline:none; border-color:#1B2E5C; box-shadow:0 0 0 2px rgba(27,46,92,0.08); }
    .btn-primary { padding:9px 16px; background:#DC2626; color:#fff; border:0; border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }
    .btn-primary:hover:not(:disabled) { background:#B91C1C; }
    .btn-primary:disabled { background:#9CA3AF; cursor:not-allowed; }
    .preset { padding:6px 11px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid transparent; }
    .preset-blue  { background:#E0E7FF; color:#1E3A8A; } .preset-blue:hover  { background:#c7d2fe; }
    .preset-green { background:#D1FAE5; color:#065F46; } .preset-green:hover { background:#a7f3d0; }
    .preset-amber { background:#FEF3C7; color:#92400E; } .preset-amber:hover { background:#fde68a; }
    .preset-red   { background:#FEE2E2; color:#991B1B; } .preset-red:hover   { background:#fecaca; }
    .preset-grey  { background:#fff; color:#4A5878; border-color:#D6DDEA; } .preset-grey:hover { background:#F3F4F6; }
    .mod-head { width:100%; display:flex; justify-content:space-between; align-items:center;
      padding:11px 16px; background:#FAF7F0; border:0; cursor:pointer;
      font-weight:800; color:#1B2E5C; font-size:15px; }
    .mod-head:hover { background:#F3EFE6; }
    .mod-count { font-size:11px; font-family:monospace; color:#4A5878; background:#fff;
      border:1px solid #D6DDEA; border-radius:6px; padding:2px 7px; }
    .mod-all { font-size:11px; font-weight:700; color:#4A5878; background:#fff;
      border:1px solid #D6DDEA; border-radius:6px; padding:3px 8px; cursor:pointer; }
    .mod-all.on { background:#D1FAE5; color:#065F46; border-color:#a7f3d0; }
    .scope-sel { font-size:11px; border:1px solid #D6DDEA; border-radius:5px; padding:2px 4px; background:#fff; color:#1B2E5C; max-width:90px; }
    input[type="checkbox"] { width:16px; height:16px; cursor:pointer; accent-color:#1B2E5C; }
    @media (max-width: 640px) {
      .card { overflow-x:auto; -webkit-overflow-scrolling:touch; }
    }
  `]
})
export class PermissionsComponent {
  private svc = inject(MastersService);
  private toast = inject(ToastService);

  cols = ACTION_COLS;

  roles = signal<RoleItem[]>([]);
  catalog = signal<PermissionModule[]>([]);
  granted = signal<Set<string>>(new Set());   // checked permission codes
  collapsed = signal<Set<string>>(new Set());

  roleId = signal('');
  roleIdModel = '';
  loadingCatalog = signal(false);
  loadingPerms = signal(false);
  saving = signal(false);

  selectedRole = computed(() => this.roles().find(r => r.id === this.roleId()) ?? null);

  ngOnInit() {
    this.svc.listRoles().subscribe({ next: r => this.roles.set(r) });
    this.loadingCatalog.set(true);
    this.svc.permissionCatalog().subscribe({
      next: c => { this.catalog.set(c); this.loadingCatalog.set(false); },
      error: () => { this.loadingCatalog.set(false); this.toast.error('Catalog load nahi hua'); }
    });
  }

  onRoleChange(id: string) {
    this.roleId.set(id);
    this.granted.set(new Set());
    if (!id) return;
    this.loadingPerms.set(true);
    this.svc.getRolePermissionCodes(id).subscribe({
      next: codes => { this.granted.set(new Set(codes)); this.loadingPerms.set(false); },
      error: () => { this.loadingPerms.set(false); this.toast.error('Role permissions load nahi hue'); }
    });
  }

  // ── cell helpers ──────────────────────────────────────────────────────────
  /** Resource ke andar ek column-key ke saare scope-variants. null = no perm. */
  cellFor(res: PermissionResource, key: string): { scopes: PermissionCell[] } | null {
    const scopes = res.permissions.filter(p => colKey(p.action) === key);
    return scopes.length ? { scopes } : null;
  }

  scopeLabel(scope: string): string {
    switch (scope) {
      case 'self':   return 'Only mine';
      case 'branch': return 'Branch';
      case 'firm':   return 'Firm';
      case 'all':    return 'All';
      default:       return scope;
    }
  }

  has(code: string): boolean { return this.granted().has(code); }

  toggle(code: string) {
    this.granted.update(s => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }

  /** Multi-scope cell: jo scope abhi checked hai uska code (ek hi at a time). */
  pickedScope(res: PermissionResource, key: string, scopes: PermissionCell[]): string {
    const on = scopes.find(s => this.granted().has(s.code));
    return on?.code ?? '';
  }
  pickScope(res: PermissionResource, key: string, scopes: PermissionCell[], chosenCode: string) {
    this.granted.update(s => {
      const n = new Set(s);
      for (const sc of scopes) n.delete(sc.code);  // ek action = ek scope
      if (chosenCode) n.add(chosenCode);
      return n;
    });
  }

  // ── row helpers ───────────────────────────────────────────────────────────
  private rowCodes(res: PermissionResource): string[] { return res.permissions.map(p => p.code); }
  rowAllChecked(res: PermissionResource): boolean {
    const cs = this.rowCodes(res);
    return cs.length > 0 && cs.every(c => this.granted().has(c));
  }
  toggleRow(res: PermissionResource) {
    const on = !this.rowAllChecked(res);
    this.granted.update(s => {
      const n = new Set(s);
      for (const c of this.rowCodes(res)) on ? n.add(c) : n.delete(c);
      return n;
    });
  }

  // ── module helpers ────────────────────────────────────────────────────────
  private moduleCodes(m: PermissionModule): string[] {
    return m.resources.flatMap(r => r.permissions.map(p => p.code));
  }
  moduleTotal(m: PermissionModule): number { return this.moduleCodes(m).length; }
  moduleCheckedCount(m: PermissionModule): number {
    return this.moduleCodes(m).filter(c => this.granted().has(c)).length;
  }
  moduleAllChecked(m: PermissionModule): boolean {
    const cs = this.moduleCodes(m);
    return cs.length > 0 && cs.every(c => this.granted().has(c));
  }
  toggleWholeModule(m: PermissionModule) {
    const on = !this.moduleAllChecked(m);
    this.granted.update(s => {
      const n = new Set(s);
      for (const c of this.moduleCodes(m)) on ? n.add(c) : n.delete(c);
      return n;
    });
  }
  toggleModule(code: string) {
    this.collapsed.update(s => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }

  // ── presets ───────────────────────────────────────────────────────────────
  private allCells(): PermissionCell[] {
    return this.catalog().flatMap(m => m.resources.flatMap(r => r.permissions));
  }
  applyPreset(kind: 'viewer' | 'editor' | 'manager' | 'admin') {
    const next = new Set<string>();
    for (const p of this.allCells()) {
      const a = p.action;
      const isView = a === 'view' || a === 'viewown';
      if (kind === 'admin') { next.add(p.code); continue; }
      if (isView) { next.add(p.code); continue; }                                  // sab presets: view on
      if (kind === 'editor'  && (a === 'create' || a === 'edit' || a === 'update')) next.add(p.code);
      if (kind === 'manager' && ['create','edit','update','approve','export'].includes(a)) next.add(p.code);
    }
    this.granted.set(next);
  }
  clearAll() { this.granted.set(new Set()); }

  // ── save ──────────────────────────────────────────────────────────────────
  save() {
    const id = this.roleId();
    if (!id) return;
    this.saving.set(true);
    this.svc.setRolePermissionCodes(id, Array.from(this.granted())).subscribe({
      next: res => {
        this.saving.set(false);
        this.toast.success(`Permissions save ho gaye (${res.count})`);
        // role list ke counts refresh
        this.svc.listRoles().subscribe({ next: r => this.roles.set(r) });
      },
      error: (e) => { this.saving.set(false); this.toast.error(e?.error?.error ?? 'Save fail'); }
    });
  }
}
