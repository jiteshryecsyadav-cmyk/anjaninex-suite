import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SuppliersService, SupplierCategory } from '../services/suppliers.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';

@Component({
  selector: 'app-supplier-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, BackButtonComponent],
  template: `
    <div class="max-w-4xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📂 Supplier Categories</h2>
          <p class="text-sm text-[#6b3fa0]">Fabric / textile / product categories</p>
        </div>
      </div>

      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/suppliers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           [routerLinkActiveOptions]="{exact:true}"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🚚 Suppliers</a>
        <a routerLink="/suppliers/buyers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🛒 Buyers</a>
        <a routerLink="/suppliers/appointments" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📅 Appointments</a>
        <a routerLink="/suppliers/match" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🎯 Match</a>
        <a routerLink="/suppliers/search" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🔍 Search</a>
        <a routerLink="/suppliers/categories" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📂 Categories</a>
      </div>

      <!-- Add new -->
      <div class="card mb-4">
        <div class="flex gap-2">
          <input [(ngModel)]="newName" (keyup.enter)="add()" type="text"
                 placeholder="New category name (e.g., Designer Lehenga)" class="input flex-1">
          <button (click)="add()" class="btn-primary" [disabled]="!newName.trim() || saving()">
            {{ saving() ? 'Adding…' : '+ Add' }}
          </button>
        </div>
      </div>

      <!-- Grid of categories -->
      <div class="grid grid-cols-3 gap-3">
        @for (c of categories(); track c.id) {
          <div class="card flex items-center justify-between">
            <div>
              <div class="font-semibold">{{ c.name }}</div>
              <div class="text-xs text-gray-500">{{ c.supplierCount }} supplier{{ c.supplierCount === 1 ? '' : 's' }}</div>
            </div>
            @if (!c.isSystem) {
              <button (click)="del(c.id)" class="text-red-500 text-xs hover:underline">Delete</button>
            } @else {
              <span class="text-xs text-gray-400">System</span>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class SupplierCategoriesComponent {
  private svc = inject(SuppliersService);
  private toast = inject(ToastService);
  categories = signal<SupplierCategory[]>([]);
  newName = '';
  saving = signal(false);

  ngOnInit() { this.load(); }

  load() {
    this.svc.listCategories().subscribe(c => this.categories.set(c));
  }

  add() {
    if (!this.newName.trim()) return;
    this.saving.set(true);
    this.svc.createCategory(this.newName.trim()).subscribe({
      next: () => { this.toast.success('Category successfully add ho gaya!'); this.newName = ''; this.saving.set(false); this.load(); },
      error: () => this.saving.set(false)
    });
  }

  del(id: string) {
    if (!confirm('Delete this category?')) return;
    this.svc.deleteCategory(id).subscribe({
      next: () => this.load(),
      error: (e) => alert(e?.error?.error ?? 'Cannot delete')
    });
  }
}
