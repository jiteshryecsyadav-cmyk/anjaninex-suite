import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

interface Kpi   { key: string; label: string; value: number; sub: string | null; tone: string; }
interface Alert { text: string; link: string | null; tone: string; }
interface Point { label: string; value: number; }
interface Rank  { name: string; value: number; sub: string | null; }

interface Dash {
  firmName: string; from: string; to: string; period: string;
  sales: Kpi[]; production: Kpi[]; stock: Kpi[]; purchase: Kpi[];
  alerts: Alert[]; trend: Point[];
  topParties: Rank[]; topDesigns: Rank[]; godowns: Rank[]; topKarigars: Rank[];
}

/**
 * Manufacturer ka dashboard — subah app kholte hi jo dikhna chahiye.
 *
 * Kram jaan-boojh kar aisa hai:
 *   1. DHYAN DO   — jo aaj haath maangta hai (bill baki, maal atka, stock minus)
 *   2. AANKDE     — chune hue tab ke chaar number
 *   3. GEHRAI     — trend, kaun sabse aage, kis godown me kitna
 *
 * Malik ko pehle "kya bigda hai" chahiye, phir "kitna hua". Ulta rakhte to
 * wo har baar scroll karke neeche dhoondhta.
 */
@Component({
  selector: 'mfg-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ══ HERO ══ -->
    <div class="rounded-2xl bg-anjaninex-navy text-white px-5 py-4 mb-4 flex items-center gap-4">
      <div class="w-11 h-11 rounded-xl bg-white/10 grid place-items-center text-2xl shrink-0">🏭</div>
      <div class="min-w-0">
        <div class="font-black text-lg leading-tight truncate">{{ d()?.firmName || '…' }}</div>
        <div class="text-xs text-white/60 font-semibold">
          Manufacturer · FY {{ fy() }} · Namaste, {{ auth.user()?.fullName }}
        </div>
      </div>
      <div class="ml-auto text-right shrink-0">
        <div class="px-3 py-1 rounded-lg bg-white/10 text-xs font-bold">{{ aaj() }}</div>
      </div>
    </div>

    <!-- ══ DO PATTI ══ -->
    <!-- Upar: kya dekhna hai · Neeche: kitne samay ka -->
    <div class="bg-white border border-[color:var(--ax-border)] rounded-xl p-1 mb-2 flex gap-1 flex-wrap">
      @for (t of tabs; track t.key) {
        <button (click)="tab.set(t.key)"
                class="px-4 py-2 rounded-lg text-[13px] font-bold transition"
                [class]="tab() === t.key ? 'bg-anjaninex-navy text-white'
                                         : 'text-[#4A5878] hover:bg-anjaninex-cream'">
          {{ t.icon }} {{ t.label }}
        </button>
      }
    </div>
    <div class="bg-white border border-[color:var(--ax-border)] rounded-xl p-1 mb-4 flex gap-1 flex-wrap items-center">
      @for (p of periods; track p.key) {
        <button (click)="period.set(p.key); load()"
                class="px-4 py-1.5 rounded-lg text-[13px] font-bold transition"
                [class]="period() === p.key ? 'bg-anjaninex-red text-white'
                                            : 'text-[#4A5878] hover:bg-anjaninex-cream'">
          {{ p.label }}
        </button>
      }
      @if (d(); as x) {
        <span class="ml-auto pr-3 text-[11px] font-semibold text-slate-400">
          {{ x.from | date:'d MMM' }} — {{ x.to | date:'d MMM y' }}
        </span>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else {
    @if (d(); as x) {

      <!-- ══ DHYAN DO ══ -->
      @if (x.alerts.length > 0) {
        <div class="space-y-1.5 mb-4">
          @for (a of x.alerts; track a.text) {
            <a [routerLink]="a.link"
               class="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13px] font-bold
                      border-l-4 hover:brightness-95 transition"
               [class]="alertCls(a.tone)">
              <span>{{ a.tone === 'red' ? '🔴' : a.tone === 'amber' ? '⚠️' : '📌' }}</span>
              <span class="flex-1">{{ a.text }}</span>
              <span class="text-[11px] opacity-70">kholo →</span>
            </a>
          }
        </div>
      } @else {
        <div class="px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-[13px] font-bold mb-4">
          ✅ Abhi koi cheez atki nahi — sab hisaab saaf hai
        </div>
      }

      <!-- ══ AANKDE ══ -->
      <div class="grid gap-3 mb-4"
           style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
        @for (k of kpis(); track k.key) {
          <div class="bg-white rounded-2xl border border-[color:var(--ax-border)] p-4
                      border-t-4 shadow-sm" [class]="kpiCls(k.tone)">
            <div class="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
              {{ k.label }}</div>
            <div class="text-2xl font-black mt-1" [class]="kpiTxt(k.tone)">
              {{ money(k) ? '₹' : '' }}{{ k.value | number:'1.0-2' }}
            </div>
            @if (k.sub) {
              <div class="text-[11px] font-semibold text-slate-400 mt-0.5">{{ k.sub }}</div>
            }
          </div>
        }
      </div>

      <!-- ══ GEHRAI ══ -->
      <div class="grid gap-3" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">

        <!-- Mahine-wise bikri — poore financial year ki -->
        <div class="bg-white rounded-2xl border border-[color:var(--ax-border)] p-4">
          <div class="flex items-baseline mb-3">
            <div class="font-extrabold text-sm text-anjaninex-navy">Mahine-wise bikri</div>
            <div class="ml-auto text-[11px] font-semibold text-slate-400">FY {{ fy() }}</div>
          </div>
          @if (trendMax() === 0) {
            <p class="text-xs text-slate-400 py-6 text-center">Is saal abhi koi bill nahi bana</p>
          } @else {
            <div class="flex items-end gap-1.5 h-32">
              @for (p of x.trend; track p.label) {
                <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div class="text-[9.5px] font-bold text-slate-400 whitespace-nowrap">
                    @if (p.value > 0) { {{ short(p.value) }} }
                  </div>
                  <div class="w-full rounded-t transition-all"
                       [style.height.%]="pct(p.value)"
                       [class]="p.value > 0 ? 'bg-anjaninex-navy' : 'bg-slate-100'"
                       [style.min-height.px]="2"></div>
                  <div class="text-[10px] font-bold text-slate-500">{{ p.label }}</div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Sabse zyada lene wale grahak -->
        <div class="bg-white rounded-2xl border border-[color:var(--ax-border)] p-4">
          <div class="font-extrabold text-sm text-anjaninex-navy mb-3">Sabse bade grahak</div>
          @if (x.topParties.length === 0) {
            <p class="text-xs text-slate-400 py-6 text-center">Is samay koi bill nahi</p>
          } @else {
            @for (r of x.topParties; track r.name) {
              <div class="mb-2.5">
                <div class="flex text-xs mb-1">
                  <span class="font-bold truncate">{{ r.name }}</span>
                  <span class="ml-auto font-black text-anjaninex-navy shrink-0 pl-2">
                    ₹{{ r.value | number:'1.0-0' }}</span>
                </div>
                <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full bg-anjaninex-navy rounded-full"
                       [style.width.%]="bar(r.value, x.topParties)"></div>
                </div>
                @if (r.sub) { <div class="text-[10px] text-slate-400 mt-0.5">{{ r.sub }}</div> }
              </div>
            }
          }
        </div>

        <!-- Kaunsa design chal raha hai -->
        <div class="bg-white rounded-2xl border border-[color:var(--ax-border)] p-4">
          <div class="font-extrabold text-sm text-anjaninex-navy mb-3">Sabse zyada nikla maal</div>
          @if (x.topDesigns.length === 0) {
            <p class="text-xs text-slate-400 py-6 text-center">Is samay koi challan nahi</p>
          } @else {
            @for (r of x.topDesigns; track r.name) {
              <div class="mb-2.5">
                <div class="flex text-xs mb-1">
                  <span class="font-bold truncate">{{ r.name }}</span>
                  <span class="ml-auto font-black text-anjaninex-navy shrink-0 pl-2">
                    {{ r.value | number:'1.0-2' }}</span>
                </div>
                <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full bg-anjaninex-red rounded-full"
                       [style.width.%]="bar(r.value, x.topDesigns)"></div>
                </div>
                @if (r.sub) { <div class="text-[10px] text-slate-400 mt-0.5">{{ r.sub }}</div> }
              </div>
            }
          }
        </div>

        <!-- Kis karigar ke paas maal atka hai — dabaav wahin lagta hai -->
        <div class="bg-white rounded-2xl border border-[color:var(--ax-border)] p-4">
          <div class="font-extrabold text-sm text-anjaninex-navy mb-3">Kis karigar ke paas maal</div>
          @if (x.topKarigars.length === 0) {
            <p class="text-xs text-slate-400 py-6 text-center">Kisi karigar ke paas kuch atka nahi</p>
          } @else {
            @for (r of x.topKarigars; track r.name) {
              <div class="flex items-center gap-3 py-1.5 border-b last:border-b-0
                          border-[color:var(--ax-border)]">
                <span class="w-7 h-7 rounded-lg bg-amber-50 grid place-items-center text-sm">🧑‍🏭</span>
                <span class="text-xs font-bold truncate flex-1">{{ r.name }}</span>
                <span class="text-xs font-black text-amber-700">{{ r.value | number:'1.0-0' }}</span>
                <span class="text-[10px] text-slate-400 w-12 text-right">{{ r.sub }}</span>
              </div>
            }
          }
        </div>

        <!-- Kis godown me kitna maal -->
        <div class="bg-white rounded-2xl border border-[color:var(--ax-border)] p-4">
          <div class="font-extrabold text-sm text-anjaninex-navy mb-3">Godown me kitna maal</div>
          @if (x.godowns.length === 0) {
            <p class="text-xs text-slate-400 py-6 text-center">Abhi kahin stock nahi</p>
          } @else {
            @for (r of x.godowns; track r.name) {
              <div class="flex items-center gap-3 py-1.5 border-b last:border-b-0
                          border-[color:var(--ax-border)]">
                <span class="w-7 h-7 rounded-lg bg-anjaninex-navy-soft grid place-items-center text-sm">🏬</span>
                <span class="text-xs font-bold truncate flex-1">{{ r.name }}</span>
                <!-- Minus laal me — wo hisaab ki galti hai, stock nahi -->
                <span class="text-xs font-black"
                      [class]="r.value < 0 ? 'text-anjaninex-red' : 'text-anjaninex-navy'">
                  {{ r.value | number:'1.0-2' }}</span>
              </div>
            }
          }
        </div>
      </div>
    }
    }
  `
})
export class DashboardComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  tabs = [
    { key: 'sales',      icon: '🧾', label: 'Bikri' },
    { key: 'production', icon: '🏭', label: 'Kaam' },
    { key: 'stock',      icon: '📦', label: 'Maal' },
    { key: 'purchase',   icon: '🛒', label: 'Khareed' }
  ];
  periods = [
    { key: 'week',    label: 'Is hafte' },
    { key: 'month',   label: 'Is mahine' },
    { key: 'quarter', label: 'Teen mahine' },
    { key: 'year',    label: 'Poora saal' }
  ];

  tab = signal('sales');
  period = signal('month');

  d = signal<Dash | null>(null);
  loading = signal(true);
  err = signal('');

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    this.err.set('');
    this.http.get<Dash>(`${this.base}/dashboard?period=${this.period()}`).subscribe({
      next: r => { this.d.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'Dashboard nahi aa paya'); this.loading.set(false); }
    });
  }

  /** Chune hue tab ke chaar number. */
  kpis = computed<Kpi[]>(() => {
    const x = this.d();
    if (!x) return [];
    switch (this.tab()) {
      case 'production': return x.production;
      case 'stock':      return x.stock;
      case 'purchase':   return x.purchase;
      default:           return x.sales;
    }
  });

  /** Rupaye wale aankde par ₹ lagta hai, piece/ginti wale par nahi. */
  money(k: Kpi): boolean {
    return ['bikri', 'mila', 'bakaya', 'wapas', 'khareed', 'preturn'].includes(k.key);
  }

  trendMax = computed(() => Math.max(0, ...(this.d()?.trend ?? []).map(p => p.value)));

  pct(v: number): number {
    const max = this.trendMax();
    return max > 0 ? Math.max(2, (v / max) * 100) : 2;
  }
  bar(v: number, list: Rank[]): number {
    const max = Math.max(...list.map(r => Math.abs(r.value)), 1);
    return Math.max(3, (Math.abs(v) / max) * 100);
  }

  /** 340000 → "3.4L" — trader isi bhasha me padhta hai. */
  short(v: number): string {
    if (v >= 1e7) return (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
    if (v >= 1e5) return (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return String(Math.round(v));
  }

  kpiCls(t: string) {
    return t === 'green' ? 'border-t-emerald-500' : t === 'amber' ? 'border-t-amber-500'
         : t === 'red' ? 'border-t-anjaninex-red' : t === 'slate' ? 'border-t-slate-300'
         : 'border-t-anjaninex-navy';
  }
  kpiTxt(t: string) {
    return t === 'green' ? 'text-emerald-700' : t === 'amber' ? 'text-amber-700'
         : t === 'red' ? 'text-anjaninex-red' : 'text-anjaninex-navy';
  }
  alertCls(t: string) {
    return t === 'red' ? 'bg-rose-50 text-rose-800 border-anjaninex-red'
         : t === 'amber' ? 'bg-amber-50 text-amber-800 border-amber-400'
         : 'bg-sky-50 text-sky-800 border-sky-400';
  }

  /** April se nayi financial year — "2026-27". */
  fy(): string {
    const n = new Date();
    const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1;
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  }
  aaj(): string {
    return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
