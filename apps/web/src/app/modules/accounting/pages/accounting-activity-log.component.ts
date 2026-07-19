import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface AuditRow { date: string; time: string; user: string; username?: string; module: string; table: string; label: string; action: string; changes?: string; }

/** Accounting-scoped Activity Log - kisne ledger/voucher/group banaya, edit ya delete kiya.
 *  /api/audit/logs?module=accounting ko call karta hai (firm-scoped). */
import { BackButtonComponent } from '../../../shared/back-button.component';
@Component({
  selector: 'app-accounting-activity-log',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, FormsModule, RouterLink, RouterLinkActive],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
      <a routerLink="/accounting/heads" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Heads</a>
      <a routerLink="/accounting/groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Groups</a>
      <a routerLink="/accounting/sub-groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Sub Groups</a>
      <a routerLink="/accounting/ledgers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Ledgers</a>
      <a routerLink="/accounting/vouchers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Vouchers</a>
      <a routerLink="/accounting/voucher-list" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Voucher List</a>
      <a routerLink="/accounting/trial-balance" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Trial Balance</a>
      <a routerLink="/accounting/profit-loss" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">P&amp;L</a>
      <a routerLink="/accounting/balance-sheet" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Balance Sheet</a>
      <a routerLink="/accounting/activity-log" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Log</a>
    </div>

    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div>
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Accounts Activity Log</h2>
        <p class="text-sm text-[#6b3fa0]">Kisne ledger/voucher/group banaya, edit kiya, delete kiya</p>
      </div>
      <div class="flex gap-2 items-center flex-wrap">
        <label class="text-xs text-gray-500">From</label>
        <input type="date" [(ngModel)]="fromDate" (change)="load()" class="input w-40">
        <label class="text-xs text-gray-500">To</label>
        <input type="date" [(ngModel)]="toDate" (change)="load()" class="input w-40">
        <select [(ngModel)]="typeFilter" (change)="load()" class="input w-36">
          <option value="">All Types</option>
          <option value="payment">Payment</option>
          <option value="receipt">Receipt</option>
          <option value="contra">Contra</option>
          <option value="journal">Journal</option>
        </select>
        <select [(ngModel)]="actionFilter" (change)="load()" class="input w-36">
          <option value="">All Actions</option>
          <option value="insert">Entry</option>
          <option value="update">Edit</option>
          <option value="delete">Delete</option>
        </select>
        <input [(ngModel)]="search" (keyup.enter)="load()" placeholder="Ledger/record naam..." class="input w-56">
        <button (click)="load()" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">Refresh</button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-3 mb-4">
      <div class="card text-center"><div class="text-2xl font-black text-green-600">{{ count('insert') }}</div><div class="text-xs uppercase font-bold text-gray-500">New Entries</div></div>
      <div class="card text-center"><div class="text-2xl font-black text-blue-600">{{ count('update') }}</div><div class="text-xs uppercase font-bold text-gray-500">Edits</div></div>
      <div class="card text-center"><div class="text-2xl font-black text-red-600">{{ count('delete') }}</div><div class="text-xs uppercase font-bold text-gray-500">Deletes</div></div>
    </div>

    <div class="card p-0 overflow-x-auto">
      @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
      @else if (errored()) { <div class="p-8 text-center text-red-600">Log load nahi hua - server error. Thodi der baad Refresh karein.</div> }
      @else if (rows().length === 0) { <div class="p-8 text-center text-gray-500">Koi activity nahi mili</div> }
      @else {
        <table class="w-full text-sm">
          <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">S.No</th>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-left">Time</th>
              <th class="px-3 py-2 text-left">User</th>
              <th class="px-3 py-2 text-left">Record</th>
              <th class="px-3 py-2 text-center">Action</th>
              <th class="px-3 py-2 text-left">Kya badla</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track $index) {
              <tr class="border-t hover:bg-[#faf5ff] align-top">
                <td class="px-3 py-2">{{ $index + 1 }}</td>
                <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{{ r.date }}</td>
                <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{{ r.time }}</td>
                <td class="px-3 py-2 font-semibold">{{ r.user }}<br><span class="text-xs font-normal text-gray-500">&#64;{{ r.username || '-' }}</span></td>
                <td class="px-3 py-2">{{ r.label || r.table }}</td>
                <td class="px-3 py-2 text-center">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold"
                    [class]="r.action==='insert' ? 'bg-green-100 text-green-700' : r.action==='delete' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'">
                    {{ r.action==='insert' ? 'Entry' : r.action==='delete' ? 'Delete' : 'Edit' }}
                  </span>
                </td>
                <td class="px-3 py-2 text-xs text-gray-600 max-w-md break-words">{{ pretty(r.changes) }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  </div>
  `,
})
export class AccountingActivityLogComponent {
  private http = inject(HttpClient);
  rows = signal<AuditRow[]>([]);
  loading = signal(false);
  errored = signal(false);
  actionFilter = '';
  typeFilter = '';
  search = '';
  fromDate = '';
  toDate = '';

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    this.errored.set(false);
    let params: any = { module: 'accounting', limit: 500 };
    if (this.actionFilter) params.action = this.actionFilter;
    // Type filter (voucher code se): Payment=-V-P, Receipt=-V-R, Contra=-V-C, Journal=-V-J
    const typeCode: any = { payment: '-V-P', receipt: '-V-R', contra: '-V-C', journal: '-V-J' };
    const s = this.typeFilter ? typeCode[this.typeFilter] : this.search.trim();
    if (s) params.search = s;
    if (this.fromDate) params.from = this.fromDate;
    if (this.toDate) params.to = this.toDate;
    this.http.get<AuditRow[]>(`${environment.apiUrl}/api/audit/logs`, { params }).subscribe({
      next: r => { this.rows.set(r || []); this.loading.set(false); },
      error: () => { this.rows.set([]); this.errored.set(true); this.loading.set(false); }
    });
  }

  count(a: string) { return this.rows().filter(r => r.action === a).length; }

  pretty(changes?: string): string {
    if (!changes) return '-';
    try {
      const o = JSON.parse(changes);
      return Object.keys(o).map(k => {
        const v = o[k];
        if (v && typeof v === 'object' && ('old' in v || 'new' in v)) return `${k}: ${v.old ?? '-'} -> ${v.new ?? '-'}`;
        return `${k}: ${v}`;
      }).join(' , ');
    } catch { return changes.length > 120 ? changes.slice(0, 120) + '...' : changes; }
  }
}
