import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive, ActivatedRoute } from '@angular/router';
import { AccountingService, AccountGroup, AccountHead } from '../services/accounting.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-account-groups',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive, BackButtonComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📁 Account Groups</h2>
          <p class="text-sm text-[#6b3fa0]">Second-level groups (e.g., Current Assets, Direct Expenses)</p>
        </div>
        <button (click)="showForm.set(true)" class="btn-primary">+ New Group</button>
      </div>

      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5]">
        <a routerLink="/accounting/heads" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Heads</a>
        <a routerLink="/accounting/groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Groups</a>
        <a routerLink="/accounting/sub-groups" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Sub Groups</a>
        <a routerLink="/accounting/ledgers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Ledgers</a>
        <a routerLink="/accounting/vouchers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Vouchers</a>
        <a routerLink="/accounting/voucher-list" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📋 Voucher List</a>
        <a routerLink="/accounting/trial-balance" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Trial Balance</a>
        <a routerLink="/accounting/profit-loss" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">P&amp;L</a>
        <a routerLink="/accounting/balance-sheet" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Balance Sheet</a>
        <a routerLink="/accounting/activity-log" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🕵️ Log</a>
      </div>

      <div class="flex gap-2 mb-4">
        <select [(ngModel)]="filterHead" (change)="load()" class="input w-64">
          <option value="">All Heads</option>
          @for (h of heads(); track h.id) {
            <option [value]="h.id">{{ h.name }}</option>
          }
        </select>
      </div>

      <div class="card p-0 overflow-hidden">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-4 py-3 text-left">S.NO</th>
                <th class="px-4 py-3 text-left">Group Name</th>
                <th class="px-4 py-3 text-left">Under Head</th>
                <th class="px-4 py-3 text-right">Sub Groups</th>
                <th class="px-4 py-3 text-right">Ledgers</th>
                <th class="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (g of groups(); track g.id; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-4 py-2 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-4 py-2 font-semibold">{{ g.name }}</td>
                  <td class="px-4 py-2">
                    <span class="px-2 py-0.5 bg-[#f0e6ff] text-[#5c1a8b] rounded text-xs">
                      {{ g.headName }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-right">{{ g.subGroupCount }}</td>
                  <td class="px-4 py-2 text-right">{{ g.ledgerCount }}</td>
                  <td class="px-4 py-2 text-center">
                    @if (!g.isSystem) {
                      <button (click)="edit(g)" class="text-[#5c1a8b] text-xs hover:underline mr-2">✏️ Edit</button>
                      <button (click)="del(g.id)" class="text-red-600 text-xs hover:underline">Delete</button>
                    } @else {
                      <span class="text-xs text-gray-400">System</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      @if (showForm()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="closeForm()">
          <div class="bg-white rounded-2xl p-6 w-full max-w-md" (click)="$event.stopPropagation()">
            <h3 class="font-display font-bold text-lg text-[#5c1a8b] mb-4">{{ editingId() ? 'Edit Group' : 'New Group' }}</h3>
            <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-3">
              <label class="text-xs font-bold text-[#6b3fa0] uppercase">Under Head *</label>
              <select formControlName="headId" class="input">
                <option value="">Select head...</option>
                @for (h of heads(); track h.id) {
                  <option [value]="h.id">{{ h.name }}</option>
                }
              </select>
              <label class="text-xs font-bold text-[#6b3fa0] uppercase">Group Name *</label>
              <input formControlName="name" class="input" placeholder="e.g., Marketing Expenses">
              @if (error()) {
                <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{{ error() }}</div>
              }
              <div class="flex justify-end gap-2 mt-2">
                <button type="button" (click)="closeForm()" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
                <button type="submit" class="btn-primary" [disabled]="form.invalid || saving()">
                  {{ saving() ? 'Saving…' : (editingId() ? 'Update' : 'Create') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `
})
export class AccountGroupsComponent {
  private svc = inject(AccountingService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);

  groups = signal<AccountGroup[]>([]);
  heads = signal<AccountHead[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editingId = signal<string | null>(null);
  error = signal('');
  filterHead = '';

  form = this.fb.nonNullable.group({
    headId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(2)]]
  });

  ngOnInit() {
    this.filterHead = this.route.snapshot.queryParamMap.get('headId') ?? '';
    this.svc.listHeads().subscribe(h => this.heads.set(h));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.listGroups(this.filterHead || undefined).subscribe({
      next: (g) => { this.groups.set(g); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  edit(g: AccountGroup) {
    if (g.isSystem) return;   // system groups locked
    this.editingId.set(g.id);
    this.form.patchValue({ headId: g.headId, name: g.name });
    this.showForm.set(true);
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');
    const v = this.form.getRawValue();
    const obs = this.editingId()
      ? this.svc.updateGroup(this.editingId()!, { headId: v.headId, name: v.name })
      : this.svc.createGroup(v);
    obs.subscribe({
      next: () => { this.load(); this.closeForm(); },
      error: (e) => {
        this.error.set(e?.error?.error ?? 'Failed');
        this.saving.set(false);
      }
    });
  }

  closeForm() {
    this.showForm.set(false);
    this.editingId.set(null);
    this.form.reset({ headId: '', name: '' });
    this.saving.set(false);
    this.error.set('');
  }

  del(id: string) {
    if (!confirm('Delete this group?')) return;
    this.svc.deleteGroup(id).subscribe({
      next: () => this.load(),
      error: (e) => alert(e?.error?.error ?? 'Cannot delete')
    });
  }
}
