import { Component, inject, computed } from '@angular/core';
import { DukanService } from '../../dukan.service';

@Component({
  selector: 'app-catalog',
  standalone: true,
  template: `
  <div class="card" style="padding:16px;margin-bottom:18px">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-weight:800;font-size:18px">{{ ds.seller().name }}</div>
        <div style="font-size:12.5px;color:var(--muted)">{{ ds.seller().city }}</div>
      </div>
      <div class="chip" style="background:#FBBF24;color:#5C3D00;border-color:#F59E0B;font-weight:800">⭐ {{ ds.avgRating() ? ds.avgRating().toFixed(1) : ds.seller().rating }}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin-top:12px;font-size:12.5px">
      <div><span style="color:var(--muted)">GST No:</span> <b>{{ ds.seller().gst }}</b></div>
      <div><span style="color:var(--muted)">UPI:</span> <b>{{ ds.seller().upi }}</b></div>
      <div><span style="color:var(--muted)">Bank:</span> <b>{{ ds.seller().bank }}</b></div>
      <div><span style="color:var(--muted)">A/C:</span> <b>{{ ds.seller().acc }}</b> · IFSC <b>{{ ds.seller().ifsc }}</b></div>
      @if (ds.seller().mobile) { <div><span style="color:var(--muted)">Phone:</span> <b>{{ ds.seller().mobile }}</b></div> }
      @if (ds.seller().email) { <div><span style="color:var(--muted)">Email:</span> <b>{{ ds.seller().email }}</b></div> }
      @if (ds.seller().address) { <div style="grid-column:1/-1"><span style="color:var(--muted)">Address:</span> <b>{{ ds.seller().address }}</b></div> }
    </div>

    <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
      @if (ds.seller().whatsapp) { <a [href]="waUrl()" target="_blank" style="background:#25D366;color:#fff;padding:7px 13px;border-radius:8px;font-size:12.5px;font-weight:700;text-decoration:none">💬 WhatsApp</a> }
      @if (ds.seller().mobile) { <a [href]="'tel:'+ds.seller().mobile" style="background:var(--orange);color:#fff;padding:7px 13px;border-radius:8px;font-size:12.5px;font-weight:700;text-decoration:none">📞 Call</a> }
      @if (ds.seller().instagram) { <a [href]="igUrl()" target="_blank" style="background:#E1306C;color:#fff;padding:7px 13px;border-radius:8px;font-size:12.5px;font-weight:700;text-decoration:none">📷 Instagram</a> }
      @if (ds.seller().facebook) { <a [href]="fbUrl()" target="_blank" style="background:#1877F2;color:#fff;padding:7px 13px;border-radius:8px;font-size:12.5px;font-weight:700;text-decoration:none">f Facebook</a> }
      @if (ds.seller().lat || ds.seller().address) { <a [href]="mapUrl()" target="_blank" style="background:#EA4335;color:#fff;padding:7px 13px;border-radius:8px;font-size:12.5px;font-weight:700;text-decoration:none">📍 Location / Map</a> }
    </div>
  </div>

  @for (cat of activeCats(); track cat.id) {
    <div class="sec-head">{{ cat.name }} <span class="pill">{{ countIn(cat.id) }} items</span></div>
    <div class="grid cards">
      @for (p of productsIn(cat.id); track p.id) {
        <div class="card prod">
          <div class="ph">@if (p.img) { <img [src]="p.img" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in" (click)="ds.openImage(p.img)"> } @else { {{ p.combo ? '🎁' : '📦' }} }</div>
          <div class="body">
            <div class="nm">{{ p.name }}</div>
            <div class="cd">{{ p.code }}</div>
            <div class="price">
              <span class="rt">₹{{ p.rate }}</span>
              @if (p.mrp > p.rate) { <span class="mrp">₹{{ p.mrp }}</span> }
              @if (ds.discPct(p.mrp,p.rate) > 0) { <span class="badge off">{{ ds.discPct(p.mrp,p.rate) }}% off</span> }
            </div>
            <div class="row" style="margin:8px 0;flex-wrap:wrap;gap:6px">
              @if (p.combo) { <span class="badge combo">COMBO</span> }
              @if (p.stock < 25) { <span class="badge low">limited! ({{ p.stock }})</span> }
              @else { <span style="font-size:11.5px;color:var(--muted)">Stock: {{ p.stock }}</span> }
            </div>
            @if (ds.qtyOf(p.id) === 0) {
              <button class="btn sm" (click)="ds.add(p.id)" style="margin-top:auto">+ Add</button>
            } @else {
              <div class="qty" style="margin-top:auto">
                <button (click)="ds.setQty(p.id, ds.qtyOf(p.id)-1)">−</button>
                <b>{{ ds.qtyOf(p.id) }}</b>
                <button (click)="ds.add(p.id)">+</button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  }
  `,
})
export class CatalogComponent {
  ds = inject(DukanService);
  activeCats = computed(() => this.ds.categories().filter(c => c.status === 'active' && this.countIn(c.id) > 0));
  productsIn(catId: string) { return this.ds.products().filter(p => p.catId === catId); }
  countIn(catId: string) { return this.productsIn(catId).length; }

  waUrl(): string { const n = (this.ds.seller().whatsapp || '').replace(/\D/g, ''); return 'https://wa.me/' + (n.length === 10 ? '91' + n : n); }
  igUrl(): string { const v = (this.ds.seller().instagram || '').trim(); return v.startsWith('http') ? v : 'https://instagram.com/' + v.replace(/^@/, ''); }
  fbUrl(): string { const v = (this.ds.seller().facebook || '').trim(); return v.startsWith('http') ? v : 'https://facebook.com/' + v.replace(/^@/, ''); }
  mapUrl(): string {
    const s = this.ds.seller();
    if (s.lat && s.lng) return `https://www.google.com/maps?q=${s.lat},${s.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(((s.address || '') + ' ' + (s.city || '')).trim())}`;
  }
}
