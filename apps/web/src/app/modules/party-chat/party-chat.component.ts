import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import * as signalR from '@microsoft/signalr';
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
import { BackButtonComponent } from '../../shared/back-button.component';
@Component({
  selector: 'app-party-chat',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, FormsModule, DatePipe],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
    <div class="max-w-6xl mx-auto p-4">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 class="font-display font-black text-2xl text-[#1B2E5C]">💬 Party Chat</h2>
          <p class="text-sm text-gray-500">Apni parties se seedha baat — unhe login nahi chahiye, mobile OTP se khulti hai</p>
        </div>
        <div class="flex gap-2">
          <button (click)="openBroadcast()" class="btn-secondary">📢 Broadcast</button>
          <button (click)="openNew.set(true)" class="btn-primary">➕ Nayi chat</button>
        </div>
      </div>

      <!-- ===== BROADCAST — ek message, kai parties (WhatsApp broadcast jaisa) ===== -->
      @if (bcOpen()) {
        <div class="bc-overlay" (click)="bcOpen.set(false)">
          <div class="bc-box" (click)="$event.stopPropagation()">
            <div class="bc-head">
              <div>
                <div class="bc-title">📢 Broadcast</div>
                <div class="bc-sub">Har party ko uske ALAG chat me milega — kisi ko pata nahi chalega ki aur kisko bheja</div>
              </div>
              <button (click)="bcOpen.set(false)" class="bc-x">×</button>
            </div>

            <!-- Quick select -->
            <div class="bc-quick">
              <button (click)="bcPickType('buyer')" class="bc-chip">Sab Buyers</button>
              <button (click)="bcPickType('seller')" class="bc-chip">Sab Suppliers</button>
              <select [ngModel]="bcGroup()" (ngModelChange)="bcPickGroup($event)" class="bc-sel">
                <option value="">— Group se chuno —</option>
                @for (g of bcGroups(); track g) { <option [value]="g">{{ g }}</option> }
              </select>
              <button (click)="bcClear()" class="bc-chip bc-chip-clear">Clear</button>
            </div>

            <input [ngModel]="bcSearch()" (ngModelChange)="bcSearch.set($event)"
                   placeholder="🔍 Naam ya mobile no se dhoondo" class="input w-full mb-2">

            <div class="bc-count">
              Chuni hui: <b>{{ bcSelected().size }}</b> parties
              @if (bcSkippedInfo(); as n) { <span class="bc-warn"> · {{ n }} ka mobile nahi — unhe nahi jayega</span> }
            </div>

            <div class="bc-list">
              @for (p of bcShown(); track p.id) {
                <label class="bc-item">
                  <input type="checkbox" [checked]="bcSelected().has(p.id)" (change)="bcToggle(p.id)">
                  <span class="bc-item-txt">
                    <span class="bc-item-name">{{ p.displayName }}</span>
                    <span class="bc-item-sub">{{ p.phone || '⚠️ mobile nahi' }}@if (p.city) { <span> · {{ p.city }}</span> }</span>
                  </span>
                </label>
              }
              @if (bcShown().length === 0) {
                <div class="bc-empty">{{ bcSearch().trim() ? 'Koi party nahi mili' : 'Upar se chuno ya naam type karo' }}</div>
              }
            </div>

            <textarea [(ngModel)]="bcBody" rows="3" class="input w-full mt-2"
                      placeholder="Message likho — sabko yahi jayega"></textarea>

            @if (bcMsg()) { <div class="bc-result">{{ bcMsg() }}</div> }

            <div class="bc-foot">
              <button (click)="bcOpen.set(false)" class="btn-secondary flex-1">Cancel</button>
              <button (click)="sendBroadcast()" [disabled]="bcSending() || bcSelected().size === 0 || !bcBody.trim()"
                      class="btn-primary flex-1">
                {{ bcSending() ? 'Bhej rahe hain…' : '📤 ' + bcSelected().size + ' parties ko bhejo' }}
              </button>
            </div>
          </div>
        </div>
      }

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Threads -->
        <div class="bg-white rounded-xl border border-[#D6DDEA] overflow-hidden">
          <!-- 🔍 Search — naam ya number se -->
          <div class="p-2 border-b border-[#F0F0F0]">
            <input [(ngModel)]="searchQ" placeholder="🔍 Naam ya number khojo…" class="input w-full">
          </div>
          <!-- Scrollable thread list (up→down) -->
          <div class="overflow-y-auto" style="max-height:62vh">
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
              <div class="flex gap-2 items-center">
                @if (!selectMode()) {
                  <button (click)="startSelect()" class="text-xs font-bold border border-gray-400 text-gray-600 rounded px-3 py-1.5 hover:bg-gray-50"
                          title="Messages select karke delete karo">
                    ☑ Select
                  </button>
                  <button (click)="shareLink()" class="text-xs font-bold border border-[#1B2E5C] text-[#1B2E5C] rounded px-3 py-1.5 hover:bg-purple-50">
                    🔗 Chat link bhejo
                  </button>
                  <button (click)="deleteThread()" class="text-xs font-bold border border-red-600 text-red-600 rounded px-3 py-1.5 hover:bg-red-50"
                          title="Puri chat delete — wapas nahi aayegi">
                    🗑 Delete chat
                  </button>
                } @else {
                  <span class="text-sm font-bold text-[#1B2E5C]">{{ selected().size }} selected</span>
                  <button (click)="openDeleteSelected()" [disabled]="selected().size === 0"
                          class="text-xs font-bold bg-red-600 text-white rounded px-3 py-1.5 disabled:opacity-40">🗑 Delete</button>
                  <button (click)="cancelSelect()" class="text-xs font-bold border border-gray-400 text-gray-600 rounded px-3 py-1.5">✕ Cancel</button>
                }
              </div>
            </div>

            <div #scrollBox class="flex-1 overflow-y-auto p-4 space-y-2" style="max-height:55vh">
              @for (m of msgs(); track m.id) {
                <div class="flex group items-center" [class.justify-end]="m.sender === 'firm'"
                     [class.bg-blue-50]="selected().has(m.id)"
                     (click)="selectMode() && toggleSel(m)">
                  @if (selectMode()) {
                    <input type="checkbox" class="w-5 h-5 accent-[#1B2E5C] mx-2 shrink-0"
                           [checked]="selected().has(m.id)" (click)="$event.stopPropagation(); toggleSel(m)">
                  }
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

      <!-- WhatsApp jaisa delete dialog (selected messages ke liye): everyone / me / cancel -->
      @if (showDelDialog()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="showDelDialog.set(false)">
          <div class="bg-white rounded-2xl p-5 w-full max-w-xs" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-[#1B2E5C] mb-4">{{ selected().size }} message delete karein?</h3>
            <div class="flex flex-col gap-2 text-sm font-bold">
              @if (allSelectedMine()) {
                <button (click)="doDeleteSelected('everyone')" class="text-red-600 text-left px-2 py-2 rounded hover:bg-red-50">Delete for everyone</button>
              }
              <button (click)="doDeleteSelected('me')" class="text-[#1B2E5C] text-left px-2 py-2 rounded hover:bg-gray-50">Delete for me</button>
              <button (click)="showDelDialog.set(false)" class="text-gray-500 text-left px-2 py-2 rounded hover:bg-gray-50">Cancel</button>
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
    /* ===== Broadcast dialog ===== */
    .bc-overlay { position:fixed; inset:0; background:rgba(27,46,92,.55); z-index:1200;
      display:flex; align-items:center; justify-content:center; padding:16px; }
    .bc-box { background:#fff; border-radius:14px; width:100%; max-width:560px;
      padding:16px; box-shadow:0 20px 50px rgba(0,0,0,.25); max-height:90vh; overflow-y:auto; }
    .bc-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:12px; }
    .bc-title { font-weight:900; font-size:18px; color:#1B2E5C; }
    .bc-sub { font-size:11px; color:#6B7280; margin-top:2px; }
    .bc-x { border:none; background:none; font-size:26px; line-height:1; color:#9CA3AF; cursor:pointer; }
    .bc-quick { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
    .bc-chip { border:1px solid #ddd6fe; background:#ede9fe; color:#6D28D9; border-radius:999px;
      padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; }
    .bc-chip:hover { background:#ddd6fe; }
    .bc-chip-clear { border-color:#e5e7eb; background:#f9fafb; color:#6B7280; }
    .bc-sel { border:1px solid #D6DDEA; border-radius:999px; padding:5px 10px; font-size:12px; font-family:inherit; }
    .bc-count { font-size:12px; color:#374151; margin-bottom:6px; }
    .bc-warn { color:#B45309; }
    .bc-list { border:1px solid #eee; border-radius:10px; max-height:220px; overflow-y:auto; }
    .bc-item { display:flex; align-items:center; gap:9px; padding:7px 10px; cursor:pointer; }
    .bc-item:hover { background:#faf5ff; }
    .bc-item-txt { display:flex; flex-direction:column; }
    .bc-item-name { font-size:13px; font-weight:700; color:#1B2E5C; }
    .bc-item-sub { font-size:11px; color:#6B7280; }
    .bc-empty { padding:16px; text-align:center; color:#9CA3AF; font-size:12px; }
    .bc-result { margin-top:8px; font-size:12px; font-weight:700; color:#166534;
      background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px 10px; }
    .bc-foot { display:flex; gap:8px; margin-top:12px; }

    .cb-tick{font-weight:700;letter-spacing:-2px}
    .pc-att{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#4A5878;background:none;border:0;cursor:pointer}
    .pc-att-ico{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff}
  `]
})
export class PartyChatComponent {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);   // deep-link (?partyId=...) padhne ke liye
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

  // ===== BROADCAST — ek message, kai parties =====
  // Har party ko uske ALAG chat me jata hai (WhatsApp broadcast jaisa), group
  // chat nahi — isliye ek party ko doosri ka pata nahi chalta.
  bcOpen = signal(false);
  bcSearch = signal('');          // SIGNAL — plain hoti to computed update hi na hota
  bcSelected = signal<Set<string>>(new Set());
  bcGroup = signal('');
  bcBody = '';
  bcSending = signal(false);
  bcMsg = signal('');

  /** Group dropdown — parties me se unique group naam. */
  bcGroups = computed(() => [...new Set(
    this.parties.map((p: any) => (p.groupName || '').trim()).filter((g: string) => g))].sort());

  /** Search khali ho to chuni hui parties dikhao (taaki tick dikhe), warna match. */
  bcShown = computed(() => {
    const q = this.bcSearch().trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    if (!q) {
      const sel = this.bcSelected();
      return this.parties.filter((p: any) => sel.has(p.id)).slice(0, 200);
    }
    return this.parties.filter((p: any) =>
      (p.displayName || '').toLowerCase().includes(q) ||
      (digits && (p.phone || '').replace(/\D/g, '').includes(digits))
    ).slice(0, 200);
  });

  /** Kitni chuni hui parties ka mobile nahi hai — inhe bhej nahi payenge. */
  bcSkippedInfo = computed(() => {
    const sel = this.bcSelected();
    const n = this.parties.filter((p: any) => sel.has(p.id) &&
      (p.phone || '').replace(/\D/g, '').length < 10).length;
    return n > 0 ? n : null;
  });

  openBroadcast() {
    this.bcOpen.set(true);
    this.bcMsg.set('');
  }
  bcToggle(id: string) {
    const s = new Set(this.bcSelected());
    s.has(id) ? s.delete(id) : s.add(id);
    this.bcSelected.set(s);
  }
  bcClear() { this.bcSelected.set(new Set()); this.bcGroup.set(''); }

  /** Sab buyers / sab suppliers — 'both' wali dono me aati hain. */
  bcPickType(type: 'buyer' | 'seller') {
    const s = new Set(this.bcSelected());
    this.parties
      .filter((p: any) => p.partyType === type || p.partyType === 'both')
      .forEach((p: any) => s.add(p.id));
    this.bcSelected.set(s);
  }

  bcPickGroup(g: string) {
    this.bcGroup.set(g);
    if (!g) return;
    const s = new Set(this.bcSelected());
    this.parties.filter((p: any) => (p.groupName || '').trim() === g)
      .forEach((p: any) => s.add(p.id));
    this.bcSelected.set(s);
  }

  sendBroadcast() {
    const ids = [...this.bcSelected()];
    if (ids.length === 0 || !this.bcBody.trim()) return;
    this.bcSending.set(true);
    this.bcMsg.set('');
    this.http.post<any>(`${this.base}/broadcast`, { partyIds: ids, body: this.bcBody.trim() }).subscribe({
      next: (r) => {
        this.bcSending.set(false);
        // Jinka mobile nahi tha unke NAAM batate hain — chup-chaap chhodna galat
        // hoga (user samjhega sabko chala gaya).
        const skipped: string[] = r?.skipped || [];
        this.bcMsg.set(`✓ ${r?.sent ?? 0} parties ko bhej diya` +
          (skipped.length ? ` · ${skipped.length} chhoot gayi (mobile nahi): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}` : ''));
        this.bcBody = '';
        this.bcSelected.set(new Set());
        this.loadThreads();
      },
      error: (e) => {
        this.bcSending.set(false);
        this.bcMsg.set('⚠️ ' + (e?.error?.error ?? 'Broadcast nahi ho paya'));
      }
    });
  }

  // WhatsApp jaisa SELECTION delete — tick karo, fir everyone/me/cancel
  selectMode = signal(false);
  selected = signal<Set<string>>(new Set());
  showDelDialog = signal(false);

  startSelect() { this.selectMode.set(true); this.selected.set(new Set()); }
  cancelSelect() { this.selectMode.set(false); this.selected.set(new Set()); this.showDelDialog.set(false); }

  toggleSel(m: PchatMsg) {
    const s = new Set(this.selected());
    s.has(m.id) ? s.delete(m.id) : s.add(m.id);
    this.selected.set(s);
  }

  // "Everyone" tabhi jab SAARE selected apne bheje hue hon (WhatsApp rule)
  allSelectedMine(): boolean {
    const s = this.selected();
    return this.msgs().filter(m => s.has(m.id)).every(m => m.sender === 'firm');
  }

  openDeleteSelected() { if (this.selected().size > 0) this.showDelDialog.set(true); }

  doDeleteSelected(mode: 'everyone' | 'me') {
    const t = this.active();
    const ids = [...this.selected()];
    this.showDelDialog.set(false);
    if (!t || ids.length === 0) return;
    let done = 0;
    ids.forEach(id =>
      this.http.post(`${this.base}/messages/${id}/delete`, { mode }).subscribe({
        next: () => { if (++done === ids.length) { this.cancelSelect(); this.loadMsgs(t.id); } },
        error: () => { if (++done === ids.length) { this.cancelSelect(); this.loadMsgs(t.id); } }
      }));
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
  private hub?: signalR.HubConnection;

  ngOnInit() {
    this.loadThreads();
    this.trading.listParties().subscribe({
      next: (p: any) => {
        this.parties = p; this.filteredParties.set(p);
        // DEEP-LINK: /party-chat?partyId=X&msg=... — doosri screen se seedha us party
        // ka chat khul jaye (pehle yahan aakar list me se party dhoondni padti thi).
        const qp = this.route.snapshot.queryParamMap;
        const pid = qp.get('partyId');
        if (pid) {
          const party = this.parties.find((x: any) => x.id === pid);
          if (party) this.startChat(party, qp.get('msg') || undefined);
        }
      },
      error: () => {}
    });
    // Polling ab sirf BACKUP hai (live connection toot jaye to) — main rasta SignalR
    this.pollTimer = setInterval(() => {
      this.loadThreads();
      if (this.active()) this.loadMsgs(this.active()!.id);
    }, 30_000);
    this.startLive();
  }
  ngOnDestroy() {
    clearInterval(this.pollTimer);
    this.hub?.stop().catch(() => {});
  }

  // WhatsApp jaisa turant message — server push (SignalR)
  private startLive() {
    try {
      this.hub = new signalR.HubConnectionBuilder()
        .withUrl(`${environment.apiUrl}/api/hubs/party-chat`, {
          accessTokenFactory: () => this.auth.accessToken() ?? ''
        })
        .withAutomaticReconnect()
        .build();
      this.hub.on('newMessage', (threadId: string) => {
        this.loadThreads();
        if (this.active()?.id === threadId) this.loadMsgs(threadId);
      });
      this.hub.onreconnected(() => this.hub?.invoke('JoinFirm').catch(() => {}));
      this.hub.start()
        .then(() => this.hub?.invoke('JoinFirm'))
        .catch(() => { /* live nahi juda — 30s polling backup chalega */ });
    } catch { /* polling backup */ }
  }

  loadThreads() {
    this.http.get<PchatThread[]>(`${this.base}/threads`).subscribe({ next: t => this.threads.set(t), error: () => {} });
  }

  filterParties() {
    const q = this.partySearch.toLowerCase().trim();
    // Naam ke saath MOBILE NO se bhi — aksar naam ki spelling yaad nahi hoti
    // par number saamne hota hai.
    this.filteredParties.set(!q ? this.parties : this.parties.filter(p =>
      (p.displayName || '').toLowerCase().includes(q) ||
      (p.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || ' ')
    ));
  }

  /** prefill: deep-link se aaya message draft me bhar dete hain (bheja user hi karega). */
  startChat(p: any, prefill?: string) {
    this.http.post<any>(`${this.base}/start`, { partyId: p.id }).subscribe({
      next: (r) => {
        this.openNew.set(false);
        this.loadThreads();
        this.openThread({ id: r.threadId, partyName: r.partyName, phone: r.phone, lastMsgAt: '', unread: 0, lastBody: null });
        // Message apne aap NAHI bhejte — draft me daalte hain taaki user padh ke,
        // badal ke, khud bheje. (Galti se kuch chala jana bura hoga.)
        if (prefill) this.draft = prefill;
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
      next: m => {
        this.msgs.set(m);
        this.loadThreads();
        // Padh liya → sidebar badge turant update (WhatsApp jaisa)
        window.dispatchEvent(new Event('unread-refresh'));
      },
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
