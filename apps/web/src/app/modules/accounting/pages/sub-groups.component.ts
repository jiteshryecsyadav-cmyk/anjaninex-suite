import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AccountingService, SubGroup, AccountGroup } from '../services/accounting.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-sub-groups',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive, BackButtonComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📁 Sub Groups</h2>
          <p class="text-sm text-[#6b3fa0]">Third-level groups (e.g., Bank Accounts under Current Assets)</p>
        </div>
        <button (click)="showForm.set(true)" class="btn-primary">+ New Sub Group</button>
      </div>

      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5]">
        <a routerLink="/accounting/heads" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Heads</a>
        <a routerLink="/accounting/groups" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Groups</a>
        <a routerLink="/accounting/sub-groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Sub Groups</a>
        <a routerLink="/accounting/ledgers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Ledgers</a>
        <a routerLink="/accounting/vouchers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Vouchers</a>
        <a routerLink="/accounting/trial-balance" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Trial Balance</a>
        <a routerLink="/accounting/profit-loss" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">P&amp;L</a>
        <a routerLink="/accounting/balance-sheet" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Balance Sheet</a>
      </div>

      <div class="card p-0 overflow-hidden">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-4 py-3 text-left">S.NO</th>
                <th class="px-4 py-3 text-left">Sub Group</th>
                <th class="px-4 py-3 text-left">Parent Group</th>
                <th class="px-4 py-3 text-left">Head</th>
                <th class="px-4 py-3 text-right">Ledgers</th>
                <th class="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (s of subs(); track s.id; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-4 py-2 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-4 py-2 font-semibold">{{ s.name }}</td>
                  <td class="px-4 py-2">{{ s.groupName }}</td>
                  <td class="px-4 py-2 text-xs text-gray-500">{{ s.headName }}</td>
                  <td class="px-4 py-2 text-right">{{ s.ledgerCount }}</td>
                  <td class="px-4 py-2 text-center">
                    @if (!s.isSystem) {
                      <button (click)="edit(s)" class="text-[#5c1a8b] text-xs hover:underline mr-2">✏️ Edit</button>
                      <button (click)="del(s.id)" class="text-red-600 text-xs hover:underline">Delete</button>
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
            <h3 class="font-display font-bold text-lg text-[#5c1a8b] mb-4">{{ editingId() ? 'Edit Sub Group' : 'New Sub Group' }}</h3>
            <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-3">
              <label class="text-xs font-bold text-[#6b3fa0] uppercase">Parent Group *</label>
              <select formControlName="groupId" class="input">
                <option value="">Select group...</option>
                @for (g of groups(); track g.id) {
                  <option [value]="g.id">{{ g.headName }} → {{ g.name }}</option>
                }
              </select>
              <label class="text-xs font-bold text-[#6b3fa0] uppercase">Sub Group Name *</label>
              <input formControlName="name" class="input" placeholder="e.g., Digital Marketing">
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
export class SubGroupsComponent {
  private svc = inject(AccountingService);
  private fb = inject(FormBuilder);

  subs = signal<SubGroup[]>([]);
  groups = signal<AccountGroup[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editingId = signal<string | null>(null);
  error = signal('');

  form = this.fb.nonNullable.group({
    groupId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(2)]]
  });

  ngOnInit() {
    this.svc.listGroups().subscribe(g => this.groups.set(g));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.listSubGroups().subscribe({
      next: (s) => { this.subs.set(s); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  edit(s: SubGroup) {
    if (s.isSystem) return;   // system sub-groups locked
    this.editingId.set(s.id);
    this.form.patchValue({ groupId: s.groupId, name: s.name });
    this.showForm.set(true);
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');
    const v = this.form.getRawValue();
    const obs = this.editingId()
      ? this.svc.updateSubGroup(this.editingId()!, { groupId: v.groupId, name: v.name })
      : this.svc.createSubGroup(v);
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
    this.form.reset({ groupId: '', name: '' });
    this.saving.set(false);
    this.error.set('');
  }

  del(id: string) {
    if (!confirm('Delete this sub group?')) return;
    this.svc.deleteSubGroup(id).subscribe({
      next: () => this.load(),
      error: (e) => alert(e?.error?.error ?? 'Cannot delete')
    });
  }
}
