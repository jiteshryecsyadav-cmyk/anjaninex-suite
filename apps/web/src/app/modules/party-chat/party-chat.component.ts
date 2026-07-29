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
  // Reply ka quote — jis message ka jawab hai uska hissa (wo delete ho jaye to null)
  replyBody?: string | null; replySender?: 'firm' | 'party' | null; replySenderName?: string | null;
}

/**
 * PARTY CHAT (firm side) — apni parties (buyer/supplier) se WhatsApp-jaisi chat.
 * Party ke paas login nahi hota: use link bhejo, wo mobile+OTP se verify hoke reply karti hai.
 * Feature flag 'party_chat' — pilot firms me hi sidebar me dikhta hai.
 */
import { BackButtonComponent } from '../../shared/back-button.component';
import { PhotoLightboxComponent } from '../../shared/photo-lightbox.component';
@Component({
  selector: 'app-party-chat',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, FormsModule, DatePipe, PhotoLightboxComponent],
  template: `
    <!-- Photo zoom lightbox — kisi bhi photo par click karke kholo -->
    <app-photo-lightbox #lb></app-photo-lightbox>
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
                  <!-- Jab tak WhatsApp-OTP provider band hai: party ka OTP yahan dekh kar
                       phone par bata do (party ki screen par OTP dikhana suraksha ke liye band) -->
                  <button (click)="showPartyOtp()" class="text-xs font-bold border border-amber-500 text-amber-700 rounded px-3 py-1.5 hover:bg-amber-50"
                          title="Party ne abhi OTP manga ho to yahan dikhega — use phone par bata dein">
                    🔑 OTP dekho
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
              @for (m of msgs(); track m.id; let mi = $index) {
                <!-- WhatsApp jaisi DATE-PATTI — din badla to beech me Aaj/Kal/date -->
                @if (showDateSep(mi)) {
                  <div style="display:flex; justify-content:center; margin:8px 0">
                    <span style="background:#fff; color:#54656F; font-size:12px; font-weight:600; padding:4px 12px; border-radius:8px; box-shadow:0 1px 1px rgba(0,0,0,.1)">{{ dateLabel(m.createdAt) }}</span>
                  </div>
                }
                <div class="flex group items-center" [class.justify-end]="m.sender === 'firm'"
                     [class.bg-blue-50]="selected().has(m.id)"
                     (click)="selectMode() && toggleSel(m)">
                  @if (selectMode()) {
                    <input type="checkbox" class="w-5 h-5 accent-[#1B2E5C] mx-2 shrink-0"
                           [checked]="selected().has(m.id)" (click)="$event.stopPropagation(); toggleSel(m)">
                  }
                  <div class="rounded-2xl py-2 pl-3 pr-9 max-w-[75%] text-sm relative"
                       [class]="m.sender === 'firm' ? 'bg-[#DCF8C6]' : 'bg-gray-100'"
                       (contextmenu)="openMsgMenu($event, m)">
                    <!-- WhatsApp jaisa: message par hover/right-click -> menu (Reply/Copy/Forward/Delete) -->
                    @if (!selectMode()) {
                      <button class="pc-menu-btn" (click)="openMsgMenu($event, m)" title="Options">
                        <!-- Double-chevron (black) — mobile par bhi saaf dikhe -->
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#111827"
                             stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="5 4.5 12 10.5 19 4.5"/>
                          <polyline points="5 13 12 19 19 13"/>
                        </svg>
                      </button>
                    }

                    @if (m.sender === 'party') {
                      <div class="text-[10px] font-bold text-purple-700">{{ m.senderName || active()!.partyName }}</div>
                    }

                    <!-- Reply ka QUOTE — jis message ka jawab hai wo upar chhota dikhta hai -->
                    @if (m.replyBody) {
                      <div class="pc-quote">
                        <div class="pc-quote-who">{{ m.replySender === 'firm' ? 'You' : (m.replySenderName || active()!.partyName) }}</div>
                        <div class="pc-quote-txt">{{ m.replyBody }}</div>
                      </div>
                    }
                    @if (m.attachmentType === 'image') {
                      <!-- Tap = poori screen + zoom (lightbox) -->
                      <img [src]="fileUrl(m.attachmentUrl!)" class="rounded-lg max-w-full max-h-64 mb-1"
                           style="cursor:zoom-in" alt="photo"
                           (click)="lb.open(fileUrl(m.attachmentUrl!))"
                           (load)="scrollDown()">
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

            <!-- Message ka menu — WhatsApp jaisa -->
            @if (msgMenu(); as mm) {
              <div class="pc-menu-back" (click)="msgMenu.set(null)"></div>
              <div class="pc-menu" [style.left.px]="mm.x" [style.top.px]="mm.y">
                <button (click)="startReply(mm.msg)">↩️ Reply</button>
                <button (click)="copyMsg(mm.msg)">📋 Copy</button>
                <button (click)="startForward(mm.msg)">➡️ Forward</button>
                <button (click)="selectOne(mm.msg)">☑️ Select</button>
                <button class="pc-menu-del" (click)="deleteOne(mm.msg)">🗑️ Delete</button>
              </div>
            }

            <!-- Reply draft — kis message ka jawab de rahe hain -->
            @if (replyTo(); as rt) {
              <div class="pc-replybar">
                <div class="pc-replybar-txt">
                  <div class="pc-quote-who">{{ rt.sender === 'firm' ? 'You' : (rt.senderName || active()!.partyName) }}</div>
                  <div class="pc-quote-txt">{{ rt.body || (rt.attachmentName || 'Attachment') }}</div>
                </div>
                <button (click)="replyTo.set(null)" class="pc-replybar-x">×</button>
              </div>
            }

            <div class="p-3 border-t border-[#F0F0F0] flex gap-2 items-end relative">
              <!-- ➕ attach menu (WhatsApp jaisa) -->
              @if (attachOpen()) {
                <div class="absolute bottom-16 left-3 bg-white rounded-xl shadow-lg border border-[#D6DDEA] p-2 z-20 flex gap-3 flex-wrap">
                  <button (click)="pickFile('camera')" class="pc-att"><span class="pc-att-ico" style="background:#DC2626">📷</span>Camera</button>
                  <button (click)="pickFile('gallery')" class="pc-att"><span class="pc-att-ico" style="background:#E8A33D"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><rect x="3" y="4.5" width="18" height="15" rx="2" fill="#fff"/><rect x="5" y="6.5" width="14" height="11" rx="1" fill="#7FB2D9"/><circle cx="16" cy="9.6" r="1.5" fill="#FFD84D"/><path d="M5.6 17.5 10 11.6l3.2 4 2.1-2.4 3.1 4.3z" fill="#4A5568"/></svg></span>Gallery</button>
                  <button (click)="pickFile('doc')" class="pc-att"><span class="pc-att-ico" style="background:#2563EB">📄</span>Document</button>
                  <button (click)="sendLocation()" class="pc-att"><span class="pc-att-ico" style="background:#DC2626"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2.2c-3.9 0-7 3.1-7 7 0 5 7 12.6 7 12.6s7-7.6 7-12.6c0-3.9-3.1-7-7-7z" fill="#fff"/><circle cx="12" cy="9.2" r="2.9" fill="#DC2626"/></svg></span>Location</button>
                  <button (click)="sendContact()" class="pc-att"><span class="pc-att-ico" style="background:#F6C744"><svg viewBox="0 0 24 24" width="22" height="22"><rect x="3.5" y="3.5" width="14" height="17" rx="2.5" fill="#EDEDE6" stroke="#5B4636" stroke-width="1.4"/><rect x="17.5" y="5.5" width="3" height="3.4" fill="#4A90E2"/><rect x="17.5" y="9.4" width="3" height="3.4" fill="#F5A623"/><rect x="17.5" y="13.3" width="3" height="3.4" fill="#4CAF50"/><circle cx="10.5" cy="9.6" r="2.3" fill="none" stroke="#5B4636" stroke-width="1.4"/><path d="M6.8 16.6c.6-2 2-3 3.7-3s3.1 1 3.7 3" fill="none" stroke="#5B4636" stroke-width="1.4" stroke-linecap="round"/></svg></span>Contact</button>
                </div>
              }
              <button (click)="toggleAttach()" class="text-2xl px-2 text-[#1B2E5C]" title="Attach">➕</button>
              <input #fileInput type="file" class="hidden" (change)="fileChosen($event)">
              <textarea [(ngModel)]="draft" (keydown)="onEnter($event)" rows="1"
                        placeholder="Message likho… (Enter = send)"
                        class="input flex-1 resize-none"></textarea>
              <!-- SVG icon, emoji nahi: 📤 Windows par printer/tray jaisa dikhta tha.
                   SVG har device par ek jaisa aur saaf 'send' dikhta hai. -->
              <button (click)="send()" [disabled]="busy() || !draft.trim()"
                      class="btn-primary pc-send" title="Bhejo">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3.4 20.4 22 12 3.4 3.6 3.4 10.1 16 12 3.4 13.9z"/>
                </svg>
              </button>
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
    /* Send button — icon theek beech me aur sahi size ka rahe */
    .pc-send { display:inline-flex; align-items:center; justify-content:center;
      width:44px; height:44px; padding:0; }
    .pc-send svg { width:20px; height:20px; }

    /* ===== Message menu + Reply (WhatsApp jaisa) ===== */
    /* Hamesha dikhta hai (sirf hover par nahi) — mobile/tablet par na hover hota
       hai na right-click, wahan menu milta hi nahi. Halka rakha hai taaki message
       padhne me kharal na kare; hover par gehra ho jata hai. */
    .pc-menu-btn { position:absolute; top:2px; right:4px; border:none;
      background:rgba(255,255,255,.85); border-radius:50%;
      width:26px; height:26px; display:flex; align-items:center; justify-content:center;
      line-height:1; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.18);
      opacity:.95; transition:opacity .12s; }
    .pc-menu-btn:hover, .group:hover .pc-menu-btn { opacity:1; background:#fff; }
    .pc-menu-back { position:fixed; inset:0; z-index:1290; }
    .pc-menu { position:fixed; z-index:1300; background:#fff; border-radius:10px;
      box-shadow:0 10px 30px rgba(0,0,0,.22); padding:5px; min-width:170px; }
    .pc-menu button { display:block; width:100%; text-align:left; border:none; background:none;
      padding:9px 12px; font-size:13px; color:#1B2E5C; border-radius:7px; cursor:pointer; font-family:inherit; }
    .pc-menu button:hover { background:#F3F0FA; }
    .pc-menu .pc-menu-del { color:#DC2626; }

    /* Quote — message ke andar, jis baat ka jawab hai */
    .pc-quote { border-left:3px solid #7C3AED; background:rgba(255,255,255,.55);
      border-radius:6px; padding:4px 8px; margin-bottom:4px; }
    .pc-quote-who { font-size:11px; font-weight:800; color:#6D28D9; }
    .pc-quote-txt { font-size:12px; color:#4B5563; white-space:pre-wrap;
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

    /* Reply draft bar — input ke upar */
    .pc-replybar { display:flex; align-items:center; gap:8px; padding:8px 12px;
      background:#F3F0FA; border-top:1px solid #E5E7EB; }
    .pc-replybar-txt { flex:1; border-left:3px solid #7C3AED; padding-left:8px; min-width:0; }
    .pc-replybar-x { border:none; background:none; font-size:22px; line-height:1;
      color:#6B7280; cursor:pointer; }

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
  private attachTimer: any;
  /** ➕ menu: 10 second me khud band (galti se khula reh jaye to raste me na aaye) */
  toggleAttach() {
    clearTimeout(this.attachTimer);
    const open = !this.attachOpen();
    this.attachOpen.set(open);
    if (open) this.attachTimer = setTimeout(() => this.attachOpen.set(false), 10000);
  }

  // Attachment URL relative aata hai (/api/...) — poora banao
  fileUrl(u: string) { return u.startsWith('http') ? u : environment.apiUrl + u; }

  // Body me links clickable — CACHED! Har render par naya object banane se
  // change-detection ka anant loop banta tha (Page Unresponsive bug).
  private linkCache = new Map<string, SafeHtml>();
  linkify(body: string): SafeHtml {
    let v = this.linkCache.get(body);
    if (!v) {
      // 🔐 QUOTES bhi escape — warna link ke andar onmouseover=... daal kar script chal
      // sakti thi (party ka message firm ke logged-in session me chalta). rel bhi zaroori.
      const esc = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const html = esc.replace(/(https?:\/\/[^\s"'<>]+)/g,
        (m: string) => `<a href="${encodeURI(m)}" target="_blank" rel="noopener noreferrer nofollow" style="color:#2563EB;text-decoration:underline">${m}</a>`);
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

  // ===== MESSAGE MENU + REPLY (WhatsApp jaisa) =====
  msgMenu = signal<{ x: number; y: number; msg: PchatMsg } | null>(null);
  replyTo = signal<PchatMsg | null>(null);
  fwdMsg = signal<PchatMsg | null>(null);

  openMsgMenu(ev: MouseEvent, m: PchatMsg) {
    ev.preventDefault();
    ev.stopPropagation();
    // Menu screen se bahar na nikle — kinare se thoda andar rakhte hain
    const x = Math.min(ev.clientX, window.innerWidth - 190);
    const y = Math.min(ev.clientY, window.innerHeight - 240);
    this.msgMenu.set({ x, y, msg: m });
  }

  startReply(m: PchatMsg) {
    this.replyTo.set(m);
    this.msgMenu.set(null);
  }

  copyMsg(m: PchatMsg) {
    const text = m.body || m.attachmentName || '';
    navigator.clipboard?.writeText(text)
      .then(() => this.toast.success('Copy ho gaya'))
      .catch(() => this.toast.error('Copy nahi ho paya'));
    this.msgMenu.set(null);
  }

  /** Forward — broadcast wali hi screen khol dete hain, message pehle se bhara hua.
   *  Wahan se jitni chahe parties chuno. */
  startForward(m: PchatMsg) {
    this.msgMenu.set(null);
    this.bcBody = m.body || m.attachmentName || '';
    this.bcSelected.set(new Set());
    this.bcMsg.set('');
    this.bcOpen.set(true);
  }

  selectOne(m: PchatMsg) {
    this.msgMenu.set(null);
    this.selectMode.set(true);
    this.selected.set(new Set([m.id]));
  }

  deleteOne(m: PchatMsg) {
    this.msgMenu.set(null);
    this.selectMode.set(true);
    this.selected.set(new Set([m.id]));
    this.showDelDialog.set(true);
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
    this.loadMsgs(t.id, true);   // chat khulte hi seedha aakhri message par
  }

  /** WhatsApp jaisi date-patti: is message se din badla kya? */
  showDateSep(i: number): boolean {
    const arr = this.msgs();
    if (i === 0) return true;
    return new Date(arr[i].createdAt).toDateString() !== new Date(arr[i - 1].createdAt).toDateString();
  }
  dateLabel(d: string): string {
    // Seedhi DATE — 29/07/2026 (user ko Aaj/Kal nahi, tareekh chahiye)
    return new Date(d).toLocaleDateString('en-GB');
  }

  @ViewChild('scrollBox') scrollBox?: ElementRef<HTMLDivElement>;

  /** WhatsApp jaisa scroll: chat khulte/apna msg bhejte hi NEECHE; purane padh rahe ho
   *  aur naya aa jaye to jhatka nahi. PHOTOS der se load hoti hain isliye 3 baar
   *  koshish + har photo load par bhi (img load) se dobara. Template se bhi call hota
   *  hai isliye public. */
  scrollDown(force = false) {
    const go = () => {
      const el = this.scrollBox?.nativeElement;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (force || nearBottom) el.scrollTop = el.scrollHeight;
    };
    setTimeout(go); setTimeout(go, 150); setTimeout(go, 450);
  }

  loadMsgs(threadId: string, jump = false) {
    this.http.get<PchatMsg[]>(`${this.base}/threads/${threadId}/messages`).subscribe({
      next: m => {
        this.msgs.set(m);
        this.scrollDown(jump);   // khulte hi last msg dikhe — upar purane
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
    const replyToId = this.replyTo()?.id ?? null;
    this.http.post(`${this.base}/threads/${t.id}/messages`, { body, replyToId }).subscribe({
      next: () => {
        this.busy.set(false); this.draft = ''; this.replyTo.set(null); this.loadMsgs(t.id, true);
      },
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
  /** Party ka abhi ka OTP — firm dekh kar phone par bata de (provider band hone tak) */
  showPartyOtp() {
    const t = this.active();
    if (!t) return;
    this.http.get<any>(`${this.base}/threads/${t.id}/otp`).subscribe({
      next: (r) => {
        if (r?.otp) alert(`🔑 ${t.partyName} ka OTP: ${r.otp}\n\nPhone par bata dein — 10 minute me expire ho jayega.`);
        else alert(`ℹ️ ${r?.hint || 'Abhi koi OTP pending nahi hai.'}`);
      },
      error: (e) => alert('⚠️ ' + (e?.error?.error ?? 'OTP nahi mila'))
    });
  }

  shareLink() {
    const t = this.active();
    if (!t) return;
    // PERSONAL link — party ka apna code, SIRF usi ke number se khulega (galat use band)
    this.http.post<any>(`${this.base}/threads/${t.id}/invite`, {}).subscribe({
      next: (r) => {
        const link = `${PartyChatComponent.PUBLIC_BASE}${r.path}`;
        const text = `Namaste ${t.partyName} ji,\nYe aapka PERSONAL chat link hai — sirf aapke number (${t.phone.slice(-10)}) se khulega:\n${link}\n\n*Chrome me* kholein, apna number verify karein.\n📲 "App install karo" aaye to install kar lein — agli baar ek tap me chat khulegi.`;
        window.open(`https://wa.me/91${t.phone.slice(-10)}?text=${encodeURIComponent(text)}`, '_blank');
        navigator.clipboard?.writeText(link).then(() => this.toast.success('Personal link copy bhi ho gaya'));
      },
      error: () => {
        // Invite na bane to purana aam link — chat rukni nahi chahiye
        const firmId = this.auth.user()?.firmId;
        const link = `${PartyChatComponent.PUBLIC_BASE}/pchat/${firmId}`;
        window.open(`https://wa.me/91${t.phone.slice(-10)}?text=${encodeURIComponent('Namaste! Humse chat ke liye: ' + link)}`, '_blank');
      }
    });
  }
}
