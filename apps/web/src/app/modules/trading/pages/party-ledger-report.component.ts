import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface LedgerRow {
  date: string; kind: string; ref: string; voucherNo?: string;
  debit: number; credit: number; balance: number; remark?: string;
}
interface PartyOpt { id: string; displayName: string; city?: string; phone?: string; groupName?: string; partyType?: string; }

import { BackButtonComponent } from '../../../shared/back-button.component';
@Component({
  selector: 'app-party-ledger-report',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
  <div style="padding:16px">
    <h2 style="font-weight:800;color:#1B2E5C;font-size:20px;margin-bottom:2px">📒 Party Ledger</h2>
    <p style="color:#6B7280;font-size:13px;margin-bottom:14px">Opening balance + Sales (Debit) aur Receipts (Credit) date-wise, running balance ke saath.</p>

    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:12px">
      <div><label style="font-size:11px;color:#6B7280;display:block">GROUP</label>
        <select [ngModel]="groupSel()" (ngModelChange)="groupSel.set($event); onGroupChange()"
                class="ip" style="min-width:170px">
          <option value="">— Sab —</option>
          @for (g of groups(); track g) { <option [value]="g">{{ g }}</option> }
        </select>
      </div>
      <div><label style="font-size:11px;color:#6B7280;display:block">PARTY</label>
        <input [(ngModel)]="partySearch" list="plList" placeholder="Naam type karo" class="ip" style="min-width:230px"
               (change)="pickParty()">
        <datalist id="plList">
          @for (p of partyOptions(); track p.id) { <option [value]="p.displayName"></option> }
        </datalist>
      </div>
      <div><label style="font-size:11px;color:#6B7280;display:block">SUPPLIER</label>
        <input [(ngModel)]="supplierSearch" list="slList" placeholder="Sab suppliers" class="ip" style="min-width:200px"
               (change)="pickSupplier()">
        <datalist id="slList">
          @for (s of suppliers(); track s.id) { <option [value]="s.displayName"></option> }
        </datalist>
      </div>
      <div><label style="font-size:11px;color:#6B7280;display:block">FROM</label>
        <input type="date" [(ngModel)]="from" class="ip"></div>
      <div><label style="font-size:11px;color:#6B7280;display:block">TO</label>
        <input type="date" [(ngModel)]="to" class="ip"></div>
      <button (click)="load()" style="background:#7C3AED;color:#fff;font-weight:700;border:none;border-radius:8px;padding:9px 18px;cursor:pointer">Dekho</button>
      <button (click)="print()" style="background:#fff;border:1px solid #D6DDEA;border-radius:8px;padding:9px 14px;cursor:pointer">🖨 Print</button>
    </div>

    @if (selected(); as p) {
      <div style="background:#F3F0FA;border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:10px">
        <b style="color:#1B2E5C">{{ p.displayName }}</b>
        @if (p.groupName) { <span> · GROUP: {{ p.groupName }}</span> }
        @if (p.city) { <span> · CITY: {{ p.city }}</span> }
        @if (p.phone) { <span> · PH: {{ p.phone }}</span> }
        @if (supplierId) { <span> · SUPPLIER: {{ supplierSearch }}</span> }
        <span> · PERIOD: {{ from }} → {{ to }}</span>
      </div>
    } @else if (groupSel()) {
      <div style="background:#F3F0FA;border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:10px">
        <b style="color:#1B2E5C">GROUP: {{ groupSel() }}</b>
        <span> · {{ partyOptions().length }} firms ka joda hua khata</span>
        @if (supplierId) { <span> · SUPPLIER: {{ supplierSearch }}</span> }
        <span> · PERIOD: {{ from }} → {{ to }}</span>
      </div>
    }

    @if (loading()) { <p>Loading…</p> }
    @else if (!partyId) { <p style="color:#9CA3AF">Pehle party chuno.</p> }
    @else {
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#F3F0FA;text-align:left">
            <th style="padding:8px">DATE</th><th style="padding:8px">TYPE</th>
            <th style="padding:8px">BILL / REF</th><th style="padding:8px">V.NO</th>
            <th style="padding:8px;text-align:right">DEBIT</th>
            <th style="padding:8px;text-align:right">CREDIT</th>
            <th style="padding:8px;text-align:right">BALANCE</th>
            <th style="padding:8px">REMARK</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#FFF7E6;font-weight:700">
            <td style="padding:8px" colspan="6">OPENING BALANCE (bal. brought forward)</td>
            <td style="padding:8px;text-align:right">{{ fmtBal(opening()) }}</td>
            <td></td>
          </tr>
          @for (r of rows(); track $index) {
            <tr style="border-bottom:1px solid #EEF1F6">
              <td style="padding:8px">{{ r.date | date:'dd/MM/yy' }}</td>
              <td style="padding:8px"><span [style.color]="r.debit > 0 ? '#1B2E5C' : '#059669'" style="font-weight:700;font-size:11px">{{ r.kind }}</span></td>
              <td style="padding:8px">{{ r.ref }}</td>
              <td style="padding:8px">{{ r.voucherNo }}</td>
              <td style="padding:8px;text-align:right">{{ r.debit ? (r.debit | number:'1.2-2') : '' }}</td>
              <td style="padding:8px;text-align:right;color:#059669">{{ r.credit ? (r.credit | number:'1.2-2') : '' }}</td>
              <td style="padding:8px;text-align:right;font-weight:700">{{ fmtBal(r.balance) }}</td>
              <td style="padding:8px;font-size:11px;color:#6B7280">{{ r.remark }}</td>
            </tr>
          }
          @if (rows().length === 0) {
            <tr><td colspan="8" style="padding:14px;color:#9CA3AF">Is period me koi entry nahi.</td></tr>
          }
        </tbody>
        <tfoot>
          <tr style="background:#1B2E5C;color:#fff;font-weight:800">
            <td style="padding:9px" colspan="4">TRANSACTION TOTAL ({{ rows().length }})</td>
            <td style="padding:9px;text-align:right">{{ totalDebit() | number:'1.2-2' }}</td>
            <td style="padding:9px;text-align:right">{{ totalCredit() | number:'1.2-2' }}</td>
            <td style="padding:9px;text-align:right">{{ fmtBal(closing()) }}</td>
            <td style="padding:9px;font-size:11px">CLOSING</td>
          </tr>
        </tfoot>
      </table>
      </div>
    }
  </div>
  `,
  styles: [`.ip{border:1px solid #D6DDEA;border-radius:8px;padding:8px;font-size:13px}`]
})
export class PartyLedgerReportComponent implements OnInit {
  private base = `${environment.apiUrl}/api/trading`;
  partySearch = ''; partyId = ''; from = ''; to = '';
  // SIGNAL — plain property hoti to partyOptions() computed dobara nahi chalta
  // aur group badalne par PARTY dropdown filter hi nahi hota.
  groupSel = signal('');                  // group chuno → us group ki firms ka joda khata
  supplierSearch = ''; supplierId = '';   // sirf is supplier ke saath ka len-den
  parties = signal<PartyOpt[]>([]);
  selected = signal<PartyOpt | null>(null);

  // Sab groups (parties me se unique), A-Z.
  groups = computed(() => [...new Set(
    this.parties().map(p => (p.groupName || '').trim()).filter(g => g))].sort());

  // GROUP chuna ho to PARTY dropdown me sirf usi group ki firms.
  partyOptions = computed(() => {
    const g = this.groupSel().trim();
    return g ? this.parties().filter(p => (p.groupName || '').trim() === g) : this.parties();
  });

  // SUPPLIER dropdown — sirf seller/both wali parties.
  suppliers = computed(() =>
    this.parties().filter(p => p.partyType === 'seller' || p.partyType === 'both'));
  rows = signal<LedgerRow[]>([]);
  opening = signal(0); totalDebit = signal(0); totalCredit = signal(0); closing = signal(0);
  loading = signal(false);

  constructor(private http: HttpClient) {}

  async ngOnInit() {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    this.from = `${y}-04-01`;
    this.to = now.toISOString().slice(0, 10);
    try {
      const res: any = await firstValueFrom(this.http.get(`${this.base}/parties`, { params: { size: '500' } }));
      this.parties.set(res.items || res || []);
    } catch { this.parties.set([]); }
  }

  pickParty() {
    const p = this.parties().find(x => x.displayName === this.partySearch.trim());
    if (p) { this.partyId = p.id; this.selected.set(p); this.load(); }
    else if (!this.partySearch.trim()) { this.partyId = ''; this.selected.set(null); }
  }

  // Group badla → party selection hatao (ab poore group ka khata banega jab tak
  // user us group me se koi ek firm na chun le).
  onGroupChange() {
    this.partySearch = ''; this.partyId = ''; this.selected.set(null);
    this.load();
  }

  pickSupplier() {
    const s = this.suppliers().find(x => x.displayName === this.supplierSearch.trim());
    this.supplierId = s ? s.id : '';
    if (!this.supplierSearch.trim()) this.supplierId = '';
    this.load();
  }

  async load() {
    // Party ya group — koi ek zaroori hai.
    if ((!this.partyId && !this.groupSel()) || !this.from || !this.to) { this.rows.set([]); return; }
    this.loading.set(true);
    try {
      const params: any = { from: this.from, to: this.to };
      if (this.partyId) params.partyId = this.partyId;
      else params.group = this.groupSel();
      if (this.supplierId) params.supplierId = this.supplierId;
      const res: any = await firstValueFrom(this.http.get(`${this.base}/reports/party-ledger`, { params }));
      this.rows.set(res.rows || []);
      this.opening.set(res.opening || 0);
      this.totalDebit.set(res.totalDebit || 0);
      this.totalCredit.set(res.totalCredit || 0);
      this.closing.set(res.closing || 0);
    } catch { this.rows.set([]); }
    this.loading.set(false);
  }

  // Balance ko Indian accounting style me dikhao: (+) = humein lena hai → Dr,
  // (−) = humein dena hai (supplier ka khata) → Cr. Minus sign ki jagah Dr/Cr saaf padhta hai.
  fmtBal(n: number): string {
    const v = Math.abs(n || 0);
    const s = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    if (!n) return s;
    return `${s} ${n > 0 ? 'Dr' : 'Cr'}`;
  }

  print() { window.print(); }
}
