import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { AdminService, AiKeysInfo } from '../services/admin.service';

@Component({
  selector: 'app-admin-ai-keys',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, BackButtonComponent],
  template: `
    <div class="max-w-3xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <!-- Sub-nav (super-admin top tabs) -->
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
        <a routerLink="/admin/ai-keys" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🔑 AI Keys</a>
      </div>

      <h2 class="font-display font-black text-2xl text-[#5c1a8b] mb-1">🔑 Platform AI Keys (sab firms ke liye common)</h2>
      <p class="text-sm text-gray-500 mb-5">
        Yeh keys SIRF Anjaninex admin set karta hai. Saari firms ke bill+order scan inhi se chalte hain.
        Firm apni BYOK key daale to wo override karti hai.
      </p>

      @if (loading()) {
        <div class="card text-center text-gray-500 py-8">Loading…</div>
      } @else {
        <div class="flex flex-col gap-4">

          <!-- GEMINI -->
          <div class="card">
            <h3 class="font-bold text-[#5c1a8b] mb-1">🟢 Gemini (Google) — Flash / Pro</h3>
            <p class="text-xs text-gray-500 mb-3">Default scan model. AI Studio se key.</p>
            <label class="lbl">
              Nayi key paste karein (khali = koi change nahi)
              @if (info().geminiSet) {
                <span class="ml-2 text-green-600 normal-case font-semibold">set ✓ (…{{ info().geminiLast4 }})</span>
              }
            </label>
            <input [(ngModel)]="geminiKey" type="password" class="input font-mono"
                   [placeholder]="info().geminiSet ? '•••••• (saved)' : 'AIza...'">
            @if (info().geminiSet) {
              <button (click)="clear('gemini')" class="text-xs text-red-600 mt-2 hover:underline">🗑 Clear / Delete key</button>
            }
          </div>

          <!-- CLAUDE -->
          <div class="card">
            <h3 class="font-bold text-[#5c1a8b] mb-1">🟣 Claude (Anthropic) — Sonnet / Haiku</h3>
            <p class="text-xs text-gray-500 mb-3">Best accuracy. console.anthropic.com se key.</p>
            <label class="lbl">
              Nayi key paste karein (khali = koi change nahi)
              @if (info().claudeSet) {
                <span class="ml-2 text-green-600 normal-case font-semibold">set ✓ (…{{ info().claudeLast4 }})</span>
              }
            </label>
            <input [(ngModel)]="claudeKey" type="password" class="input font-mono"
                   [placeholder]="info().claudeSet ? '•••••• (saved)' : 'sk-ant-...'">
            @if (info().claudeSet) {
              <button (click)="clear('claude')" class="text-xs text-red-600 mt-2 hover:underline">🗑 Clear / Delete key</button>
            }
          </div>

          <!-- OPENAI -->
          <div class="card">
            <h3 class="font-bold text-[#5c1a8b] mb-1">🔵 OpenAI — GPT-4o</h3>
            <p class="text-xs text-gray-500 mb-3">platform.openai.com se key.</p>
            <label class="lbl">
              Nayi key paste karein (khali = koi change nahi)
              @if (info().openaiSet) {
                <span class="ml-2 text-green-600 normal-case font-semibold">set ✓ (…{{ info().openaiLast4 }})</span>
              }
            </label>
            <input [(ngModel)]="openaiKey" type="password" class="input font-mono"
                   [placeholder]="info().openaiSet ? '•••••• (saved)' : 'sk-...'">
            @if (info().openaiSet) {
              <button (click)="clear('openai')" class="text-xs text-red-600 mt-2 hover:underline">🗑 Clear / Delete key</button>
            }
          </div>

          <!-- SARVAM (Anji ki Voice) -->
          <div class="card">
            <h3 class="font-bold text-[#5c1a8b] mb-1">🔊 Sarvam AI (Anji ki Voice)</h3>
            <p class="text-xs text-gray-500 mb-3">Anji ki natural Indian awaaz (TTS). Khali = Anji browser ki robotic voice par chalega. dashboard.sarvam.ai se key.</p>
            <label class="lbl">
              Nayi key paste karein (khali = koi change nahi)
              @if (info().sarvamSet) {
                <span class="ml-2 text-green-600 normal-case font-semibold">set ✓ (…{{ info().sarvamLast4 }})</span>
              }
            </label>
            <input [(ngModel)]="sarvamKey" type="password" class="input font-mono"
                   [placeholder]="info().sarvamSet ? '•••••• (saved)' : 'sk_...'">
            @if (info().sarvamSet) {
              <button (click)="clear('sarvam')" class="text-xs text-red-600 mt-2 hover:underline">🗑 Clear / Delete key</button>
            }
          </div>

          <!-- LIVE MAP PROVIDER (HR -> Live Map) -->
          <div class="card">
            <h3 class="font-bold text-[#5c1a8b] mb-1">🗺 Live Map Provider (HR → Live Map)</h3>
            <p class="text-xs text-gray-500 mb-3">Field staff ki live movement is provider pe dikhti hai. <b>OpenStreetMap = bilkul free</b> (koi key/card nahi). Google/Ola ke liye niche key daalo.</p>
            <label class="lbl">Provider chuno</label>
            <select [(ngModel)]="mapsProvider" class="input">
              <option value="osm">OpenStreetMap — FREE (no key, recommended)</option>
              <option value="ola">Ola Maps (Indian, sasta) — key chahiye</option>
              <option value="google">Google Maps — key + billing chahiye</option>
            </select>

            @if (mapsProvider === 'osm') {
              <p class="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">✅ OpenStreetMap free hai — koi key nahi chahiye. Save karo, turant chalega.</p>
            }
            @if (mapsProvider === 'google') {
              <div class="mt-4">
                <label class="lbl">Google Maps key
                  @if (info().mapsSet) { <span class="ml-2 text-green-600 normal-case font-semibold">set ✓ (…{{ info().mapsLast4 }})</span> }
                </label>
                <p class="text-xs text-gray-400 mb-1">console.cloud.google.com → Maps JavaScript API enable → key banao.</p>
                <input [(ngModel)]="mapsKey" type="password" class="input font-mono" [placeholder]="info().mapsSet ? '•••••• (saved)' : 'AIza...'">
                @if (info().mapsSet) { <button (click)="clear('maps')" class="text-xs text-red-600 mt-2 hover:underline">🗑 Clear Google key</button> }
              </div>
            }
            @if (mapsProvider === 'ola') {
              <div class="mt-4">
                <label class="lbl">Ola Maps key
                  @if (info().olaMapsSet) { <span class="ml-2 text-green-600 normal-case font-semibold">set ✓ (…{{ info().olaMapsLast4 }})</span> }
                </label>
                <p class="text-xs text-gray-400 mb-1">maps.olakrutrim.com → Project → API key. Koi card/prepayment nahi.</p>
                <input [(ngModel)]="olaMapsKey" type="password" class="input font-mono" [placeholder]="info().olaMapsSet ? '•••••• (saved)' : 'Ola API key'">
                @if (info().olaMapsSet) { <button (click)="clear('ola')" class="text-xs text-red-600 mt-2 hover:underline">🗑 Clear Ola key</button> }
              </div>
            }
          </div>

          @if (msg()) { <div class="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">{{ msg() }}</div> }
          @if (err()) { <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{{ err() }}</div> }

          <div class="flex justify-end">
            <button (click)="save()" [disabled]="saving()" class="btn-primary">{{ saving() ? 'Saving…' : '💾 Save Keys' }}</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .card{ background:#fff; border:1px solid #eee; border-radius:14px; padding:16px; }
    .lbl{ display:block; font-size:10px; font-weight:800; color:#6b3fa0; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
  `]
})
export class AdminAiKeysComponent {
  private svc = inject(AdminService);

  loading = signal(true);
  saving = signal(false);
  msg = signal('');
  err = signal('');
  info = signal<AiKeysInfo>({
    geminiSet: false, geminiLast4: '', claudeSet: false, claudeLast4: '',
    openaiSet: false, openaiLast4: '', sarvamSet: false, sarvamLast4: '',
    mapsSet: false, mapsLast4: '',
    olaMapsSet: false, olaMapsLast4: '', mapsProvider: 'osm'
  });

  geminiKey = '';
  claudeKey = '';
  openaiKey = '';
  sarvamKey = '';
  mapsKey = '';
  olaMapsKey = '';
  mapsProvider = 'osm';

  ngOnInit() {
    this.svc.getAiKeys().subscribe({
      next: (s) => { this.info.set(s); this.mapsProvider = s.mapsProvider || 'osm'; this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  save() {
    this.saving.set(true); this.msg.set(''); this.err.set('');
    this.svc.saveAiKeys({
      geminiKey: this.geminiKey || null,
      claudeKey: this.claudeKey || null,
      openaiKey: this.openaiKey || null,
      sarvamKey: this.sarvamKey || null,
      mapsKey: this.mapsKey || null,
      olaMapsKey: this.olaMapsKey || null,
      mapsProvider: this.mapsProvider || 'osm'
    }).subscribe({
      next: (s) => {
        this.info.set(s);
        this.mapsProvider = s.mapsProvider || 'osm';
        this.geminiKey = ''; this.claudeKey = ''; this.openaiKey = ''; this.sarvamKey = ''; this.mapsKey = ''; this.olaMapsKey = '';
        this.saving.set(false);
        this.msg.set('✅ AI keys save ho gayi! Sab firms ke scan ab inhi se chalenge.');
      },
      error: (e) => { this.err.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  clear(provider: 'gemini' | 'claude' | 'openai' | 'sarvam' | 'maps' | 'ola') {
    if (!confirm('Is key ko delete karein? Iske baad us provider ke model platform key se nahi chalenge (jab tak nayi key na daalein).')) return;
    this.msg.set(''); this.err.set('');
    this.svc.clearAiKey(provider).subscribe({
      next: (s) => { this.info.set(s); this.msg.set('🗑 Key delete ho gayi.'); },
      error: (e) => { this.err.set(e?.error?.error ?? 'Delete nahi hua'); }
    });
  }
}
