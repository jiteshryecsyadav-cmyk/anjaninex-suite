import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { todayStr } from '../../core/date.util';
import { printElement } from '../../shared/print.util';

interface TransportRow {
  transport: string; challans: number;
  bheja: number; rasteMe: number; pahuncha: number; mila: number;
  podBaki: number; pehla: string | null; aakhri: string | null;
  kulMaal: number; kulRakam: number;
}
interface Ship {
  id: string; dcNo: string; challanDate: string; partyName: string;
  godownName: string; lrNo: string | null; transportLr: string | null;
  vehicleNo: string | null; packages: number | null;
  totalQty: number; totalAmount: number;
  deliveryStatus: string; podReceivedBy: string | null; podAt: string | null;
  podNote: string | null; podHai: boolean; billed: boolean;
}
interface Detail {
  transport: string; challans: number;
  bheja: number; rasteMe: number; pahuncha: number; mila: number;
  kulMaal: number; kulRakam: number; ships: Ship[];
}
/** GR chhapne ke liye — poora challan, lines ke saath. */
interface Challan {
  id: string; dcNo: string; challanDate: string; partyName: string;
  godownName: string; soNo: string | null; transport: string | null;
  lrNo: string | null; vehicleNo: string | null; packages: number | null;
  note: string | null; lines: any[]; totalQty: number; totalAmount: number;
}

const HAALAT = [
  { key: 'bheja',    label: 'Bheja',      icon: '📦', rang: '#8b5cf6' },
  { key: 'raste_me', label: 'Raste me',   icon: '🚚', rang: '#f59e0b' },
  { key: 'pahuncha', label: 'Pahunch gaya', icon: '📍', rang: '#3b82f6' },
  { key: 'mila',     label: 'Mil gaya',   icon: '✅', rang: '#10b981' }
];

/**
 * Track your shipments — MFG ek jagah se saari logistics companies dekhe.
 *
 * Do kadam, bilkul us transport-app wale prototype jaisa:
 *   1. Kis-kis logistics ko maal diya — har ek par ek card
 *   2. Ek logistics chuno — uske saare challan, halat, GR aur POD
 *
 * Logistics ke NAAM se jodte hain, kisi master se nahi — challan par
 * transport free-text hai (munshi jo likh de wahi). Master banate to purane
 * saare challan bahar reh jaate.
 *
 * Jinki POD baki hai wo logistics sabse upar — dabaav wahin dena hota hai.
 */
@Component({
  selector: 'mfg-transport',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ══ KADAM 1: kis-kis transport ko maal diya ══ -->
    @if (!detail()) {
      <div class="page-top-bar">
        <span class="text-xs text-slate-500 font-semibold">
          Maal kis logistics se gaya, ab kahan hai, aur POD aayi ya nahi
        </span>
        @if (kulPodBaki() > 0) {
          <span class="ml-auto text-sm font-bold text-amber-700">
            {{ kulPodBaki() }} challan ki POD baki
          </span>
        }
      </div>

      @if (err()) {
        <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
      }

      @if (loading()) {
        <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
      } @else if (rows().length === 0) {
        <div class="text-center text-slate-400 py-10 text-sm">
          Abhi tak koi maal logistics se nahi gaya —
          Delivery Challan me logistics ka naam likhne se yahan aa jayega
        </div>
      } @else {
        <div class="space-y-2">
          @for (t of rows(); track t.transport) {
            <button class="card w-full text-left hover:border-anjaninex-navy transition"
                    (click)="kholo(t.transport)">
              <div class="flex gap-3 items-start">
                <div class="w-11 h-11 rounded-xl bg-amber-50 grid place-items-center text-xl shrink-0">🚚</div>
                <div class="flex-1 min-w-0">
                  <div class="font-bold text-sm">{{ t.transport }}</div>
                  <div class="text-xs text-slate-500">
                    {{ t.challans }} challan
                    @if (t.pehla) { · {{ t.pehla | date:'d MMM' }} se }
                    @if (t.aakhri) { {{ t.aakhri | date:'d MMM y' }} tak }
                  </div>
                  <div class="flex gap-3 mt-1.5 flex-wrap text-[11px] font-bold">
                    @if (t.bheja)    { <span class="text-violet-700">{{ t.bheja }} bheja</span> }
                    @if (t.rasteMe)  { <span class="text-amber-700">{{ t.rasteMe }} raste me</span> }
                    @if (t.pahuncha) { <span class="text-sky-700">{{ t.pahuncha }} pahuncha</span> }
                    @if (t.mila)     { <span class="text-emerald-700">{{ t.mila }} mil gaya</span> }
                  </div>
                </div>
                <div class="text-right shrink-0 text-xs">
                  <div><b class="text-anjaninex-navy">{{ t.kulMaal | number:'1.0-2' }}</b> maal</div>
                  <div class="text-slate-500">₹{{ t.kulRakam | number:'1.0-0' }}</div>
                </div>
              </div>

              @if (t.podBaki > 0) {
                <div class="mt-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold">
                  📸 {{ t.podBaki }} challan ki POD abhi nahi aayi
                </div>
              } @else {
                <div class="mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold">
                  ✅ Sab maal pahunch gaya, POD bhi aa gayi
                </div>
              }
            </button>
          }
        </div>
      }
    }

    <!-- ══ KADAM 2: ek transport ka poora hisaab ══ -->
    @if (detail(); as d) {
      <!-- Header — prototype jaisa gehra band -->
      <div class="rounded-2xl text-white px-5 py-4 mb-4 flex items-center gap-4"
           style="background:linear-gradient(135deg,#1e293b,#0f172a)">
        <div class="min-w-0">
          <p class="text-xs opacity-70 m-0">Logistics</p>
          <p class="text-xl font-black leading-tight truncate">{{ d.transport }}</p>
          <p class="text-[11px] opacity-70 m-0">
            {{ d.challans }} challan · {{ d.kulMaal | number:'1.0-2' }} maal ·
            ₹{{ d.kulRakam | number:'1.0-0' }}
          </p>
        </div>
        <button class="ml-auto px-4 py-2 rounded-lg text-xs font-bold shrink-0"
                style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3)"
                (click)="wapas()">↔ Doosra logistics</button>
      </div>

      <!-- Chaar halat — ek nazar me -->
      <div class="grid gap-3 mb-4" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        @for (h of haalat; track h.key) {
          <button class="bg-white rounded-2xl border border-[color:var(--ax-border)] p-4 text-left
                         border-t-4 transition hover:shadow-md"
                  [style.border-top-color]="h.rang"
                  [class.ring-2]="filter() === h.key"
                  (click)="chhaano(h.key)">
            <div class="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
              {{ h.icon }} {{ h.label }}</div>
            <div class="text-2xl font-black mt-1" [style.color]="h.rang">{{ ginti(d, h.key) }}</div>
          </button>
        }
      </div>

      @if (filter()) {
        <button class="btn-line btn-sm mb-3" (click)="chhaano(filter())">✕ chhaanni hatao</button>
      }

      <!-- Har challan -->
      @if (d.ships.length === 0) {
        <div class="text-center text-slate-400 py-10 text-sm">Is halat me koi challan nahi</div>
      } @else {
        <div class="space-y-2">
          @for (s of d.ships; track s.id) {
            <div class="card">
              <div class="flex gap-3 items-start">
                <div class="w-11 h-11 rounded-xl grid place-items-center text-xl shrink-0"
                     [style.background]="rangKa(s.deliveryStatus) + '22'">
                  {{ iconKa(s.deliveryStatus) }}</div>
                <div class="flex-1 min-w-0">
                  <div class="font-bold text-sm">
                    {{ s.dcNo }}
                    <span class="chip ml-1" [style.background]="rangKa(s.deliveryStatus) + '22'"
                          [style.color]="rangKa(s.deliveryStatus)">{{ labelKa(s.deliveryStatus) }}</span>
                    @if (s.billed) {
                      <span class="chip ml-1 bg-emerald-50 text-emerald-700">BILL BAN GAYA</span>
                    }
                  </div>
                  <div class="text-xs text-slate-500">{{ s.partyName }}</div>
                  <div class="text-xs text-slate-500">
                    {{ s.challanDate | date:'d MMM y' }}
                    @if (s.packages) { · {{ s.packages }} gathar }
                    @if (s.lrNo) { · LR {{ s.lrNo }} }
                    @if (s.transportLr) { · logistics LR {{ s.transportLr }} }
                    @if (s.vehicleNo) { · {{ s.vehicleNo }} }
                  </div>
                </div>
                <div class="text-right shrink-0 text-xs">
                  <div><b class="text-anjaninex-navy">{{ s.totalQty | number:'1.0-2' }}</b></div>
                  <div class="text-slate-500">₹{{ s.totalAmount | number:'1.0-0' }}</div>
                </div>
              </div>

              <!-- Track — chaar kadam ki patti -->
              <div class="flex items-center gap-1 mt-3">
                @for (h of haalat; track h.key; let i = $index) {
                  <div class="flex-1 text-center">
                    <div class="w-6 h-6 rounded-full mx-auto grid place-items-center text-[11px] text-white"
                         [style.background]="i <= kadam(s) ? h.rang : '#e5e7eb'">
                      {{ i <= kadam(s) ? '✓' : i + 1 }}</div>
                    <p class="text-[9.5px] mt-1 m-0 font-semibold"
                       [style.color]="i <= kadam(s) ? h.rang : '#94a3b8'">{{ h.label }}</p>
                  </div>
                  @if (i < 3) {
                    <div class="flex-1 h-0.5" [style.background]="i < kadam(s) ? h.rang : '#e5e7eb'"></div>
                  }
                }
              </div>

              @if (s.podReceivedBy) {
                <div class="mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold">
                  📸 {{ s.podReceivedBy }} ne liya
                  @if (s.podAt) { · {{ s.podAt | date:'d MMM y' }} }
                  @if (s.podNote) { · {{ s.podNote }} }
                </div>
              }

              <div class="flex gap-3 mt-2 justify-end flex-wrap">
                <button class="text-[11px] font-bold text-anjaninex-navy" (click)="grKholo(s)">
                  📋 GR DEKHO</button>
                @if (s.podHai) {
                  <button class="text-[11px] font-bold text-emerald-700" (click)="podPhoto(s)">
                    📸 POD PHOTO</button>
                }
                @if (auth.can('sales.challan.edit.place')) {
                  <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openStatus(s)">
                    📍 HALAT BADLO</button>
                  @if (!s.podReceivedBy) {
                    <button class="text-[11px] font-bold text-anjaninex-red" (click)="openPod(s)">
                      ✓ POD BHARO</button>
                  }
                }
              </div>
            </div>
          }
        </div>
      }
    }

    <!-- ══ HALAT BADLO ══ -->
    @if (statusFor(); as s) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="statusFor.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-md p-5" (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">Maal ab kahan hai</h3>
          <p class="text-xs text-gray-500 mb-3">{{ s.dcNo }} · {{ s.partyName }}</p>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="space-y-2 mb-3">
            @for (h of haalat; track h.key) {
              <label class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer
                            border-[color:var(--ax-border)] hover:bg-slate-50"
                     [class.bg-anjaninex-navy-soft]="naya === h.key">
                <input type="radio" name="halat" [value]="h.key" [(ngModel)]="naya">
                <span class="text-lg">{{ h.icon }}</span>
                <span class="text-sm font-bold">{{ h.label }}</span>
              </label>
            }
          </div>

          <div><label class="label">Logistics ka apna LR number</label>
            <input class="input" [(ngModel)]="nayaLr" placeholder="unhone jo diya"></div>

          <p class="text-[10.5px] text-gray-500 mt-2">
            "Mil gaya" ke liye pehle POD bharni padegi — kisne liya ya kaagaz ki photo
          </p>

          <div class="flex gap-2 mt-4">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="saveStatus()">
              {{ saving() ? 'Ruk jaiye…' : 'SAVE KARO' }}</button>
            <button class="btn-line" (click)="statusFor.set(null)">Cancel</button>
          </div>
        </div>
      </div>
    }

    <!-- ══ POD BHARO ══ -->
    @if (podFor(); as s) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="podFor.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-md p-5" (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">📸 POD bharo</h3>
          <p class="text-xs text-gray-500 mb-3">
            {{ s.dcNo }} · {{ s.partyName }} — paisa maangte waqt yahi saboot hai
          </p>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2"><label class="label" style="color:#DC2626">Kisne liya *</label>
              <input class="input" [(ngModel)]="pod.receivedBy" placeholder="jisne maal liya uska naam"></div>
            <div><label class="label">Kab liya</label>
              <input class="input" type="date" [(ngModel)]="pod.podAt"></div>
            <div><label class="label">Note</label>
              <input class="input" [(ngModel)]="pod.note"></div>
            <div class="col-span-2"><label class="label">POD kaagaz ki photo</label>
              <input class="input" type="file" accept="image/*,.pdf"
                     (change)="photoChuni($event)">
              @if (photoName()) {
                <p class="text-[10.5px] text-emerald-700 font-bold mt-1">{{ photoName() }}</p>
              }
            </div>
          </div>

          <div class="flex gap-2 mt-4">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="savePod()">
              {{ saving() ? 'Ruk jaiye…' : 'POD SAVE KARO' }}</button>
            <button class="btn-line" (click)="podFor.set(null)">Cancel</button>
          </div>
        </div>
      </div>
    }

    <!-- ══ GR / CHALLAN — chhapne wala kaagaz ══ -->
    @if (gr(); as g) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="gr.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-auto"
             (click)="$event.stopPropagation()">

          <div #grPaper class="p-6">
            <div class="flex items-start border-b-2 border-anjaninex-navy pb-3 mb-4">
              <div>
                <div class="font-black text-lg text-anjaninex-navy">
                  {{ auth.user()?.firmName || 'Manufacturer' }}</div>
                <div class="text-[11px] text-slate-500">Goods Receipt / Delivery Challan</div>
              </div>
              <div class="ml-auto text-right">
                <div class="font-black text-lg">{{ g.dcNo }}</div>
                <div class="text-[11px] text-slate-500">{{ g.challanDate | date:'d MMM y' }}</div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4 text-xs mb-4">
              <div>
                <div class="font-bold text-slate-400 uppercase text-[10px]">Kisko bheja</div>
                <div class="font-bold text-sm">{{ g.partyName }}</div>
              </div>
              <div>
                <div class="font-bold text-slate-400 uppercase text-[10px]">Kahan se</div>
                <div class="font-bold text-sm">{{ g.godownName }}</div>
              </div>
              <div>
                <div class="font-bold text-slate-400 uppercase text-[10px]">Logistics</div>
                <div>{{ g.transport || '—' }}
                  @if (g.vehicleNo) { · {{ g.vehicleNo }} }</div>
              </div>
              <div>
                <div class="font-bold text-slate-400 uppercase text-[10px]">LR / Gathar</div>
                <div>{{ g.lrNo || '—' }}
                  @if (g.packages) { · {{ g.packages }} gathar }</div>
              </div>
            </div>

            <table class="w-full text-xs">
              <tr class="bg-anjaninex-navy text-white text-left">
                <th class="py-1.5 px-2 font-semibold">Maal</th>
                <th class="py-1.5 px-2 font-semibold text-right">Qty</th>
                <th class="py-1.5 px-2 font-semibold text-right">Rate</th>
                <th class="py-1.5 px-2 font-semibold text-right">Rakam</th>
              </tr>
              @for (l of g.lines; track l.id) {
                <tr class="border-b border-[color:var(--ax-border)]">
                  <td class="py-1.5 px-2">
                    {{ l.itemName }}
                    @if (l.colour) { <span class="text-slate-400">· {{ l.colour }}</span> }
                    @if (l.size) { <span class="text-slate-400">· {{ l.size }}</span> }
                  </td>
                  <td class="py-1.5 px-2 text-right">{{ l.qty | number:'1.0-2' }} {{ l.unit }}</td>
                  <td class="py-1.5 px-2 text-right">₹{{ l.rate | number:'1.0-2' }}</td>
                  <td class="py-1.5 px-2 text-right font-bold">₹{{ l.qty * l.rate | number:'1.0-0' }}</td>
                </tr>
              }
              <tr>
                <td class="py-2 px-2 font-black" colspan="3">KUL</td>
                <td class="py-2 px-2 text-right font-black">₹{{ g.totalAmount | number:'1.0-2' }}</td>
              </tr>
            </table>

            @if (g.note) { <p class="text-[11px] text-slate-500 mt-3">📝 {{ g.note }}</p> }

            <div class="flex justify-between mt-10 pt-3 text-[11px] text-slate-500">
              <div>Bhejne wale ke dastkhat</div>
              <div>Lene wale ke dastkhat</div>
            </div>
          </div>

          <div class="flex gap-2 p-4 border-t border-[color:var(--ax-border)] no-print">
            <button class="btn-primary flex-1" (click)="chhapo()">🖨️ GR CHHAPO / PDF</button>
            <button class="btn-line" (click)="gr.set(null)">Band karo</button>
          </div>
        </div>
      </div>
    }
  `
})
export class TransportComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  haalat = HAALAT;

  rows = signal<TransportRow[]>([]);
  detail = signal<Detail | null>(null);
  filter = signal('');

  loading = signal(true);
  err = signal('');

  statusFor = signal<Ship | null>(null);
  podFor = signal<Ship | null>(null);
  gr = signal<Challan | null>(null);
  formErr = signal('');
  saving = signal(false);

  naya = 'raste_me';
  nayaLr = '';
  pod: any = {};
  photoName = signal('');
  private podFile: File | null = null;

  @ViewChild('grPaper') grPaper?: ElementRef<HTMLElement>;

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    this.err.set('');
    this.http.get<TransportRow[]>(`${this.base}/transport`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'List nahi aa payi'); this.loading.set(false); }
    });
  }

  kulPodBaki(): number { return this.rows().reduce((a, t) => a + t.podBaki, 0); }

  kholo(transport: string) {
    const q = this.filter() ? `?status=${this.filter()}` : '';
    this.http.get<Detail>(`${this.base}/transport/${encodeURIComponent(transport)}${q}`)
      .subscribe({
        next: d => this.detail.set(d),
        error: e => this.err.set(e?.error?.error ?? 'Nahi khula')
      });
  }
  wapas() { this.detail.set(null); this.filter.set(''); this.load(); }

  /** Halat par click — wahi dobara dabao to chhaanni hat jati hai. */
  chhaano(key: string) {
    const d = this.detail();
    if (!d) return;
    this.filter.set(this.filter() === key ? '' : key);
    this.kholo(d.transport);
  }

  ginti(d: Detail, key: string): number {
    return key === 'bheja' ? d.bheja : key === 'raste_me' ? d.rasteMe
         : key === 'pahuncha' ? d.pahuncha : d.mila;
  }
  kadam(s: Ship): number {
    return HAALAT.findIndex(h => h.key === s.deliveryStatus);
  }
  rangKa(k: string)  { return HAALAT.find(h => h.key === k)?.rang  ?? '#8b5cf6'; }
  iconKa(k: string)  { return HAALAT.find(h => h.key === k)?.icon  ?? '📦'; }
  labelKa(k: string) { return HAALAT.find(h => h.key === k)?.label ?? k; }

  // ── halat ──
  openStatus(s: Ship) {
    this.formErr.set('');
    this.naya = s.deliveryStatus;
    this.nayaLr = s.transportLr ?? '';
    this.statusFor.set(s);
  }
  saveStatus() {
    const s = this.statusFor();
    if (!s) return;
    this.saving.set(true);
    this.formErr.set('');
    this.http.post(`${this.base}/transport/challan/${s.id}/status`,
                   { status: this.naya, transportLr: this.nayaLr }).subscribe({
      next: () => { this.saving.set(false); this.statusFor.set(null); this.refresh(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  // ── POD ──
  openPod(s: Ship) {
    this.formErr.set('');
    this.pod = { receivedBy: s.partyName, podAt: todayStr(), note: null };
    this.podFile = null;
    this.photoName.set('');
    this.podFor.set(s);
  }
  photoChuni(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.podFile = f;
    this.photoName.set(f ? `${f.name} chuni gayi` : '');
  }
  savePod() {
    const s = this.podFor();
    if (!s) return;
    if (!this.pod.receivedBy?.trim()) { this.formErr.set('Kisne liya — naam likhna zaroori hai'); return; }

    this.saving.set(true);
    this.formErr.set('');
    this.http.post(`${this.base}/transport/challan/${s.id}/pod`, this.pod).subscribe({
      next: () => {
        // Photo hai to wo alag call me — POD ka byora pehle hi bach jaye,
        // taaki photo atak jaye to bhi mehnat zaaya na ho
        if (!this.podFile) { this.saving.set(false); this.podFor.set(null); this.refresh(); return; }
        const fd = new FormData();
        fd.append('file', this.podFile);
        this.http.post(`${this.base}/transport/challan/${s.id}/pod-photo`, fd).subscribe({
          next: () => { this.saving.set(false); this.podFor.set(null); this.refresh(); },
          error: e => {
            this.saving.set(false);
            this.formErr.set('POD to bach gayi, par photo nahi chadhi: '
                             + (e?.error?.error ?? 'dobara koshish kijiye'));
            this.refresh();
          }
        });
      },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  podPhoto(s: Ship) {
    this.http.get<{ url: string }>(`${this.base}/transport/challan/${s.id}/pod-photo`).subscribe({
      next: r => window.open(r.url, '_blank', 'noopener'),
      error: e => this.err.set(e?.error?.error ?? 'Photo nahi mili')
    });
  }

  // ── GR ──
  grKholo(s: Ship) {
    this.http.get<Challan>(`${this.base}/challans/${s.id}`).subscribe({
      next: c => this.gr.set(c),
      error: e => this.err.set(e?.error?.error ?? 'GR nahi khuli')
    });
  }
  /**
   * GR apne alag document me chhapti hai (print.util) — page ka koi hissa
   * saath nahi jata. Purana visibility/class wala tareeka baar-baar tootta
   * tha (blank ya form ghula hua print), isliye wo wapas mat lana.
   */
  chhapo() { printElement(this.grPaper?.nativeElement ?? null); }

  private refresh() {
    const d = this.detail();
    if (d) this.kholo(d.transport); else this.load();
  }
}
