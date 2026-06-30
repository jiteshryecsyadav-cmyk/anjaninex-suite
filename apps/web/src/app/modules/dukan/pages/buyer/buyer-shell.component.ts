import { Component, signal, inject, ViewEncapsulation, OnInit, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { DukanService } from '../../dukan.service';
import { DUKAN_STYLES } from '../../dukan.styles';

@Component({
  selector: 'app-dukan-buyer-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  encapsulation: ViewEncapsulation.None,
  styles: [DUKAN_STYLES],
  template: `
  <div class="dukan-scope" style="min-height:100vh">
    <!-- Sticky storefront header -->
    <header style="position:sticky;top:0;z-index:30;background:linear-gradient(180deg,#23427E,#16294F);color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.15)">
      <div style="max-width:1150px;margin:0 auto;padding:12px 18px;display:flex;align-items:center;gap:12px">
        <span style="font-size:22px">🛍️</span>
        <div style="min-width:0">
          <div style="font-size:17px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ ds.seller().name || 'Online Dukan' }}</div>
          <div style="font-size:11.5px;opacity:.85">{{ ds.buyerName() || 'Online Dukan' }}</div>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <a [routerLink]="['/dukan/shop', firmId, 'cart']" style="background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);color:#fff;font-weight:700;font-size:13px;padding:8px 13px;border-radius:10px">🛒 {{ ds.cartCount() }}</a>
          <button (click)="logout()" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);color:#fff;font-weight:700;font-size:13px;padding:8px 12px;border-radius:10px;cursor:pointer">Logout</button>
        </div>
      </div>
      <div style="max-width:1150px;margin:0 auto;padding:0 18px">
        <nav class="dk-tabs" style="border-bottom:none;margin:0">
          <a class="dk-tab" [routerLink]="['/dukan/shop', firmId, 'catalog']" routerLinkActive="dk-tab-on" style="color:rgba(255,255,255,.8)">🛍️ Catalog</a>
          <a class="dk-tab" [routerLink]="['/dukan/shop', firmId, 'orders']" routerLinkActive="dk-tab-on" style="color:rgba(255,255,255,.8)">📦 My Orders</a>
          <a class="dk-tab" [routerLink]="['/dukan/shop', firmId, 'bills']" routerLinkActive="dk-tab-on" style="color:rgba(255,255,255,.8)">🧾 Bills</a>
          <a class="dk-tab" [routerLink]="['/dukan/shop', firmId, 'ratings']" routerLinkActive="dk-tab-on" style="color:rgba(255,255,255,.8)">⭐ Ratings</a>
          <a class="dk-tab" [routerLink]="['/dukan/shop', firmId, 'profile']" routerLinkActive="dk-tab-on" style="color:rgba(255,255,255,.8)">👤 Profile</a>
        </nav>
      </div>
    </header>
    <div style="max-width:1150px;margin:0 auto;padding:20px 18px"><router-outlet></router-outlet></div>

    <!-- Notification toasts -->
    <div class="toast-wrap">
      @for (t of ds.toasts(); track t.id) {
        <div class="toast" [class.toast-info]="t.type==='info'" [class.toast-error]="t.type==='error'">
          <span>{{ t.type==='error' ? '⚠️' : (t.type==='info' ? 'ℹ️' : '✅') }}</span>
          <span>{{ t.msg }}</span>
        </div>
      }
    </div>

    <!-- Image lightbox / zoom viewer -->
    @if (ds.lightbox(); as img) {
      <div class="lb-overlay" (click)="closeLb()">
        <div class="lb-bar" (click)="$event.stopPropagation()">
          <button (click)="zoom(-0.25)" title="Zoom out">−</button>
          <button (click)="resetLb()" title="Reset">{{ pct() }}%</button>
          <button (click)="zoom(0.25)" title="Zoom in">+</button>
          <button (click)="closeLb()" title="Close">✕</button>
        </div>
        <img [src]="img" class="lb-img" alt="product"
             [style.transform]="'translate(' + panX() + 'px,' + panY() + 'px) scale(' + scale() + ')'"
             [style.cursor]="scale() > 1 ? 'grab' : 'zoom-in'"
             (click)="onImgClick($event)" (wheel)="onWheel($event)" (mousedown)="startPan($event)">
        <div class="lb-hint">Scroll/buttons se zoom · drag se move · bahar click ya ✕ se band</div>
      </div>
    }
  </div>
  `,
})
export class DukanBuyerShellComponent implements OnInit {
  ds = inject(DukanService);
  private router = inject(Router);
  open = signal(false);
  firmId = '';

  ngOnInit() {
    const m = this.router.url.match(/\/dukan\/shop\/([^\/?#]+)/);
    this.firmId = m ? decodeURIComponent(m[1]) : '';
    if (this.firmId && this.firmId !== 'login') this.ds.shopFirmId.set(this.firmId);
    this.ds.boot();
    this.ds.enableNotifications();
    if (!this.ds.role()) this.router.navigate(['/dukan/shop', this.firmId, 'login']);
  }

  logout() { this.ds.logoutBuyer(); this.router.navigate(['/dukan/shop', this.firmId, 'login']); }

  // ---- Lightbox (ported from KALINDI app.component) ----
  scale = signal(1);
  panX = signal(0);
  panY = signal(0);
  private dragging = false;
  private sx = 0; private sy = 0; private ox = 0; private oy = 0;

  pct() { return Math.round(this.scale() * 100); }
  resetLb() { this.scale.set(1); this.panX.set(0); this.panY.set(0); }
  closeLb() { this.ds.closeImage(); this.resetLb(); }
  zoom(d: number) { const s = Math.min(5, Math.max(1, this.scale() + d)); this.scale.set(s); if (s === 1) { this.panX.set(0); this.panY.set(0); } }
  onImgClick(e: MouseEvent) { e.stopPropagation(); if (!this.dragging) this.zoom(this.scale() >= 2.5 ? -1.5 : 0.5); }
  onWheel(e: WheelEvent) { e.preventDefault(); this.zoom(e.deltaY < 0 ? 0.2 : -0.2); }
  startPan(e: MouseEvent) {
    if (this.scale() <= 1) return;
    this.dragging = true; this.sx = e.clientX; this.sy = e.clientY; this.ox = this.panX(); this.oy = this.panY();
    e.preventDefault();
  }
  @HostListener('window:mousemove', ['$event']) onMove(e: MouseEvent) {
    if (!this.dragging) return;
    this.panX.set(this.ox + (e.clientX - this.sx)); this.panY.set(this.oy + (e.clientY - this.sy));
  }
  @HostListener('window:mouseup') onUp() { setTimeout(() => this.dragging = false, 0); }
  @HostListener('window:keydown.escape') onEsc() { if (this.ds.lightbox()) this.closeLb(); }
}
