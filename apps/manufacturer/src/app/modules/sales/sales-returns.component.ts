import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { FldDirective } from '../../shared/fld.directive';
import { FieldConfigService } from '../../shared/field-config.service';
import { todayStr, monthStartStr } from '../../core/date.util';

interface GrRow {
  id: string; grNo: string; grDate: string;
  supplierPartyId: string; supplierName: string;
  originalBillId: string | null; originalBillNo: string | null;
  totalReturnAmount: number; effectMode: string; status: string;
}
interface BillLine {
  billLineId: string; itemId: string; itemName: string;
  description: string | null; hsnSac: string | null;
  bechiQty: number; unit: string | null; rate: number; taxRate: number;
}

const REASONS = ['Kapda kharab nikla', 'Rang match nahi hua', 'Size galat tha',
                 'Silai kharab', 'Grahak ne cancel kar diya', 'Der se pahuncha',
                 'Zyada maal bhej diya'];

/**
 * Sales Return — becha hua maal grahak ne wapas kar diya.
 *
 * Do cheezein ek saath hoti hain, aur dono zaroori hain:
 *   PAISA — grahak ke khate me credit (bill me katega ya credit note)
 *   MAAL  — godown me wapas, dobara bikne ke liye
 *
 * Isliye godown poochna zaroori hai — bina uske maal kahin nahi chadhta.
 */
@Component({
  selector: 'mfg-sales-returns',
  standalone: true,
  imports: [CommonModule, FormsModule, FldDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-top-bar">
      <input class="input max-w-[200px]" type="date" [(ngModel)]="from" (ngModelChange)="load()">
      <input class="input max-w-[200px]" type="date" [(ngModel)]="to" (ngModelChange)="load()">
      @if (auth.can('sales.sreturn.create.place')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ MAAL WAPAS AAYA</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Is samay koi maal wapas nahi aaya</div>
    } @else {
      <div class="space-y-2">
        @for (g of rows(); track g.id) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-rose-50 grid place-items-center text-xl">↩️</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">
                  {{ g.grNo }}
                  @if (g.originalBillNo) {
                    <span class="chip ml-1 bg-sky-50 text-sky-700">{{ g.originalBillNo }}</span>
                  }
                  <span class="chip ml-1"
                        [class]="g.effectMode === 'credit_note' ? 'bg-violet-50 text-violet-700'
                                                               : 'bg-slate-100 text-slate-600'">
                    {{ g.effectMode === 'credit_note' ? 'CREDIT NOTE' : 'BILL ME KATA' }}
                  </span>
                </div>
                <div class="text-xs text-slate-500">{{ g.supplierName }}</div>
                <div class="text-xs text-slate-500">{{ g.grDate | date:'d MMM y' }}</div>
              </div>
              <div class="text-right shrink-0">
                <div class="font-bold text-anjaninex-red text-sm">
                  ₹{{ g.totalReturnAmount | number:'1.0-0' }}</div>
                <div class="text-[11px] text-slate-500">grahak ko dena</div>
              </div>
            </div>

            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openDetail(g)">DEKHO</button>
              @if (auth.can('sales.sreturn.delete.place')) {
                <button class="text-[11px] font-bold text-anjaninex-red" (click)="remove(g)">HATAO</button>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- ══ NAYA RETURN ══ -->
    @if (form(); as f) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="form.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">Maal wapas aaya</h3>
          <p class="text-xs text-gray-500 mb-3">
            Grahak ke khate me credit jayega aur maal godown me wapas chadhega
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
            <div><label class="label" style="color:#DC2626">Godown *</label>
              <select class="input" [(ngModel)]="f.godownId">
                @for (g of godowns(); track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }
              </select>
              <p class="text-[10.5px] text-gray-500 mt-1">Maal yahan chadhega</p></div>

            <div class="col-span-2" *fld="'mfg_sreturn.bill'"><label class="label">{{ cfg.label('mfg_sreturn.bill') }}</label>
              <select class="input" [(ngModel)]="f.billId" (ngModelChange)="billChuna()"
                      [disabled]="!f.partyId">
                <option [ngValue]="null">— bataana nahi hai —</option>
                @for (b of bills(); track b.id) {
                  <option [ngValue]="b.id">
                    {{ b.billNo }} · {{ b.billDate | date:'d MMM' }} · ₹{{ b.total | number:'1.0-0' }}</option>
                }
              </select>
              @if (f.partyId && bills().length === 0) {
                <p class="text-[10.5px] text-gray-500 mt-1">
                  Is customer ka koi bill baki nahi (ek bill ki ek hi return banti hai)
                </p>
              }
            </div>
            <div><label class="label">Tareekh</label>
              <input class="input" type="date" [(ngModel)]="f.returnDate"></div>

            <div class="col-span-2" *fld="'mfg_sreturn.reason'">
              <label class="label" [style.color]="cfg.required('mfg_sreturn.reason') ? '#DC2626' : ''">
                {{ cfg.label('mfg_sreturn.reason') }}@if (cfg.required('mfg_sreturn.reason')) { * }</label>
              <select class="input" [(ngModel)]="f.reason">
                <option [ngValue]="null">— chuniye —</option>
                @for (r of reasons; track r) { <option [value]="r">{{ r }}</option> }
              </select></div>
            <div *fld="'mfg_sreturn.effect'"><label class="label">{{ cfg.label('mfg_sreturn.effect') }}</label>
              <select class="input" [(ngModel)]="f.effectMode">
                <option value="direct_adjustment">Bill me hi kat jaye</option>
                <option value="credit_note">Credit note bane</option>
              </select></div>

            <div *fld="'mfg_sreturn.transport'"><label class="label">{{ cfg.label('mfg_sreturn.transport') }}</label>
              <input class="input" [(ngModel)]="f.transport"></div>
            <div class="col-span-2" *fld="'mfg_sreturn.remark'"><label class="label">{{ cfg.label('mfg_sreturn.remark') }}</label>
              <input class="input" [(ngModel)]="f.remark"></div>
          </div>

          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Kya wapas aaya</div>
          @if (f.billId && f.lines.length === 0) {
            <p class="text-xs text-slate-400 mb-3">Is bill me koi line nahi mili</p>
          }
          @for (l of f.lines; track $index) {
            <div class="flex gap-2 items-end mb-2 rounded-lg px-1"
                 [class.bg-sky-50]="!!l.billLineId">
              <div class="flex-1"><label class="label">Maal</label>
                <select class="input" [(ngModel)]="l.itemId" [disabled]="!!l.billLineId">
                  <option [ngValue]="null">— chuniye —</option>
                  @for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }
                </select></div>
              <div class="w-28"><label class="label">Rang / size</label>
                <input class="input" [(ngModel)]="l.description"></div>
              <div class="w-24"><label class="label">Kitna wapas</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.qty">
                @if (l.bechiQty != null) {
                  <p class="text-[10.5px] text-gray-500 mt-1">{{ l.bechiQty | number:'1.0-2' }} becha tha</p>
                }
              </div>
              <div class="w-28"><label class="label">Rate ₹</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.rate"></div>
              <div class="w-20"><label class="label">GST %</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.taxRate"></div>
              <div class="w-24 text-right text-sm font-bold text-anjaninex-navy pb-2">
                ₹{{ lineTotal(l) | number:'1.0-0' }}</div>
              @if (!l.billLineId) {
                <button class="text-anjaninex-red font-bold pb-2.5"
                        (click)="f.lines.splice($index,1); touch()">✕</button>
              } @else {
                <span class="w-4"></span>
              }
            </div>
          }
          <button class="btn-line btn-sm mb-4" (click)="addLine()">＋ MAAL JODO</button>

          <div class="text-right font-extrabold text-anjaninex-navy mb-3">
            Kul ₹{{ total(f) | number:'1.0-2' }} grahak ko dena hai
          </div>

          <div class="flex gap-2">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : 'RETURN BANAO' }}</button>
            <button class="btn-line" (click)="form.set(null)">Cancel</button>
          </div>
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
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.grNo }}</h3>
              <p class="text-xs text-gray-500">
                {{ d.supplierName }} · {{ d.grDate | date:'d MMM y' }}
                @if (d.originalBillNo) { · {{ d.originalBillNo }} }
              </p>
            </div>
            <button class="ml-auto text-2xl text-slate-400" (click)="detail.set(null)">✕</button>
          </div>

          @if (d.reason) {
            <div class="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-800 text-xs font-bold mb-3">
              {{ d.reason }}</div>
          }

          <table class="w-full text-xs mb-3">
            <tr class="text-gray-500 text-left">
              <th class="font-semibold pb-1">Maal</th>
              <th class="font-semibold pb-1 text-right">Qty</th>
              <th class="font-semibold pb-1 text-right">Rate</th>
              <th class="font-semibold pb-1 text-right">GST</th>
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
                <td class="py-1.5 text-right">₹{{ l.taxAmount | number:'1.0-0' }}</td>
                <td class="py-1.5 text-right font-bold">₹{{ l.totalAmount | number:'1.0-0' }}</td>
              </tr>
            }
          </table>

          <div class="text-xs space-y-0.5 max-w-[280px] ml-auto">
            @if (d.originalBillAmount) {
              <div class="flex"><span>Bill tha</span>
                <span class="ml-auto">₹{{ d.originalBillAmount | number:'1.0-2' }}</span></div>
              <div class="flex text-anjaninex-red"><span>Wapas aaya</span>
                <span class="ml-auto">− ₹{{ d.totalReturnAmount | number:'1.0-2' }}</span></div>
              <div class="flex font-extrabold text-anjaninex-navy text-sm border-t
                          border-[color:var(--ax-border)] pt-1 mt-1">
                <span>AB BILL</span>
                <span class="ml-auto">₹{{ d.netBillAfterGr | number:'1.0-2' }}</span></div>
            } @else {
              <div class="flex font-extrabold text-anjaninex-navy text-sm">
                <span>KUL WAPAS</span>
                <span class="ml-auto">₹{{ d.totalReturnAmount | number:'1.0-2' }}</span></div>
            }
          </div>
        </div>
      </div>
    }
  `
})
export class SalesReturnsComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);
  /** Firm ne kaunsa field on/off kiya — template isi se poochta hai. */
  cfg = inject(FieldConfigService);

  reasons = REASONS;

  rows = signal<GrRow[]>([]);
  customers = signal<any[]>([]);
  items = signal<any[]>([]);
  godowns = signal<any[]>([]);
  /** Chune hue customer ke wo bill jinki return abhi nahi bani. */
  bills = signal<any[]>([]);

  loading = signal(true);
  err = signal('');
  from = monthStartStr();
  to = todayStr();

  form = signal<any | null>(null);
  formErr = signal('');
  saving = signal(false);
  detail = signal<any | null>(null);

  constructor() {
    this.load();
    this.http.get<any[]>(`${this.base}/parties?kind=customer`)
      .subscribe({ next: r => this.customers.set(r) });
    this.http.get<any[]>(`${this.base}/items`).subscribe({ next: r => this.items.set(r) });
    this.http.get<any[]>(`${this.base}/godowns`).subscribe({ next: r => this.godowns.set(r) });
  }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.from) q.set('from', this.from);
    if (this.to) q.set('to', this.to);

    this.http.get<{ items: GrRow[] }>(`${this.base}/sales-returns?${q}`).subscribe({
      next: r => { this.rows.set(r.items ?? []); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }

  openNew() {
    this.formErr.set('');
    this.bills.set([]);
    this.form.set({
      partyId: null, billId: null,
      godownId: this.godowns().find(g => g.isMain)?.id ?? this.godowns()[0]?.id ?? null,
      returnDate: todayStr(), reason: null, effectMode: 'direct_adjustment',
      transport: null, lrNo: null, remark: null,
      lines: [this.blankLine()]
    });
  }

  partyBadli() {
    const f = this.form();
    if (!f) return;
    f.billId = null;
    f.lines = [this.blankLine()];
    this.touch();

    if (!f.partyId) { this.bills.set([]); return; }
    this.http.get<any[]>(`${this.base}/sales-returns/billable?partyId=${f.partyId}`).subscribe({
      next: r => this.bills.set(r),
      error: () => this.bills.set([])
    });
  }

  /**
   * Bill chunte hi uski lines aa jaati hain — par qty 0 se shuru, kyunki
   * poora bill wapas aana aam baat nahi. Jo aaya sirf usme number bharo.
   */
  billChuna() {
    const f = this.form();
    if (!f) return;
    if (!f.billId) { f.lines = [this.blankLine()]; this.touch(); return; }

    this.http.get<any>(`${this.base}/sales-returns/bill/${f.billId}/lines`).subscribe({
      next: b => {
        f.lines = (b.lines ?? []).map((l: BillLine) => ({
          billLineId: l.billLineId, itemId: l.itemId, description: l.description,
          qty: 0, unit: l.unit, rate: l.rate, taxRate: l.taxRate, bechiQty: l.bechiQty
        }));
        if (f.lines.length === 0) f.lines = [this.blankLine()];
        this.touch();
      },
      error: e => this.formErr.set(e?.error?.error ?? 'Bill ki lines nahi aa payin')
    });
  }

  private blankLine(): any {
    return { billLineId: null, itemId: null, description: null,
             qty: 0, unit: 'Pcs', rate: 0, taxRate: 0 };
  }
  addLine() { this.form()!.lines.push(this.blankLine()); this.touch(); }
  touch()   { this.form.set({ ...this.form()! }); }

  lineTotal(l: any): number {
    const taxable = (l.qty || 0) * (l.rate || 0);
    return taxable * (1 + (l.taxRate || 0) / 100);
  }
  total(f: any): number {
    return (f.lines ?? []).reduce((a: number, l: any) => a + this.lineTotal(l), 0);
  }

  save() {
    const f = this.form();
    if (!f) return;

    // Bill se bhari lines me se jo 0 hain wo wapas nahi aayi — mat bhejo
    const lines = (f.lines as any[]).filter(l => (l.qty || 0) > 0);
    if (lines.length === 0) {
      this.formErr.set('Kis maal ka kitna wapas aaya, wo qty daaliye');
      return;
    }

    this.saving.set(true);
    this.formErr.set('');
    this.http.post(`${this.base}/sales-returns`, { ...f, lines }).subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openDetail(g: GrRow) {
    this.http.get<any>(`${this.base}/sales-returns/${g.id}`).subscribe({
      next: full => this.detail.set(full),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khula')
    });
  }

  remove(g: GrRow) {
    if (!confirm(`${g.grNo} hatana hai? Ye maal stock se wapas nikal jayega.`)) return;
    this.http.delete(`${this.base}/sales-returns/${g.id}`).subscribe({
      next: () => this.load(),
      error: e => this.err.set(e?.error?.error ?? 'Nahi hata')
    });
  }
}
