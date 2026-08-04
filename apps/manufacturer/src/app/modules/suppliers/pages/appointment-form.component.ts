import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AppointmentsService, ApptOption, ApptSample } from '../services/appointments.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';

interface BranchOpt { id: string; name: string; }

@Component({
  selector: 'app-appointment-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BackButtonComponent],
  template: `
    <div class="max-w-3xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="mb-4">
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">{{ editingId ? '✏️ Edit' : '+ New' }} Appointment</h2>
        <p class="text-sm text-[#6b3fa0]">Supplier ↔ Buyer meeting book karein</p>
      </div>

      <div class="card flex flex-col gap-4">
        <!-- Visit direction -->
        <div>
          <label class="lbl">Visit Direction *</label>
          <div class="grid grid-cols-2 gap-2">
            @for (d of directions; track d.v) {
              <button type="button" (click)="m.visitDirection = d.v"
                      [class]="m.visitDirection === d.v
                        ? 'border-2 border-[#5c1a8b] bg-[#f0e6ff] rounded-lg p-3 text-left'
                        : 'border border-gray-300 rounded-lg p-3 text-left hover:bg-gray-50'">
                <div class="font-bold text-sm text-[#5c1a8b]">{{ d.label }}</div>
                <div class="text-xs text-gray-500">{{ d.hint }}</div>
              </button>
            }
          </div>
        </div>

        <!-- Date / time / duration -->
        <div class="grid grid-cols-3 gap-3">
          <div><label class="lbl">Date *</label><input type="date" [(ngModel)]="m.appointmentDate" class="input"></div>
          <div><label class="lbl">Time</label><input type="time" [(ngModel)]="m.appointmentTime" class="input"></div>
          <div>
            <label class="lbl">Duration (min)</label>
            <select [(ngModel)]="m.durationMinutes" class="input">
              <option [ngValue]="30">30</option><option [ngValue]="60">60</option>
              <option [ngValue]="90">90</option><option [ngValue]="120">120</option>
            </select>
          </div>
        </div>

        <!-- Parties -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="lbl">Supplier</label>
            <select [(ngModel)]="m.supplierId" class="input">
              <option [ngValue]="null">— Select supplier —</option>
              @for (s of suppliers(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
            </select>
          </div>
          <div>
            <label class="lbl">Buyer</label>
            <select [(ngModel)]="m.buyerId" class="input">
              <option [ngValue]="null">— Select buyer —</option>
              @for (b of buyers(); track b.id) { <option [ngValue]="b.id">{{ b.name }}</option> }
            </select>
          </div>
        </div>

        <!-- Branch (drives staff filter) -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="lbl">Branch (meeting location) *</label>
            <select [(ngModel)]="m.branchId" (ngModelChange)="onBranchChange()" class="input">
              <option [ngValue]="null">— Select branch —</option>
              @for (br of branches(); track br.id) { <option [ngValue]="br.id">{{ br.name }}</option> }
            </select>
          </div>
          <div><label class="lbl">City</label><input [(ngModel)]="m.city" class="input"></div>
        </div>
        <div><label class="lbl">Address</label><input [(ngModel)]="m.address" class="input" placeholder="Shop / building / street"></div>

        @if (m.visitDirection === 'online') {
          <div><label class="lbl">Meeting Link</label><input [(ngModel)]="m.onlineLink" class="input" placeholder="Zoom / Meet / WA link"></div>
        }

        <!-- Staff (branch-filtered) -->
        <div>
          <label class="lbl">
            Staff Assigned
            @if (m.branchId) { <span class="text-green-600 normal-case">— sirf is branch ke staff</span> }
            @else { <span class="text-gray-400 normal-case">— branch chuno taaki us branch ke staff dikhe</span> }
          </label>
          @if (staff().length === 0) {
            <div class="text-sm text-gray-400 border border-gray-200 rounded-lg p-3">
              {{ m.branchId ? 'Is branch me koi active staff nahi.' : 'Pehle branch select karein.' }}
            </div>
          } @else {
            <div class="border border-[#ddc8f5] rounded-lg p-3 grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
              @for (st of staff(); track st.id) {
                <label class="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#f0e6ff] cursor-pointer text-sm">
                  <input type="checkbox" [checked]="selectedStaff().includes(st.id)" (change)="toggleStaff(st.id)">
                  {{ st.name }} <span class="text-xs text-gray-400">{{ st.sub || '' }}</span>
                </label>
              }
            </div>
            @if (selectedStaff().length > 1) {
              <div class="mt-2">
                <label class="lbl">Lead Staff</label>
                <select [(ngModel)]="leadStaffId" class="input">
                  <option [ngValue]="null">— none —</option>
                  @for (st of staff(); track st.id) {
                    @if (selectedStaff().includes(st.id)) { <option [ngValue]="st.id">{{ st.name }}</option> }
                  }
                </select>
              </div>
            }
          }
        </div>

        <!-- Agenda + status -->
        <div><label class="lbl">Agenda / Purpose</label><textarea [(ngModel)]="m.agenda" rows="2" class="input" placeholder="e.g. Cotton fabric bulk order discussion"></textarea></div>
        <div>
          <label class="lbl">Status</label>
          <select [(ngModel)]="m.status" class="input w-48">
            <option value="draft">Draft</option><option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </select>
        </div>

        @if (error()) { <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{{ error() }}</div> }

        <div class="flex justify-end gap-2 border-t pt-4">
          <a routerLink="/suppliers/appointments" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</a>
          <button (click)="save()" [disabled]="saving()" class="btn-primary">
            {{ saving() ? 'Saving…' : (editingId ? 'Update' : 'Save Appointment') }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`.lbl{ display:block; font-size:10px; font-weight:800; color:#6b3fa0; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }`]
})
export class AppointmentFormComponent {
  private svc = inject(AppointmentsService);
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  editingId: string | null = null;
  saving = signal(false);
  error = signal('');

  suppliers = signal<ApptOption[]>([]);
  buyers = signal<ApptOption[]>([]);
  branches = signal<BranchOpt[]>([]);
  staff = signal<ApptOption[]>([]);
  selectedStaff = signal<string[]>([]);
  leadStaffId: string | null = null;

  directions = [
    { v: 's2b', label: 'Supplier → Buyer', hint: 'Supplier samples lekar buyer ke paas' },
    { v: 'b2s', label: 'Buyer → Supplier', hint: 'Buyer maal dekhne supplier ke paas' },
    { v: 'neutral', label: 'Neutral Meeting', hint: 'Hotel / restaurant / trade fair' },
    { v: 'online', label: 'Online Meeting', hint: 'Video call (Zoom / Meet / WA)' }
  ];

  m: any = {
    visitDirection: 's2b',
    supplierId: null, buyerId: null, branchId: null,
    appointmentDate: '', appointmentTime: '', durationMinutes: 60,
    city: '', address: '', onlineLink: '', agenda: '', status: 'draft'
  };

  ngOnInit() {
    this.svc.supplierOptions().subscribe(s => this.suppliers.set(s));
    this.svc.buyerOptions().subscribe(b => this.buyers.set(b));
    this.http.get<BranchOpt[]>(`${environment.apiUrl}/api/core/branches`).subscribe({
      next: (br) => this.branches.set(br ?? []),
      error: () => this.branches.set([])
    });

    this.editingId = this.route.snapshot.paramMap.get('id');
    if (this.editingId) {
      this.svc.get(this.editingId).subscribe(a => {
        this.m = {
          visitDirection: a.visitDirection,
          supplierId: a.supplierId, buyerId: a.buyerId, branchId: a.branchId,
          appointmentDate: a.appointmentDate, appointmentTime: a.appointmentTime || '',
          durationMinutes: a.durationMinutes, city: a.city || '', address: a.address || '',
          onlineLink: a.onlineLink || '', agenda: a.agenda || '', status: a.status
        };
        this.selectedStaff.set(a.staff.map(s => s.employeeId));
        this.leadStaffId = a.staff.find(s => s.isLead)?.employeeId ?? null;
        this.onBranchChange();
      });
    }
  }

  onBranchChange() {
    this.svc.staffOptions(this.m.branchId || undefined).subscribe({
      next: (s) => this.staff.set(s),
      error: () => this.staff.set([])
    });
  }

  toggleStaff(id: string) {
    this.selectedStaff.update(arr => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  }

  save() {
    if (!this.m.appointmentDate) { this.error.set('Date zaroori hai.'); return; }
    if ((this.m.visitDirection === 's2b' || this.m.visitDirection === 'b2s')
        && (!this.m.supplierId || !this.m.buyerId)) {
      this.error.set('Supplier aur Buyer dono select karein.'); return;
    }
    this.saving.set(true);
    this.error.set('');
    const data = { ...this.m, staffIds: this.selectedStaff(), leadStaffId: this.leadStaffId };
    const obs = this.editingId ? this.svc.update(this.editingId, data) : this.svc.create(data);
    obs.subscribe({
      next: (a) => {
        this.toast.success(this.editingId ? 'Appointment update ho gaya!' : 'Appointment book ho gaya!');
        this.router.navigate(['/suppliers/appointments', a.id]);
      },
      error: (e) => { this.error.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }
}
