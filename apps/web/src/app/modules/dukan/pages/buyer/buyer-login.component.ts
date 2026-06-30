import { Component, signal, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { DukanService } from '../../dukan.service';
import { MemberRole } from '../../models';
import { DUKAN_STYLES } from '../../dukan.styles';

/**
 * Online Dukan — unified member login / signup (Buyer · Supplier · Transporter).
 * Login ID = Mobile, credential = chosen password (4-20 chars). Firm comes from
 * the shop link (/dukan/shop/:firmId). After auth, role decides the landing page.
 */
@Component({
  selector: 'app-dukan-buyer-login',
  standalone: true,
  imports: [],
  encapsulation: ViewEncapsulation.None,
  styles: [DUKAN_STYLES],
  template: `
  <div class="dukan-scope">
    <div class="login-wrap">
      <div class="login-card card">
        <div class="logo-box">{{ ds.seller().name || 'ONLINE DUKAN' }}<small>SHOP LOGIN</small></div>

        @if (!showSignup()) {
          <!-- ===== LOGIN ===== -->
          <div style="text-align:center;font-size:13px;color:var(--muted);margin:-8px 0 14px">Mobile + Password se login karein</div>
          <label>Mobile / Naam / ID</label>
          <input [value]="user()" (input)="user.set($any($event.target).value); err.set('')" placeholder="Apna mobile, naam ya ID" (keyup.enter)="login()">
          <label>Password</label>
          <div style="position:relative">
            <input [type]="showPwd() ? 'text' : 'password'" [value]="pwd()" (input)="pwd.set($any($event.target).value); err.set('')" placeholder="Password" (keyup.enter)="login()" style="padding-right:44px">
            <button type="button" (click)="showPwd.set(!showPwd())"
                    style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:none;font-size:18px;cursor:pointer;padding:4px 8px">{{ showPwd() ? '🙈' : '👁️' }}</button>
          </div>
          <label class="remember">
            <input type="checkbox" [checked]="remember()" (change)="remember.set($any($event.target).checked)"> Remember me
          </label>
          @if (err()) { <div style="color:#c0392b;font-size:12.5px;margin-top:12px;text-align:center">{{ err() }}</div> }
          <button class="btn" style="width:100%;margin-top:14px" (click)="login()">Login →</button>
          <div style="text-align:center;font-size:12.5px;margin-top:14px;color:var(--muted)">
            Naya account? <b style="color:var(--brand);cursor:pointer" (click)="showSignup.set(true)">Sign up</b>
          </div>
        } @else {
          <!-- ===== SIGN UP ===== -->
          <div style="text-align:center;font-size:13px;color:var(--muted);margin:-8px 0 12px">Naya account banayein</div>

          <!-- Role toggle -->
          <div class="toggle">
            <button [class.on]="suRole()==='buyer'" (click)="suRole.set('buyer')">🛒 Buyer</button>
            <button [class.on]="suRole()==='supplier'" (click)="suRole.set('supplier')">🏭 Supplier</button>
            <button [class.on]="suRole()==='transporter'" (click)="suRole.set('transporter')">🚚 Transporter</button>
          </div>

          <div class="formgrid">
            <div><label>{{ suRole()==='buyer' ? 'Naam *' : 'Naam (contact person) *' }}</label><input [value]="suName()" (input)="suName.set($any($event.target).value)" placeholder="Aapka naam"></div>
            <div><label>Mobile * (=login ID)</label><input maxlength="10" [value]="suPhone()" (input)="suPhone.set($any($event.target).value)" placeholder="10-digit mobile"></div>
            <div><label>WhatsApp No</label><input maxlength="10" [value]="suWhatsapp()" (input)="suWhatsapp.set($any($event.target).value)" placeholder="optional"></div>
            <div><label>City</label><input [value]="suCity()" (input)="suCity.set($any($event.target).value)" placeholder="Sheher"></div>
            <div><label>State</label><input [value]="suState()" (input)="suState.set($any($event.target).value)" placeholder="Rajya"></div>
            <div style="grid-column:1/-1"><label>Address</label><input [value]="suAddress()" (input)="suAddress.set($any($event.target).value)" placeholder="Poora pata"></div>
          </div>

          @if (suRole()==='supplier') {
            <div class="formgrid">
              <div><label>Business / Firm Name</label><input [value]="suBusiness()" (input)="suBusiness.set($any($event.target).value)" placeholder="Firm ka naam"></div>
              <div><label>GSTIN</label><input [value]="suGstin()" (input)="suGstin.set($any($event.target).value)" placeholder="optional"></div>
              <div style="grid-column:1/-1"><label>Kya supply karte ho (categories)</label><input [value]="suCategories()" (input)="suCategories.set($any($event.target).value)" placeholder="e.g. Saree, Suit, Dress material"></div>
            </div>
          }
          @if (suRole()==='transporter') {
            <div class="formgrid">
              <div><label>Vehicle Type</label><input [value]="suVehicle()" (input)="suVehicle.set($any($event.target).value)" placeholder="Tempo / Truck / Bike"></div>
              <div><label>Capacity</label><input [value]="suCapacity()" (input)="suCapacity.set($any($event.target).value)" placeholder="e.g. 1 Ton"></div>
              <div style="grid-column:1/-1"><label>Route / Coverage Area</label><input [value]="suRoute()" (input)="suRoute.set($any($event.target).value)" placeholder="e.g. Kota–Jaipur–Surat"></div>
            </div>
          }
          @if (suRole()==='buyer') {
            <label>GSTIN (optional)</label>
            <input [value]="suGstin()" (input)="suGstin.set($any($event.target).value)" placeholder="optional">
          }

          <div class="formgrid">
            <div><label>Set Password * (4-20)</label><input type="password" [value]="suPin()" (input)="suPin.set($any($event.target).value)" placeholder="Password"></div>
            <div><label>Confirm Password *</label><input type="password" [value]="suPin2()" (input)="suPin2.set($any($event.target).value)" placeholder="Dobara"></div>
          </div>

          @if (suErr()) { <div style="color:#c0392b;font-size:12.5px;margin-top:8px">{{ suErr() }}</div> }
          <div class="row" style="gap:10px;margin-top:16px">
            <button class="btn ghost" style="flex:1" (click)="showSignup.set(false)">← Login</button>
            <button class="btn" style="flex:2" (click)="doSignup()" [disabled]="busy()">{{ busy() ? '...' : 'Create & Login' }}</button>
          </div>
        }

        <div class="foot">Powered by <b>anjaninex</b> · support&#64;anjaninex.com</div>
      </div>
    </div>
  </div>
  `,
})
export class DukanBuyerLoginComponent implements OnInit {
  ds = inject(DukanService);
  private router = inject(Router);
  user = signal('');
  pwd = signal('');
  err = signal('');
  remember = signal(true);
  showPwd = signal(false);
  busy = signal(false);

  showSignup = signal(false);
  suRole = signal<MemberRole>('buyer');
  suName = signal('');
  suPhone = signal('');
  suWhatsapp = signal('');
  suCity = signal('');
  suState = signal('');
  suAddress = signal('');
  suBusiness = signal('');
  suGstin = signal('');
  suCategories = signal('');
  suVehicle = signal('');
  suRoute = signal('');
  suCapacity = signal('');
  suPin = signal('');
  suPin2 = signal('');
  suErr = signal('');

  firmId = '';

  ngOnInit() {
    const m = this.router.url.match(/\/dukan\/shop\/([^\/?#]+)/);
    this.firmId = m ? decodeURIComponent(m[1]) : '';
    if (this.firmId && this.firmId !== 'login') this.ds.shopFirmId.set(this.firmId);
    this.ds.boot();
    if (this.ds.role()) this.router.navigate(['/dukan/shop', this.firmId, 'catalog']);
  }

  async login() {
    if (this.busy()) return;
    this.err.set(''); this.busy.set(true);
    try {
      if (await this.ds.loginBuyer(this.user(), this.pwd(), this.remember())) { this.router.navigate(['/dukan/shop', this.firmId, 'catalog']); return; }
      this.err.set('Galat mobile/ID ya password. Dobara try karein ya Sign up karein.');
    } catch { this.err.set('Server se connect nahi ho paaya. Dobara try karein.'); }
    finally { this.busy.set(false); }
  }

  async doSignup() {
    this.suErr.set('');
    if (!this.suName().trim() || this.suPhone().length !== 10) { this.suErr.set('Naam aur 10-digit mobile bharein'); return; }
    if (this.suPin().length < 4 || this.suPin().length > 20) { this.suErr.set('Password 4-20 character ka hona chahiye'); return; }
    if (this.suPin() !== this.suPin2()) { this.suErr.set('Dono password match nahi kar rahe'); return; }
    this.busy.set(true);
    const id = await this.ds.signup({
      name: this.suName(), phone: this.suPhone(), pin: this.suPin(), role: this.suRole(),
      businessName: this.suBusiness(), city: this.suCity(), state: this.suState(), address: this.suAddress(),
      whatsapp: this.suWhatsapp(), gstin: this.suGstin(), categories: this.suCategories(),
      vehicleType: this.suVehicle(), routeArea: this.suRoute(), capacity: this.suCapacity(),
    }, this.remember());
    this.busy.set(false);
    if (!id) { this.suErr.set('Signup nahi hua — ye mobile shayad pehle se registered hai'); return; }
    this.router.navigate(['/dukan/shop', this.firmId, 'catalog']);
  }
}
