import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

interface Ratio  { id?: string; size: string; ratio: number; banenge?: number; }
interface SizeLn { id?: string; size: string; colour: string | null; qty: number; }
interface Program {
  id?: string; designId: string | null; designName?: string; part: string;
  jobRate: number; rateUnit: string; ratios: Ratio[]; sizes: SizeLn[]; totalPieces?: number;
}
interface MatLn {
  id?: string; materialId: string | null; materialName?: string;
  colour: string | null; qty: number; unit: string; takas: number[];
}
interface JobSlip {
  id: string; slipNo: string; lotNo: string | null;
  karigarId: string; karigarName: string; jobType: string;
  godownId: string | null; issuedAt: string; dueAt: string | null;
  status: string; note: string | null;
  materials: MatLn[]; programs: Program[]; receipts: any[];
  bananeHain: number; aaye: number; kharab: number; baki: number; majooriBani: number;
}

const JOB_TYPES = ['Cutting', 'Silai / Stitching', 'Finishing', 'Dyeing / Rangai',
                   'Printing', 'Embroidery / Kaam', 'Washing', 'Packing'];
const PARTS = ['Top', 'Bottom', 'Dupatta', 'Blouse', 'Lining', 'Full Set'];

@Component({
  selector: 'mfg-jobslips',
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
      <input class="input max-w-[240px]" placeholder="🔍 slip ya lot number"
             [(ngModel)]="search" (ngModelChange)="load()">
      @if (auth.can('production.jobslip.create.place')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ NAYA JOB SLIP</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Koi job slip nahi mili</div>
    } @else {
      <div class="space-y-2">
        @for (s of rows(); track s.id) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-anjaninex-navy-soft grid place-items-center text-xl">✂️</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">
                  {{ s.slipNo }}
                  @if (s.lotNo) { <span class="text-slate-400 font-mono text-xs">· Lot {{ s.lotNo }}</span> }
                  <span class="chip ml-1"
                        [class]="s.status === 'done' ? 'bg-emerald-50 text-emerald-700'
                               : s.status === 'cancelled' ? 'bg-slate-100 text-slate-500'
                               : 'bg-amber-50 text-amber-700'">
                    {{ s.status === 'done' ? 'POORA' : s.status === 'cancelled' ? 'CANCEL' : 'CHAL RAHA' }}
                  </span>
                </div>
                <div class="text-xs text-slate-500">{{ s.karigarName }} — {{ s.jobType }}</div>
                <div class="text-xs text-slate-500">
                  {{ s.programs.length }} design
                  @if (s.dueAt) { · {{ s.dueAt | date:'d MMM' }} tak }
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div><b class="text-anjaninex-navy">{{ s.bananeHain }}</b> banane</div>
                <div><b class="text-emerald-700">{{ s.aaye }}</b> aaye</div>
                @if (s.kharab) { <div class="text-anjaninex-red">{{ s.kharab }} kharab</div> }
              </div>
            </div>

            <!-- Sabse zaroori line: kitna maal abhi bhi bahar hai -->
            @if (s.baki > 0 && s.status !== 'cancelled') {
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold flex">
                <span>⚠️ {{ s.baki }} piece abhi karigar ke paas</span>
                <span class="ml-auto">majoori ab tak ₹{{ s.majooriBani | number:'1.0-0' }}</span>
              </div>
            } @else if (s.status === 'done') {
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold flex">
                <span>✅ Saara maal wapas aa gaya</span>
                <span class="ml-auto">majoori ₹{{ s.majooriBani | number:'1.0-0' }}</span>
              </div>
            }

            @if (auth.can('production.jobslip.edit.place') && s.status !== 'cancelled') {
              <div class="flex gap-3 mt-2 justify-end">
                <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openReceipt(s)">
                  📥 MAAL AAYA</button>
                <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openDetail(s)">
                  DEKHO</button>
                @if (s.aaye === 0) {
                  <button class="text-[11px] font-bold text-anjaninex-red" (click)="cancel(s)">
                    CANCEL</button>
                }
              </div>
            }
          </div>
        }
      </div>
    }

    <!-- ══ NAYA JOB SLIP ══ -->
    @if (form(); as f) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="form.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-3">Naya Job Slip</h3>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-3 gap-3 mb-4">
            <div><label class="label" style="color:#DC2626">Karigar *</label>
              <select class="input" [(ngModel)]="f.karigarId">
                <option [ngValue]="null">— chuniye —</option>
                @for (k of karigars(); track k.id) { <option [ngValue]="k.id">{{ k.name }}</option> }
              </select></div>
            <div><label class="label" style="color:#DC2626">Kaam *</label>
              <select class="input" [(ngModel)]="f.jobType">
                @for (j of jobTypes; track j) { <option [value]="j">{{ j }}</option> }
              </select></div>
            <div><label class="label">Lot number</label>
              <input class="input" [(ngModel)]="f.lotNo"></div>
            <div><label class="label">Godown</label>
              <select class="input" [(ngModel)]="f.godownId">
                <option [ngValue]="null">— koi nahi —</option>
                @for (g of godowns(); track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }
              </select>
              <p class="text-[10.5px] text-gray-500 mt-1">Isi se material ghatega</p></div>
            <div><label class="label">Kab tak</label>
              <input class="input" type="date" [(ngModel)]="f.dueAt"></div>
            <div><label class="label">Note</label>
              <input class="input" [(ngModel)]="f.note"></div>
          </div>

          <!-- ── KYA BANANA HAI ── -->
          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Kya banana hai</div>
          @for (p of f.programs; track $index) {
            <div class="border border-[color:var(--ax-border)] rounded-xl p-3 mb-3">
              <div class="grid grid-cols-4 gap-2 mb-2">
                <div class="col-span-2"><label class="label">Design</label>
                  <select class="input" [(ngModel)]="p.designId" (ngModelChange)="fillFromRecipe(p)">
                    <option [ngValue]="null">— chuniye —</option>
                    @for (d of designs(); track d.id) { <option [ngValue]="d.id">{{ d.name }}</option> }
                  </select></div>
                <div><label class="label">Hissa</label>
                  <select class="input" [(ngModel)]="p.part" (ngModelChange)="fillFromRecipe(p)">
                    @for (x of parts; track x) { <option [value]="x">{{ x }}</option> }
                  </select></div>
                <div><label class="label">Majoori ₹</label>
                  <input class="input" type="number" [(ngModel)]="p.jobRate"></div>
              </div>

              <!-- RATIO — kul piece aur ratio se batwara khud ho jata hai -->
              <div class="flex items-center gap-2 mb-1">
                <span class="label mb-0">Ratio</span>
                <input class="input w-28 py-1" type="number" [(ngModel)]="p.kulPiece"
                       (ngModelChange)="splitByRatio(p)" placeholder="kul piece">
                <button class="text-[11px] font-bold text-anjaninex-navy" (click)="addRatio(p)">＋ SIZE</button>
              </div>
              @if (p.ratios.length) {
                <table class="w-full text-xs mb-2">
                  <tr class="text-gray-500 text-left">
                    <th class="font-semibold pb-1">Size</th><th class="font-semibold pb-1">Ratio</th>
                    <th class="font-semibold pb-1">Banenge</th><th></th>
                  </tr>
                  @for (r of p.ratios; track $index) {
                    <tr>
                      <td class="pr-2 py-0.5"><input class="input py-1" [(ngModel)]="r.size"></td>
                      <td class="pr-2 py-0.5"><input class="input py-1 w-16" type="number"
                            [(ngModel)]="r.ratio" (ngModelChange)="splitByRatio(p)"></td>
                      <td class="font-bold py-0.5">{{ sizeQty(p, r.size) }}</td>
                      <td><button class="text-anjaninex-red font-bold"
                            (click)="p.ratios.splice($index,1); splitByRatio(p)">✕</button></td>
                    </tr>
                  }
                </table>
              }
            </div>
          }
          <button class="btn-line btn-sm mb-4" (click)="addProgram()">＋ DESIGN JODO</button>

          <!-- ── KYA DIYA ── -->
          <div class="font-extrabold text-sm text-anjaninex-navy mb-2">Karigar ko kya diya</div>
          @for (m of f.materials; track $index) {
            <div class="flex gap-2 mb-2 items-end">
              <div class="flex-1"><label class="label">Material</label>
                <select class="input" [(ngModel)]="m.materialId">
                  <option [ngValue]="null">— chuniye —</option>
                  @for (x of materials(); track x.id) { <option [ngValue]="x.id">{{ x.name }}</option> }
                </select></div>
              <div class="w-24"><label class="label">Rang</label>
                <input class="input" [(ngModel)]="m.colour"></div>
              <div class="w-24"><label class="label">Qty</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="m.qty"></div>
              <div class="w-20"><label class="label">Unit</label>
                <select class="input" [(ngModel)]="m.unit">
                  @for (u of ['Meter','Kg','Pcs','Than']; track u) { <option [value]="u">{{ u }}</option> }
                </select></div>
              <button class="text-anjaninex-red font-bold pb-2.5"
                      (click)="f.materials.splice($index,1)">✕</button>
            </div>
          }
          <button class="btn-line btn-sm mb-4" (click)="addMaterial()">＋ MATERIAL JODO</button>

          <div class="flex gap-2 mt-3">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : 'JOB SLIP BANAO' }}</button>
            <button class="btn-line" (click)="form.set(null)">Cancel</button>
          </div>
        </div>
      </div>
    }

    <!-- ══ MAAL AAYA ══ -->
    @if (receiptFor(); as s) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="receiptFor.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-md p-5" (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">📥 Maal aaya</h3>
          <p class="text-xs text-gray-500 mb-3">
            {{ s.slipNo }} · {{ s.karigarName }} · {{ s.baki }} piece baki
          </p>

          @if (receiptErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ receiptErr() }}</div>
          }

          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2"><label class="label">Design</label>
              <select class="input" [(ngModel)]="rc.designId">
                <option [ngValue]="null">— chuniye —</option>
                @for (p of s.programs; track p.id) {
                  <option [ngValue]="p.designId">{{ p.designName }} ({{ p.part }})</option>
                }
              </select></div>
            <div><label class="label">Size</label><input class="input" [(ngModel)]="rc.size"></div>
            <div><label class="label">Rang</label><input class="input" [(ngModel)]="rc.colour"></div>
            <div><label class="label" style="color:#DC2626">Kitne aaye *</label>
              <input class="input" type="number" [(ngModel)]="rc.qty"></div>
            <div><label class="label">Kharab nikle</label>
              <input class="input" type="number" [(ngModel)]="rc.rejectedQty">
              <p class="text-[10.5px] text-gray-500 mt-1">Inki majoori nahi banti</p></div>
            <div class="col-span-2"><label class="label">Note</label>
              <input class="input" [(ngModel)]="rc.note"></div>
          </div>

          <div class="flex gap-2 mt-5">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="saveReceipt()">
              {{ saving() ? 'Ruk jaiye…' : 'SAVE KARO' }}</button>
            <button class="btn-line" (click)="receiptFor.set(null)">Cancel</button>
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
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.slipNo }}</h3>
              <p class="text-xs text-gray-500">{{ d.karigarName }} · {{ d.jobType }}</p>
            </div>
            <button class="ml-auto text-2xl text-slate-400" (click)="detail.set(null)">✕</button>
          </div>

          <div class="font-extrabold text-sm text-anjaninex-navy mb-1">Kya diya</div>
          <table class="w-full text-xs mb-4">
            @for (m of d.materials; track m.id) {
              <tr class="border-t border-[color:var(--ax-border)]">
                <td class="py-1">{{ m.materialName }}@if (m.colour) { · {{ m.colour }} }</td>
                <td class="py-1 text-right">{{ m.qty }} {{ m.unit }}</td>
                <td class="py-1 text-right text-slate-400">
                  @if (m.takas.length) { {{ m.takas.length }} taka }</td>
              </tr>
            }
          </table>

          <div class="font-extrabold text-sm text-anjaninex-navy mb-1">Kya banana hai</div>
          @for (p of d.programs; track p.id) {
            <div class="text-xs mb-2">
              <b>{{ p.designName }}</b> · {{ p.part }} · ₹{{ p.jobRate }}/{{ p.rateUnit }}
              — <b>{{ p.totalPieces }}</b> piece
              @if (p.sizes.length) {
                <span class="text-slate-500">
                  ({{ sizeText(p) }})</span>
              }
            </div>
          }

          @if (d.receipts.length) {
            <div class="font-extrabold text-sm text-anjaninex-navy mt-3 mb-1">Kab-kab aaya</div>
            <table class="w-full text-xs">
              @for (r of d.receipts; track r.id) {
                <tr class="border-t border-[color:var(--ax-border)]">
                  <td class="py-1">{{ r.receivedAt | date:'d MMM, h:mm a' }}</td>
                  <td class="py-1">{{ r.size }} {{ r.colour }}</td>
                  <td class="py-1 text-right font-bold">{{ r.qty }}</td>
                  <td class="py-1 text-right text-anjaninex-red">
                    @if (r.rejectedQty) { {{ r.rejectedQty }} kharab }</td>
                </tr>
              }
            </table>
          }
        </div>
      </div>
    }
  `
})
export class JobSlipsComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  tabs = [
    { key: '',     label: 'Chal rahe' },
    { key: 'done', label: 'Poore' },
    { key: 'all',  label: 'Sab' }
  ];
  status = signal('');
  jobTypes = JOB_TYPES;
  parts = PARTS;

  rows = signal<JobSlip[]>([]);
  karigars = signal<any[]>([]);
  designs = signal<any[]>([]);
  materials = signal<any[]>([]);
  godowns = signal<any[]>([]);

  loading = signal(true);
  err = signal('');
  search = '';

  form = signal<any | null>(null);
  formErr = signal('');
  saving = signal(false);

  receiptFor = signal<JobSlip | null>(null);
  receiptErr = signal('');
  rc: any = {};

  detail = signal<JobSlip | null>(null);

  constructor() {
    this.load();
    this.http.get<any[]>(`${this.base}/karigars`).subscribe({ next: r => this.karigars.set(r) });
    this.http.get<any[]>(`${this.base}/items?kind=design`).subscribe({ next: r => this.designs.set(r) });
    this.http.get<any[]>(`${this.base}/items?kind=material`).subscribe({ next: r => this.materials.set(r) });
    this.http.get<any[]>(`${this.base}/godowns`).subscribe({ next: r => this.godowns.set(r) });
  }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.status()) q.set('status', this.status());
    if (this.search) q.set('search', this.search);

    this.http.get<JobSlip[]>(`${this.base}/jobslips?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }

  openNew() {
    this.formErr.set('');
    this.form.set({
      karigarId: null, jobType: JOB_TYPES[1], lotNo: null,
      godownId: this.godowns()[0]?.id ?? null, dueAt: null, note: null,
      programs: [this.blankProgram()], materials: []
    });
  }

  private blankProgram(): any {
    return { designId: null, part: 'Top', jobRate: 0, rateUnit: 'Pcs',
             kulPiece: 0, ratios: [], sizes: [] };
  }
  addProgram()  { this.form()!.programs.push(this.blankProgram()); this.form.set({ ...this.form()! }); }
  addMaterial() { this.form()!.materials.push({ materialId: null, colour: null, qty: 0, unit: 'Meter', takas: [] });
                  this.form.set({ ...this.form()! }); }
  addRatio(p: any) { p.ratios.push({ size: '', ratio: 1 }); this.splitByRatio(p); }

  /**
   * Hissa (ya design) chunte hi us hisse ki RECIPE utha lete hain — kaunsa
   * kapda, ek piece me kitna, aur majoori. Munshi ko dobara wahi ginti nahi
   * likhni padti. Yahi recipe rakhne ka asli faayda hai.
   */
  fillFromRecipe(p: any) {
    if (!p.designId || !p.part) return;
    this.http.get<any>(`${this.base}/designs/${p.designId}/recipe`).subscribe({
      next: c => {
        const r = (c.parts ?? []).find((x: any) => x.part === p.part);
        if (!r) return;
        if (!p.jobRate) p.jobRate = r.jobRate;
        // Material lines bhar do — AVG × piece se qty
        const f = this.form();
        if (!f) return;
        for (const m of r.materials) {
          if (f.materials.some((x: any) => x.materialId === m.materialId)) continue;
          f.materials.push({
            materialId: m.materialId, colour: null,
            qty: +(m.avgQty * (p.kulPiece || 0)).toFixed(3),
            unit: m.unit, takas: [], avgQty: m.avgQty
          });
        }
        this.form.set({ ...f });
      },
      error: () => { /* recipe na ho to kuch mat karo */ }
    });
  }

  /**
   * Ratio se batwara — 160 piece aur 1:1:2 → 40 / 40 / 80.
   * Aakhri size me bacha hua daal dete hain, warna gol karne se ek-do piece
   * gum ho jate hain aur jod kul se kam ban jata hai.
   */
  splitByRatio(p: any) {
    const total = +p.kulPiece || 0;
    const sum = p.ratios.reduce((a: number, r: Ratio) => a + (+r.ratio || 0), 0);
    p.sizes = [];
    if (!total || !sum) return;

    let used = 0;
    p.ratios.forEach((r: Ratio, i: number) => {
      const isLast = i === p.ratios.length - 1;
      const qty = isLast ? total - used : Math.floor(total * (+r.ratio || 0) / sum);
      used += qty;
      p.sizes.push({ size: r.size, colour: null, qty });
    });

    // Material ki qty bhi piece ke saath badal jaye
    const f = this.form();
    if (f) {
      for (const m of f.materials)
        if (m.avgQty) m.qty = +(m.avgQty * total).toFixed(3);
      this.form.set({ ...f });
    }
  }

  sizeQty(p: any, size: string): number {
    return p.sizes?.find((s: SizeLn) => s.size === size)?.qty ?? 0;
  }
  sizeText(p: Program): string {
    return p.sizes.map(s => `${s.size} ${s.qty}`).join(', ');
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    this.http.post<{ slipNo: string }>(`${this.base}/jobslips`, f).subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openReceipt(s: JobSlip) {
    this.receiptErr.set('');
    this.rc = { designId: s.programs[0]?.designId ?? null, size: null, colour: null,
                qty: 0, rejectedQty: 0, note: null };
    // Detail se poora record — programs me designName chahiye
    this.http.get<JobSlip>(`${this.base}/jobslips/${s.id}`).subscribe({
      next: full => this.receiptFor.set(full),
      error: () => this.receiptFor.set(s)
    });
  }

  saveReceipt() {
    const s = this.receiptFor();
    if (!s) return;
    this.saving.set(true);
    this.receiptErr.set('');
    this.http.post(`${this.base}/jobslips/${s.id}/receipts`, this.rc).subscribe({
      next: () => { this.saving.set(false); this.receiptFor.set(null); this.load(); },
      error: e => { this.receiptErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openDetail(s: JobSlip) {
    this.http.get<JobSlip>(`${this.base}/jobslips/${s.id}`).subscribe({
      next: full => this.detail.set(full),
      error: e => this.err.set(e?.error?.error ?? 'Nahi khul payi')
    });
  }

  cancel(s: JobSlip) {
    if (!confirm(`${s.slipNo} cancel karni hai? Diya hua material wapas godown me chala jayega.`)) return;
    this.http.post(`${this.base}/jobslips/${s.id}/cancel`, {}).subscribe({
      next: () => this.load(),
      error: e => this.err.set(e?.error?.error ?? 'Cancel nahi hui')
    });
  }
}
