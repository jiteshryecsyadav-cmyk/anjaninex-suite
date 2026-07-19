import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

// =============================================================================
// ANJANINEX SADMIN — Complaints queue + WhatsApp-style chat.
// Thread KHOLTE HI user ke messages read ho jaate hain -> user ko blue ✓✓.
// Admin ke apne replies par bhi tick: grey = bheja, blue = user ne padh liya.
// =============================================================================

interface AdminComplaintRow {
  id: string; subject: string; status: string; firmName: string;
  createdByName: string; createdAt: string; lastMsgAt: string; unread: number;
}
interface Msg {
  id: string; sender: 'user' | 'admin'; senderName: string;
  body: string | null; photoUrl: string | null; createdAt: string; readAt: string | null;
}

import { BackButtonComponent } from '../../../shared/back-button.component';
@Component({
  selector: 'app-admin-complaints',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, FormsModule, DatePipe],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <h1 class="font-display font-bold text-xl text-anjaninex-navy">📢 Complaints (saari firms)</h1>
        @if (view() === 'chat') {
          <button (click)="backToList()" class="px-3 py-1.5 border rounded-lg text-sm font-semibold">← Queue</button>
        }
      </div>

      <!-- ============ QUEUE ============ -->
      @if (view() === 'list') {
        <div class="flex gap-2 mb-3">
          @for (f of filters; track f.key) {
            <button (click)="setFilter(f.key)"
                    class="px-3 py-1.5 rounded-full text-xs font-bold border"
                    [class]="filter() === f.key ? 'bg-anjaninex-navy text-white border-anjaninex-navy' : 'bg-white text-gray-600'">
              {{ f.label }}
            </button>
          }
        </div>
        @if (loading()) { <div class="text-center text-gray-400 py-10">Load ho raha hai…</div> }
        @else if (rows().length === 0) {
          <div class="bg-white rounded-2xl p-10 text-center text-gray-400 border border-anjaninex-navy-soft">
            Koi complaint nahi 🎉
          </div>
        }
        @for (c of rows(); track c.id) {
          <button (click)="openThread(c.id)"
                  class="w-full text-left bg-white rounded-xl p-4 mb-2 border hover:shadow-md transition flex items-center gap-3"
                  [class.border-green-400]="c.unread > 0" [class.border-anjaninex-navy-soft]="c.unread === 0">
            <span class="text-xl">{{ c.status === 'resolved' ? '✅' : '📢' }}</span>
            <span class="flex-1 min-w-0">
              <span class="flex items-center gap-2">
                <span class="font-semibold text-sm text-anjaninex-navy truncate">{{ c.subject }}</span>
                @if (c.unread > 0) {
                  <span class="bg-green-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{{ c.unread }} unread</span>
                }
              </span>
              <span class="block text-xs text-gray-500">
                🏢 {{ c.firmName }} · 👤 {{ c.createdByName || '—' }} · {{ c.lastMsgAt | date:'dd MMM, HH:mm' }} ·
                <span [class]="c.status === 'resolved' ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'">
                  {{ c.status === 'resolved' ? 'Resolved' : 'Open' }}
                </span>
              </span>
            </span>
          </button>
        }
      }

      <!-- ============ CHAT ============ -->
      @if (view() === 'chat') {
        <div class="bg-white rounded-2xl border border-anjaninex-navy-soft flex flex-col" style="height: calc(100vh - 220px); min-height: 420px;">
          <div class="px-4 py-3 border-b border-anjaninex-navy-soft flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="font-bold text-sm text-anjaninex-navy truncate">{{ subject() }}</div>
              <div class="text-[11px] text-gray-400 truncate">🏢 {{ firmName() }} · 👤 {{ createdByName() || '—' }}</div>
            </div>
            <button (click)="toggleStatus()" [disabled]="busy()"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold shrink-0"
                    [class]="status() === 'resolved' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'">
              {{ status() === 'resolved' ? '↩ Reopen karo' : '✅ Resolve karo' }}
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-4" id="acScroll" style="background:#efe7dd;">
            @for (m of messages(); track m.id) {
              <div class="flex mb-2" [class.justify-end]="m.sender === 'admin'">
                <div class="max-w-[78%] rounded-xl px-3 py-2 shadow-sm text-sm"
                     [class]="m.sender === 'admin' ? 'bg-green-100 rounded-br-sm' : 'bg-white rounded-bl-sm'">
                  @if (m.sender === 'user') {
                    <div class="text-[10px] font-bold text-anjaninex-red mb-0.5">👤 {{ m.senderName || 'User' }}</div>
                  }
                  @if (m.photoUrl) {
                    <a [href]="apiUrl + m.photoUrl" target="_blank" rel="noopener">
                      <img [src]="apiUrl + m.photoUrl" class="rounded-lg max-h-48 mb-1 border">
                    </a>
                  }
                  @if (m.body) { <div class="whitespace-pre-wrap break-words text-gray-800">{{ m.body }}</div> }
                  <div class="flex items-center gap-1 justify-end mt-0.5">
                    <span class="text-[10px] text-gray-400">{{ m.createdAt | date:'dd MMM, HH:mm' }}</span>
                    @if (m.sender === 'admin') {
                      <span style="font-size:12px;font-weight:900;letter-spacing:-4px;padding-right:4px;line-height:1"
                            [style.color]="m.readAt ? '#34B7F1' : '#9ca3af'"
                            [title]="m.readAt ? 'User ne padh liya' : 'Deliver ho gaya'">✓✓</span>
                    }
                  </div>
                </div>
              </div>
            }
          </div>

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
                📎<input type="file" accept="image/*" (change)="onFile($event)" class="hidden">
              </label>
              <textarea [(ngModel)]="rMessage" rows="1"
                        class="flex-1 resize-none px-3 py-2 border rounded-lg text-sm outline-none"
                        placeholder="Reply likhein… (Shift+Enter = nayi line)" (keydown.enter)="onEnter($event)"></textarea>
              <button (click)="sendReply()" [disabled]="busy()"
                      class="px-4 py-2 bg-anjaninex-red text-white rounded-lg text-sm font-bold shrink-0">
                {{ busy() ? '…' : '➤' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class AdminComplaintsComponent implements OnDestroy {
  private http = inject(HttpClient);
  apiUrl = environment.apiUrl;

  filters = [
    { key: '', label: 'Sab' },
    { key: 'open', label: 'Open' },
    { key: 'resolved', label: 'Resolved' }
  ];
  filter = signal('');
  view = signal<'list' | 'chat'>('list');
  loading = signal(true);
  busy = signal(false);
  err = signal('');

  rows = signal<AdminComplaintRow[]>([]);
  currentId = signal<string | null>(null);
  subject = signal(''); status = signal('open');
  firmName = signal(''); createdByName = signal('');
  messages = signal<Msg[]>([]);
  private pollTimer: any = null;

  rMessage = '';
  rFile: File | null = null;
  rPreview = signal<string | null>(null);

  constructor() { this.loadList(); }
  ngOnDestroy() { this.stopPoll(); }

  setFilter(k: string) { this.filter.set(k); this.loadList(); }

  loadList() {
    this.loading.set(true);
    const q = this.filter() ? `?status=${this.filter()}` : '';
    this.http.get<AdminComplaintRow[]>(`${this.apiUrl}/api/admin/complaints${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  backToList() { this.stopPoll(); this.view.set('list'); this.loadList(); }

  openThread(id: string) {
    this.err.set(''); this.rMessage = ''; this.clearFile();
    this.currentId.set(id);
    this.view.set('chat');
    this.refreshThread(true);   // GET hi user-messages ko read mark karta hai -> user ko blue tick
    this.stopPoll();
    this.pollTimer = setInterval(() => this.refreshThread(false), 12_000);
  }

  private refreshThread(scroll: boolean) {
    const id = this.currentId();
    if (!id) return;
    this.http.get<any>(`${this.apiUrl}/api/admin/complaints/${id}/messages`).subscribe({
      next: t => {
        this.subject.set(t.subject); this.status.set(t.status);
        this.firmName.set(t.firmName); this.createdByName.set(t.createdByName);
        const prev = this.messages().length;
        this.messages.set(t.messages);
        if (scroll || t.messages.length !== prev) this.scrollToBottom();
      },
      error: () => {}
    });
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = document.getElementById('acScroll');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    if (!f) return;
    if (!f.type.startsWith('image/')) { this.err.set('Sirf image file allowed hai.'); return; }
    this.rFile = f;
    this.rPreview.set(URL.createObjectURL(f));
  }
  clearFile() { this.rFile = null; this.rPreview.set(null); }

  // Enter = bhejo, Shift+Enter = nayi line. Busy me double-send block.
  onEnter(e: Event) {
    const ke = e as KeyboardEvent;
    if (ke.shiftKey) return;
    ke.preventDefault();
    this.sendReply();
  }

  sendReply() {
    if (this.busy()) return;   // double-send guard
    this.err.set('');
    if (!this.rMessage.trim() && !this.rFile) return;
    const id = this.currentId();
    if (!id) return;
    const fd = new FormData();
    fd.append('message', this.rMessage.trim());
    if (this.rFile) fd.append('photo', this.rFile);
    this.busy.set(true);
    this.http.post(`${this.apiUrl}/api/admin/complaints/${id}/reply`, fd).subscribe({
      next: () => { this.busy.set(false); this.rMessage = ''; this.clearFile(); this.refreshThread(true); },
      error: e => { this.busy.set(false); this.err.set(e?.error?.error ?? 'Reply nahi gaya.'); }
    });
  }

  toggleStatus() {
    const id = this.currentId();
    if (!id) return;
    const next = this.status() === 'resolved' ? 'open' : 'resolved';
    this.busy.set(true);
    this.http.post(`${this.apiUrl}/api/admin/complaints/${id}/status`, { status: next }).subscribe({
      next: () => { this.busy.set(false); this.status.set(next); },
      error: e => { this.busy.set(false); this.err.set(e?.error?.error ?? 'Status nahi badla.'); }
    });
  }

  private stopPoll() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } }
}
