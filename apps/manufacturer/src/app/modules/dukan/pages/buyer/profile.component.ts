import { Component, inject, signal, effect } from '@angular/core';
import { DukanService } from '../../dukan.service';
import { PinInputComponent } from '../../pin-input.component';
import { Address } from '../../models';
import { getCurrentLocationAddress, pickContact, lookupPincode, searchPostOffice, PostOffice } from '../../geo.util';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [PinInputComponent],
  template: `
  <h2 style="font-size:18px;margin-bottom:14px">My Profile</h2>

  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <!-- Profile details (editable) -->
    <div class="card" style="padding:20px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--orange);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800">{{ initial() }}</div>
        <div>
          <div style="font-weight:800;font-size:17px">{{ b()?.name }}</div>
          <div style="font-size:12.5px;color:var(--muted)">Buyer ID: {{ b()?.id }}</div>
        </div>
      </div>
      <div class="formgrid">
        <div><label>Name</label><input [value]="p.name" (input)="p.name=$any($event.target).value"></div>
        <div><label>Phone</label><input maxlength="10" [value]="p.phone" (input)="p.phone=$any($event.target).value"></div>
        <div><label>Email</label><input [value]="p.email" (input)="p.email=$any($event.target).value" placeholder="optional"></div>
        <div><label>GSTIN</label><input [value]="p.gstin" (input)="p.gstin=$any($event.target).value" placeholder="optional"></div>
      </div>
      <div class="row" style="justify-content:space-between;padding:10px 0;margin-top:6px;border-top:1px solid var(--line)"><span style="color:var(--muted)">Total Orders</span><b>{{ ds.orders().length }}</b></div>
      <div class="row" style="justify-content:space-between;padding:10px 0;border-top:1px solid var(--line)"><span style="color:var(--muted)">Total Spent</span><b>₹{{ ds.totalSpent() }}</b></div>
      <button class="btn" style="width:100%;margin-top:12px" (click)="saveProfile()">Save Profile</button>
    </div>

    <!-- Change PIN -->
    <div class="card" style="padding:20px">
      <div style="font-weight:800;margin-bottom:4px">🔒 Change PIN</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Apna 6-digit login PIN badlein</div>
      <label>Current PIN</label>
      <app-pin-input (valueChange)="oldPin.set($event); err.set(''); ok.set(false)"></app-pin-input>
      <label style="margin-top:12px">New PIN</label>
      <app-pin-input (valueChange)="newPin.set($event); err.set(''); ok.set(false)"></app-pin-input>
      <label style="margin-top:12px">Confirm New PIN</label>
      <app-pin-input (valueChange)="newPin2.set($event); err.set(''); ok.set(false)"></app-pin-input>
      @if (err()) { <div style="color:#c0392b;font-size:12.5px;margin-top:10px">{{ err() }}</div> }
      @if (ok()) { <div style="color:var(--green);font-size:13px;font-weight:700;margin-top:10px">✓ PIN change ho gaya</div> }
      <button class="btn" style="width:100%;margin-top:14px" (click)="change()">Update PIN</button>
    </div>
  </div>

  <!-- Addresses -->
  <div class="row" style="justify-content:space-between;margin:24px 0 12px">
    <h3 style="font-size:16px">📍 My Addresses</h3>
    <button class="btn sm" (click)="openAddr()">+ Add Address</button>
  </div>

  @if (showForm()) {
    <div class="card" style="padding:18px;margin-bottom:16px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px">
        <b>{{ form.id ? 'Edit' : 'New' }} Address</b>
        <div class="row" style="gap:6px">
          <button class="btn ghost sm" (click)="fromContacts()">📇 Contacts</button>
          <button class="btn ghost sm" (click)="useLocation()" [disabled]="locating()">{{ locating() ? '📍 ...' : '📍 Current location' }}</button>
        </div>
      </div>
      <div class="formgrid">
        <div>
          <label>Address Name / Label</label>
          <input [value]="form.label" (input)="form.label=$any($event.target).value" placeholder="e.g. Office, Home, Friend's place">
          <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:7px">
            @for (l of labelPresets; track l) {
              <span class="chip-pick" [style.background]="form.label===l ? '#F2C200':'var(--panel2)'" [style.color]="form.label===l ? '#2A2300':'var(--ink)'" (click)="form.label=l">{{ l }}</span>
            }
          </div>
        </div>
        <div><label>Receiver Name</label><input [value]="form.receiver" (input)="form.receiver=$any($event.target).value"></div>
        <div><label>Mobile</label><input maxlength="10" [value]="form.mobile" (input)="form.mobile=$any($event.target).value"></div>
        <div><label>PIN Code</label>
          <input maxlength="6" [value]="form.pin" (input)="onPin($any($event.target).value)" placeholder="6-digit PIN → auto city/state">
        </div>
      </div>
      <label>Full Address</label>
      <textarea rows="2" [value]="form.line" (input)="form.line=$any($event.target).value" placeholder="House/shop, street, area"></textarea>
      <div class="formgrid">
        <div><label>State</label>
          <input list="pstate" [value]="form.state" (input)="onState($any($event.target).value)" placeholder="Search state">
          <datalist id="pstate">@for (s of ds.allStatesList(); track s) { <option [value]="s"></option> }</datalist>
        </div>
        <div><label>City / Area</label>
          <input list="pcity" [value]="form.city" (input)="onCity($any($event.target).value)" placeholder="Type city/area (3+ letters)">
          <datalist id="pcity">@for (po of citySuggest(); track po.name+po.pin) { <option [value]="po.name">{{ po.district }}, {{ po.state }} — {{ po.pin }}</option> }</datalist>
        </div>
      </div>
      @if (loadingGeo()) { <div style="font-size:12px;color:var(--muted);margin-top:6px">📍 fetching location data...</div> }
      <label class="remember" style="margin-top:10px"><input type="checkbox" [checked]="form.isDefault" (change)="form.isDefault=$any($event.target).checked"> Default address banayein</label>
      <div class="row" style="gap:10px;margin-top:12px">
        <button class="btn sm" (click)="saveAddr()">Save Address</button>
        <button class="btn ghost sm" (click)="showForm.set(false)">Cancel</button>
      </div>
    </div>
  }

  @if (ds.addresses().length === 0) {
    <div class="empty card" style="padding:30px">Abhi koi address nahi. "+ Add Address" se add karo.</div>
  } @else {
    <div class="grid cards">
      @for (a of ds.addresses(); track a.id) {
        <div class="card" style="padding:14px">
          <div class="row" style="justify-content:space-between">
            <b>{{ a.label || 'Address' }}</b>
            @if (a.isDefault) { <span class="badge off">Default</span> }
          </div>
          <div style="font-size:13px;margin-top:6px">{{ a.receiver }} · {{ a.mobile }}</div>
          <div style="font-size:12.5px;color:var(--muted)">{{ a.line }}, {{ a.city }} {{ a.pin }} ({{ a.state }})</div>
          <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">
            @if (!a.isDefault) { <button class="btn ghost sm" (click)="ds.setDefaultAddress(a.id)">Set default</button> }
            <button class="btn ghost sm" (click)="openAddr(a)">Edit</button>
            <button class="btn danger sm" (click)="ds.deleteAddress(a.id)">Delete</button>
          </div>
        </div>
      }
    </div>
  }
  `,
})
export class ProfileComponent {
  ds = inject(DukanService);
  // profile edit
  p = { name: '', phone: '', email: '', gstin: '' };
  // pin
  oldPin = signal(''); newPin = signal(''); newPin2 = signal(''); err = signal(''); ok = signal(false);
  // address
  showForm = signal(false);
  locating = signal(false);
  form: Address = this.blank();
  labelPresets = ['🏠 Home', '🏢 Office', '🏬 Shop', '🏭 Warehouse', '👥 Friends', '👨‍👩‍👧 Family', '📍 Other'];

  constructor() {
    effect(() => {
      const b = this.ds.currentBuyer();
      if (b && !this.p.name) this.p = { name: b.name ?? '', phone: b.phone ?? '', email: b.email ?? '', gstin: b.gstin ?? '' };
    });
  }

  b() { return this.ds.currentBuyer(); }
  initial() { return (this.b()?.name || '?').trim().charAt(0).toUpperCase(); }

  saveProfile() {
    if (!this.p.name) { alert('Name zaroori hai'); return; }
    this.ds.updateProfile({ name: this.p.name, phone: this.p.phone, email: this.p.email, gstin: this.p.gstin });
  }

  async change() {
    this.err.set(''); this.ok.set(false);
    if (!/^\d{6}$/.test(this.newPin())) { this.err.set('Naya PIN 6 digits ka hona chahiye'); return; }
    if (this.newPin() !== this.newPin2()) { this.err.set('Naye PIN match nahi kar rahe'); return; }
    if (!(await this.ds.changePin(this.oldPin(), this.newPin()))) { this.err.set('Current PIN galat hai'); return; }
    this.ok.set(true);
  }

  onState(v: string) { this.form.state = v; }

  // ---- Live PIN/City via India Post API ----
  citySuggest = signal<PostOffice[]>([]);
  loadingGeo = signal(false);
  private cityTimer: any = null;

  onPin(v: string) {
    this.form.pin = v.replace(/\D/g, '').slice(0, 6);
    if (/^\d{6}$/.test(this.form.pin)) {
      this.loadingGeo.set(true);
      lookupPincode(this.form.pin).then(list => {
        if (list.length) { this.form.city = list[0].district; this.form.state = list[0].state; }
        this.loadingGeo.set(false);
      });
    }
  }
  onCity(v: string) {
    this.form.city = v;
    const m = this.citySuggest().find(p => p.name.toLowerCase() === v.toLowerCase());
    if (m) { this.form.city = m.district; this.form.state = m.state; this.form.pin = m.pin; }
    clearTimeout(this.cityTimer);
    if (v.trim().length >= 3) {
      this.cityTimer = setTimeout(async () => {
        this.loadingGeo.set(true);
        this.citySuggest.set(await searchPostOffice(v.trim()));
        this.loadingGeo.set(false);
      }, 400);
    }
  }

  blank(): Address { return { id: '', label: '', receiver: this.ds.currentBuyer()?.name ?? '', mobile: this.ds.currentBuyer()?.phone ?? '', line: '', city: '', state: '', pin: '', isDefault: false }; }
  openAddr(a?: Address) { this.form = a ? { ...a } : this.blank(); this.showForm.set(true); }
  saveAddr() {
    if (!this.form.receiver || !this.form.line) { alert('Receiver aur address bharein'); return; }
    if (this.form.id) this.ds.updateAddress({ ...this.form }); else this.ds.addAddress({ ...this.form });
    this.showForm.set(false);
  }
  async useLocation() {
    this.locating.set(true);
    try {
      const loc = await getCurrentLocationAddress();
      this.form = { ...this.form, line: loc.line, city: loc.city, state: loc.state, pin: loc.pin, lat: loc.lat, lng: loc.lng };
      if (!this.form.label) this.form.label = 'Current location';
    } catch (e) { alert(typeof e === 'string' ? e : 'Location nahi mili'); }
    this.locating.set(false);
  }
  async fromContacts() {
    try {
      const c = await pickContact();
      if (c) { if (c.name) this.form.receiver = c.name; if (c.tel) this.form.mobile = c.tel; }
    } catch (e) { alert(typeof e === 'string' ? e : 'Contact pick nahi hua'); }
  }
}
