import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

// Buyer Agent (del-credere): buyer ka agent jo payment guarantee leta hai aur
// hamari commission ka X% leta hai. Ye screen: master + earned/paid/balance + payout + ledger.
@Component({
  selector: 'app-buyer-agents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="wrap">
      <div class="head">
        <div>
          <h2>🤝 Buyer Agents <small>(payment guarantee)</small></h2>
          <p class="sub">Buyer ka agent jo payment ki guarantee leta hai — badle me hamari commission ka X% leta hai. Commission banate hi uska hissa yaha auto jud jaata hai.</p>
        </div>
        <button class="btn-primary" (click)="openAdd()">+ New Agent</button>
      </div>

      <!-- Summary cards -->
      <div class="cards">
        <div class="card"><div class="k">Agents</div><div class="v">{{ rows().length }}</div></div>
        <div class="card"><div class="k">Total Earned</div><div class="v">₹{{ totalEarned() | number:'1.0-0' }}</div></div>
        <div class="card"><div class="k">Paid</div><div class="v" style="color:#059669">₹{{ totalPaid() | number:'1.0-0' }}</div></div>
        <div class="card"><div class="k">Balance (dena hai)</div><div class="v" style="color:#DC2626">₹{{ totalBalance() | number:'1.0-0' }}</div></div>
      </div>

      @if (loading()) { <div class="empty">Loading...</div> }
      @else if (rows().length === 0) {
        <div class="empty">Abhi koi buyer agent nahi. "+ New Agent" se add karo, phir buyer master me us agent ko chuno.</div>
      } @else {
        <table class="tbl">
          <thead><tr>
            <th>Agent</th><th>Phone</th><th>City</th><th>Default %</th>
            <th class="r">Earned</th><th class="r">Paid</th><th class="r">Balance</th><th>Actions</th>
          </tr></thead>
          <tbody>
            @for (a of rows(); track a.id) {
              <tr [class.inactive]="!a.isActive">
                <td class="nm">{{ a.name }}</td>
                <td>{{ a.phone || '-' }}</td>
                <td>{{ a.city || '-' }}</td>
                <td>{{ a.defaultSharePct }}%</td>
                <td class="r">₹{{ a.earned | number:'1.0-0' }}</td>
                <td class="r" style="color:#059669">₹{{ a.paid | number:'1.0-0' }}</td>
                <td class="r" style="font-weight:700" [style.color]="a.balance > 0 ? '#DC2626' : '#059669'">₹{{ a.balance | number:'1.0-0' }}</td>
                <td class="act">
                  <button (click)="openLedger(a)">📒 Ledger</button>
                  <button (click)="openPay(a)" [disabled]="a.balance <= 0">💸 Pay</button>
                  <button (click)="openEdit(a)">✏️</button>
                  <button class="del" (click)="del(a)">🗑</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>

    <!-- Add/Edit dialog -->
    @if (showForm()) {
      <div class="ov" (click)="showForm.set(false)">
        <div class="dlg" (click)="$event.stopPropagation()">
          <h3>{{ editId() ? 'Edit' : 'New' }} Buyer Agent</h3>
          <label>Name *</label>
          <input [(ngModel)]="f.name" class="ip" placeholder="Agent ka naam">
          <div class="row2">
            <div><label>Phone</label><input [(ngModel)]="f.phone" class="ip" placeholder="98765..."></div>
            <div><label>City</label><input [(ngModel)]="f.city" class="ip" placeholder="Surat"></div>
          </div>
          <label>Default Share % <small>(hamari commission ka)</small></label>
          <input [(ngModel)]="f.defaultSharePct" type="number" step="0.01" class="ip" placeholder="e.g. 25">
          <label>Notes</label>
          <input [(ngModel)]="f.notes" class="ip">
          <label class="chk"><input type="checkbox" [(ngModel)]="f.isActive"> Active</label>
          <div class="dlg-act">
            <button class="btn-ghost" (click)="showForm.set(false)">Cancel</button>
            <button class="btn-primary" (click)="save()" [disabled]="saving()">{{ saving() ? '...' : 'Save' }}</button>
          </div>
        </div>
      </div>
    }

    <!-- Pay dialog -->
    @if (showPay()) {
      <div class="ov" (click)="showPay.set(false)">
        <div class="dlg" (click)="$event.stopPropagation()">
          <h3>💸 Pay {{ payAgent()?.name }}</h3>
          <p class="sub">Balance dena hai: <b style="color:#DC2626">₹{{ payAgent()?.balance | number:'1.0-0' }}</b></p>
          <label>Amount *</label>
          <input [(ngModel)]="pf.amount" type="number" class="ip">
          <div class="row2">
            <div><label>Date</label><input [(ngModel)]="pf.payoutDate" type="date" class="ip"></div>
            <div><label>Mode</label>
              <select [(ngModel)]="pf.mode" class="ip">
                <option value="Cash">Cash</option><option value="Cheque">Cheque</option>
                <option value="UPI">UPI</option><option value="Bank">Bank</option>
              </select>
            </div>
          </div>
          <label>Ref No</label><input [(ngModel)]="pf.refNo" class="ip">
          <label>Notes</label><input [(ngModel)]="pf.notes" class="ip">
          <div class="dlg-act">
            <button class="btn-ghost" (click)="showPay.set(false)">Cancel</button>
            <button class="btn-primary" (click)="savePay()" [disabled]="saving()">{{ saving() ? '...' : 'Save Payout' }}</button>
          </div>
        </div>
      </div>
    }

    <!-- Ledger dialog -->
    @if (showLedger()) {
      <div class="ov" (click)="showLedger.set(false)">
        <div class="dlg wide" (click)="$event.stopPropagation()">
          <h3>📒 {{ ledgerAgent()?.name }} — Ledger</h3>
          <div class="cards" style="margin:8px 0">
            <div class="card"><div class="k">Earned</div><div class="v">₹{{ led().earned | number:'1.0-0' }}</div></div>
            <div class="card"><div class="k">Paid</div><div class="v" style="color:#059669">₹{{ led().paid | number:'1.0-0' }}</div></div>
            <div class="card"><div class="k">Balance</div><div class="v" style="color:#DC2626">₹{{ led().balance | number:'1.0-0' }}</div></div>
          </div>
          <h4>Earnings (commission ka hissa)</h4>
          <table class="tbl sm">
            <thead><tr><th>Date</th><th>Ref</th><th>Buyer</th><th class="r">Gross Comm.</th><th class="r">%</th><th class="r">Share</th></tr></thead>
            <tbody>
              @for (e of led().earnings; track e.id) {
                <tr><td>{{ e.createdAt | date:'dd MMM yy' }}</td><td>{{ e.refNo || '-' }}</td><td>{{ e.buyerName || '-' }}</td>
                <td class="r">₹{{ e.grossCommission | number:'1.0-0' }}</td><td class="r">{{ e.sharePct }}%</td>
                <td class="r" style="font-weight:600">₹{{ e.shareAmount | number:'1.0-0' }}</td></tr>
              }
              @if (led().earnings.length === 0) { <tr><td colspan="6" class="c">Koi earning nahi</td></tr> }
            </tbody>
          </table>
          <h4>Payouts (humne diya)</h4>
          <table class="tbl sm">
            <thead><tr><th>Date</th><th>Mode</th><th>Ref</th><th>Notes</th><th class="r">Amount</th></tr></thead>
            <tbody>
              @for (p of led().payouts; track p.id) {
                <tr><td>{{ p.payoutDate | date:'dd MMM yy' }}</td><td>{{ p.mode || '-' }}</td><td>{{ p.refNo || '-' }}</td>
                <td>{{ p.notes || '-' }}</td><td class="r" style="color:#059669;font-weight:600">₹{{ p.amount | number:'1.0-0' }}</td></tr>
              }
              @if (led().payouts.length === 0) { <tr><td colspan="5" class="c">Koi payout nahi</td></tr> }
            </tbody>
          </table>
          <div class="dlg-act"><button class="btn-ghost" (click)="showLedger.set(false)">Close</button></div>
        </div>
      </div>
    }
  `,
  styles: [`
    .wrap { padding: 16px; max-width: 1200px; margin: 0 auto; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px; }
    h2 { margin:0; font-size:20px; } h2 small { font-size:13px; color:#8b5cf6; font-weight:500; }
    .sub { margin:4px 0 0; color:#6B7280; font-size:12.5px; max-width:640px; }
    .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px; }
    .card { background:#fff; border:1px solid #E5E7EB; border-radius:10px; padding:10px 12px; }
    .card .k { font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:.3px; }
    .card .v { font-size:19px; font-weight:700; margin-top:2px; }
    .tbl { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.06); }
    .tbl th { background:#F9FAFB; text-align:left; padding:9px 10px; font-size:11.5px; color:#6B7280; text-transform:uppercase; border-bottom:1px solid #E5E7EB; }
    .tbl td { padding:9px 10px; border-bottom:1px solid #F3F4F6; font-size:13.5px; }
    .tbl .r { text-align:right; } .tbl .c { text-align:center; color:#9CA3AF; }
    .tbl .nm { font-weight:600; }
    .tbl tr.inactive { opacity:.5; }
    .tbl.sm td, .tbl.sm th { padding:6px 8px; font-size:12.5px; }
    .act { display:flex; gap:4px; white-space:nowrap; }
    .act button { border:1px solid #E5E7EB; background:#fff; border-radius:6px; padding:3px 7px; cursor:pointer; font-size:12px; }
    .act button:disabled { opacity:.4; cursor:not-allowed; }
    .act .del:hover { background:#FEE2E2; border-color:#FCA5A5; }
    .btn-primary { background:#6d28d9; color:#fff; border:0; border-radius:8px; padding:8px 16px; cursor:pointer; font-weight:600; }
    .btn-primary:disabled { opacity:.5; }
    .btn-ghost { background:#fff; border:1px solid #E5E7EB; border-radius:8px; padding:8px 16px; cursor:pointer; }
    .empty { background:#fff; border:1px dashed #D1D5DB; border-radius:10px; padding:30px; text-align:center; color:#6B7280; }
    .ov { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:50; }
    .dlg { background:#fff; border-radius:12px; padding:20px; width:420px; max-height:90vh; overflow:auto; }
    .dlg.wide { width:760px; }
    .dlg h3 { margin:0 0 12px; } .dlg h4 { margin:14px 0 6px; font-size:13px; color:#374151; }
    .dlg label { display:block; font-size:12px; color:#374151; margin:8px 0 3px; font-weight:500; }
    .dlg label small { color:#9CA3AF; font-weight:400; }
    .ip { width:100%; box-sizing:border-box; border:1px solid #D1D5DB; border-radius:8px; padding:8px 10px; font-size:14px; }
    .row2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .chk { display:flex; align-items:center; gap:6px; margin-top:10px; }
    .dlg-act { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
  `]
})
export class BuyerAgentsComponent implements OnInit {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/trading/buyer-agents`;

  loading = signal(true);
  saving = signal(false);
  rows = signal<any[]>([]);

  totalEarned = computed(() => this.rows().reduce((s, a) => s + (a.earned || 0), 0));
  totalPaid = computed(() => this.rows().reduce((s, a) => s + (a.paid || 0), 0));
  totalBalance = computed(() => this.rows().reduce((s, a) => s + (a.balance || 0), 0));

  showForm = signal(false);
  editId = signal<string | null>(null);
  f: any = { name: '', phone: '', city: '', defaultSharePct: 0, notes: '', isActive: true };

  showPay = signal(false);
  payAgent = signal<any>(null);
  pf: any = { amount: 0, payoutDate: '', mode: 'Cash', refNo: '', notes: '' };

  showLedger = signal(false);
  ledgerAgent = signal<any>(null);
  led = signal<any>({ earnings: [], payouts: [], earned: 0, paid: 0, balance: 0 });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.http.get<any[]>(`${this.base}/summary`).subscribe({
      next: r => { this.rows.set(r || []); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  openAdd() {
    this.editId.set(null);
    this.f = { name: '', phone: '', city: '', defaultSharePct: 0, notes: '', isActive: true };
    this.showForm.set(true);
  }
  openEdit(a: any) {
    this.editId.set(a.id);
    this.f = { name: a.name, phone: a.phone || '', city: a.city || '', defaultSharePct: a.defaultSharePct || 0, notes: a.notes || '', isActive: a.isActive };
    this.showForm.set(true);
  }
  save() {
    if (!this.f.name?.trim()) { alert('Agent ka naam zaroori hai'); return; }
    this.saving.set(true);
    const body = { name: this.f.name, phone: this.f.phone || null, city: this.f.city || null,
      defaultSharePct: Number(this.f.defaultSharePct) || 0, notes: this.f.notes || null, isActive: !!this.f.isActive };
    const id = this.editId();
    const obs = id ? this.http.put(`${this.base}/${id}`, body) : this.http.post(this.base, body);
    obs.subscribe({
      next: () => { this.saving.set(false); this.showForm.set(false); this.load(); },
      error: (e) => { this.saving.set(false); alert('Failed: ' + (e?.error?.error ?? 'unknown')); }
    });
  }
  del(a: any) {
    if (!confirm(`Delete agent "${a.name}"?`)) return;
    this.http.delete(`${this.base}/${a.id}`).subscribe({ next: () => this.load(), error: () => this.load() });
  }

  openPay(a: any) {
    this.payAgent.set(a);
    this.pf = { amount: a.balance > 0 ? a.balance : 0, payoutDate: new Date().toISOString().slice(0, 10), mode: 'Cash', refNo: '', notes: '' };
    this.showPay.set(true);
  }
  savePay() {
    const a = this.payAgent();
    if (!a || !(Number(this.pf.amount) > 0)) { alert('Amount daalo'); return; }
    this.saving.set(true);
    const body = { buyerAgentId: a.id, payoutDate: this.pf.payoutDate || null, amount: Number(this.pf.amount),
      mode: this.pf.mode, refNo: this.pf.refNo || null, notes: this.pf.notes || null };
    this.http.post(`${this.base}/payout`, body).subscribe({
      next: () => { this.saving.set(false); this.showPay.set(false); this.load(); },
      error: (e) => { this.saving.set(false); alert('Failed: ' + (e?.error?.error ?? 'unknown')); }
    });
  }

  openLedger(a: any) {
    this.ledgerAgent.set(a);
    this.led.set({ earnings: [], payouts: [], earned: 0, paid: 0, balance: 0 });
    this.showLedger.set(true);
    this.http.get<any>(`${this.base}/${a.id}/ledger`).subscribe({
      next: d => this.led.set(d), error: () => {}
    });
  }
}
