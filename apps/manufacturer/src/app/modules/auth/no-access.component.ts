import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

/**
 * Permission nahi hai. Jaan-boojh kar batate hain ki KAUNSI ijazat chahiye —
 * warna aadmi malik ke paas jaake sirf "nahi khul raha" bol pata hai aur
 * malik ko samajh hi nahi aata ki kya on karna hai.
 */
@Component({
  selector: 'mfg-no-access',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen grid place-items-center p-4">
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 text-center">
        <div class="text-4xl mb-2">🔒</div>
        <div class="font-extrabold text-brand-purple text-lg mb-1">Ye screen aapke liye nahi hai</div>
        <p class="text-sm text-slate-600 mb-3">
          Malik se kahiye ki aapke role me ye ijazat chalu kar dein.
        </p>
        @if (need) {
          <div class="text-[11px] font-mono bg-brand-bg text-brand-purple
                      rounded-lg px-3 py-2 mb-4 break-all">{{ need }}</div>
        }
        <a routerLink="/" class="btn-line inline-block">Wapas</a>
      </div>
    </div>
  `
})
export class NoAccessComponent {
  need = inject(ActivatedRoute).snapshot.queryParamMap.get('need');
}
