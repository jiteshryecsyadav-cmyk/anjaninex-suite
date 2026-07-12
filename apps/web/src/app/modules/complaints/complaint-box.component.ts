import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// =============================================================================
// COMPLAINT BOX (user side) — Anjaninex ko complaint bhejo, WhatsApp jaisi chat.
// Ticks (apne message par):
//   ✓✓ grey = deliver ho gaya (server par save)
//   ✓✓ blue = Anjaninex sadmin ne padh liya (read_at set)
// Thread khula ho to har 12s poll — admin reply / blue tick live update.
// =============================================================================

interface ComplaintRow {
  id: string; subject: string; status: string;
  createdAt: string; lastMsgAt: string; unread: number; allRead: boolean;
}
interface Msg {
  id: string; sender: 'user' | 'admin'; senderName: string;
  body: string | null; photoUrl: string | null; createdAt: string; readAt: string | null;
}

@Component({
  selector: 'app-complaint-box',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <h1 class="font-display font-bold text-xl text-anjaninex-navy">📢 Complaint Box</h1>
        @if (view() === 'list') {
          <button (click)="openNew()" class="cb-btn">+ Nayi Complaint</button>
        } @else {
          <button (click)="backToList()" class="px-3 py-1.5 border rounded-lg text-sm font-semibold">← Wapas</button>
        }
      </div>

      <!-- ============ LIST VIEW ============ -->
      @if (view() === 'list') {
        <p class="text-sm text-gray-500 mb-3">Koi problem ya sujhav? Seedha Anjaninex team ko bhejein — ✓✓ blue matlab padh liya gaya.</p>
        @if (loading()) { <div class="text-center text-gray-400 py-10">Load ho raha hai…</div> }
        @else if (complaints().length === 0) {
          <div class="bg-white rounded-2xl p-10 text-center text-gray-400 border border-anjaninex-navy-soft">
            Abhi koi complaint nahi. Upar "+ Nayi Complaint" se shuru karein.
          </div>
        }
        @for (c of complaints(); track c.id) {
          <button (click)="openThread(c.id)"
                  class="w-full text-left bg-white rounded-xl p-4 mb-2 border border-anjaninex-navy-soft hover:shadow-md transition flex items-center gap-3">
            <span class="text-xl">{{ c.status === 'resolved' ? '✅' : '📢' }}</span>
            <span class="flex-1 min-w-0">
              <span class="flex items-center gap-2">
                <span class="font-semibold text-sm text-anjaninex-navy truncate">{{ c.subject }}</span>
                @if (c.unread > 0) {
                  <span class="bg-green-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{{ c.unread }} naya</span>
                }
              </span>
              <span class="block text-xs text-gray-400">
                {{ c.lastMsgAt | date:'dd MMM, HH:mm' }} ·
                <span [class]="c.status === 'resolved' ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'">
                  {{ c.status === 'resolved' ? 'Resolved' : 'Open' }}
                </span>
              </span>
            </span>
            <!-- List me tick: sab messages admin ne padhe? -->
            <span class="cb-tick" [style.color]="c.allRead ? '#34B7F1' : '#9ca3af'"
                  [title]="c.allRead ? 'Anjaninex ne padh liya' : 'Deliver ho gaya'">✓✓</span>
          </button>
        }
      }

      <!-- ============ NEW COMPLAINT ============ -->
      @if (view() === 'new') {
        <div class="bg-white rounded-2xl p-6 border border-anjaninex-navy-soft max-w-xl">
          <label class="cb-lbl">Subject (kya problem hai?)</label>
          <input [(ngModel)]="nSubject" class="cb-input" placeholder="Jaise: Bill print nahi ho raha">
          <label class="cb-lbl">Detail me likhein</label>
          <textarea [(ngModel)]="nMessage" rows="4" class="cb-input" placeholder="Puri baat likhein…"></textarea>
          <label class="cb-lbl">Photo / Screenshot (optional)</label>
          <input type="file" accept="image/*" (change)="onFile($event, 'new')" class="text-sm">
          @if (nPreview()) { <img [src]="nPreview()" class="mt-2 max-h-40 rounded-lg border"> }
          @if (err()) { <p class="text-red-600 text-sm mt-2">{{ err() }}</p> }
          <div class="flex justify-end gap-2 mt-4">
            <button (click)="backToList()" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
            <button (click)="submitNew()" [disabled]="busy()" class="cb-btn">{{ busy() ? 'Bhej rahe…' : '📤 Bhejo' }}</button>
          </div>
        </div>
      }

      <!-- ============ CHAT VIEW ============ -->
      @if (view() === 'chat') {
        <div class="bg-white rounded-2xl border border-anjaninex-navy-soft flex flex-col" style="height: calc(100vh - 220px); min-height: 420px;">
          <!-- header -->
          <div class="px-4 py-3 border-b border-anjaninex-navy-soft flex items-center justify-between">
            <div>
              <div class="font-bold text-sm text-anjaninex-navy">{{ subject() }}</div>
              <div class="text-[11px] text-gray-400">Anjaninex Team ·
                <span [class]="status() === 'resolved' ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'">
                  {{ status() === 'resolved' ? 'Resolved ✅' : 'Open' }}
                </span>
              </div>
            </div>
          </div>

          <!-- messages -->
          <div #scrollBox class="flex-1 overflow-y-auto p-4 cb-chat-bg" id="cbScroll">
            @for (m of messages(); track m.id) {
              <div class="flex mb-2" [class.justify-end]="m.sender === 'user'">
                <div class="max-w-[78%] rounded-xl px-3 py-2 shadow-sm text-sm"
                     [class]="m.sender === 'user' ? 'bg-green-100 rounded-br-sm' : 'bg-white rounded-bl-sm'">
                  @if (m.sender === 'admin') {
                    <div class="text-[10px] font-bold text-anjaninex-red mb-0.5">🛡️ Anjaninex Team</div>
                  }
                  @if (m.photoUrl) {
                    <a [href]="apiUrl + m.photoUrl" target="_blank" rel="noopener">
                      <img [src]="apiUrl + m.photoUrl" class="rounded-lg max-h-48 mb-1 border">
                    </a>
                  }
                  @if (m.body) { <div class="whitespace-pre-wrap break-words text-gray-800">{{ m.body }}</div> }
                  <div class="flex items-center gap-1 justify-end mt-0.5">
                    <span class="text-[10px] text-gray-400">{{ m.createdAt | date:'dd MMM, HH:mm' }}</span>
                    <!-- WhatsApp jaisa tick — sirf apne bheje message par -->
                    @if (m.sender === 'user') {
                      <span class="cb-tick" [style.color]="m.readAt ? '#34B7F1' : '#9ca3af'"
                            [title]="m.readAt ? 'Anjaninex ne padh liya' : 'Deliver ho gaya'">✓✓</span>
                    }
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- composer -->
          <div class="border-t border-anjaninex-navy-soft p-3">
            @if (rPreview()) {
              <div class="flex items-center gap-2 mb-2">
                <img [src]="rPreview()" class="h-14 rounded border">
                <button (click)="clearFile()" class="text-xs text-red-500 font-semibold">✕ Hatao</button>
              </div>
            }
            @if (err()) { <p class="text-red-600 text-xs mb-1">{{ err() }}</p> }
            <div class="flex items-end gap-2">
              <label class="cursor-pointer p-2 hover:bg-gray-100 rounded-lg" title="Photo attach karo">
                📎<input type="file" accept="image/*" (change)="onFile($event, 'reply')" class="hidden">
              </label>
              <textarea [(ngModel)]="rMessage" rows="1" class="cb-input !mt-0 flex-1 resize-none"
                        placeholder="Message likhein… (Shift+Enter = nayi line)" (keydown.enter)="onEnter($event)"></textarea>
              <button (click)="sendReply()" [disabled]="busy()" class="cb-btn shrink-0">{{ busy() ? '…' : '➤' }}</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cb-lbl { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; margin:10px 0 4px; color:#6b7280; }
    .cb-input { width:100%; padding:8px 10px; border:1.5px solid #d8dbe8; border-radius:8px; font-size:13px; outline:none; background:#fafaff; }
    .cb-btn { padding:8px 16px; background:var(--anjaninex-red, #c0392b); color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; }
    .cb-btn:disabled { opacity:.5; }
    .cb-chat-bg { background:#efe7dd; } /* WhatsApp jaisa halka background */
    /* WhatsApp jaisa double tick — grey = delivered, blue = padh liya */
    .cb-tick { font-size:12px; font-weight:900; letter-spacing:-4px; padding-right:4px; line-height:1; }
  `]
})
export class ComplaintBoxComponent implements OnDestroy {
  private http = inject(HttpClient);
  apiUrl = environment.apiUrl;

  view = signal<'list' | 'new' | 'chat'>('list');
  loading = signal(true);
  busy = signal(false);
  err = signal('');

  complaints = signal<ComplaintRow[]>([]);
  // chat state
  currentId = signal<string | null>(null);
  subject = signal('');
  status = signal('open');
  messages = signal<Msg[]>([]);
  private pollTimer: any = null;

  // new complaint form
  nSubject = ''; nMessage = '';
  nFile: File | null = null;
  nPreview = signal<string | null>(null);
  // reply composer
  rMessage = '';
  rFile: File | null = null;
  rPreview = signal<string | null>(null);

  constructor() { this.loadList(); }
  ngOnDestroy() { this.stopPoll(); }

  loadList() {
    this.loading.set(true);
    this.http.get<ComplaintRow[]>(`${this.apiUrl}/api/complaints`).subscribe({
      next: c => { this.complaints.set(c); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  openNew() { this.err.set(''); this.nSubject = ''; this.nMessage = ''; this.clearNewFile(); this.view.set('new'); }
  backToList() { this.stopPoll(); this.view.set('list'); this.loadList(); }

  onFile(e: Event, target: 'new' | 'reply') {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    if (!f) return;
    if (!f.type.startsWith('image/')) { this.err.set('Sirf image file allowed hai.'); return; }
    const url = URL.createObjectURL(f);
    if (target === 'new') { this.nFile = f; this.nPreview.set(url); }
    else { this.rFile = f; this.rPreview.set(url); }
  }
  clearNewFile() { this.nFile = null; this.nPreview.set(null); }
  clearFile() { this.rFile = null; this.rPreview.set(null); }

  submitNew() {
    this.err.set('');
    if (this.nSubject.trim().length < 3) { this.err.set('Subject kam se kam 3 akshar ka likhein.'); return; }
    if (!this.nMessage.trim() && !this.nFile) { this.err.set('Message ya photo — kuch to bhejein.'); return; }
    const fd = new FormData();
    fd.append('subject', this.nSubject.trim());
    fd.append('message', this.nMessage.trim());
    if (this.nFile) fd.append('photo', this.nFile);
    this.busy.set(true);
    this.http.post<{ id: string }>(`${this.apiUrl}/api/complaints`, fd).subscribe({
      next: r => { this.busy.set(false); this.openThread(r.id); },
      error: e => { this.busy.set(false); this.err.set(e?.error?.error ?? 'Bhej nahi paye. Dobara koshish karein.'); }
    });
  }

  openThread(id: string) {
    this.err.set(''); this.rMessage = ''; this.clearFile();
    this.currentId.set(id);
    this.view.set('chat');
    this.refreshThread(true);
    this.stopPoll();
    // Live feel: admin reply / blue tick har 12s check.
    this.pollTimer = setInterval(() => this.refreshThread(false), 12_000);
  }

  private refreshThread(scroll: boolean) {
    const id = this.currentId();
    if (!id) return;
    this.http.get<any>(`${this.apiUrl}/api/complaints/${id}/messages`).subscribe({
      next: t => {
        this.subject.set(t.subject); this.status.set(t.status);
        const prev = this.messages().length;
        this.messages.set(t.messages);
        if (scroll || t.messages.length !== prev) this.scrollToBottom();
      },
      error: () => {}
    });
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = document.getElementById('cbScroll');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  // Enter = bhejo, Shift+Enter = nayi line. Busy me double-send block.
  onEnter(e: Event) {
    const ke = e as KeyboardEvent;
    if (ke.shiftKey) return;
    ke.preventDefault();
    this.sendReply();
  }

  sendReply() {
    if (this.busy()) return;   // double-send guard (fast Enter x2)
    this.err.set('');
    if (!this.rMessage.trim() && !this.rFile) return;
    const id = this.currentId();
    if (!id) return;
    const fd = new FormData();
    fd.append('message', this.rMessage.trim());
    if (this.rFile) fd.append('photo', this.rFile);
    this.busy.set(true);
    this.http.post(`${this.apiUrl}/api/complaints/${id}/messages`, fd).subscribe({
      next: () => { this.busy.set(false); this.rMessage = ''; this.clearFile(); this.refreshThread(true); },
      error: e => { this.busy.set(false); this.err.set(e?.error?.error ?? 'Message nahi gaya.'); }
    });
  }

  private stopPoll() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } }
}
