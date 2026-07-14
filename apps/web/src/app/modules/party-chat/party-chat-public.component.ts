import { Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

interface PMsg {
  id: string; sender: 'firm' | 'party'; senderName: string | null;
  body: string; readAt: string | null; createdAt: string;
}

/**
 * PARTY CHAT — PUBLIC (party side). Login nahi:
 *   1. Mobile number daalo → OTP aata hai (WhatsApp par)
 *   2. OTP verify → 7-din ka session (localStorage)
 *   3. Firm se WhatsApp-jaisi chat (blue ticks)
 */
@Component({
  selector: 'app-party-chat-public',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="min-h-screen bg-[#FAF7F0] flex flex-col items-center p-4">
      <div class="w-full max-w-lg">
        <div class="text-center my-4">
          <div class="font-black text-2xl text-[#1B2E5C]">💬 {{ firmName() || 'Vyapaar Setu' }}</div>
          <div class="text-xs text-gray-500">Vyapaar Setu Party Chat — an Anjaninex product</div>
        </div>

        <!-- STEP 1: phone -->
        @if (step() === 'phone') {
          <div class="bg-white rounded-2xl border border-[#D6DDEA] p-5">
            <p class="text-sm text-gray-600 mb-3">Apna <b>wahi mobile number</b> daalein jo firm ke paas registered hai:</p>
            <input [(ngModel)]="phone" type="tel" maxlength="10" placeholder="98XXXXXXXX"
                   class="w-full border border-[#D6DDEA] rounded-lg px-3 py-3 text-lg font-mono text-center">
            @if (err()) { <p class="text-red-600 text-sm mt-2">{{ err() }}</p> }
            <button (click)="requestOtp()" [disabled]="busy() || phone.length < 10"
                    class="w-full mt-3 bg-[#1B2E5C] text-white font-bold rounded-lg py-3 disabled:opacity-50">
              {{ busy() ? 'Bhej rahe hain…' : 'OTP bhejo' }}
            </button>
          </div>
        }

        <!-- STEP 2: otp -->
        @if (step() === 'otp') {
          <div class="bg-white rounded-2xl border border-[#D6DDEA] p-5">
            <p class="text-sm text-gray-600 mb-1">📱 <b>{{ phone }}</b> par OTP bheja hai{{ otpPreview() ? '' : ' (WhatsApp check karein)' }}:</p>
            @if (otpPreview()) {
              <p class="text-xs bg-yellow-50 border border-yellow-200 rounded p-2 mb-2">
                🧪 Testing mode — aapka OTP: <b class="font-mono">{{ otpPreview() }}</b>
              </p>
            }
            <input [(ngModel)]="otp" type="tel" maxlength="6" placeholder="6-digit OTP"
                   class="w-full border border-[#D6DDEA] rounded-lg px-3 py-3 text-lg font-mono text-center tracking-widest">
            @if (err()) { <p class="text-red-600 text-sm mt-2">{{ err() }}</p> }
            <button (click)="verify()" [disabled]="busy() || otp.length < 6"
                    class="w-full mt-3 bg-[#1B2E5C] text-white font-bold rounded-lg py-3 disabled:opacity-50">
              {{ busy() ? 'Check kar rahe hain…' : 'Chat kholo' }}
            </button>
            <button (click)="step.set('phone'); err.set('')" class="w-full mt-2 text-xs text-gray-500 underline">number badlo</button>
          </div>
        }

        <!-- STEP 3: chat -->
        @if (step() === 'chat') {
          <div class="bg-white rounded-2xl border border-[#D6DDEA] flex flex-col" style="height:75vh">
            <div class="px-4 py-3 border-b border-[#F0F0F0]">
              <div class="font-bold text-[#1B2E5C]">{{ firmName() }}</div>
              <div class="text-xs text-gray-500">Aap: {{ partyName() }}</div>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-2">
              @if (msgs().length === 0) {
                <div class="text-center text-gray-400 text-sm mt-8">Pehla message bhejo 👇</div>
              }
              @for (m of msgs(); track m.id) {
                <div class="flex" [class.justify-end]="m.sender === 'party'">
                  <div class="rounded-2xl px-3 py-2 max-w-[80%] text-sm"
                       [class]="m.sender === 'party' ? 'bg-[#DCF8C6]' : 'bg-gray-100'">
                    <div class="whitespace-pre-wrap break-words">{{ m.body }}</div>
                    <div class="text-[10px] text-gray-500 text-right mt-0.5">
                      {{ m.createdAt | date:'dd/MM h:mm a' }}
                      @if (m.sender === 'party') {
                        <span class="pc-tick" [style.color]="m.readAt ? '#34B7F1' : '#9ca3af'">✓✓</span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
            <div class="p-3 border-t border-[#F0F0F0] flex gap-2">
              <textarea [(ngModel)]="draft" (keydown)="onEnter($event)" rows="1"
                        placeholder="Message likho…"
                        class="flex-1 border border-[#D6DDEA] rounded-lg px-3 py-2 resize-none"></textarea>
              <button (click)="send()" [disabled]="busy() || !draft.trim()"
                      class="bg-[#1B2E5C] text-white font-bold rounded-lg px-4 disabled:opacity-50">📤</button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`.pc-tick{font-weight:700;letter-spacing:-2px}`]
})
export class PartyChatPublicComponent {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private base = `${environment.apiUrl}/api/party-chat/public`;

  firmId = '';
  step = signal<'phone' | 'otp' | 'chat'>('phone');
  phone = '';
  otp = '';
  draft = '';
  busy = signal(false);
  err = signal('');
  otpPreview = signal<string | null>(null);
  firmName = signal('');
  partyName = signal('');
  msgs = signal<PMsg[]>([]);
  private token = '';
  private pollTimer: any;

  ngOnInit() {
    this.firmId = this.route.snapshot.paramMap.get('firmId') || '';
    // Pehle se session ho to seedha chat kholo
    try {
      const saved = localStorage.getItem('pchat_token_' + this.firmId);
      if (saved) { this.token = saved; this.step.set('chat'); this.loadMsgs(); }
    } catch {}
    this.pollTimer = setInterval(() => { if (this.step() === 'chat') this.loadMsgs(); }, 10_000);
  }
  ngOnDestroy() { clearInterval(this.pollTimer); }

  requestOtp() {
    this.busy.set(true); this.err.set('');
    this.http.post<any>(`${this.base}/request-otp`, { firmId: this.firmId, phone: this.phone }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.partyName.set(r.partyName || '');
        this.otpPreview.set(r.otpPreview || null);
        this.step.set('otp');
      },
      error: (e) => { this.busy.set(false); this.err.set(e?.error?.error ?? 'OTP nahi bheja ja saka'); }
    });
  }

  verify() {
    this.busy.set(true); this.err.set('');
    this.http.post<any>(`${this.base}/verify`, { firmId: this.firmId, phone: this.phone, otp: this.otp }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.token = r.token;
        try { localStorage.setItem('pchat_token_' + this.firmId, r.token); } catch {}
        this.firmName.set(r.firmName || '');
        this.partyName.set(r.partyName || '');
        this.step.set('chat');
        this.loadMsgs();
      },
      error: (e) => { this.busy.set(false); this.err.set(e?.error?.error ?? 'OTP verify nahi hua'); }
    });
  }

  loadMsgs() {
    this.http.get<any>(`${this.base}/messages`, { params: { token: this.token } }).subscribe({
      next: (r) => {
        this.firmName.set(r.firmName || this.firmName());
        this.partyName.set(r.partyName || this.partyName());
        this.msgs.set(r.messages || []);
      },
      error: (e) => {
        if (e?.status === 401) {   // session expire → dobara OTP
          try { localStorage.removeItem('pchat_token_' + this.firmId); } catch {}
          this.step.set('phone');
        }
      }
    });
  }

  onEnter(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }

  send() {
    const body = this.draft.trim();
    if (!body || this.busy()) return;
    this.busy.set(true);
    this.http.post(`${this.base}/messages`, { token: this.token, body }).subscribe({
      next: () => { this.busy.set(false); this.draft = ''; this.loadMsgs(); },
      error: (e) => { this.busy.set(false); alert('⚠️ ' + (e?.error?.error ?? 'Message nahi gaya')); }
    });
  }
}
