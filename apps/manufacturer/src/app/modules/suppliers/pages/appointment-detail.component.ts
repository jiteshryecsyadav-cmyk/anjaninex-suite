import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppointmentsService, AppointmentDetail } from '../services/appointments.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';

@Component({
  selector: 'app-appointment-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, BackButtonComponent],
  template: `
    <div class="max-w-3xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      @if (loading()) {
        <div class="card text-center text-gray-500 py-8">Loading…</div>
      } @else if (!a()) {
        <div class="card text-center text-gray-500 py-8">Appointment nahi mila.</div>
      } @else {
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-display font-black text-2xl text-[#5c1a8b]">{{ dirLabel(a()!.visitDirection) }}</h2>
            <p class="text-sm text-[#6b3fa0]">{{ a()!.appointmentDate }} {{ a()!.appointmentTime || '' }}</p>
          </div>
          <a [routerLink]="['/suppliers/appointments', a()!.id, 'edit']" class="btn-primary no-underline">✏️ Edit</a>
        </div>

        <div class="card grid grid-cols-2 gap-4 text-sm">
          <div><div class="lbl">Supplier</div><div>{{ a()!.supplierName || '—' }}</div></div>
          <div><div class="lbl">Buyer</div><div>{{ a()!.buyerName || '—' }}</div></div>
          <div><div class="lbl">Branch</div><div>{{ a()!.branchName || '—' }}</div></div>
          <div><div class="lbl">City</div><div>{{ a()!.city || '—' }}</div></div>
          <div class="col-span-2"><div class="lbl">Address</div><div>{{ a()!.address || '—' }}</div></div>
          <div class="col-span-2"><div class="lbl">Staff Assigned</div>
            <div class="flex gap-2 flex-wrap mt-1">
              @for (s of a()!.staff; track s.employeeId) {
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold"
                      [class.bg-amber-100]="s.isLead" [class.text-amber-700]="s.isLead"
                      [class.bg-gray-100]="!s.isLead" [class.text-gray-700]="!s.isLead">
                  {{ s.name }}{{ s.isLead ? ' (Lead)' : '' }}
                </span>
              }
              @if (a()!.staff.length === 0) { <span class="text-gray-400">— koi staff nahi —</span> }
            </div>
          </div>
          <div class="col-span-2"><div class="lbl">Agenda</div><div>{{ a()!.agenda || '—' }}</div></div>
          <div><div class="lbl">Status</div><div class="uppercase font-bold">{{ a()!.status }}</div></div>
        </div>

        <div class="flex gap-2 mt-4">
          @for (s of ['confirmed','completed','cancelled']; track s) {
            <button (click)="setStatus(s)" class="px-3 py-1 rounded-full text-xs font-semibold bg-white border border-[#ddc8f5] text-[#5c1a8b] hover:bg-[#f0e6ff]">
              Mark {{ s }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`.lbl{ font-size:10px; font-weight:800; color:#6b3fa0; text-transform:uppercase; letter-spacing:.5px; margin-bottom:2px; }`]
})
export class AppointmentDetailComponent {
  private svc = inject(AppointmentsService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  a = signal<AppointmentDetail | null>(null);
  loading = signal(true);

  ngOnInit() { this.reload(); }

  reload() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.loading.set(false); return; }
    this.svc.get(id).subscribe({
      next: (x) => { this.a.set(x); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  setStatus(s: string) {
    const cur = this.a();
    if (!cur) return;
    this.svc.updateStatus(cur.id, s).subscribe({
      next: () => { this.toast.success('Status update ho gaya: ' + s); this.reload(); },
      error: (e) => this.toast.error(e?.error?.error ?? 'Update nahi hua')
    });
  }

  dirLabel(d: string): string {
    return d === 's2b' ? 'Supplier → Buyer' : d === 'b2s' ? 'Buyer → Supplier'
         : d === 'neutral' ? 'Neutral Meeting' : d === 'online' ? 'Online Meeting' : d;
  }
}
