import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TradingSubNavComponent } from '../../trading/components/trading-sub-nav.component';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-permissions',
  standalone: true,
  imports: [CommonModule, TradingSubNavComponent, BackButtonComponent],
  template: `
  <div class="max-w-7xl mx-auto">
    <div class="page-top-bar"><app-back-button></app-back-button></div>

    <div class="mb-4">
      <h2 class="font-display font-black text-2xl text-[#1B2E5C]">🔐 Role Permissions</h2>
      <p class="text-sm text-[#4A5878]">Map permissions to roles — Create / Read / Update / Delete / Approve / Export / Bulk</p>
    </div>

    <app-trading-sub-nav></app-trading-sub-nav>

    <div class="card p-10 text-center">
      <div class="text-5xl mb-3">🔐</div>
      <div class="font-display font-black text-xl text-[#1B2E5C] mb-2">Permissions Matrix — Coming Up Next</div>
      <p class="text-sm text-[#4A5878] max-w-xl mx-auto">
        Smart grouped matrix with 7-column actions, data-scope toggle (Only mine / Branch / Firm / All),
        inherited indicator with parent tooltip, diff drawer, bulk presets (Viewer / Editor / Manager / Admin),
        and role-to-role compare. Backend endpoints to be added next.
      </p>
    </div>
  </div>
  `,
  styles: [`
    .card { background:#fff; border:1px solid #D6DDEA; border-radius:10px; }
  `]
})
export class PermissionsComponent {}
