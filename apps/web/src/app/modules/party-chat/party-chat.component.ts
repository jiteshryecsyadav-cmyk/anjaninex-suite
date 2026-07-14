import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { TradingService } from '../trading/services/trading.service';
import { ToastService } from '../../shared/toast.service';

interface PchatThread {
  id: string; partyName: string; phone: string;
  lastMsgAt: string; unread: number; lastBody: string | null;
}
interface PchatMsg {
  id: string; sender: 'firm' | 'party'; senderName: string | null;
  body: string; readAt: string | null; createdAt: string;
  attachmentUrl?: string | null; attachmentName?: string | null; attachmentType?: string | null;
}

/**
 * PARTY CHAT (firm side) — apni parties (buyer/supplier) se WhatsApp-jaisi chat.
 * Party ke paas login nahi hota: use link bhejo, wo mobile+OTP se verify hoke reply karti hai.
 * Feature flag 'party_chat' — pilot firms me hi sidebar me dikhta hai.
 */
@Component({
  selector: 'app-party-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="max-w-6xl mx-auto p-4">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 class="font-display font-black text-2xl text-[#1B2E5C]">💬 Party Chat</h2>
          <p class="text-sm text-gray-500">Apni parties se seedha baat — unhe login nahi chahiye, mobile OTP se khulti hai</p>
        </div>
        <button (click)="openNew.set(true)" class="btn-primary">➕ Nayi chat</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Threads -->
        <div class="bg-white rounded-xl border border-[#D6DDEA] overflow-hidden">
          <!-- 🔍 Search — naam ya number se -->
          <div class="p-2 border-b border-[#F0F0F0]">
            <input [(ngModel)]="searchQ" placeholder="🔍 Naam ya number khojo…" class="input w-full">
          </div>
          @if (filteredThreads().length === 0) {
            <div class="p-6 text-center text-gray-500 text-sm">{{ searchQ ? 'Kuch nahi mila' : 'Abhi koi chat nahi — "➕ Nayi chat" se shuru karo' }}</div>
          }
          @for (t of filteredThreads(); track t.id) {
            <button (click)="openThread(t)"
                    class="w-full text-left px-4 py-3 border-b border-[#F0F0F0] hover:bg-[#FAF7F0]"
                    [class.bg-purple-50]="active()?.id === t.id">
              <div class="flex justify-between items-center">
                <span class="font-bold text-[#1B2E5C]">{{ t.partyName }}</span>
                @if (t.unread > 0) {
                  <span class="text-[10px] font-black bg-green-600 text-white rounded-full px-2 py-0.5">{{ t.unread }}</span>
                }
              </div>
              <div class="text-xs text-gray-500 truncate">{{ t.lastBody || '📱 ' + t.phone }}</div>
              <div class="text-[10px] text-gray-400">{{ t.lastMsgAt | date:'dd/MM/yy h:mm a' }}</div>
            </button>
          }
        </div>

        <!-- Chat pane -->
        <div class="md:col-span-2 bg-white rounded-xl border border-[#D6DDEA] flex flex-col" style="min-height:60vh">
          @if (!active()) {
            <div class="flex-1 flex items-center justify-center text-gray-400 text-sm">Chat chuno ya nayi shuru karo</div>
          } @else {
            <div class="px-4 py-3 border-b border-[#F0F0F0] flex items-center justify-between flex-wrap gap-2">
              <div>
                <div class="font-bold text-[#1B2E5C]">{{ active()!.partyName }}</div>
                <div class="text-xs text-gray-500">📱 {{ active()!.phone }}</div>
              </div>
              <div class="flex gap-2">
                <button (click)="shareLink()" class="text-xs font-bold border border-[#1B2E5C] text-[#1B2E5C] rounded px-3 py-1.5 hover:bg-purple-50">
                  🔗 Chat link bhejo
                </button>
                <button (click)="deleteThread()" class="text-xs font-bold border border-red-600 text-red-600 rounded px-3 py-1.5 hover:bg-red-50"
                        title="Puri chat delete — wapas nahi aayegi">
                  🗑 Delete chat
                </button>
              </div>
            </div>

            <div #scrollBox class="flex-1 overflow-y-auto p-4 space-y-2" style="max-height:55vh">
              @for (m of msgs(); track m.id) {
                <div class="flex group" [class.justify-end]="m.sender === 'firm'">
                  <button (click)="delMsg.set(m)" title="Delete"
                          class="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs self-center mx-1">🗑</button>
                  <div class="rounded-2xl px-3 py-2 max-w-[75%] text-sm"
                       [class]="m.sender === 'firm' ? 'bg-[#DCF8C6]' : 'bg-gray-100'">
                    @if (m.sender === 'party') {
                      <div class="text-[10px] font-bold text-purple-700">{{ m.senderName || active()!.partyName }}</div>
                    }
                    @if (m.attachmentType === 'image') {
                      <a [href]="fileUrl(m.attachmentUrl!)" target="_blank">
                        <img [src]="fileUrl(m.attachmentUrl!)" class="rounded-lg max-w-full max-h-64 mb-1" alt="photo">
                      </a>
                    } @else if (m.attachmentType === 'document') {
                      <a [href]="fileUrl(m.attachmentUrl!)" target="_blank"
                         class="flex items-center gap-2 bg-white/70 rounded-lg px-2 py-2 mb-1 no-underline text-[#1B2E5C] font-semibold">
                        📄 {{ m.attachmentName || 'Document' }}
                      </a>
                    }
                    @if (m.body) { <div class="whitespace-pre-wrap break-words" [innerHTML]="linkify(m.body)"></div> }
                    <div class="text-[10px] text-gray-500 text-right mt-0.5">
                      {{ m.createdAt | date:'h:mm a' }}
                      @if (m.sender === 'firm') {
                        <span class="cb-tick" [style.color]="m.readAt ? '#34B7F1' : '#9ca3af'">✓✓</span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>

            <div class="p-3 border-t border-[#F0F0F0] flex gap-2 items-end relative">
              <!-- ➕ attach menu (WhatsApp jaisa) -->
              @if (attachOpen()) {
                <div class="absolute bottom-16 left-3 bg-white rounded-xl shadow-lg border border-[#D6DDEA] p-2 z-20 flex gap-3 flex-wrap">
                  <button (click)="pickFile('camera')" class="pc-att"><span class="pc-att-ico" style="background:#DC2626">📷</span>Camera</button>
                  <button (click)="pickFile('gallery')" class="pc-att"><span class="pc-att-ico" style="background:#7C3AED">🖼️</span>Gallery</button>
                  <button (click)="pickFile('doc')" class="pc-att"><span class="pc-att-ico" style="background:#2563EB">📄</span>Document</button>
                  <button (click)="sendLocation()" class="pc-att"><span class="pc-att-ico" style="background:#059669">📍</span>Location</button>
                  <button (click)="sendContact()" class="pc-att"><span class="pc-att-ico" style="background:#0EA5E9">👤</span>Contact</button>
                </div>
              }
              <button (click)="attachOpen.set(!attachOpen())" class="text-2xl px-2 text-[#1B2E5C]" title="Attach">➕</button>
              <input #fileInput type="file" class="hidden" (change)="fileChosen($event)">
              <textarea [(ngModel)]="draft" (keydown)="onEnter($event)" rows="1"
                        placeholder="Message likho… (Enter = send)"
                        class="input flex-1 resize-none"></textarea>
              <button (click)="send()" [disabled]="busy() || !draft.trim()" class="btn-primary">📤</button>
            </div>
          }
        </div>
      </div>

      <!-- WhatsApp jaisa delete dialog: everyone / me / cancel -->
      @if (delMsg(); as dm) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="delMsg.set(null)">
          <div class="bg-white rounded-2xl p-5 w-full max-w-xs" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-[#1B2E5C] mb-4">Message delete karein?</h3>
            <div class="flex flex-col gap-2 text-sm font-bold">
              @if (dm.sender === 'firm') {
                <button (click)="doDelete('everyone')" class="text-red-600 text-left px-2 py-2 rounded hover:bg-red-50">Delete for everyone</button>
              }
              <button (click)="doDelete('me')" class="text-[#1B2E5C] text-left px-2 py-2 rounded hover:bg-gray-50">Delete for me</button>
              <button (click)="delMsg.set(null)" class="text-gray-500 text-left px-2 py-2 rounded hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      }

      <!-- New chat modal: party chuno -->
      @if (openNew()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="openNew.set(false)">
          <div class="bg-white rounded-2xl p-5 w-full max-w-md" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-[#1B2E5C] mb-3">➕ Kis party se baat karni hai?</h3>
            <input [(ngModel)]="partySearch" (input)="filterParties()" placeholder="🔍 Party ka naam…" class="input mb-2">
            <div class="max-h-72 overflow-y-auto">
              @for (p of filteredParties(); track p.id) {
                <button (click)="startChat(p)" class="w-full text-left px-3 py-2 rounded hover:bg-[#FAF7F0] text-sm">
                  <b>{{ p.displayName }}</b>
                  <span class="text-xs text-gray-500 ml-2">{{ p.phonePrimary || 'phone nahi' }}</span>
                </button>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cb-tick{font-weight:700;letter-spacing:-2px}
    .pc-att{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#4A5878;background:none;border:0;cursor:pointer}
    .pc-att-ico{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff}
  `]
})
export class PartyChatComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private trading = inject(TradingService);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/api/party-chat`;

  private sanitizer = inject(DomSanitizer);
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  threads = signal<PchatThread[]>([]);
  active = signal<PchatThread | null>(null);
  msgs = signal<PchatMsg[]>([]);
  busy = signal(false);
  draft = '';
  attachOpen = signal(false);

  // Attachment URL relative aata hai (/api/...) — poora banao
  fileUrl(u: string) { return u.startsWith('http') ? u : environment.apiUrl + u; }

  // Body me links clickable — CACHED! Har render par naya object banane se
  // change-detection ka anant loop banta tha (Page Unresponsive bug).
  private linkCache = new Map<string, SafeHtml>();
  linkify(body: string): SafeHtml {
    let v = this.linkCache.get(body);
    if (!v) {
      const esc = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = esc.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#2563EB;text-decoration:underline">$1</a>');
      v = this.sanitizer.bypassSecurityTrustHtml(html);
      this.linkCache.set(body, v);
    }
    return v;
  }

  pickFile(kind: 'camera' | 'gallery' | 'doc') {
    this.attachOpen.set(false);
    const inp = this.fileInput.nativeElement;
    inp.accept = kind === 'doc' ? '.pdf,.doc,.docx,.xls,.xlsx' : 'image/jpeg,image/png,image/webp';
    if (kind === 'camera') inp.setAttribute('capture', 'environment');   // mobile par seedha camera
    else inp.removeAttribute('capture');
    inp.value = '';
    inp.click();
  }

  // 👤 Contact bhejo — naam + number puchh ke text message
  sendContact() {
    this.attachOpen.set(false);
    const t = this.active();
    if (!t) return;
    const name = prompt('Kiska contact bhejna hai? Naam:');
    if (!name?.trim()) return;
    const num = prompt(`${name.trim()} ka mobile number:`);
    if (!num?.trim()) return;
    this.http.post(`${this.base}/threads/${t.id}/messages`, { body: `👤 Contact: ${name.trim()} — ${num.trim()}` }).subscribe({
      next: () => this.loadMsgs(t.id), error: () => alert('⚠️ Contact nahi gaya')
    });
  }

  // Threads search — naam ya number se
  searchQ = '';
  filteredThreads(): PchatThread[] {
    const q = this.searchQ.toLowerCase().trim();
    if (!q) return this.threads();
    return this.threads().filter(t => t.partyName.toLowerCase().includes(q) || t.phone.includes(q));
  }

  // WhatsApp jaisa delete dialog
  delMsg = signal<PchatMsg | null>(null);
  doDelete(mode: 'everyone' | 'me') {
    const m = this.delMsg();
    const t = this.active();
    this.delMsg.set(null);
    if (!m || !t) return;
    this.http.post(`${this.base}/messages/${m.id}/delete`, { mode }).subscribe({
      next: () => this.loadMsgs(t.id),
      error: (e) => alert('⚠️ ' + (e?.error?.error ?? 'Delete nahi hua'))
    });
  }

  fileChosen(e: Event) {
    const t = this.active();
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!t || !file) return;
    const fd = new FormData();
    fd.append('file', file);
    if (this.draft.trim()) { fd.append('body', this.draft.trim()); this.draft = ''; }
    this.busy.set(true);
    this.http.post(`${this.base}/threads/${t.id}/attachment`, fd).subscribe({
      next: () => { this.busy.set(false); this.loadMsgs(t.id); },
      error: (err) => { this.busy.set(false); alert('⚠️ ' + (err?.error?.error ?? 'File nahi gayi')); }
    });
  }

  sendLocation() {
    this.attachOpen.set(false);
    const t = this.active();
    if (!t || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const link = `https://maps.google.com/?q=${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
      this.http.post(`${this.base}/threads/${t.id}/messages`, { body: `📍 Meri location: ${link}` }).subscribe({
        next: () => this.loadMsgs(t.id), error: () => alert('⚠️ Location nahi gayi')
      });
    }, () => alert('⚠️ Location permission chahiye'), { enableHighAccuracy: true, timeout: 15000 });
  }

  openNew = signal(false);
  parties: any[] = [];
  filteredParties = signal<any[]>([]);
  partySearch = '';

  private pollTimer: any;

  ngOnInit() {
    this.loadThreads();
    this.trading.listParties().subscribe({ next: (p: any) => { this.parties = p; this.filteredParties.set(p); }, error: () => {} });
    this.pollTimer = setInterval(() => {
      this.loadThreads();
      if (this.active()) this.loadMsgs(this.active()!.id);
    }, 10_000);
  }
  ngOnDestroy() { clearInterval(this.pollTimer); }

  loadThreads() {
    this.http.get<PchatThread[]>(`${this.base}/threads`).subscribe({ next: t => this.threads.set(t), error: () => {} });
  }

  filterParties() {
    const q = this.partySearch.toLowerCase().trim();
    this.filteredParties.set(!q ? this.parties : this.parties.filter(p => (p.displayName || '').toLowerCase().includes(q)));
  }

  startChat(p: any) {
    this.http.post<any>(`${this.base}/start`, { partyId: p.id }).subscribe({
      next: (r) => {
        this.openNew.set(false);
        this.loadThreads();
        this.openThread({ id: r.threadId, partyName: r.partyName, phone: r.phone, lastMsgAt: '', unread: 0, lastBody: null });
      },
      error: (e) => alert('⚠️ ' + (e?.error?.error ?? 'Chat start nahi hui'))
    });
  }

  openThread(t: PchatThread) {
    this.active.set(t);
    this.loadMsgs(t.id);
  }

  loadMsgs(threadId: string) {
    this.http.get<PchatMsg[]>(`${this.base}/threads/${threadId}/messages`).subscribe({
      next: m => { this.msgs.set(m); this.loadThreads(); },
      error: () => {}
    });
  }

  onEnter(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }

  send() {
    const t = this.active();
    const body = this.draft.trim();
    if (!t || !body || this.busy()) return;
    this.busy.set(true);
    this.http.post(`${this.base}/threads/${t.id}/messages`, { body }).subscribe({
      next: () => { this.busy.set(false); this.draft = ''; this.loadMsgs(t.id); },
      error: (e) => { this.busy.set(false); alert('⚠️ ' + (e?.error?.error ?? 'Message nahi gaya')); }
    });
  }

  // Puri chat delete — saare messages + party ka session bhi khatam (wapas nahi aata)
  deleteThread() {
    const t = this.active();
    if (!t) return;
    if (!confirm(`"${t.partyName}" ki PURI chat delete karein?\nSaare messages hamesha ke liye chale jayenge — wapas nahi aayenge.`)) return;
    this.http.delete(`${this.base}/threads/${t.id}`).subscribe({
      next: () => {
        this.active.set(null);
        this.msgs.set([]);
        this.loadThreads();
        this.toast.success('Chat delete ho gayi');
      },
      error: (e) => alert('⚠️ ' + (e?.error?.error ?? 'Delete nahi hui'))
    });
  }

  // Party ko WhatsApp se chat link bhejo — wo mobile+OTP se verify hoke reply karegi
  // Link hamesha vyaparsetu.anjaninex.com se jaye (public/branded domain)
  private static readonly PUBLIC_BASE = 'https://vyaparsetu.anjaninex.com';
  shareLink() {
    const t = this.active();
    if (!t) return;
    const firmId = this.auth.user()?.firmId;
    const link = `${PartyChatComponent.PUBLIC_BASE}/pchat/${firmId}`;
    const text = `Namaste ${t.partyName} ji,\nHumse seedha baat karne ke liye ye link *Chrome me* kholein aur apna mobile number verify karein:\n${link}\n\n📲 Upar "App install karo" ka option aaye to install kar lein — agli baar ek tap me chat khulegi.`;
    window.open(`https://wa.me/91${t.phone.slice(-10)}?text=${encodeURIComponent(text)}`, '_blank');
    navigator.clipboard?.writeText(link).then(() => this.toast.success('Link copy bhi ho gaya'));
  }
}
