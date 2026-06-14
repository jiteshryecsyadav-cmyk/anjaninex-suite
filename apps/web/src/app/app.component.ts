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
        'theme-path1', 'theme-path2', 'theme-path3', 'theme-path4'
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
  }
}
