import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface Lot {
  lotNo: string; slipCount: number; pehliSlip: string;
  bananeHain: number; aaye: number; kharab: number; baki: number;
  karigars: string; poora: boolean; derDin: number | null;
}
interface LotSlip {
  slipId: string; slipNo: string; karigarName: string; jobType: string;
  issuedAt: string; dueAt: string | null; status: string;
  bananeHain: number; aaye: number; kharab: number; baki: number;
  designs: string; majooriBani: number;
}
interface LotDetail {
  lotNo: string; bananeHain: number; aaye: number; kharab: number; baki: number;
  slips: LotSlip[];
}

/**
 * Track Jobslip Lots — ek lot ka maal abhi kahan hai.
 *
 * Ek hi lot ka kapda kai karigaron me bat jata hai: cutting kisi aur ke paas,
 * silai kisi aur ke paas, finishing teesre ke paas. Job Slip screen par har
 * slip alag dikhti hai — par malik poochta hai "wo GREEN wala lot kahan tak
 * pahuncha?" Uska jawab ek jagah kahin nahi tha.
 *
 * Sabse der wala lot sabse upar — wahi pehle dekhna hota hai.
 */
@Component({
  selector: 'mfg-lots',
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
      <input class="input max-w-[280px]" placeholder="🔍 lot number ya karigar ka naam"
             [(ngModel)]="search" (ngModelChange)="load()">
      @if (kulBaki() > 0) {
        <span class="ml-auto text-sm font-bold text-amber-700">
          {{ kulBaki() | number:'1.0-0' }} piece abhi bahar
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
        Koi lot nahi mila — job slip par lot number likhne se yahan aa jayega
      </div>
    } @else {
      <div class="space-y-2">
        @for (l of rows(); track l.lotNo) {
          <div class="card">
            <div class="flex gap-3 items-start">
              <div class="w-11 h-11 rounded-xl grid place-items-center text-xl"
                   [class]="l.derDin ? 'bg-rose-50' : l.poora ? 'bg-emerald-50' : 'bg-anjaninex-navy-soft'">
                🔍</div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm">
                  Lot {{ l.lotNo }}
                  <span class="chip ml-1"
                        [class]="l.poora ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-amber-50 text-amber-700'">
                    {{ l.poora ? 'POORA' : 'CHAL RAHA' }}
                  </span>
                  @if (l.derDin) {
                    <span class="chip ml-1 bg-rose-50 text-rose-700">{{ l.derDin }} din der</span>
                  }
                </div>
                <div class="text-xs text-slate-500 truncate">{{ l.karigars }}</div>
                <div class="text-xs text-slate-500">
                  {{ l.slipCount }} slip · pehli {{ l.pehliSlip | date:'d MMM' }}
                </div>
              </div>
              <div class="text-right shrink-0 text-xs">
                <div><b class="text-anjaninex-navy">{{ l.bananeHain }}</b> banane</div>
                <div><b class="text-emerald-700">{{ l.aaye }}</b> aaye</div>
                @if (l.kharab) { <div class="text-anjaninex-red">{{ l.kharab }} kharab</div> }
              </div>
            </div>

            <!-- Poori chaal ek patti me — kitna nikla, kitna bacha -->
            @if (l.bananeHain > 0) {
              <div class="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full transition-all"
                     [class]="l.poora ? 'bg-emerald-500' : 'bg-anjaninex-navy'"
                     [style.width.%]="hissa(l)"></div>
              </div>
            }

            @if (l.baki > 0) {
              <div class="mt-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold">
                ⚠️ {{ l.baki }} piece abhi bhi karigaron ke paas
              </div>
            }

            <div class="flex gap-3 mt-2 justify-end">
              <button class="text-[11px] font-bold text-anjaninex-navy" (click)="open(l)">
                KAHAN-KAHAN HAI</button>
            </div>
          </div>
        }
      </div>
    }

    <!-- ══ DETAIL ══ -->
    @if (detail(); as d) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="detail.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <div class="flex items-start mb-3">
            <div>
              <h3 class="font-extrabold text-anjaninex-navy text-lg">Lot {{ d.lotNo }}</h3>
              <p class="text-xs text-gray-500">
                {{ d.bananeHain }} banane · {{ d.aaye }} aaye · {{ d.baki }} baki
                @if (d.kharab) { · {{ d.kharab }} kharab }
              </p>
            </div>
            <button class="ml-auto text-2xl text-slate-400" (click)="detail.set(null)">✕</button>
          </div>

          <!-- Har slip ek kadam — kram se, jaise kaam chala -->
          @for (s of d.slips; track s.slipId) {
            <div class="flex gap-3 py-2.5 border-b last:border-b-0 border-[color:var(--ax-border)]">
              <div class="w-9 h-9 rounded-lg grid place-items-center text-base shrink-0"
                   [class]="s.baki === 0 ? 'bg-emerald-50' : 'bg-amber-50'">
                {{ s.baki === 0 ? '✅' : '✂️' }}</div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-bold">
                  {{ s.karigarName }}
                  <span class="text-slate-400 font-semibold text-xs">· {{ s.jobType }}</span>
                </div>
                <div class="text-[11px] text-slate-500">
                  {{ s.slipNo }} · {{ s.issuedAt | date:'d MMM' }}
                  @if (s.dueAt) { · {{ s.dueAt | date:'d MMM' }} tak }
                </div>
                @if (s.designs) {
                  <div class="text-[11px] text-slate-500 truncate">{{ s.designs }}</div>
                }
              </div>
              <div class="text-right shrink-0 text-xs">
                <div><b>{{ s.aaye }}</b> / {{ s.bananeHain }}</div>
                @if (s.baki > 0) {
                  <div class="text-amber-700 font-bold">{{ s.baki }} baki</div>
                }
                @if (s.majooriBani) {
                  <div class="text-slate-400">₹{{ s.majooriBani | number:'1.0-0' }}</div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }
  `
})
export class LotsComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;

  tabs = [
    { key: '',      label: 'Chal rahe' },
    { key: 'poora', label: 'Poore' },
    { key: 'all',   label: 'Sab' }
  ];
  status = signal('');

  rows = signal<Lot[]>([]);
  loading = signal(true);
  err = signal('');
  search = '';
  detail = signal<LotDetail | null>(null);

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.status()) q.set('status', this.status());
    if (this.search) q.set('search', this.search);

    this.http.get<Lot[]>(`${this.base}/lots?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'Lot list nahi aa payi'); this.loading.set(false); }
    });
  }

  kulBaki(): number { return this.rows().reduce((a, l) => a + l.baki, 0); }

  hissa(l: Lot): number {
    return l.bananeHain > 0 ? Math.min(100, (l.aaye / l.bananeHain) * 100) : 0;
  }

  open(l: Lot) {
    this.http.get<LotDetail>(`${this.base}/lots/${encodeURIComponent(l.lotNo)}`).subscribe({
      next: d => this.detail.set(d),
      error: e => this.err.set(e?.error?.error ?? 'Lot nahi khula')
    });
  }
}
