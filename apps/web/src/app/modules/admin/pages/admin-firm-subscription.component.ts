import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface FirmSubscription {
  firmId: string;
  firmName: string;
  status: string;
  planCode: string | null;
  planName: string;
  monthlyInr: number | null;
  enabledModules: Record<string, boolean>;
  userLimit: number;
  branchLimit: number;
  aiQuotaMonthly: number;
  aiUsedThisMonth: number;
  walletBalance: number;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
}

interface PlanTemplate {
  id: string;
  code: string;
  name: string;
  monthlyInr: number | null;
  annualInr: number | null;
  maxBranches: number;
  maxUsers: number;
  maxAiCalls: number;
  features: Record<string, boolean>;
}

const MODULE_LIST: Array<{ key: string; label: string; icon: string; description: string }> = [
  { key: 'trading',          label: 'Trading',          icon: '🛒', description: 'Orders, Bills, Payments, Party Master' },
  { key: 'accounting',       label: 'Accounting',       icon: '📒', description: 'Vouchers, Ledgers, Sub-groups' },
  { key: 'reports_core',     label: 'Reports (Core 5)', icon: '📊', description: 'Sales Register, Outstanding, Aging, GST, Pending Orders' },
  { key: 'reports_advanced', label: 'Reports (Advanced 8)', icon: '📈', description: 'Top Parties, Top Items, GR, Commission, On-Time, Order-vs-Bill, Party Wise' },
  { key: 'ai_scan',          label: 'Bill Scan',        icon: '🤖', description: 'Auto-extract invoice fields from image/PDF' },
  { key: 'active_directory', label: 'Bazaar Link', icon: '🏭', description: 'Supplier-Buyer Directory + Categories + Photos' },
  { key: 'commission',       label: 'Commission Module', icon: '💰', description: 'Commission e-Invoices, bulk generation' },
  { key: 'hr',               label: 'HR Module',        icon: '👥', description: 'Staff, Attendance, Selfie, Live Location, Leave, Payroll' },
  { key: 'wallet',           label: 'Wallet',           icon: '💵', description: 'Wallet recharge + auto-debit for AI' },
  { key: 'white_label',      label: 'White Label',      icon: '🏷️', description: 'Customer’s own logo / brand colors' },
  { key: 'api_access',       label: 'API Access',       icon: '🔗', description: 'Public REST API for integrations' },
  { key: 'priority_support', label: 'Priority Support', icon: '💬', description: 'Priority WhatsApp/phone support queue' }
];

@Component({
  selector: 'app-admin-firm-subscription',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DecimalPipe],
  template: `
    <div class="max-w-5xl mx-auto p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <a routerLink="/admin/firms" class="text-sm text-purple-600 hover:underline">← Back to Firms</a>
          <h1 class="text-2xl font-black text-[#2d1040] mt-2">⚙️ Subscription & Modules</h1>
          @if (firm()) {
            <p class="text-sm text-gray-600 mt-1">
              <b>{{ firm()!.firmName }}</b> · Status: <span class="font-bold uppercase" [class.text-green-600]="firm()!.status === 'active'" [class.text-yellow-600]="firm()!.status === 'trial'" [class.text-red-600]="firm()!.status === 'suspended'">{{ firm()!.status }}</span>
            </p>
          }
        </div>
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-500 p-8">Loading…</div>
      } @else if (firm()) {
        <!-- Plan template selector -->
        <div class="card mb-4">
          <div class="card-head">📋 Plan Template</div>
          <div class="flex flex-wrap items-end gap-3 mt-3">
            <div class="flex-1 min-w-[200px]">
              <label class="lbl">Current Plan</label>
              <select [(ngModel)]="selectedPlan" class="ip">
                <option [ngValue]="null">— Custom (no template) —</option>
                @for (p of plans(); track p.code) {
                  <option [ngValue]="p.code">{{ p.name }} {{ p.monthlyInr ? '— ₹' + p.monthlyInr + '/mo' : '' }}</option>
                }
              </select>
            </div>
            <button (click)="applyPlan()" [disabled]="!selectedPlan || saving()" class="btn-primary">
              ⚡ Apply Plan Defaults
            </button>
          </div>
          <p class="text-xs text-gray-500 mt-2">Applying overwrites modules + limits with the plan template values.</p>
        </div>

        <!-- Module toggles -->
        <div class="card mb-4">
          <div class="card-head">🔧 Module Toggles ({{ enabledCount() }} of {{ modList.length }} enabled)</div>
          <div class="grid gap-2 mt-3">
            @for (m of modList; track m.key) {
              <div class="mod-row" [class.mod-on]="modules[m.key]">
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xl">{{ m.icon }}</span>
                    <span class="font-bold text-[#2d1040]">{{ m.label }}</span>
                  </div>
                  <div class="text-xs text-gray-600 ml-7">{{ m.description }}</div>
                </div>
                <label class="switch">
                  <input type="checkbox" [(ngModel)]="modules[m.key]" (change)="dirty.set(true)">
                  <span class="slider"></span>
                </label>
              </div>
            }
          </div>
        </div>

        <!-- Limits -->
        <div class="card mb-4">
          <div class="card-head">📊 Limits & Quotas</div>
          <div class="grid grid-cols-3 gap-4 mt-3">
            <div>
              <label class="lbl">Max Users</label>
              <input type="number" [(ngModel)]="userLimit" (input)="dirty.set(true)" class="ip">
              <p class="text-xs text-gray-500 mt-1">Currently using ~{{ firm()!.userLimit }} (live count TBD)</p>
            </div>
            <div>
              <label class="lbl">Max Branches</label>
              <input type="number" [(ngModel)]="branchLimit" (input)="dirty.set(true)" class="ip">
            </div>
            <div>
              <label class="lbl">AI Scans / Month</label>
              <input type="number" [(ngModel)]="aiQuotaMonthly" (input)="dirty.set(true)" class="ip">
              <p class="text-xs text-gray-500 mt-1">Used: {{ firm()!.aiUsedThisMonth }} / {{ firm()!.aiQuotaMonthly }} ({{ usagePct() }}%)</p>
            </div>
          </div>
        </div>

        <!-- Billing info -->
        <div class="card mb-4">
          <div class="card-head">💵 Billing Snapshot</div>
          <div class="grid grid-cols-3 gap-4 mt-3 text-sm">
            <div><span class="text-gray-500">Monthly Price:</span> <b>₹{{ firm()!.monthlyInr || 0 | number:'1.0-0' }}</b></div>
            <div><span class="text-gray-500">Wallet:</span> <b>₹{{ firm()!.walletBalance | number:'1.2-2' }}</b></div>
            <div><span class="text-gray-500">Plan ends:</span> <b>{{ firm()!.subscriptionEndsAt || firm()!.trialEndsAt || '—' }}</b></div>
          </div>
        </div>

        <!-- Extend subscription validity -->
        <div class="card mb-4">
          <div class="card-head">🗓️ Extend Subscription (Plan Extend)</div>
          <p class="text-xs text-gray-500 mt-1">Current end: <b>{{ firm()!.subscriptionEndsAt || firm()!.trialEndsAt || '—' }}</b> — niche se aage badhao:</p>
          <div class="flex flex-wrap items-center gap-2 mt-3">
            <button (click)="extend(30)"  [disabled]="extending()" class="btn-light">+1 Month</button>
            <button (click)="extend(90)"  [disabled]="extending()" class="btn-light">+3 Months</button>
            <button (click)="extend(180)" [disabled]="extending()" class="btn-light">+6 Months</button>
            <button (click)="extend(365)" [disabled]="extending()" class="btn-light">+1 Year</button>
            <span class="mx-1 text-gray-300">|</span>
            <input type="number" [(ngModel)]="customDays" class="ip" style="width:100px" placeholder="Days">
            <button (click)="extend(customDays || 0)" [disabled]="extending() || !customDays" class="btn-primary">Extend</button>
          </div>
        </div>

        <!-- BYOK: per-firm API keys (super-admin only) -->
        <div class="card mb-4">
          <div class="card-head">🔑 API Keys (BYOK — firm ki apni keys)</div>
          <p class="text-xs text-gray-500 mt-1">
            Key yahan SIRF admin lagata hai. Firm ko key kabhi nahi dikhti — unko sirf recharge/console link milta hai.
          </p>
          <div class="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label class="lbl">AI Provider (Bill Scan)</label>
              <select [(ngModel)]="aiProvider" (ngModelChange)="aiModel = ''" class="ip">
                <option value="gemini">Gemini (Google)</option>
                <option value="claude">Claude (Anthropic)</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div>
              <label class="lbl">Model (scan ke liye — sasta upar)</label>
              <select [(ngModel)]="aiModel" class="ip">
                <option value="">Default ({{ defaultModel() }})</option>
                @for (m of modelOptions(); track m.value) {
                  <option [value]="m.value">{{ m.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="lbl">
                AI API Key
                @if (keysInfo()?.aiKeySet) { <span class="text-green-600 normal-case">— set ✓ ({{ keysInfo()?.aiKeyMasked }})</span> }
                @else { <span class="text-red-500 normal-case">— not set</span> }
              </label>
              <input [(ngModel)]="aiKeyInput" class="ip" placeholder="Nayi key paste karein (khali = koi change nahi)">
            </div>
            <div>
              <label class="lbl">
                Google Maps Key (HR Live Movement)
                @if (keysInfo()?.mapsKeySet) { <span class="text-green-600 normal-case">— set ✓ ({{ keysInfo()?.mapsKeyMasked }})</span> }
                @else { <span class="text-gray-400 normal-case">— optional (khali = free OpenStreetMap)</span> }
              </label>
              <input [(ngModel)]="mapsKeyInput" class="ip" placeholder="Maps key (optional)">
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-3 mt-4">
            <button (click)="saveKeys()" [disabled]="savingKeys()" class="btn-primary">
              {{ savingKeys() ? 'Saving…' : '💾 Save Keys' }}
            </button>
            <a [href]="consoleUrl()" target="_blank" rel="noopener" class="btn-light">
              ↗ {{ providerLabel() }} Recharge / Console
            </a>
            <span class="text-xs text-gray-500">Yahi recharge link firm ko unke Wallet page par bhi dikhta hai.</span>
          </div>
        </div>

        <!-- Save bar -->
        <div class="flex justify-end gap-3 sticky bottom-4 bg-white p-3 rounded-lg shadow-lg border border-purple-200">
          <span class="text-sm text-gray-600 self-center" *ngIf="dirty()">⚠️ Unsaved changes</span>
          <button (click)="reload()" class="btn-light">↺ Reload</button>
          <button (click)="save()" [disabled]="saving()" class="btn-primary">
            {{ saving() ? 'Saving…' : '💾 Save Changes' }}
          </button>
        </div>
      } @else {
        <div class="card text-center text-red-600 p-8">⚠️ Firm not found</div>
      }
    </div>
  `,
  styles: [`
    .card { background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(92,26,139,.06); }
    .card-head { font-size: 13px; font-weight: 800; color: #5c1a8b; text-transform: uppercase; letter-spacing: .5px; }
    .lbl { font-size: 10px; font-weight: 700; color: #6b3fa0; text-transform: uppercase; letter-spacing: .5px; display: block; margin-bottom: 4px; }
    .ip { width: 100%; padding: 8px 10px; border: 1.5px solid #ddc8f5; border-radius: 8px; font-size: 13px; outline: none; background: #faf5ff; }
    .ip:focus { border-color: #5c1a8b; }
    .btn-primary { padding: 8px 18px; background: linear-gradient(135deg, #4a1080, #5c1a8b); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-light { padding: 8px 14px; background: #fff; color: #5c1a8b; border: 1.5px solid #ddc8f5; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }

    .mod-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: #faf5ff; border: 1.5px solid #ddc8f5; border-radius: 8px; transition: background .15s, border .15s; }
    .mod-row.mod-on { background: #f0fff4; border-color: #16a34a; }

    /* iOS-style switch */
    .switch { position: relative; display: inline-block; width: 50px; height: 26px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; inset: 0; background: #ccc; border-radius: 26px; transition: .25s; }
    .slider:before { content: ""; position: absolute; height: 20px; width: 20px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .25s; }
    .switch input:checked + .slider { background: #16a34a; }
    .switch input:checked + .slider:before { transform: translateX(24px); }
  `]
})
export class AdminFirmSubscriptionComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/admin`;

  modList = MODULE_LIST;
  firmId = '';
  firm = signal<FirmSubscription | null>(null);
  plans = signal<PlanTemplate[]>([]);
  loading = signal(true);
  saving = signal(false);
  dirty = signal(false);

  selectedPlan: string | null = null;
  extending = signal(false);
  customDays: number | null = null;
  modules: Record<string, boolean> = {};
  userLimit = 3;
  branchLimit = 1;
  aiQuotaMonthly = 0;

  enabledCount = computed(() => Object.values(this.modules).filter(v => v).length);
  usagePct = computed(() => {
    const f = this.firm(); if (!f || !f.aiQuotaMonthly) return 0;
    return Math.round((f.aiUsedThisMonth / f.aiQuotaMonthly) * 100);
  });

  // BYOK keys
  keysInfo = signal<{ aiProvider: string; aiModel: string | null; aiKeySet: boolean; aiKeyMasked: string | null; mapsKeySet: boolean; mapsKeyMasked: string | null } | null>(null);
  aiProvider = 'gemini';
  aiModel = '';
  aiKeyInput = '';
  mapsKeyInput = '';
  savingKeys = signal(false);

  providerLabel(): string {
    return this.aiProvider === 'claude' ? 'Anthropic' : this.aiProvider === 'openai' ? 'OpenAI' : 'Google AI';
  }

  // Scan ke liye vision models — sasta pehle, approx scan accuracy ke saath.
  // (~% saaf photo par; asli confidence har scan ke baad dikhta hai.)
  // (Live movement me AI model nahi lagta, sirf Maps key.)
  modelOptions(): { value: string; label: string }[] {
    if (this.aiProvider === 'claude') {
      return [
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — ~94-95% accuracy, sabse sasta ✓' },
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — ~97% accuracy, mehenga' }
      ];
    }
    if (this.aiProvider === 'openai') {
      return [
        { value: 'gpt-4o-mini', label: 'GPT-4o mini — ~92-94% accuracy, sabse sasta' },
        { value: 'gpt-4o', label: 'GPT-4o — ~96% accuracy, mehenga' }
      ];
    }
    return [
      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite — ~90-92% accuracy, sabse sasta' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — ~95% accuracy, sasta (recommended) ✓' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — ~97% accuracy, mehenga' }
    ];
  }

  defaultModel(): string {
    return this.aiProvider === 'claude' ? 'Claude Haiku 4.5'
      : this.aiProvider === 'openai' ? 'GPT-4o mini'
      : 'Gemini 2.5 Flash';
  }
  consoleUrl(): string {
    return this.aiProvider === 'claude' ? 'https://console.anthropic.com/settings/billing'
      : this.aiProvider === 'openai' ? 'https://platform.openai.com/settings/organization/billing'
      : 'https://aistudio.google.com/';
  }

  loadKeys() {
    this.http.get<any>(`${this.base}/firms/${this.firmId}/api-keys`).subscribe({
      next: (k) => {
        this.keysInfo.set(k);
        this.aiProvider = k.aiProvider || 'gemini';
        this.aiModel = k.aiModel || '';
        this.aiKeyInput = '';
        this.mapsKeyInput = '';
      },
      error: () => {}
    });
  }

  saveKeys() {
    this.savingKeys.set(true);
    const payload: any = { aiProvider: this.aiProvider, aiModel: this.aiModel || null };
    if (this.aiKeyInput.trim()) payload.aiApiKey = this.aiKeyInput.trim();
    if (this.mapsKeyInput.trim()) payload.mapsApiKey = this.mapsKeyInput.trim();
    this.http.put(`${this.base}/firms/${this.firmId}/api-keys`, payload).subscribe({
      next: () => {
        this.savingKeys.set(false);
        alert('✓ Keys saved! Firm ab apni key se scan karegi.');
        this.loadKeys();
      },
      error: (e) => {
        this.savingKeys.set(false);
        alert('❌ Save failed: ' + (e?.error?.error ?? 'unknown'));
      }
    });
  }

  ngOnInit() {
    this.firmId = this.route.snapshot.paramMap.get('id') || '';
    this.loadPlans();
    this.reload();
    this.loadKeys();
  }

  loadPlans() {
    this.http.get<PlanTemplate[]>(`${this.base}/plans/templates`).subscribe({
      next: (p) => this.plans.set(p),
      error: (e) => console.error('Failed to load plans', e)
    });
  }

  reload() {
    this.loading.set(true);
    this.http.get<FirmSubscription>(`${this.base}/firms/${this.firmId}/subscription`).subscribe({
      next: (r) => {
        this.firm.set(r);
        this.selectedPlan = r.planCode;
        // Initialize all modules to their current state (false if missing)
        this.modules = {};
        for (const m of MODULE_LIST) {
          this.modules[m.key] = !!r.enabledModules[m.key];
        }
        this.userLimit = r.userLimit;
        this.branchLimit = r.branchLimit;
        this.aiQuotaMonthly = r.aiQuotaMonthly;
        this.dirty.set(false);
        this.loading.set(false);
      },
      error: (e) => { console.error(e); this.loading.set(false); }
    });
  }

  applyPlan() {
    if (!this.selectedPlan) return;
    if (!confirm(`Apply plan defaults? This will overwrite the firm's current modules and limits with the "${this.selectedPlan}" plan template.`)) return;
    this.saving.set(true);
    this.http.post(`${this.base}/firms/${this.firmId}/apply-plan/${this.selectedPlan}`, {}).subscribe({
      next: () => {
        alert(`✓ Plan "${this.selectedPlan}" applied!`);
        this.saving.set(false);
        this.reload();
      },
      error: (e) => {
        alert('❌ Failed: ' + (e?.error?.error ?? 'unknown'));
        this.saving.set(false);
      }
    });
  }

  extend(days: number) {
    if (!days || days <= 0) return;
    if (!confirm(`Subscription ${days} din extend karein?`)) return;
    this.extending.set(true);
    this.http.post<{ subscriptionEndsAt: string }>(`${this.base}/subscription/${this.firmId}/extend`, { days }).subscribe({
      next: (r) => {
        this.extending.set(false);
        this.customDays = null;
        alert('✓ Extended! Naya end: ' + (r.subscriptionEndsAt?.slice(0, 10) ?? ''));
        this.reload();
      },
      error: (e) => { this.extending.set(false); alert('❌ ' + (e?.error?.error ?? 'fail')); }
    });
  }

  save() {
    this.saving.set(true);
    const payload = {
      enabledModules: this.modules,
      planCode: this.selectedPlan,
      userLimit: +this.userLimit || 3,
      branchLimit: +this.branchLimit || 1,
      aiQuotaMonthly: +this.aiQuotaMonthly || 0
    };
    this.http.patch(`${this.base}/firms/${this.firmId}/subscription`, payload).subscribe({
      next: () => {
        alert('✓ Saved! Customer will see changes immediately.');
        this.saving.set(false);
        this.dirty.set(false);
        this.reload();
      },
      error: (e) => {
        alert('❌ Save failed: ' + (e?.error?.error ?? 'unknown'));
        this.saving.set(false);
      }
    });
  }
}
