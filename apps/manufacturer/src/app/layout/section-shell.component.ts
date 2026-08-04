import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { findSection, tabKhulta } from '../core/nav';

/**
 * Har hisse (Sales, Purchase, Production, Stock, Masters, Reports) ka common
 * khol — upar horizontal patti, neeche pardah.
 *
 * Trading app me bhi yahi shakl hai: sidebar me ek line, andar patti. Har
 * hisse ki apni chaar-paanch line sidebar me daalte to wo bhar jata aur roz
 * ka kaam neeche chhup jata.
 *
 * Patti khol me banti hai, pardah ke andar nahi — isliye pardah badalte waqt
 * dobara nahi banti aur jhilmilaati nahi.
 */
@Component({
  selector: 'mfg-section-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (tabs().length > 0) {
      <div class="mfg-sub-nav">
        @for (t of tabs(); track t.path) {
          @if (t.soon) {
            <span class="tn-link tn-soon" title="Ye abhi bana nahi hai">
              {{ t.icon }} {{ t.label }} <span class="tn-chip">aage</span>
            </span>
          } @else {
            <a [routerLink]="t.path" routerLinkActive="tn-active" class="tn-link">
              {{ t.icon }} {{ t.label }}
            </a>
          }
        }
      </div>
    }
    <router-outlet />
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
    .mfg-sub-nav a.tn-link:hover { background: #FAF7F0; color: #1B2E5C; }
    .mfg-sub-nav .tn-active {
      background: var(--anjaninex-navy, #1B2E5C) !important; color: #fff !important;
    }
    .mfg-sub-nav .tn-soon { color: #9AA5BC; cursor: not-allowed; }
    .mfg-sub-nav .tn-chip {
      font-size: 9.5px; font-weight: 800; letter-spacing: .04em;
      background: #EEF1F6; color: #9AA5BC; padding: 1px 5px; border-radius: 4px;
    }
    @media (max-width: 640px) {
      .mfg-sub-nav .tn-link { padding: 8px 10px; font-size: 12px; }
    }
  `]
})
export class SectionShellComponent {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  /**
   * Kaunsa hissa — route ke `data.section` se. Patti sirf wahi button dikhati
   * hai jinki ijazat hai, sidebar wala hi niyam.
   */
  tabs = computed(() => {
    const key = this.route.snapshot.data['section'] as string | undefined;
    const sec = key ? findSection(key) : undefined;
    return (sec?.tabs ?? []).filter(t => tabKhulta(t, p => this.auth.can(p)));
  });
}
