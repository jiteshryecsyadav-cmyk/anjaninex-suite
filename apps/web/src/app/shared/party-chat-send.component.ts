import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

/**
 * "Party Chat me bhejo" button — WhatsApp button ki jagah.
 *
 * Kyun: WhatsApp par bheja hua kuch app me record nahi hota, aur party ka jawab
 * bhi kahin nahi dikhta. Party Chat me poori baat-cheet bill/party ke saath
 * app me hi rehti hai.
 *
 * Ye party ka chat kholta hai aur message draft me bhar deta hai — bhejta KHUD
 * NAHI. User padh ke, badal ke, khud bhejta hai (galti se kuch chala jana bura hoga).
 *
 * Usage:
 *   <app-party-chat-send [partyId]="bill.buyerPartyId" [message]="msg"></app-party-chat-send>
 *   <app-party-chat-send [partyId]="p.id" label="Chat" [small]="true"></app-party-chat-send>
 */
@Component({
  selector: 'app-party-chat-send',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button" (click)="go()" [disabled]="!partyId"
            [title]="partyId ? 'Party Chat me bhejo' : 'Is party ka record nahi — chat nahi ho sakti'"
            [class.pcs-sm]="small" class="pcs-btn">
      💬 {{ label }}
    </button>
  `,
  styles: [`
    .pcs-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: #7C3AED; color: #fff; font-weight: 700; font-size: 13px;
      border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer;
    }
    .pcs-btn:hover { background: #6D28D9; }
    .pcs-btn:disabled { background: #C4B5FD; cursor: not-allowed; }
    .pcs-sm { font-size: 11px; padding: 5px 9px; border-radius: 6px; }
  `]
})
export class PartyChatSendComponent {
  /** Kis party se baat karni hai (buyer/supplier ki party id). */
  @Input() partyId?: string | null;
  /** Chat ke draft me pehle se bhara hua message (optional). */
  @Input() message?: string | null;
  @Input() label = 'Party Chat';
  @Input() small = false;

  private router = inject(Router);

  go() {
    if (!this.partyId) return;
    this.router.navigate(['/party-chat'], {
      queryParams: { partyId: this.partyId, msg: this.message || undefined }
    });
  }
}
