import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { FeatureService } from '../../shared/feature.service';
import { ToastService } from '../../shared/toast.service';
import jsPDF from 'jspdf';

interface Plan {
  code: string; name: string;
  monthlyInr: number | null; annualInr: number | null;
  maxBranches: number; maxUsers: number; maxAiCalls: number; maxWaMessages: number;
}

/**
 * PLANS (user-side) —
 *  1. Usage meter (Claude-style): kitna use ho chuka vs plan ki limit
 *  2. Saare plans; current highlight
 *  3. Wallet se plan kharido/change karo — turant switch, limits update
 */
@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink],
  template: `
    <div class="max-w-6xl mx-auto p-4">
      <div class="mb-6 text-center">
        <h2 class="font-display font-black text-3xl text-[#1B2E5C]">💎 Plans & Usage</h2>
        <p class="text-sm text-gray-500 mt-1">Aapka usage, aapka plan — yahin se upgrade bhi karo</p>
      </div>

      <!-- ============ USAGE METER (Claude-style) ============ -->
      <div class="bg-white rounded-2xl border border-[#D6DDEA] p-5 mb-6">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div class="font-bold text-[#1B2E5C]">📊 Aapka Usage — {{ planName() }} plan</div>
          <div class="text-sm text-gray-500">Wallet: <b class="text-[#1B2E5C]">₹{{ wallet() | number:'1.0-0' }}</b>
            <a routerLink="/wallet" class="text-xs text-blue-600 underline ml-1">recharge</a>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          @for (m of meters(); track m.label) {
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-600">{{ m.icon }} {{ m.label }}</span>
                <b [class]="m.pct >= 100 ? 'text-red-600' : (m.pct >= 80 ? 'text-orange-600' : 'text-[#1B2E5C]')">
                  {{ m.used | number }} / {{ m.limit | number }}
                </b>
              </div>
              <div class="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all"
                     [style.width.%]="m.pct > 100 ? 100 : m.pct"
                     [style.background]="m.pct >= 100 ? '#DC2626' : (m.pct >= 80 ? '#F59E0B' : '#1B2E5C')"></div>
              </div>
              @if (m.pct >= 100) { <div class="text-[11px] text-red-600 mt-1">Limit poori — bada plan lo</div> }
              @else if (m.pct >= 80) { <div class="text-[11px] text-orange-600 mt-1">Limit ke kareeb</div> }
            </div>
          }
        </div>
      </div>

      <!-- ============ PERIOD TOGGLE ============ -->
      <div class="flex justify-center mb-4">
        <div class="inline-flex rounded-lg border border-[#D6DDEA] overflow-hidden">
          <button (click)="period.set('monthly')" class="px-5 py-2 text-sm font-bold"
                  [class]="period() === 'monthly' ? 'bg-[#1B2E5C] text-white' : 'bg-white text-[#1B2E5C]'">Monthly</button>
          <button (click)="period.set('yearly')" class="px-5 py-2 text-sm font-bold"
                  [class]="period() === 'yearly' ? 'bg-[#1B2E5C] text-white' : 'bg-white text-[#1B2E5C]'">Yearly</button>
        </div>
      </div>

      <!-- ============ PLAN CARDS ============ -->
      @if (loading()) { <div class="p-8 text-center text-gray-500">Loading…</div> }
      @else {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          @for (p of plans(); track p.code) {
            <div class="bg-white rounded-2xl border p-5 flex flex-col"
                 [class]="isCurrent(p) ? 'border-[#1B2E5C] ring-2 ring-[#1B2E5C]/30 shadow-lg' : 'border-[#D6DDEA]'">
              <div class="flex items-center justify-between">
                <div class="font-bold text-lg text-[#1B2E5C]">{{ p.name }}</div>
                @if (isCurrent(p)) {
                  <span class="text-[10px] font-black bg-[#1B2E5C] text-white px-2 py-0.5 rounded-full">AAPKA PLAN</span>
                }
              </div>
              <div class="mt-3">
                <span class="text-3xl font-black text-[#1B2E5C]">₹{{ price(p) | number:'1.0-0' }}</span>
                <span class="text-sm text-gray-500">/{{ period() === 'yearly' ? 'saal' : 'mahina' }}</span>
              </div>
              <div class="mt-4 pt-4 border-t border-dashed border-[#D6DDEA] text-sm space-y-2 flex-1">
                <div class="flex justify-between"><span class="text-gray-600">🏢 Branches</span><b>{{ p.maxBranches }}</b></div>
                <div class="flex justify-between"><span class="text-gray-600">👥 Users</span><b>{{ p.maxUsers }}</b></div>
                <div class="flex justify-between"><span class="text-gray-600">🤖 AI scans/mahina</span><b>{{ p.maxAiCalls | number }}</b></div>
                <div class="flex justify-between"><span class="text-gray-600">💬 WhatsApp/mahina</span><b>{{ p.maxWaMessages | number }}</b></div>
              </div>
              @if (isCurrent(p)) {
                <div class="mt-4 text-center text-sm font-bold text-green-700 bg-green-50 rounded-lg py-2">✓ Abhi active</div>
              } @else {
                <button (click)="buy(p)" [disabled]="buying()"
                        class="mt-4 text-center text-sm font-bold text-white bg-[#1B2E5C] rounded-lg py-2 hover:opacity-90 disabled:opacity-50">
                  {{ buying() === p.code ? 'Ho raha hai…' : ('Ye plan lo — ₹' + (price(p) | number:'1.0-0') + ' wallet se') }}
                </button>
              }
            </div>
          }
        </div>

        <p class="text-center text-xs text-gray-400 mt-6">
          Wallet me balance kam ho to pehle <a routerLink="/wallet" class="text-blue-600 underline">recharge</a> karo.
          Koi sawaal ho to <a routerLink="/complaints" class="text-blue-600 underline">Team Vyapaar Setu se poochho</a>.
        </p>
      }
    </div>
  `
})
export class PlansPageComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  features = inject(FeatureService);

  plans = signal<Plan[]>([]);
  loading = signal(true);
  buying = signal<string | null>(null);
  period = signal<'monthly' | 'yearly'>('monthly');
  receiptGst = '';   // receipt pe chhapne wala GST no (user purchase ke waqt deta hai)

  ngOnInit() {
    this.features.refresh();   // usage fresh ho
    this.http.get<Plan[]>(`${environment.apiUrl}/api/subscription/plans`).subscribe({
      next: p => { this.plans.set(p); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  planName() { return (this.features.planCode() || 'starter').toUpperCase(); }
  wallet() { return this.features.walletBalance(); }

  meters() {
    const f = this.features;
    const mk = (icon: string, label: string, used: number, limit: number) => ({
      icon, label, used, limit: limit || 1, pct: Math.round((used / (limit || 1)) * 100)
    });
    return [
      mk('👥', 'Users', f.usersCount(), f.userLimit()),
      mk('🏢', 'Branches', f.branchesCount(), f.branchLimit()),
      mk('🤖', 'AI scans (is mahine)', f.aiUsedThisMonth(), f.aiQuotaMonthly())
    ];
  }

  isCurrent(p: Plan): boolean {
    return (this.features.planCode() || '').toLowerCase() === p.code.toLowerCase();
  }

  price(p: Plan): number {
    return (this.period() === 'yearly' ? p.annualInr : p.monthlyInr) ?? 0;
  }

  buy(p: Plan) {
    const amt = this.price(p);
    if (!confirm(`"${p.name}" plan (${this.period() === 'yearly' ? '1 saal' : '1 mahina'}) — ₹${amt.toFixed(0)} wallet se katega.\n\nPakka lena hai?`)) return;

    // Receipt pe GST number (optional) — firm ka saved GSTIN prefill, badal/khali kar sakte ho
    const gst = prompt(
      'Receipt pe GST number daalna hai to yahan likho (khali chhodo to receipt bina GST ke banegi):',
      this.features.firmGst() || '');
    this.receiptGst = (gst || '').trim().toUpperCase();

    this.buying.set(p.code);
    this.http.post<any>(`${environment.apiUrl}/api/subscription/purchase`, {
      code: p.code, period: this.period()
    }).subscribe({
      next: (r) => {
        this.buying.set(null);
        this.toast.success(`🎉 "${p.name}" plan active! ₹${r.paid} kata, wallet me ₹${(+r.walletBalance).toFixed(0)} bacha.`);
        this.downloadReceipt(p, r);   // 🧾 payment receipt PDF auto-download
        this.features.refresh();      // naya plan + limits turant reflect
      },
      error: (e) => {
        this.buying.set(null);
        const msg = e?.error?.error ?? 'Plan purchase nahi hua';
        this.toast.error(msg);
        alert('⚠️ ' + msg);
      }
    });
  }

  // 🧾 Payment receipt PDF — purchase hote hi auto-download
  private downloadReceipt(p: Plan, r: any) {
    const doc = new jsPDF();
    const now = new Date();
    const ref = `SUB-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${now.getTime().toString().slice(-6)}`;

    doc.setFillColor(27, 46, 92);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('Vyapaar Setu — Payment Receipt', 14, 13);
    doc.setFontSize(9);
    doc.text('An Anjaninex Product', 14, 21);

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(11);
    let y = 45;
    const row = (label: string, value: string) => {
      doc.setFont('helvetica', 'normal'); doc.text(label, 14, y);
      doc.setFont('helvetica', 'bold'); doc.text(value, 80, y);
      y += 9;
    };
    row('Receipt No.', ref);
    row('Date', now.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }));
    row('Firm', this.features.firmName() || '—');
    if (this.receiptGst) row('GSTIN', this.receiptGst);
    row('Plan', `${p.name} (${this.period() === 'yearly' ? 'Yearly' : 'Monthly'})`);
    row('Amount Paid', `Rs. ${(+r.paid).toFixed(2)}`);
    row('Payment Mode', 'Wallet');
    row('Wallet Balance (baad me)', `Rs. ${(+r.walletBalance).toFixed(2)}`);
    if (r.subscriptionEndsAt) row('Valid Till', new Date(r.subscriptionEndsAt).toLocaleDateString('en-IN'));

    y += 6;
    doc.setDrawColor(214, 221, 234);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Ye computer-generated receipt hai — signature ki zaroorat nahi.', 14, y);
    doc.text('Sawal ho to app ke Complaint Box se Team Vyapaar Setu ko likhein.', 14, y + 6);

    doc.save(`receipt-${ref}.pdf`);
  }
}
