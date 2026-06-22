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
    geminiSet: false, geminiLast4: '', claudeSet: false, claudeLast4: '', openaiSet: false, openaiLast4: ''
  });

  geminiKey = '';
  claudeKey = '';
  openaiKey = '';

  ngOnInit() {
    this.svc.getAiKeys().subscribe({
      next: (s) => { this.info.set(s); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  save() {
    this.saving.set(true); this.msg.set(''); this.err.set('');
    this.svc.saveAiKeys({
      geminiKey: this.geminiKey || null,
      claudeKey: this.claudeKey || null,
      openaiKey: this.openaiKey || null
    }).subscribe({
      next: (s) => {
        this.info.set(s);
        this.geminiKey = ''; this.claudeKey = ''; this.openaiKey = '';
        this.saving.set(false);
        this.msg.set('✅ AI keys save ho gayi! Sab firms ke scan ab inhi se chalenge.');
      },
      error: (e) => { this.err.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }
}
