import { Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { AdminService, BillingSettings, AdminPaymentReq, FirmListItem, AddonService, SaveAddonService } from '../services/admin.service';

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink, RouterLinkActive, BackButtonComponent],
  template: `
    <div class="max-w-4xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/admin/dashboard" [routerLinkActiveOptions]="{exact:true}" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
        <a routerLink="/admin/firms" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🏢 Firms</a>
        <a routerLink="/admin/plans" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💼 Plans</a>
        <a routerLink="/admin/billing" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💳 Billing</a>
        <a routerLink="/admin/ai-monitor" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🤖 AI Monitor</a>
        <a routerLink="/admin/changelog" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📝 Changelog</a>
      </div>

      <h2 class="font-display font-black text-2xl text-[#5c1a8b] mb-1">💳 Billing & Payment Settings</h2>
      <p class="text-sm text-gray-500 mb-5">Firms inhi details pe subscription payment karengi. Manual (UPI/Bank/QR) abhi, gateway baad me.</p>

      <!-- PENDING PAYMENT REQUESTS -->
      <div class="card mb-5" style="border-color:#ffe2a8;background:#fffdf7">
        <h3 class="font-bold text-[#5c1a8b] mb-3">🕒 Pending Payment Requests
          <span class="text-xs font-normal text-gray-500">({{ payReqs().length }})</span></h3>
        @if (payReqs().length === 0) {
          <div class="text-sm text-gray-400">Koi pending request nahi.</div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-xs text-gray-500 uppercase">
                <tr><th class="text-left py-1">Firm</th><th class="text-right">Amount</th><th class="text-left pl-3">Reference</th><th class="text-left pl-3">Time</th><th></th></tr>
              </thead>
              <tbody>
                @for (p of payReqs(); track p.id) {
                  <tr class="border-t border-gray-100">
                    <td class="py-2">{{ p.firmName || p.firmId }}<div class="text-gray-400 text-xs">{{ p.note }}</div></td>
                    <td class="text-right font-semibold">₹{{ p.amount }}</td>
                    <td class="pl-3 font-mono text-xs">{{ p.reference || '—' }}</td>
                    <td class="pl-3 text-gray-500 text-xs">{{ p.createdAt | date:'dd MMM, HH:mm' }}</td>
                    <td class="text-right whitespace-nowrap">
                      <button (click)="approve(p)" [disabled]="busy()===p.id" class="px-2 py-1 text-xs rounded bg-green-100 text-green-700 font-semibold mr-1">✓ Approve</button>
                      <button (click)="reject(p)" [disabled]="busy()===p.id" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700 font-semibold">✕ Reject</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <!-- ADD-ON / EXTRA SERVICES -->
      <div class="card mb-5" style="border-color:#c9b3ec;background:#faf7ff">
        <div class="flex items-center justify-between mb-1">
          <h3 class="font-bold text-[#5c1a8b]">🧩 Add-on / Extra Services
            <span class="text-xs font-normal text-gray-500">({{ services().length }})</span></h3>
          <button (click)="addService()" class="px-3 py-1.5 text-xs rounded-lg bg-[#5c1a8b] text-white font-semibold">+ Add Service</button>
        </div>
        <p class="text-xs text-gray-500 mb-3">
          Yahan ki rate firm ke Wallet → Services me dikhegi. Firm chahe to <strong>Anjaninex se</strong> le
          (wallet se charge) ya <strong>khud direct</strong> le (apne keys/account) — "Allow self" ON ho to.
        </p>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left py-1">Service</th>
                <th class="text-right">Rate ₹</th>
                <th class="text-left pl-3">Unit</th>
                <th class="text-left pl-3">Billing</th>
                <th class="text-center">Active</th>
                <th class="text-center">Allow self</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (s of services(); track s.id) {
                @if (editId() === s.id) {
                  <tr class="border-t border-gray-100 bg-white">
                    <td class="py-2">
                      <input [(ngModel)]="ef.icon" class="input !w-12 inline-block mr-1" placeholder="🤖">
                      <input [(ngModel)]="ef.name" class="input inline-block" style="width:140px" placeholder="Service name">
                    </td>
                    <td class="text-right"><input type="number" [(ngModel)]="ef.rate" class="input !w-20 text-right" step="0.01"></td>
                    <td class="pl-3"><input [(ngModel)]="ef.unit" class="input !w-20" placeholder="scan"></td>
                    <td class="pl-3">
                      <select [(ngModel)]="ef.billingType" class="input !w-28">
                        <option value="per_use">Per use</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </td>
                    <td class="text-center"><input type="checkbox" [(ngModel)]="ef.active"></td>
                    <td class="text-center"><input type="checkbox" [(ngModel)]="ef.allowSelf"></td>
                    <td class="text-right whitespace-nowrap">
                      <button (click)="saveService()" class="px-2 py-1 text-xs rounded bg-green-100 text-green-700 font-semibold mr-1">✓ Save</button>
                      <button (click)="cancelEdit()" class="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">✕</button>
                    </td>
                  </tr>
                } @else {
                  <tr class="border-t border-gray-100">
                    <td class="py-2">{{ s.icon }} {{ s.name }}
                      <div class="text-gray-400 text-xs">{{ s.freeNote }}</div></td>
                    <td class="text-right font-semibold">₹{{ s.rate }}</td>
                    <td class="pl-3 text-gray-600">/ {{ s.unit }}</td>
                    <td class="pl-3 text-gray-600">{{ s.billingType === 'monthly' ? 'Monthly' : 'Per use' }}</td>
                    <td class="text-center">{{ s.active ? '✅' : '—' }}</td>
                    <td class="text-center">{{ s.allowSelf ? '✅' : '🚫' }}</td>
                    <td class="text-right whitespace-nowrap">
                      <button (click)="startEdit(s)" class="px-2 py-1 text-xs rounded bg-purple-100 text-[#5c1a8b] font-semibold mr-1">✏️ Edit</button>
                      <button (click)="removeService(s)" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700 font-semibold">🗑</button>
                    </td>
                  </tr>
                }
              }
              @if (services().length === 0) {
                <tr><td colspan="7" class="text-center text-gray-400 py-4">Koi service nahi. "+ Add Service" se banao.</td></tr>
              }
            </tbody>
          </table>
        </div>
        @if (svcMsg()) { <div class="mt-3 text-green-700 text-sm">{{ svcMsg() }}</div> }
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-500 py-8">Loading…</div>
      } @else {
        <div class="grid md:grid-cols-3 gap-4">
          <!-- LEFT: form -->
          <div class="md:col-span-2 flex flex-col gap-4">
            <div class="card">
              <h3 class="font-bold text-[#5c1a8b] mb-3">📲 UPI</h3>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="lbl">Payee Name</label><input [(ngModel)]="m.payeeName" class="input" placeholder="Anjaninex"></div>
                <div><label class="lbl">UPI ID (VPA)</label><input [(ngModel)]="m.upiId" class="input" placeholder="anjaninex@okhdfc"></div>
                <div class="col-span-2">
                  <label class="lbl">Anjaninex GSTIN (20 lakh cross hone par tax invoice me chahiye)</label>
                  <input [(ngModel)]="m.gstin" class="input font-mono uppercase" placeholder="08XXXXX1234X1Z5">
                </div>
              </div>
            </div>

            <div class="card">
              <h3 class="font-bold text-[#5c1a8b] mb-3">🏦 Bank Account</h3>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="lbl">Account Holder Name</label><input [(ngModel)]="m.accountName" class="input"></div>
                <div><label class="lbl">Bank Name</label><input [(ngModel)]="m.bankName" class="input"></div>
                <div><label class="lbl">Account Number</label><input [(ngModel)]="m.accountNo" class="input font-mono"></div>
                <div><label class="lbl">IFSC</label><input [(ngModel)]="m.ifsc" class="input font-mono uppercase"></div>
              </div>
            </div>

            <div class="card">
              <h3 class="font-bold text-[#5c1a8b] mb-3">🖼️ QR & Instructions</h3>
              <label class="lbl">QR Image URL (optional — khaali rakho to UPI se auto QR banega)</label>
              <input [(ngModel)]="m.qrImageUrl" class="input mb-3" placeholder="https://...">
              <label class="lbl">Payment Instructions (firm ko dikhega)</label>
              <textarea [(ngModel)]="m.instructions" rows="3" class="input"
                        placeholder="Payment ke baad screenshot WhatsApp karein: 98765..."></textarea>
            </div>

            <div class="card" style="border-color:#c9b3ec;background:#faf7ff">
              <h3 class="font-bold text-[#5c1a8b] mb-1">📒 Anjaninex Books (apni accounting)</h3>
              <p class="text-xs text-gray-500 mb-3">
                Jo firm select karoge, har payment approve par usme income voucher auto-post hoga
                (Dr Bank A/c / Cr Subscription Income). Apne kharche bhi usi firm ke Accounting me voucher se daalo.
              </p>
              <label class="lbl">Books Firm</label>
              <select [(ngModel)]="booksFirmId" class="input">
                <option [ngValue]="null">— Off (koi auto-posting nahi) —</option>
                @for (f of firms(); track f.id) {
                  <option [ngValue]="f.id">{{ f.name }}</option>
                }
              </select>
              <p class="text-xs text-gray-400 mt-2">Tip: pehle "+ Add Firm" se "Anjaninex Books" naam ki firm banao (accounting on), fir yahan select karo.</p>
            </div>

            <div class="card border-dashed">
              <h3 class="font-bold text-gray-500 mb-1">⚙️ Razorpay (auto-debit) — baad me activate</h3>
              <p class="text-xs text-gray-400 mb-3">Keys yahan save kar lo. Auto-debit/UPI AutoPay wiring baad me hogi.</p>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="lbl">Razorpay Key ID</label><input [(ngModel)]="m.razorpayKeyId" class="input font-mono" placeholder="rzp_live_..."></div>
                <div>
                  <label class="lbl">Razorpay Key Secret {{ secretSet() ? '(set ✓ — naya daalo to badlega)' : '' }}</label>
                  <input [(ngModel)]="razorpaySecret" type="password" class="input font-mono" [placeholder]="secretSet() ? '•••••• (saved)' : 'secret'">
                </div>
              </div>
              <label class="flex items-center gap-2 mt-3 text-sm">
                <input type="checkbox" [(ngModel)]="m.gatewayEnabled"> Gateway enabled (auto-debit on)
              </label>
            </div>
          </div>

          <!-- RIGHT: live preview -->
          <div class="flex flex-col gap-4">
            <div class="card text-center">
              <h3 class="font-bold text-[#5c1a8b] mb-2">Live UPI QR</h3>
              @if (m.upiId) {
                <img [src]="qrSrcUrl()" alt="UPI QR" class="mx-auto rounded-lg border" width="200" height="200">
                <p class="text-xs text-gray-500 mt-2">{{ m.payeeName || '—' }}</p>
                <p class="text-xs font-mono">{{ m.upiId }}</p>
              } @else {
                <div class="text-gray-400 text-sm py-10">UPI ID daalo, QR yahan auto-ban jayega.</div>
              }
            </div>
            @if (m.qrImageUrl) {
              <div class="card text-center">
                <h3 class="font-bold text-[#5c1a8b] mb-2">Custom QR</h3>
                <img [src]="m.qrImageUrl" alt="QR" class="mx-auto rounded-lg border max-w-full">
              </div>
            }
          </div>
        </div>

        @if (msg()) { <div class="mt-4 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">{{ msg() }}</div> }
        @if (err()) { <div class="mt-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{{ err() }}</div> }

        <div class="flex justify-end mt-5">
          <button (click)="save()" [disabled]="saving()" class="btn-primary">{{ saving() ? 'Saving…' : '💾 Save Settings' }}</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .card{ background:#fff; border:1px solid #eee; border-radius:14px; padding:16px; }
    .lbl{ display:block; font-size:10px; font-weight:800; color:#6b3fa0; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }

    /* ===== MOBILE (<=640px) ===== */
    @media (max-width: 640px) {
      .card { padding: 12px; }
      .grid-cols-2 { grid-template-columns: 1fr !important; }
      .col-span-2 { grid-column: span 1 !important; }
      table { white-space: nowrap; }
    }
  `]
})
export class AdminBillingComponent {
  private svc = inject(AdminService);

  loading = signal(true);
  saving = signal(false);
  msg = signal('');
  err = signal('');
  secretSet = signal(false);
  razorpaySecret = '';
  payReqs = signal<AdminPaymentReq[]>([]);
  busy = signal<string | null>(null);
  firms = signal<FirmListItem[]>([]);
  booksFirmId: string | null = null;

  m: BillingSettings = {
    payeeName: '', upiId: '', bankName: '', accountName: '', accountNo: '', ifsc: '',
    qrImageUrl: '', instructions: '', gateway: 'razorpay', razorpayKeyId: '',
    gatewayEnabled: false, razorpaySecretSet: false, booksFirmId: null, gstin: ''
  };

  // ── Add-on services state ──
  services = signal<AddonService[]>([]);
  editId = signal<string | null>(null);    // 'new' = adding
  svcMsg = signal('');
  ef: SaveAddonService = this.blankService();

  blankService(): SaveAddonService {
    return { name: '', icon: '', unit: '', rate: 0, freeNote: '', billingType: 'per_use', active: true, allowSelf: true, sortOrder: 100 };
  }

  ngOnInit() {
    this.svc.getBilling().subscribe({
      next: (s) => {
        this.m = { ...this.m, ...s };
        this.booksFirmId = s.booksFirmId;
        this.secretSet.set(s.razorpaySecretSet);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
    this.svc.listFirms().subscribe({ next: f => this.firms.set(f), error: () => {} });
    this.loadRequests();
    this.loadServices();
  }

  loadServices() {
    this.svc.listAddonServices().subscribe({ next: s => this.services.set(s), error: () => {} });
  }

  addService() {
    this.ef = this.blankService();
    this.editId.set('new');
    // naya row table me top par add karo taaki edit-form dikhe
    this.services.update(list => [{ id: 'new', code: '', name: '', icon: '', unit: '', rate: 0, freeNote: null, billingType: 'per_use', active: true, allowSelf: true, sortOrder: 100 }, ...list]);
  }

  startEdit(s: AddonService) {
    this.ef = { code: s.code, name: s.name, icon: s.icon, unit: s.unit, rate: s.rate, freeNote: s.freeNote, billingType: s.billingType, active: s.active, allowSelf: s.allowSelf, sortOrder: s.sortOrder };
    this.editId.set(s.id);
  }

  cancelEdit() {
    if (this.editId() === 'new') this.services.update(l => l.filter(x => x.id !== 'new'));
    this.editId.set(null);
  }

  saveService() {
    if (!this.ef.name?.trim()) { alert('Service ka naam daalo.'); return; }
    const id = this.editId();
    const done = () => { this.editId.set(null); this.svcMsg.set('✅ Service saved'); this.loadServices(); setTimeout(() => this.svcMsg.set(''), 2500); };
    if (id === 'new') {
      this.svc.createAddonService(this.ef).subscribe({ next: done, error: e => alert(e?.error?.error ?? 'Save nahi hua') });
    } else if (id) {
      this.svc.updateAddonService(id, this.ef).subscribe({ next: done, error: e => alert(e?.error?.error ?? 'Save nahi hua') });
    }
  }

  removeService(s: AddonService) {
    if (!confirm(`"${s.name}" delete karein?`)) return;
    this.svc.deleteAddonService(s.id).subscribe({ next: () => this.loadServices(), error: e => alert(e?.error?.error ?? 'Delete nahi hua') });
  }

  loadRequests() {
    this.svc.listPaymentRequests('pending').subscribe({ next: r => this.payReqs.set(r), error: () => {} });
  }

  approve(p: AdminPaymentReq) {
    if (!confirm(`₹${p.amount} approve karke ${p.firmName} ka wallet recharge karein?`)) return;
    this.busy.set(p.id);
    this.svc.approvePayment(p.id).subscribe({
      next: () => { this.busy.set(null); this.loadRequests(); },
      error: (e) => { this.busy.set(null); alert(e?.error?.error ?? 'Approve nahi hua'); }
    });
  }

  reject(p: AdminPaymentReq) {
    const reason = prompt('Reject ka reason (optional):') ?? '';
    this.busy.set(p.id);
    this.svc.rejectPayment(p.id, reason).subscribe({
      next: () => { this.busy.set(null); this.loadRequests(); },
      error: (e) => { this.busy.set(null); alert(e?.error?.error ?? 'Reject nahi hua'); }
    });
  }

  // UPI se scannable QR (qrserver free API — browser me render hota hai).
  qrSrcUrl() {
    const data = `upi://pay?pa=${this.m.upiId}&pn=${encodeURIComponent(this.m.payeeName || '')}&cu=INR`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
  }

  save() {
    this.saving.set(true); this.msg.set(''); this.err.set('');
    this.svc.saveBilling({
      payeeName: this.m.payeeName, upiId: this.m.upiId, bankName: this.m.bankName,
      accountName: this.m.accountName, accountNo: this.m.accountNo, ifsc: this.m.ifsc,
      qrImageUrl: this.m.qrImageUrl, instructions: this.m.instructions, gateway: this.m.gateway,
      razorpayKeyId: this.m.razorpayKeyId, razorpayKeySecret: this.razorpaySecret || null,
      gatewayEnabled: this.m.gatewayEnabled,
      booksFirmId: this.booksFirmId,
      gstin: this.m.gstin
    }).subscribe({
      next: (s) => {
        this.secretSet.set(s.razorpaySecretSet);
        this.razorpaySecret = '';
        this.saving.set(false);
        this.msg.set('✅ Billing settings save ho gayi!');
      },
      error: (e) => { this.err.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }
}
