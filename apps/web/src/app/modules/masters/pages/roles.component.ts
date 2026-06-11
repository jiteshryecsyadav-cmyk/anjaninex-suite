import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradingSubNavComponent } from '../../trading/components/trading-sub-nav.component';
import { MastersService, RoleItem, CreateRole } from '../services/masters.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { PaginatorComponent } from '../../../shared/paginator.component';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule, FormsModule, TradingSubNavComponent, BackButtonComponent, PaginatorComponent],
  template: `
  <div class="max-w-7xl mx-auto">
    <div class="page-top-bar"><app-back-button></app-back-button></div>

    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="font-display font-black text-2xl text-[#1B2E5C]">🛡️ Role Management</h2>
        <p class="text-sm text-[#4A5878]">Define roles &amp; their inheritance hierarchy</p>
      </div>
      <button (click)="openAdd()" class="btn-primary">+ Add Role</button>
    </div>

    <app-trading-sub-nav></app-trading-sub-nav>

    <!-- World-class 2-pane layout coming next turn. For now — simple list with edit/delete -->
    <div class="card p-0 overflow-hidden">
      @if (loading()) {
        <div class="p-8 text-center text-gray-500">Loading…</div>
      } @else if (roles().length === 0) {
        <div class="p-8 text-center text-gray-500">No roles yet.</div>
      } @else {
        <table class="w-full text-sm">
          <thead class="bg-[#FAF7F0] text-[#1B2E5C] text-xs uppercase">
            <tr>
              <th class="px-3 py-3 text-left">#</th>
              <th class="px-3 py-3 text-left">Role</th>
              <th class="px-3 py-3 text-left">Code</th>
              <th class="px-3 py-3 text-left">Inherits From</th>
              <th class="px-3 py-3 text-center">Type</th>
              <th class="px-3 py-3 text-right">Users</th>
              <th class="px-3 py-3 text-right">Permissions</th>
              <th class="px-3 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (r of pagedRoles(); track r.id; let i = $index) {
              <tr class="border-t hover:bg-[#FAF7F0]">
                <td class="px-3 py-3 text-gray-500">{{ (pageClamped()-1)*pageSize() + i + 1 }}</td>
                <td class="px-3 py-3 font-bold text-[#1B2E5C]">{{ r.name }}</td>
                <td class="px-3 py-3 font-mono text-xs text-gray-500">{{ r.code }}</td>
                <td class="px-3 py-3 text-xs">{{ r.inheritsFromName || '—' }}</td>
                <td class="px-3 py-3 text-center">
                  @if (r.isSystem) {
                    <span class="pill pill-navy">🔒 System</span>
                  } @else {
                    <span class="pill pill-green">Custom</span>
                  }
                </td>
                <td class="px-3 py-3 text-right font-mono">{{ r.userCount }}</td>
                <td class="px-3 py-3 text-right font-mono">{{ r.permissionCount }}</td>
                <td class="px-3 py-3 text-center">
                  @if (!r.isSystem) {
                    <button (click)="openEdit(r)" class="ai-btn">✏️</button>
                    <button (click)="del(r)" class="ai-btn ai-danger">🗑️</button>
                  } @else {
                    <span class="text-xs text-gray-400 italic">protected</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-paginator [total]="roles().length" [page]="pageClamped()" [pageSize]="pageSize()"
                       (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event); page.set(1)"></app-paginator>
      }
    </div>

    @if (showForm()) {
      <div class="modal-overlay" (click)="closeForm()">
        <div class="modal-paper" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editingId() ? '✏️ Edit Role' : '🛡️ Add Role' }}</h3>
            <button (click)="closeForm()" class="x-btn">×</button>
          </div>
          <div class="modal-body">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="lbl">ROLE NAME *</label>
                <input [(ngModel)]="form.name" class="ip" placeholder="e.g. Sales Manager">
              </div>
              <div>
                <label class="lbl">CODE</label>
                <input [(ngModel)]="form.code" class="ip" placeholder="Auto if empty" [disabled]="!!editingId()">
              </div>
              <div class="col-span-2">
                <label class="lbl">DESCRIPTION</label>
                <input [(ngModel)]="form.description" class="ip" placeholder="What can this role do?">
              </div>
              <div class="col-span-2">
                <label class="lbl">INHERITS FROM (PARENT ROLE)</label>
                <select [(ngModel)]="form.inheritsFrom" class="ip">
                  <option [ngValue]="null">— None (root role) —</option>
                  @for (r of roles(); track r.id) {
                    @if (r.id !== editingId()) {
                      <option [ngValue]="r.id">{{ r.name }}</option>
                    }
                  }
                </select>
                <div class="text-xs text-gray-500 mt-1">
                  Inherits all permissions from the parent; this role can override them in the Permissions matrix.
                </div>
              </div>
              <div>
                <label class="lbl">COLOR (HEX)</label>
                <input [(ngModel)]="form.color" class="ip" placeholder="#DC2626">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button (click)="closeForm()" class="btn-cancel">Cancel</button>
            <button (click)="save()" class="btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving…' : (editingId() ? '✓ Update Role' : '✨ Create Role') }}
            </button>
          </div>
        </div>
      </div>
    }
  </div>
  `,
  styles: [`
    .card { background:#fff; border:1px solid #D6DDEA; border-radius:10px; }
    .lbl { display:block; font-size:10px; font-weight:700; color:#4A5878; letter-spacing:0.5px; margin-bottom:4px; }
    .ip { width:100%; padding:8px 10px; font-size:13px; border:1px solid #D6DDEA; border-radius:6px; background:#fff; color:#1B2E5C; }
    .ip:focus { outline:none; border-color:#1B2E5C; box-shadow:0 0 0 2px rgba(27,46,92,0.08); }
    .ip:disabled { background:#F3F4F6; }
    .btn-primary { padding:9px 16px; background:#DC2626; color:#fff; border:0; border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }
    .btn-primary:hover:not(:disabled) { background:#B91C1C; }
    .btn-primary:disabled { background:#9CA3AF; }
    .btn-cancel { padding:9px 16px; background:#fff; color:#4A5878; border:1px solid #D6DDEA; border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }
    .pill { display:inline-block; padding:3px 9px; font-size:11px; font-weight:700; border-radius:6px; }
    .pill-navy { background:#E0E7FF; color:#1E3A8A; }
    .pill-green { background:#D1FAE5; color:#065F46; }
    .ai-btn { width:30px; height:30px; border:0; background:transparent; border-radius:6px;
      cursor:pointer; font-size:14px; transition:background 0.15s; }
    .ai-btn:hover { background:#FAF7F0; }
    .ai-danger:hover { background:#FEE2E2; }
    .modal-overlay { position:fixed; inset:0; background:rgba(27,46,92,0.55); z-index:1000;
      display:flex; align-items:center; justify-content:center; padding:30px 20px; }
    .modal-paper { background:#fff; max-width:600px; width:100%; border-radius:12px;
      box-shadow:0 20px 60px rgba(0,0,0,0.3); overflow:hidden; }
    .modal-header { padding:14px 20px; border-bottom:1px solid #D6DDEA; display:flex;
      justify-content:space-between; align-items:center; }
    .modal-header h3 { font-size:17px; font-weight:800; color:#1B2E5C; margin:0; }
    .modal-body { padding:18px 20px; }
    .modal-footer { padding:14px 20px; background:#FAF7F0; border-top:1px solid #D6DDEA;
      display:flex; justify-content:flex-end; gap:8px; }
    .x-btn { border:0; background:transparent; font-size:26px; cursor:pointer; color:#6B7280; line-height:1; padding:0 6px; }
    .x-btn:hover { color:#DC2626; }
  `]
})
export class RolesComponent {
  private svc = inject(MastersService);

  roles = signal<RoleItem[]>([]);
  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageClamped = computed(() => {
    const pages = Math.max(1, Math.ceil(this.roles().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });
  pagedRoles = computed(() => {
    const st = (this.pageClamped() - 1) * this.pageSize();
    return this.roles().slice(st, st + this.pageSize());
  });
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);

  form: any = this.blankForm();

  private blankForm(): CreateRole {
    return { code: '', name: '', description: '', inheritsFrom: null, color: '' };
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.listRoles().subscribe({
      next: r => { this.roles.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  openAdd() {
    this.form = this.blankForm();
    this.editingId.set(null);
    this.showForm.set(true);
  }

  openEdit(r: RoleItem) {
    this.form = {
      code: r.code,
      name: r.name,
      description: r.description ?? '',
      inheritsFrom: r.inheritsFrom,
      color: r.color ?? ''
    };
    this.editingId.set(r.id);
    this.showForm.set(true);
  }

  closeForm() { this.showForm.set(false); }

  save() {
    if (!this.form.name?.trim()) { alert('Role name is required'); return; }
    this.saving.set(true);
    const id = this.editingId();
    const op = id
      ? this.svc.updateRole(id, this.form)
      : this.svc.createRole(this.form);
    op.subscribe({
      next: () => { this.saving.set(false); this.showForm.set(false); this.load(); },
      error: (e) => { this.saving.set(false); alert('Failed: ' + (e?.error?.error ?? 'unknown')); }
    });
  }

  del(r: RoleItem) {
    if (!confirm(`Delete role "${r.name}"? This cannot be undone.`)) return;
    this.svc.deleteRole(r.id).subscribe({
      next: () => this.load(),
      error: (e) => alert('Failed: ' + (e?.error?.error ?? 'unknown'))
    });
  }
}
