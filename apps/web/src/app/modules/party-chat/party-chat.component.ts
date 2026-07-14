import { Component, inject, signal } from '@angular/core';
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
          @if (threads().length === 0) {
            <div class="p-6 text-center text-gray-500 text-sm">Abhi koi chat nahi — "➕ Nayi chat" se shuru karo</div>
          }
          @for (t of threads(); track t.id) {
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
              <button (click)="shareLink()" class="text-xs font-bold border border-[#1B2E5C] text-[#1B2E5C] rounded px-3 py-1.5 hover:bg-purple-50">
                🔗 Chat link bhejo
              </button>
            </div>

            <div #scrollBox class="flex-1 overflow-y-auto p-4 space-y-2" style="max-height:55vh">
              @for (m of msgs(); track m.id) {
                <div class="flex" [class.justify-end]="m.sender === 'firm'">
                  <div class="rounded-2xl px-3 py-2 max-w-[75%] text-sm"
                       [class]="m.sender === 'firm' ? 'bg-[#DCF8C6]' : 'bg-gray-100'">
                    @if (m.sender === 'party') {
                      <div class="text-[10px] font-bold text-purple-700">{{ m.senderName || active()!.partyName }}</div>
                    }
                    <div class="whitespace-pre-wrap break-words">{{ m.body }}</div>
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

            <div class="p-3 border-t border-[#F0F0F0] flex gap-2">
              <textarea [(ngModel)]="draft" (keydown)="onEnter($event)" rows="1"
                        placeholder="Message likho… (Enter = send)"
                        class="input flex-1 resize-none"></textarea>
              <button (click)="send()" [disabled]="busy() || !draft.trim()" class="btn-primary">📤</button>
            </div>
          }
        </div>
      </div>

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
  styles: [`.cb-tick{font-weight:700;letter-spacing:-2px}`]
})
export class PartyChatComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private trading = inject(TradingService);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/api/party-chat`;

  threads = signal<PchatThread[]>([]);
  active = signal<PchatThread | null>(null);
  msgs = signal<PchatMsg[]>([]);
  busy = signal(false);
  draft = '';

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

  // Party ko WhatsApp se chat link bhejo — wo mobile+OTP se verify hoke reply karegi
  // Link hamesha vyaparsetu.anjaninex.com se jaye (public/branded domain)
  private static readonly PUBLIC_BASE = 'https://vyaparsetu.anjaninex.com';
  shareLink() {
    const t = this.active();
    if (!t) return;
    const firmId = this.auth.user()?.firmId;
    const link = `${PartyChatComponent.PUBLIC_BASE}/pchat/${firmId}`;
    const text = `Namaste ${t.partyName} ji,\nHumse seedha baat karne ke liye ye link kholein aur apna mobile number verify karein:\n${link}`;
    window.open(`https://wa.me/91${t.phone.slice(-10)}?text=${encodeURIComponent(text)}`, '_blank');
    navigator.clipboard?.writeText(link).then(() => this.toast.success('Link copy bhi ho gaya'));
  }
}
