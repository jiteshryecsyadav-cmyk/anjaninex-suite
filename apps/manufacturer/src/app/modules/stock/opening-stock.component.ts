import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { todayStr } from '../../core/date.util';

interface OpLine {
  id?: string; itemId: string | null; itemName?: string; itemKind?: string;
  colour: string | null; size: string | null;
  qty: number; unit: string; rate: number;
}
interface Opening {
  id: string; entryNo: string; godownId: string; godownName: string;
  asOn: string; note: string | null;
  lines: OpLine[]; totalQty: number; totalValue: number;
}
interface MinusItem {
  itemId: string; itemName: string; itemKind: string;
  godownId: string; godownName: string; onHand: number;
}

const UNITS = ['Pcs', 'Set', 'Meter', 'Kg', 'Than', 'Roll'];

/**
 * Opening Stock — app shuru karne se PEHLE jo maal pada tha.
 *
 * Iske bina har purana maal minus me chala jata hai: job slip usse bahar
 * bhejta hai, challan usse nikalta hai — par andar wo kabhi aaya hi nahi
 * hota. Ledger jhooth nahi bolta, hum maal andar dikhana bhool jaate hain.
 *
 * Isliye sabse upar wahi maal dikhta hai jo abhi minus me hai, aur ek click
 * me line bhar jati hai. Aadmi ko dhoondhna nahi padta ki kis cheez ka
 * hisaab bigda hua hai.
 */
@Component({
  selector: 'mfg-opening-stock',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-top-bar">
      <span class="text-xs text-slate-500 font-semibold">
        App shuru karne se pehle jo maal pada tha — wahi yahan bharna hai
      </span>
      @if (auth.can('stock.design.edit.firm')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ OPENING STOCK BHARO</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    <!-- Jo maal minus me hai — sabse upar, kyunki yahi asli dikkat hai -->
    @if (minus().length > 0) {
      <div class="card mb-3 border-l-4 border-anjaninex-red">
        <div class="text-sm font-bold text-anjaninex-red mb-2">
          🔴 {{ minus().length }} maal minus me hai
          <span class="text-slate-500 font-semibold">
            — ye bahar to gaya, par andar kabhi aaya hi nahi</span>
        </div>
        <div class="space-y-1">
          @for (m of minus(); track m.itemId + m.godownId) {
            <div class="flex items-center gap-2 text-xs">
              <span class="font-bold">{{ m.itemName }}</span>
              <span class="text-slate-400">· {{ m.godownName }}</span>
              <span class="font-black text-anjaninex-red">{{ m.onHand | number:'1.0-2' }}</span>
              @if (auth.can('stock.design.edit.firm')) {
                <button class="ml-auto text-[11px] font-bold text-anjaninex-navy"
                        (click)="fixMinus(m)">＋ ITNA BHAR DO</button>
              }
            </div>
          }
        </div>
      </div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">
        Abhi tak koi opening stock nahi bhara
      </div>
    } @else {
      <div class="space-y-2">
        @for (o of rows(); track o.id) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-anjaninex-navy-soft grid place-items-center text-xl">🏁</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">{{ o.entryNo }}</div>
                <div class="text-xs text-slate-500">{{ o.godownName }}</div>
                <div class="text-xs text-slate-500">
                  {{ o.asOn | date:'d MMM y' }} ka stock · {{ o.lines.length }} maal
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div><b class="text-anjaninex-navy">{{ o.totalQty | number:'1.0-2' }}</b> maal</div>
                @if (o.totalValue) {
                  <div class="text-slate-500">₹{{ o.totalValue | number:'1.0-0' }}</div>
                }
              </div>
            </div>
            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openDetail(o)">DEKHO</button>
              @if (auth.can('stock.design.edit.firm')) {
                <button class="text-[11px] font-bold text-anjaninex-red" (click)="remove(o)">HATAO</button>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- ══ NAYA ══ -->
    @if (form(); as f) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="form.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">Opening Stock bharo</h3>
          <p class="text-xs text-gray-500 mb-3">
            Jo maal app shuru karne se pehle se pada tha. Ye entry sirf ek baar
            karni hoti hai — baad ka maal Purchase Inward se aata hai.
          </p>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-3 gap-3 mb-4">
            <div><label class="label" style="color:#DC2626">Godown *</label>
              <select class="input" [(ngModel)]="f.godownId">
                @for (g of godowns(); track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }
              </select></div>
            <div><label class="label">Kis din ka stock</label>
              <input class="input" type="date" [(ngModel)]="f.asOn">
              <p class="text-[10.5px] text-gray-500 mt-1">Aam taur par 1 April</p></div>
            <div><label class="label">Note</label>
              <input class="input" [(ngModel)]="f.note"></div>
          </div>

          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Kya-kya pada hai</div>
          @for (l of f.lines; track $index) {
            <div class="flex gap-2 items-end mb-2">
              <div class="flex-1"><label class="label">Maal</label>
                <select class="input" [(ngModel)]="l.itemId">
                  <option [ngValue]="null">— chuniye —</option>
                  @for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }
                </select></div>
              <div class="w-24"><label class="label">Rang</label>
                <input class="input" [(ngModel)]="l.colour"></div>
              <div class="w-20"><label class="label">Size</label>
                <input class="input" [(ngModel)]="l.size"></div>
              <div class="w-24"><label class="label">Kitna hai</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.qty"></div>
              <div class="w-20"><label class="label">Unit</label>
                <select class="input" [(ngModel)]="l.unit">
                  @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                </select></div>
              <div class="w-28"><label class="label">Daam ₹</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.rate">
                <p class="text-[10.5px] text-gray-500 mt-1">sirf hisaab ke liye</p></div>
              <button class="text-anjaninex-red font-bold pb-2.5"
                      (click)="f.lines.splice($index,1); touch()">✕</button>
            </div>
          }
          <button class="btn-line btn-sm mb-4" (click)="addLine()">＋ MAAL JODO</button>

          <div class="text-right font-extrabold text-anjaninex-navy mb-3">
            {{ kulQty(f) | number:'1.0-2' }} maal · ₹{{ kulValue(f) | number:'1.0-2' }}
          </div>

          <div class="flex gap-2">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : 'STOCK CHADHAO' }}</button>
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
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.entryNo }}</h3>
              <p class="text-xs text-gray-500">
                {{ d.godownName }} · {{ d.asOn | date:'d MMM y' }} ka stock</p>
            </div>
            <button class="ml-auto text-2xl text-slate-400" (click)="detail.set(null)">✕</button>
          </div>

          <table class="w-full text-xs">
            <tr class="text-gray-500 text-left">
              <th class="font-semibold pb-1">Maal</th>
              <th class="font-semibold pb-1 text-right">Qty</th>
              <th class="font-semibold pb-1 text-right">Daam</th>
              <th class="font-semibold pb-1 text-right">Value</th>
            </tr>
            @for (l of d.lines; track l.id) {
              <tr class="border-t border-[color:var(--ax-border)]">
                <td class="py-1.5">
                  {{ l.itemName }}
                  @if (l.colour) { <span class="text-slate-400">· {{ l.colour }}</span> }
                  @if (l.size) { <span class="text-slate-400">· {{ l.size }}</span> }
                </td>
                <td class="py-1.5 text-right">{{ l.qty | number:'1.0-2' }} {{ l.unit }}</td>
                <td class="py-1.5 text-right">₹{{ l.rate | number:'1.0-2' }}</td>
                <td class="py-1.5 text-right font-bold">₹{{ l.qty * l.rate | number:'1.0-0' }}</td>
              </tr>
            }
          </table>

          @if (d.note) { <p class="text-xs text-slate-500 mt-3">📝 {{ d.note }}</p> }
        </div>
      </div>
    }
  `
})
export class OpeningStockComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  units = UNITS;
  rows = signal<Opening[]>([]);
  minus = signal<MinusItem[]>([]);
  items = signal<any[]>([]);
  godowns = signal<any[]>([]);

  loading = signal(true);
  err = signal('');

  form = signal<any | null>(null);
  formErr = signal('');
  saving = signal(false);
  detail = signal<Opening | null>(null);

  constructor() {
    this.load();
    this.loadMinus();
    this.http.get<any[]>(`${this.base}/items`).subscribe({ next: r => this.items.set(r) });
    this.http.get<any[]>(`${this.base}/godowns`).subscribe({ next: r => this.godowns.set(r) });
  }

  load() {
    this.loading.set(true);
    this.err.set('');
    this.http.get<Opening[]>(`${this.base}/opening-stock`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }
  loadMinus() {
    this.http.get<MinusItem[]>(`${this.base}/opening-stock/minus`).subscribe({
      next: r => this.minus.set(r),
      error: () => this.minus.set([])
    });
  }

  openNew() {
    this.formErr.set('');
    this.form.set({
      godownId: this.godowns().find(g => g.isMain)?.id ?? this.godowns()[0]?.id ?? null,
      asOn: todayStr(), note: null, lines: [this.blankLine()]
    });
  }

  /**
   * Minus wale maal par click — usi godown ka form khulta hai aur line
   * utni hi qty se bhar jati hai jitni minus me hai. Hisaab seedha 0 par
   * aa jayega, na kam na zyada.
   */
  fixMinus(m: MinusItem) {
    this.formErr.set('');
    this.form.set({
      godownId: m.godownId, asOn: todayStr(),
      note: `${m.itemName} ka hisaab seedha kiya`,
      lines: [{ itemId: m.itemId, colour: null, size: null,
                qty: Math.abs(m.onHand), unit: 'Pcs', rate: 0 }]
    });
  }

  private blankLine(): OpLine {
    return { itemId: null, colour: null, size: null, qty: 0, unit: 'Pcs', rate: 0 };
  }
  addLine() { this.form()!.lines.push(this.blankLine()); this.touch(); }
  touch()   { this.form.set({ ...this.form()! }); }

  kulQty(f: any): number {
    return (f.lines ?? []).reduce((a: number, l: OpLine) => a + (+l.qty || 0), 0);
  }
  kulValue(f: any): number {
    return (f.lines ?? []).reduce((a: number, l: OpLine) => a + (l.qty || 0) * (l.rate || 0), 0);
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    const body = { ...f, lines: (f.lines as OpLine[]).filter(l => (l.qty || 0) > 0) };
    this.http.post(`${this.base}/opening-stock`, body).subscribe({
      next: () => {
        this.saving.set(false); this.form.set(null);
        this.load(); this.loadMinus();
      },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openDetail(o: Opening) {
    this.http.get<Opening>(`${this.base}/opening-stock/${o.id}`).subscribe({
      next: full => this.detail.set(full),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khula')
    });
  }

  remove(o: Opening) {
    if (!confirm(`${o.entryNo} hatana hai? Ye maal stock se ghat jayega.`)) return;
    this.http.delete(`${this.base}/opening-stock/${o.id}`).subscribe({
      next: () => { this.load(); this.loadMinus(); },
      error: e => this.err.set(e?.error?.error ?? 'Nahi hata')
    });
  }
}
