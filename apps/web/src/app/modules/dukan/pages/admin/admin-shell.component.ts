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
  <div class="shell dukan-scope">
    <aside class="sidebar" [class.open]="open()">
      <div class="brand">ONLINE<small>DUKAN</small></div>
      <nav class="nav">
        <a class="nav-item" routerLink="/dukan/admin/dashboard" routerLinkActive="on" (click)="open.set(false)"><span class="ic">📊</span> Dashboard</a>
        <a class="nav-item" routerLink="/dukan/admin/categories" routerLinkActive="on" (click)="open.set(false)"><span class="ic">🗂️</span> Categories</a>
        <a class="nav-item" routerLink="/dukan/admin/products" routerLinkActive="on" (click)="open.set(false)"><span class="ic">📦</span> Catalog Manage</a>
        <a class="nav-item" routerLink="/dukan/admin/orders" routerLinkActive="on" (click)="open.set(false)"><span class="ic">🧾</span> Orders</a>
        <a class="nav-item" routerLink="/dukan/admin/billing" routerLinkActive="on" (click)="open.set(false)"><span class="ic">💳</span> Billing</a>
        <a class="nav-item" routerLink="/dukan/admin/reviews" routerLinkActive="on" (click)="open.set(false)"><span class="ic">⭐</span> Reviews</a>
        <a class="nav-item" routerLink="/dukan/admin/bank" routerLinkActive="on" (click)="open.set(false)"><span class="ic">🏦</span> Bank & UPI</a>
        <a class="nav-item" routerLink="/dukan/admin/profile" routerLinkActive="on" (click)="open.set(false)"><span class="ic">👤</span> Profile</a>
      </nav>
      <div class="sidebar-foot"><a class="logout-btn" routerLink="/" style="text-decoration:none">← Back to Suite</a></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="chip" (click)="open.set(!open())">☰</button>
        <div><div class="tt">Online Dukan · Admin</div><div class="ts">{{ ds.seller().name }}</div></div>
      </header>
      <div class="content"><router-outlet></router-outlet></div>
    </div>

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
