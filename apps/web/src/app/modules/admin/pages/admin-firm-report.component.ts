import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { AdminService, FirmReport } from '../services/admin.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-admin-firm-report',
  standalone: true,
  imports: [CommonModule, DecimalPipe, DatePipe, RouterLink, RouterLinkActive, BackButtonComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/admin/dashboard" [routerLinkActiveOptions]="{exact:true}" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
        <a routerLink="/admin/firms" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🏢 Firms</a>
        <a routerLink="/admin/firm-report" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📈 Report</a>
        <a routerLink="/admin/plans" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💼 Plans</a>
        <a routerLink="/admin/billing" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💳 Billing</a>
      </div>

      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📈 Firms Report</h2>
        <div class="flex gap-2">
          <button (click)="exportExcel()" class="px-3 py-1.5 text-sm border border-green-500 text-green-700 rounded hover:bg-green-50">⬇ Excel</button>
          <button (click)="exportPdf()" class="px-3 py-1.5 text-sm border border-red-500 text-red-600 rounded hover:bg-red-50">📄 PDF</button>
          <button (click)="printReport()" class="px-3 py-1.5 text-sm border border-[#5c1a8b] text-[#5c1a8b] rounded hover:bg-purple-50">🖨 Print</button>
          <button (click)="load()" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">🔄 Refresh</button>
        </div>
      </div>

      <!-- Summary cards -->
      <div class="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
        <div class="kc"><div class="kn text-[#5c1a8b]">{{ rep().summary.total }}</div><div class="kl">Total</div></div>
        <div class="kc"><div class="kn text-green-600">{{ rep().summary.active }}</div><div class="kl">Active</div></div>
        <div class="kc"><div class="kn text-yellow-600">{{ rep().summary.trial }}</div><div class="kl">Trial</div></div>
        <div class="kc"><div class="kn text-orange-600">{{ rep().summary.grace }}</div><div class="kl">Grace</div></div>
        <div class="kc"><div class="kn text-red-600">{{ rep().summary.suspended }}</div><div class="kl">Suspended</div></div>
        <div class="kc"><div class="kn text-[#5c1a8b]">{{ rep().summary.extended }}</div><div class="kl">Extended</div></div>
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-400 py-8">Loading…</div>
      } @else {
        <div class="card p-0 overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-[#1B2E5C] text-white uppercase text-xs">
              <tr>
                <th class="px-3 py-3 text-left">Firm</th>
                <th class="px-3 py-3 text-left">Plan</th>
                <th class="px-3 py-3 text-center">Status</th>
                <th class="px-3 py-3 text-right">Branches</th>
                <th class="px-3 py-3 text-right">Staff</th>
                <th class="px-3 py-3 text-left">Plan Ends</th>
                <th class="px-3 py-3 text-left">Extended On</th>
                <th class="px-3 py-3 text-right">Wallet</th>
              </tr>
            </thead>
            <tbody>
              @for (f of rep().firms; track f.id) {
                <tr class="border-t border-gray-100 hover:bg-[#faf7ff]">
                  <td class="px-3 py-2">
                    <a [routerLink]="['/admin/firms', f.id, 'subscription']" class="font-semibold text-[#5c1a8b] hover:underline">{{ f.name }}</a>
                    <div class="text-[11px] text-gray-400">{{ f.city }}</div>
                  </td>
                  <td class="px-3 py-2">{{ f.planName || '—' }}</td>
                  <td class="px-3 py-2 text-center"><span [class]="statusCls(f.status)">{{ f.status }}</span></td>
                  <td class="px-3 py-2 text-right">{{ f.branches }}</td>
                  <td class="px-3 py-2 text-right">{{ f.staff }}</td>
                  <td class="px-3 py-2" [class.text-red-600]="isExpired(f.planEnds)">{{ f.planEnds ? (f.planEnds | date:'dd-MMM-yyyy') : '—' }}</td>
                  <td class="px-3 py-2 text-gray-600">{{ f.extendedOn ? (f.extendedOn | date:'dd-MMM-yyyy') : '—' }}</td>
                  <td class="px-3 py-2 text-right font-mono">₹{{ f.walletBalance | number:'1.0-0' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .kc { background:#fff; border:1px solid #eee; border-radius:12px; padding:12px; text-align:center; }
    .kn { font-size:24px; font-weight:900; }
    .kl { font-size:10px; color:#888; text-transform:uppercase; font-weight:700; letter-spacing:.5px; }

    /* ===== MOBILE (<=640px) ===== */
    @media (max-width: 640px) {
      .kc { padding: 8px; }
      .kn { font-size: 18px; }
      table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
    }
  `]
})
export class AdminFirmReportComponent {
  private svc = inject(AdminService);
  loading = signal(true);
  rep = signal<FirmReport>({ summary: { total: 0, active: 0, trial: 0, grace: 0, suspended: 0, cancelled: 0, extended: 0 }, firms: [] });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.getFirmReport().subscribe({
      next: (r) => { this.rep.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  isExpired(d: string | null) { return !!d && new Date(d) < new Date(); }

  exportExcel() {
    const s = this.rep().summary;
    const rows: string[][] = [];
    rows.push(['Firms Report', new Date().toLocaleString('en-IN')]);
    rows.push([`Total: ${s.total}`, `Active: ${s.active}`, `Trial: ${s.trial}`, `Grace: ${s.grace}`, `Suspended: ${s.suspended}`, `Extended: ${s.extended}`]);
    rows.push([]);
    rows.push(['Firm', 'City', 'Plan', 'Status', 'Branches', 'Staff', 'Plan Ends', 'Extended On', 'Wallet']);
    this.rep().firms.forEach(f => rows.push([
      f.name, f.city || '', f.planName || '', f.status, String(f.branches), String(f.staff),
      f.planEnds || '', f.extendedOn || '', String(f.walletBalance)
    ]));
    const csv = rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `firms-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  exportPdf() {
    const s = this.rep().summary;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.setTextColor(92, 26, 139);
    doc.text('Firms Report — Namokara', 14, 16);
    doc.setFontSize(9); doc.setTextColor(80);
    doc.text(`Total: ${s.total}  Active: ${s.active}  Trial: ${s.trial}  Grace: ${s.grace}  Suspended: ${s.suspended}  Extended: ${s.extended}`, 14, 23);
    doc.text(new Date().toLocaleString('en-IN'), 14, 28);
    autoTable(doc, {
      startY: 33,
      head: [['Firm', 'Plan', 'Status', 'Branches', 'Staff', 'Plan Ends', 'Extended On', 'Wallet']],
      body: this.rep().firms.map(f => [
        f.name + (f.city ? ` (${f.city})` : ''), f.planName || '-', f.status,
        String(f.branches), String(f.staff), f.planEnds || '-', f.extendedOn || '-', '₹' + f.walletBalance
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [27, 46, 92] }
    });
    doc.save(`firms-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  printReport() {
    const s = this.rep().summary;
    const rowsHtml = this.rep().firms.map(f => `
      <tr>
        <td>${f.name}<br><small>${f.city || ''}</small></td>
        <td>${f.planName || '—'}</td>
        <td>${f.status}</td>
        <td style="text-align:right">${f.branches}</td>
        <td style="text-align:right">${f.staff}</td>
        <td>${f.planEnds || '—'}</td>
        <td>${f.extendedOn || '—'}</td>
        <td style="text-align:right">₹${f.walletBalance}</td>
      </tr>`).join('');
    const html = `
      <html><head><title>Firms Report</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;color:#222}
        h2{color:#5c1a8b;margin:0 0 4px}
        .sum{margin:8px 0 16px;font-size:13px;color:#444}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{background:#1B2E5C;color:#fff;text-align:left;padding:6px 8px}
        td{border-bottom:1px solid #ddd;padding:6px 8px}
        small{color:#888}
      </style></head><body>
      <h2>📈 Firms Report — Namokara</h2>
      <div class="sum">Total: ${s.total} · Active: ${s.active} · Trial: ${s.trial} · Grace: ${s.grace} · Suspended: ${s.suspended} · Extended: ${s.extended} &nbsp;|&nbsp; ${new Date().toLocaleString('en-IN')}</div>
      <table><thead><tr><th>Firm</th><th>Plan</th><th>Status</th><th style="text-align:right">Branches</th><th style="text-align:right">Staff</th><th>Plan Ends</th><th>Extended On</th><th style="text-align:right">Wallet</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Print window block ho gaya — popup allow karein.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  statusCls(s: string) {
    const map: any = {
      active: 'bg-green-100 text-green-700', trial: 'bg-yellow-100 text-yellow-700',
      grace_period: 'bg-orange-100 text-orange-700', suspended: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-200 text-gray-600'
    };
    return `px-2 py-0.5 rounded-full text-xs font-semibold ${map[s] || 'bg-gray-100 text-gray-600'}`;
  }
}
