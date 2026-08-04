import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppointmentsService, AppointmentListItem } from '../services/appointments.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';
import { InDatePipe } from '../../../shared/in-date.pipe';

@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BackButtonComponent, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📅 Appointments</h2>
          <p class="text-sm text-[#6b3fa0]">{{ appts().length }} appointments</p>
        </div>
        <a routerLink="/suppliers/appointments/new" class="btn-primary no-underline">+ New Appointment</a>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/suppliers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🚚 Suppliers</a>
        <a routerLink="/suppliers/buyers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🛒 Buyers</a>
        <a routerLink="/suppliers/appointments" class="px-4 py-2 text-sm font-semibold text-[#5c1a8b] border-b-2 border-[#5c1a8b]">📅 Appointments</a>
        <a routerLink="/suppliers/categories" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📂 Categories</a>
      </div>

      <div class="flex gap-2 mb-4 flex-wrap">
        @for (s of statuses; track s) {
          <button (click)="filterStatus = (filterStatus === s ? '' : s); load()"
                  [class]="filterStatus === s
                    ? 'px-3 py-1 rounded-full text-xs font-bold bg-[#5c1a8b] text-white'
                    : 'px-3 py-1 rounded-full text-xs font-semibold bg-white border border-[#ddc8f5] text-[#5c1a8b]'">
            {{ s }}
          </button>
        }
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-500 py-8">Loading…</div>
      } @else if (appts().length === 0) {
        <div class="card text-center text-gray-500 py-8">
          Koi appointment nahi. <a routerLink="/suppliers/appointments/new" class="text-[#5c1a8b] underline">Pehla book karein</a>
        </div>
      } @else {
        <div class="card p-0 overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-anjaninex-navy text-white uppercase text-xs">
              <tr>
                <th class="px-3 py-3 text-left">S.NO</th>
                <th class="px-3 py-3 text-left">Date / Time</th>
                <th class="px-3 py-3 text-left">Direction</th>
                <th class="px-3 py-3 text-left">Supplier</th>
                <th class="px-3 py-3 text-left">Buyer</th>
                <th class="px-3 py-3 text-left">Branch</th>
                <th class="px-3 py-3 text-left">Staff</th>
                <th class="px-3 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (a of appts(); track a.id; let i = $index) {
                <tr class="border-t hover:bg-[#FAF7F0] cursor-pointer" [routerLink]="['/suppliers/appointments', a.id]">
                  <td class="px-3 py-3 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-3 py-3">{{ a.appointmentDate | inDate }}<br><span class="text-xs text-gray-500">{{ a.appointmentTime || '' }}</span></td>
                  <td class="px-3 py-3 text-xs">{{ dirLabel(a.visitDirection) }}</td>
                  <td class="px-3 py-3">{{ a.supplierName || '—' }}</td>
                  <td class="px-3 py-3">{{ a.buyerName || '—' }}</td>
                  <td class="px-3 py-3 text-xs">{{ a.branchName || '—' }}</td>
                  <td class="px-3 py-3 text-xs">{{ a.staffNames.join(', ') || '—' }}</td>
                  <td class="px-3 py-3 text-center">
                    <span class="text-xs px-2 py-0.5 rounded uppercase font-bold"
                          [class.bg-gray-100]="a.status==='draft'" [class.text-gray-600]="a.status==='draft'"
                          [class.bg-blue-100]="a.status==='confirmed'" [class.text-blue-700]="a.status==='confirmed'"
                          [class.bg-green-100]="a.status==='completed'" [class.text-green-700]="a.status==='completed'"
                          [class.bg-red-100]="a.status==='cancelled'" [class.text-red-700]="a.status==='cancelled'">
                      {{ a.status }}
                    </span>
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
export class AppointmentsComponent {
  private svc = inject(AppointmentsService);
  private toast = inject(ToastService);

  appts = signal<AppointmentListItem[]>([]);
  loading = signal(true);
  filterStatus = '';
  statuses = ['draft', 'confirmed', 'completed', 'cancelled'];

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.list(this.filterStatus || undefined).subscribe({
      next: (a) => { this.appts.set(a); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  dirLabel(d: string): string {
    return d === 's2b' ? 'Supplier → Buyer'
         : d === 'b2s' ? 'Buyer → Supplier'
         : d === 'neutral' ? 'Neutral'
         : d === 'online' ? 'Online' : d;
  }
}
