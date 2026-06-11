import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService, Plan } from '../services/admin.service';
import { amountInWords } from '../../../shared/amount-in-words.util';

/**
 * Break-even + Profit Calculator (Anjaninex platform owner ke liye).
 * - Plans live admin API se aate hain (price + abhi kitne firms subscribed)
 * - Har plan ka per-firm variable cost editable; fixed monthly cost editable
 * - "Firms count" daalo → margin, break-even, monthly + annual profit live
 */
@Component({
  selector: 'app-admin-roi-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, RouterLink],
  template: `
  <div class="max-w-6xl mx-auto p-4">
    <a routerLink="/admin/dashboard" class="text-sm text-[#5c1a8b] hover:underline">← Admin Dashboard</a>
    <h2 class="font-black text-2xl text-[#1B2E5C] mt-2 mb-1">📊 Break-even & Profit Calculator</h2>
    <p class="text-sm text-gray-500 mb-4">Firms count daalo — break-even aur profit live dikhega. (Estimate — apni asli cost dalo)</p>

    <!-- Fixed cost — alag-alag -->
    <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-end gap-4">
      <div>
        <label class="lbl">SERVER 1 — PRIMARY (₹/mo)</label>
        <input type="number" [(ngModel)]="serverPrimary" class="ip w-36">
        <div class="hint">Main app + DB server (Hostinger VPS).</div>
      </div>
      <div>
        <label class="lbl">SERVER 2 — BACKUP ONLY (₹/mo)</label>
        <input type="number" [(ngModel)]="serverBackup" class="ip w-36">
        <div class="hint">Sirf backup/standby server.</div>
      </div>
      <div>
        <label class="lbl">ADMINISTRATION (₹/mo)</label>
        <input type="number" [(ngModel)]="adminCost" class="ip w-36">
        <div class="hint">Staff/support, domain, tools, misc.</div>
      </div>
      <div>
        <label class="lbl">TOTAL FIXED COST</label>
        <div class="ip w-36 bg-gray-50 font-bold text-[#1B2E5C]">₹ {{ fixedCost() | number:'1.0-0' }}</div>
        <div class="hint">Server1 + Server2 + Admin.</div>
      </div>
      <div class="flex-1"></div>
      <div class="text-right">
        <div class="text-xs text-gray-500 uppercase font-bold">Break-even (mixed)</div>
        <div class="text-2xl font-black" [class.text-green-600]="totalFirms() >= breakevenFirms()" [class.text-red-600]="totalFirms() < breakevenFirms()">
          {{ breakevenFirms() }} firms
        </div>
        <div class="text-xs text-gray-500">abhi: {{ totalFirms() }} firms ({{ totalFirms() >= breakevenFirms() ? 'profit me ✅' : 'break-even se niche' }})</div>
      </div>
    </div>

    @if (loading()) {
      <div class="p-8 text-center text-gray-500">Loading plans…</div>
    } @else {
      <!-- Per-plan rows -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <table class="w-full text-sm">
          <thead class="bg-[#1B2E5C] text-white uppercase text-xs">
            <tr>
              <th class="px-3 py-3 text-left">PLAN</th>
              <th class="px-3 py-3 text-right">PRICE/MO (₹)</th>
              <th class="px-3 py-3 text-right">COST/FIRM (₹)<br><small>editable</small></th>
              <th class="px-3 py-3 text-right">MARGIN/FIRM</th>
              <th class="px-3 py-3 text-center">FIRMS<br><small>editable</small></th>
              <th class="px-3 py-3 text-right">PLAN MARGIN/MO</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.code) {
              <tr class="border-t hover:bg-[#FAF7F0]">
                <td class="px-3 py-3 font-bold text-[#1B2E5C]">{{ r.name }}</td>
                <td class="px-3 py-3 text-right font-mono">{{ r.priceMo | number:'1.0-0' }}</td>
                <td class="px-3 py-3 text-right">
                  <input type="number" [(ngModel)]="r.cost" class="ip w-24 text-right">
                </td>
                <td class="px-3 py-3 text-right font-mono font-bold"
                    [class.text-green-600]="(r.priceMo - r.cost) > 0" [class.text-red-600]="(r.priceMo - r.cost) <= 0">
                  {{ (r.priceMo - r.cost) | number:'1.0-0' }}
                </td>
                <td class="px-3 py-3 text-center">
                  <input type="number" min="0" [(ngModel)]="r.firms" class="ip w-20 text-center">
                </td>
                <td class="px-3 py-3 text-right font-mono font-bold">{{ ((r.priceMo - r.cost) * r.firms) | number:'1.0-0' }}</td>
              </tr>
            }
          </tbody>
          <tfoot class="bg-gray-50 font-bold">
            <tr>
              <td class="px-3 py-3" colspan="4">TOTAL — {{ totalFirms() }} firms</td>
              <td class="px-3 py-3 text-center">{{ totalFirms() }}</td>
              <td class="px-3 py-3 text-right font-mono">₹ {{ totalMargin() | number:'1.0-0' }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Profit summary cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card-stat">
          <div class="cs-lbl">TOTAL MARGIN / MO</div>
          <div class="cs-val">₹ {{ totalMargin() | number:'1.0-0' }}</div>
          <div class="cs-words">{{ inWords(totalMargin()) }}</div>
        </div>
        <div class="card-stat">
          <div class="cs-lbl">− FIXED COST</div>
          <div class="cs-val text-orange-600">₹ {{ fixedCost() | number:'1.0-0' }}</div>
          <div class="cs-words">Server1 ₹{{ serverPrimary || 0 }} + Server2 ₹{{ serverBackup || 0 }} + Admin ₹{{ adminCost || 0 }}</div>
        </div>
        <div class="card-stat" [class.profit]="monthlyProfit() >= 0" [class.loss]="monthlyProfit() < 0">
          <div class="cs-lbl">MONTHLY PROFIT</div>
          <div class="cs-val">₹ {{ monthlyProfit() | number:'1.0-0' }}</div>
          <div class="cs-words">{{ inWords(monthlyProfit()) }}</div>
        </div>
        <div class="card-stat" [class.profit]="monthlyProfit() >= 0" [class.loss]="monthlyProfit() < 0">
          <div class="cs-lbl">ANNUAL PROFIT</div>
          <div class="cs-val">₹ {{ (monthlyProfit() * 12) | number:'1.0-0' }}</div>
          <div class="cs-words">{{ inWords(monthlyProfit() * 12) }}</div>
        </div>
      </div>

      <p class="text-xs text-gray-400 mt-4">
        💡 Break-even = Fixed cost ÷ avg margin per firm. Profit = (sab plans ka margin) − fixed cost.
        AI cost firm ki apni key (BYOK) se ho to "Cost/firm" me sirf infra+support rakho.
        Ye estimate hai — accounting advice nahi.
      </p>
    }
  </div>
  `,
  styles: [`
    .lbl { display:block; font-size:10px; font-weight:800; color:#6b7280; text-transform:uppercase; margin-bottom:4px; }
    .ip { border:1px solid #d1d5db; border-radius:8px; padding:7px 10px; font-size:13px; font-family:'JetBrains Mono',monospace; }
    .hint { font-size:10px; color:#9ca3af; margin-top:3px; }
    .card-stat { background:#fff; border:1px solid #f0e6ff; border-left:4px solid #5c1a8b; border-radius:12px; padding:14px 16px; }
    .card-stat.profit { border-left-color:#16a34a; }
    .card-stat.loss { border-left-color:#dc2626; }
    .cs-lbl { font-size:10px; font-weight:800; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; }
    .cs-val { font-size:22px; font-weight:900; color:#1B2E5C; font-family:'JetBrains Mono',monospace; margin-top:2px; }
    .cs-words { font-size:10px; color:#6b7280; font-style:italic; margin-top:4px; line-height:1.3; }
    .profit .cs-val { color:#15803d; }
    .loss .cs-val { color:#b91c1c; }

    /* ===== MOBILE (<=640px) ===== */
    @media (max-width: 640px) {
      table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
      .ip { width: 100% !important; }
      .grid-cols-2 { grid-template-columns: 1fr !important; }
    }
  `]
})
export class AdminRoiCalculatorComponent {
  private svc = inject(AdminService);
  loading = signal(true);

  // Fixed cost ab 3 hisso me — Primary server + Backup server + Administration
  serverPrimary = 2000;   // main app + DB server
  serverBackup  = 1000;   // sirf backup/standby server
  adminCost     = 0;      // staff/support, domain, tools, misc

  /** Total fixed cost = teeno ka jod. (method — plain-prop change har CD par pakde) */
  fixedCost(): number {
    return (+this.serverPrimary || 0) + (+this.serverBackup || 0) + (+this.adminCost || 0);
  }

  // Default per-firm variable cost (infra + support; AI BYOK maan ke)
  private defaultCost: Record<string, number> = { starter: 120, pro: 350, enterprise: 1200, trial: 0 };

  rows = signal<{ code: string; name: string; priceMo: number; cost: number; firms: number }[]>([]);

  ngOnInit() {
    this.svc.listPlans().subscribe({
      next: (plans: Plan[]) => {
        this.rows.set(plans
          .filter(p => (p.monthlyInr || p.annualInr || 0) > 0)   // free trial chhodo
          .map(p => ({
            code: p.code,
            name: p.name,
            // effective monthly = monthly hai to wahi, warna annual/12
            priceMo: p.monthlyInr || Math.round((p.annualInr || 0) / 12),
            cost: this.defaultCost[p.code] ?? 200,
            firms: p.firmCount || 0
          })));
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  // NOTE: plain methods (computed nahi) — kyunki input me r.firms/r.cost deep-mutate
  // hote hain aur signal computed deep change nahi pakadta. Methods har CD par fresh chalti hain.
  totalFirms(): number { return this.rows().reduce((s, r) => s + (+r.firms || 0), 0); }
  totalMargin(): number { return this.rows().reduce((s, r) => s + ((+r.priceMo || 0) - (+r.cost || 0)) * (+r.firms || 0), 0); }
  monthlyProfit(): number { return this.totalMargin() - this.fixedCost(); }

  // Break-even firms = fixed cost ÷ average margin per firm (current mix)
  // Amount → words (negative ho to "Minus ..." lagao)
  inWords(n: number): string {
    const v = Math.round(Math.abs(n || 0));
    if (v === 0) return 'Zero Rupees';
    return (n < 0 ? 'Minus ' : '') + amountInWords(v);
  }

  breakevenFirms(): number {
    const rs = this.rows();
    const totalF = this.totalFirms();
    const avgMargin = totalF > 0
      ? this.totalMargin() / totalF
      : (rs.length ? rs.reduce((s, r) => s + ((+r.priceMo || 0) - (+r.cost || 0)), 0) / rs.length : 0);
    if (avgMargin <= 0) return 0;
    return Math.ceil(this.fixedCost() / avgMargin);
  }
}
