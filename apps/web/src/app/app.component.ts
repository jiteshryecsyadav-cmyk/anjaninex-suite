import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdateBannerComponent } from './core/version/update-banner.component';
import { ToastContainerComponent } from './shared/toast-container.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, UpdateBannerComponent, ToastContainerComponent],
  template: `
    <app-update-banner></app-update-banner>
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
  `
})
export class AppComponent implements OnInit {
  // In input TYPES par auto Title-Case NAHI hoga
  private static readonly SKIP_TYPES = new Set([
    'email', 'password', 'number', 'tel', 'url', 'date', 'time',
    'datetime-local', 'month', 'week', 'color', 'search'
  ]);
  // name/id/placeholder me in shabd wale special fields skip (warna login/GST/code toot jaye)
  private static readonly SKIP_HINT =
    /gst|pan|ifsc|hsn|sac|email|code|url|password|otp|upi|user|login|search|phone|mobile|whatsapp|website|api|token|rate|amount|qty|quantit|pincode|\bpin\b|account|\bacc\b|number|http|\bid\b/i;

  ngOnInit(): void {
    // Last firm theme (is device par) — login page + app-load par lagao taaki login seamless lage.
    // Login se PEHLE firm context nahi hota, isliye pichhli firm ka theme yaad rakhte hain.
    try {
      const t = localStorage.getItem('ax_firm_theme');
      document.body.classList.remove(
        'theme-sunset', 'theme-aurora', 'theme-neon', 'theme-violet', 'theme-gold',
        'theme-path1', 'theme-path2', 'theme-path3', 'theme-path4', 'theme-anjaninex'
      );
      if (t && t !== 'classic') document.body.classList.add(t);
    } catch {}

    // Global auto Title-Case: har word ka pehla letter CAPITAL, baaki small ("ready made" -> "Ready Made").
    // Capture-phase me chalta hai (Angular ke form listener se PEHLE) — to ngModel/form ko
    // capitalized value milti hai. Har form alag se edit karne ki zaroorat nahi.
    document.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;

      if (el.tagName === 'INPUT') {
        const type = ((el as HTMLInputElement).getAttribute('type') || 'text').toLowerCase();
        if (AppComponent.SKIP_TYPES.has(type)) return;
      }
      const ac = (el.getAttribute('autocapitalize') || '').toLowerCase();
      if (ac === 'none' || ac === 'off') return;
      if (el.classList.contains('no-cap') || (el as any).dataset?.nocap !== undefined) return;

      const hint = `${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''} ${el.getAttribute('placeholder') || ''}`;
      if (AppComponent.SKIP_HINT.test(hint)) return;

      const v = el.value;
      if (!v) return;
      // value me '@' ya koi digit ho (email/UPI/IFSC/GST/account/phone/code) → Title-case mat karo
      if (/[@\d]/.test(v)) return;
      const tc = v.replace(/[\p{L}][\p{L}'’]*/gu,
        (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      if (tc !== v) {
        const pos = el.selectionStart;
        el.value = tc;
        try { el.setSelectionRange(pos, pos); } catch {}
      }
    }, true); // capture phase

    // PWA INSTALL EVENT — Chrome ye event page-load par EK baar deta hai, kabhi-kabhi
    // component ke ngOnInit se pehle. Isliye app-level par pakad ke window par rakh do —
    // koi bhi page (jaise Party Chat) baad me use kar sake.
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      (window as any).__pwaInstallEvt = e;
      window.dispatchEvent(new Event('pwa-install-ready'));
    });

    // GLOBAL PASSWORD EYE 👁 — har password field par show/hide button apne aap.
    // MutationObserver naye render hue fields (modals, lazy pages) bhi pakad leta hai —
    // kisi form ko alag se edit karne ki zaroorat nahi.
    this.initPasswordEyes();
  }

  private initPasswordEyes(): void {
    const enhance = (input: HTMLInputElement) => {
      if (input.dataset['pwEye']) return;   // dobara mat lagao (khud ka toggle wale bhi isi se skip)
      input.dataset['pwEye'] = '1';

      // Input ko relative wrapper me daalo taaki eye button uske andar-right baithe
      const wrap = document.createElement('span');
      wrap.style.cssText = 'position:relative;display:inline-block;width:100%;';
      input.parentNode?.insertBefore(wrap, input);
      wrap.appendChild(input);
      if (!input.style.paddingRight) input.style.paddingRight = '34px';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.tabIndex = -1;
      btn.textContent = '👁';
      btn.setAttribute('aria-label', 'Password dikhao/chhupao');
      btn.style.cssText =
        'position:absolute;right:8px;top:50%;transform:translateY(-50%);' +
        'background:none;border:0;cursor:pointer;font-size:15px;opacity:.65;padding:2px;line-height:1;z-index:5;';
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁';
      });
      wrap.appendChild(btn);
    };

    const scan = (root: ParentNode) =>
      root.querySelectorAll?.('input[type="password"]').forEach(el => enhance(el as HTMLInputElement));

    scan(document);
    new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach(n => {
          if (n instanceof HTMLElement) {
            if (n.matches?.('input[type="password"]')) enhance(n as HTMLInputElement);
            scan(n);
          }
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
}
