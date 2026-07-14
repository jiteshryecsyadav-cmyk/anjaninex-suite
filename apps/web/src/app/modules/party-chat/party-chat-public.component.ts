import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';

interface PMsg {
  id: string; sender: 'firm' | 'party'; senderName: string | null;
  body: string; readAt: string | null; createdAt: string;
  attachmentUrl?: string | null; attachmentName?: string | null; attachmentType?: string | null;
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
    <!-- WhatsApp jaisa FULL-SCREEN layout — mobile par poori screen, desktop par center column -->
    <div class="pc-shell">

      <!-- Header bar (WhatsApp jaisa) -->
      <div class="pc-header">
        <div class="pc-avatar">{{ (firmName() || 'V').charAt(0) }}</div>
        <div class="flex-1 min-w-0">
          <div class="pc-title">{{ firmName() || 'Vyapaar Setu' }}</div>
          <div class="pc-sub">{{ step() === 'chat' ? ('Aap: ' + partyName()) : 'Party Chat — Vyapaar Setu' }}</div>
        </div>
        @if (step() === 'chat') {
          <button (click)="logout()" class="pc-logout" title="Logout — dobara OTP lagega">⏻</button>
        }
      </div>

      <!-- 📲 App install banner — link khulte hi sabse pehle (Android Chrome) -->
      @if (installReady()) {
        <div class="pc-install">
          <span class="flex-1">📲 <b>Vyapaar Setu app</b> install karo — chat ek tap par khulegi</span>
          <button (click)="installApp()" class="pc-install-btn">Install</button>
          <button (click)="dismissInstall()" class="pc-install-x">✕</button>
        </div>
      }

      <!-- STEP 1: phone -->
      @if (step() === 'phone') {
        <div class="pc-body pc-center">
          <div class="pc-card">
            <div class="text-4xl text-center mb-2">💬</div>
            <p class="text-base text-gray-700 mb-4 text-center">Apna <b>wahi mobile number</b> daalein<br>jo firm ke paas registered hai:</p>
            <input [(ngModel)]="phone" type="tel" maxlength="10" placeholder="98XXXXXXXX" inputmode="numeric"
                   class="w-full border-2 border-[#D6DDEA] rounded-xl px-3 py-4 text-2xl font-mono text-center">
            @if (err()) { <p class="text-red-600 text-sm mt-3 text-center">{{ err() }}</p> }
            <button (click)="requestOtp()" [disabled]="busy() || phone.length < 10"
                    class="w-full mt-4 bg-[#1B2E5C] text-white font-bold text-lg rounded-xl py-4 disabled:opacity-50">
              {{ busy() ? 'Bhej rahe hain…' : 'OTP bhejo' }}
            </button>
          </div>
        </div>
      }

      <!-- STEP 2: otp -->
      @if (step() === 'otp') {
        <div class="pc-body pc-center">
          <div class="pc-card">
            <p class="text-base text-gray-700 mb-2 text-center">📱 <b>{{ phone }}</b> par OTP bheja hai{{ otpPreview() ? '' : ' — WhatsApp check karein' }}</p>
            @if (otpPreview()) {
              <p class="text-sm bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 text-center">
                🧪 Testing mode — aapka OTP: <b class="font-mono text-lg">{{ otpPreview() }}</b>
              </p>
            }
            <input [(ngModel)]="otp" type="tel" maxlength="6" placeholder="● ● ● ● ● ●" inputmode="numeric"
                   class="w-full border-2 border-[#D6DDEA] rounded-xl px-3 py-4 text-2xl font-mono text-center tracking-[8px]">
            @if (err()) { <p class="text-red-600 text-sm mt-3 text-center">{{ err() }}</p> }
            <button (click)="verify()" [disabled]="busy() || otp.length < 6"
                    class="w-full mt-4 bg-[#1B2E5C] text-white font-bold text-lg rounded-xl py-4 disabled:opacity-50">
              {{ busy() ? 'Check kar rahe hain…' : '💬 Chat kholo' }}
            </button>
            <button (click)="step.set('phone'); err.set('')" class="w-full mt-3 text-sm text-gray-500 underline">number badlo</button>
          </div>
        </div>
      }

      <!-- STEP 3: chat (WhatsApp-style) -->
      @if (step() === 'chat') {
        <div class="pc-body pc-chatbg">
          @if (msgs().length === 0) {
            <div class="text-center text-gray-500 text-base mt-12 bg-white/70 rounded-xl mx-8 py-4">Pehla message bhejo 👇</div>
          }
          @for (m of msgs(); track m.id) {
            <div class="flex mb-1.5 px-3" [class.justify-end]="m.sender === 'party'">
              <div class="pc-bubble" [class.pc-mine]="m.sender === 'party'">
                @if (m.attachmentType === 'image') {
                  <a [href]="fileUrl(m.attachmentUrl!)" target="_blank">
                    <img [src]="fileUrl(m.attachmentUrl!)" class="pc-img" alt="photo">
                  </a>
                } @else if (m.attachmentType === 'document') {
                  <a [href]="fileUrl(m.attachmentUrl!)" target="_blank" class="pc-doc">📄 {{ m.attachmentName || 'Document' }}</a>
                }
                @if (m.body) { <div class="whitespace-pre-wrap break-words" [innerHTML]="linkify(m.body)"></div> }
                <div class="pc-meta">
                  {{ m.createdAt | date:'h:mm a' }}
                  @if (m.sender === 'party') {
                    <span class="pc-tick" [style.color]="m.readAt ? '#34B7F1' : '#9ca3af'">✓✓</span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
        <div class="pc-inputbar">
          @if (attachOpen()) {
            <div class="pc-attmenu">
              <button (click)="pickFile('image')" class="pc-att"><span class="pc-att-ico" style="background:#7C3AED">📷</span>Photo</button>
              <button (click)="pickFile('doc')" class="pc-att"><span class="pc-att-ico" style="background:#2563EB">📄</span>Document</button>
              <button (click)="sendLocation()" class="pc-att"><span class="pc-att-ico" style="background:#059669">📍</span>Location</button>
            </div>
          }
          <button (click)="attachOpen.set(!attachOpen())" class="pc-plus">➕</button>
          <input #fileInput type="file" style="display:none" (change)="fileChosen($event)">
          <textarea [(ngModel)]="draft" (keydown)="onEnter($event)" rows="1"
                    placeholder="Message likho…"
                    class="pc-input"></textarea>
          <button (click)="send()" [disabled]="busy() || !draft.trim()" class="pc-send">➤</button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .pc-shell {
      display: flex; flex-direction: column;
      height: 100dvh; width: 100%; max-width: 640px; margin: 0 auto;
      background: #FAF7F0; font-size: 22px;
    }
    .pc-header {
      display: flex; align-items: center; gap: 12px;
      background: #1B2E5C; color: #fff; padding: 12px 14px;
      position: sticky; top: 0; z-index: 10;
    }
    .pc-avatar {
      width: 42px; height: 42px; border-radius: 50%;
      background: #fff; color: #1B2E5C; font-weight: 900; font-size: 20px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .pc-title { font-weight: 800; font-size: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pc-sub { font-size: 14px; opacity: .85; }
    .pc-body { flex: 1; overflow-y: auto; padding: 12px 0; }
    .pc-center { display: flex; align-items: center; justify-content: center; padding: 16px; }
    .pc-card { background: #fff; border-radius: 20px; padding: 24px 20px; width: 100%; max-width: 400px; box-shadow: 0 4px 20px rgba(27,46,92,.10); }
    .pc-chatbg { background: #ECE5DD; }
    .pc-bubble {
      background: #fff; border-radius: 14px; padding: 10px 14px;
      max-width: 70%; font-size: 22px; font-weight: 600; line-height: 1.35;
      box-shadow: 0 1px 1px rgba(0,0,0,.08);
    }
    .pc-mine { background: #DCF8C6; }
    .pc-meta { font-size: 13px; font-weight: 400; color: #667781; text-align: right; margin-top: 3px; }
    .pc-tick { font-weight: 700; letter-spacing: -2px; }
    .pc-inputbar {
      display: flex; gap: 8px; align-items: flex-end;
      padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
      background: #F0F2F5; position: sticky; bottom: 0;
    }
    .pc-input {
      flex: 1; border: 0; border-radius: 26px; padding: 14px 18px;
      font-size: 22px; font-weight: 500; resize: none; outline: none; background: #fff;
      max-height: 130px;
    }
    .pc-send {
      width: 54px; height: 54px; border-radius: 50%; border: 0; flex-shrink: 0;
      background: #1B2E5C; color: #fff; font-size: 24px; cursor: pointer;
    }
    .pc-send:disabled { opacity: .5; }
    .pc-logout {
      width: 38px; height: 38px; border-radius: 50%; border: 0; flex-shrink: 0;
      background: rgba(255,255,255,.15); color: #fff; font-size: 18px; cursor: pointer;
    }
    .pc-logout:hover { background: rgba(255,255,255,.3); }
    .pc-img { border-radius: 10px; max-width: 100%; max-height: 260px; display: block; margin-bottom: 4px; }
    .pc-doc { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,.7); border-radius: 10px; padding: 8px 10px; margin-bottom: 4px; color: #1B2E5C; font-weight: 600; text-decoration: none; }
    .pc-plus { width: 54px; height: 54px; border-radius: 50%; border: 0; flex-shrink: 0; background: #fff; color: #1B2E5C; font-size: 24px; cursor: pointer; }
    /* FIXED position — sticky/keyboard kisi bhi haal me input ke upar dikhe */
    .pc-attmenu { position: fixed; bottom: 90px; left: 12px; background: #fff; border-radius: 16px; box-shadow: 0 6px 24px rgba(0,0,0,.25); padding: 14px; display: flex; gap: 18px; z-index: 50; }
    .pc-att { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: #4A5878; background: none; border: 0; cursor: pointer; }
    .pc-att-ico { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; color: #fff; }
    .pc-install {
      display: flex; align-items: center; gap: 8px;
      background: #FFF7E0; border-bottom: 1px solid #F5D77A;
      padding: 10px 12px; font-size: 14px;
    }
    .pc-install-btn {
      background: #1B2E5C; color: #fff; border: 0; border-radius: 8px;
      padding: 8px 14px; font-weight: 700; font-size: 14px; cursor: pointer; flex-shrink: 0;
    }
    .pc-install-x { background: none; border: 0; color: #888; font-size: 16px; cursor: pointer; flex-shrink: 0; }
  `]
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

  private sanitizer = inject(DomSanitizer);
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  attachOpen = signal(false);

  fileUrl(u: string) { return u.startsWith('http') ? u : environment.apiUrl + u; }

  linkify(body: string): SafeHtml {
    const esc = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = esc.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#2563EB;text-decoration:underline">$1</a>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  pickFile(kind: 'image' | 'doc') {
    this.attachOpen.set(false);
    const inp = this.fileInput.nativeElement;
    inp.accept = kind === 'image' ? 'image/jpeg,image/png,image/webp' : '.pdf,.doc,.docx,.xls,.xlsx';
    inp.value = '';
    inp.click();
  }

  fileChosen(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('token', this.token);
    fd.append('file', file);
    if (this.draft.trim()) { fd.append('body', this.draft.trim()); this.draft = ''; }
    this.busy.set(true);
    this.http.post(`${this.base}/attachment`, fd).subscribe({
      next: () => { this.busy.set(false); this.loadMsgs(); },
      error: (err) => { this.busy.set(false); alert('⚠️ ' + (err?.error?.error ?? 'File nahi gayi')); }
    });
  }

  sendLocation() {
    this.attachOpen.set(false);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const link = `https://maps.google.com/?q=${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
      this.http.post(`${this.base}/messages`, { token: this.token, body: `📍 Meri location: ${link}` }).subscribe({
        next: () => this.loadMsgs(), error: () => alert('⚠️ Location nahi gayi')
      });
    }, () => alert('⚠️ Location permission chahiye'), { enableHighAccuracy: true, timeout: 15000 });
  }

  // 📲 PWA install (Android Chrome ka beforeinstallprompt)
  installReady = signal(false);
  private installEvt: any = null;

  ngOnInit() {
    this.firmId = this.route.snapshot.paramMap.get('firmId') || '';

    // MOBILE FIT: kuch browsers (WhatsApp webview / desktop-mode) page ko chhota
    // desktop-size me dikhate hain → sab zoom-out lagta hai. Viewport zabardasti set karo
    // taaki page phone ki screen par 100% fit ho, bina zoom kiye.
    try {
      let vp = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
      if (!vp) {
        vp = document.createElement('meta');
        vp.name = 'viewport';
        document.head.appendChild(vp);
      }
      vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    } catch {}

    // Install banner — event app.component pehle hi pakad chuka hota hai (window.__pwaInstallEvt).
    // WhatsApp ke andar wale browser me ye event NAHI aata — tab bhi banner dikhao,
    // Install dabane par manual steps batayenge (Chrome me kholo → Add to Home screen).
    try {
      const alreadyApp = matchMedia('(display-mode: standalone)').matches;
      if (!sessionStorage.getItem('pchat_install_dismissed') && !alreadyApp) {
        const evt = (window as any).__pwaInstallEvt;
        if (evt) { this.installEvt = evt; }
        window.addEventListener('pwa-install-ready', () => { this.installEvt = (window as any).__pwaInstallEvt; });
        this.installReady.set(true);
      }
    } catch {}
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

  async installApp() {
    if (this.installEvt) {
      this.installEvt.prompt();
      try { await this.installEvt.userChoice; } catch {}
      this.installReady.set(false);
      this.installEvt = null;
      return;
    }
    // Event nahi mila (WhatsApp ka browser / iPhone) → manual steps
    alert('App install karne ke liye:\n\n1. Ye page CHROME me kholo (upar ⋮ menu → "Open in Chrome")\n2. Chrome me ⋮ menu → "Add to Home screen" / "Install app"\n\nBas — home screen par Vyapaar Setu aa jayega.');
  }

  dismissInstall() {
    this.installReady.set(false);
    try { sessionStorage.setItem('pchat_install_dismissed', '1'); } catch {}
  }

  // Logout — session token hatao, wapas number screen (dobara OTP lagega)
  logout() {
    if (!confirm('Logout karein? Dobara chat kholne ke liye OTP lagega.')) return;
    try { localStorage.removeItem('pchat_token_' + this.firmId); } catch {}
    this.token = '';
    this.otp = '';
    this.msgs.set([]);
    this.step.set('phone');
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
