import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

// =============================================================================
// PHOTO LIGHTBOX — chat ki photo par tap → poori screen + ZOOM
// • Mobile: do ungli se pinch zoom-in/out, ek ungli se ghumao (pan)
// • Desktop: mouse-wheel se zoom, drag se ghumao
// • Double-tap = 2x / wapas · +/− buttons · ⬇️ download · ✕ band
// Template me: <app-photo-lightbox #lb /> aur img par (click)="lb.open(url)"
// =============================================================================
@Component({
  selector: 'app-photo-lightbox',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (url(); as u) {
      <div class="plb-ov" (click)="close()">
        <img [src]="u" class="plb-img" [style.transform]="tf()"
             (click)="$event.stopPropagation()"
             (dblclick)="toggle()"
             (wheel)="onWheel($event)"
             (pointerdown)="pd($event)" (pointermove)="pm($event)"
             (pointerup)="pu($event)" (pointercancel)="pu($event)" (pointerleave)="pu($event)"
             draggable="false" alt="photo">
        <div class="plb-bar" (click)="$event.stopPropagation()">
          <button (click)="zoom(-0.5)" title="Chhota">−</button>
          <span class="plb-pct">{{ pct() }}%</span>
          <button (click)="zoom(0.5)" title="Bada">+</button>
          <button (click)="reset()" title="Wapas normal">↺</button>
          <a [href]="u" target="_blank" download title="Download">⬇️</a>
          <button (click)="close()" title="Band">✕</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .plb-ov { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.92);
      display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .plb-img { max-width: 96vw; max-height: 88vh; user-select: none;
      touch-action: none; cursor: grab; transition: transform .05s linear; }
    .plb-img:active { cursor: grabbing; }
    .plb-bar { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 6px; align-items: center; background: rgba(255,255,255,.14);
      backdrop-filter: blur(6px); border-radius: 999px; padding: 8px 14px; }
    .plb-bar button, .plb-bar a { color: #fff; font-size: 20px; font-weight: 700;
      width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
      border-radius: 50%; text-decoration: none; }
    .plb-bar button:active, .plb-bar a:active { background: rgba(255,255,255,.25); }
    .plb-pct { color: #fff; font-size: 13px; min-width: 48px; text-align: center; }
  `]
})
export class PhotoLightboxComponent {
  url = signal<string | null>(null);
  scale = signal(1);
  tx = signal(0); ty = signal(0);
  tf = computed(() => `translate(${this.tx()}px, ${this.ty()}px) scale(${this.scale()})`);
  pct = computed(() => Math.round(this.scale() * 100));

  open(u: string) { this.url.set(u); this.reset(); }
  close() { this.url.set(null); this.pointers.clear(); }
  reset() { this.scale.set(1); this.tx.set(0); this.ty.set(0); }
  toggle() { this.scale() > 1 ? this.reset() : this.scale.set(2); }
  zoom(d: number) { this.scale.set(Math.min(6, Math.max(0.5, this.scale() + d))); }

  // ---- pan + pinch (pointer events — mobile pinch bhi isi se) ----
  private pointers = new Map<number, { x: number; y: number }>();
  private lastDist = 0;

  pd(e: PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.lastDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  pm(e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    if (this.pointers.size === 2) {
      // PINCH — do ungli ki doori badle to zoom
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.lastDist > 0)
        this.scale.set(Math.min(6, Math.max(0.5, this.scale() * (dist / this.lastDist))));
      this.lastDist = dist;
    } else if (this.pointers.size === 1) {
      // PAN — ek ungli/drag se ghumao
      this.tx.set(this.tx() + (e.clientX - prev.x));
      this.ty.set(this.ty() + (e.clientY - prev.y));
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }
  pu(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastDist = 0;
  }
  onWheel(e: WheelEvent) {
    e.preventDefault();
    this.zoom(e.deltaY < 0 ? 0.25 : -0.25);
  }
}
