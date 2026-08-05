import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { todayStr } from '../../core/date.util';

interface TrLine {
  id?: string; itemId: string | null; itemName?: string;
  colour: string | null; size: string | null;
  qty: number; unit: string;
  /** Sirf screen par — us godown me kitna pada hai */
  hai?: number;
}
interface Transfer {
  id: string; transferNo: string;
  fromGodownId: string; fromGodownName: string;
  toGodownId: string; toGodownName: string;
  transferDate: string; transport: string | null; lrNo: string | null;
  vehicleNo: string | null; note: string | null;
  lines: TrLine[]; totalQty: number;
}
interface GodownStock {
  itemId: string; itemName: string; itemKind: string;
  colour: string | null; size: string | null; onHand: number;
}

const UNITS = ['Pcs', 'Set', 'Meter', 'Kg', 'Than', 'Roll'];

/**
 * Stock Transfer — maal ek godown se doosre me.
 *
 * Har line par DO ledger entry banti hain: nikalne wale se ghata, aane wale
 * me jama. Kul stock waisa ka waisa — sirf jagah badalti hai.
 *
 * Maal chunne ki list us godown ke stock se aati hai, poori item list se
 * nahi — warna aadmi wo cheez chun leta jo us godown me hai hi nahi, aur
 * save par rok lagti. Pehle hi sahi list dena behtar hai.
 */
@Component({
  selector: 'mfg-stock-transfer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-top-bar">
      <input class="input max-w-[280px]" placeholder="🔍 transfer, LR ya gaadi number"
             [(ngModel)]="search" (ngModelChange)="load()">
      @if (auth.can('stock.design.edit.firm')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ MAAL DOOSRE GODOWN BHEJO</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Abhi tak koi transfer nahi hua</div>
    } @else {
      <div class="space-y-2">
        @for (t of rows(); track t.id) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-violet-50 grid place-items-center text-xl">🔀</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">{{ t.transferNo }}</div>
                <div class="text-xs text-slate-500">
                  {{ t.fromGodownName }} <span class="text-anjaninex-navy font-bold">→</span>
                  {{ t.toGodownName }}
                </div>
                <div class="text-xs text-slate-500">
                  {{ t.transferDate | date:'d MMM' }}
                  @if (t.lrNo) { · LR {{ t.lrNo }} }
                  @if (t.vehicleNo) { · {{ t.vehicleNo }} }
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div><b class="text-anjaninex-navy">{{ t.totalQty | number:'1.0-2' }}</b> maal</div>
                <div class="text-slate-500">{{ t.lines.length }} line</div>
              </div>
            </div>
            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openDetail(t)">DEKHO</button>
              @if (auth.can('stock.design.edit.firm')) {
                <button class="text-[11px] font-bold text-anjaninex-red" (click)="remove(t)">HATAO</button>
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
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">Maal doosre godown bhejo</h3>
          <p class="text-xs text-gray-500 mb-3">
            Kul stock nahi badlega — sirf jagah badlegi
          </p>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-3 gap-3 mb-4">
            <div><label class="label" style="color:#DC2626">Kahan se *</label>
              <select class="input" [(ngModel)]="f.fromGodownId" (ngModelChange)="fromBadla()">
                <option [ngValue]="null">— chuniye —</option>
                @for (g of godowns(); track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }
              </select></div>
            <div><label class="label" style="color:#DC2626">Kahan bhejna hai *</label>
              <select class="input" [(ngModel)]="f.toGodownId">
                <option [ngValue]="null">— chuniye —</option>
                <!-- Jahan se nikal raha hai wahi jagah list me nahi aani chahiye -->
                @for (g of godowns(); track g.id) {
                  @if (g.id !== f.fromGodownId) { <option [ngValue]="g.id">{{ g.name }}</option> }
                }
              </select></div>
            <div><label class="label">Tareekh</label>
              <input class="input" type="date" [(ngModel)]="f.transferDate"></div>

            <div><label class="label">Transport</label>
              <input class="input" [(ngModel)]="f.transport"></div>
            <div><label class="label">LR / builty no.</label>
              <input class="input" [(ngModel)]="f.lrNo"></div>
            <div><label class="label">Gaadi number</label>
              <input class="input" [(ngModel)]="f.vehicleNo"></div>
            <div class="col-span-3"><label class="label">Note</label>
              <input class="input" [(ngModel)]="f.note"></div>
          </div>

          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Kya bhejna hai</div>
          @if (!f.fromGodownId) {
            <p class="text-xs text-slate-400 mb-3">Pehle "kahan se" chuniye</p>
          } @else if (stock().length === 0) {
            <p class="text-xs text-slate-400 mb-3">Is godown me abhi kuch nahi hai</p>
          } @else {
            @for (l of f.lines; track $index) {
              <div class="flex gap-2 items-end mb-2">
                <div class="flex-1"><label class="label">Maal</label>
                  <select class="input" [ngModel]="key(l)" (ngModelChange)="mallChuna(l, $event)">
                    <option [ngValue]="null">— chuniye —</option>
                    @for (s of stock(); track key(s)) {
                      <option [ngValue]="key(s)">
                        {{ s.itemName }}@if (s.colour) { · {{ s.colour }} }@if (s.size) { · {{ s.size }} }
                        ({{ s.onHand | number:'1.0-2' }})</option>
                    }
                  </select></div>
                <div class="w-28"><label class="label">Kitna bhejna</label>
                  <input class="input" type="number" step="0.01" [(ngModel)]="l.qty">
                  @if (l.hai != null) {
                    <p class="text-[10.5px] text-gray-500 mt-1">{{ l.hai | number:'1.0-2' }} pada hai</p>
                  }
                </div>
                <div class="w-20"><label class="label">Unit</label>
                  <select class="input" [(ngModel)]="l.unit">
                    @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                  </select></div>
                <button class="text-anjaninex-red font-bold pb-2.5"
                        (click)="f.lines.splice($index,1); touch()">✕</button>
              </div>
            }
            <button class="btn-line btn-sm mb-4" (click)="addLine()">＋ MAAL JODO</button>
          }

          <div class="text-right font-extrabold text-anjaninex-navy mb-3">
            Kul {{ kulQty(f) | number:'1.0-2' }} maal
          </div>

          <div class="flex gap-2">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : 'TRANSFER KARO' }}</button>
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
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.transferNo }}</h3>
              <p class="text-xs text-gray-500">
                {{ d.fromGodownName }} → {{ d.toGodownName }} ·
                {{ d.transferDate | date:'d MMM y' }}</p>
              @if (d.transport || d.lrNo || d.vehicleNo) {
                <p class="text-xs text-gray-500">
                  🚚 {{ d.transport }}
                  @if (d.lrNo) { · LR {{ d.lrNo }} }
                  @if (d.vehicleNo) { · {{ d.vehicleNo }} }
                </p>
              }
            </div>
            <button class="ml-auto text-2xl text-slate-400" (click)="detail.set(null)">✕</button>
          </div>

          <table class="w-full text-xs">
            <tr class="text-gray-500 text-left">
              <th class="font-semibold pb-1">Maal</th>
              <th class="font-semibold pb-1 text-right">Qty</th>
            </tr>
            @for (l of d.lines; track l.id) {
              <tr class="border-t border-[color:var(--ax-border)]">
                <td class="py-1.5">
                  {{ l.itemName }}
                  @if (l.colour) { <span class="text-slate-400">· {{ l.colour }}</span> }
                  @if (l.size) { <span class="text-slate-400">· {{ l.size }}</span> }
                </td>
                <td class="py-1.5 text-right font-bold">{{ l.qty | number:'1.0-2' }} {{ l.unit }}</td>
              </tr>
            }
          </table>

          @if (d.note) { <p class="text-xs text-slate-500 mt-3">📝 {{ d.note }}</p> }
        </div>
      </div>
    }
  `
})
export class StockTransferComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  units = UNITS;
  rows = signal<Transfer[]>([]);
  godowns = signal<any[]>([]);
  /** Nikalne wale godown me kya-kya pada hai. */
  stock = signal<GodownStock[]>([]);

  loading = signal(true);
  err = signal('');
  search = '';

  form = signal<any | null>(null);
  formErr = signal('');
  saving = signal(false);
  detail = signal<Transfer | null>(null);

  constructor() {
    this.load();
    this.http.get<any[]>(`${this.base}/godowns`).subscribe({ next: r => this.godowns.set(r) });
  }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.search) q.set('search', this.search);

    this.http.get<Transfer[]>(`${this.base}/stock-transfers?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }

  openNew() {
    this.formErr.set('');
    this.stock.set([]);
    this.form.set({
      fromGodownId: null, toGodownId: null, transferDate: todayStr(),
      transport: null, lrNo: null, vehicleNo: null, note: null,
      lines: [this.blankLine()]
    });
  }

  /** Godown badla to us godown ka stock aur purani lines dono bekaar. */
  fromBadla() {
    const f = this.form();
    if (!f) return;
    f.lines = [this.blankLine()];
    if (f.toGodownId === f.fromGodownId) f.toGodownId = null;
    this.touch();

    if (!f.fromGodownId) { this.stock.set([]); return; }
    this.http.get<GodownStock[]>(`${this.base}/stock-transfers/godown/${f.fromGodownId}/stock`)
      .subscribe({
        next: r => this.stock.set(r),
        error: () => this.stock.set([])
      });
  }

  /**
   * Ek line ki pehchaan — maal + rang + size. Sirf itemId se kaam nahi chalta:
   * ek hi design alag rang me alag dher hota hai, aur "kitna pada hai" bhi
   * usi dher ka dekhna hota hai.
   */
  key(x: { itemId: string | null; colour: string | null; size: string | null }): string | null {
    return x.itemId ? `${x.itemId}|${x.colour ?? ''}|${x.size ?? ''}` : null;
  }

  mallChuna(l: TrLine, k: string | null) {
    const s = this.stock().find(x => this.key(x) === k);
    if (!s) { l.itemId = null; l.colour = null; l.size = null; l.hai = undefined; return; }
    l.itemId = s.itemId; l.colour = s.colour; l.size = s.size; l.hai = s.onHand;
    this.touch();
  }

  private blankLine(): TrLine {
    return { itemId: null, colour: null, size: null, qty: 0, unit: 'Pcs' };
  }
  addLine() { this.form()!.lines.push(this.blankLine()); this.touch(); }
  touch()   { this.form.set({ ...this.form()! }); }

  kulQty(f: any): number {
    return (f.lines ?? []).reduce((a: number, l: TrLine) => a + (+l.qty || 0), 0);
  }

  save() {
    const f = this.form();
    if (!f) return;
    if (!f.fromGodownId || !f.toGodownId) {
      this.formErr.set('Dono godown chuniye — kahan se aur kahan bhejna hai');
      return;
    }
    const lines = (f.lines as TrLine[]).filter(l => l.itemId && (l.qty || 0) > 0);
    if (lines.length === 0) { this.formErr.set('Kam se kam ek maal aur uski qty daaliye'); return; }

    this.saving.set(true);
    this.formErr.set('');
    this.http.post(`${this.base}/stock-transfers`, { ...f, lines }).subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openDetail(t: Transfer) {
    this.http.get<Transfer>(`${this.base}/stock-transfers/${t.id}`).subscribe({
      next: full => this.detail.set(full),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khula')
    });
  }

  remove(t: Transfer) {
    if (!confirm(`${t.transferNo} hatana hai? Maal wapas ${t.fromGodownName} me chala jayega.`)) return;
    this.http.delete(`${this.base}/stock-transfers/${t.id}`).subscribe({
      next: () => this.load(),
      error: e => this.err.set(e?.error?.error ?? 'Nahi hata')
    });
  }
}
