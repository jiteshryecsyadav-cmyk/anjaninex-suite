import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AccountingService, Ledger, SubGroup } from '../services/accounting.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { LedgerStatementComponent } from '../components/ledger-statement.component';

@Component({
  selector: 'app-ledgers',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent, LedgerStatementComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b] flex items-center gap-2">
            📒 Ledger Master
          </h2>
          <p class="text-sm text-[#6b3fa0]">
            Individual accounts where transactions are recorded
          </p>
        </div>
        <button (click)="showForm.set(true)" class="btn-primary">
          + New Ledger
        </button>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5]">
        <a routerLink="/accounting/heads" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Heads</a>
        <a routerLink="/accounting/groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Groups</a>
        <a routerLink="/accounting/sub-groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Sub Groups</a>
        <a routerLink="/accounting/ledgers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Ledgers</a>
        <a routerLink="/accounting/vouchers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Vouchers</a>
        <a routerLink="/accounting/trial-balance" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Trial Balance</a>
        <a routerLink="/accounting/profit-loss" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">P&amp;L</a>
        <a routerLink="/accounting/balance-sheet" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Balance Sheet</a>
      </div>

      <!-- Search + filter -->
      <div class="flex gap-3 mb-4">
        <input [(ngModel)]="searchQuery" (input)="onSearch()"
               type="text" placeholder="🔍 Search ledger by name..." class="input flex-1">
        <select [(ngModel)]="selectedSubGroup" (ngModelChange)="loadLedgers()" class="input w-64">
          <option value="">All Sub Groups</option>
          @for (sg of subGroups(); track sg.id) {
            <option [value]="sg.id">{{ sg.groupName }} → {{ sg.name }}</option>
          }
        </select>
      </div>

      <!-- Ledger list -->
      <div class="card p-0 overflow-hidden">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (ledgers().length === 0) {
          <div class="p-8 text-center text-gray-500">
            No ledgers found. <button (click)="showForm.set(true)" class="text-[#5c1a8b] underline">Add first ledger</button>
          </div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-4 py-3 text-left">S.NO</th>
                <th class="px-4 py-3 text-left">Name</th>
                <th class="px-4 py-3 text-left">Sub Group → Group → Head</th>
                <th class="px-4 py-3 text-left">Linked Contact</th>
                <th class="px-4 py-3 text-right">Opening</th>
                <th class="px-4 py-3 text-right">Current Balance</th>
                <th class="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (l of ledgers(); track l.id; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-4 py-2 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-4 py-2 font-semibold">{{ l.name }}</td>
                  <td class="px-4 py-2 text-xs text-gray-600">
                    {{ l.subGroupName }} <span class="text-gray-400">→</span>
                    {{ l.groupName }} <span class="text-gray-400">→</span>
                    {{ l.headName }}
                  </td>
                  <td class="px-4 py-2 text-xs">
                    @if (l.contactName) {
                      <span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                        🔗 {{ l.contactName }}
                      </span>
                    } @else {
                      <span class="text-gray-400">—</span>
                    }
                  </td>
                  <td class="px-4 py-2 text-right font-mono">
                    ₹{{ l.openingBalance | number:'1.2-2' }}
                    <span class="text-xs text-gray-400">{{ l.openingType }}</span>
                  </td>
                  <td class="px-4 py-2 text-right font-mono font-bold"
                      [class.text-green-600]="l.currentBalanceType === 'Dr'"
                      [class.text-red-600]="l.currentBalanceType === 'Cr'">
                    ₹{{ l.currentBalance | number:'1.2-2' }}
                    <span class="text-xs">{{ l.currentBalanceType }}</span>
                  </td>
                  <td class="px-4 py-2 text-center">
                    <button class="text-blue-600 text-xs hover:underline mr-2"
                            (click)="viewStatement(l)">📒 Statement</button>
                    <button class="text-[#5c1a8b] text-xs hover:underline mr-2"
                            (click)="edit(l)">Edit</button>
                    <button class="text-red-600 text-xs hover:underline"
                            (click)="del(l.id)">Delete</button>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot class="bg-gray-50 font-bold">
              <tr>
                <td colspan="5" class="px-4 py-2 text-right">Totals:</td>
                <td class="px-4 py-2 text-right font-mono">
                  Dr: ₹{{ totalDr() | number:'1.2-2' }} ·
                  Cr: ₹{{ totalCr() | number:'1.2-2' }}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        }
      </div>

      <!-- Form modal -->
      @if (showForm()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
             (click)="closeForm()">
          <div class="bg-white rounded-2xl p-6 w-full max-w-lg" (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-bold text-lg text-[#5c1a8b]">
                {{ editingId() ? 'Edit Ledger' : 'New Ledger' }}
              </h3>
              <button (click)="closeForm()" class="text-2xl text-gray-400">×</button>
            </div>
            <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-3">

              <label class="text-xs font-bold text-[#6b3fa0] uppercase">Ledger Name *</label>
              <input formControlName="name" class="input" placeholder="e.g., HDFC Bank — 5678">

              <label class="text-xs font-bold text-[#6b3fa0] uppercase">Code</label>
              <input formControlName="code" class="input" placeholder="e.g., 1001 (optional)">

              <label class="text-xs font-bold text-[#6b3fa0] uppercase">Sub Group *</label>
              <select formControlName="subGroupId" class="input">
                <option value="">Select sub group...</option>
                @for (sg of subGroups(); track sg.id) {
                  <option [value]="sg.id">{{ sg.headName }} → {{ sg.groupName }} → {{ sg.name }}</option>
                }
              </select>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs font-bold text-[#6b3fa0] uppercase">Opening Balance</label>
                  <input formControlName="openingBalance" type="number" class="input" step="0.01">
                </div>
                <div>
                  <label class="text-xs font-bold text-[#6b3fa0] uppercase">Type</label>
                  <select formControlName="openingType" class="input">
                    <option value="Dr">Dr (Debit)</option>
                    <option value="Cr">Cr (Credit)</option>
                  </select>
                </div>
              </div>

              <label class="flex items-center gap-2 text-sm font-semibold text-[#6b3fa0] cursor-pointer select-none">
                <input formControlName="isActive" type="checkbox" class="w-4 h-4">
                Active (uncheck to deactivate / soft-delete; check to reactivate)
              </label>

              @if (error()) {
                <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  {{ error() }}
                </div>
              }

              <div class="flex justify-end gap-2 mt-2">
                <button type="button" (click)="closeForm()"
                        class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
                <button type="submit" class="btn-primary" [disabled]="form.invalid || saving()">
                  {{ saving() ? 'Saving…' : (editingId() ? 'Update' : 'Create') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Ledger Statement / Khata modal -->
      @if (statementLedgerId()) {
        <app-ledger-statement
          [ledgerId]="statementLedgerId()!"
          [initialName]="statementLedgerName()"
          (close)="statementLedgerId.set(null)">
        </app-ledger-statement>
      }
    </div>
  `
})
export class LedgersComponent {
  private svc = inject(AccountingService);
  private fb = inject(FormBuilder);

  ledgers = signal<Ledger[]>([]);
  subGroups = signal<SubGroup[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  editingId = signal<string | null>(null);
  error = signal('');
  searchQuery = '';
  selectedSubGroup = '';

  // Ledger statement / khata modal
  statementLedgerId = signal<string | null>(null);
  statementLedgerName = signal<string | null>(null);

  totalDr = computed(() => this.ledgers().filter(l => l.currentBalanceType === 'Dr').reduce((s, l) => s + l.currentBalance, 0));
  totalCr = computed(() => this.ledgers().filter(l => l.currentBalanceType === 'Cr').reduce((s, l) => s + l.currentBalance, 0));

  form = this.fb.nonNullable.group({
    subGroupId: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(2)]],
    code: [''],                          // C3 — existing Code field ab editable
    contactId: [''],                     // C1 — party link carry-through (hidden), warna edit par unlink ho jaata tha
    openingBalance: [0],
    openingType: ['Dr'],
    isActive: [true]                     // C2 — inactive (soft-deleted) ledger ko wapas active kar sakein
  });

  ngOnInit() {
    this.loadSubGroups();
    this.loadLedgers();
  }

  loadSubGroups() {
    this.svc.listSubGroups().subscribe(sgs => this.subGroups.set(sgs));
  }

  loadLedgers() {
    this.loading.set(true);
    this.svc.listLedgers({
      subGroupId: this.selectedSubGroup || undefined,
      search: this.searchQuery || undefined
    }).subscribe({
      next: (l) => { this.ledgers.set(l); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  private searchTimer: any;
  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadLedgers(), 300);
  }

  edit(l: Ledger) {
    this.editingId.set(l.id);
    this.form.patchValue({
      subGroupId: l.subGroupId,
      name: l.name,
      code: l.code || '',
      contactId: l.contactId || '',   // existing party link carry karo — save par wipe na ho
      openingBalance: l.openingBalance,
      openingType: l.openingType,
      isActive: l.isActive
    });
    this.showForm.set(true);
  }

  async save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');

    const raw = this.form.getRawValue();
    // Empty strings ko undefined karo — backend me contactId Guid? hai (khaali "" bind fail karega).
    const data: any = {
      subGroupId: raw.subGroupId,
      name: raw.name,
      code: raw.code || undefined,
      contactId: raw.contactId || undefined,   // existing party link carry-through (C1)
      openingBalance: raw.openingBalance,
      openingType: raw.openingType,
      isActive: raw.isActive
    };
    const obs = this.editingId()
      ? this.svc.updateLedger(this.editingId()!, data)
      : this.svc.createLedger(data);

    obs.subscribe({
      next: () => {
        this.loadLedgers();
        this.closeForm();
      },
      error: (e) => {
        this.error.set(e?.error?.error ?? 'Failed to save');
        this.saving.set(false);
      }
    });
  }

  closeForm() {
    this.showForm.set(false);
    this.editingId.set(null);
    this.form.reset({ subGroupId: '', name: '', code: '', contactId: '', openingBalance: 0, openingType: 'Dr', isActive: true });
    this.saving.set(false);
    this.error.set('');
  }

  del(id: string) {
    if (!confirm('Delete this ledger? If it has transactions, it will be marked inactive.')) return;
    this.svc.deleteLedger(id).subscribe(() => this.loadLedgers());
  }

  viewStatement(l: Ledger) {
    this.statementLedgerName.set(l.name);
    this.statementLedgerId.set(l.id);
  }
}
