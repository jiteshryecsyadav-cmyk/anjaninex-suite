import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AccountingService, AccountHead } from '../services/accounting.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-account-heads',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, BackButtonComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b] flex items-center gap-2">
            📂 Account Heads
          </h2>
          <p class="text-sm text-[#6b3fa0]">
            Top-level chart of accounts — Assets · Liabilities · Capital · Income · Expenses
          </p>
        </div>
        <div class="text-xs text-gray-500">
          {{ heads().length }} heads
        </div>
      </div>

      <!-- Module sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5]">
        <a routerLink="/accounting/heads" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           [routerLinkActiveOptions]="{exact:true}"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">
          Heads
        </a>
        <a routerLink="/accounting/groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">
          Groups
        </a>
        <a routerLink="/accounting/sub-groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">
          Sub Groups
        </a>
        <a routerLink="/accounting/ledgers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">
          Ledgers
        </a>
        <a routerLink="/accounting/vouchers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">
          Vouchers
        </a>
        <a routerLink="/accounting/trial-balance" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">
          Trial Balance
        </a>
        <a routerLink="/accounting/profit-loss" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">
          P&amp;L
        </a>
        <a routerLink="/accounting/balance-sheet" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">
          Balance Sheet
        </a>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="card text-center text-gray-500">Loading…</div>
      }

      <!-- Heads grid -->
      @if (!loading()) {
        <div class="grid grid-cols-5 gap-3 mb-6">
          @for (h of heads(); track h.id) {
            <div class="card border-l-4" [class]="natureClass(h.nature)"
                 [style.border-left]="'4px solid ' + headColor(h.nature)"
                 [style.background]="headColor(h.nature) + '0d'">
              <div class="flex items-center justify-between mb-2">
                <div class="text-3xl">{{ natureIcon(h.nature) }}</div>
                <span class="text-xs font-mono px-2 py-0.5 rounded bg-[#f0e6ff] text-[#5c1a8b]">
                  {{ h.code }}
                </span>
              </div>
              <div class="font-display font-bold text-lg" [style.color]="headColor(h.nature)">{{ h.name }}</div>
              <div class="text-xs text-gray-500 mt-1 uppercase">{{ h.nature }}</div>
              <div class="text-xs mt-2 flex items-center gap-1">
                <span class="font-mono">{{ h.sign }}</span>
                <span class="text-gray-400">·</span>
                <a [routerLink]="['/accounting/groups']" [queryParams]="{ headId: h.id }"
                   class="text-[#5c1a8b] hover:underline">
                  {{ h.groupCount }} groups →
                </a>
              </div>
            </div>
          }
        </div>

        <!-- Info banner -->
        <div class="card bg-blue-50 border border-blue-200 text-blue-900">
          <p class="text-sm">
            <strong>ℹ️ System Heads:</strong> These 5 heads are the foundation of double-entry accounting
            and cannot be modified. Add custom <a routerLink="/accounting/groups" class="underline">Groups</a>
            under each head, then <a routerLink="/accounting/sub-groups" class="underline">Sub Groups</a>,
            then <a routerLink="/accounting/ledgers" class="underline">Ledgers</a>.
          </p>
        </div>
      }
    </div>
  `
})
export class AccountHeadsComponent {
  private svc = inject(AccountingService);
  heads = signal<AccountHead[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.svc.listHeads().subscribe({
      next: (h) => {
        this.heads.set(h);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  natureIcon(n: string): string {
    const map: Record<string, string> = {
      assets: '🏦',
      liabilities: '💳',
      capital: '💰',
      income: '📈',
      expenses: '📉'
    };
    return map[n] ?? '📂';
  }

  natureClass(n: string): string {
    const map: Record<string, string> = {
      assets: 'border-green-500',
      liabilities: 'border-red-500',
      capital: 'border-purple-500',
      income: 'border-blue-500',
      expenses: 'border-orange-500'
    };
    return map[n] ?? 'border-gray-300';
  }

  // Accent colour per head TYPE — consistent across all cards of the same nature.
  headColor(n: string): string {
    const map: Record<string, string> = {
      assets: '#0284c7',     // blue
      liabilities: '#d97706', // amber
      income: '#16a34a',     // green
      expenses: '#d91e28',   // red
      capital: '#9333ea'     // purple
    };
    return map[n] ?? '#1B2E5C';
  }
}
