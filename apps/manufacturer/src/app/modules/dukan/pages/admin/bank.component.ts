import { Component, inject, signal, effect } from '@angular/core';
import { DukanService } from '../../dukan.service';
import { Seller } from '../../models';

@Component({
  selector: 'app-admin-bank',
  standalone: true,
  template: `
  <h2 style="font-size:18px;margin-bottom:14px">Bank & UPI Setup</h2>
  <div class="grid" style="grid-template-columns:1.3fr 1fr;align-items:start">
    <div class="card" style="padding:20px">
      <div class="formgrid">
        <div><label>Account Holder / Seller Name</label><input [value]="f().name" (input)="set('name',$any($event.target).value)"></div>
        <div><label>UPI ID</label><input [value]="f().upi" (input)="set('upi',$any($event.target).value)" placeholder="name@bank"></div>
        <div><label>Account Number</label><input [value]="f().acc" (input)="set('acc',$any($event.target).value)"></div>
        <div><label>IFSC</label><input [value]="f().ifsc" (input)="set('ifsc',$any($event.target).value)"></div>
        <div><label>Bank Name</label><input [value]="f().bank" (input)="set('bank',$any($event.target).value)"></div>
        <div><label>City</label><input [value]="f().city" (input)="set('city',$any($event.target).value)"></div>
        <div><label>GSTIN</label><input [value]="f().gst" (input)="set('gst',$any($event.target).value)"></div>
      </div>
      <div class="row" style="gap:10px;margin-top:16px">
        <button class="btn" (click)="save()">Save</button>
        @if (saved()) { <span style="color:var(--green);font-weight:700;font-size:13px">✓ Saved — QR updated</span> }
      </div>
    </div>

    <div>
      <div class="card" style="padding:20px;text-align:center">
        <div style="font-weight:700;margin-bottom:10px">Payment QR (auto)</div>
        <img [src]="qrUrl()" width="170" height="170" alt="UPI QR"
             style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px">
        <div style="font-size:13px;margin-top:10px">UPI: <b>{{ ds.seller().upi }}</b></div>
        <div style="font-size:12px;color:var(--muted)">Yahi QR buyer ke payment screen pe dikhega</div>
      </div>

      <div class="card" style="padding:16px;margin-top:16px;font-size:12.5px;color:var(--muted)">
        🔒 Admin login (User ID / password) ab <b style="color:var(--ink)">Profile</b> page mein hai.
      </div>
    </div>
  </div>
  `,
})
export class AdminBankComponent {
  ds = inject(DukanService);
  f = signal<Seller>({ ...this.ds.seller() });
  saved = signal(false);
  private loaded = false;

  constructor() {
    effect(() => { const s = this.ds.seller(); if (!this.loaded && s.name) { this.f.set({ ...s }); this.loaded = true; } });
  }

  set(k: 'name' | 'upi' | 'acc' | 'ifsc' | 'bank' | 'city' | 'gst', v: string) {
    this.f.set({ ...this.f(), [k]: v }); this.saved.set(false);
  }
  save() { this.ds.saveSeller(this.f()); this.saved.set(true); }

  qrUrl(): string {
    const s = this.ds.seller();
    const link = `upi://pay?pa=${s.upi}&pn=${encodeURIComponent(s.name)}&cu=INR`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(link)}`;
  }
}
