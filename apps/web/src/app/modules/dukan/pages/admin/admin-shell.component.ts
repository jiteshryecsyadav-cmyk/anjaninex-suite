import { Component, signal, inject, ViewEncapsulation, OnInit, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { DukanService } from '../../dukan.service';
import { DUKAN_STYLES } from '../../dukan.styles';

@Component({
  selector: 'app-dukan-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  // ViewEncapsulation.None: the ported KALINDI CSS (scoped under .dukan-scope) must
  // reach the child page components rendered inside <router-outlet>.
  encapsulation: ViewEncapsulation.None,
  styles: [DUKAN_STYLES],
  template: `
  <div class="dukan-scope" style="padding:16px 22px;max-width:1200px;margin:0 auto">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:4px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:24px">🛒</span>
        <div>
          <div style="font-size:20px;font-weight:800;color:#16294F">Online Dukan</div>
          <div style="font-size:12.5px;color:#6B7280">{{ ds.seller().name }} · apni online shop</div>
        </div>
      </div>
      <a routerLink="/" style="font-size:13px;color:#16294F;border:1px solid #d6def0;padding:7px 14px;border-radius:8px;text-decoration:none">← Back to Suite</a>
    </div>
    <!-- Horizontal tabs (Bazaar Link style) -->
    <nav class="dk-tabs">
      <a class="dk-tab" routerLink="/dukan/admin/dashboard" routerLinkActive="dk-tab-on">📊 Dashboard</a>
      <a class="dk-tab" routerLink="/dukan/admin/categories" routerLinkActive="dk-tab-on">🗂️ Categories</a>
      <a class="dk-tab" routerLink="/dukan/admin/products" routerLinkActive="dk-tab-on">📦 Catalog Manage</a>
      <a class="dk-tab" routerLink="/dukan/admin/orders" routerLinkActive="dk-tab-on">🧾 Orders</a>
      <a class="dk-tab" routerLink="/dukan/admin/billing" routerLinkActive="dk-tab-on">💳 Billing</a>
      <a class="dk-tab" routerLink="/dukan/admin/reviews" routerLinkActive="dk-tab-on">⭐ Reviews</a>
      <a class="dk-tab" routerLink="/dukan/admin/bank" routerLinkActive="dk-tab-on">🏦 Bank &amp; UPI</a>
      <a class="dk-tab" routerLink="/dukan/admin/profile" routerLinkActive="dk-tab-on">👤 Profile</a>
    </nav>
    <router-outlet></router-outlet>

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
export class DukanAdminShellComponent implements OnInit {
  ds = inject(DukanService);
  open = signal(false);

  ngOnInit() { this.ds.boot(); this.ds.enableNotifications(); }

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
