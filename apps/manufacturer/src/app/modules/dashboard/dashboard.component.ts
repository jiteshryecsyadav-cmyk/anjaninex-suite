import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

interface Kpi {
  key: string; label: string; value: number; sub: string | null; tone: string;
  spark: number[] | null; delta: number | null;
}
interface Alert { text: string; link: string | null; tone: string; }
interface Point { label: string; value: number; }
interface Rank  { name: string; value: number; sub: string | null; }

interface Dash {
  firmName: string; from: string; to: string; period: string;
  sales: Kpi[]; production: Kpi[]; stock: Kpi[]; purchase: Kpi[];
  alerts: Alert[]; trend: Point[];
  topParties: Rank[]; topDesigns: Rank[]; godowns: Rank[]; topKarigars: Rank[];
}

const DONUT_COLORS = ['#1B2E5C', '#DC2626', '#F97316', '#10B981', '#9333ea', '#0284c7'];

/**
 * Manufacturer ka dashboard — agency (trading) wale Pro Dashboard ki hi shakl:
 * navy header, tab patti, period patti, chaar KPI card sparkline ke saath,
 * insight ki peeli patti, aur neeche widget.
 *
 * Dono app ek hi product hain; alag-alag dikhte to aadmi ko lagta wo kisi doosri
 * jagah aa gaya. Isliye class ke naam bhi wahi rakhe hain.
 *
 * Kram: pehle "kya bigda hai" (insight patti), phir "kitna hua" (KPI), phir
 * gehrai. Malik ko subah yahi kram chahiye.
 */
@Component({
  selector: 'mfg-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-7xl mx-auto">

      <!-- ============ HEADER ============ -->
      <div class="pd-header">
        <div class="ph-left">
          <span class="ph-bolt">⚡</span>
          <div>
            <h1 class="ph-title">{{ d()?.firmName || 'Dashboard' }}</h1>
            <p class="ph-sub">
              Manufacturer · {{ fy() }} · Welcome back, {{ pehlaNaam() }}
            </p>
          </div>
        </div>
        <div class="ph-right">
          <span class="ph-date">{{ aaj() }}</span>
          <button class="ph-bell" [class.has-new]="alerts().length > 0"
                  (click)="alertsOpen.set(!alertsOpen())" title="Dhyan dene wali baatein">
            🔔
            @if (alerts().length > 0) {
              <span class="bell-badge">{{ alerts().length }}</span>
            }
          </button>
        </div>
      </div>

      <!-- ============ TAB STRIP ============ -->
      <div class="tab-bar">
        <div class="tab-strip">
          @for (t of tabs; track t.key) {
            <button (click)="tab.set(t.key)" [class.tab-active]="tab() === t.key"
                    class="tab-btn">{{ t.icon }} {{ t.label }}</button>
          }
        </div>
      </div>

      <!-- ============ PERIOD ============ -->
      <div class="filter-row">
        <div class="period-tabs">
          @for (p of periods; track p.key) {
            <button (click)="period.set(p.key); load()" [class.pt-active]="period() === p.key"
                    class="pt-btn">{{ p.label }}</button>
          }
        </div>
        @if (d(); as x) {
          <span class="range-lbl">{{ x.from | date:'d MMM' }} — {{ x.to | date:'d MMM y' }}</span>
        }
      </div>

      @if (err()) {
        <div class="alert-row al-critical mb-3"><span class="al-ico">🔴</span>
          <div class="al-title">{{ err() }}</div><span></span></div>
      }

      @if (loading()) {
        <div class="empty-state">Ruk jaiye…</div>
      } @else {
      @if (d(); as x) {

        <!-- ============ KPI ============ -->
        <div class="kpi-grid">
          @for (k of kpis(); track k.key; let i = $index) {
            <div class="kpi-card" [class]="'kpi-' + (i + 1)">
              <div class="kpi-top">
                <span class="kpi-ico">{{ icon(k.key) }}</span>
                @if (k.delta != null) {
                  <span class="kpi-delta" [class]="k.delta >= 0 ? 'delta-up' : 'delta-warn'">
                    {{ k.delta >= 0 ? '↑' : '↓' }}{{ abs(k.delta) }}%
                  </span>
                } @else if (k.sub) {
                  <span class="kpi-delta delta-pending">{{ k.sub }}</span>
                }
              </div>
              <div class="kpi-value">{{ money(k) ? '₹' : '' }}{{ short(k.value) }}</div>
              <div class="kpi-label">{{ k.label }}</div>

              <!-- Chhoti line — pichhle 8 mahine ki asli chaal. Data na ho to
                   line hi nahi dikhti; banawati line dikhana jhooth hota. -->
              @if (k.spark && k.spark.length > 1 && maxOf(k.spark) > 0) {
                <svg class="kpi-spark" viewBox="0 0 100 30">
                  <line x1="0" y1="5" x2="100" y2="5" class="spark-grid"/>
                  <line x1="0" y1="16" x2="100" y2="16" class="spark-grid"/>
                  <line x1="0" y1="27" x2="100" y2="27" class="spark-grid"/>
                  <polyline [attr.points]="sparkLine(k.spark)" fill="none"
                            [attr.stroke]="sparkColor(i)" stroke-width="1.8"
                            stroke-linejoin="round" stroke-linecap="round"/>
                  @for (p of sparkDots(k.spark); track $index) {
                    <circle [attr.cx]="p.x" [attr.cy]="p.y" r="1.9" [attr.fill]="sparkColor(i)"/>
                  }
                </svg>
              }
            </div>
          }
        </div>

        <!-- ============ INSIGHT (peeli patti) ============ -->
        @if (alerts().length > 0 && !alertsHidden()) {
          <div class="ai-banner">
            <span class="ai-ico">🐯</span>
            <div class="ai-content">
              <strong>Dhyan do:</strong> {{ alerts()[0].text }}
              @if (alerts()[0].link) {
                <a class="ai-link" [routerLink]="alerts()[0].link">kholo →</a>
              }
              @if (alerts().length > 1) {
                <span class="ai-more" (click)="alertsOpen.set(true)">
                  +{{ alerts().length - 1 }} aur</span>
              }
            </div>
            <button class="ai-dismiss" (click)="alertsHidden.set(true)" title="Chhupa do">✕</button>
          </div>
        } @else if (alerts().length === 0) {
          <div class="ai-banner ai-ok">
            <span class="ai-ico">✅</span>
            <div class="ai-content"><strong>Sab saaf hai</strong> — abhi koi cheez atki nahi.</div>
          </div>
        }

        <!-- ============ WIDGETS ============ -->
        <div class="w-grid">

          <!-- Mahine-wise bikri -->
          <div class="widget w-navy col-span-2">
            <div class="widget-head">
              <div>
                <h3>MAHINE-WISE BIKRI</h3>
                <p class="widget-sub">{{ fy() }} ki poori chaal</p>
              </div>
            </div>
            @if (trendMax() === 0) {
              <div class="empty-state">Is saal abhi koi bill nahi bana</div>
            } @else {
              <div class="trend-summary">
                <span class="trend-big">₹{{ short(trendTotal()) }}</span>
                <span class="trend-sub">Kul bikri {{ fy() }}</span>
              </div>
              <svg class="chart-svg" [attr.viewBox]="'0 0 ' + (x.trend.length * 44) + ' 150'"
                   preserveAspectRatio="none">
                @for (p of x.trend; track p.label; let i = $index) {
                  <rect [attr.x]="i * 44 + 9" [attr.y]="120 - barH(p.value)"
                        width="26" [attr.height]="barH(p.value)" rx="3"
                        [attr.fill]="p.value > 0 ? '#1B2E5C' : '#E5E9F2'"/>
                  @if (p.value > 0) {
                    <text [attr.x]="i * 44 + 22" [attr.y]="114 - barH(p.value)"
                          text-anchor="middle" class="bar-val">{{ short(p.value) }}</text>
                  }
                  <text [attr.x]="i * 44 + 22" y="138" text-anchor="middle"
                        class="ax-lbl">{{ p.label }}</text>
                }
              </svg>
            }
          </div>

          <!-- Kaunsa maal chal raha — donut -->
          <div class="widget w-purple">
            <div class="widget-head">
              <div><h3>MAAL KA HISSA</h3>
                <p class="widget-sub">Kya-kya nikla is samay</p></div>
            </div>
            @if (donut().length === 0) {
              <div class="empty-state">Is samay koi challan nahi</div>
            } @else {
              <svg class="chart-svg-donut" viewBox="0 0 42 42">
                @for (s of donut(); track s.label) {
                  <circle cx="21" cy="21" r="15.9155" fill="transparent"
                          [attr.stroke]="s.color" stroke-width="5"
                          [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off"
                          transform="rotate(-90 21 21)"/>
                }
                <text x="21" y="20.5" text-anchor="middle" class="donut-big">
                  {{ short(donutTotal()) }}</text>
                <text x="21" y="25" text-anchor="middle" class="donut-sub">kul nikla</text>
              </svg>
              <div class="legend-rows">
                @for (s of donut(); track s.label) {
                  <div><span class="lg-dot" [style.background]="s.color"></span>
                    {{ s.label }} — <b>{{ s.pct }}%</b></div>
                }
              </div>
            }
          </div>

          <!-- Sabse bade grahak -->
          <div class="widget w-green">
            <div class="widget-head">
              <div><h3>SABSE BADE GRAHAK</h3>
                <p class="widget-sub">Is samay ki bikri se</p></div>
            </div>
            @if (x.topParties.length === 0) {
              <div class="empty-state">Is samay koi bill nahi</div>
            } @else {
              @for (r of x.topParties; track r.name) {
                <div class="rank-row">
                  <div class="rr-top">
                    <span class="rr-name">{{ r.name }}</span>
                    <span class="rr-val">₹{{ short(r.value) }}</span>
                  </div>
                  <div class="rr-bar"><div class="rr-fill" style="background:#16a34a"
                       [style.width.%]="bar(r.value, x.topParties)"></div></div>
                  @if (r.sub) { <div class="rr-sub">{{ r.sub }}</div> }
                </div>
              }
            }
          </div>

          <!-- Kis karigar ke paas maal -->
          <div class="widget w-amber">
            <div class="widget-head">
              <div><h3>KARIGAR KE PAAS MAAL</h3>
                <p class="widget-sub">Jitna abhi bahar hai</p></div>
              <a class="full-list" routerLink="/production/jobslip">poori list</a>
            </div>
            @if (x.topKarigars.length === 0) {
              <div class="empty-state">Kisi karigar ke paas kuch atka nahi</div>
            } @else {
              @for (r of x.topKarigars; track r.name) {
                <div class="beh-row">
                  <div class="beh-avatar">🧑‍🏭</div>
                  <div class="beh-mid">
                    <div class="beh-name">{{ r.name }}</div>
                    <div class="beh-sub">{{ r.sub }}</div>
                  </div>
                  <div class="beh-right">{{ r.value | number:'1.0-0' }}
                    <span class="beh-rlbl">piece</span></div>
                </div>
              }
            }
          </div>

          <!-- Godown-wise stock -->
          <div class="widget w-blue">
            <div class="widget-head">
              <div><h3>GODOWN ME KITNA MAAL</h3>
                <p class="widget-sub">Abhi ka stock</p></div>
              <a class="full-list" routerLink="/stock/items">stock dekho</a>
            </div>
            @if (x.godowns.length === 0) {
              <div class="empty-state">Abhi kahin stock nahi</div>
            } @else {
              @for (r of x.godowns; track r.name) {
                <div class="beh-row">
                  <div class="beh-avatar bav-buy">🏬</div>
                  <div class="beh-mid"><div class="beh-name">{{ r.name }}</div></div>
                  <!-- Minus laal me — wo hisaab ki galti hai, stock nahi -->
                  <div class="beh-right" [class.text-red-600]="r.value < 0">
                    {{ r.value | number:'1.0-2' }}</div>
                </div>
              }
            }
          </div>
        </div>
      }
      }

      <!-- ============ ALERTS DROPDOWN ============ -->
      @if (alertsOpen()) {
        <div class="alerts-dropdown">
          <div class="ad-head">🔔 Dhyan dene wali baatein</div>
          @for (a of alerts(); track a.text) {
            <a class="ad-row" [routerLink]="a.link" (click)="alertsOpen.set(false)">
              <span>{{ a.tone === 'red' ? '🔴' : a.tone === 'amber' ? '⚠️' : '📌' }}</span>
              <strong>{{ a.text }}</strong>
            </a>
          }
          @if (alerts().length === 0) {
            <div class="empty-state">Sab saaf hai</div>
          }
          <button class="ad-close" (click)="alertsOpen.set(false)">band karo</button>
        </div>
      }
    </div>
  `,
  styles: [`
    /* Agency ke Pro Dashboard se hu-ba-hu — dono app ek hi product hain */
    :host { display: block; }

    .pd-header {
      background: var(--ax-navy, #1B2E5C); color: #fff; padding: 16px 24px; border-radius: 12px;
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;
      box-shadow: 0 4px 12px rgba(27,46,92,0.15);
    }
    .ph-left { display: flex; align-items: center; gap: 14px; }
    .ph-bolt { font-size: 28px; color: #FCD34D; }
    .ph-title { font-size: 22px; font-weight: 900; margin: 0; letter-spacing: .3px; }
    .ph-sub { font-size: 12px; opacity: .85; margin: 2px 0 0; }
    .ph-right { display: flex; align-items: center; gap: 16px; }
    .ph-date {
      background: rgba(255,255,255,.15); padding: 6px 14px; border-radius: 999px;
      font-size: 12px; font-weight: 700; letter-spacing: .4px;
    }
    .ph-bell {
      background: transparent; border: 0; color: #fff; font-size: 22px; cursor: pointer;
      position: relative; padding: 4px;
    }
    .ph-bell.has-new::before {
      content: ''; position: absolute; top: 4px; right: 4px; width: 8px; height: 8px;
      background: #DC2626; border-radius: 50%; animation: pulse 1.5s infinite;
    }
    .bell-badge {
      position: absolute; top: -2px; right: -4px; background: #DC2626; color: #fff;
      font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 999px; line-height: 1;
    }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

    .tab-bar {
      display: flex; justify-content: space-between; align-items: center;
      background: #fff; border: 1px solid #D6DDEA; border-radius: 10px; padding: 6px; margin-bottom: 14px;
    }
    .tab-strip { display: flex; gap: 4px; flex-wrap: wrap; }
    .tab-btn {
      padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px;
      color: #4A5878; background: transparent; border: 0; cursor: pointer; font-family: inherit;
      transition: all .15s;
    }
    .tab-btn:hover { background: #F5EFE3; color: #1B2E5C; }
    .tab-active { background: var(--ax-navy, #1B2E5C) !important; color: #fff !important; }

    .filter-row {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      background: #fff; padding: 10px 14px; border-radius: 10px; border: 1px solid #D6DDEA;
      margin-bottom: 14px; flex-wrap: wrap;
    }
    .period-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
    .pt-btn {
      padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 700;
      background: #fff; border: 1px solid #D6DDEA; color: #4A5878; cursor: pointer;
      font-family: inherit; transition: all .15s;
    }
    .pt-btn:hover { border-color: #1B2E5C; }
    .pt-active {
      background: var(--ax-navy, #1B2E5C) !important; color: #fff !important;
      border-color: var(--ax-navy, #1B2E5C) !important;
    }
    .range-lbl { font-size: 11px; font-weight: 700; color: #9AA5BC; }

    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
    .kpi-card {
      background: #fff; border: 1px solid #D6DDEA; border-radius: 12px; padding: 16px;
      position: relative; overflow: hidden; transition: transform .15s, box-shadow .15s;
    }
    .kpi-card:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(27,46,92,.14); }
    .kpi-1 { border-top: 4px solid #1B2E5C; background: linear-gradient(160deg,#f3f6fc 0%,#fff 55%); }
    .kpi-2 { border-top: 4px solid #F97316; background: linear-gradient(160deg,#fff7ed 0%,#fff 55%); }
    .kpi-3 { border-top: 4px solid #10B981; background: linear-gradient(160deg,#ecfdf5 0%,#fff 55%); }
    .kpi-4 { border-top: 4px solid #DC2626; background: linear-gradient(160deg,#fef2f2 0%,#fff 55%); }
    .kpi-1 .kpi-value { color: #1B2E5C; }
    .kpi-2 .kpi-value { color: #EA580C; }
    .kpi-3 .kpi-value { color: #059669; }
    .kpi-4 .kpi-value { color: #DC2626; }
    .kpi-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 6px; }
    .kpi-ico {
      font-size: 20px; width: 38px; height: 38px; display: flex; align-items: center;
      justify-content: center; border-radius: 10px; flex: none;
    }
    .kpi-1 .kpi-ico { background: #1B2E5C15; }
    .kpi-2 .kpi-ico { background: #F9731620; }
    .kpi-3 .kpi-ico { background: #10B98120; }
    .kpi-4 .kpi-ico { background: #DC262615; }
    .kpi-delta { font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 999px; text-align: right; }
    .delta-up { background: #D1FAE5; color: #047857; }
    .delta-pending { background: #FED7AA; color: #C2410C; }
    .delta-warn { background: #FEE2E2; color: #DC2626; }
    .kpi-value { font-size: 28px; font-weight: 900; font-family: 'JetBrains Mono', monospace; line-height: 1.1; }
    .kpi-label {
      font-size: 10px; font-weight: 800; color: #4A5878; letter-spacing: .5px;
      text-transform: uppercase; margin-top: 4px;
    }
    .kpi-spark { width: 100%; height: 30px; margin-top: 8px; overflow: visible; }
    .spark-grid { stroke: #D6DDEA; stroke-width: .5; stroke-dasharray: 2 2; }

    .ai-banner {
      background: linear-gradient(90deg,#FEF3C7,#FFFBEB);
      border: 1px solid #FCD34D; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px;
      display: flex; align-items: center; gap: 12px;
    }
    .ai-banner.ai-ok { background: linear-gradient(90deg,#D1FAE5,#F0FDF4); border-color: #6EE7B7; }
    .ai-ok .ai-content { color: #065F46; }
    .ai-ico { font-size: 22px; }
    .ai-content { flex: 1; font-size: 13px; color: #92400E; }
    .ai-content strong { color: #1B2E5C; }
    .ai-link { color: #DC2626; font-weight: 700; text-decoration: none; margin-left: 6px; }
    .ai-link:hover { text-decoration: underline; }
    .ai-more { margin-left: 8px; font-weight: 700; color: #1B2E5C; cursor: pointer; text-decoration: underline; }
    .ai-dismiss { background: transparent; border: 0; color: #92400E; cursor: pointer; padding: 4px 8px; font-size: 14px; }

    .w-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .col-span-2 { grid-column: span 2; }
    .widget {
      background: #fff; border: 1px solid #D6DDEA; border-radius: 12px; padding: 16px;
      box-shadow: 0 1px 3px rgba(27,46,92,.04);
    }
    .widget-head {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 10px; border-bottom: 1px solid #F5EFE3; margin-bottom: 12px;
    }
    .widget-head h3 { font-size: 12px; font-weight: 800; letter-spacing: .5px; margin: 0; }
    .widget-sub { font-size: 11px; color: #6B7280; margin: 2px 0 0; }
    .full-list { font-size: 11px; font-weight: 700; color: #DC2626; text-decoration: none; }
    .full-list:hover { text-decoration: underline; }

    .w-navy   { border-left: 4px solid #1B2E5C; background: linear-gradient(125deg,#1B2E5C0d 0%,#fff 42%); }
    .w-purple { border-left: 4px solid #9333ea; background: linear-gradient(125deg,#9333ea0d 0%,#fff 42%); }
    .w-blue   { border-left: 4px solid #0284c7; background: linear-gradient(125deg,#0284c70d 0%,#fff 42%); }
    .w-green  { border-left: 4px solid #16a34a; background: linear-gradient(125deg,#16a34a0d 0%,#fff 42%); }
    .w-amber  { border-left: 4px solid #d97706; background: linear-gradient(125deg,#d977060d 0%,#fff 42%); }
    .w-navy   .widget-head h3 { color: #1B2E5C; }
    .w-purple .widget-head h3 { color: #7e22ce; }
    .w-blue   .widget-head h3 { color: #0369a1; }
    .w-green  .widget-head h3 { color: #15803d; }
    .w-amber  .widget-head h3 { color: #b45309; }

    .chart-svg { width: 100%; height: auto; max-height: 220px; }
    .chart-svg-donut { width: 100%; max-height: 190px; }
    .ax-lbl { font-size: 9px; fill: #6B7280; }
    .bar-val { font-size: 9px; fill: #4A5878; font-weight: 700; }
    .donut-big { font-size: 6px; font-weight: 800; fill: #1B2E5C; font-family: 'JetBrains Mono', monospace; }
    .donut-sub { font-size: 2.6px; fill: #6B7280; }
    .legend-rows { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 11px; color: #4A5878; }
    .lg-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }

    .trend-summary { margin-bottom: 6px; }
    .trend-big { font-size: 26px; font-weight: 800; color: #DC2626; font-family: 'JetBrains Mono', monospace; }
    .trend-sub { font-size: 11px; color: #6B7280; margin-left: 8px; }

    .rank-row { margin-bottom: 10px; }
    .rr-top { display: flex; font-size: 12px; margin-bottom: 4px; gap: 8px; }
    .rr-name { font-weight: 700; color: #1B2E5C; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rr-val { margin-left: auto; font-weight: 900; color: #1B2E5C; font-family: 'JetBrains Mono', monospace; flex: none; }
    .rr-bar { height: 6px; background: #E5E9F2; border-radius: 99px; overflow: hidden; }
    .rr-fill { height: 100%; border-radius: 99px; transition: width .4s; }
    .rr-sub { font-size: 10px; color: #9CA3AF; margin-top: 2px; }

    .beh-row { display: flex; gap: 12px; align-items: center; padding: 9px 2px; border-bottom: 1px solid #F5EFE3; }
    .beh-row:last-child { border-bottom: 0; }
    .beh-avatar {
      width: 34px; height: 34px; border-radius: 10px; background: #FEF3C7;
      display: flex; align-items: center; justify-content: center; font-size: 15px; flex: none;
    }
    .bav-buy { background: #E8ECF5; }
    .beh-mid { flex: 1; min-width: 0; }
    .beh-name { font-weight: 700; font-size: 13px; color: #1B2E5C; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .beh-sub { font-size: 11px; color: #6B7280; margin-top: 1px; }
    .beh-right { text-align: right; font-weight: 900; font-size: 13px; color: #1B2E5C; flex: none; font-family: 'JetBrains Mono', monospace; }
    .beh-rlbl { display: block; font-size: 9px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; }
    .text-red-600 { color: #DC2626 !important; }

    .alert-row {
      display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center;
      padding: 12px 14px; border-radius: 8px; border-left: 4px solid; margin-bottom: 12px;
    }
    .al-critical { background: #FEE2E2; border-color: #DC2626; }
    .al-ico { font-size: 18px; }
    .al-title { font-size: 13px; font-weight: 700; color: #1B2E5C; }

    .alerts-dropdown {
      position: fixed; top: 110px; right: 30px; z-index: 100;
      width: 380px; max-width: calc(100vw - 24px);
      background: #fff; border: 1px solid #D6DDEA; border-radius: 12px;
      box-shadow: 0 12px 32px rgba(27,46,92,.2); padding: 8px;
    }
    .ad-head { font-size: 12px; font-weight: 800; color: #1B2E5C; padding: 8px 10px; }
    .ad-row {
      display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: start;
      padding: 10px; border-radius: 6px; cursor: pointer; text-decoration: none;
    }
    .ad-row:hover { background: #FAF7F0; }
    .ad-row strong { display: block; font-size: 12px; color: #1B2E5C; font-weight: 600; }
    .ad-close {
      width: 100%; margin-top: 4px; padding: 8px; border: 0; background: #F5EFE3;
      border-radius: 8px; font-size: 11px; font-weight: 700; color: #4A5878; cursor: pointer;
    }

    .empty-state { padding: 32px 12px; text-align: center; color: #9CA3AF; font-size: 12px; }
    .mb-3 { margin-bottom: 12px; }

    @media (max-width: 900px) { .w-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 640px) {
      .pd-header { flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px 16px; }
      .ph-right { width: 100%; justify-content: space-between; }
      .ph-title { font-size: 18px; }
      .kpi-grid { grid-template-columns: 1fr 1fr; }
      .kpi-value { font-size: 22px; }
      .w-grid { grid-template-columns: 1fr; }
      .col-span-2 { grid-column: span 1; }
      .alerts-dropdown { left: 12px; right: 12px; width: auto; }
    }
  `]
})
export class DashboardComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg`;
  auth = inject(AuthService);

  tabs = [
    { key: 'sales',      icon: '📊', label: 'Bikri' },
    { key: 'production', icon: '🏭', label: 'Kaam' },
    { key: 'stock',      icon: '📦', label: 'Maal' },
    { key: 'purchase',   icon: '🛒', label: 'Khareed' }
  ];
  periods = [
    { key: 'week',    label: 'This Week' },
    { key: 'month',   label: 'This Month' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'year',    label: 'Full Year' }
  ];

  tab = signal('sales');
  period = signal('month');

  d = signal<Dash | null>(null);
  loading = signal(true);
  err = signal('');
  alertsOpen = signal(false);
  alertsHidden = signal(false);

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    this.err.set('');
    this.http.get<Dash>(`${this.base}/dashboard?period=${this.period()}`).subscribe({
      next: r => { this.d.set(r); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'Dashboard nahi aa paya'); this.loading.set(false); }
    });
  }

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

  alerts = computed<Alert[]>(() => this.d()?.alerts ?? []);

  /** Rupaye wale aankde par ₹, piece/ginti wale par nahi. */
  money(k: Kpi): boolean {
    return ['bikri', 'mila', 'bakaya', 'wapas', 'khareed', 'preturn'].includes(k.key);
  }

  icon(key: string): string {
    const m: Record<string, string> = {
      bikri: '📦', mila: '✅', bakaya: '⏳', wapas: '↩️',
      slips: '✂️', baahar: '🧑‍🏭', aaye: '✅', kharab: '⚠️',
      design: '🎨', material: '🧵', items: '📋', minus: '🔴',
      khareed: '📥', po: '🛍️', preturn: '↪️'
    };
    return m[key] ?? '📊';
  }

  // ── chart madad ──
  trendMax = computed(() => Math.max(0, ...(this.d()?.trend ?? []).map(p => p.value)));
  trendTotal = computed(() => (this.d()?.trend ?? []).reduce((a, p) => a + p.value, 0));

  barH(v: number): number {
    const max = this.trendMax();
    return max > 0 ? Math.max(2, (v / max) * 100) : 2;
  }
  bar(v: number, list: Rank[]): number {
    const max = Math.max(...list.map(r => Math.abs(r.value)), 1);
    return Math.max(3, (Math.abs(v) / max) * 100);
  }

  /** Donut ke tukde — SVG circle ke dash/offset se bante hain, bina kisi library ke. */
  donut = computed(() => {
    const list = (this.d()?.topDesigns ?? []).filter(r => r.value > 0);
    const total = list.reduce((a, r) => a + r.value, 0);
    if (total <= 0) return [];

    let chala = 0;
    return list.map((r, i) => {
      const pct = (r.value / total) * 100;
      const seg = { label: r.name, color: DONUT_COLORS[i % DONUT_COLORS.length],
                    pct: Math.round(pct), dash: `${pct} ${100 - pct}`, off: 25 - chala };
      chala += pct;
      return seg;
    });
  });
  donutTotal = computed(() =>
    (this.d()?.topDesigns ?? []).filter(r => r.value > 0).reduce((a, r) => a + r.value, 0));

  sparkColor(i: number): string {
    return ['#1B2E5C', '#F97316', '#10B981', '#DC2626'][i % 4];
  }
  sparkDots(arr: number[]): { x: number; y: number }[] {
    const max = Math.max(...arr, 1);
    const min = Math.min(...arr, 0);
    const span = max - min || 1;
    const step = arr.length > 1 ? 100 / (arr.length - 1) : 100;
    return arr.map((v, i) => ({
      x: +(i * step).toFixed(1),
      y: +(27 - ((v - min) / span) * 22).toFixed(1)
    }));
  }
  sparkLine(arr: number[]): string {
    return this.sparkDots(arr).map(p => `${p.x},${p.y}`).join(' ');
  }
  maxOf(arr: number[]): number { return Math.max(...arr, 0); }
  abs(n: number): number { return Math.abs(n); }

  /** 340000 → "3.4L" — trader isi bhasha me padhta hai. */
  short(v: number): string {
    if (Math.abs(v) >= 1e7) return (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
    if (Math.abs(v) >= 1e5) return (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(v * 100) / 100);
  }

  pehlaNaam(): string {
    return (this.auth.user()?.fullName ?? 'User').trim().split(' ')[0];
  }
  /** April se nayi financial year — "FY 2026-27". */
  fy(): string {
    const n = new Date();
    const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1;
    return `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  }
  aaj(): string {
    return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
