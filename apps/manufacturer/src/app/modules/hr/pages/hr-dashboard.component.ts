import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HrService, HrDashboard } from '../services/hr.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-hr-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">👥 HR Dashboard</h2>
          <p class="text-sm text-[#6b3fa0]">Staff, attendance, leave, payroll overview</p>
        </div>
      </div>

      <!-- Sub-nav -->
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

      @if (loading()) {
        <div class="card text-center text-gray-500">Loading…</div>
      }
      @if (data(); as d) {

        <!-- Hero KPIs -->
        <div class="grid grid-cols-4 gap-4 mb-4">
          <div class="card border-l-4 border-purple-500" style="border-left:4px solid #1B2E5C;background:#1B2E5C0d">
            <div class="text-xs text-gray-500 uppercase font-bold">Total Staff</div>
            <div class="text-2xl font-black text-[#5c1a8b]" style="color:#1B2E5C">{{ d.activeEmployees }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ d.totalEmployees }} total ({{ d.totalEmployees - d.activeEmployees }} inactive)</div>
          </div>
          <div class="card border-l-4 border-green-500" style="border-left:4px solid #16a34a;background:#16a34a0d">
            <div class="text-xs text-gray-500 uppercase font-bold">Present Today</div>
            <div class="text-2xl font-black text-green-700" style="color:#16a34a">{{ d.presentToday }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ d.attendancePercent | number:'1.1-1' }}% attendance</div>
          </div>
          <div class="card border-l-4 border-yellow-500" style="border-left:4px solid #d97706;background:#d977060d">
            <div class="text-xs text-gray-500 uppercase font-bold">On Leave Today</div>
            <div class="text-2xl font-black text-yellow-700" style="color:#d97706">{{ d.onLeaveToday }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ d.pendingLeaveRequests }} pending approval</div>
          </div>
          <div class="card border-l-4 border-red-500" style="border-left:4px solid #d91e28;background:#d91e280d">
            <div class="text-xs text-gray-500 uppercase font-bold">Absent Today</div>
            <div class="text-2xl font-black text-red-700" style="color:#d91e28">{{ d.absentToday }}</div>
            <div class="text-xs text-gray-400 mt-1">No check-in</div>
          </div>
        </div>

        <!-- Payroll Budget -->
        <div class="card mb-4 bg-gradient-to-r from-purple-50 to-orange-50 border-purple-200">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm text-gray-600">Monthly Payroll Budget (Active Employees CTC)</div>
              <div class="text-3xl font-black font-mono text-[#5c1a8b] mt-1">
                ₹{{ d.monthlyPayrollBudget | number:'1.0-0' }}/month
              </div>
            </div>
            <a routerLink="/hr/payroll" class="btn-primary no-underline">Run Payroll →</a>
          </div>
        </div>

        <!-- Quick links -->
        <div class="grid grid-cols-3 gap-3">
          <a routerLink="/hr/check-in" class="card hover:bg-[#f0e6ff] transition cursor-pointer block no-underline text-[#2d1040]">
            <div class="text-3xl mb-2">📸</div>
            <div class="font-bold">Check-in / Check-out</div>
            <div class="text-xs text-gray-500 mt-1">Selfie + GPS location</div>
          </a>
          <a routerLink="/hr/live-map" class="card hover:bg-[#f0e6ff] transition cursor-pointer block no-underline text-[#2d1040]">
            <div class="text-3xl mb-2">🗺</div>
            <div class="font-bold">Live Location Map</div>
            <div class="text-xs text-gray-500 mt-1">Track field staff GPS trails</div>
          </a>
          <a routerLink="/hr/leaves" class="card hover:bg-[#f0e6ff] transition cursor-pointer block no-underline text-[#2d1040]">
            <div class="text-3xl mb-2">🏖</div>
            <div class="font-bold">Leave Management</div>
            <div class="text-xs text-gray-500 mt-1">Apply & approve leaves</div>
          </a>
        </div>
      }
    </div>
  `
})
export class HrDashboardComponent {
  private svc = inject(HrService);
  data = signal<HrDashboard | null>(null);
  loading = signal(true);

  ngOnInit() {
    this.svc.dashboard().subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}
