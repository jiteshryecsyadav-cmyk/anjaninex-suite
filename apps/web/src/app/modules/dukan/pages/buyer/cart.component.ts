import { Component, inject, signal, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DukanService } from '../../dukan.service';
import { Order, Address } from '../../models';
import { getCurrentLocationAddress, pickContact, lookupPincode, searchPostOffice, PostOffice } from '../../geo.util';

type Step = 'cart' | 'address' | 'payment' | 'success';

@Component({
  selector: 'app-cart',
  standalone: true,
  template: `
  <!-- progress -->
  @if (step() !== 'success' && ds.cart().length) {
    <div class="row" style="gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <span class="badge" [style.background]="step()==='cart' ? '#F2C200':'var(--panel2)'" style="padding:5px 12px">1. Cart</span>
      <span style="color:var(--muted)">→</span>
      <span class="badge" [style.background]="step()==='address' ? '#F2C200':'var(--panel2)'" style="padding:5px 12px">2. Address</span>
      <span style="color:var(--muted)">→</span>
      <span class="badge" [style.background]="step()==='payment' ? '#F2C200':'var(--panel2)'" style="padding:5px 12px">3. Payment</span>
    </div>
  }

  <!-- SUCCESS -->
  @if (step() === 'success' && order()) {
    <div class="card" style="padding:30px;text-align:center;max-width:460px;margin:20px auto">
      <div style="font-size:54px">✅</div>
      <h2 style="margin:6px 0">Payment Successful</h2>
      <div style="color:var(--muted);font-size:13px">Order <b>{{ order()!.id }}</b> · Bill <b>{{ order()!.billNo }}</b></div>
      <div style="font-size:30px;font-weight:800;color:var(--deep);margin:14px 0">₹{{ order()!.total }}</div>
      <span class="badge off" style="font-size:13px;padding:5px 14px">PAID</span>
      <div style="font-size:12px;color:var(--muted);margin-top:18px">Dhanyawaad! 🎉 Aapka order place ho gaya</div>
      <div class="row" style="justify-content:center;gap:10px;margin-top:18px">
        <button class="btn" (click)="router.navigate(['/dukan/shop', ds.shopFirmId(), 'bills'])">View Bill</button>
        <button class="btn ghost" (click)="router.navigate(['/dukan/shop', ds.shopFirmId(), 'catalog'])">Continue Shopping</button>
      </div>
    </div>
  }

  <!-- EMPTY -->
  @else if (ds.cart().length === 0) {
    <div class="empty card" style="padding:50px">Cart khaali hai 🛒<br><span style="font-size:12px">Catalog se product add karein</span></div>
  }

  <!-- CART -->
  @else if (step() === 'cart') {
    <div class="grid" style="grid-template-columns:1.6fr 1fr;align-items:start">
      <div class="card" style="padding:6px 16px">
        @for (l of ds.cart(); track l.id) {
          <div class="row" style="justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--line)">
            <div>
              <div style="font-weight:700;font-size:14px">{{ ds.find(l.id)?.name }}</div>
              <div style="font-size:12px;color:var(--muted)">₹{{ ds.find(l.id)?.rate }} each</div>
            </div>
            <div class="qty">
              <button (click)="ds.setQty(l.id, l.qty-1)">−</button><b>{{ l.qty }}</b>
              <button (click)="ds.add(l.id)">+</button>
              <button class="btn danger sm" (click)="ds.remove(l.id)">✕</button>
            </div>
          </div>
        }
      </div>
      <div class="card" style="padding:18px">
        <h3 style="margin-bottom:10px">Order Summary</h3>
        <div class="row" style="justify-content:space-between;margin:6px 0"><span>Subtotal</span><b>₹{{ ds.cartSubtotal() }}</b></div>
        <div class="row" style="justify-content:space-between;margin:8px 0">
          <label class="sw"><input type="checkbox" [checked]="deliveryOn()" (change)="deliveryOn.set($any($event.target).checked)"><span class="sw-track"></span> Delivery</label>
          <b [style.opacity]="deliveryOn() ? 1 : 0.4">₹{{ deliveryAmt() }}</b>
        </div>
        <div class="row" style="justify-content:space-between;margin:8px 0">
          <label class="sw"><input type="checkbox" [checked]="gstOn()" (change)="gstOn.set($any($event.target).checked)"><span class="sw-track"></span> GST</label>
          <b [style.opacity]="gstOn() ? 1 : 0.4">₹{{ gstOn() ? gstAmt() : 0 }}</b>
        </div>
        <hr style="border:none;border-top:1px solid var(--line);margin:10px 0">
        <div class="row" style="justify-content:space-between;font-size:18px"><span>Total</span><b style="color:var(--deep)">₹{{ orderTotal() }}</b></div>
        <button class="btn" style="width:100%;margin-top:14px" (click)="goAddress()">Confirm Order →</button>
      </div>
    </div>
  }

  <!-- ADDRESS -->
  @else if (step() === 'address') {
    <div class="card" style="padding:20px;max-width:560px">
      <h3 style="margin-bottom:8px">Delivery Address</h3>

      @if (ds.addresses().length) {
        <div style="font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:8px">Saved addresses — choose karein</div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          @for (a of ds.addresses(); track a.id) {
            <div class="card" style="padding:10px 12px;cursor:pointer;border:2px solid var(--line)"
                 [style.border-color]="pickedAddr() === a.id ? 'var(--orange)' : 'var(--line)'"
                 (click)="pickAddress(a)">
              <div class="row" style="justify-content:space-between"><b style="font-size:13px">{{ a.label || 'Address' }}</b>@if (a.isDefault) { <span class="badge off">Default</span> }</div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px">{{ a.receiver }} · {{ a.city }} {{ a.pin }}</div>
            </div>
          }
        </div>
      }
      <div class="row" style="justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">
        <span style="font-size:12.5px;font-weight:700;color:var(--muted)">{{ ds.addresses().length ? 'Ya naya address bharein' : 'Address daalein' }}</span>
        <div class="row" style="gap:6px">
          <button class="btn ghost sm" (click)="fromContacts()">📇 Contacts</button>
          <button class="btn ghost sm" (click)="useLocation()" [disabled]="locating()">{{ locating() ? '📍 ...' : '📍 Current location' }}</button>
        </div>
      </div>
      <div class="formgrid">
        <div><label>Receiver Name *</label><input [value]="receiver()" (input)="receiver.set($any($event.target).value)" placeholder="Name"></div>
        <div><label>Mobile *</label><input maxlength="10" [value]="mobile()" (input)="mobile.set($any($event.target).value)" placeholder="10-digit mobile"></div>
      </div>
      <label>Full Address *</label>
      <textarea rows="2" [value]="line()" (input)="line.set($any($event.target).value)" placeholder="House / shop, street, area"></textarea>
      <div class="formgrid">
        <div><label>State</label>
          <input list="states" [value]="state()" (input)="onState($any($event.target).value)" placeholder="Search state">
          <datalist id="states">@for (s of ds.allStatesList(); track s) { <option [value]="s"></option> }</datalist>
        </div>
        <div><label>City / Area</label>
          <input list="cities" [value]="city()" (input)="onCity($any($event.target).value)" placeholder="Type city/area (3+)">
          <datalist id="cities">@for (po of citySuggest(); track po.name+po.pin) { <option [value]="po.name">{{ po.district }}, {{ po.state }} — {{ po.pin }}</option> }</datalist>
        </div>
        <div><label>PIN Code</label>
          <input maxlength="6" [value]="pin()" (input)="onPin($any($event.target).value)" placeholder="6-digit PIN → auto fill">
        </div>
      </div>
      @if (loadingGeo()) { <div style="font-size:12px;color:var(--muted);margin-top:6px">📍 fetching location data...</div> }
      <div class="row" style="gap:10px;margin-top:16px">
        <button class="btn ghost" (click)="step.set('cart')">← Back to Cart</button>
        <button class="btn" (click)="goPayment()">Proceed to Pay →</button>
      </div>
    </div>
  }

  <!-- PAYMENT -->
  @else if (step() === 'payment') {
    <div class="card" style="padding:22px;max-width:460px;margin:0 auto;text-align:center">
      <div class="badge" [style.background]="secs() <= 20 ? '#fdeaea':'var(--panel2)'"
           [style.color]="secs() <= 20 ? '#c0392b':'var(--ink)'" style="padding:6px 14px;font-size:14px">
        ⏱ Time left: {{ mmss() }}
      </div>
      <h3 style="margin:14px 0 4px">Scan & Pay ₹{{ payAmount() }}</h3>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">UPI app se scan karo ya button dabao</div>
      <img [src]="qrUrl()" width="190" height="190" alt="UPI QR"
           style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px">
      <div class="card" style="padding:14px;margin-top:14px;background:var(--panel2);text-align:left;font-size:13px;line-height:1.8">
        <div>Pay to: <b>{{ ds.seller().name }}</b></div>
        <div>UPI: <b>{{ ds.seller().upi }}</b></div>
        <div>Bank: <b>{{ ds.seller().bank }}</b> · A/C <b>{{ ds.seller().acc }}</b></div>
        <div>Amount: <b style="color:var(--deep)">₹{{ payAmount() }}</b></div>
      </div>
      <a class="btn" [href]="upiLink()" style="display:block;width:100%;margin-top:12px;text-decoration:none">Open UPI App & Pay</a>
      <button class="btn ghost" style="width:100%;margin-top:10px" (click)="confirm()">✓ Payment ho gaya — Confirm Order</button>
      <button class="btn danger sm" style="margin-top:10px" (click)="cancel()">Cancel</button>
    </div>
  }
  `,
})
export class CartComponent implements OnDestroy {
  ds = inject(DukanService);
  router = inject(Router);

  step = signal<Step>('cart');
  receiver = signal('');
  mobile = signal('');
  line = signal('');
  state = signal('');
  city = signal('');
  pin = signal('');
  order = signal<Order | null>(null);

  secs = signal(120);
  payAmount = signal(0);
  private timer: any = null;

  pickedAddr = signal<string>('');
  locating = signal(false);
  gstOn = signal(true);
  deliveryOn = signal(true);

  gstAmt(): number { return this.ds.cartGst(); }
  deliveryAmt(): number { return this.deliveryOn() ? this.ds.DELIVERY : 0; }
  orderTotal(): number { return this.ds.cart().length ? this.ds.cartSubtotal() + this.deliveryAmt() + (this.gstOn() ? this.gstAmt() : 0) : 0; }

  onState(v: string) { this.state.set(v); }

  // ---- Live PIN/City via India Post API ----
  citySuggest = signal<PostOffice[]>([]);
  loadingGeo = signal(false);
  private cityTimer: any = null;

  onPin(v: string) {
    const p = v.replace(/\D/g, '').slice(0, 6);
    this.pin.set(p);
    if (/^\d{6}$/.test(p)) {
      this.loadingGeo.set(true);
      lookupPincode(p).then(list => {
        if (list.length) { this.city.set(list[0].district); this.state.set(list[0].state); }
        this.loadingGeo.set(false);
      });
    }
  }
  onCity(v: string) {
    this.city.set(v);
    const m = this.citySuggest().find(p => p.name.toLowerCase() === v.toLowerCase());
    if (m) { this.city.set(m.district); this.state.set(m.state); this.pin.set(m.pin); }
    clearTimeout(this.cityTimer);
    if (v.trim().length >= 3) {
      this.cityTimer = setTimeout(async () => {
        this.loadingGeo.set(true);
        this.citySuggest.set(await searchPostOffice(v.trim()));
        this.loadingGeo.set(false);
      }, 400);
    }
  }

  goAddress() {
    const def = this.ds.defaultAddress();
    if (def && !this.receiver()) this.pickAddress(def);
    this.step.set('address');
  }
  pickAddress(a: Address) {
    this.pickedAddr.set(a.id);
    this.receiver.set(a.receiver); this.mobile.set(a.mobile);
    this.line.set(a.line); this.state.set(a.state); this.city.set(a.city); this.pin.set(a.pin);
  }
  async useLocation() {
    this.locating.set(true); this.pickedAddr.set('');
    try {
      const loc = await getCurrentLocationAddress();
      this.line.set(loc.line); this.city.set(loc.city); this.state.set(loc.state); this.pin.set(loc.pin);
    } catch (e) { alert(typeof e === 'string' ? e : 'Location nahi mili'); }
    this.locating.set(false);
  }
  async fromContacts() {
    try {
      const c = await pickContact();
      if (c) { if (c.name) this.receiver.set(c.name); if (c.tel) this.mobile.set(c.tel); }
    } catch (e) { alert(typeof e === 'string' ? e : 'Contact pick nahi hua'); }
  }

  goPayment() {
    if (!this.receiver() || !this.mobile() || !this.line()) { alert('Receiver, mobile aur address bharein'); return; }
    this.payAmount.set(this.orderTotal());
    this.step.set('payment');
    this.secs.set(120);
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.secs.set(this.secs() - 1);
      if (this.secs() <= 0) { clearInterval(this.timer); alert('Payment time expire ho gaya. Dobara try karein.'); this.step.set('cart'); }
    }, 1000);
  }

  mmss(): string {
    const m = Math.floor(this.secs() / 60), s = this.secs() % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  upiLink(): string {
    const s = this.ds.seller();
    return `upi://pay?pa=${s.upi}&pn=${encodeURIComponent(s.name)}&am=${this.payAmount()}&cu=INR&tn=${encodeURIComponent('Online Dukan Order')}`;
  }
  qrUrl(): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(this.upiLink())}`;
  }

  async confirm() {
    clearInterval(this.timer);
    const addr = `${this.line()}, ${this.city()} ${this.pin()} (${this.state()})`.trim();
    try {
      const o = await this.ds.placeOrder(this.receiver(), addr, { gst: this.gstOn(), delivery: this.deliveryOn() });
      this.order.set(o);
      this.step.set('success');
    } catch (e: any) { alert(e?.message || 'Order place nahi hua'); this.step.set('cart'); }
    return;
  }
  cancel() { clearInterval(this.timer); this.step.set('cart'); }
  ngOnDestroy() { clearInterval(this.timer); }
}
