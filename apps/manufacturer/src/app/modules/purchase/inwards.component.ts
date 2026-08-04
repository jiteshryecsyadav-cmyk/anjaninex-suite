import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

interface InwardLine {
  id?: string; poLineId: string | null; itemId: string | null; itemName?: string;
  itemKind?: string; colour: string | null; size: string | null;
  qty: number; unit: string; rate: number;
  dealerCode: string | null; lotNo: string | null;
  /** Sirf screen par — PO se bhara hua ho to "kitna baki tha" dikhane ke liye */
  pendingThi?: number;
}
interface Inward {
  id: string; inwardNo: string; godownId: string; godownName: string;
  poId: string | null; poNo: string | null; partyId: string; partyName: string;
  inwardDate: string; supplierChallanNo: string | null; lrNo: string | null;
  transport: string | null; challanPhoto: string | null; note: string | null;
  lines: InwardLine[]; totalQty: number; totalAmount: number;
}

const UNITS = ['Meter', 'Kg', 'Pcs', 'Than', 'Roll'];

/**
 * Purchase Inward — maal godown me aa gaya.
 *
 * YAHI screen stock BADHATI hai. Job slip material bahar bhejta hai, ye andar
 * laati hai. Isliye PO chunte hi baki lines apne aap bhar jaati hain — munshi
 * ko dobara wahi ginti nahi likhni padti aur "aadha maal aaya" wali sabse aam
 * galti nahi hoti.
 */
@Component({
  selector: 'mfg-inwards',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-top-bar">
      <input class="input max-w-[280px]" placeholder="🔍 inward, challan ya LR number"
             [(ngModel)]="search" (ngModelChange)="load()">
      @if (auth.can('purchase.inward.create.place')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ MAAL ANDAR LO</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Abhi tak koi maal andar nahi aaya</div>
    } @else {
      <div class="space-y-2">
        @for (i of rows(); track i.id) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-emerald-50 grid place-items-center text-xl">📥</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">
                  {{ i.inwardNo }}
                  @if (i.poNo) {
                    <span class="chip ml-1 bg-sky-50 text-sky-700">{{ i.poNo }}</span>
                  } @else {
                    <span class="chip ml-1 bg-slate-100 text-slate-500">bina PO</span>
                  }
                </div>
                <div class="text-xs text-slate-500">{{ i.partyName }} → {{ i.godownName }}</div>
                <div class="text-xs text-slate-500">
                  {{ i.inwardDate | date:'d MMM' }}
                  @if (i.supplierChallanNo) { · challan {{ i.supplierChallanNo }} }
                  @if (i.lrNo) { · LR {{ i.lrNo }} }
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div><b class="text-emerald-700">{{ i.totalQty | number:'1.0-2' }}</b> aaya</div>
                <div class="text-slate-500">₹{{ i.totalAmount | number:'1.0-0' }}</div>
              </div>
            </div>

            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openDetail(i)">DEKHO</button>
              @if (auth.can('purchase.inward.delete.place')) {
                <button class="text-[11px] font-bold text-anjaninex-red" (click)="remove(i)">HATAO</button>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- ══ NAYI INWARD ══ -->
    @if (form(); as f) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="form.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">Maal andar lo</h3>
          <p class="text-xs text-gray-500 mb-3">
            Yahi entry stock badhati hai — jab tak ye na bane, maal app me nahi dikhta
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

            <!-- PO chunte hi baki lines khud bhar jati hain — yahi is screen ka dil hai -->
            <div class="col-span-2"><label class="label">Kis order ka maal hai</label>
              <select class="input" [(ngModel)]="f.poId" (ngModelChange)="poChuna()"
                      [disabled]="!f.partyId">
                <option [ngValue]="null">— bina PO ke aaya —</option>
                @for (p of openPos(); track p.id) {
                  <option [ngValue]="p.id">
                    {{ p.poNo }} · {{ p.pendingQty | number:'1.0-2' }} baki</option>
                }
              </select>
              @if (!f.partyId) {
                <p class="text-[10.5px] text-gray-500 mt-1">Pehle supplier chuniye</p>
              } @else if (openPos().length === 0) {
                <p class="text-[10.5px] text-gray-500 mt-1">Is supplier ka koi khula order nahi</p>
              }
            </div>
            <div><label class="label">Tareekh</label>
              <input class="input" type="date" [(ngModel)]="f.inwardDate"></div>

            <div><label class="label">Unka challan no.</label>
              <input class="input" [(ngModel)]="f.supplierChallanNo"></div>
            <div><label class="label">LR / builty no.</label>
              <input class="input" [(ngModel)]="f.lrNo"></div>
            <div><label class="label">Transport</label>
              <input class="input" [(ngModel)]="f.transport"></div>
          </div>

          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Kya aaya</div>
          @for (l of f.lines; track $index) {
            <!-- PO se bhari line halki neeli — haath se jodi hui alag dikhe -->
            <div class="border border-[color:var(--ax-border)] rounded-xl p-3 mb-2"
                 [class.bg-sky-50]="!!l.poLineId">
              <div class="flex gap-2 items-end mb-2">
                <div class="flex-1"><label class="label">Maal</label>
                  <select class="input" [(ngModel)]="l.itemId" [disabled]="!!l.poLineId">
                    <option [ngValue]="null">— chuniye —</option>
                    @for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }
                  </select></div>
                <div class="w-24"><label class="label">Rang</label>
                  <input class="input" [(ngModel)]="l.colour"></div>
                <div class="w-20"><label class="label">Size</label>
                  <input class="input" [(ngModel)]="l.size"></div>
                @if (!l.poLineId) {
                  <button class="text-anjaninex-red font-bold pb-2.5"
                          (click)="f.lines.splice($index,1); touch()">✕</button>
                }
              </div>
              <div class="flex gap-2 items-end">
                <div class="w-24"><label class="label">Kitna aaya</label>
                  <input class="input" type="number" step="0.01" [(ngModel)]="l.qty"></div>
                <div class="w-24"><label class="label">Unit</label>
                  <select class="input" [(ngModel)]="l.unit" [disabled]="!!l.poLineId">
                    @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                  </select></div>
                <div class="w-28"><label class="label">Rate ₹</label>
                  <input class="input" type="number" step="0.01" [(ngModel)]="l.rate"></div>
                <div class="w-32"><label class="label">Mill ka code</label>
                  <input class="input" [(ngModel)]="l.dealerCode"></div>
                <div class="w-28"><label class="label">Lot</label>
                  <input class="input" [(ngModel)]="l.lotNo"></div>
                <div class="flex-1 text-right pb-2">
                  @if (l.pendingThi != null) {
                    <div class="text-[10.5px] text-slate-500">order me {{ l.pendingThi | number:'1.0-2' }} baki thi</div>
                  }
                  <div class="text-sm font-bold text-anjaninex-navy">
                    ₹{{ (l.qty || 0) * (l.rate || 0) | number:'1.0-2' }}</div>
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
              {{ saving() ? 'Ruk jaiye…' : 'MAAL ANDAR LO' }}</button>
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
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.inwardNo }}</h3>
              <p class="text-xs text-gray-500">
                {{ d.partyName }} → {{ d.godownName }} · {{ d.inwardDate | date:'d MMM y' }}
                @if (d.poNo) { · {{ d.poNo }} }
              </p>
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
                  @if (l.lotNo) { <span class="text-slate-400 font-mono">· lot {{ l.lotNo }}</span> }
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
export class InwardsComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  units = UNITS;
  rows = signal<Inward[]>([]);
  suppliers = signal<any[]>([]);
  items = signal<any[]>([]);
  godowns = signal<any[]>([]);
  /** Chune hue supplier ke khule order — PO wali dropdown yahi se bharti hai. */
  openPos = signal<any[]>([]);

  loading = signal(true);
  err = signal('');
  search = '';

  form = signal<any | null>(null);
  formErr = signal('');
  saving = signal(false);
  detail = signal<Inward | null>(null);

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

    this.http.get<Inward[]>(`${this.base}/inwards?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }

  openNew() {
    this.formErr.set('');
    this.openPos.set([]);
    this.form.set({
      partyId: null, poId: null,
      godownId: this.godowns().find(g => g.isMain)?.id ?? this.godowns()[0]?.id ?? null,
      inwardDate: this.today(), supplierChallanNo: null, lrNo: null,
      transport: null, note: null,
      lines: [this.blankLine()]
    });
  }

  /** Supplier badla to purana PO aur uski lines dono bekaar — saaf kar do. */
  partyBadli() {
    const f = this.form();
    if (!f) return;
    f.poId = null;
    f.lines = [this.blankLine()];
    this.touch();

    if (!f.partyId) { this.openPos.set([]); return; }
    this.http.get<any[]>(`${this.base}/purchase-orders?partyId=${f.partyId}`).subscribe({
      next: r => this.openPos.set(r.filter(p => p.pendingQty > 0)),
      error: () => this.openPos.set([])
    });
  }

  /**
   * PO chunte hi jo bacha hai wo lines me bhar do — poori qty pehle se bhari
   * hui aati hai. Aadha aaya ho to bas number ghata dena hai; poora aaya ho to
   * seedha save. Yahi is screen ka sabse bada faayda hai.
   */
  poChuna() {
    const f = this.form();
    if (!f) return;
    if (!f.poId) { f.lines = [this.blankLine()]; this.touch(); return; }

    this.http.get<any>(`${this.base}/purchase-orders/${f.poId}/pending`).subscribe({
      next: po => {
        f.lines = (po.lines ?? []).map((l: any) => ({
          poLineId: l.id, itemId: l.itemId, colour: l.colour, size: l.size,
          qty: l.pending, unit: l.unit, rate: l.rate,
          dealerCode: l.dealerCode, lotNo: l.lotNo, pendingThi: l.pending
        }));
        if (f.lines.length === 0) f.lines = [this.blankLine()];
        if (po.godownId) f.godownId = po.godownId;
        if (po.transport && !f.transport) f.transport = po.transport;
        this.touch();
      },
      error: e => this.formErr.set(e?.error?.error ?? 'Order ki lines nahi aa payin')
    });
  }

  private blankLine(): InwardLine {
    return { poLineId: null, itemId: null, colour: null, size: null,
             qty: 0, unit: 'Meter', rate: 0, dealerCode: null, lotNo: null };
  }
  addLine() { this.form()!.lines.push(this.blankLine()); this.touch(); }
  touch()   { this.form.set({ ...this.form()! }); }

  total(f: any): number {
    return (f.lines ?? []).reduce((a: number, l: InwardLine) => a + (l.qty || 0) * (l.rate || 0), 0);
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    // Jo line khali chhod di (0 aaya) wo bhejni nahi — server 0 qty par
    // rok lagata hai, aur wo rok theek hai
    const body = { ...f, lines: (f.lines as InwardLine[]).filter(l => (l.qty || 0) > 0) };

    this.http.post(`${this.base}/inwards`, body).subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openDetail(i: Inward) {
    this.http.get<Inward>(`${this.base}/inwards/${i.id}`).subscribe({
      next: full => this.detail.set(full),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khul payi')
    });
  }

  remove(i: Inward) {
    if (!confirm(`${i.inwardNo} hatani hai? Is maal ka stock wapas ghat jayega.`)) return;
    this.http.delete(`${this.base}/inwards/${i.id}`).subscribe({
      next: () => this.load(),
      error: e => this.err.set(e?.error?.error ?? 'Nahi hat payi')
    });
  }

  private today(): string { return new Date().toISOString().slice(0, 10); }
}
