import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { todayStr } from '../../core/date.util';

interface KhataRow {
  karigarId: string; name: string; mobile: string | null; jobType: string | null;
  isActive: boolean;
  majooriBani: number; achhePiece: number; kharabPiece: number;
  majooriDi: number; advanceDiya: number; kulDiya: number; bakaya: number;
}
interface KhataEntry {
  date: string; kism: string; ref: string;
  detail: string | null; bani: number; diya: number;
}
interface KhataDetail { karigar: KhataRow; entries: KhataEntry[]; }

const MODES = [
  { key: 'cash',   label: 'Cash' },
  { key: 'upi',    label: 'UPI' },
  { key: 'bank',   label: 'Bank' },
  { key: 'cheque', label: 'Cheque' }
];

/**
 * Karigar Khata Book — kiska kitna bakaya hai.
 *
 * Job slip se pata chal jata tha ki majoori KITNI BANI, par ye kahin nahi
 * tha ki DIYA kitna. Karkhane me sabse zyada jhagda isi baat par hota hai.
 * Ab dono ek jagah:
 *     BANI (achhe piece × rate) − DIYA (advance samet) = BAKAYA
 *
 * Majoori sirf ACHHE piece par banti hai — kharab nikle maal ki nahi.
 */
@Component({
  selector: 'mfg-karigar-khata',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex gap-1 mb-3 text-sm font-bold">
      @for (t of tabs; track t.key) {
        <button (click)="onlyDue.set(t.key); load()"
                class="px-4 py-1.5 rounded-lg transition"
                [class]="onlyDue() === t.key ? 'bg-anjaninex-navy text-white'
                                             : 'bg-white text-anjaninex-navy hover:bg-anjaninex-navy-soft'">
          {{ t.label }}</button>
      }
    </div>

    <div class="page-top-bar">
      <input class="input max-w-[260px]" placeholder="🔍 karigar ka naam ya mobile"
             [(ngModel)]="search" (ngModelChange)="load()">
      @if (kulBakaya() > 0) {
        <span class="ml-auto text-sm font-bold text-anjaninex-red">
          Kul bakaya ₹{{ kulBakaya() | number:'1.0-0' }}
        </span>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Koi karigar nahi mila</div>
    } @else {
      <div class="space-y-2">
        @for (k of rows(); track k.karigarId) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl bg-amber-50 grid place-items-center text-xl">🧑‍🏭</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">
                  {{ k.name }}
                  @if (!k.isActive) {
                    <span class="chip ml-1 bg-slate-100 text-slate-500">BAND</span>
                  }
                </div>
                <div class="text-xs text-slate-500">
                  {{ k.jobType }}@if (k.mobile) { · {{ k.mobile }} }
                </div>
                <div class="text-xs text-slate-500">
                  {{ k.achhePiece | number:'1.0-0' }} piece bane
                  @if (k.kharabPiece) {
                    <span class="text-anjaninex-red">· {{ k.kharabPiece }} kharab</span>
                  }
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div>bani <b class="text-anjaninex-navy">₹{{ k.majooriBani | number:'1.0-0' }}</b></div>
                <div class="text-slate-500">diya ₹{{ k.kulDiya | number:'1.0-0' }}</div>
              </div>
            </div>

            <!-- Sabse zaroori line: dena kitna hai -->
            @if (k.bakaya > 0) {
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold flex">
                <span>💰 ₹{{ k.bakaya | number:'1.0-0' }} dena hai</span>
                @if (k.advanceDiya > 0) {
                  <span class="ml-auto">advance ₹{{ k.advanceDiya | number:'1.0-0' }} nikal chuka</span>
                }
              </div>
            } @else if (k.bakaya < 0) {
              <!-- Zyada de diya — advance kaam se aage nikal gaya -->
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-sky-50 text-sky-800 text-xs font-bold">
                ↩️ ₹{{ -k.bakaya | number:'1.0-0' }} zyada ja chuka — itna kaam aur karna hai
              </div>
            } @else if (k.majooriBani > 0) {
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold">
                ✅ Poora hisaab saaf
              </div>
            }

            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openKhata(k)">
                KHATA DEKHO</button>
              @if (auth.can('production.khata.edit.place')) {
                <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openPay(k)">
                  💵 PAISA DIYA</button>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- ══ PAISA DIYA ══ -->
    @if (payFor(); as k) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="payFor.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-md p-5" (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-1">💵 Paisa diya</h3>
          <p class="text-xs text-gray-500 mb-3">
            {{ k.name }} · bakaya ₹{{ k.bakaya | number:'1.0-0' }}
          </p>

          @if (payErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ payErr() }}</div>
          }

          <div class="grid grid-cols-2 gap-3">
            <div><label class="label" style="color:#DC2626">Kitna diya *</label>
              <input class="input" type="number" step="0.01" [(ngModel)]="pay.amount"></div>
            <div><label class="label">Tareekh</label>
              <input class="input" type="date" [(ngModel)]="pay.paidOn"></div>
            <div><label class="label">Kaise diya</label>
              <select class="input" [(ngModel)]="pay.mode">
                @for (m of modes; track m.key) { <option [value]="m.key">{{ m.label }}</option> }
              </select></div>
            <div><label class="label">Cheque / UPI ref</label>
              <input class="input" [(ngModel)]="pay.refNo"></div>
            <div class="col-span-2">
              <label class="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input type="checkbox" [(ngModel)]="pay.isAdvance">
                Ye advance hai (kaam se pehle diya)
              </label>
            </div>
            <div class="col-span-2"><label class="label">Note</label>
              <input class="input" [(ngModel)]="pay.note"></div>
          </div>

          @if (k.bakaya > 0) {
            <button class="btn-line btn-sm w-full mt-3" (click)="pay.amount = k.bakaya">
              poora bakaya ₹{{ k.bakaya | number:'1.0-0' }} bhar do
            </button>
          }

          <div class="flex gap-2 mt-4">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="savePay()">
              {{ saving() ? 'Ruk jaiye…' : 'SAVE KARO' }}</button>
            <button class="btn-line" (click)="payFor.set(null)">Cancel</button>
          </div>
        </div>
      </div>
    }

    <!-- ══ KHATA ══ -->
    @if (khata(); as d) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="khata.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <div class="flex items-start mb-3">
            <div>
              <h3 class="font-extrabold text-anjaninex-navy text-lg">{{ d.karigar.name }}</h3>
              <p class="text-xs text-gray-500">
                {{ d.karigar.jobType }}@if (d.karigar.mobile) { · {{ d.karigar.mobile }} }</p>
            </div>
            <button class="ml-auto text-2xl text-slate-400" (click)="khata.set(null)">✕</button>
          </div>

          <div class="grid grid-cols-3 gap-2 mb-4 text-center">
            <div class="rounded-xl bg-anjaninex-navy-soft py-2">
              <div class="text-[10px] font-extrabold uppercase text-slate-500">Bani</div>
              <div class="font-black text-anjaninex-navy">
                ₹{{ d.karigar.majooriBani | number:'1.0-0' }}</div>
            </div>
            <div class="rounded-xl bg-emerald-50 py-2">
              <div class="text-[10px] font-extrabold uppercase text-slate-500">Diya</div>
              <div class="font-black text-emerald-700">
                ₹{{ d.karigar.kulDiya | number:'1.0-0' }}</div>
            </div>
            <div class="rounded-xl py-2"
                 [class]="d.karigar.bakaya > 0 ? 'bg-amber-50' : 'bg-slate-50'">
              <div class="text-[10px] font-extrabold uppercase text-slate-500">Bakaya</div>
              <div class="font-black"
                   [class]="d.karigar.bakaya > 0 ? 'text-amber-700' : 'text-slate-500'">
                ₹{{ d.karigar.bakaya | number:'1.0-0' }}</div>
            </div>
          </div>

          @if (d.entries.length === 0) {
            <div class="text-center text-slate-400 py-8 text-sm">Abhi koi hisaab nahi</div>
          } @else {
            <table class="w-full text-xs">
              <tr class="text-gray-500 text-left">
                <th class="font-semibold pb-1">Kab</th>
                <th class="font-semibold pb-1">Kya</th>
                <th class="font-semibold pb-1 text-right">Bani</th>
                <th class="font-semibold pb-1 text-right">Diya</th>
              </tr>
              @for (e of d.entries; track e.ref + e.date) {
                <tr class="border-t border-[color:var(--ax-border)]">
                  <td class="py-1.5 whitespace-nowrap">{{ e.date | date:'d MMM y' }}</td>
                  <td class="py-1.5">
                    <span class="chip"
                          [class]="e.kism === 'bani' ? 'bg-anjaninex-navy-soft text-anjaninex-navy'
                                 : e.kism === 'advance' ? 'bg-sky-50 text-sky-700'
                                 : 'bg-emerald-50 text-emerald-700'">{{ e.kism }}</span>
                    <span class="font-bold ml-1">{{ e.ref }}</span>
                    @if (e.detail) { <span class="text-slate-400"> · {{ e.detail }}</span> }
                  </td>
                  <td class="py-1.5 text-right font-bold text-anjaninex-navy">
                    @if (e.bani) { ₹{{ e.bani | number:'1.0-0' }} }</td>
                  <td class="py-1.5 text-right font-bold text-emerald-700">
                    @if (e.diya) { ₹{{ e.diya | number:'1.0-0' }} }</td>
                </tr>
              }
            </table>
          }
        </div>
      </div>
    }
  `
})
export class KarigarKhataComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  tabs = [
    { key: 'due', label: 'Jinka bakaya hai' },
    { key: 'all', label: 'Sab' }
  ];
  onlyDue = signal('due');
  modes = MODES;

  rows = signal<KhataRow[]>([]);
  loading = signal(true);
  err = signal('');
  search = '';

  payFor = signal<KhataRow | null>(null);
  payErr = signal('');
  saving = signal(false);
  pay: any = {};

  khata = signal<KhataDetail | null>(null);

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.search) q.set('search', this.search);
    if (this.onlyDue() === 'due') q.set('onlyDue', 'true');

    this.http.get<KhataRow[]>(`${this.base}/karigar-khata?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'Khata nahi aa paya'); this.loading.set(false); }
    });
  }

  kulBakaya(): number {
    return this.rows().filter(r => r.bakaya > 0).reduce((a, r) => a + r.bakaya, 0);
  }

  openPay(k: KhataRow) {
    this.payErr.set('');
    this.pay = {
      karigarId: k.karigarId, paidOn: todayStr(),
      amount: 0, mode: 'cash', refNo: null, isAdvance: false, note: null
    };
    this.payFor.set(k);
  }

  savePay() {
    const k = this.payFor();
    if (!k) return;
    if (!(this.pay.amount > 0)) { this.payErr.set('Kitna diya wo daaliye'); return; }

    this.saving.set(true);
    this.payErr.set('');
    this.http.post(`${this.base}/karigar-khata/pay`, this.pay).subscribe({
      next: () => { this.saving.set(false); this.payFor.set(null); this.load(); },
      error: e => { this.payErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  openKhata(k: KhataRow) {
    this.http.get<KhataDetail>(`${this.base}/karigar-khata/${k.karigarId}`).subscribe({
      next: d => this.khata.set(d),
      error: e => this.err.set(e?.error?.error ?? 'Khata nahi khula')
    });
  }
}
