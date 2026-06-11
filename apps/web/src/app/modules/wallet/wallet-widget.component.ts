import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WalletService } from './wallet.service';
import { RechargeModalComponent } from './recharge-modal.component';
import { WalletIconComponent } from '../../shared/wallet-icon.component';

@Component({
  selector: 'app-wallet-widget',
  standalone: true,
  imports: [CommonModule, RouterLink, RechargeModalComponent, WalletIconComponent],
  template: `
    <div class="ww-card">
      <div class="ww-head">
        <div>
          <div class="ww-title" style="display:flex;align-items:center;gap:7px"><app-wallet-icon [size]="18"></app-wallet-icon> Wallet &amp; Subscription</div>
          <div class="ww-sub">Balance · Plan · Auto-recharge</div>
        </div>
        <button class="refresh-btn" (click)="wallet.refresh(true)" title="Refresh">↻</button>
      </div>

      <!-- Balance card (navy with red accent strip, solid colors) -->
      <div class="bal-card" [class.low]="wallet.isLow()">
        <div class="bal-side"></div>
        <div class="bal-body">
          <div class="bal-label">Wallet Balance</div>
          <div class="bal-amt">
            ₹{{ (wallet.balance() | number:'1.0-0') }}<span class="dec">.00</span>
          </div>
          <div class="bal-meta">
            ⏱ ~{{ wallet.runwayDays() }} days runway at current usage
          </div>
        </div>
      </div>

      <button class="btn-primary block" (click)="showModal.set(true)">
        💳 Recharge Now
      </button>

      <a routerLink="/wallet" class="btn-link block">📜 View Full Ledger →</a>

      <div class="info-row">
        <span class="lbl">Plan</span>
        <span><strong class="red">Enterprise</strong> · ₹6,999/mo</span>
      </div>
      <div class="info-row">
        <span class="lbl">Next billing</span>
        <span><strong>15-Jun-2026</strong></span>
      </div>
      <div class="info-row">
        <span class="lbl">Auto-recharge</span>
        <span class="flag ok">✓ ON</span>
      </div>

      @if (wallet.isLow()) {
        <div class="warn-banner">
          ⚠️ Wallet low — AI scans may pause when balance hits ₹0
        </div>
      }
    </div>

    @if (showModal()) {
      <app-recharge-modal (closed)="showModal.set(false)"></app-recharge-modal>
    }
  `,
  styles: [`
    :host{display:block}
    .ww-card{background:var(--card,#fff);border-radius:12px;border:1px solid var(--border,#D6DDEA);box-shadow:0 2px 12px rgba(27,46,92,0.08);overflow:hidden}
    .ww-head{display:flex;justify-content:space-between;align-items:center;padding:11px 14px 9px;border-bottom:1px solid var(--border,#D6DDEA)}
    .ww-title{font-size:11px;font-weight:800;color:var(--ax-navy);text-transform:uppercase;letter-spacing:0.6px}
    .ww-sub{font-size:9px;color:var(--xs,#8893AC);margin-top:2px;font-weight:500}
    .refresh-btn{background:transparent;border:0;color:var(--xs,#8893AC);width:24px;height:24px;border-radius:5px;cursor:pointer;font-size:14px}
    .refresh-btn:hover{background:var(--ax-navy-soft);color:var(--ax-navy)}

    .bal-card{background:var(--ax-navy);color:#fff;border-radius:10px;padding:14px;margin:14px;position:relative;overflow:hidden}
    .bal-card.low{background:var(--ax-navy-dark)}
    .bal-side{position:absolute;top:0;right:0;width:60px;height:100%;background:var(--ax-red);clip-path:polygon(40% 0,100% 0,100% 100%,0 100%)}
    .bal-body{position:relative;z-index:2}
    .bal-label{font-size:10px;opacity:0.8;text-transform:uppercase;letter-spacing:0.5px;font-weight:700}
    .bal-amt{font-size:26px;font-weight:800;font-family:'DM Mono',monospace;line-height:1.1;margin-top:4px}
    .bal-amt .dec{font-size:11px;opacity:0.6;margin-left:6px}
    .bal-meta{font-size:10px;opacity:0.85;margin-top:6px}

    .btn-primary.block{display:block;width:calc(100% - 28px);margin:0 14px 8px;padding:10px;background:var(--ax-red);color:#fff;border:0;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit}
    .btn-primary.block:hover{background:var(--ax-red-dark)}
    .btn-link.block{display:block;width:calc(100% - 28px);margin:0 14px 12px;padding:8px;text-align:center;border:1.5px solid var(--border,#D6DDEA);border-radius:8px;color:var(--ax-navy);font-size:11px;font-weight:700;text-decoration:none}
    .btn-link.block:hover{background:var(--ax-navy-soft);border-color:var(--ax-navy)}

    .info-row{display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:6px 14px;border-top:1px dashed var(--border,#D6DDEA)}
    .lbl{color:var(--soft,#4A5878);font-weight:600}
    .red{color:var(--ax-red)}
    .flag{font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px}
    .flag.ok{background:#DCFCE7;color:#16A34A}

    .warn-banner{margin:10px 14px 14px;padding:8px 10px;background:#FEF3C7;border:1px solid #D97706;border-radius:6px;font-size:10px;color:#92400E;font-weight:600}

    @media(max-width:640px){
      .ww-head{flex-wrap:wrap;gap:8px}
      .info-row{flex-wrap:wrap;gap:4px}
    }
  `]
})
export class WalletWidgetComponent {
  wallet = inject(WalletService);
  showModal = signal(false);

  constructor() {
    this.wallet.refresh();
  }
}
