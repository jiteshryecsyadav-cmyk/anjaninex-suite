import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdSearchService, SearchResult } from '../services/ad-search.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-ad-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BackButtonComponent],
  template: `
    <div class="max-w-5xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="mb-4">
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🔍 Search</h2>
        <p class="text-sm text-[#6b3fa0]">Supplier aur Buyer — ek hi jagah dhundho</p>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/suppliers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🚚 Suppliers</a>
        <a routerLink="/suppliers/buyers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🛒 Buyers</a>
        <a routerLink="/suppliers/appointments" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📅 Appointments</a>
        <a routerLink="/suppliers/match" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🎯 Match</a>
        <a routerLink="/suppliers/search" class="px-4 py-2 text-sm font-semibold text-[#5c1a8b] border-b-2 border-[#5c1a8b]">🔍 Search</a>
      </div>

      <div class="card flex gap-3 mb-4">
        <input [(ngModel)]="q" (keyup.enter)="run()" type="text"
               placeholder="🔍 Naam / phone / GST se dhundo..." class="input flex-1">
        <select [(ngModel)]="type" class="input w-40">
          <option value="">All</option>
          <option value="supplier">Suppliers</option>
          <option value="buyer">Buyers</option>
        </select>
        <button (click)="run()" [disabled]="loading()" class="btn-primary">
          {{ loading() ? '…' : 'Search' }}
        </button>
      </div>

      @if (searched()) {
        @if (results().length === 0) {
          <div class="card text-center text-gray-500 py-8">Kuch nahi mila.</div>
        } @else {
          <div class="card p-0 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-[#1B2E5C] text-white uppercase text-xs">
                <tr>
                  <th class="px-3 py-3 text-left">Type</th>
                  <th class="px-3 py-3 text-left">Name</th>
                  <th class="px-3 py-3 text-left">Phone</th>
                  <th class="px-3 py-3 text-left">GST</th>
                  <th class="px-3 py-3 text-left">City</th>
                  <th class="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                @for (r of results(); track r.type + r.id) {
                  <tr class="border-t hover:bg-[#FAF7F0]">
                    <td class="px-3 py-3">
                      <span class="text-xs px-2 py-0.5 rounded-full font-bold"
                            [class.bg-green-100]="r.type==='supplier'" [class.text-green-700]="r.type==='supplier'"
                            [class.bg-purple-100]="r.type==='buyer'" [class.text-purple-700]="r.type==='buyer'">
                        {{ r.type }}
                      </span>
                    </td>
                    <td class="px-3 py-3 font-semibold">{{ r.displayName }}</td>
                    <td class="px-3 py-3">{{ r.phone || '—' }}</td>
                    <td class="px-3 py-3 font-mono text-xs">{{ r.gst || '—' }}</td>
                    <td class="px-3 py-3">{{ r.city || '—' }}</td>
                    <td class="px-3 py-3 text-right">
                      @if (r.type === 'supplier') {
                        <a [routerLink]="['/suppliers', r.id]" class="text-[#5c1a8b] underline text-xs">View</a>
                      } @else {
                        <a [routerLink]="['/suppliers/buyers', r.id]" class="text-[#5c1a8b] underline text-xs">View</a>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>
  `
})
export class AdSearchComponent {
  private svc = inject(AdSearchService);

  q = '';
  type = '';
  results = signal<SearchResult[]>([]);
  loading = signal(false);
  searched = signal(false);

  run() {
    if (!this.q.trim()) return;
    this.loading.set(true);
    this.svc.search(this.q.trim(), this.type || undefined).subscribe({
      next: (r) => { this.results.set(r); this.searched.set(true); this.loading.set(false); },
      error: () => { this.results.set([]); this.searched.set(true); this.loading.set(false); }
    });
  }
}
