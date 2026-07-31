import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import * as signalR from '@microsoft/signalr';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';
import { PhotoLightboxComponent } from '../../shared/photo-lightbox.component';

interface PMsg {
  id: string; sender: 'firm' | 'party'; senderName: string | null;
  body: string; readAt: string | null; createdAt: string;
  attachmentUrl?: string | null; attachmentName?: string | null; attachmentType?: string | null;
  // Quote (jis message ka jawab hai) — WhatsApp jaisa
  replyBody?: string | null; replySender?: string | null; replySenderName?: string | null;
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
  imports: [CommonModule, FormsModule, DatePipe, PhotoLightboxComponent],
  template: `
    <!-- Photo zoom lightbox — chat ki kisi bhi photo par tap karke kholo -->
    <app-photo-lightbox #lb></app-photo-lightbox>
    <!-- WhatsApp jaisa FULL-SCREEN layout — mobile par poori screen, desktop par center column -->
    <div class="pc-shell">

      <!-- Header bar (WhatsApp jaisa) -->
      <div class="pc-header">
        <!-- Portal me chat ke andar ← WAPAS (agencies list par) — WhatsApp jaisa -->
        @if (portalMode && step() === 'chat') {
          <button (click)="goHome()" class="pc-logout" title="Saari agencies" style="font-size:22px">←</button>
        }
        <!-- Chat me naam/DP par tap = MEDIA (saari photos ek jagah) — WhatsApp jaisa -->
        <div class="pc-avatar" [style.background]="step() === 'chat' || !portalMode ? avColor(firmName() || 'V') : '#1B2E5C'"
             [style.cursor]="step() === 'chat' ? 'pointer' : ''" (click)="step() === 'chat' && openMedia()">
          {{ step() === 'firms' ? '💬' : (firmName() || 'V').charAt(0) }}
        </div>
        <div class="flex-1 min-w-0" [style.cursor]="step() === 'chat' ? 'pointer' : ''"
             (click)="step() === 'chat' && openMedia()">
          <div class="pc-title">{{ step() === 'firms' ? 'Meri Chats' : (firmName() || 'Vyapaar Setu') }}</div>
          <div class="pc-sub">{{ step() === 'chat' ? ('Aap: ' + partyName()) : step() === 'firms' ? 'Saari agencies ek jagah' : 'Party Chat — Vyapaar Setu' }} · {{ BUILD }}</div>
        </div>
        @if (step() === 'firms') {
          <button (click)="logout()" class="pc-logout" title="Logout">⏻</button>
        }
        @if (step() === 'chat') {
          @if (!selectMode()) {
            <button (click)="startSelect()" class="pc-logout" title="Select karke delete">☑</button>
            <button (click)="logout()" class="pc-logout" title="Logout — dobara OTP lagega">⏻</button>
          } @else {
            <span style="font-size:15px;font-weight:800">{{ selected().size }}</span>
            <button (click)="openDeleteSelected()" class="pc-logout" title="Delete">🗑</button>
            <button (click)="cancelSelect()" class="pc-logout" title="Cancel">✕</button>
          }
        }
      </div>

      <!-- WhatsApp jaisa delete dialog (selected messages): everyone / me / cancel -->
      @if (showDelDialog()) {
        <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:60;padding:16px"
             (click)="showDelDialog.set(false)">
          <div style="background:#fff;border-radius:18px;padding:20px;width:100%;max-width:320px" (click)="$event.stopPropagation()">
            <div style="font-weight:800;color:#1B2E5C;margin-bottom:14px;font-size:18px">{{ selected().size }} message delete karein?</div>
            <div style="display:flex;flex-direction:column;gap:4px;font-size:17px;font-weight:700">
              @if (allSelectedMine()) {
                <button (click)="doDeleteSelected('everyone')" style="color:#DC2626;text-align:left;background:none;border:0;padding:10px 6px">Delete for everyone</button>
              }
              <button (click)="doDeleteSelected('me')" style="color:#1B2E5C;text-align:left;background:none;border:0;padding:10px 6px">Delete for me</button>
              <button (click)="showDelDialog.set(false)" style="color:#888;text-align:left;background:none;border:0;padding:10px 6px">Cancel</button>
            </div>
          </div>
        </div>
      }

      <!-- 🖼️ MEDIA — 10-15 photo aane par chat me dhoondhna mushkil tha. Ab agency ke
           naam par tap = saari photos ek grid me; kisi par tap = seedha usi message
           par (order wahin se de sakein). -->
      @if (mediaOpen()) {
        <div class="pc-media">
          <div class="pc-media-top">
            <button (click)="mediaOpen.set(false)" class="pc-logout" style="font-size:22px">←</button>
            <div class="flex-1 min-w-0">
              <div class="pc-title">{{ firmName() }}</div>
              <div class="pc-sub">{{ mediaList().length }} photo</div>
            </div>
          </div>
          <div class="pc-media-body">
            @if (mediaList().length === 0) {
              <div class="text-center text-gray-500 mt-12">Abhi koi photo nahi aayi.</div>
            }
            <div class="pc-media-grid">
              @for (m of mediaList(); track m.id) {
                <div class="pc-media-cell" (click)="jumpTo(m)">
                  <img [src]="fileUrl(m.attachmentUrl!)" alt="photo" loading="lazy">
                  @if (orderCode(m); as oc) { <span class="pc-media-tag">🛒</span> }
                  <span class="pc-media-day">{{ m.createdAt | date:'d MMM' }}</span>
                </div>
              }
            </div>
          </div>
        </div>
      }

      <!-- 🐞 JS error trap — koi bhi error aaye to yahan LAL patti me dikhega (screenshot se debug) -->
      @if (jsError()) {
        <div style="background:#DC2626;color:#fff;padding:8px 12px;font-size:13px;word-break:break-all">
          🐞 {{ jsError() }}
        </div>
      }

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
            @if (inviteName()) {
              <p class="text-lg text-center mb-1 font-bold text-[#1B2E5C]">Namaste {{ inviteName() }} ji! 👋</p>
              <p class="text-sm text-gray-500 mb-4 text-center">Ye aapka personal link hai — apna number verify karein:</p>
            } @else {
              <p class="text-base text-gray-700 mb-4 text-center">Apna <b>wahi mobile number</b> daalein<br>jo firm ke paas registered hai:</p>
            }
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

      <!-- STEP: AGENCIES LIST (portal) — WhatsApp ka ghar: saari firms, DP/akshar, unread -->
      @if (step() === 'firms') {
        <div class="pc-body" style="background:#fff; overflow-y:auto">
          @if (agencies().length === 0) {
            <div class="text-center text-gray-500 text-base mt-12 px-8">
              Aapka number abhi kisi agency ke Party Master me nahi mila.<br>
              <small>Apni agency se apna number judwayein.</small>
            </div>
          }
          @for (a of agencies(); track a.firmId) {
            <div class="pc-agn" (click)="openAgency(a)">
              @if (a.logoUrl) {
                <img [src]="a.logoUrl" class="pc-agn-av" alt="">
              } @else {
                <!-- DP nahi → firm ka PEHLA AKSHAR hi DP (naam se pakka rang) -->
                <div class="pc-agn-av pc-agn-letter" [style.background]="avColor(a.firmName)">
                  {{ a.firmName.charAt(0) }}
                </div>
              }
              <div class="flex-1 min-w-0" style="border-bottom:1px solid #F0F0F0; padding:14px 0">
                <div style="display:flex; justify-content:space-between; align-items:center">
                  <span style="font-weight:700; font-size:17px; color:#111">{{ a.firmName }}</span>
                  @if (a.lastMsgAt) {
                    <span style="font-size:12px" [style.color]="a.unread > 0 ? '#16A34A' : '#9CA3AF'">
                      {{ a.lastMsgAt | date:'d/M/yy h:mm a' }}
                    </span>
                  }
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px">
                  <span style="font-size:14px; color:#6B7280; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                    {{ a.lastBody || 'Chat shuru karein…' }}
                  </span>
                  @if (a.unread > 0) {
                    <span class="pc-agn-badge">{{ a.unread }}</span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- STEP 3: chat (WhatsApp-style) -->
      @if (step() === 'chat') {
        <div #chatBox class="pc-body pc-chatbg">
          @if (msgs().length === 0) {
            <div class="text-center text-gray-500 text-base mt-12 bg-white/70 rounded-xl mx-8 py-4">Pehla message bhejo 👇</div>
          }
          @for (m of msgs(); track m.id; let mi = $index) {
            <!-- WhatsApp jaisi DATE-PATTI — din badla to beech me Aaj/Kal/date -->
            @if (showDateSep(mi)) {
              <div class="pc-datepill"><span>{{ dateLabel(m.createdAt) }}</span></div>
            }
            <div class="flex mb-1.5 px-3 items-center" [class.justify-end]="m.sender === 'party'"
                 [attr.id]="'pcm-' + m.id" [class.pc-flash]="flashId() === m.id"
                 [style.background]="selected().has(m.id) ? 'rgba(27,46,92,.12)' : ''"
                 (click)="selectMode() && toggleSel(m)">
              @if (selectMode()) {
                <input type="checkbox" style="width:22px;height:22px;margin-right:8px;flex-shrink:0"
                       [checked]="selected().has(m.id)" (click)="$event.stopPropagation(); toggleSel(m)">
              }
              <div class="pc-bubble" [class.pc-mine]="m.sender === 'party'">
                <!-- Quote — jis message ka jawab hai (WhatsApp jaisa) -->
                @if (m.replyBody) {
                  <div class="pc-quote">
                    <b>{{ m.replySender === 'party' ? 'Aap' : (m.replySenderName || 'Firm') }}</b>
                    <div class="pc-quote-txt">{{ m.replyBody.length > 90 ? m.replyBody.slice(0, 90) + '…' : m.replyBody }}</div>
                  </div>
                }
                @if (m.attachmentType === 'image') {
                  <!-- Tap = poori screen + pinch ZOOM (lightbox) -->
                  <img [src]="fileUrl(m.attachmentUrl!)" class="pc-img" alt="photo"
                       style="cursor:zoom-in"
                       (click)="lb.open(fileUrl(m.attachmentUrl!)); $event.stopPropagation()"
                       (load)="scrollDown()">
                } @else if (m.attachmentType === 'document') {
                  <a [href]="fileUrl(m.attachmentUrl!)" target="_blank" class="pc-doc">📄 {{ m.attachmentName || 'Document' }}</a>
                }
                @if (m.body) { <div class="whitespace-pre-wrap break-words" [innerHTML]="linkify(visibleBody(m.body))"></div> }
                <!-- ☑ TAP-BUTTON — bot ne jo chunav bheja (jaise meter/piece/kg), tap se jawab -->
                @if (quickReplies(m); as qr) {
                  <div class="pc-qrow">
                    @for (q of qr; track q.val) {
                      <button class="pc-qbtn" [disabled]="busy()"
                              (click)="sendQuick(q.val); $event.stopPropagation()">{{ q.label }}</button>
                    }
                  </div>
                }
                <!-- 🛒 ORDER button — bot ki stock-photo ke neeche, tap = code khud chala jayega -->
                @if (m.sender === 'firm' && orderCode(m); as oc) {
                  <div class="pc-orderrow">
                    <!-- ☑ TICK — kai photo ek saath chun kar EK order (asli bill jaisa) -->
                    <label class="pc-tick" (click)="$event.stopPropagation()">
                      <input type="checkbox" [checked]="picked().has(oc)" (change)="togglePick(oc)">
                      <span>Chuno</span>
                    </label>
                    <button (click)="quickOrder(oc)" [disabled]="busy()" class="pc-orderbtn">🛒 ORDER</button>
                  </div>
                }
                <div class="pc-meta">
                  {{ m.createdAt | date:'h:mm a' }}
                  @if (m.sender === 'party') {
                    <span class="pc-tick" [style.color]="m.readAt ? '#34B7F1' : '#9ca3af'">✓✓</span>
                  }
                </div>
                <!-- Reply / Share — WhatsApp jaise chhote options har bubble par -->
                @if (!selectMode()) {
                  <div class="pc-actions">
                    <button (click)="startReply(m); $event.stopPropagation()" title="Reply">↩️</button>
                    @if (m.attachmentType === 'image') {
                      <button (click)="shareImage(m); $event.stopPropagation()" title="Aage bhejo / share">📤</button>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
        <!-- 🛒 Chune hue photos ki patti — ek saath order -->
        @if (picked().size > 0) {
          <div class="pc-pickbar">
            <span class="flex-1">🛒 <b>{{ picked().size }}</b> photo chuni</span>
            <button (click)="clearPicks()" class="pc-pick-x">Hatao</button>
            <button (click)="orderPicked()" [disabled]="busy()" class="pc-pick-go">Order karein</button>
          </div>
        }

        <!-- Reply-quote bar (WhatsApp jaisa) — kis message ka jawab likh rahe ho -->
        @if (replyTo(); as r) {
          <div class="pc-replybar">
            <div class="pc-replybar-in">
              <b>{{ r.sender === 'party' ? 'Aap' : (r.senderName || 'Firm') }}</b>
              <div class="pc-quote-txt">{{ (r.body || (r.attachmentType === 'image' ? '📷 Photo' : '📄 Document')).slice(0, 80) }}</div>
            </div>
            <button (click)="replyTo.set(null)" class="pc-replybar-x">✕</button>
          </div>
        }
        <div class="pc-inputbar">
          @if (attachOpen()) {
            <div class="pc-attmenu">
              <button (click)="pickFile('camera')" class="pc-att"><span class="pc-att-ico" style="background:#DC2626">📷</span>Camera</button>
              <button (click)="pickFile('gallery')" class="pc-att"><span class="pc-att-ico" style="background:#E8A33D"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><rect x="3" y="4.5" width="18" height="15" rx="2" fill="#fff"/><rect x="5" y="6.5" width="14" height="11" rx="1" fill="#7FB2D9"/><circle cx="16" cy="9.6" r="1.5" fill="#FFD84D"/><path d="M5.6 17.5 10 11.6l3.2 4 2.1-2.4 3.1 4.3z" fill="#4A5568"/></svg></span>Gallery</button>
              <button (click)="pickFile('doc')" class="pc-att"><span class="pc-att-ico" style="background:#2563EB">📄</span>Document</button>
              <button (click)="sendLocation()" class="pc-att"><span class="pc-att-ico" style="background:#DC2626"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2.2c-3.9 0-7 3.1-7 7 0 5 7 12.6 7 12.6s7-7.6 7-12.6c0-3.9-3.1-7-7-7z" fill="#fff"/><circle cx="12" cy="9.2" r="2.9" fill="#DC2626"/></svg></span>Location</button>
              <button (click)="sendContact()" class="pc-att"><span class="pc-att-ico" style="background:#F6C744"><svg viewBox="0 0 24 24" width="22" height="22"><rect x="3.5" y="3.5" width="14" height="17" rx="2.5" fill="#EDEDE6" stroke="#5B4636" stroke-width="1.4"/><rect x="17.5" y="5.5" width="3" height="3.4" fill="#4A90E2"/><rect x="17.5" y="9.4" width="3" height="3.4" fill="#F5A623"/><rect x="17.5" y="13.3" width="3" height="3.4" fill="#4CAF50"/><circle cx="10.5" cy="9.6" r="2.3" fill="none" stroke="#5B4636" stroke-width="1.4"/><path d="M6.8 16.6c.6-2 2-3 3.7-3s3.1 1 3.7 3" fill="none" stroke="#5B4636" stroke-width="1.4" stroke-linecap="round"/></svg></span>Contact</button>
            </div>
          }
          <button (click)="toggleAttach()" class="pc-plus">➕</button>
          <input #fileInput type="file" style="display:none" (change)="fileChosen($event)">
          <textarea [(ngModel)]="draft" (keydown)="onEnter($event)" rows="1"
                    placeholder="Message likho…"
                    class="pc-input"></textarea>
          <!-- Wahi SVG jo firm side par — dono taraf ek jaisa dikhe -->
          <button (click)="send()" [disabled]="busy() || !draft.trim()" class="pc-send" title="Bhejo">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:20px;height:20px">
              <path d="M3.4 20.4 22 12 3.4 3.6 3.4 10.1 16 12 3.4 13.9z"/>
            </svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; overflow-x: hidden; }
    .pc-shell {
      display: flex; flex-direction: column;
      height: 100vh; height: 100dvh;   /* dvh na ho to vh fallback */
      width: 100%; max-width: 640px; margin: 0 auto;
      background: #FAF7F0; font-size: 22px;
      overflow-x: hidden;
    }
    .pc-input, textarea { width: 100%; min-width: 0; }
    /* WhatsApp jaisi beech ki date-patti */
    .pc-datepill { display:flex; justify-content:center; margin:10px 0 8px; }
    .pc-datepill span { background:#fff; color:#54656F; font-size:12.5px; font-weight:600;
      padding:5px 12px; border-radius:8px; box-shadow:0 1px 1px rgba(0,0,0,.08); }
    /* AGENCIES LIST (portal) — WhatsApp ka ghar */
    .pc-agn { display:flex; align-items:center; gap:12px; padding:0 14px; cursor:pointer; }
    .pc-agn:active { background:#F5F3FF; }
    .pc-agn-av { width:52px; height:52px; border-radius:50%; object-fit:cover; flex-shrink:0; }
    .pc-agn-letter { display:flex; align-items:center; justify-content:center;
      color:#fff; font-size:24px; font-weight:800; }
    .pc-agn-badge { background:#16A34A; color:#fff; font-size:12px; font-weight:800;
      min-width:22px; height:22px; border-radius:999px; display:flex;
      align-items:center; justify-content:center; padding:0 6px; flex-shrink:0; }
    /* ☑ tick + ORDER ki jodi */
    .pc-orderrow { display:flex; gap:8px; align-items:center; margin-top:8px; }
    .pc-tick { display:flex; align-items:center; gap:6px; font-size:15px; font-weight:700;
      color:#1B2E5C; background:rgba(27,46,92,.08); border-radius:10px; padding:8px 10px; cursor:pointer; }
    .pc-tick input { width:20px; height:20px; accent-color:#1B2E5C; }
    .pc-orderrow .pc-orderbtn { margin-top:0; flex:1; }
    /* Chune hue photos ki patti */
    .pc-pickbar { display:flex; align-items:center; gap:8px; background:#1B2E5C; color:#fff;
      padding:10px 12px; font-size:15px; }
    .pc-pick-x { color:#fff; opacity:.8; font-size:14px; padding:6px 10px; }
    .pc-pick-go { background:#fff; color:#1B2E5C; font-weight:800; border-radius:10px;
      padding:8px 14px; font-size:15px; }
    .pc-pick-go:disabled { opacity:.5; }
    /* 🖼️ MEDIA — poori screen par photos ka grid */
    .pc-media { position:fixed; inset:0; z-index:70; background:#fff; display:flex; flex-direction:column; }
    .pc-media-top { display:flex; align-items:center; gap:10px; padding:10px 12px;
      background:#1B2E5C; color:#fff; }
    .pc-media-top .pc-title { color:#fff; }
    .pc-media-top .pc-sub { color:#C7D2E8; }
    .pc-media-body { flex:1; overflow-y:auto; padding:4px; }
    .pc-media-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:3px; }
    .pc-media-cell { position:relative; aspect-ratio:1; overflow:hidden; background:#EEE; cursor:pointer; }
    .pc-media-cell img { width:100%; height:100%; object-fit:cover; display:block; }
    .pc-media-cell:active img { opacity:.7; }
    .pc-media-tag { position:absolute; top:4px; right:4px; font-size:15px;
      background:rgba(255,255,255,.9); border-radius:6px; padding:0 4px; }
    .pc-media-day { position:absolute; left:0; right:0; bottom:0; font-size:11px; color:#fff;
      background:linear-gradient(transparent, rgba(0,0,0,.55)); padding:8px 4px 2px; text-align:center; }
    /* Media se aaye message par 2 sec ki chamak */
    .pc-flash { animation: pcflash 2s ease-out; border-radius:12px; }
    @keyframes pcflash { 0%,60% { background:rgba(255,214,0,.45); } 100% { background:transparent; } }
    /* ☑ Bot ke sawal ke tap-button (meter / piece / kg jaise chunav) */
    .pc-qrow { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
    .pc-qbtn { flex:1 1 auto; min-width:96px; padding:9px 12px; background:#fff;
      color:#1B2E5C; border:1.5px solid #1B2E5C; border-radius:10px;
      font-weight:700; font-size:15px; }
    .pc-qbtn:active { background:#1B2E5C; color:#fff; }
    .pc-qbtn:disabled { opacity:.5; }
    /* 🛒 ORDER button — stock-photo ke neeche */
    .pc-orderbtn { display:block; width:100%; margin-top:8px; padding:10px 12px;
      background:#1B2E5C; color:#fff; font-weight:700; font-size:16px; border-radius:10px; }
    .pc-orderbtn:disabled { opacity:.5; }
    /* Quote (reply) — bubble ke andar */
    .pc-quote { border-left:4px solid #1B2E5C; background:rgba(27,46,92,.08);
      border-radius:6px; padding:4px 8px; margin-bottom:6px; font-size:14px; }
    .pc-quote-txt { color:#555; font-size:13px; white-space:pre-wrap; word-break:break-word; }
    /* Reply/Share buttons — bubble ke neeche (mobile par saaf dikhen — dark + bade) */
    .pc-actions { display:flex; gap:12px; margin-top:5px; }
    .pc-actions button { font-size:19px; opacity:.9; padding:4px 8px;
      background:rgba(27,46,92,.08); border-radius:8px; }
    .pc-actions button:active { opacity:1; background:rgba(27,46,92,.18); }
    /* Reply bar — composer ke upar (WhatsApp jaisa) */
    .pc-replybar { display:flex; align-items:center; gap:8px; background:#fff;
      border-top:1px solid #e5e7eb; padding:6px 10px; }
    .pc-replybar-in { flex:1; min-width:0; border-left:4px solid #1B2E5C;
      background:rgba(27,46,92,.06); border-radius:6px; padding:4px 8px; font-size:14px; }
    .pc-replybar-x { font-size:18px; color:#6b7280; padding:4px 8px; }
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
      display: flex; align-items: center; justify-content: center;   /* SVG beech me */
    }
    .pc-send:disabled { opacity: .5; }
    .pc-logout {
      width: 38px; height: 38px; border-radius: 50%; border: 0; flex-shrink: 0;
      background: rgba(255,255,255,.15); color: #fff; font-size: 18px; cursor: pointer;
    }
    .pc-logout:hover { background: rgba(255,255,255,.3); }
    .pc-del { background: none; border: 0; font-size: 16px; opacity: .45; padding: 4px; cursor: pointer; }
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
  readonly BUILD = 'b9-portal';              // har fix par badhta hai — phone par yahi dikhna chahiye
  jsError = signal('');                      // koi JS error → header ke neeche lal patti
  step = signal<'phone' | 'otp' | 'firms' | 'chat'>('phone');

  // ===== PARTY PORTAL — /pchat (bina firm): ek number, SAARI agencies (WhatsApp-ghar) =====
  portalMode = false;
  portalToken = '';
  inviteCode = '';
  inviteName = signal('');   // personal link ho to party ka naam — "Namaste X ji!"
  agencies = signal<{ firmId: string; firmName: string; logoUrl: string | null;
                      unread: number; lastBody: string | null; lastMsgAt: string | null }[]>([]);

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

  /** DP na ho to firm ke pehle akshar ka rang — naam se hamesha wahi rang bane */
  avColor(name: string): string {
    const colors = ['#5c1a8b', '#1B2E5C', '#0E7490', '#B45309', '#15803D', '#BE185D', '#7C3AED', '#B91C1C'];
    let h = 0; for (const ch of (name || 'V')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return colors[h % colors.length];
  }
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
  private attachTimer: any;
  /** ➕ menu: 10 second me khud band */
  toggleAttach() {
    clearTimeout(this.attachTimer);
    const open = !this.attachOpen();
    this.attachOpen.set(open);
    if (open) this.attachTimer = setTimeout(() => this.attachOpen.set(false), 10000);
  }

  fileUrl(u: string) { return u.startsWith('http') ? u : environment.apiUrl + u; }

  // CACHED — har render par naya object = change-detection ka anant loop (freeze bug)
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
    if (kind === 'camera') inp.setAttribute('capture', 'environment');
    else inp.removeAttribute('capture');
    // GALLERY se EK SAATH KAI photos chun sako — har ek alag message banti hai
    // (supplier ke liye: har photo ki apni ID banegi, bot sabki list dega)
    if (kind === 'gallery') inp.setAttribute('multiple', '');
    else inp.removeAttribute('multiple');
    inp.value = '';
    inp.click();
  }

  // 👤 Contact bhejo
  sendContact() {
    this.attachOpen.set(false);
    const name = prompt('Kiska contact bhejna hai? Naam:');
    if (!name?.trim()) return;
    const num = prompt(`${name.trim()} ka mobile number:`);
    if (!num?.trim()) return;
    this.http.post(`${this.base}/messages`, { token: this.token, body: `👤 Contact: ${name.trim()} — ${num.trim()}` }).subscribe({
      next: () => this.loadMsgs(), error: () => alert('⚠️ Contact nahi gaya')
    });
  }

  // WhatsApp jaisa SELECTION delete — ☑ dabao, tick karo, fir everyone/me/cancel
  selectMode = signal(false);
  selected = signal<Set<string>>(new Set());
  showDelDialog = signal(false);

  startSelect() { this.selectMode.set(true); this.selected.set(new Set()); }
  cancelSelect() { this.selectMode.set(false); this.selected.set(new Set()); this.showDelDialog.set(false); }

  toggleSel(m: PMsg) {
    const s = new Set(this.selected());
    s.has(m.id) ? s.delete(m.id) : s.add(m.id);
    this.selected.set(s);
  }

  allSelectedMine(): boolean {
    const s = this.selected();
    return this.msgs().filter(m => s.has(m.id)).every(m => m.sender === 'party');
  }

  openDeleteSelected() { if (this.selected().size > 0) this.showDelDialog.set(true); }

  doDeleteSelected(mode: 'everyone' | 'me') {
    const ids = [...this.selected()];
    this.showDelDialog.set(false);
    if (ids.length === 0) return;
    let done = 0;
    ids.forEach(id =>
      this.http.post(`${this.base}/messages/delete`, { token: this.token, messageId: id, mode }).subscribe({
        next: () => { if (++done === ids.length) { this.cancelSelect(); this.loadMsgs(); } },
        error: () => { if (++done === ids.length) { this.cancelSelect(); this.loadMsgs(); } }
      }));
  }

  fileChosen(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    if (!files.length) return;
    // Caption (draft) sirf PEHLI photo ke saath — baki bina caption jayengi
    // (har ek ko bot alag padhega, apni-apni Photo ID milegi)
    const caption = this.draft.trim();
    this.draft = '';
    this.busy.set(true);
    const sendOne = (i: number) => {
      if (i >= files.length) { this.busy.set(false); this.loadMsgs(true); return; }
      const fd = new FormData();
      fd.append('token', this.token);
      fd.append('file', files[i]);
      if (i === 0 && caption) fd.append('body', caption);
      this.http.post(`${this.base}/attachment`, fd).subscribe({
        next: () => { this.loadMsgs(); sendOne(i + 1); },   // ek-ke-baad-ek — order bana rahe
        error: (err) => {
          this.busy.set(false);
          alert(`⚠️ Photo ${i + 1}/${files.length} nahi gayi: ` + (err?.error?.error ?? 'error'));
        }
      });
    };
    sendOne(0);
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
    this.portalMode = !this.firmId;   // /pchat bina firm = PORTAL (saari agencies ki list)

    // PERSONAL invite link (?i=CODE) — "Namaste <party>!" + ye link sirf usi number se khulega
    this.inviteCode = (this.route.snapshot.queryParamMap.get('i') || '').trim().toUpperCase();
    if (this.inviteCode && this.firmId) {
      this.http.get<any>(`${this.base}/invite/${this.inviteCode}`).subscribe({
        next: (r) => { this.inviteName.set(r.partyName || ''); if (r.firmName) this.firmName.set(r.firmName); },
        error: () => { this.inviteCode = ''; }   // galat code → aam link ki tarah chale
      });
    }

    // 📲 PWA manifest — firm-link par FIRM ke naam ki app; portal par "VS Chat" (sab agencies)
    try {
      const mLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (mLink)
        mLink.href = this.portalMode
          ? `${environment.apiUrl}/api/party-chat/public/manifest-portal`
          : `${environment.apiUrl}/api/party-chat/public/manifest/${this.firmId}`;
    } catch { /* manifest swap fail ho to install generic hi rahega — chat par asar nahi */ }

    // JS error trap — production me console nahi dikhta, isliye error page par hi dikhao
    window.addEventListener('error', (e: any) =>
      this.jsError.set((e?.message || 'JS error') + (e?.filename ? ' @ ' + e.filename.split('/').pop() : '')));
    window.addEventListener('unhandledrejection', (e: any) =>
      this.jsError.set('Promise: ' + (e?.reason?.message || e?.reason || 'error')));

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
      vp.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
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
    // Pehle se session ho to seedha aage — portal me AGENCIES list, firm-link me chat
    try {
      if (this.portalMode) {
        const pt = localStorage.getItem('pchat_portal_token');
        if (pt) { this.portalToken = pt; this.step.set('firms'); this.loadAgencies(); }
      } else {
        const saved = localStorage.getItem('pchat_token_' + this.firmId);
        if (saved) { this.token = saved; this.step.set('chat'); this.loadMsgs(); this.startLive(); }
      }
    } catch {}
    // Polling ab sirf BACKUP hai — main rasta SignalR live push
    this.pollTimer = setInterval(() => {
      if (this.step() === 'chat') this.loadMsgs();
      else if (this.step() === 'firms') this.loadAgencies();   // list ka unread bhi taaza rahe
    }, 30_000);
  }
  ngOnDestroy() {
    clearInterval(this.pollTimer);
    this.hub?.stop().catch(() => {});
  }

  // WhatsApp jaisa turant message — server push (SignalR)
  private hub?: signalR.HubConnection;
  private startLive() {
    if (this.hub) return;
    try {
      this.hub = new signalR.HubConnectionBuilder()
        .withUrl(`${environment.apiUrl}/api/hubs/party-chat`)
        .withAutomaticReconnect()
        .build();
      this.hub.on('newMessage', () => { if (this.step() === 'chat') this.loadMsgs(); });
      this.hub.onreconnected(() => this.hub?.invoke('JoinParty', this.token).catch(() => {}));
      this.hub.start()
        .then(() => this.hub?.invoke('JoinParty', this.token))
        .catch(() => { /* live nahi juda — 30s polling backup chalega */ });
    } catch { /* polling backup */ }
  }

  requestOtp() {
    this.busy.set(true); this.err.set('');
    const url = this.portalMode ? `${this.base}/portal/request-otp` : `${this.base}/request-otp`;
    const body = this.portalMode
      ? { phone: this.phone }
      : { firmId: this.firmId, phone: this.phone, inviteCode: this.inviteCode || null };
    this.http.post<any>(url, body).subscribe({
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
    if (this.portalMode) {
      // PORTAL: OTP ek baar → saari agencies ki list
      this.http.post<any>(`${this.base}/portal/verify`, { phone: this.phone, otp: this.otp }).subscribe({
        next: (r) => {
          this.busy.set(false);
          this.portalToken = r.token;
          try { localStorage.setItem('pchat_portal_token', r.token); } catch {}
          this.step.set('firms');
          this.loadAgencies();
        },
        error: (e) => { this.busy.set(false); this.err.set(e?.error?.error ?? 'OTP verify nahi hua'); }
      });
      return;
    }
    this.http.post<any>(`${this.base}/verify`, { firmId: this.firmId, phone: this.phone, otp: this.otp }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.token = r.token;
        try { localStorage.setItem('pchat_token_' + this.firmId, r.token); } catch {}
        this.firmName.set(r.firmName || '');
        this.partyName.set(r.partyName || '');
        this.step.set('chat');
        this.loadMsgs();
        this.startLive();   // OTP verify hote hi live connection
      },
      error: (e) => { this.busy.set(false); this.err.set(e?.error?.error ?? 'OTP verify nahi hua'); }
    });
  }

  // ===== PORTAL: agencies list + firm kholna + wapas =====
  loadAgencies() {
    if (!this.portalToken) return;
    this.http.get<any[]>(`${this.base}/portal/firms`, { params: { token: this.portalToken } }).subscribe({
      next: (l) => this.agencies.set(l || []),
      error: (e) => {
        if (e?.status === 401) {   // portal session expire → dobara OTP
          try { localStorage.removeItem('pchat_portal_token'); } catch {}
          this.portalToken = '';
          this.step.set('phone');
        }
      }
    });
  }

  openAgency(a: { firmId: string; firmName: string }) {
    if (this.busy()) return;
    this.busy.set(true);
    this.http.post<any>(`${this.base}/portal/open`, { token: this.portalToken, firmId: a.firmId }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.firmId = a.firmId;
        this.token = r.token;
        try { localStorage.setItem('pchat_token_' + a.firmId, r.token); } catch {}
        this.firmName.set(r.firmName || a.firmName);
        this.partyName.set(r.partyName || '');
        this.firstLoad = true;
        this.step.set('chat');
        this.loadMsgs(true);
        // Live push: nayi firm ke thread se jud jao (hub pehle se ho to sirf join)
        if (this.hub) this.hub.invoke('JoinParty', this.token).catch(() => {});
        else this.startLive();
      },
      error: (e) => { this.busy.set(false); alert('⚠️ ' + (e?.error?.error ?? 'Chat nahi khuli — dobara try karo')); }
    });
  }

  /** Chat se wapas agencies ki list par (sirf portal me) */
  goHome() {
    this.step.set('firms');
    this.loadAgencies();
  }

  @ViewChild('chatBox') chatBox?: ElementRef<HTMLDivElement>;
  private firstLoad = true;

  /** WhatsApp jaisa: khulte/bhejte hi NEECHE; purane padhte waqt naya aaye to jhatka nahi.
   *  Photos der se load hoti hain — 3 staged koshish + har (img load) par dobara. */
  scrollDown(force = false) {
    const go = () => {
      const el = this.chatBox?.nativeElement;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (force || nearBottom) el.scrollTop = el.scrollHeight;
    };
    setTimeout(go); setTimeout(go, 150); setTimeout(go, 450);
  }

  loadMsgs(jump = false) {
    this.http.get<any>(`${this.base}/messages`, { params: { token: this.token } }).subscribe({
      next: (r) => {
        this.firmName.set(r.firmName || this.firmName());
        this.partyName.set(r.partyName || this.partyName());
        this.msgs.set(r.messages || []);
        this.scrollDown(jump || this.firstLoad);   // pehli baar = seedha aakhri msg par
        this.firstLoad = false;
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
    try { if (this.portalMode) { localStorage.removeItem('pchat_portal_token'); this.portalToken = ''; this.agencies.set([]); } } catch {}
    this.hub?.stop().catch(() => {});
    this.hub = undefined;
    this.token = '';
    this.otp = '';
    this.msgs.set([]);
    this.step.set('phone');
  }

  send() {
    const body = this.draft.trim();
    if (!body || this.busy()) return;
    this.sendText(body);
  }

  private sendText(body: string) {
    this.busy.set(true);
    const replyToId = this.replyTo()?.id ?? null;
    this.http.post(`${this.base}/messages`, { token: this.token, body, replyToId }).subscribe({
      next: () => { this.busy.set(false); this.draft = ''; this.replyTo.set(null); this.loadMsgs(true); },
      error: (e) => { this.busy.set(false); alert('⚠️ ' + (e?.error?.error ?? 'Message nahi gaya')); }
    });
  }

  // ===== WhatsApp jaise: reply-quote + share + ek-tap ORDER =====
  replyTo = signal<PMsg | null>(null);
  startReply(m: PMsg) { this.replyTo.set(m); }

  /** Bot ki stock-photo? — "ORDER BZ-..." wali line se code nikaalo (button ke liye) */
  orderCode(m: PMsg): string | null {
    if (!m.body || m.attachmentType !== 'image') return null;
    const match = m.body.match(/ORDER\s+((?:NAM|BZ)-\S+)/i);
    return match ? match[1].replace(/[.,;]+$/, '') : null;
  }
  // ☑ kai photo chun kar EK order (ek order, kai item)
  picked = signal<Set<string>>(new Set());
  clearPicks() { this.picked.set(new Set<string>()); }
  togglePick(code: string) {
    const s = new Set(this.picked());
    s.has(code) ? s.delete(code) : s.add(code);
    this.picked.set(s);
  }
  orderPicked() {
    const codes = [...this.picked()];
    if (!codes.length || this.busy()) return;
    this.busy.set(true);
    this.http.post(`${this.base}/multi-order`, { token: this.token, codes }).subscribe({
      next: () => { this.busy.set(false); this.picked.set(new Set()); this.loadMsgs(true); },
      error: (e) => { this.busy.set(false); alert('⚠️ ' + (e?.error?.error ?? 'Order shuru nahi hua')); }
    });
  }

  // ---- 🖼️ MEDIA (saari photos ek jagah) ----
  mediaOpen = signal(false);
  flashId = signal<string | null>(null);

  /** Chat ki saari photos — nayi sabse pehle (WhatsApp ki tarah). */
  mediaList = computed(() =>
    this.msgs().filter(m => m.attachmentType === 'image' && m.attachmentUrl).slice().reverse());

  openMedia() { if (this.step() === 'chat') this.mediaOpen.set(true); }

  /** Photo par tap = media band, chat me usi message par, 2 sec ke liye chamak. */
  jumpTo(m: PMsg) {
    this.mediaOpen.set(false);
    setTimeout(() => {
      const el = document.getElementById('pcm-' + m.id);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      this.flashId.set(m.id);
      setTimeout(() => this.flashId.set(null), 2000);
    }, 60);
  }

  // ---- ☑ QUICK-REPLY (tap-button) ----
  // Bot message ke aakhir me [[QR:1=Per METER|2=Per KG]] aata hai. Wo screen par
  // dikhta nahi — uski jagah button ban jate hain. Buttons sirf SABSE NAYE bot
  // message par, warna purane sawal ke button bhi dabaye ja sakte the.
  private static QR_RX = /\[\[QR:([^\]]+)\]\]/;

  visibleBody(body: string): string {
    return body.replace(PartyChatPublicComponent.QR_RX, '').trimEnd();
  }

  quickReplies(m: PMsg): { val: string; label: string }[] | null {
    if (m.sender !== 'firm' || !m.body) return null;
    const list = this.msgs();
    if (list.length === 0 || list[list.length - 1].id !== m.id) return null;   // sirf aakhri par
    const mt = m.body.match(PartyChatPublicComponent.QR_RX);
    if (!mt) return null;
    return mt[1].split('|').map(p => {
      const i = p.indexOf('=');
      return i < 0 ? { val: p.trim(), label: p.trim() }
                   : { val: p.slice(0, i).trim(), label: p.slice(i + 1).trim() };
    }).filter(q => q.val.length > 0);
  }

  sendQuick(val: string) {
    if (this.busy()) return;
    this.replyTo.set(null);
    this.sendText(val);
  }

  /** 🛒 button — ORDER <code> khud bhej do, typing ki zaroorat nahi */
  quickOrder(code: string) {
    if (this.busy()) return;
    this.replyTo.set(null);
    this.sendText('ORDER ' + code);
  }

  /** 📤 photo aage bhejo — phone ka share (WhatsApp/wagera), na chale to nayi tab me kholo */
  async shareImage(m: PMsg) {
    const url = this.fileUrl(m.attachmentUrl!);
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
      const nav: any = navigator;
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({ files: [file], text: m.body || '' });
        return;
      }
    } catch { /* share cancel/na-mumkin — neeche fallback */ }
    window.open(url, '_blank');
  }
}
