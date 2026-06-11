import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive, ActivatedRoute } from '@angular/router';
import { TradingSubNavComponent } from '../components/trading-sub-nav.component';
import { TradingService, Item } from '../services/trading.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive, DecimalPipe, TradingSubNavComponent, BackButtonComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Descriptions</h2>
          <p class="text-sm text-[#6b3fa0]">Item descriptions — Order & Bill entry me dropdown me aate hain</p>
        </div>
        <button (click)="openNew()" class="btn-primary">+ New Description</button>
      </div>

      <app-trading-sub-nav></app-trading-sub-nav>

            <div class="card p-0 overflow-hidden">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
        @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr><th class="px-3 py-2 text-left">Code</th><th class="px-3 py-2 text-left">Description</th><th class="px-3 py-2 text-left">HSN</th><th class="px-3 py-2 text-center">Unit</th><th class="px-3 py-2 text-center">Actions</th></tr>
            </thead>
            <tbody>
              @for (i of items(); track i.id) {
                <tr class="border-t">
                  <td class="px-3 py-2">{{i.code}}</td>
                  <td class="px-3 py-2 font-semibold">{{i.name}}</td>
                  <td class="px-3 py-2">{{i.hsnSac}}</td>
                  <td class="px-3 py-2 text-center">{{i.unit}}</td>
                  <td class="px-3 py-2 text-center whitespace-nowrap">
                    <button (click)="openEdit(i)" title="Edit" class="px-2 py-1 rounded hover:bg-purple-50">✏️</button>
                    <button (click)="del(i)" title="Delete" class="px-2 py-1 rounded hover:bg-red-50">🗑️</button>
                  </td>
                </tr>
              }
              @if (items().length === 0) {
                <tr><td colspan="5" class="px-3 py-6 text-center text-gray-400">Koi description nahi. "+ New Description" se banao.</td></tr>
              }
            </tbody>
          </table>
        }
      </div>

      @if (showForm()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="closeForm()">
          <div class="bg-white rounded-2xl p-6 w-full max-w-lg" (click)="$event.stopPropagation()">
            <h3 class="font-display font-bold text-lg text-[#5c1a8b] mb-4">{{ editId() ? 'Edit Description' : 'New Description' }}</h3>
            <form [formGroup]="form" (ngSubmit)="save()" class="grid grid-cols-2 gap-3">
              <div class="col-span-2"><label class="text-xs font-bold uppercase">Description *</label><input formControlName="name" class="input" placeholder="e.g. Saree, Fabric, Suit Material"></div>
              <div><label class="text-xs font-bold uppercase">HSN / SAC Code</label><input formControlName="hsnSac" class="input" placeholder="e.g. 5208"></div>
              <div><label class="text-xs font-bold uppercase">Unit</label><select formControlName="unit" class="input"><option>PCS</option><option>MTR</option><option>KG</option></select></div>
              <div class="col-span-2 flex justify-end gap-2">
                <button type="button" (click)="closeForm()" class="px-4 py-2 border rounded">Cancel</button>
                <button type="submit" class="btn-primary" [disabled]="form.invalid || saving()">{{ saving() ? 'Saving...' : 'Create' }}</button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `
})
export class ItemsComponent {
  private svc = inject(TradingService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);

  items = signal<Item[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  editId = signal<string | null>(null);

  form = this.fb.group({
    code: [''],
    name: ['', Validators.required],
    hsnSac: [''],
    unit: ['PCS'],
    category: [''],
    defaultRate: [0],
    taxRate: [5]
  });

  ngOnInit() {
    this.load();
    // Auto-open New Item modal when ?new=1 query param present (from sub-nav dropdown)
    this.route.queryParams.subscribe(qp => {
      if (qp['new']) this.openNew();
    });
  }

  load() {
    this.loading.set(true);
    this.svc.listItems().subscribe({
      next: (items) => { this.items.set(items); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  openNew() {
    this.editId.set(null);
    this.form.reset({ unit: 'PCS', defaultRate: 0, taxRate: 5 });
    this.showForm.set(true);
  }

  openEdit(i: Item) {
    this.editId.set(i.id);
    this.form.reset({
      code: i.code ?? '', name: i.name, hsnSac: i.hsnSac ?? '',
      unit: i.unit ?? 'PCS', category: (i as any).category ?? '',
      defaultRate: (i as any).defaultRate ?? 0, taxRate: (i as any).taxRate ?? 5
    });
    this.showForm.set(true);
  }

  del(i: Item) {
    if (!confirm(`"${i.name}" delete karein?`)) return;
    this.svc.deleteItem(i.id).subscribe({
      next: () => this.load(),
      error: (e: any) => alert('Delete nahi hua: ' + (e?.error?.error ?? e?.message ?? 'error'))
    });
  }

  closeForm() {
    this.showForm.set(false);
    this.editId.set(null);
    this.form.reset({ unit: 'PCS', defaultRate: 0, taxRate: 5 });
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.svc.updateItem(id, this.form.value)
      : this.svc.createItem(this.form.value);
    req.subscribe({
      next: () => { this.saving.set(false); this.closeForm(); this.load(); },
      error: (e: any) => { this.saving.set(false); alert('Item save nahi hua: ' + (e?.error?.error ?? e?.message ?? 'error')); }
    });
  }
}