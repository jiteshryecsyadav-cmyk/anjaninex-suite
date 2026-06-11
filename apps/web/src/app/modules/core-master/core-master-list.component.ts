import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { BackButtonComponent } from '../../shared/back-button.component';
import { ToastService } from '../../shared/toast.service';

interface CoreContact {
  id: string;
  displayName: string;
  phone: string | null;
  gst: string | null;
  city: string | null;
  isParty: boolean;
  isSupplier: boolean;
  isStaff: boolean;
}

@Component({
  selector: 'app-core-master-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BackButtonComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🗂️ Core Master</h2>
          <p class="text-sm text-[#6b3fa0]">
            {{ counts().contacts }} contacts · 🚚 {{ counts().suppliers }} suppliers · 🛒 {{ counts().buyers }} buyers · ↔️ {{ counts().both }} both · 👨‍💼 {{ counts().staff }} staff.
            Common data yahan badloge to sab jagah update hoga.
          </p>
        </div>
        <a routerLink="/core-master/new" class="btn-primary no-underline">+ Add Contact</a>
      </div>

      <!-- COUNT CARDS -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div class="rounded-xl bg-white border border-[#eee] p-3 text-center" style="border-left:4px solid #1B2E5C;background:#1B2E5C0d">
          <div class="text-2xl">🗂️</div>
          <div class="text-2xl font-black text-[#5c1a8b]" style="color:#1B2E5C">{{ counts().contacts }}</div>
          <div class="text-[11px] text-gray-500 uppercase font-semibold">Contacts</div>
        </div>
        <div class="rounded-xl bg-white border border-[#eee] p-3 text-center" style="border-left:4px solid #0284c7;background:#0ea5e90d">
          <div class="text-2xl">🚚</div>
          <div class="text-2xl font-black text-[#5c1a8b]" style="color:#0284c7">{{ counts().suppliers }}</div>
          <div class="text-[11px] text-gray-500 uppercase font-semibold">Suppliers</div>
        </div>
        <div class="rounded-xl bg-white border border-[#eee] p-3 text-center" style="border-left:4px solid #16a34a;background:#16a34a0d">
          <div class="text-2xl">🛒</div>
          <div class="text-2xl font-black text-[#5c1a8b]" style="color:#16a34a">{{ counts().buyers }}</div>
          <div class="text-[11px] text-gray-500 uppercase font-semibold">Buyers</div>
        </div>
        <div class="rounded-xl bg-white border border-[#eee] p-3 text-center" style="border-left:4px solid #9333ea;background:#9333ea0d">
          <div class="text-2xl">↔️</div>
          <div class="text-2xl font-black text-[#5c1a8b]" style="color:#9333ea">{{ counts().both }}</div>
          <div class="text-[11px] text-gray-500 uppercase font-semibold">Both</div>
        </div>
        <div class="rounded-xl bg-white border border-[#eee] p-3 text-center" style="border-left:4px solid #d97706;background:#d977060d">
          <div class="text-2xl">👨‍💼</div>
          <div class="text-2xl font-black text-[#5c1a8b]" style="color:#d97706">{{ counts().staff }}</div>
          <div class="text-[11px] text-gray-500 uppercase font-semibold">Staff</div>
        </div>
      </div>

      <input [(ngModel)]="search" (input)="load()" type="text"
             placeholder="🔍 Naam / phone / GST se dhundo..." class="input w-full mb-4">

      @if (loading()) {
        <div class="card text-center text-gray-500 py-8">Loading…</div>
      } @else if (contacts().length === 0) {
        <div class="card text-center text-gray-500 py-8">Koi contact nahi mila.</div>
      } @else {
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-[#1B2E5C] text-white uppercase text-xs">
              <tr>
                <th class="px-3 py-3 text-left">Name</th>
                <th class="px-3 py-3 text-left">Phone</th>
                <th class="px-3 py-3 text-left">GST</th>
                <th class="px-3 py-3 text-left">City</th>
                <th class="px-3 py-3 text-left">Used in</th>
                <th class="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              @for (c of contacts(); track c.id) {
                <tr class="border-t hover:bg-[#FAF7F0]">
                  <td class="px-3 py-3 font-semibold">{{ c.displayName }}</td>
                  <td class="px-3 py-3">{{ c.phone || '—' }}</td>
                  <td class="px-3 py-3 font-mono text-xs">{{ c.gst || '—' }}</td>
                  <td class="px-3 py-3">{{ c.city || '—' }}</td>
                  <td class="px-3 py-3">
                    <div class="flex gap-1 flex-wrap">
                      @if (c.isParty)    { <span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">Trading</span> }
                      @if (c.isSupplier) { <span class="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">AD</span> }
                      @if (c.isStaff)    { <span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">HR</span> }
                      @if (!c.isParty && !c.isSupplier && !c.isStaff) { <span class="text-[10px] text-gray-400">—</span> }
                    </div>
                  </td>
                  <td class="px-3 py-3 text-right whitespace-nowrap">
                    <a [routerLink]="['/core-master', c.id]" class="text-[#5c1a8b] underline text-xs mr-3">✏️ Edit</a>
                    <button (click)="remove(c)" class="text-red-600 underline text-xs">🗑️ Delete</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `
})
export class CoreMasterListComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/core/contacts`;

  contacts = signal<CoreContact[]>([]);
  loading = signal(true);
  search = '';
  counts = signal<{ suppliers: number; buyers: number; both: number; staff: number; contacts: number }>({ suppliers: 0, buyers: 0, both: 0, staff: 0, contacts: 0 });
  private toast = inject(ToastService);

  ngOnInit() { this.load(); this.loadCounts(); }

  load() {
    this.loading.set(true);
    const params: any = {};
    if (this.search) params.search = this.search;
    this.http.get<CoreContact[]>(this.base, { params }).subscribe({
      next: (c) => { this.contacts.set(c); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  loadCounts() {
    this.http.get<{ suppliers: number; buyers: number; both: number; staff: number; contacts: number }>(`${this.base}/counts`).subscribe({
      next: (c) => this.counts.set(c),
      error: () => {}
    });
  }

  remove(c: CoreContact) {
    if (!confirm(`Delete "${c.displayName}" from Core Master?`)) return;
    this.http.delete(`${this.base}/${c.id}`).subscribe({
      next: () => {
        this.toast.success('Contact delete ho gaya.');
        this.contacts.update(list => list.filter(x => x.id !== c.id));
        this.loadCounts();
      },
      error: (e) => this.toast.error(e?.error?.error ?? 'Delete nahi hua')
    });
  }
}
