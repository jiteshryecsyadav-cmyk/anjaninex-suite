import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * WhatsApp send button + popover — kisi bhi report/page se text bhejne ke liye.
 * - Button dabao → chhota popup: MOBILE NO input (suggestedPhone pre-filled, editable)
 * - "Send" → wa.me/91XXXXXXXXXX par message pre-typed khul jata hai
 * Usage:
 *   <app-wa-send [message]="waMessage()" [suggestedPhone]="selectedPartyPhone()"></app-wa-send>
 */
@Component({
  selector: 'app-wa-send',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="was-wrap">
      <button type="button" class="was-btn" (click)="toggle()" title="Report WhatsApp karo">
        💬 WhatsApp
      </button>
      @if (open()) {
        <div class="was-pop">
          <div class="was-title">📱 Kis number par bhejni hai?</div>
          <input type="tel" [(ngModel)]="phone" maxlength="13"
                 placeholder="10-digit mobile no" class="was-ip"
                 (keyup.enter)="send()">
          @if (err()) { <div class="was-err">⚠️ {{ err() }}</div> }
          <div class="was-foot">
            <button type="button" class="was-cancel" (click)="open.set(false)">Cancel</button>
            <button type="button" class="was-send" (click)="send()">✓ WhatsApp Karo</button>
          </div>
          <div class="was-hint">Message pre-typed khulega — aap dekh kar Send karna</div>
        </div>
      }
    </div>
  `,
  styles: [`
    .was-wrap { position: relative; display: inline-block; }
    .was-btn { border: 1px solid #86efac; background: #dcfce7; color: #15803d; border-radius: 8px;
      padding: 7px 14px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: inherit; }
    .was-btn:hover { background: #bbf7d0; }
    .was-pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 60; width: 250px;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.15); }
    .was-title { font-size: 12px; font-weight: 800; color: #1B2E5C; margin-bottom: 8px; }
    .was-ip { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px;
      font-size: 13px; font-family: 'JetBrains Mono', monospace; }
    .was-err { font-size: 11px; color: #b91c1c; margin-top: 5px; }
    .was-foot { display: flex; gap: 6px; margin-top: 10px; }
    .was-cancel { flex: 1; border: 1px solid #d1d5db; background: #fff; color: #374151;
      border-radius: 8px; padding: 7px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
    .was-send { flex: 2; border: 0; background: #16a34a; color: #fff; border-radius: 8px;
      padding: 7px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: inherit; }
    .was-send:hover { background: #15803d; }
    .was-hint { font-size: 9.5px; color: #9ca3af; margin-top: 7px; text-align: center; }
  `]
})
export class WaSendComponent {
  /** Jo text WhatsApp par jayega (report ka summary) */
  @Input() message = '';
  /** Suggested number — single party select ho to uska phone pre-fill */
  @Input() set suggestedPhone(v: string | null | undefined) {
    if (v && !this.phone) this.phone = this.tenDigits(v);
  }
  @Output() sent = new EventEmitter<string>();

  open = signal(false);
  err = signal('');
  phone = '';

  toggle() { this.open.set(!this.open()); this.err.set(''); }

  private tenDigits(v: string): string {
    const d = (v || '').replace(/\D/g, '');
    return d.length > 10 ? d.slice(-10) : d;
  }

  send() {
    const ten = this.tenDigits(this.phone);
    if (ten.length !== 10 || !/^[6-9]/.test(ten)) {
      this.err.set('Sahi 10-digit mobile no daalo (6-9 se shuru)');
      return;
    }
    if (!this.message?.trim()) {
      this.err.set('Bhejne ke liye report me data nahi hai');
      return;
    }
    // wa.me URL limit ~2000 chars — lamba message trim
    const text = this.message.length > 1800 ? this.message.slice(0, 1800) + '\n…' : this.message;
    window.open(`https://wa.me/91${ten}?text=${encodeURIComponent(text)}`, '_blank');
    this.open.set(false);
    this.sent.emit(ten);
  }
}
