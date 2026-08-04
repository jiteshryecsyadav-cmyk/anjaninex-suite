import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { todayStr } from '../../core/date.util';

interface PrLine {
  id?: string; itemId: string | null; itemName?: string;
  colour: string | null; size: string | null;
  qty: number; unit: string; rate: number;
  /** Sirf screen par — inward se bhara ho to "itna aaya tha" dikhane ke liye */
  aayaTha?: number;
}
interface PurchaseReturn {
  id: string; dnNo: string; godownId: string; godownName: string;
  partyId: string; partyName: string; inwardId: string | null; inwardNo: string | null;
  returnDate: string; reason: string | null; note: string | null;
  lines: PrLine[]; totalQty: number; totalAmount: number;
}

const UNITS = ['Meter', 'Kg', 'Pcs', 'Than', 'Roll'];
const REASONS = ['Kapda kharab nikla', 'Rang match nahi hua', 'Kam maal aaya',
                 'Galat maal bheja', 'Rate par baat nahi bani', 'Der se aaya'];

/**
 * Purchase Return — kharab maal mill ko wapas.
 *
 * Ye DEBIT note hai: hum paisa wapas MAANGTE hain. Stock godown se GHATTA hai,
 * kyunki maal ab hamare paas hai hi nahi.
 */
@Component({
  selector: 'mfg-purchase-returns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-top-bar">
      <input class="input max-w-[240px]" placeholder="🔍 debit note number"
             [(ngModel)]="search" (ngModelChange)="load()">
      @if (auth.can('purchase.preturn.create.place')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ MAAL WAPAS BHEJO</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Abhi tak koi maal wapas nahi gaya</div>
    } @else {
      <div class="space-y-2">
        @for (r of rows(); track r.id) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-rose-50 grid place-items-center text-xl">↪️</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">
                  {{ r.dnNo }}
                  @if (r.inwardNo) {
                    <span class="chip ml-1 bg-sky-50 text-sky-700">{{ r.inwardNo }}</span>
                  }
                </div>
                <div class="text-xs text-slate-500">{{ r.partyName }} · {{ r.godownName }} se</div>
                <div class="text-xs text-slate-500">
                  {{ r.returnDate | date:'d MMM' }}
                  @if (r.reason) { · {{ r.reason }} }
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div><b class="text-anjaninex-red">{{ r.totalQty | number:'1.0-2' }}</b> wapas</div>
                <div class="text-slate-500">₹{{ r.totalAmount | number:'1.0-0' }} lena hai</div>
              </div>
            </div>

            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openDetail(r)">DEKHO</button>
              @if (auth.can('purchase.preturn.delete.place')) {
                <button class="text-[11px] font-bold text-anjaninex-red" (click)="remove(r)">HATAO</button>
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
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">Maal wapas bhejo</h3>
          <p class="text-xs text-gray-500 mb-3">
            Debit note banega — mill se paisa wapas lena hai. Stock ghat jayega.
          </p>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="col-span-2"><label class="label" style="color:#DC2626">Supplier *</label>
              <select class="input" [(ngModel)]="f.partyId" (ngModelChange)="partyBadli()">
                <option [ngValue]="null">— chuniye —</option>
                @for (s of suppliers(); track s.id) { <option [ngValue]="s.id">{{ s.displayName }}</option> }
              </select></div>
            <div><label class="label" style="color:#DC2626">Godown *</label>
              <select class="input" [(ngModel)]="f.godownId">
                @for (g of godowns(); track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }
              </select></div>

            <div class="col-span-2"><label class="label">Kis inward ka maal hai</label>
              <select class="input" [(ngModel)]="f.inwardId" (ngModelChange)="inwardChuna()"
                      [disabled]="!f.partyId">
                <option [ngValue]="null">— bataana nahi hai —</option>
                @for (i of inwards(); track i.id) {
                  <option [ngValue]="i.id">
                    {{ i.inwardNo }} · {{ i.inwardDate | date:'d MMM' }}</option>
                }
              </select>
              <p class="text-[10.5px] text-gray-500 mt-1">
                Inward chunoge to "itna hi wapas ja sakta hai" ki rok apne aap lag jayegi
              </p>
            </div>
            <div><label class="label">Tareekh</label>
              <input class="input" type="date" [(ngModel)]="f.returnDate"></div>

            <div class="col-span-2"><label class="label">Kyon wapas ja raha hai</label>
              <select class="input" [(ngModel)]="f.reason">
                <option [ngValue]="null">— chuniye —</option>
                @for (r of reasons; track r) { <option [value]="r">{{ r }}</option> }
              </select></div>
            <div><label class="label">Note</label>
              <input class="input" [(ngModel)]="f.note"></div>
          </div>

          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Kya wapas ja raha hai</div>
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
              <div class="w-24"><label class="label">Qty</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.qty">
                @if (l.aayaTha != null) {
                  <p class="text-[10.5px] text-gray-500 mt-1">{{ l.aayaTha | number:'1.0-2' }} aaya tha</p>
                }
              </div>
              <div class="w-20"><label class="label">Unit</label>
                <select class="input" [(ngModel)]="l.unit">
                  @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                </select></div>
              <div class="w-28"><label class="label">Rate ₹</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="l.rate"></div>
              <button class="text-anjaninex-red font-bold pb-2.5"
                      (click)="f.lines.splice($index,1); touch()">✕</button>
            </div>
          }
          <button class="btn-line btn-sm mb-4" (click)="addLine()">＋ MAAL JODO</button>

          <div class="text-right font-extrabold text-anjaninex-navy mb-3">
            Kul ₹{{ total(f) | number:'1.0-2' }} wapas lena hai
          </div>

          <div class="flex gap-2">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : 'DEBIT NOTE BANAO' }}</button>
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
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.dnNo }}</h3>
              <p class="text-xs text-gray-500">
                {{ d.partyName }} · {{ d.returnDate | date:'d MMM y' }}
                @if (d.inwardNo) { · {{ d.inwardNo }} }
              </p>
            </div>
            <button class="ml-auto text-2xl text-slate-400" (click)="detail.set(null)">✕</button>
          </div>

          @if (d.reason) {
            <div class="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-800 text-xs font-bold mb-3">
              {{ d.reason }}</div>
          }

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
export class PurchaseReturnsComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  units = UNITS;
  reasons = REASONS;

  rows = signal<PurchaseReturn[]>([]);
  suppliers = signal<any[]>([]);
  items = signal<any[]>([]);
  godowns = signal<any[]>([]);
  /** Chune hue supplier ki inwards — "kis maal ka return" wali dropdown. */
  inwards = signal<any[]>([]);

  loading = signal(true);
  err = signal('');
  search = '';

  form = signal<any | null>(null);
  formErr = signal('');
  saving = signal(false);
  detail = signal<PurchaseReturn | null>(null);

  constructor() {
    this.load();
    this.http.get<any[]>(`${this.base}/parties?kind=supplier`)
      .subscribe({ next: r => this.suppliers.set(r) });
    this.http.get<any[]>(`${this.base}/items`).subscribe({ next: r => this.items.set(r) });
    this.http.get<any[]>(`${this.base}/godowns`).subscribe({ next: r => this.godowns.set(r) });
  }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.search) q.set('search', this.search);

    this.http.get<PurchaseReturn[]>(`${this.base}/purchase-returns?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }

  openNew() {
    this.formErr.set('');
    this.inwards.set([]);
    this.form.set({
      partyId: null, inwardId: null,
      godownId: this.godowns().find(g => g.isMain)?.id ?? this.godowns()[0]?.id ?? null,
      returnDate: todayStr(), reason: null, note: null,
      lines: [this.blankLine()]
    });
  }

  partyBadli() {
    const f = this.form();
    if (!f) return;
    f.inwardId = null;
    f.lines = [this.blankLine()];
    this.touch();

    if (!f.partyId) { this.inwards.set([]); return; }
    this.http.get<any[]>(`${this.base}/inwards?partyId=${f.partyId}`).subscribe({
      next: r => this.inwards.set(r),
      error: () => this.inwards.set([])
    });
  }

  /** Inward chunte hi uska maal lines me bhar do — qty 0 se shuru, kitna wapas
   *  ja raha hai wo aadmi khud bharega. */
  inwardChuna() {
    const f = this.form();
    if (!f) return;
    if (!f.inwardId) { f.lines = [this.blankLine()]; this.touch(); return; }

    this.http.get<any>(`${this.base}/inwards/${f.inwardId}`).subscribe({
      next: inw => {
        f.lines = (inw.lines ?? []).map((l: any) => ({
          itemId: l.itemId, colour: l.colour, size: l.size,
          qty: 0, unit: l.unit, rate: l.rate, aayaTha: l.qty
        }));
        if (f.lines.length === 0) f.lines = [this.blankLine()];
        f.godownId = inw.godownId;
        this.touch();
      },
      error: e => this.formErr.set(e?.error?.error ?? 'Inward ki lines nahi aa payin')
    });
  }

  private blankLine(): PrLine {
    return { itemId: null, colour: null, size: null, qty: 0, unit: 'Meter', rate: 0 };
  }
  addLine() { this.form()!.lines.push(this.blankLine()); this.touch(); }
  touch()   { this.form.set({ ...this.form()! }); }

  total(f: any): number {
    return (f.lines ?? []).reduce((a: number, l: PrLine) => a + (l.qty || 0) * (l.rate || 0), 0);
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    // Inward se bhari lines me se jo 0 hain wo wapas nahi ja rahi — mat bhejo
    const body = { ...f, lines: (f.lines as PrLine[]).filter(l => (l.qty || 0) > 0) };

    this.http.post(`${this.base}/purchase-returns`, body).subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openDetail(r: PurchaseReturn) {
    this.http.get<PurchaseReturn>(`${this.base}/purchase-returns/${r.id}`).subscribe({
      next: full => this.detail.set(full),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khul paya')
    });
  }

  remove(r: PurchaseReturn) {
    if (!confirm(`${r.dnNo} hatana hai? Ye maal stock me wapas aa jayega.`)) return;
    this.http.delete(`${this.base}/purchase-returns/${r.id}`).subscribe({
      next: () => this.load(),
      error: e => this.err.set(e?.error?.error ?? 'Nahi hat paya')
    });
  }
}
