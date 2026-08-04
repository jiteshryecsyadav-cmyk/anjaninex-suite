import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

interface PoLine {
  id?: string; itemId: string | null; itemName?: string;
  colour: string | null; size: string | null;
  qty: number; unit: string; rate: number;
  dealerCode: string | null; lotNo: string | null;
  received?: number; pending?: number;
}
interface PurchaseOrder {
  id: string; poNo: string; partyId: string; partyName: string;
  agentId: string | null; agentName: string | null;
  godownId: string | null; godownName: string | null;
  orderDate: string; dueAt: string | null; transport: string | null; note: string | null;
  status: string; lines: PoLine[];
  totalQty: number; totalAmount: number; pendingQty: number;
}

const UNITS = ['Meter', 'Kg', 'Pcs', 'Than', 'Roll'];

/**
 * Purchase Order — mill ko diya hua order.
 *
 * Stock yahan nahi badalta (maal abhi aaya hi nahi). Iska poora faayda tab
 * milta hai jab Inward banti hai — tab ye batata hai ki kitna baki hai.
 */
@Component({
  selector: 'mfg-purchase-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
      <input class="input max-w-[240px]" placeholder="🔍 PO number"
             [(ngModel)]="search" (ngModelChange)="load()">
      @if (auth.can('purchase.po.create.place')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ NAYA PURCHASE ORDER</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Koi purchase order nahi mila</div>
    } @else {
      <div class="space-y-2">
        @for (p of rows(); track p.id) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-anjaninex-navy-soft grid place-items-center text-xl">🛍️</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">
                  {{ p.poNo }}
                  <span class="chip ml-1"
                        [class]="p.status === 'done' ? 'bg-emerald-50 text-emerald-700'
                               : p.status === 'cancelled' ? 'bg-slate-100 text-slate-500'
                               : p.status === 'partial' ? 'bg-amber-50 text-amber-700'
                               : 'bg-sky-50 text-sky-700'">
                    {{ label(p.status) }}
                  </span>
                </div>
                <div class="text-xs text-slate-500">{{ p.partyName }}</div>
                <div class="text-xs text-slate-500">
                  {{ p.orderDate | date:'d MMM' }} · {{ p.lines.length }} maal
                  @if (p.dueAt) { · {{ p.dueAt | date:'d MMM' }} tak }
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div><b class="text-anjaninex-navy">{{ p.totalQty | number:'1.0-2' }}</b> mangaya</div>
                <div class="text-slate-500">₹{{ p.totalAmount | number:'1.0-0' }}</div>
              </div>
            </div>

            <!-- Sabse zaroori line: kitna maal abhi aana baki hai -->
            @if (p.pendingQty > 0 && p.status !== 'cancelled') {
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold flex">
                <span>⏳ {{ p.pendingQty | number:'1.0-2' }} abhi aana baki</span>
                @if (p.status === 'partial') {
                  <span class="ml-auto">{{ (p.totalQty - p.pendingQty) | number:'1.0-2' }} aa chuka</span>
                }
              </div>
            } @else if (p.status === 'done') {
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold">
                ✅ Poora maal aa gaya
              </div>
            }

            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openDetail(p)">DEKHO</button>
              @if (p.status !== 'cancelled' && p.status !== 'done'
                   && auth.can('purchase.po.edit.place')) {
                <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openEdit(p)">BADLO</button>
              }
              @if (p.status === 'open' && auth.can('purchase.po.delete.place')) {
                <button class="text-[11px] font-bold text-anjaninex-red" (click)="cancel(p)">CANCEL</button>
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
            {{ editId() ? 'Purchase Order badlo' : 'Naya Purchase Order' }}</h3>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="col-span-2"><label class="label" style="color:#DC2626">Supplier *</label>
              <select class="input" [(ngModel)]="f.partyId">
                <option [ngValue]="null">— chuniye —</option>
                @for (s of suppliers(); track s.id) { <option [ngValue]="s.id">{{ s.displayName }}</option> }
              </select></div>
            <div><label class="label">Tareekh</label>
              <input class="input" type="date" [(ngModel)]="f.orderDate"></div>
            <div><label class="label">Godown</label>
              <select class="input" [(ngModel)]="f.godownId">
                <option [ngValue]="null">— koi nahi —</option>
                @for (g of godowns(); track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }
              </select></div>
            <div><label class="label">Agent</label>
              <select class="input" [(ngModel)]="f.agentId">
                <option [ngValue]="null">— koi nahi —</option>
                @for (a of agents(); track a.id) { <option [ngValue]="a.id">{{ a.name }}</option> }
              </select></div>
            <div><label class="label">Kab tak</label>
              <input class="input" type="date" [(ngModel)]="f.dueAt"></div>
            <div><label class="label">Transport</label>
              <input class="input" [(ngModel)]="f.transport"></div>
            <div class="col-span-2"><label class="label">Note</label>
              <input class="input" [(ngModel)]="f.note"></div>
          </div>

          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Kya mangaya</div>
          @for (l of f.lines; track $index) {
            <div class="border border-[color:var(--ax-border)] rounded-xl p-3 mb-2">
              <div class="flex gap-2 items-end mb-2">
                <div class="flex-1"><label class="label">Maal</label>
                  <select class="input" [(ngModel)]="l.itemId">
                    <option [ngValue]="null">— chuniye —</option>
                    @for (i of items(); track i.id) {
                      <option [ngValue]="i.id">{{ i.name }}</option>
                    }
                  </select></div>
                <div class="w-24"><label class="label">Rang</label>
                  <input class="input" [(ngModel)]="l.colour"></div>
                <div class="w-20"><label class="label">Size</label>
                  <input class="input" [(ngModel)]="l.size"></div>
                <button class="text-anjaninex-red font-bold pb-2.5"
                        (click)="f.lines.splice($index,1); touch()">✕</button>
              </div>
              <div class="flex gap-2 items-end">
                <div class="w-24"><label class="label">Qty</label>
                  <input class="input" type="number" step="0.01" [(ngModel)]="l.qty"></div>
                <div class="w-24"><label class="label">Unit</label>
                  <select class="input" [(ngModel)]="l.unit">
                    @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                  </select></div>
                <div class="w-28"><label class="label">Rate ₹</label>
                  <input class="input" type="number" step="0.01" [(ngModel)]="l.rate"></div>
                <div class="w-32"><label class="label">Mill ka code</label>
                  <input class="input" [(ngModel)]="l.dealerCode"></div>
                <div class="w-28"><label class="label">Lot</label>
                  <input class="input" [(ngModel)]="l.lotNo"></div>
                <div class="flex-1 text-right text-sm font-bold text-anjaninex-navy pb-2">
                  ₹{{ (l.qty || 0) * (l.rate || 0) | number:'1.0-2' }}
                </div>
              </div>
            </div>
          }
          <button class="btn-line btn-sm mb-4" (click)="addLine()">＋ MAAL JODO</button>

          <div class="text-right font-extrabold text-anjaninex-navy mb-3">
            Kul ₹{{ total(f) | number:'1.0-2' }}
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
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.poNo }}</h3>
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
              <th class="font-semibold pb-1 text-right">Mangaya</th>
              <th class="font-semibold pb-1 text-right">Aaya</th>
              <th class="font-semibold pb-1 text-right">Baki</th>
              <th class="font-semibold pb-1 text-right">Rate</th>
            </tr>
            @for (l of d.lines; track l.id) {
              <tr class="border-t border-[color:var(--ax-border)]">
                <td class="py-1.5">
                  {{ l.itemName }}
                  @if (l.colour) { <span class="text-slate-400">· {{ l.colour }}</span> }
                  @if (l.dealerCode) { <span class="text-slate-400 font-mono">· {{ l.dealerCode }}</span> }
                </td>
                <td class="py-1.5 text-right">{{ l.qty | number:'1.0-2' }} {{ l.unit }}</td>
                <td class="py-1.5 text-right text-emerald-700">{{ l.received | number:'1.0-2' }}</td>
                <td class="py-1.5 text-right font-bold"
                    [class.text-amber-700]="(l.pending || 0) > 0">{{ l.pending | number:'1.0-2' }}</td>
                <td class="py-1.5 text-right">₹{{ l.rate | number:'1.0-2' }}</td>
              </tr>
            }
          </table>

          @if (d.note) { <p class="text-xs text-slate-500 mt-3">📝 {{ d.note }}</p> }
        </div>
      </div>
    }
  `
})
export class PurchaseOrdersComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  tabs = [
    { key: '',          label: 'Chal rahe' },
    { key: 'done',      label: 'Poore' },
    { key: 'cancelled', label: 'Cancel' },
    { key: 'all',       label: 'Sab' }
  ];
  status = signal('');
  units = UNITS;

  rows = signal<PurchaseOrder[]>([]);
  suppliers = signal<any[]>([]);
  items = signal<any[]>([]);
  godowns = signal<any[]>([]);
  agents = signal<any[]>([]);

  loading = signal(true);
  err = signal('');
  search = '';

  form = signal<any | null>(null);
  editId = signal<string | null>(null);
  formErr = signal('');
  saving = signal(false);
  detail = signal<PurchaseOrder | null>(null);

  constructor() {
    this.load();
    this.http.get<any[]>(`${this.base}/parties?kind=supplier`)
      .subscribe({ next: r => this.suppliers.set(r) });
    this.http.get<any[]>(`${this.base}/items`).subscribe({ next: r => this.items.set(r) });
    this.http.get<any[]>(`${this.base}/godowns`).subscribe({ next: r => this.godowns.set(r) });
    // Yahan chhaanni nahi lagayi — mill ka dalal karigar wale khaane me bhi
    // likha ho sakta hai. Chhaanni lagate to wo list se hi gayab ho jata.
    this.http.get<any[]>(`${this.base}/agents`).subscribe({ next: r => this.agents.set(r) });
  }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.status()) q.set('status', this.status());
    if (this.search) q.set('search', this.search);

    this.http.get<PurchaseOrder[]>(`${this.base}/purchase-orders?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }

  label(s: string) {
    return s === 'done' ? 'POORA' : s === 'cancelled' ? 'CANCEL'
         : s === 'partial' ? 'KUCH AAYA' : 'KHULA';
  }

  openNew() {
    this.editId.set(null);
    this.formErr.set('');
    this.form.set({
      partyId: null, agentId: null,
      godownId: this.godowns().find(g => g.isMain)?.id ?? this.godowns()[0]?.id ?? null,
      orderDate: this.today(), dueAt: null, transport: null, note: null,
      lines: [this.blankLine()]
    });
  }

  openEdit(p: PurchaseOrder) {
    this.editId.set(p.id);
    this.formErr.set('');
    this.http.get<PurchaseOrder>(`${this.base}/purchase-orders/${p.id}`).subscribe({
      next: full => this.form.set({
        partyId: full.partyId, agentId: full.agentId, godownId: full.godownId,
        orderDate: full.orderDate, dueAt: full.dueAt,
        transport: full.transport, note: full.note,
        lines: full.lines.map(l => ({
          itemId: l.itemId, colour: l.colour, size: l.size, qty: l.qty,
          unit: l.unit, rate: l.rate, dealerCode: l.dealerCode, lotNo: l.lotNo
        }))
      }),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khul paya')
    });
  }

  private blankLine(): PoLine {
    return { itemId: null, colour: null, size: null, qty: 0,
             unit: 'Meter', rate: 0, dealerCode: null, lotNo: null };
  }
  addLine() { this.form()!.lines.push(this.blankLine()); this.touch(); }
  touch()   { this.form.set({ ...this.form()! }); }

  total(f: any): number {
    return (f.lines ?? []).reduce((a: number, l: PoLine) => a + (l.qty || 0) * (l.rate || 0), 0);
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    const id = this.editId();
    const call = id
      ? this.http.put(`${this.base}/purchase-orders/${id}`, f)
      : this.http.post(`${this.base}/purchase-orders`, f);

    call.subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openDetail(p: PurchaseOrder) {
    this.http.get<PurchaseOrder>(`${this.base}/purchase-orders/${p.id}`).subscribe({
      next: full => this.detail.set(full),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khul paya')
    });
  }

  cancel(p: PurchaseOrder) {
    if (!confirm(`${p.poNo} cancel karna hai?`)) return;
    this.http.post(`${this.base}/purchase-orders/${p.id}/cancel`, {}).subscribe({
      next: () => this.load(),
      error: e => this.err.set(e?.error?.error ?? 'Cancel nahi hua')
    });
  }

  private today(): string { return new Date().toISOString().slice(0, 10); }
}
