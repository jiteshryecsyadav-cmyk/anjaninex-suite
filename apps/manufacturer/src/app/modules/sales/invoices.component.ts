import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { todayStr, monthStartStr } from '../../core/date.util';

interface BillRow {
  id: string; billNo: string; billDate: string;
  partyId: string; partyName: string; partyGst: string | null;
  total: number; paidAmount?: number; status: string;
  taxAmount?: number; lrNo?: string | null;
}
interface PendingDc {
  id: string; dcNo: string; challanDate: string;
  partyId: string; partyName: string;
  lrNo: string | null; vehicleNo: string | null; packages: number | null;
  totalQty: number; totalAmount: number; lineCount: number;
}

/**
 * Tax Invoice — pakka bill.
 *
 * Bill challan se banta hai, na ki naye sire se. Ek grahak ke kai challan ek
 * hi bill me jud sakte hain (mahine ka bill) — isliye challan chunne wali
 * list tick-box wali hai.
 *
 * Stock yahan nahi hilta — wo challan par pehle hi ghat chuka.
 */
@Component({
  selector: 'mfg-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-top-bar">
      <input class="input max-w-[220px]" type="date" [(ngModel)]="from" (ngModelChange)="load()">
      <input class="input max-w-[220px]" type="date" [(ngModel)]="to" (ngModelChange)="load()">
      @if (auth.can('sales.invoice.create.place')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ BILL BANAO</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    <!-- Bill baki wale challan — sabse pehle yahi dikhna chahiye -->
    @if (waiting().length > 0) {
      <div class="card mb-3 border-l-4 border-amber-400">
        <div class="text-sm font-bold text-amber-800">
          🧾 {{ waiting().length }} challan ka bill abhi nahi bana
          <span class="text-slate-500 font-semibold">
            — ₹{{ waitingAmt() | number:'1.0-0' }} ka maal ja chuka</span>
        </div>
      </div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Is samay ka koi bill nahi</div>
    } @else {
      <div class="space-y-2">
        @for (b of rows(); track b.id) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-emerald-50 grid place-items-center text-xl">🧮</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">
                  {{ b.billNo }}
                  <span class="chip ml-1"
                        [class]="b.status === 'paid' ? 'bg-emerald-50 text-emerald-700'
                               : b.status === 'partial' ? 'bg-amber-50 text-amber-700'
                               : b.status === 'overdue' ? 'bg-rose-50 text-rose-700'
                               : 'bg-sky-50 text-sky-700'">
                    {{ statusLabel(b.status) }}
                  </span>
                </div>
                <div class="text-xs text-slate-500">{{ b.partyName }}</div>
                <div class="text-xs text-slate-500">
                  {{ b.billDate | date:'d MMM y' }}
                  @if (b.partyGst) { · {{ b.partyGst }} }
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div class="font-bold text-anjaninex-navy text-sm">₹{{ b.total | number:'1.0-0' }}</div>
                @if (b.taxAmount) { <div class="text-slate-500">GST ₹{{ b.taxAmount | number:'1.0-0' }}</div> }
                @if (baki(b) > 0) {
                  <div class="text-anjaninex-red font-bold">₹{{ baki(b) | number:'1.0-0' }} bakaya</div>
                }
              </div>
            </div>

            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openDetail(b)">DEKHO</button>
              @if (auth.can('sales.invoice.delete.place')) {
                <button class="text-[11px] font-bold text-anjaninex-red" (click)="remove(b)">HATAO</button>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- ══ NAYA BILL ══ -->
    @if (form(); as f) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="form.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">Tax Invoice banao</h3>
          <p class="text-xs text-gray-500 mb-3">
            Challan chuniye — ek grahak ke kai challan ek hi bill me jud sakte hain
          </p>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="col-span-2"><label class="label" style="color:#DC2626">Customer *</label>
              <select class="input" [(ngModel)]="f.partyId" (ngModelChange)="partyBadli()">
                <option [ngValue]="null">— chuniye —</option>
                @for (c of customers(); track c.id) { <option [ngValue]="c.id">{{ c.displayName }}</option> }
              </select></div>
            <div><label class="label">Bill ki tareekh</label>
              <input class="input" type="date" [(ngModel)]="f.billDate"></div>
          </div>

          <!-- ── CHALLAN CHUNO ── -->
          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Kaunse challan ka bill</div>
          @if (!f.partyId) {
            <p class="text-xs text-slate-400 mb-4">Pehle customer chuniye</p>
          } @else if (dcs().length === 0) {
            <p class="text-xs text-slate-400 mb-4">
              Is customer ke sab challan ka bill ban chuka hai
            </p>
          } @else {
            <div class="border border-[color:var(--ax-border)] rounded-xl overflow-hidden mb-2">
              @for (d of dcs(); track d.id) {
                <label class="flex items-center gap-3 px-3 py-2 border-b last:border-b-0
                              border-[color:var(--ax-border)] cursor-pointer hover:bg-slate-50"
                       [class.bg-sky-50]="chuna[d.id]">
                  <input type="checkbox" [(ngModel)]="chuna[d.id]"
                         [ngModelOptions]="{standalone:true}" (ngModelChange)="touch()">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-bold">{{ d.dcNo }}
                      <span class="text-xs text-slate-500 font-semibold">
                        {{ d.challanDate | date:'d MMM' }}</span></div>
                    <div class="text-[11px] text-slate-500">
                      {{ d.lineCount }} line · {{ d.totalQty | number:'1.0-2' }} pcs
                      @if (d.packages) { · {{ d.packages }} gathar }
                      @if (d.lrNo) { · LR {{ d.lrNo }} }
                    </div>
                  </div>
                  <div class="text-sm font-bold text-anjaninex-navy">
                    ₹{{ d.totalAmount | number:'1.0-0' }}</div>
                </label>
              }
            </div>
            <p class="text-xs font-bold text-anjaninex-navy mb-4">
              {{ kitneChune() }} challan chune · ₹{{ chuneKaMol() | number:'1.0-0' }} (GST se pehle)
            </p>
          }

          <div class="grid grid-cols-3 gap-3 mb-4">
            <div><label class="label">Discount ₹</label>
              <input class="input" type="number" step="0.01" [(ngModel)]="f.discount"></div>
            <div><label class="label">Anya kharcha ₹</label>
              <input class="input" type="number" step="0.01" [(ngModel)]="f.otherCharges">
              <p class="text-[10.5px] text-gray-500 mt-1">Packing, bhada waghera</p></div>
            <div><label class="label">Round off ₹</label>
              <input class="input" type="number" step="0.01" [(ngModel)]="f.roundOff"></div>

            <div><label class="label">E-Way bill no.</label>
              <input class="input" [(ngModel)]="f.ewayBillNo"></div>
            <div><label class="label">E-Way tareekh</label>
              <input class="input" type="date" [(ngModel)]="f.ewayBillDate"></div>
            <div><label class="label">LR / builty no.</label>
              <input class="input" [(ngModel)]="f.lrNo"></div>

            <div class="col-span-2"><label class="label">Grahak ka PO number</label>
              <input class="input" [(ngModel)]="f.poNumber"></div>
            <div><label class="label">Note</label>
              <input class="input" [(ngModel)]="f.notes"></div>
          </div>

          <div class="flex gap-2">
            <button class="btn-primary flex-1" [disabled]="saving() || kitneChune() === 0"
                    (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : 'BILL BANAO' }}</button>
            <button class="btn-line" (click)="form.set(null)">Cancel</button>
          </div>
          @if (kitneChune() === 0 && f.partyId && dcs().length > 0) {
            <p class="text-[11px] text-gray-500 mt-2 text-center">
              Kam se kam ek challan par tick lagaiye
            </p>
          }
        </div>
      </div>
    }

    <!-- ══ DETAIL ══ -->
    @if (detail(); as d) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="detail.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <div class="flex items-start mb-3">
            <div>
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.billNo }}</h3>
              <p class="text-xs text-gray-500">
                {{ d.partyName }} · {{ d.billDate | date:'d MMM y' }}
                @if (d.supplierBillNo) { · challan {{ d.supplierBillNo }} }
              </p>
            </div>
            <button class="ml-auto text-2xl text-slate-400" (click)="detail.set(null)">✕</button>
          </div>

          <table class="w-full text-xs mb-3">
            <tr class="text-gray-500 text-left">
              <th class="font-semibold pb-1">Maal</th>
              <th class="font-semibold pb-1 text-right">Qty</th>
              <th class="font-semibold pb-1 text-right">Rate</th>
              <th class="font-semibold pb-1 text-right">GST%</th>
              <th class="font-semibold pb-1 text-right">Rakam</th>
            </tr>
            @for (l of d.lines; track l.id) {
              <tr class="border-t border-[color:var(--ax-border)]">
                <td class="py-1.5">
                  {{ l.itemName }}
                  @if (l.description) { <span class="text-slate-400">· {{ l.description }}</span> }
                </td>
                <td class="py-1.5 text-right">{{ l.qty | number:'1.0-2' }} {{ l.unit }}</td>
                <td class="py-1.5 text-right">₹{{ l.rate | number:'1.0-2' }}</td>
                <td class="py-1.5 text-right">{{ l.taxRate }}%</td>
                <td class="py-1.5 text-right font-bold">₹{{ l.totalAmount | number:'1.0-0' }}</td>
              </tr>
            }
          </table>

          <div class="text-xs space-y-0.5 max-w-[280px] ml-auto">
            <div class="flex"><span>Subtotal</span>
              <span class="ml-auto">₹{{ d.subtotal | number:'1.0-2' }}</span></div>
            @if (d.discount) {
              <div class="flex text-anjaninex-red"><span>Discount</span>
                <span class="ml-auto">− ₹{{ d.discount | number:'1.0-2' }}</span></div>
            }
            @if (d.cgst) {
              <div class="flex"><span>CGST</span>
                <span class="ml-auto">₹{{ d.cgst | number:'1.0-2' }}</span></div>
              <div class="flex"><span>SGST</span>
                <span class="ml-auto">₹{{ d.sgst | number:'1.0-2' }}</span></div>
            }
            @if (d.igst) {
              <div class="flex"><span>IGST</span>
                <span class="ml-auto">₹{{ d.igst | number:'1.0-2' }}</span></div>
            }
            @if (d.roundOff) {
              <div class="flex"><span>Round off</span>
                <span class="ml-auto">₹{{ d.roundOff | number:'1.0-2' }}</span></div>
            }
            <div class="flex font-extrabold text-anjaninex-navy text-sm border-t
                        border-[color:var(--ax-border)] pt-1 mt-1">
              <span>KUL</span><span class="ml-auto">₹{{ d.total | number:'1.0-2' }}</span></div>
          </div>
        </div>
      </div>
    }
  `
})
export class InvoicesComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  rows = signal<BillRow[]>([]);
  customers = signal<any[]>([]);
  /** Chune hue customer ke bill-baki challan (modal ke liye). */
  dcs = signal<PendingDc[]>([]);
  /** Poori firm ke bill-baki challan (upar wali chetavni ke liye). */
  waiting = signal<PendingDc[]>([]);

  loading = signal(true);
  err = signal('');
  from = monthStartStr();
  to = todayStr();

  form = signal<any | null>(null);
  formErr = signal('');
  saving = signal(false);
  detail = signal<any | null>(null);

  /** Kaunse challan par tick laga — id → true. */
  chuna: Record<string, boolean> = {};

  constructor() {
    this.load();
    this.http.get<any[]>(`${this.base}/parties?kind=customer`)
      .subscribe({ next: r => this.customers.set(r) });
    this.loadWaiting();
  }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.from) q.set('from', this.from);
    if (this.to) q.set('to', this.to);

    this.http.get<{ items: BillRow[] }>(`${this.base}/invoices?${q}`).subscribe({
      next: r => { this.rows.set(r.items ?? []); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }

  loadWaiting() {
    this.http.get<PendingDc[]>(`${this.base}/invoices/pending-challans`).subscribe({
      next: r => this.waiting.set(r),
      error: () => this.waiting.set([])
    });
  }

  waitingAmt(): number {
    return this.waiting().reduce((a, d) => a + (d.totalAmount || 0), 0);
  }

  statusLabel(s: string) {
    return s === 'paid' ? 'PAISA AA GAYA' : s === 'partial' ? 'AADHA AAYA'
         : s === 'overdue' ? 'DER HO GAYI' : 'BAKAYA';
  }
  baki(b: BillRow): number { return (b.total || 0) - (b.paidAmount || 0); }

  openNew() {
    this.formErr.set('');
    this.chuna = {};
    this.dcs.set([]);
    this.form.set({
      partyId: null, billDate: todayStr(),
      discount: 0, otherCharges: 0, roundOff: 0,
      ewayBillNo: null, ewayBillDate: null, lrNo: null,
      poNumber: null, notes: null
    });
  }

  /** Customer badla to purane tick aur purani challan-list dono bekaar. */
  partyBadli() {
    const f = this.form();
    if (!f) return;
    this.chuna = {};
    this.touch();

    if (!f.partyId) { this.dcs.set([]); return; }
    this.http.get<PendingDc[]>(`${this.base}/invoices/pending-challans?partyId=${f.partyId}`)
      .subscribe({
        next: r => this.dcs.set(r),
        error: () => this.dcs.set([])
      });
  }

  touch() { this.form.set({ ...this.form()! }); }

  private chuneIds(): string[] {
    return this.dcs().filter(d => this.chuna[d.id]).map(d => d.id);
  }
  kitneChune(): number { return this.chuneIds().length; }
  chuneKaMol(): number {
    return this.dcs().filter(d => this.chuna[d.id])
                     .reduce((a, d) => a + (d.totalAmount || 0), 0);
  }

  save() {
    const f = this.form();
    if (!f) return;
    const ids = this.chuneIds();
    if (ids.length === 0) { this.formErr.set('Kam se kam ek challan chuniye'); return; }

    this.saving.set(true);
    this.formErr.set('');

    this.http.post(`${this.base}/invoices`, { ...f, challanIds: ids }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.set(null);
        this.load();
        this.loadWaiting();
      },
      error: e => { this.formErr.set(e?.error?.error ?? 'Bill nahi bana'); this.saving.set(false); }
    });
  }

  openDetail(b: BillRow) {
    this.http.get<any>(`${this.base}/invoices/${b.id}`).subscribe({
      next: full => this.detail.set(full),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khula')
    });
  }

  remove(b: BillRow) {
    if (!confirm(`${b.billNo} hatana hai? Iske challan dobara "bill baki" me aa jayenge.`)) return;
    this.http.delete(`${this.base}/invoices/${b.id}`).subscribe({
      next: () => { this.load(); this.loadWaiting(); },
      error: e => this.err.set(e?.error?.error ?? 'Nahi hata')
    });
  }
}
