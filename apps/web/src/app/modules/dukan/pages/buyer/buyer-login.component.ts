import { Component, signal, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { DukanService } from '../../dukan.service';
import { PinInputComponent } from '../../pin-input.component';
import { DUKAN_STYLES } from '../../dukan.styles';

/**
 * Online Dukan — Buyer storefront login.
 *
 * This is the customer-facing login (phone + 6-digit PIN) for the public-ish
 * storefront. It is NOT the KALINDI root login (that mixed buyer + admin login
 * and was deliberately NOT ported — admins enter the dukan from inside Anjaninex).
 */
@Component({
  selector: 'app-dukan-buyer-login',
  standalone: true,
  imports: [PinInputComponent],
  encapsulation: ViewEncapsulation.None,
  styles: [DUKAN_STYLES],
  template: `
  <div class="dukan-scope">
    <div class="login-wrap">
      <div class="login-card card">
        <div class="logo-box">ONLINE<small>DUKAN</small></div>
        <div style="text-align:center;font-size:13px;color:var(--muted);margin:-8px 0 14px">Buyer Login</div>

        <label>User ID / Name / Phone</label>
        <input [value]="user()" (input)="user.set($any($event.target).value); err.set('')" placeholder="Apna ID, naam ya phone" (keyup.enter)="login()">
        <label>PIN</label>
        <div style="position:relative">
          <input [type]="showPwd() ? 'text' : 'password'" [value]="pwd()" (input)="pwd.set($any($event.target).value); err.set('')" placeholder="6-digit PIN" (keyup.enter)="login()" style="padding-right:44px">
          <button type="button" (click)="showPwd.set(!showPwd())"
                  style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:none;font-size:18px;cursor:pointer;padding:4px 8px"
                  [title]="showPwd() ? 'Hide' : 'Show'">{{ showPwd() ? '🙈' : '👁️' }}</button>
        </div>

        <label class="remember">
          <input type="checkbox" [checked]="remember()" (change)="remember.set($any($event.target).checked)">
          Remember me
        </label>

        @if (err()) { <div style="color:#c0392b;font-size:12.5px;margin-top:12px;text-align:center">{{ err() }}</div> }
        <button class="btn" style="width:100%;margin-top:14px" (click)="login()">Login →</button>

        <div style="text-align:center;font-size:12.5px;margin-top:14px;color:var(--muted)">
          New buyer? <b style="color:var(--deep);cursor:pointer" (click)="showSignup.set(true)">Sign up</b>
        </div>
        <div class="foot">Powered by <b>anjaninex</b> · support&#64;anjaninex.com · 9511540583</div>
      </div>
    </div>

    <!-- SIGNUP MODAL -->
    @if (showSignup()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;z-index:100"
           (click)="showSignup.set(false)">
        <div class="card" style="padding:24px;max-width:400px;width:100%" (click)="$event.stopPropagation()">
          <h3 style="margin-bottom:4px">New Buyer Signup</h3>
          <div style="font-size:12px;color:var(--muted)">Auto User ID generate hoga</div>
          <label>Name *</label>
          <input [value]="suName()" (input)="suName.set($any($event.target).value)" placeholder="Shop / buyer name">
          <label>Phone * (10-digit)</label>
          <input maxlength="10" [value]="suPhone()" (input)="suPhone.set($any($event.target).value)" placeholder="Mobile number">
          <label>Set 6-digit PIN *</label>
          <app-pin-input (valueChange)="suPin.set($event)"></app-pin-input>
          <label style="margin-top:12px">Confirm PIN *</label>
          <app-pin-input (valueChange)="suPin2.set($event)"></app-pin-input>
          @if (suErr()) { <div style="color:#c0392b;font-size:12.5px;margin-top:8px">{{ suErr() }}</div> }
          <div class="row" style="gap:10px;margin-top:16px">
            <button class="btn ghost" (click)="showSignup.set(false)">Cancel</button>
            <button class="btn" (click)="doSignup()">Create & Login</button>
          </div>
        </div>
      </div>
    }
  </div>
  `,
})
export class DukanBuyerLoginComponent implements OnInit {
  private ds = inject(DukanService);
  private router = inject(Router);
  user = signal('');
  pwd = signal('');
  err = signal('');
  remember = signal(true);
  showPwd = signal(false);

  showSignup = signal(false);
  suName = signal('');
  suPhone = signal('');
  suPin = signal('');
  suPin2 = signal('');
  suErr = signal('');

  firmId = '';

  ngOnInit() {
    const m = this.router.url.match(/\/dukan\/shop\/([^\/?#]+)/);
    this.firmId = m ? decodeURIComponent(m[1]) : '';
    if (this.firmId && this.firmId !== 'login') this.ds.shopFirmId.set(this.firmId);
    this.ds.boot();
    if (this.ds.role() === 'buyer') this.router.navigate(['/dukan/shop', this.firmId, 'catalog']);
  }

  busy = signal(false);

  async login() {
    if (this.busy()) return;
    this.err.set(''); this.busy.set(true);
    try {
      if (await this.ds.loginBuyer(this.user(), this.pwd(), this.remember())) { this.router.navigate(['/dukan/shop', this.firmId, 'catalog']); return; }
      this.err.set('Galat ID ya PIN. Dobara try karein ya Sign up karein.');
    } catch { this.err.set('Server se connect nahi ho paaya. Dobara try karein.'); }
    finally { this.busy.set(false); }
  }

  async doSignup() {
    this.suErr.set('');
    if (!this.suName() || this.suPhone().length !== 10) { this.suErr.set('Naam aur 10-digit phone bharein'); return; }
    if (this.suPin().length !== 6 || !/^\d{6}$/.test(this.suPin())) { this.suErr.set('PIN 6 digits ka hona chahiye'); return; }
    if (this.suPin() !== this.suPin2()) { this.suErr.set('Dono PIN match nahi kar rahe'); return; }
    const id = await this.ds.signup(this.suName(), this.suPhone(), this.suPin(), this.remember());
    if (!id) { this.suErr.set('Signup nahi hua — ye phone shayad pehle se registered hai'); return; }
    this.showSignup.set(false);
    this.router.navigate(['/dukan/shop', this.firmId, 'catalog']);
  }
}
