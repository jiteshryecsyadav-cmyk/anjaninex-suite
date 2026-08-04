import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/**
 * Sales ki horizontal patti — bilkul trading app ke sub-nav jaisi.
 *
 * Sidebar me chaar alag line hone se wo bhar jata tha aur ye chaaron ek hi
 * kaam ke hisse hain (order → challan → bill → return). Isliye sidebar me ek
 * "Sales" aur andar ye patti — wahi kram, bina lambi list ke.
 *
 * Jis pardah ki ijazat nahi, uska button dikhta hi nahi — sidebar wala hi niyam.
 */
@Component({
  selector: 'mfg-sales-sub-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="mfg-sub-nav">
      @for (t of tabs(); track t.path) {
        <a [routerLink]="t.path" routerLinkActive="tn-active" class="tn-link">
          {{ t.icon }} {{ t.label }}
        </a>
      }
    </div>
  `,
  styles: [`
    .mfg-sub-nav {
      display: flex; gap: 4px; flex-wrap: wrap;
      padding: 4px; background: #fff;
      border: 1px solid #D6DDEA; border-radius: 10px;
      margin-bottom: 16px; align-items: center;
    }
    .mfg-sub-nav .tn-link {
      padding: 9px 14px; font-size: 13px; font-weight: 700; color: #4A5878;
      text-decoration: none; border-radius: 6px; display: inline-flex;
      align-items: center; gap: 6px; transition: all 0.15s;
    }
    .mfg-sub-nav .tn-link:hover { background: #FAF7F0; color: #1B2E5C; }
    .mfg-sub-nav .tn-active {
      background: var(--anjaninex-navy, #1B2E5C) !important; color: #fff !important;
    }
    @media (max-width: 640px) {
      .mfg-sub-nav .tn-link { padding: 8px 10px; font-size: 12px; }
    }
  `]
})
export class SalesSubNavComponent {
  private auth = inject(AuthService);

  private all = [
    { path: '/sales/order',   icon: '📄', label: 'Sales Order',      perm: 'sales.order.view.place' },
    { path: '/sales/challan', icon: '🚚', label: 'Delivery Challan', perm: 'sales.challan.view.place' },
    { path: '/sales/invoice', icon: '🧮', label: 'Tax Invoice',      perm: 'sales.invoice.view.place' },
    { path: '/sales/return',  icon: '↩️', label: 'Sales Return',     perm: 'sales.sreturn.view.place' }
  ];

  tabs = computed(() => this.all.filter(t => this.auth.can(t.perm)));
}
