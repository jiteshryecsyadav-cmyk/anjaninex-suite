import { Component, inject, signal, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DukanService } from '../../dukan.service';
import { getCurrentLocationAddress } from '../../geo.util';

@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [RouterLink],
  template: `
  <h2 style="font-size:18px;margin-bottom:14px">Admin Profile</h2>

  <!-- Stats -->
  <div class="grid stats" style="margin-bottom:18px">
    <div class="stat" style="background:#3A4252"><h4>Total Orders</h4><div class="v">{{ ds.orders().length }}</div></div>
    <div class="stat" style="background:#F2C200;color:#2A2300"><h4 style="opacity:.8">Revenue</h4><div class="v">₹{{ ds.totalSpent() }}</div></div>
    <div class="stat" style="background:#4B5563"><h4>Products</h4><div class="v">{{ ds.products().length }}</div></div>
    <div class="stat" style="background:#272D3A"><h4>Categories</h4><div class="v">{{ ds.categories().length }}</div></div>
  </div>

  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <!-- Business identity (editable) -->
    <div class="card" style="padding:20px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--orange);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800">D</div>
        <div>
          <div style="font-weight:800;font-size:17px">Business Details</div>
          <div style="font-size:12.5px;color:var(--muted)">Seller / Admin · ⭐ {{ ds.avgRating() ? ds.avgRating().toFixed(1) : ds.seller().rating }}</div>
        </div>
      </div>
      <div class="formgrid">
        <div><label>Business Name</label><input [value]="f.name" (input)="f.name=$any($event.target).value"></div>
        <div><label>Mobile No</label><input maxlength="10" [value]="f.mobile" (input)="f.mobile=$any($event.target).value"></div>
        <div><label>Email ID</label><input [value]="f.email" (input)="f.email=$any($event.target).value"></div>
        <div><label>GST No</label><input [value]="f.gst" (input)="f.gst=$any($event.target).value"></div>
        <div><label>City</label><input [value]="f.city" (input)="f.city=$any($event.target).value"></div>
        <div><label>UPI ID</label><input [value]="f.upi" (input)="f.upi=$any($event.target).value"></div>
      </div>
      <div class="row" style="justify-content:space-between;align-items:center">
        <label style="margin:10px 0 5px">Office Address</label>
        <button class="btn ghost sm" (click)="useLocation()" [disabled]="locating()">{{ locating() ? '📍 ...' : '📍 Use current location' }}</button>
      </div>
      <textarea rows="2" [value]="f.address" (input)="f.address=$any($event.target).value" placeholder="Full business address"></textarea>
      @if (f.lat) { <div style="font-size:11.5px;color:var(--green);margin-top:4px">📍 GPS location set ({{ f.lat.toFixed(4) }}, {{ f.lng?.toFixed(4) }}) — buyer ko map pe dikhega</div> }
      <div style="font-weight:700;font-size:13px;margin:14px 0 4px">📱 Social / Contact (buyer ko dikhega)</div>
      <div class="formgrid">
        <div><label>WhatsApp No</label><input maxlength="10" [value]="f.whatsapp" (input)="f.whatsapp=$any($event.target).value" placeholder="10-digit number"></div>
        <div><label>Instagram ID</label><input [value]="f.instagram" (input)="f.instagram=$any($event.target).value" placeholder="@username"></div>
        <div><label>Facebook ID / Page</label><input [value]="f.facebook" (input)="f.facebook=$any($event.target).value" placeholder="username or page name"></div>
      </div>
      <button class="btn" style="width:100%;margin-top:12px" (click)="saveBiz()">Save Business Details</button>
      <a class="btn ghost sm" routerLink="/dukan/admin/bank" style="display:inline-block;margin-top:10px;text-decoration:none">Bank account & QR →</a>
    </div>

    <!-- Admin login note: managed by Anjaninex -->
    <div class="card" style="padding:20px">
      <div style="font-weight:800;margin-bottom:4px">🔒 Admin Login</div>
      <div style="font-size:12.5px;color:var(--muted)">
        Online Dukan ka admin aap khud Anjaninex login se manage karte hain.
        User ID / password badalne ke liye upar-right user menu se
        <b style="color:var(--ink)">Change Password</b> use karein.
      </div>
    </div>
  </div>
  `,
})
export class AdminProfileComponent {
  ds = inject(DukanService);

  f: { name: string; mobile: string; email: string; gst: string; city: string; upi: string; address: string; whatsapp: string; instagram: string; facebook: string; lat?: number; lng?: number } =
    { name: '', mobile: '', email: '', gst: '', city: '', upi: '', address: '', whatsapp: '', instagram: '', facebook: '' };
  private loaded = false;
  locating = signal(false);

  constructor() {
    effect(() => {
      const s = this.ds.seller();
      if (!this.loaded && s.name) {
        this.f = { name: s.name, mobile: s.mobile ?? '', email: s.email ?? '', gst: s.gst, city: s.city, upi: s.upi, address: s.address ?? '', whatsapp: s.whatsapp ?? '', instagram: s.instagram ?? '', facebook: s.facebook ?? '', lat: s.lat, lng: s.lng };
        this.loaded = true;
      }
    });
  }
  async useLocation() {
    this.locating.set(true);
    try {
      const loc = await getCurrentLocationAddress();
      this.f = { ...this.f, lat: loc.lat, lng: loc.lng };
      if (!this.f.address && loc.line) this.f.address = `${loc.line}, ${loc.city} ${loc.pin}`.trim();
    } catch (e) { alert(typeof e === 'string' ? e : 'Location nahi mili'); }
    this.locating.set(false);
  }
  saveBiz() {
    if (!this.f.name.trim()) { alert('Business name zaroori hai'); return; }
    this.ds.saveSeller({ name: this.f.name, mobile: this.f.mobile, email: this.f.email, gst: this.f.gst, city: this.f.city, upi: this.f.upi, address: this.f.address, whatsapp: this.f.whatsapp, instagram: this.f.instagram, facebook: this.f.facebook, lat: this.f.lat, lng: this.f.lng });
  }
}
