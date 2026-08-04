import { Component, inject, signal } from '@angular/core';
import { DukanService } from '../../dukan.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
  <div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:20px;font-weight:800">Dashboard Overview</div>
      <div style="font-size:12.5px;color:var(--muted)">{{ ds.seller().name }} · live business snapshot</div>
    </div>
    <div class="card" style="padding:8px 14px;display:flex;align-items:center;gap:8px">
      <span class="stars-lg" style="font-size:15px">@for (s of [1,2,3,4,5]; track s) { <span [style.opacity]="ds.avgRating() >= s - 0.4 ? '1':'0.25'">★</span> }</span>
      <b>{{ ds.avgRating() ? ds.avgRating().toFixed(1) : ds.seller().rating }}</b>
    </div>
  </div>

  <div class="grid stats">
    <div class="stat" style="background:#3A4252">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h4>Total Orders</h4><div class="v">{{ ds.orders().length }}</div></div><div class="stat-ic">🧾</div></div>
    </div>
    <div class="stat" style="background:#F2C200;color:#2A2300">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div>
          <h4 style="opacity:.85">Revenue</h4>
          <div class="v">₹{{ ds.totalSpent() }}</div>
          @if (growthPct() !== null) {
            <span class="trend-up" style="background:rgba(0,0,0,.12)">▲ {{ growthPct() }}% sales</span>
          } @else {
            <span class="trend-up" style="background:rgba(0,0,0,.12)">▲ start selling</span>
          }
        </div>
        <div class="stat-ic">💰</div>
      </div>
    </div>
    <div class="stat" style="background:#4B5563">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h4>Products</h4><div class="v">{{ ds.products().length }}</div></div><div class="stat-ic">📦</div></div>
    </div>
    <div class="stat" style="background:#272D3A">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h4>Categories</h4><div class="v">{{ ds.categories().length }}</div></div><div class="stat-ic">🗂️</div></div>
    </div>
  </div>

  <!-- Daily sales -->
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-top:16px">
    <div class="stat" style="background:#1F7A4D"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h4>Aaj ke Orders</h4><div class="v">{{ todayOrders() }}</div></div><div class="stat-ic">📅</div></div></div>
    <div class="stat" style="background:#15603B"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h4>Aaj ki Sale</h4><div class="v">₹{{ todaySales() }}</div></div><div class="stat-ic">💵</div></div></div>
    <div class="stat" style="background:#3A4252"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h4>7-Din Sale</h4><div class="v">₹{{ week().total }}</div></div><div class="stat-ic">🗓️</div></div></div>
    <div class="stat" style="background:#272D3A"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h4>7-Din Orders</h4><div class="v">{{ week().count }}</div></div><div class="stat-ic">🧾</div></div></div>
  </div>

  <div class="card" style="padding:18px;margin-top:16px">
    <div class="row" style="justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="font-weight:800">📈 Sales — {{ period()==='week' ? 'Last 7 Days' : period()==='month' ? 'Last 12 Months' : 'Last 5 Years' }}</div>
      <div class="row" style="gap:6px">
        <button class="chip-pick" [style.background]="period()==='week' ? '#F2C200':'var(--panel2)'" (click)="period.set('week')">Daily</button>
        <button class="chip-pick" [style.background]="period()==='month' ? '#F2C200':'var(--panel2)'" (click)="period.set('month')">Monthly</button>
        <button class="chip-pick" [style.background]="period()==='year' ? '#F2C200':'var(--panel2)'" (click)="period.set('year')">Yearly</button>
      </div>
    </div>
    @if (chartEmpty()) {
      <div class="empty" style="padding:24px">Abhi koi sale nahi. Order aate hi graph yahan dikhega 📊</div>
    } @else {
      <div style="display:flex;align-items:flex-end;gap:8px;height:180px;padding-top:16px;overflow-x:auto">
        @for (d of chartData(); track d.label) {
          <div style="min-width:40px;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
            <div style="font-size:9.5px;font-weight:700;color:var(--deep)">{{ d.total ? '₹'+d.total : '' }}</div>
            <div [style.height.%]="d.pct" style="width:100%;background:var(--orange);border-radius:5px 5px 0 0;min-height:3px;transition:height .4s"></div>
            <div style="font-size:10px;color:var(--ink);margin-top:5px;font-weight:600;white-space:nowrap">{{ d.short }}</div>
            <div style="font-size:9px;color:var(--muted)">{{ d.count }} ord</div>
          </div>
        }
      </div>
    }
  </div>

  <!-- Charts -->
  <div class="grid" style="grid-template-columns:1.2fr 1fr;align-items:start;margin-top:18px">
    <!-- Products per category (bars) -->
    <div class="card" style="padding:18px">
      <div style="font-weight:800;margin-bottom:12px">📦 Products per Category</div>
      @for (b of catBars(); track b.name) {
        <div style="margin:9px 0">
          <div class="row" style="justify-content:space-between;font-size:12.5px"><span>{{ b.name }}</span><b>{{ b.count }}</b></div>
          <div style="background:var(--panel2);border-radius:6px;height:11px;overflow:hidden;margin-top:3px">
            <div [style.width.%]="b.pct" style="background:var(--orange);height:100%;border-radius:6px;transition:width .4s"></div>
          </div>
        </div>
      }
      @if (catBars().length === 0) { <div class="empty" style="padding:20px">Koi product nahi</div> }
    </div>

    <!-- Catalog donut: single vs combo -->
    <div class="card" style="padding:18px;text-align:center">
      <div style="font-weight:800;margin-bottom:8px">🍩 Catalog Split</div>
      <svg viewBox="0 0 36 36" style="width:150px;height:150px">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--panel2)" stroke-width="4"/>
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#3A4252" stroke-width="4"
                [attr.stroke-dasharray]="singlePct() + ' ' + (100 - singlePct())" stroke-dashoffset="25"/>
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#F2C200" stroke-width="4"
                [attr.stroke-dasharray]="comboPct() + ' ' + (100 - comboPct())" [attr.stroke-dashoffset]="25 - singlePct()"/>
        <text x="18" y="18" text-anchor="middle" dy="0.35em" font-size="6" font-weight="800" fill="var(--ink)">{{ ds.products().length }}</text>
      </svg>
      <div class="row" style="justify-content:center;gap:16px;margin-top:8px;font-size:12.5px">
        <span><span style="display:inline-block;width:10px;height:10px;background:#3A4252;border-radius:3px"></span> Single ({{ singleCount() }})</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#F2C200;border-radius:3px"></span> Combo ({{ comboCount() }})</span>
      </div>
    </div>
  </div>

  <!-- Stock per category + Revenue bars -->
  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start;margin-top:16px">
    <div class="card" style="padding:18px">
      <div style="font-weight:800;margin-bottom:12px">📊 Stock by Category</div>
      @for (b of stockBars(); track b.name) {
        <div style="margin:9px 0">
          <div class="row" style="justify-content:space-between;font-size:12.5px"><span>{{ b.name }}</span><b>{{ b.count }}</b></div>
          <div style="background:var(--panel2);border-radius:6px;height:11px;overflow:hidden;margin-top:3px">
            <div [style.width.%]="b.pct" style="background:var(--gold);height:100%;border-radius:6px"></div>
          </div>
        </div>
      }
      @if (stockBars().length === 0) { <div class="empty" style="padding:20px">Koi stock nahi</div> }
    </div>

    <div class="card" style="padding:18px">
      <div style="font-weight:800;margin-bottom:12px">💰 Revenue — Recent Orders</div>
      @if (revBars().length === 0) {
        <div class="empty" style="padding:30px">Order aate hi yahan revenue graph dikhega 📈</div>
      } @else {
        <div style="display:flex;align-items:flex-end;gap:10px;height:140px;padding-top:10px">
          @for (d of revBars(); track d.label) {
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
              <div style="font-size:10px;font-weight:700;color:var(--deep)">₹{{ d.total }}</div>
              <div [style.height.%]="d.pct" style="width:100%;background:var(--orange);border-radius:5px 5px 0 0;min-height:3px;transition:height .4s"></div>
              <div style="font-size:9.5px;color:var(--muted);margin-top:4px">{{ d.label }}</div>
            </div>
          }
        </div>
      }
    </div>
  </div>

  <!-- Recent orders -->
  <div class="sec-head">Recent Orders</div>
  @if (ds.orders().length === 0) {
    <div class="empty card" style="padding:40px">Abhi koi order nahi aaya</div>
  } @else {
    <div class="card" style="padding:6px 16px">
      <table class="tbl">
        <tr><th>Order</th><th>Bill</th><th>Receiver</th><th>Total</th><th>Status</th></tr>
        @for (o of ds.orders(); track o.id) {
          <tr><td>{{ o.id }}</td><td>{{ o.billNo }}</td><td>{{ o.receiver }}</td><td>₹{{ o.total }}</td><td><span class="badge off">{{ o.status }}</span></td></tr>
        }
      </table>
    </div>
  }
  `,
})
export class DashboardComponent {
  ds = inject(DukanService);

  private bars(valueFn: (catId: string) => number) {
    const rows = this.ds.categories()
      .map(c => ({ name: c.name, count: valueFn(c.id) }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
    const max = Math.max(1, ...rows.map(r => r.count));
    return rows.map(r => ({ ...r, pct: Math.round(r.count / max * 100) }));
  }
  catBars() { return this.bars(id => this.ds.products().filter(p => p.catId === id).length); }
  stockBars() { return this.bars(id => this.ds.products().filter(p => p.catId === id).reduce((s, p) => s + p.stock, 0)); }

  singleCount() { return this.ds.products().filter(p => !p.combo).length; }
  comboCount() { return this.ds.products().filter(p => p.combo).length; }
  singlePct() { const t = this.ds.products().length; return t ? Math.round(this.singleCount() / t * 100) : 0; }
  comboPct() { const t = this.ds.products().length; return t ? 100 - this.singlePct() : 0; }

  /** Sales growth %: recent half vs older half of orders */
  growthPct(): number | null {
    const o = this.ds.orders();
    if (o.length < 2) return null;
    const half = Math.ceil(o.length / 2);
    const recent = o.slice(0, half).reduce((s, x) => s + x.total, 0);
    const older = o.slice(half).reduce((s, x) => s + x.total, 0);
    if (older === 0) return 100;
    return Math.round((recent - older) / older * 100);
  }

  // ---- Daily sales ----
  private sameDay(iso: string, d: Date) { const o = new Date(iso); return o.toDateString() === d.toDateString(); }
  todayOrders(): number { const t = new Date(); return this.ds.orders().filter(o => this.sameDay(o.date, t)).length; }
  todaySales(): number { const t = new Date(); return this.ds.orders().filter(o => this.sameDay(o.date, t)).reduce((s, o) => s + o.total, 0); }
  last7() {
    const days: Date[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const rows = days.map(d => {
      const ord = this.ds.orders().filter(o => this.sameDay(o.date, d));
      return { label: d.toISOString().slice(0, 10), short: d.toLocaleDateString('en-IN', { weekday: 'short' }), total: ord.reduce((s, o) => s + o.total, 0), count: ord.length };
    });
    const max = Math.max(1, ...rows.map(r => r.total));
    return rows.map(r => ({ ...r, pct: Math.round(r.total / max * 100) }));
  }
  week() { const r = this.last7(); return { total: r.reduce((s, x) => s + x.total, 0), count: r.reduce((s, x) => s + x.count, 0) }; }

  period = signal<'week' | 'month' | 'year'>('week');
  monthly() {
    const now = new Date(); const months: Date[] = [];
    for (let i = 11; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    const rows = months.map(d => {
      const ord = this.ds.orders().filter(o => { const od = new Date(o.date); return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth(); });
      return { label: d.getFullYear() + '-' + (d.getMonth() + 1), short: d.toLocaleDateString('en-IN', { month: 'short' }) + " '" + String(d.getFullYear()).slice(2), total: ord.reduce((s, o) => s + o.total, 0), count: ord.length };
    });
    const max = Math.max(1, ...rows.map(r => r.total));
    return rows.map(r => ({ ...r, pct: Math.round(r.total / max * 100) }));
  }
  yearly() {
    const y0 = new Date().getFullYear(); const years: number[] = [];
    for (let i = 4; i >= 0; i--) years.push(y0 - i);
    const rows = years.map(y => {
      const ord = this.ds.orders().filter(o => new Date(o.date).getFullYear() === y);
      return { label: '' + y, short: '' + y, total: ord.reduce((s, o) => s + o.total, 0), count: ord.length };
    });
    const max = Math.max(1, ...rows.map(r => r.total));
    return rows.map(r => ({ ...r, pct: Math.round(r.total / max * 100) }));
  }
  chartData() { return this.period() === 'week' ? this.last7() : this.period() === 'month' ? this.monthly() : this.yearly(); }
  chartEmpty() { return this.chartData().every(r => r.total === 0); }

  revBars() {
    const rows = this.ds.orders().slice(0, 7).reverse().map(o => ({ label: o.id.replace('RKS-', '#'), total: o.total }));
    const max = Math.max(1, ...rows.map(r => r.total));
    return rows.map(r => ({ ...r, pct: Math.round(r.total / max * 100) }));
  }
}
