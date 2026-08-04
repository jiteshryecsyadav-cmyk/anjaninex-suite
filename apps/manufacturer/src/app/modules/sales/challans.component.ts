import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { todayStr } from '../../core/date.util';

interface DcLine {
  id?: string; soLineId: string | null; itemId: string | null; itemName?: string;
  colour: string | null; size: string | null;
  qty: number; unit: string; rate: number;
  /** Sirf screen par — order se bhara ho to "kitna baki tha" */
  bakiThi?: number;
}
interface Challan {
  id: string; dcNo: string; godownId: string; godownName: string;
  soId: string | null; soNo: string | null; partyId: string; partyName: string;
  challanDate: string; transport: string | null; lrNo: string | null;
  vehicleNo: string | null; packages: number | null; note: string | null;
  billed: boolean; lines: DcLine[]; totalQty: number; totalAmount: number;
}

const UNITS = ['Pcs', 'Set', 'Meter', 'Kg', 'Than'];

/**
 * Delivery Challan — maal godown se nikla. YAHI stock ghatata hai.
 *
 * Purchase Inward ka aaina: order chunte hi baki lines khud bhar jaati hain.
 * Stock se zyada bhejne par server rok lagata hai — wahi rok jiski kami se
 * pehle stock minus me chala gaya tha.
 */
@Component({
  selector: 'mfg-challans',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex gap-1 mb-3 text-sm font-bold">
      @for (t of tabs; track t.key) {
        <button (click)="onlyUnbilled.set(t.key); load()"
                class="px-4 py-1.5 rounded-lg transition"
                [class]="onlyUnbilled() === t.key ? 'bg-anjaninex-navy text-white'
                                                  : 'bg-white text-anjaninex-navy hover:bg-anjaninex-navy-soft'">
          {{ t.label }}</button>
      }
    </div>

    <div class="page-top-bar">
      <input class="input max-w-[280px]" placeholder="🔍 challan, LR ya gaadi number"
             [(ngModel)]="search" (ngModelChange)="load()">
      @if (auth.can('sales.challan.create.place')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ MAAL BAHAR BHEJO</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Abhi tak koi maal bahar nahi gaya</div>
    } @else {
      <div class="space-y-2">
        @for (c of rows(); track c.id) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-amber-50 grid place-items-center text-xl">🚚</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">
                  {{ c.dcNo }}
                  @if (c.soNo) {
                    <span class="chip ml-1 bg-sky-50 text-sky-700">{{ c.soNo }}</span>
                  } @else {
                    <span class="chip ml-1 bg-slate-100 text-slate-500">bina order</span>
                  }
                  @if (c.billed) {
                    <span class="chip ml-1 bg-emerald-50 text-emerald-700">BILL BAN GAYA</span>
                  }
                </div>
                <div class="text-xs text-slate-500">{{ c.partyName }} · {{ c.godownName }} se</div>
                <div class="text-xs text-slate-500">
                  {{ c.challanDate | date:'d MMM' }}
                  @if (c.packages) { · {{ c.packages }} gathar }
                  @if (c.lrNo) { · LR {{ c.lrNo }} }
                  @if (c.vehicleNo) { · {{ c.vehicleNo }} }
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div><b class="text-anjaninex-navy">{{ c.totalQty | number:'1.0-2' }}</b> gaya</div>
                <div class="text-slate-500">₹{{ c.totalAmount | number:'1.0-0' }}</div>
              </div>
            </div>

            @if (!c.billed) {
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold">
                🧾 Iska bill abhi nahi bana
              </div>
            }

            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openDetail(c)">DEKHO</button>
              @if (!c.billed && auth.can('sales.challan.delete.place')) {
                <button class="text-[11px] font-bold text-anjaninex-red" (click)="remove(c)">HATAO</button>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- ══ NAYA CHALLAN ══ -->
    @if (form(); as f) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="form.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">Maal bahar bhejo</h3>
          <p class="text-xs text-gray-500 mb-3">
            Yahi entry stock ghatati hai — stock se zyada nahi ja sakta
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
              </select></div>

            <div class="col-span-2"><label class="label">Kis order ka maal hai</label>
              <select class="input" [(ngModel)]="f.soId" (ngModelChange)="soChuna()"
                      [disabled]="!f.partyId">
                <option [ngValue]="null">— bina order ke ja raha —</option>
                @for (s of openSos(); track s.id) {
                  <option [ngValue]="s.id">
                    {{ s.soNo }} · {{ s.pendingQty | number:'1.0-2' }} baki</option>
                }
              </select>
              @if (!f.partyId) {
                <p class="text-[10.5px] text-gray-500 mt-1">Pehle customer chuniye</p>
              } @else if (openSos().length === 0) {
                <p class="text-[10.5px] text-gray-500 mt-1">Is customer ka koi khula order nahi</p>
              }
            </div>
            <div><label class="label">Tareekh</label>
              <input class="input" type="date" [(ngModel)]="f.challanDate"></div>

            <div><label class="label">Transport</label>
              <input class="input" [(ngModel)]="f.transport"></div>
            <div><label class="label">LR / builty no.</label>
              <input class="input" [(ngModel)]="f.lrNo"></div>
            <div><label class="label">Gaadi number</label>
              <input class="input" [(ngModel)]="f.vehicleNo"></div>
            <div><label class="label">Kitne gathar</label>
              <input class="input" type="number" [(ngModel)]="f.packages">
              <p class="text-[10.5px] text-gray-500 mt-1">Grahak yahi ginta hai</p></div>
            <div class="col-span-2"><label class="label">Note</label>
              <input class="input" [(ngModel)]="f.note"></div>
          </div>

          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Kya ja raha hai</div>
          @for (l of f.lines; track $index) {
            <div class="flex gap-2 items-end mb-2 rounded-lg px-1"
                 [class.bg-sky-50]="!!l.soLineId">
              <div class="flex-1"><label class="label">Maal</label>
                <select class="input" [(ngModel)]="l.itemId" [disabled]="!!l.soLineId">
                  <option [ngValue]="null">— chuniye —</option>
                  @for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }
                </select></div>
              <div class="w-24"><label class="label">Rang</label>
                <input class="input" [(ngModel)]="l.colour"></div>
              <div class="w-20"><label class="label">Size</label>
                <input class="input" [(ngModel)]="l.size"></div>
              <div class="w-24"><label class="label">Qty</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.qty">
                @if (l.bakiThi != null) {
                  <p class="text-[10.5px] text-gray-500 mt-1">{{ l.bakiThi | number:'1.0-2' }} baki thi</p>
                }
              </div>
              <div class="w-20"><label class="label">Unit</label>
                <select class="input" [(ngModel)]="l.unit" [disabled]="!!l.soLineId">
                  @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                </select></div>
              <div class="w-28"><label class="label">Rate ₹</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.rate"></div>
              @if (!l.soLineId) {
                <button class="text-anjaninex-red font-bold pb-2.5"
                        (click)="f.lines.splice($index,1); touch()">✕</button>
              } @else {
                <span class="w-4"></span>
              }
            </div>
          }
          <button class="btn-line btn-sm mb-4" (click)="addLine()">＋ MAAL JODO</button>

          <div class="text-right font-extrabold text-anjaninex-navy mb-3">
            Kul ₹{{ total(f) | number:'1.0-2' }}
          </div>

          <div class="flex gap-2">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : 'CHALLAN BANAO' }}</button>
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
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.dcNo }}</h3>
              <p class="text-xs text-gray-500">
                {{ d.partyName }} · {{ d.challanDate | date:'d MMM y' }}
                @if (d.soNo) { · {{ d.soNo }} }
              </p>
              @if (d.transport || d.lrNo || d.vehicleNo) {
                <p class="text-xs text-gray-500">
                  🚚 {{ d.transport }}
                  @if (d.lrNo) { · LR {{ d.lrNo }} }
                  @if (d.vehicleNo) { · {{ d.vehicleNo }} }
                  @if (d.packages) { · {{ d.packages }} gathar }
                </p>
              }
            </div>
            <button class="ml-auto text-2xl text-slate-400" (click)="detail.set(null)">✕</button>
          </div>

          <table class="w-full text-xs">
            <tr class="text-gray-500 text-left">
              <th class="font-semibold pb-1">Maal</th>
              <th class="font-semibold pb-1 text-right">Qty</th>
              <th class="font-semibold pb-1 text-right">Rate</th>
              <th class="font-semibold pb-1 text-right">Rakam</th>
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
export class ChallansComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  tabs = [
    { key: 'unbilled', label: 'Bill baki' },
    { key: 'all',      label: 'Sab' }
  ];
  onlyUnbilled = signal('unbilled');
  units = UNITS;

  rows = signal<Challan[]>([]);
  customers = signal<any[]>([]);
  items = signal<any[]>([]);
  godowns = signal<any[]>([]);
  /** Chune hue customer ke khule order. */
  openSos = signal<any[]>([]);

  loading = signal(true);
  err = signal('');
  search = '';

  form = signal<any | null>(null);
  formErr = signal('');
  saving = signal(false);
  detail = signal<Challan | null>(null);

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
    if (this.search) q.set('search', this.search);
    if (this.onlyUnbilled() === 'unbilled') q.set('unbilled', 'true');

    this.http.get<Challan[]>(`${this.base}/challans?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }

  openNew() {
    this.formErr.set('');
    this.openSos.set([]);
    this.form.set({
      partyId: null, soId: null,
      godownId: this.godowns().find(g => g.isMain)?.id ?? this.godowns()[0]?.id ?? null,
      challanDate: todayStr(), transport: null, lrNo: null, vehicleNo: null,
      packages: null, note: null,
      lines: [this.blankLine()]
    });
  }

  /** Customer badla to purana order aur uski lines dono bekaar. */
  partyBadli() {
    const f = this.form();
    if (!f) return;
    f.soId = null;
    f.lines = [this.blankLine()];
    this.touch();

    if (!f.partyId) { this.openSos.set([]); return; }
    this.http.get<any[]>(`${this.base}/sales-orders?partyId=${f.partyId}`).subscribe({
      next: r => this.openSos.set(r.filter(s => s.pendingQty > 0)),
      error: () => this.openSos.set([])
    });
  }

  /** Order chunte hi jo bhejna baki hai wo lines me bhar do. */
  soChuna() {
    const f = this.form();
    if (!f) return;
    if (!f.soId) { f.lines = [this.blankLine()]; this.touch(); return; }

    this.http.get<any>(`${this.base}/sales-orders/${f.soId}/pending`).subscribe({
      next: so => {
        f.lines = (so.lines ?? []).map((l: any) => ({
          soLineId: l.id, itemId: l.itemId, colour: l.colour, size: l.size,
          qty: l.pending, unit: l.unit, rate: l.rate, bakiThi: l.pending
        }));
        if (f.lines.length === 0) f.lines = [this.blankLine()];
        if (so.godownId) f.godownId = so.godownId;
        if (so.transport && !f.transport) f.transport = so.transport;
        this.touch();
      },
      error: e => this.formErr.set(e?.error?.error ?? 'Order ki lines nahi aa payin')
    });
  }

  private blankLine(): DcLine {
    return { soLineId: null, itemId: null, colour: null, size: null,
             qty: 0, unit: 'Pcs', rate: 0 };
  }
  addLine() { this.form()!.lines.push(this.blankLine()); this.touch(); }
  touch()   { this.form.set({ ...this.form()! }); }

  total(f: any): number {
    return (f.lines ?? []).reduce((a: number, l: DcLine) => a + (l.qty || 0) * (l.rate || 0), 0);
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    // Jo line 0 par chhodi wo ja hi nahi rahi — mat bhejo
    const body = { ...f, lines: (f.lines as DcLine[]).filter(l => (l.qty || 0) > 0) };

    this.http.post(`${this.base}/challans`, body).subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openDetail(c: Challan) {
    this.http.get<Challan>(`${this.base}/challans/${c.id}`).subscribe({
      next: full => this.detail.set(full),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khula')
    });
  }

  remove(c: Challan) {
    if (!confirm(`${c.dcNo} hatana hai? Ye maal stock me wapas aa jayega.`)) return;
    this.http.delete(`${this.base}/challans/${c.id}`).subscribe({
      next: () => this.load(),
      error: e => this.err.set(e?.error?.error ?? 'Nahi hat paya')
    });
  }
}
