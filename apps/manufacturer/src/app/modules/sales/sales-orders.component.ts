import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { todayStr } from '../../core/date.util';
import { FldDirective } from '../../shared/fld.directive';
import { FieldConfigService } from '../../shared/field-config.service';

interface SoLine {
  id?: string; itemId: string | null; itemName?: string;
  colour: string | null; size: string | null;
  qty: number; unit: string; rate: number; ratioNote: string | null;
  dispatched?: number; pending?: number; stockHai?: number;
}
interface SalesOrder {
  id: string; soNo: string; partyId: string; partyName: string;
  agentId: string | null; agentName: string | null;
  godownId: string | null; godownName: string | null;
  orderDate: string; dueAt: string | null;
  transport: string | null; buyerRef: string | null; note: string | null;
  status: string; lines: SoLine[];
  totalQty: number; totalAmount: number; pendingQty: number;
}

const UNITS = ['Pcs', 'Set', 'Meter', 'Kg', 'Than'];

/**
 * Sales Order — grahak ne kya manga.
 *
 * Ratio wali madad sabse zaroori hai: trader "60 piece, S:1 M:2 L:1" bolta
 * hai, size-wise ginti nahi. Isliye wo daalte hi lines apne aap ban jaati
 * hain — wahi hisab jo job slip me hai.
 */
@Component({
  selector: 'mfg-sales-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, FldDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex gap-1 mb-3 text-sm font-bold">
      @for (t of tabs; track t.key) {
        <button (click)="status.set(t.key); load()"
                class="px-4 py-1.5 rounded-lg transition"
                [class]="status() === t.key ? 'bg-anjaninex-navy text-white'
                                            : 'bg-white text-anjaninex-navy hover:bg-anjaninex-navy-soft'">
          {{ t.label }}</button>
      }
    </div>

    <div class="page-top-bar">
      <input class="input max-w-[260px]" placeholder="🔍 SO number ya grahak ka ref"
             [(ngModel)]="search" (ngModelChange)="load()">
      @if (auth.can('sales.order.create.place')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ NAYA SALES ORDER</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Koi sales order nahi mila</div>
    } @else {
      <div class="space-y-2">
        @for (s of rows(); track s.id) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-anjaninex-navy-soft grid place-items-center text-xl">📄</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">
                  {{ s.soNo }}
                  @if (s.buyerRef) {
                    <span class="text-slate-400 font-mono text-xs">· {{ s.buyerRef }}</span>
                  }
                  <span class="chip ml-1"
                        [class]="s.status === 'done' ? 'bg-emerald-50 text-emerald-700'
                               : s.status === 'cancelled' ? 'bg-slate-100 text-slate-500'
                               : s.status === 'partial' ? 'bg-amber-50 text-amber-700'
                               : 'bg-sky-50 text-sky-700'">
                    {{ label(s.status) }}
                  </span>
                </div>
                <div class="text-xs text-slate-500">{{ s.partyName }}</div>
                <div class="text-xs text-slate-500">
                  {{ s.orderDate | date:'d MMM' }} · {{ s.lines.length }} line
                  @if (s.dueAt) { · {{ s.dueAt | date:'d MMM' }} tak }
                  @if (s.agentName) { · {{ s.agentName }} }
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div><b class="text-anjaninex-navy">{{ s.totalQty | number:'1.0-2' }}</b> manga</div>
                <div class="text-slate-500">₹{{ s.totalAmount | number:'1.0-0' }}</div>
              </div>
            </div>

            @if (s.pendingQty > 0 && s.status !== 'cancelled') {
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold flex">
                <span>📦 {{ s.pendingQty | number:'1.0-2' }} abhi bhejna baki</span>
                @if (kamStock(s); as k) { <span class="ml-auto">⚠️ {{ k }}</span> }
              </div>
            } @else if (s.status === 'done') {
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold">
                ✅ Poora maal bhej diya
              </div>
            }

            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openDetail(s)">DEKHO</button>
              @if (s.status !== 'cancelled' && s.status !== 'done'
                   && auth.can('sales.order.edit.place')) {
                <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openEdit(s)">BADLO</button>
              }
              @if (s.status === 'open' && auth.can('sales.order.delete.place')) {
                <button class="text-[11px] font-bold text-anjaninex-red" (click)="cancel(s)">CANCEL</button>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- ══ NAYA / BADLO ══ -->
    @if (form(); as f) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="form.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-3">
            {{ editId() ? 'Sales Order badlo' : 'Naya Sales Order' }}</h3>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="col-span-2"><label class="label" style="color:#DC2626">Customer *</label>
              <select class="input" [(ngModel)]="f.partyId">
                <option [ngValue]="null">— chuniye —</option>
                @for (c of customers(); track c.id) { <option [ngValue]="c.id">{{ c.displayName }}</option> }
              </select></div>
            <div><label class="label">Tareekh</label>
              <input class="input" type="date" [(ngModel)]="f.orderDate"></div>
            <div *fld="'mfg_sales_order.godown'"><label class="label">{{ cfg.label('mfg_sales_order.godown') }}</label>
              <select class="input" [(ngModel)]="f.godownId">
                <option [ngValue]="null">— koi nahi —</option>
                @for (g of godowns(); track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }
              </select></div>
            <div *fld="'mfg_sales_order.agent'"><label class="label">{{ cfg.label('mfg_sales_order.agent') }}</label>
              <select class="input" [(ngModel)]="f.agentId">
                <option [ngValue]="null">— koi nahi —</option>
                @for (a of agents(); track a.id) { <option [ngValue]="a.id">{{ a.name }}</option> }
              </select></div>
            <div *fld="'mfg_sales_order.due_at'"><label class="label">{{ cfg.label('mfg_sales_order.due_at') }}</label>
              <input class="input" type="date" [(ngModel)]="f.dueAt"></div>
            <div *fld="'mfg_sales_order.buyer_ref'"><label class="label">{{ cfg.label('mfg_sales_order.buyer_ref') }}</label>
              <input class="input" [(ngModel)]="f.buyerRef">
              <p class="text-[10.5px] text-gray-500 mt-1">Wo isi se poochta hai</p></div>
            <div *fld="'mfg_sales_order.transport'"><label class="label">{{ cfg.label('mfg_sales_order.transport') }}</label>
              <input class="input" [(ngModel)]="f.transport"></div>
            <div *fld="'mfg_sales_order.note'"><label class="label">{{ cfg.label('mfg_sales_order.note') }}</label>
              <input class="input" [(ngModel)]="f.note"></div>
          </div>

          <!-- ── RATIO se lines banane wali madad ── -->
          <div *fld="'mfg_sales_order.ratio_box'"
               class="border border-dashed border-[color:var(--ax-border)] rounded-xl p-3 mb-3">
            <div class="font-extrabold text-xs text-anjaninex-navy mb-2">
              Ratio se bharo — "60 piece, S:1 M:2 L:1" wala hisab
            </div>
            <div class="flex gap-2 items-end flex-wrap">
              <div class="flex-1 min-w-[160px]"><label class="label">Design</label>
                <select class="input" [(ngModel)]="rat.itemId">
                  <option [ngValue]="null">— chuniye —</option>
                  @for (i of designs(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }
                </select></div>
              <div class="w-24"><label class="label">Rang</label>
                <input class="input" [(ngModel)]="rat.colour"></div>
              <div class="w-24"><label class="label">Kul piece</label>
                <input class="input" type="number" [(ngModel)]="rat.total"></div>
              <div class="w-40"><label class="label">Ratio</label>
                <input class="input" [(ngModel)]="rat.ratio" placeholder="S:1 M:2 L:1"></div>
              <div class="w-24"><label class="label">Rate ₹</label>
                <input class="input" type="number" [(ngModel)]="rat.rate"></div>
              <button class="btn-line btn-sm mb-0.5" (click)="ratioBharo()">LINES BANAO</button>
            </div>
            @if (ratErr()) {
              <p class="text-[11px] font-bold text-anjaninex-red mt-2">{{ ratErr() }}</p>
            }
          </div>

          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Kya manga</div>
          @for (l of f.lines; track $index) {
            <div class="flex gap-2 items-end mb-2">
              <div class="flex-1"><label class="label">Maal</label>
                <select class="input" [(ngModel)]="l.itemId">
                  <option [ngValue]="null">— chuniye —</option>
                  @for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }
                </select></div>
              <div class="w-24" *fld="'mfg_sales_order.colour'">
                <label class="label">{{ cfg.label('mfg_sales_order.colour') }}</label>
                <input class="input" [(ngModel)]="l.colour"></div>
              <div class="w-20" *fld="'mfg_sales_order.size'">
                <label class="label">{{ cfg.label('mfg_sales_order.size') }}</label>
                <input class="input" [(ngModel)]="l.size"></div>
              <div class="w-24"><label class="label">Qty</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.qty"></div>
              <div class="w-20"><label class="label">Unit</label>
                <select class="input" [(ngModel)]="l.unit">
                  @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                </select></div>
              <div class="w-28"><label class="label">Rate ₹</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.rate"></div>
              <div class="w-24 text-right text-sm font-bold text-anjaninex-navy pb-2">
                ₹{{ (l.qty || 0) * (l.rate || 0) | number:'1.0-0' }}</div>
              <button class="text-anjaninex-red font-bold pb-2.5"
                      (click)="f.lines.splice($index,1); touch()">✕</button>
            </div>
          }
          <button class="btn-line btn-sm mb-4" (click)="addLine()">＋ MAAL JODO</button>

          <div class="text-right font-extrabold text-anjaninex-navy mb-3">
            {{ kulQty(f) | number:'1.0-2' }} piece · Kul ₹{{ total(f) | number:'1.0-2' }}
          </div>

          <div class="flex gap-2">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : (editId() ? 'SAVE KARO' : 'ORDER BANAO') }}</button>
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
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.soNo }}</h3>
              <p class="text-xs text-gray-500">
                {{ d.partyName }} · {{ d.orderDate | date:'d MMM y' }}
                @if (d.agentName) { · agent {{ d.agentName }} }
              </p>
            </div>
            <button class="ml-auto text-2xl text-slate-400" (click)="detail.set(null)">✕</button>
          </div>

          <table class="w-full text-xs">
            <tr class="text-gray-500 text-left">
              <th class="font-semibold pb-1">Maal</th>
              <th class="font-semibold pb-1 text-right">Manga</th>
              <th class="font-semibold pb-1 text-right">Gaya</th>
              <th class="font-semibold pb-1 text-right">Baki</th>
              <th class="font-semibold pb-1 text-right">Stock</th>
            </tr>
            @for (l of d.lines; track l.id) {
              <tr class="border-t border-[color:var(--ax-border)]">
                <td class="py-1.5">
                  {{ l.itemName }}
                  @if (l.colour) { <span class="text-slate-400">· {{ l.colour }}</span> }
                  @if (l.size) { <span class="text-slate-400">· {{ l.size }}</span> }
                </td>
                <td class="py-1.5 text-right">{{ l.qty | number:'1.0-2' }} {{ l.unit }}</td>
                <td class="py-1.5 text-right text-emerald-700">{{ l.dispatched | number:'1.0-2' }}</td>
                <td class="py-1.5 text-right font-bold"
                    [class.text-amber-700]="(l.pending || 0) > 0">{{ l.pending | number:'1.0-2' }}</td>
                <!-- Stock baki se kam hai to laal — banana padega -->
                <td class="py-1.5 text-right"
                    [class.text-anjaninex-red]="(l.stockHai || 0) < (l.pending || 0)">
                  {{ l.stockHai | number:'1.0-2' }}</td>
              </tr>
            }
          </table>

          @if (d.note) { <p class="text-xs text-slate-500 mt-3">📝 {{ d.note }}</p> }
        </div>
      </div>
    }
  `
})
export class SalesOrdersComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);
  /** Firm ne kaunsa field on/off kiya — template isi se poochta hai. */
  cfg = inject(FieldConfigService);

  tabs = [
    { key: '',          label: 'Chal rahe' },
    { key: 'done',      label: 'Poore' },
    { key: 'cancelled', label: 'Cancel' },
    { key: 'all',       label: 'Sab' }
  ];
  status = signal('');
  units = UNITS;

  rows = signal<SalesOrder[]>([]);
  customers = signal<any[]>([]);
  items = signal<any[]>([]);
  designs = signal<any[]>([]);
  godowns = signal<any[]>([]);
  agents = signal<any[]>([]);

  loading = signal(true);
  err = signal('');
  search = '';

  form = signal<any | null>(null);
  editId = signal<string | null>(null);
  formErr = signal('');
  saving = signal(false);
  detail = signal<SalesOrder | null>(null);

  /** Ratio wali madad ka apna chhota form. */
  rat: any = { itemId: null, colour: null, total: 0, ratio: '', rate: 0 };
  ratErr = signal('');

  constructor() {
    this.load();
    this.http.get<any[]>(`${this.base}/parties?kind=customer`)
      .subscribe({ next: r => this.customers.set(r) });
    this.http.get<any[]>(`${this.base}/items`).subscribe({
      next: r => { this.items.set(r); this.designs.set(r.filter(i => i.itemKind === 'design')); }
    });
    this.http.get<any[]>(`${this.base}/godowns`).subscribe({ next: r => this.godowns.set(r) });
    this.http.get<any[]>(`${this.base}/agents?kind=grahak`).subscribe({ next: r => this.agents.set(r) });
  }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.status()) q.set('status', this.status());
    if (this.search) q.set('search', this.search);

    this.http.get<SalesOrder[]>(`${this.base}/sales-orders?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }

  label(s: string) {
    return s === 'done' ? 'POORA' : s === 'cancelled' ? 'CANCEL'
         : s === 'partial' ? 'KUCH GAYA' : 'KHULA';
  }

  /**
   * Card par chetavni: jis maal ka stock bhejne se kam hai uska naam.
   * Order lete waqt hi pata chal jaye ki banana padega.
   */
  kamStock(s: SalesOrder): string {
    const kam = s.lines.filter(l => (l.stockHai ?? 0) < (l.pending ?? 0));
    if (kam.length === 0) return '';
    const naam = kam.slice(0, 2).map(l => l.itemName).join(', ');
    return kam.length > 2 ? `${naam} +${kam.length - 2} banane hain` : `${naam} banana hai`;
  }

  openNew() {
    this.editId.set(null);
    this.formErr.set('');
    this.resetRatio();
    this.form.set({
      partyId: null, agentId: null,
      godownId: this.godowns().find(g => g.isMain)?.id ?? this.godowns()[0]?.id ?? null,
      orderDate: todayStr(), dueAt: null, transport: null, buyerRef: null, note: null,
      lines: [this.blankLine()]
    });
  }

  openEdit(s: SalesOrder) {
    this.editId.set(s.id);
    this.formErr.set('');
    this.resetRatio();
    this.http.get<SalesOrder>(`${this.base}/sales-orders/${s.id}`).subscribe({
      next: full => this.form.set({
        partyId: full.partyId, agentId: full.agentId, godownId: full.godownId,
        orderDate: full.orderDate, dueAt: full.dueAt, transport: full.transport,
        buyerRef: full.buyerRef, note: full.note,
        lines: full.lines.map(l => ({
          itemId: l.itemId, colour: l.colour, size: l.size, qty: l.qty,
          unit: l.unit, rate: l.rate, ratioNote: l.ratioNote
        }))
      }),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khul paya')
    });
  }

  /**
   * "S:1 M:2 L:1" + 60 piece → S 15, M 30, L 15.
   * Aakhri size me bacha hua daalte hain, warna gol karne se piece gum ho
   * jate hain aur jod kul se kam ban jata hai — wahi job slip wala hisab.
   */
  ratioBharo() {
    this.ratErr.set('');
    const f = this.form();
    if (!f) return;

    if (!this.rat.itemId) { this.ratErr.set('Design chuniye'); return; }
    const total = +this.rat.total || 0;
    if (total <= 0) { this.ratErr.set('Kul piece daaliye'); return; }

    // "S:1 M:2 L:1" ya "S-1, M-2" — dono chalte hain
    const parts = (this.rat.ratio || '').split(/[,\s]+/).filter((x: string) => x);
    const pairs: { size: string; r: number }[] = [];
    for (const p of parts) {
      const m = p.match(/^(.+?)[:\-](\d+(?:\.\d+)?)$/);
      if (!m) { this.ratErr.set(`"${p}" samajh nahi aaya — aise likhiye: S:1 M:2 L:1`); return; }
      pairs.push({ size: m[1].toUpperCase(), r: +m[2] });
    }
    if (pairs.length === 0) { this.ratErr.set('Ratio daaliye, jaise S:1 M:2 L:1'); return; }

    const sum = pairs.reduce((a, p) => a + p.r, 0);
    if (sum <= 0) { this.ratErr.set('Ratio 0 nahi ho sakta'); return; }

    const ratioNote = pairs.map(p => `${p.size}:${p.r}`).join(' ');
    let used = 0;
    const nayi = pairs.map((p, i) => {
      const isLast = i === pairs.length - 1;
      const qty = isLast ? total - used : Math.floor(total * p.r / sum);
      used += qty;
      return {
        itemId: this.rat.itemId, colour: this.rat.colour || null, size: p.size,
        qty, unit: 'Pcs', rate: +this.rat.rate || 0, ratioNote
      };
    }).filter(l => l.qty > 0);

    // Pehli line khali padi ho to usko hata do — warna ek bekaar line reh jati hai
    const khali = f.lines.length === 1 && !f.lines[0].itemId;
    f.lines = khali ? nayi : [...f.lines, ...nayi];
    this.touch();
    this.resetRatio();
  }

  private resetRatio() {
    this.rat = { itemId: null, colour: null, total: 0, ratio: '', rate: 0 };
    this.ratErr.set('');
  }

  private blankLine(): SoLine {
    return { itemId: null, colour: null, size: null, qty: 0,
             unit: 'Pcs', rate: 0, ratioNote: null };
  }
  addLine() { this.form()!.lines.push(this.blankLine()); this.touch(); }
  touch()   { this.form.set({ ...this.form()! }); }

  kulQty(f: any): number {
    return (f.lines ?? []).reduce((a: number, l: SoLine) => a + (+l.qty || 0), 0);
  }
  total(f: any): number {
    return (f.lines ?? []).reduce((a: number, l: SoLine) => a + (l.qty || 0) * (l.rate || 0), 0);
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    const id = this.editId();
    const call = id
      ? this.http.put(`${this.base}/sales-orders/${id}`, f)
      : this.http.post(`${this.base}/sales-orders`, f);

    call.subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openDetail(s: SalesOrder) {
    this.http.get<SalesOrder>(`${this.base}/sales-orders/${s.id}`).subscribe({
      next: full => this.detail.set(full),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khul paya')
    });
  }

  cancel(s: SalesOrder) {
    if (!confirm(`${s.soNo} cancel karna hai?`)) return;
    this.http.post(`${this.base}/sales-orders/${s.id}/cancel`, {}).subscribe({
      next: () => this.load(),
      error: e => this.err.set(e?.error?.error ?? 'Cancel nahi hua')
    });
  }
}
