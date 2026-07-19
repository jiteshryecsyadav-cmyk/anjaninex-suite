import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface SubAgentRow {
  supplier: string; buyer: string; supplierBillNo?: string; billNo: string;
  billDate: string; taxable: number; subAgent?: string; subAgentPct: number; share: number;
}

import { BackButtonComponent } from '../../../shared/back-button.component';
@Component({
  selector: 'app-sub-agent-report',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
  <div style="padding:16px">
    <h2 style="font-weight:800;color:#1B2E5C;font-size:20px;margin-bottom:2px">🧾 Sub-Agent Report</h2>
    <p style="color:#6B7280;font-size:13px;margin-bottom:14px">Buyer ke sub-agent ka bill-wise hissa (taxable × sub-agent%). Date range chuno.</p>

    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:14px">
      <div><label style="font-size:11px;color:#6B7280;display:block">FROM</label>
        <input type="date" [(ngModel)]="from" class="ip"></div>
      <div><label style="font-size:11px;color:#6B7280;display:block">TO</label>
        <input type="date" [(ngModel)]="to" class="ip"></div>
      <div><label style="font-size:11px;color:#6B7280;display:block">SUB-AGENT (optional)</label>
        <input [(ngModel)]="subAgent" placeholder="Naam" class="ip"></div>
      <button (click)="load()" style="background:#7C3AED;color:#fff;font-weight:700;border:none;border-radius:8px;padding:9px 18px;cursor:pointer">Dekho</button>
      <button (click)="print()" style="background:#fff;border:1px solid #D6DDEA;border-radius:8px;padding:9px 14px;cursor:pointer">🖨 Print</button>
    </div>

    @if (loading()) { <p>Loading…</p> }
    @else if (rows().length === 0) { <p style="color:#9CA3AF">Is period me koi sub-agent bill nahi mila.</p> }
    @else {
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#F3F0FA;text-align:left">
            <th style="padding:8px">SUPPLIER</th><th style="padding:8px">BUYER</th>
            <th style="padding:8px">SUPP. BILL NO</th><th style="padding:8px">BILL DATE</th>
            <th style="padding:8px;text-align:right">TAXABLE AMT</th>
            <th style="padding:8px">SUB-AGENT</th>
            <th style="padding:8px;text-align:right">SUB %</th>
            <th style="padding:8px;text-align:right">SUB COMMISSION</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track $index) {
            <tr style="border-bottom:1px solid #EEF1F6">
              <td style="padding:8px">{{ r.supplier }}</td>
              <td style="padding:8px">{{ r.buyer }}</td>
              <td style="padding:8px">{{ r.supplierBillNo || r.billNo }}</td>
              <td style="padding:8px">{{ r.billDate | date:'dd/MM/yy' }}</td>
              <td style="padding:8px;text-align:right">{{ r.taxable | number:'1.2-2' }}</td>
              <td style="padding:8px">{{ r.subAgent }}</td>
              <td style="padding:8px;text-align:right">{{ r.subAgentPct | number:'1.0-2' }}%</td>
              <td style="padding:8px;text-align:right;font-weight:700;color:#7C3AED">{{ r.share | number:'1.2-2' }}</td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr style="background:#1B2E5C;color:#fff;font-weight:800">
            <td style="padding:9px" colspan="4">TOTAL ({{ rows().length }} bills)</td>
            <td style="padding:9px;text-align:right">{{ totalTaxable() | number:'1.2-2' }}</td>
            <td></td><td></td>
            <td style="padding:9px;text-align:right">{{ totalShare() | number:'1.2-2' }}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    }
  </div>
  `,
  styles: [`.ip{border:1px solid #D6DDEA;border-radius:8px;padding:8px;font-size:13px}`]
})
export class SubAgentReportComponent implements OnInit {
  private base = `${environment.apiUrl}/api/trading/reports/sub-agent`;
  from = ''; to = ''; subAgent = '';
  rows = signal<SubAgentRow[]>([]);
  totalTaxable = signal(0);
  totalShare = signal(0);
  loading = signal(false);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    const now = new Date();
    this.to = now.toISOString().slice(0, 10);
    this.from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    this.load();
  }

  async load() {
    if (!this.from || !this.to) return;
    this.loading.set(true);
    try {
      const params: any = { from: this.from, to: this.to };
      if (this.subAgent.trim()) params.subAgent = this.subAgent.trim();
      const res: any = await firstValueFrom(this.http.get(this.base, { params }));
      this.rows.set(res.rows || []);
      this.totalTaxable.set(res.totalTaxable || 0);
      this.totalShare.set(res.totalShare || 0);
    } catch { this.rows.set([]); }
    this.loading.set(false);
  }

  print() { window.print(); }
}
