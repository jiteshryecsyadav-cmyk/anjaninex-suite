import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface IncentiveRow {
  buyer: string; taxable: number; incentivePct: number; incentive: number;
  balDiscPct: number; capAmount: number; capped: boolean; rawIncentive: number;
}

@Component({
  selector: 'app-incentive-report',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
  <div style="padding:16px">
    <h2 style="font-weight:800;color:#1B2E5C;font-size:20px;margin-bottom:2px">🎁 Buyer Incentive Report</h2>
    <p style="color:#6B7280;font-size:13px;margin-bottom:14px">Buyer ke saal ke total taxable amt par incentive% ka hissa. Date range chuno (default: FY).<br>
      <span style="color:#B45309;font-weight:600">Cap: Sales Disc + Incentive ≤ Purchase Disc</span> — incentive bache hue disc (purchase − sales) se zyada nahi diya jata.</p>

    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:14px">
      <div><label style="font-size:11px;color:#6B7280;display:block">FROM</label>
        <input type="date" [(ngModel)]="from" class="ip"></div>
      <div><label style="font-size:11px;color:#6B7280;display:block">TO</label>
        <input type="date" [(ngModel)]="to" class="ip"></div>
      <button (click)="load()" style="background:#7C3AED;color:#fff;font-weight:700;border:none;border-radius:8px;padding:9px 18px;cursor:pointer">Dekho</button>
      <button (click)="print()" style="background:#fff;border:1px solid #D6DDEA;border-radius:8px;padding:9px 14px;cursor:pointer">🖨 Print</button>
    </div>

    @if (loading()) { <p>Loading…</p> }
    @else if (rows().length === 0) { <p style="color:#9CA3AF">Is period me koi incentive-buyer nahi mila (buyer master me Incentive % daalo).</p> }
    @else {
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#F3F0FA;text-align:left">
            <th style="padding:8px">BUYER</th>
            <th style="padding:8px;text-align:right">TOTAL TAXABLE AMT</th>
            <th style="padding:8px;text-align:right">INCENTIVE %</th>
            <th style="padding:8px;text-align:right" title="Purchase Disc − Sales Disc (bacha hua)">BAL DISC %</th>
            <th style="padding:8px;text-align:right" title="Isse zyada incentive nahi de sakte">CAP (₹)</th>
            <th style="padding:8px;text-align:right">INCENTIVE AMT</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track $index) {
            <tr style="border-bottom:1px solid #EEF1F6" [style.background]="r.capped ? '#FEF3C7' : ''">
              <td style="padding:8px">{{ r.buyer }}</td>
              <td style="padding:8px;text-align:right">{{ r.taxable | number:'1.2-2' }}</td>
              <td style="padding:8px;text-align:right">{{ r.incentivePct | number:'1.0-2' }}%</td>
              <td style="padding:8px;text-align:right;color:#7C3AED">{{ r.balDiscPct | number:'1.0-2' }}%</td>
              <td style="padding:8px;text-align:right;color:#6B7280">{{ r.capAmount | number:'1.2-2' }}</td>
              <td style="padding:8px;text-align:right;font-weight:700;color:#7C3AED">
                {{ r.incentive | number:'1.2-2' }}
                @if (r.capped) {
                  <div style="font-size:10px;font-weight:700;color:#B45309" title="Cap laga — bal disc se zyada nahi de sakte">
                    ⚠ CAPPED (raw {{ r.rawIncentive | number:'1.2-2' }})
                  </div>
                }
              </td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr style="background:#1B2E5C;color:#fff;font-weight:800">
            <td style="padding:9px">TOTAL ({{ rows().length }} buyers)</td>
            <td style="padding:9px;text-align:right">{{ totalTaxable() | number:'1.2-2' }}</td>
            <td></td>
            <td></td>
            <td></td>
            <td style="padding:9px;text-align:right">{{ totalIncentive() | number:'1.2-2' }}</td>
          </tr>
        </tfoot>
      </table>
      </div>
      @if (cappedCount() > 0) {
        <div style="margin-top:10px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 12px;font-size:12px;color:#92400E;font-weight:600">
          ⚠ {{ cappedCount() }} buyer ka incentive CAP hua hai — hisaab se ₹{{ totalRawIncentive() | number:'1.2-2' }} banta tha,
          par bache hue disc ki limit ki wajah se ₹{{ totalIncentive() | number:'1.2-2' }} hi de sakte ho
          (₹{{ (totalRawIncentive() - totalIncentive()) | number:'1.2-2' }} kam).
          In buyers ka incentive% kam karo ya supplier se purchase disc% badhwao.
        </div>
      }
    }
  </div>
  `,
  styles: [`.ip{border:1px solid #D6DDEA;border-radius:8px;padding:8px;font-size:13px}`]
})
export class IncentiveReportComponent implements OnInit {
  private base = `${environment.apiUrl}/api/trading/reports/incentive`;
  from = ''; to = '';
  rows = signal<IncentiveRow[]>([]);
  totalTaxable = signal(0);
  totalIncentive = signal(0);
  totalRawIncentive = signal(0);
  cappedCount = signal(0);
  loading = signal(false);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    // Default = current financial year (Apr 1 → today)
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    this.from = `${y}-04-01`;
    this.to = now.toISOString().slice(0, 10);
    this.load();
  }

  async load() {
    if (!this.from || !this.to) return;
    this.loading.set(true);
    try {
      const res: any = await firstValueFrom(this.http.get(this.base, { params: { from: this.from, to: this.to } }));
      this.rows.set(res.rows || []);
      this.totalTaxable.set(res.totalTaxable || 0);
      this.totalIncentive.set(res.totalIncentive || 0);
      this.totalRawIncentive.set(res.totalRawIncentive || 0);
      this.cappedCount.set(res.cappedCount || 0);
    } catch { this.rows.set([]); }
    this.loading.set(false);
  }

  print() { window.print(); }
}
