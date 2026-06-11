import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HrService, Employee, AttendanceLog, LeaveBalance, LeaveRequest, Payslip, CreateEmployee } from '../services/hr.service';
import { ToastService } from '../../../shared/toast.service';
import { InDatePipe } from '../../../shared/in-date.pipe';

const subNav = `
  <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
    <a routerLink="/hr/dashboard" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       [routerLinkActiveOptions]="{exact:true}"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
    <a routerLink="/hr/staff" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">👤 Staff</a>
    <a routerLink="/hr/check-in" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📸 My Attendance</a>
    <a routerLink="/hr/register" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📋 Register</a>
    <a routerLink="/hr/live-map" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🗺 Live Map</a>
    <a routerLink="/hr/leaves" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🏖 Leaves</a>
    <a routerLink="/hr/payroll" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💰 Payroll</a>
  </div>
`;

// =============================================================================
// STAFF LIST
// =============================================================================
@Component({
  selector: 'app-staff',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, DatePipe, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">👤 Staff Master</h2>
          <p class="text-sm text-[#6b3fa0]">Employee records and salary structures</p>
        </div>
        <button (click)="openAdd()" class="btn-primary">+ Add Employee</button>
      </div>

      ${subNav}

      <input [(ngModel)]="search" (input)="onSearch()" placeholder="🔍 Search by name or code..." class="input mb-4">

      <div class="card p-0 overflow-x-auto">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading…</div> }
        @else if (employees().length === 0) { <div class="p-8 text-center text-gray-500">No employees yet</div> }
        @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-3 py-2 text-left">S.NO</th>
                <th class="px-3 py-2 text-left">Code</th>
                <th class="px-3 py-2 text-left">Name</th>
                <th class="px-3 py-2 text-left">Designation</th>
                <th class="px-3 py-2 text-left">Department</th>
                <th class="px-3 py-2 text-left">Joining</th>
                <th class="px-3 py-2 text-right">CTC/Month</th>
                <th class="px-3 py-2 text-center">Leaves</th>
              </tr>
            </thead>
            <tbody>
              @for (e of employees(); track e.id; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-3 py-2 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-3 py-2 font-mono text-xs font-bold text-[#5c1a8b]">{{ e.employeeCode }}</td>
                  <td class="px-3 py-2">
                    <div class="font-semibold">{{ e.fullName }}</div>
                    <div class="text-xs text-gray-500">{{ e.phone }}</div>
                  </td>
                  <td class="px-3 py-2 text-sm">{{ e.designation }}</td>
                  <td class="px-3 py-2 text-xs">{{ e.department }}</td>
                  <td class="px-3 py-2 text-xs">{{ e.joiningDate | inDate }}</td>
                  <td class="px-3 py-2 text-right font-mono font-bold">₹{{ e.monthlyCtc | number:'1.0-0' }}</td>
                  <td class="px-3 py-2 text-center">{{ e.leavesAvailable }} days</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Add Employee modal -->
      @if (showAdd()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="showAdd.set(false)">
          <div class="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <h3 class="font-display font-bold text-lg text-[#5c1a8b] mb-4">➕ Add Employee</h3>
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Full Name *</label>
                <input [(ngModel)]="nf.fullName" class="input" placeholder="Employee ka pura naam">
              </div>
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Phone</label>
                <input [(ngModel)]="nf.phone" class="input" placeholder="98XXXXXXXX">
              </div>
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Email</label>
                <input [(ngModel)]="nf.email" type="email" class="input" placeholder="name@email.com">
              </div>
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Designation</label>
                <select [(ngModel)]="desigSel" (ngModelChange)="onDesig($event)" class="input">
                  <option value="">— Select —</option>
                  @for (d of designations; track d) { <option [value]="d">{{ d }}</option> }
                  <option value="__other">Other…</option>
                </select>
                @if (desigOther) {
                  <input [(ngModel)]="nf.designation" class="input mt-2" placeholder="Designation type karein">
                }
              </div>
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Department</label>
                <select [(ngModel)]="deptSel" (ngModelChange)="onDept($event)" class="input">
                  <option value="">— Select —</option>
                  @for (d of departments; track d) { <option [value]="d">{{ d }}</option> }
                  <option value="__other">Other…</option>
                </select>
                @if (deptOther) {
                  <input [(ngModel)]="nf.department" class="input mt-2" placeholder="Department type karein">
                }
              </div>
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Joining Date *</label>
                <input [(ngModel)]="nf.joiningDate" type="date" class="input">
              </div>
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Monthly CTC (₹)</label>
                <input [(ngModel)]="nf.monthlyCtc" type="number" min="0" class="input" placeholder="e.g. 25000">
              </div>
              <div class="col-span-2">
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">PAN</label>
                <input [(ngModel)]="nf.panNumber" class="input" placeholder="ABCDE1234F">
              </div>
            </div>
            @if (addErr()) { <p class="text-red-600 text-sm mt-3">{{ addErr() }}</p> }
            <div class="flex justify-end gap-2 mt-5">
              <button type="button" (click)="showAdd.set(false)" class="px-4 py-2 border rounded text-sm">Cancel</button>
              <button type="button" (click)="saveEmployee()" class="btn-primary" [disabled]="saving()">
                {{ saving() ? 'Saving…' : 'Save Employee' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class StaffComponent {
  private svc = inject(HrService);
  employees = signal<Employee[]>([]);
  loading = signal(true);
  search = '';

  showAdd = signal(false);
  saving = signal(false);
  addErr = signal('');
  nf: CreateEmployee = this.blank();

  designations = ['Proprietor / Owner', 'Director', 'Manager', 'Sales Manager', 'Marketing Executive', 'Sales Executive', 'Senior Executive', 'Executive', 'D.E.O. (Data Entry Operator)', 'Accountant', 'Cashier', 'Office Assistant', 'Helper / Peon', 'Driver'];
  departments = ['Sales', 'Marketing', 'Accounts', 'Administration', 'Data Entry', 'Operations / Logistics', 'HR', 'Management'];
  desigSel = '';
  deptSel = '';
  desigOther = false;
  deptOther = false;

  onDesig(v: string) {
    this.desigOther = v === '__other';
    this.nf.designation = this.desigOther ? '' : v;
  }
  onDept(v: string) {
    this.deptOther = v === '__other';
    this.nf.department = this.deptOther ? '' : v;
  }

  blank(): CreateEmployee {
    return { fullName: '', phone: '', email: '', designation: '', department: '', joiningDate: '', panNumber: '' };
  }

  openAdd() {
    this.nf = this.blank();
    this.nf.joiningDate = new Date().toISOString().slice(0, 10);
    this.desigSel = '';
    this.deptSel = '';
    this.desigOther = false;
    this.deptOther = false;
    this.addErr.set('');
    this.showAdd.set(true);
  }

  saveEmployee() {
    if (!this.nf.fullName?.trim()) { this.addErr.set('Full name zaroori hai'); return; }
    if (!this.nf.joiningDate) { this.addErr.set('Joining date zaroori hai'); return; }
    this.saving.set(true);
    this.addErr.set('');
    // strip empty optional fields
    const payload: CreateEmployee = { fullName: this.nf.fullName.trim(), joiningDate: this.nf.joiningDate };
    if (this.nf.phone?.trim()) payload.phone = this.nf.phone.trim();
    if (this.nf.email?.trim()) payload.email = this.nf.email.trim();
    if (this.nf.designation?.trim()) payload.designation = this.nf.designation.trim();
    if (this.nf.department?.trim()) payload.department = this.nf.department.trim();
    if (this.nf.panNumber?.trim()) payload.panNumber = this.nf.panNumber.trim();
    if (this.nf.monthlyCtc && +this.nf.monthlyCtc > 0) payload.monthlyCtc = +this.nf.monthlyCtc;
    this.svc.createEmployee(payload).subscribe({
      next: () => { this.saving.set(false); this.showAdd.set(false); this.load(); },
      error: (e) => { this.saving.set(false); this.addErr.set(e?.error?.error ?? e?.error?.message ?? 'Employee save nahi hua'); }
    });
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.listEmployees(this.search || undefined).subscribe({
      next: (e) => { this.employees.set(e); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  private timer: any;
  onSearch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), 300);
  }
}

// =============================================================================
// ATTENDANCE REGISTER (monthly grid)
// =============================================================================
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📋 Attendance Register</h2>
          <p class="text-sm text-[#6b3fa0]">Monthly attendance grid</p>
        </div>
        <div class="flex gap-2">
          <select [(ngModel)]="month" (change)="load()" class="input w-32">
            @for (m of months; track m.v; let i = $index) {
              <option [value]="i+1">{{ m.label }}</option>
            }
          </select>
          <select [(ngModel)]="year" (change)="load()" class="input w-24">
            @for (y of years; track y) { <option [value]="y">{{ y }}</option> }
          </select>
        </div>
      </div>

      ${subNav}

      <div class="card p-0 overflow-x-auto">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading…</div> }
        @else if (logs().length === 0) { <div class="p-8 text-center text-gray-500">No attendance for this month</div> }
        @else {
          <table class="w-full text-xs">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase">
              <tr>
                <th class="px-2 py-2 text-left sticky left-0 bg-[#f0e6ff]">Employee</th>
                @for (d of daysOfMonth(); track d) {
                  <th class="px-1 py-2 text-center w-7">{{ d }}</th>
                }
                <th class="px-2 py-2 text-center">P</th>
                <th class="px-2 py-2 text-center">A</th>
                <th class="px-2 py-2 text-center">L</th>
              </tr>
            </thead>
            <tbody>
              @for (row of grid(); track row.empId) {
                <tr class="border-t">
                  <td class="px-2 py-1 font-semibold sticky left-0 bg-white">{{ row.name }}</td>
                  @for (d of daysOfMonth(); track d) {
                    <td class="text-center w-7 h-7" [class]="cellClass(row, d)">
                      {{ cellLabel(row, d) }}
                    </td>
                  }
                  <td class="px-2 py-1 text-center font-bold text-green-700">{{ row.present }}</td>
                  <td class="px-2 py-1 text-center font-bold text-red-700">{{ row.absent }}</td>
                  <td class="px-2 py-1 text-center font-bold text-blue-700">{{ row.leave }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <div class="mt-4 flex gap-4 text-xs">
        <span><span class="inline-block w-4 h-4 bg-green-200 rounded mr-1"></span> Present</span>
        <span><span class="inline-block w-4 h-4 bg-yellow-200 rounded mr-1"></span> Half-day</span>
        <span><span class="inline-block w-4 h-4 bg-red-200 rounded mr-1"></span> Absent</span>
        <span><span class="inline-block w-4 h-4 bg-blue-200 rounded mr-1"></span> Leave</span>
        <span><span class="inline-block w-4 h-4 bg-gray-200 rounded mr-1"></span> Holiday/Weekend</span>
      </div>
    </div>
  `
})
export class RegisterComponent {
  private svc = inject(HrService);
  logs = signal<AttendanceLog[]>([]);
  loading = signal(true);

  now = new Date();
  month = this.now.getMonth() + 1;
  year = this.now.getFullYear();

  months = Array.from({ length: 12 }, (_, i) => ({
    v: i + 1,
    label: new Date(2026, i, 1).toLocaleString('en', { month: 'long' })
  }));
  years = [this.now.getFullYear() - 1, this.now.getFullYear(), this.now.getFullYear() + 1];

  daysOfMonth() {
    const d = new Date(this.year, this.month, 0).getDate();
    return Array.from({ length: d }, (_, i) => i + 1);
  }

  grid() {
    const empMap = new Map<string, any>();
    this.logs().forEach(log => {
      if (!empMap.has(log.employeeId)) {
        empMap.set(log.employeeId, {
          empId: log.employeeId,
          name: log.employeeName,
          days: {} as Record<number, string>,
          present: 0, absent: 0, leave: 0
        });
      }
      const e = empMap.get(log.employeeId);
      const day = new Date(log.logDate).getDate();
      e.days[day] = log.status ?? '';
      if (log.status === 'present') e.present++;
      else if (log.status === 'half_day') e.present += 0.5;
      else if (log.status === 'absent') e.absent++;
      else if (log.status === 'leave') e.leave++;
    });
    return Array.from(empMap.values());
  }

  cellClass(row: any, day: number): string {
    const status = row.days[day];
    if (status === 'present') return 'bg-green-200';
    if (status === 'half_day') return 'bg-yellow-200';
    if (status === 'absent') return 'bg-red-200';
    if (status === 'leave') return 'bg-blue-200';
    return 'bg-gray-100';
  }

  cellLabel(row: any, day: number): string {
    const status = row.days[day];
    if (status === 'present') return 'P';
    if (status === 'half_day') return '½';
    if (status === 'absent') return 'A';
    if (status === 'leave') return 'L';
    return '';
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.register(this.year, this.month).subscribe({
      next: (l) => { this.logs.set(l); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}

// =============================================================================
// LEAVES
// =============================================================================
@Component({
  selector: 'app-leaves',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive, DecimalPipe, DatePipe, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🏖 Leave Management</h2>
          <p class="text-sm text-[#6b3fa0]">Apply and approve leaves</p>
        </div>
        <button (click)="openApply()" class="btn-primary">+ Apply Leave</button>
      </div>

      ${subNav}

      <!-- Balance cards -->
      <div class="grid grid-cols-3 gap-3 mb-4">
        @for (b of balance(); track b.leaveType; let i = $index) {
          <div class="card text-center" [style.border-left]="'4px solid ' + leaveColor(i)" [style.background]="leaveColor(i) + '0d'">
            <div class="text-xs uppercase font-bold text-gray-500">{{ b.leaveType }}</div>
            <div class="text-2xl font-black text-[#5c1a8b]" [style.color]="leaveColor(i)">{{ b.available }} <span class="text-sm font-normal text-gray-500">/ {{ b.totalAllocated }}</span></div>
            <div class="text-xs text-gray-400">{{ b.used }} used</div>
          </div>
        }
      </div>

      <!-- Pending approvals (if visible) -->
      @if (pending().length > 0) {
        <div class="card p-0 overflow-hidden mb-4">
          <div class="bg-yellow-50 px-4 py-2 border-b border-yellow-200">
            <h3 class="font-bold text-yellow-700">⏰ Pending Approvals ({{ pending().length }})</h3>
          </div>
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs uppercase">
              <tr>
                <th class="px-3 py-2 text-left">S.NO</th>
                <th class="px-3 py-2 text-left">Employee</th>
                <th class="px-3 py-2 text-left">Type</th>
                <th class="px-3 py-2 text-left">Dates</th>
                <th class="px-3 py-2 text-right">Days</th>
                <th class="px-3 py-2 text-left">Reason</th>
                <th class="px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (l of pending(); track l.id; let i = $index) {
                <tr class="border-t">
                  <td class="px-3 py-2 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-3 py-2 font-semibold">{{ l.employeeName }}</td>
                  <td class="px-3 py-2 uppercase text-xs">{{ l.leaveType }}</td>
                  <td class="px-3 py-2 text-xs">{{ l.fromDate | inDate }} → {{ l.toDate | inDate }}</td>
                  <td class="px-3 py-2 text-right">{{ l.daysCount }}</td>
                  <td class="px-3 py-2 text-xs">{{ l.reason }}</td>
                  <td class="px-3 py-2 text-center">
                    <button (click)="approve(l.id)" class="text-green-600 text-xs hover:underline mr-2">✓ Approve</button>
                    <button (click)="reject(l.id)" class="text-red-600 text-xs hover:underline">✗ Reject</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- My leaves -->
      <div class="card p-0 overflow-hidden">
        <div class="px-4 py-2 border-b bg-[#f0e6ff]">
          <h3 class="font-bold text-[#5c1a8b]">My Leave History</h3>
        </div>
        @if (myLeaves().length === 0) { <div class="p-6 text-center text-gray-400">No leaves yet</div> }
        @else {
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs uppercase">
              <tr>
                <th class="px-3 py-2 text-left">S.NO</th>
                <th class="px-3 py-2 text-left">Type</th>
                <th class="px-3 py-2 text-left">Dates</th>
                <th class="px-3 py-2 text-right">Days</th>
                <th class="px-3 py-2 text-center">Status</th>
                <th class="px-3 py-2 text-left">Applied</th>
              </tr>
            </thead>
            <tbody>
              @for (l of myLeaves(); track l.id; let i = $index) {
                <tr class="border-t">
                  <td class="px-3 py-2 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-3 py-2 uppercase text-xs">{{ l.leaveType }}</td>
                  <td class="px-3 py-2 text-xs">{{ l.fromDate | inDate }} → {{ l.toDate | inDate }}</td>
                  <td class="px-3 py-2 text-right">{{ l.daysCount }}</td>
                  <td class="px-3 py-2 text-center">
                    <span class="text-xs px-2 py-0.5 rounded uppercase font-bold"
                          [class.bg-yellow-100]="l.status === 'pending'"
                          [class.text-yellow-700]="l.status === 'pending'"
                          [class.bg-green-100]="l.status === 'approved'"
                          [class.text-green-700]="l.status === 'approved'"
                          [class.bg-red-100]="l.status === 'rejected'"
                          [class.text-red-700]="l.status === 'rejected'">{{ l.status }}</span>
                  </td>
                  <td class="px-3 py-2 text-xs">{{ l.createdAt | date:'short' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Apply modal -->
      @if (showApply()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="showApply.set(false)">
          <div class="bg-white rounded-2xl p-6 w-full max-w-md" (click)="$event.stopPropagation()">
            <h3 class="font-display font-bold text-lg text-[#5c1a8b] mb-4">Apply for Leave</h3>
            <form [formGroup]="applyForm" (ngSubmit)="submitApply()" class="grid gap-3">
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Leave Type</label>
                <select formControlName="leaveType" class="input">
                  <option value="sick">Sick</option>
                  <option value="casual">Casual</option>
                  <option value="earned">Earned</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs font-bold uppercase text-[#6b3fa0]">From</label>
                  <input formControlName="fromDate" type="date" class="input">
                </div>
                <div>
                  <label class="text-xs font-bold uppercase text-[#6b3fa0]">To</label>
                  <input formControlName="toDate" type="date" class="input">
                </div>
              </div>
              <div>
                <label class="text-xs font-bold uppercase text-[#6b3fa0]">Reason</label>
                <select [(ngModel)]="applyReasonSel" [ngModelOptions]="{standalone:true}" (ngModelChange)="onApplyReason($event)" class="input">
                  <option value="">— Select reason —</option>
                  @for (r of leaveReasons; track r) { <option [value]="r">{{ r }}</option> }
                  <option value="__other">Other (manually type)…</option>
                </select>
                @if (applyReasonOther) {
                  <textarea formControlName="reason" rows="3" class="input mt-2" placeholder="Apna reason type karein"></textarea>
                }
              </div>
              <div class="flex justify-end gap-2 mt-2">
                <button type="button" (click)="showApply.set(false)" class="px-4 py-2 border rounded text-sm">Cancel</button>
                <button type="submit" class="btn-primary" [disabled]="applyForm.invalid || applying()">
                  {{ applying() ? 'Applying…' : 'Apply' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Reject modal -->
      @if (showReject()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="showReject.set(false)">
          <div class="bg-white rounded-2xl p-6 w-full max-w-md" (click)="$event.stopPropagation()">
            <h3 class="font-display font-bold text-lg text-[#5c1a8b] mb-4">✗ Reject Leave</h3>
            <label class="text-xs font-bold uppercase text-[#6b3fa0]">Rejection Reason</label>
            <select [(ngModel)]="rejectSel" (ngModelChange)="onRejectSel($event)" class="input">
              <option value="">— Select reason —</option>
              @for (r of rejectReasons; track r) { <option [value]="r">{{ r }}</option> }
              <option value="__other">Other…</option>
            </select>
            @if (rejectOther) {
              <input [(ngModel)]="rejectReason" class="input mt-2" placeholder="Reason type karein">
            }
            <div class="flex justify-end gap-2 mt-5">
              <button type="button" (click)="showReject.set(false)" class="px-4 py-2 border rounded text-sm">Cancel</button>
              <button type="button" (click)="confirmReject()" class="px-4 py-2 bg-red-600 text-white rounded text-sm" [disabled]="rejecting()">
                {{ rejecting() ? 'Rejecting…' : 'Reject Leave' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class LeavesComponent {
  private svc = inject(HrService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);

  balance = signal<LeaveBalance[]>([]);
  myLeaves = signal<LeaveRequest[]>([]);
  pending = signal<LeaveRequest[]>([]);
  showApply = signal(false);
  applying = signal(false);

  // Cycling accent colours for leave-balance cards (purely visual)
  private leavePalette = ['#1B2E5C', '#0284c7', '#16a34a', '#9333ea', '#d97706', '#0d9488'];
  leaveColor(i: number): string { return this.leavePalette[i % this.leavePalette.length]; }

  // apply reason dropdown + manual
  applyReasonSel = '';
  applyReasonOther = false;
  leaveReasons = [
    'Bukhar / tabiyat kharab',
    'Personal kaam',
    'Family function / shaadi',
    'Medical / doctor appointment',
    'Ghar pe emergency',
    'Travel / out of station'
  ];

  // reject modal
  showReject = signal(false);
  rejecting = signal(false);
  rejectId = '';
  rejectSel = '';
  rejectReason = '';
  rejectOther = false;
  rejectReasons = [
    'Leave balance kam hai',
    'Kaam ka pressure / deadline',
    'Bahut short notice',
    'Team pehle se leave par hai',
    'Peak / busy season',
    'Documents ya proof missing'
  ];

  applyForm = this.fb.nonNullable.group({
    leaveType: ['casual', Validators.required],
    fromDate: ['', Validators.required],
    toDate: ['', Validators.required],
    halfDayStart: [false],
    halfDayEnd: [false],
    reason: ['']
  });

  ngOnInit() { this.loadAll(); }

  loadAll() {
    this.svc.myBalance().subscribe(b => this.balance.set(b));
    this.svc.myLeaves().subscribe(l => this.myLeaves.set(l));
    this.svc.pendingLeaves().subscribe({ next: p => this.pending.set(p), error: () => {} });
  }

  openApply() {
    this.applyForm.reset({ leaveType: 'casual', fromDate: '', toDate: '', halfDayStart: false, halfDayEnd: false, reason: '' });
    this.applyReasonSel = '';
    this.applyReasonOther = false;
    this.showApply.set(true);
  }

  onApplyReason(v: string) {
    this.applyReasonOther = v === '__other';
    this.applyForm.patchValue({ reason: this.applyReasonOther ? '' : v });
  }

  submitApply() {
    if (this.applyForm.invalid || this.applying()) return;   // double-click se rok
    this.applying.set(true);
    this.svc.applyLeave(this.applyForm.getRawValue()).subscribe({
      next: () => {
        this.applying.set(false);
        this.showApply.set(false);
        this.toast.success('✅ Leave application submit ho gaya!');
        this.loadAll();
      },
      error: (e) => {
        this.applying.set(false);
        this.toast.error(e?.error?.error ?? 'Leave apply nahi hua');
      }
    });
  }

  async approve(id: string) {
    if (!confirm('Is leave ko approve karein?')) return;
    await firstValueFrom(this.svc.approveLeave(id, ''));
    this.toast.success('✅ Leave approve ho gaya');
    this.loadAll();
  }

  reject(id: string) {
    this.rejectId = id;
    this.rejectSel = '';
    this.rejectReason = '';
    this.rejectOther = false;
    this.showReject.set(true);
  }

  onRejectSel(v: string) {
    this.rejectOther = v === '__other';
    this.rejectReason = this.rejectOther ? '' : v;
  }

  confirmReject() {
    const reason = (this.rejectReason || '').trim();
    if (!reason) { this.toast.error('Rejection reason select karein'); return; }
    if (this.rejecting()) return;
    this.rejecting.set(true);
    this.svc.rejectLeave(this.rejectId, reason).subscribe({
      next: () => {
        this.rejecting.set(false);
        this.showReject.set(false);
        this.toast.success('Leave reject ho gaya');
        this.loadAll();
      },
      error: (e) => {
        this.rejecting.set(false);
        this.toast.error(e?.error?.error ?? 'Reject nahi hua');
      }
    });
  }
}

// =============================================================================
// PAYROLL
// =============================================================================
@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, DatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">💰 Payroll</h2>
          <p class="text-sm text-[#6b3fa0]">Monthly salary processing with auto-post to Accounting</p>
        </div>
        <div class="flex gap-2">
          <select [(ngModel)]="month" (change)="load()" class="input w-32">
            @for (m of months; track m.v; let i = $index) {
              <option [value]="i+1">{{ m.label }}</option>
            }
          </select>
          <select [(ngModel)]="year" (change)="load()" class="input w-24">
            @for (y of years; track y) { <option [value]="y">{{ y }}</option> }
          </select>
          <button (click)="run()" class="btn-primary" [disabled]="running()">
            {{ running() ? 'Running…' : '🚀 Run Payroll' }}
          </button>
        </div>
      </div>

      ${subNav}

      <div class="card p-0 overflow-x-auto">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading…</div> }
        @else if (slips().length === 0) {
          <div class="p-8 text-center text-gray-500">
            No payroll for {{ months[month-1].label }} {{ year }}.
            <button (click)="run()" class="text-[#5c1a8b] underline">Run payroll now</button>
          </div>
        }
        @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-3 py-2 text-left">S.NO</th>
                <th class="px-3 py-2 text-left">Employee</th>
                <th class="px-3 py-2 text-right">Days Present</th>
                <th class="px-3 py-2 text-right">Gross</th>
                <th class="px-3 py-2 text-right">PF + ESI</th>
                <th class="px-3 py-2 text-right">Total Ded.</th>
                <th class="px-3 py-2 text-right">Net Salary</th>
                <th class="px-3 py-2 text-center">Status</th>
                <th class="px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (s of slips(); track s.id; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-3 py-2 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-3 py-2 font-semibold">{{ s.employeeName }}</td>
                  <td class="px-3 py-2 text-right">{{ s.daysPresent ?? '—' }} / {{ s.daysInMonth ?? '—' }}</td>
                  <td class="px-3 py-2 text-right font-mono">₹{{ s.grossSalary | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono text-red-600">₹{{ (s.pfEmployee + s.esiEmployee) | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono text-red-600">₹{{ s.totalDeductions | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono font-bold text-green-700">₹{{ s.netSalary | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-center">
                    @if (s.isPaid) {
                      <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✓ Paid</span>
                    } @else {
                      <span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Pending</span>
                    }
                  </td>
                  <td class="px-3 py-2 text-center">
                    @if (!s.isPaid) {
                      <button (click)="markPaid(s.id)" class="text-xs text-[#5c1a8b] hover:underline">Mark Paid + Post</button>
                    } @else if (s.voucherNo) {
                      <span class="text-xs text-gray-500 font-mono">{{ s.voucherNo }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
            <tfoot class="bg-gray-100 font-bold">
              <tr>
                <td colspan="6" class="px-3 py-2 text-right">TOTAL:</td>
                <td class="px-3 py-2 text-right font-mono">₹{{ total() | number:'1.2-2' }}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        }
      </div>

      <div class="card mt-4 bg-blue-50 border-blue-200 text-blue-900">
        <p class="text-sm">
          <strong>ℹ️ Auto-Post Magic:</strong> Mark Paid karte hi automatic payment voucher banta hai —
          <code class="bg-white px-1 rounded">Dr Salary & Wages ₹X</code>,
          <code class="bg-white px-1 rounded">Cr Bank ₹X</code>,
          <code class="bg-white px-1 rounded">Cr PF Payable</code>,
          <code class="bg-white px-1 rounded">Cr ESI Payable</code>.
          Trial Balance instantly updates.
        </p>
      </div>
    </div>
  `
})
export class PayrollComponent {
  private svc = inject(HrService);
  slips = signal<Payslip[]>([]);
  loading = signal(true);
  running = signal(false);

  now = new Date();
  month = this.now.getMonth() + 1;
  year = this.now.getFullYear();

  months = Array.from({ length: 12 }, (_, i) => ({
    v: i + 1,
    label: new Date(2026, i, 1).toLocaleString('en', { month: 'long' })
  }));
  years = [this.now.getFullYear() - 1, this.now.getFullYear(), this.now.getFullYear() + 1];

  total() {
    return this.slips().reduce((s, p) => s + p.netSalary, 0);
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.payrollMonth(this.year, this.month).subscribe({
      next: (s) => { this.slips.set(s); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  run() {
    this.running.set(true);
    this.svc.runPayroll(this.year, this.month).subscribe({
      next: (s) => { this.slips.set(s); this.running.set(false); },
      error: () => this.running.set(false)
    });
  }

  markPaid(id: string) {
    if (!confirm('Mark salary as paid + auto-post to Accounting?')) return;
    this.svc.markPaid(id).subscribe(() => this.load());
  }
}
