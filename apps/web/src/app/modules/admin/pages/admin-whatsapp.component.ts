import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { BackButtonComponent } from '../../../shared/back-button.component';

// WhatsApp provider (wabanow BSP) - central Anjaninex key + har firm ka apna number.
@Component({
  selector: 'app-admin-whatsapp',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, BackButtonComponent],
  template: `
    <div class="max-w-5xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/admin/dashboard" [routerLinkActiveOptions]="{exact:true}" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
        <a routerLink="/admin/firms" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🏢 Firms</a>
        <a routerLink="/admin/billing" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💳 Billing</a>
        <a routerLink="/admin/ai-keys" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🔑 AI Keys</a>
        <a routerLink="/admin/whatsapp" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📱 WhatsApp</a>
      </div>

      <h2 class="font-display font-black text-2xl text-[#5c1a8b] mb-1">📱 WhatsApp API (wabanow)</h2>
      <p class="text-sm text-gray-500 mb-5">
        Ek <b>central Anjaninex API key</b> + har firm ka <b>apna WhatsApp number</b> (subdomain jaisa isolation).
        Key server par hi rehti hai, kabhi return nahi hoti.
      </p>

      @if (msg()) { <div class="mb-4 p-2 rounded bg-green-50 text-green-700 text-sm border border-green-200">{{ msg() }}</div> }

      <!-- Central settings -->
      <div class="card mb-6">
        <h3 class="font-bold text-[#5c1a8b] mb-3">⚙️ Central Provider (wabanow)</h3>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="lbl">Base URL</label>
            <input [(ngModel)]="s.baseUrl" class="input font-mono" placeholder="https://wabanow.com/api">
          </div>
          <div>
            <label class="lbl">API Key {{ s.apiKeySet ? '(set ✓ — naya daalo to badlega)' : '' }}</label>
            <input [(ngModel)]="apiKey" type="password" class="input font-mono"
                   [placeholder]="s.apiKeySet ? '•••••• (saved)' : 'Anjaninex central API key'">
          </div>
        </div>
        <label class="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" [(ngModel)]="s.enabled"> Gateway enabled (bot wabanow se bheje)
        </label>
        <div class="mt-3 text-right">
          <button (click)="saveSettings()" [disabled]="saving()" class="px-5 py-2 bg-[#5c1a8b] text-white rounded-lg font-bold">
            {{ saving() ? '...' : '💾 Save Settings' }}
          </button>
        </div>
      </div>

      <!-- Firm number mapping -->
      <div class="card">
        <h3 class="font-bold text-[#5c1a8b] mb-1">🔗 Firm ↔ WhatsApp Number</h3>
        <p class="text-xs text-gray-400 mb-3">
          Har firm ka WABA number + Phone Number ID (wabanow → Manage WABA se milta hai) yahan daalo.
          Bhejte waqt central key + is Phone Number ID se message us firm ke number se jaayega.
        </p>
        @if (loading()) { <div class="text-center text-gray-400 py-6">Loading…</div> }
        @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-[#f5effa] text-[#5c1a8b] text-xs uppercase">
                <tr>
                  <th class="text-left px-2 py-2">Firm</th>
                  <th class="text-left px-2 py-2">WABA Number</th>
                  <th class="text-left px-2 py-2">Phone Number ID</th>
                  <th class="text-center px-2 py-2">On</th>
                  <th class="text-center px-2 py-2">Save</th>
                </tr>
              </thead>
              <tbody>
                @for (f of firms(); track f.firmId) {
                  <tr class="border-t">
                    <td class="px-2 py-2 font-semibold">{{ f.firmName }}
                      @if (f.linked) { <span class="ml-1 text-[10px] text-green-600">● linked</span> }
                    </td>
                    <td class="px-2 py-2"><input [(ngModel)]="f.wabaNumber" class="input !py-1 font-mono" placeholder="9195..."></td>
                    <td class="px-2 py-2"><input [(ngModel)]="f.phoneNumberId" class="input !py-1 font-mono" placeholder="111152..."></td>
                    <td class="px-2 py-2 text-center"><input type="checkbox" [(ngModel)]="f.enabled"></td>
                    <td class="px-2 py-2 text-center whitespace-nowrap">
                      <button (click)="saveFirm(f)" class="px-3 py-1 bg-[#5c1a8b] text-white rounded text-xs font-bold">Save</button>
                      @if (f.linked) {
                        <button (click)="testFirm(f)" class="ml-1 px-3 py-1 border border-[#5c1a8b] text-[#5c1a8b] rounded text-xs font-bold">📤 Test</button>
                      }
                    </td>
                  </tr>
                }
                @if (firms().length === 0) { <tr><td colspan="5" class="text-center text-gray-400 py-6">Koi firm nahi</td></tr> }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .card { background:#fff; border:1px solid #ece6f5; border-radius:12px; padding:16px; }
    .lbl { display:block; font-size:12px; color:#374151; margin-bottom:4px; font-weight:600; }
    .input { width:100%; box-sizing:border-box; border:1px solid #D1D5DB; border-radius:8px; padding:8px 10px; font-size:14px; }
    .page-top-bar { margin-bottom:10px; }
  `]
})
export class AdminWhatsAppComponent implements OnInit {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/admin/whatsapp`;

  loading = signal(true);
  saving = signal(false);
  msg = signal('');
  s: any = { provider: 'wabanow', baseUrl: '', enabled: false, apiKeySet: false };
  apiKey = '';
  firms = signal<any[]>([]);

  ngOnInit() {
    this.http.get<any>(`${this.base}/settings`).subscribe({ next: d => this.s = d, error: () => {} });
    this.loadFirms();
  }

  loadFirms() {
    this.loading.set(true);
    this.http.get<any[]>(`${this.base}/firms`).subscribe({
      next: r => { this.firms.set(r || []); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  saveSettings() {
    this.saving.set(true);
    const body = { provider: this.s.provider || 'wabanow', baseUrl: this.s.baseUrl || null, apiKey: this.apiKey || null, enabled: !!this.s.enabled };
    this.http.put<any>(`${this.base}/settings`, body).subscribe({
      next: d => { this.s = d; this.apiKey = ''; this.saving.set(false); this.flash('✅ Settings saved!'); },
      error: (e) => { this.saving.set(false); alert('Failed: ' + (e?.error?.error ?? 'unknown')); }
    });
  }

  testFirm(f: any) {
    const to = prompt('Kis number pe TEST message bhejein? (91XXXXXXXXXX)', '');
    if (!to) return;
    const tmpl = prompt('Template naam (wabanow me approved):', 'hello_world') || 'hello_world';
    this.http.post<any>(`${this.base}/test`, { firmId: f.firmId, to, templateName: tmpl, languageCode: 'en_US' }).subscribe({
      next: (r) => alert(r.ok
        ? ('\u2705 Sent from ' + r.sentFrom + ' (template: ' + r.template + ')\n\nwabanow response:\n' + r.response)
        : ('\u26A0\uFE0F Fail (HTTP ' + r.status + '):\n' + r.response)),
      error: (e) => alert('Error: ' + (e?.error?.error ?? 'unknown'))
    });
  }

  saveFirm(f: any) {
    const body = {
      wabaNumber: f.wabaNumber || null, phoneNumberId: f.phoneNumberId || null,
      wabaAccountId: f.wabaAccountId || null, businessId: f.businessId || null,
      displayName: f.displayName || f.firmName || null, enabled: !!f.enabled
    };
    this.http.put(`${this.base}/firms/${f.firmId}`, body).subscribe({
      next: () => { this.flash('✅ ' + f.firmName + ' ka number save ho gaya'); this.loadFirms(); },
      error: (e) => alert('Failed: ' + (e?.error?.error ?? 'unknown'))
    });
  }

  private flash(m: string) { this.msg.set(m); setTimeout(() => this.msg.set(''), 3000); }
}
