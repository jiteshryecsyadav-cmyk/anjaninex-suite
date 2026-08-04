import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface User {
  id: string;
  firmId: string | null;
  agentId: string | null;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  defaultBranchId: string | null;
  canViewAllBranches: boolean;
  roles: string[];
  permissions: string[];
  /** agency | manufacturer | transport | buyer | both — firm ka dhandha */
  businessKind?: string;
}

export interface FirmChoice { firmId: string; firmName: string; }

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  // MULTI-FIRM: same login kai firms me ho to token ki jagah ye list aati hai
  firms?: FirmChoice[] | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private _user = signal<User | null>(null);
  private _accessToken = signal<string | null>(null);

  user = this._user.asReadonly();
  accessToken = this._accessToken.asReadonly();
  isAuthenticated = computed(() => this._accessToken() !== null);

  // App background/band me itni der se zyada raha to auto-logout (mobile security).
  // ⚠️ "Mujhe yaad rakho" lagaya ho to ye niyam LAGTA HI NAHI — field staff phone
  // jeb me rakh kar ghanton kaam karta hai, har baar id/password nahi daal sakta.
  private static readonly BG_LOGOUT_MS = 10 * 60 * 1000; // 10 minute
  private static remembered(): boolean {
    try { return localStorage.getItem('ax_remember') === '1'; } catch { return false; }
  }
  /** Login page pichhla username bhar sake — password kabhi nahi rakhte. */
  static lastUsername(): string {
    try { return localStorage.getItem('ax_last_user') || ''; } catch { return ''; }
  }

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          localStorage.setItem('ax_bg', String(Date.now()));   // background gaya — time note
        } else {
          const bg = +(localStorage.getItem('ax_bg') || 0);     // wapas aaya
          localStorage.removeItem('ax_bg');
          if (!AuthService.remembered()
              && this.isAuthenticated() && bg && Date.now() - bg > AuthService.BG_LOGOUT_MS) {
            this.logout();                                      // der tak band raha → logout
          }
        }
      });
    }
  }

  /**
   * Login. MULTI-FIRM: agar same login kai firms me hai to session set NAHI hota —
   * firms ki list return hoti hai; UI firm chunwa ke firmId ke saath dobara call kare.
   */
  async login(identifier: string, password: string, firmId?: string, remember = true): Promise<FirmChoice[] | null> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.apiUrl}/api/auth/login`, {
        identifier,
        password,
        firmId: firmId ?? null,
        remember
      })
    );
    // "Mujhe yaad rakho" — ye do cheezein yaad rakhte hain: (1) auto-logout mat
    // karo, (2) agli baar username bhara-bhara mile. Password kabhi nahi rakhte.
    try {
      if (remember) {
        localStorage.setItem('ax_remember', '1');
        localStorage.setItem('ax_last_user', identifier);
      } else {
        localStorage.removeItem('ax_remember');
        localStorage.removeItem('ax_last_user');
      }
    } catch {}
    if (res.firms && res.firms.length > 1) return res.firms;   // firm chunni padegi
    this.setSession(res);
    return null;
  }

  /** MULTI-FIRM: current user ki saari firms (top-bar switcher ke liye). */
  myFirms() {
    return this.http.get<FirmChoice[]>(`${environment.apiUrl}/api/auth/my-firms`);
  }

  /** MULTI-FIRM: bina password dusri firm me switch — naya token le ke poora app reload. */
  async switchFirm(firmId: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.apiUrl}/api/auth/switch-firm`, { firmId })
    );
    this.setSession(res);
    localStorage.removeItem('branchId');   // purani firm ki branch nayi me invalid hogi
    window.location.href = '/';            // full reload — saare caches/signals naya context lein
  }

  // SINGLE-FLIGHT: ek waqt me sirf EK refresh call — 5 requests ek saath 401 hon
  // to bhi /auth/refresh sirf ek baar jata hai (warna 5/min rate-limit turant khatam).
  private refreshInFlight: Promise<boolean> | null = null;

  refresh(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.doRefresh().finally(() => { this.refreshInFlight = null; });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<boolean> {
    // Refresh token lives in an HttpOnly cookie (P0-13). It is NOT readable from
    // JS, so we must NOT gate on localStorage — just call refresh and let the
    // cookie auto-attach via credentials: 'include'.
    try {
      const res = await fetch(`${environment.apiUrl}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) return false;
      const data: LoginResponse = await res.json();
      this._accessToken.set(data.accessToken);
      this._user.set(data.user);
      sessionStorage.setItem('user', JSON.stringify(data.user));
      return true;
    } catch {
      return false;
    }
  }

  /** Refresh fail hone par poori local session saaf karke login bhejo (loop-breaker). */
  hardLogout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/api/auth/logout`, {})
      );
    } catch {}
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * P0-13 fix: token storage strategy
   *   - ACCESS token: in memory ONLY (signal) — destroyed on tab close
   *   - REFRESH token: HttpOnly+Secure+SameSite=Strict cookie (set by API)
   *                    JavaScript CANNOT read this, so XSS cannot exfiltrate it
   *   - USER object: sessionStorage (not localStorage) — same-tab persistence,
   *                  no cross-tab leakage, cleared on tab close
   *
   * On page refresh:
   *   1. signal is empty (tab reload wipes memory)
   *   2. /api/auth/refresh is called — the HttpOnly cookie auto-attaches
   *   3. API returns a fresh access token
   *   4. session restored
   */
  async restoreSession(): Promise<void> {
    // App band/background me der tak raha to session restore mat karo — par
    // "Mujhe yaad rakho" wale par ye niyam nahi lagta (upar dekho).
    const bg = +(localStorage.getItem('ax_bg') || 0);
    if (!AuthService.remembered() && bg && Date.now() - bg > AuthService.BG_LOGOUT_MS) {
      localStorage.removeItem('ax_bg');
      this.clearSession();
      return;
    }
    // Try silent refresh — HttpOnly cookie attaches automatically with credentials: include
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',     // critical for HttpOnly cookie
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data: LoginResponse = await res.json();
        this._accessToken.set(data.accessToken);
        this._user.set(data.user);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        return;
      }
    } catch {
      // network/cookie missing — user must log in
    }

    // Fallback: restore user object from sessionStorage (token will be acquired on next API call)
    const userJson = sessionStorage.getItem('user');
    if (userJson) {
      try { this._user.set(JSON.parse(userJson)); } catch {}
    }
  }

  private setSession(res: LoginResponse): void {
    this._accessToken.set(res.accessToken);
    this._user.set(res.user);
    // Refresh token NOT stored in JS — API sets HttpOnly cookie
    // Only the (non-sensitive) user object goes to sessionStorage for UX
    sessionStorage.setItem('user', JSON.stringify(res.user));
    this.sendToOwnApp(res.user?.businessKind);
  }

  /**
   * Galat app me utar gaye to sahi wale par bhej do.
   *
   * Manufacturer firm ka aadmi yahan (agency app me) login karta tha to usko
   * agency ki screen dikhne lagti thi — Core Master, Trading — jinka uske
   * dhandhe se koi lena-dena nahi. Aur usko pata bhi nahi chalta tha ki uska
   * apna app kahin aur hai.
   *
   * 'both' wali firm dono kar sakti hai, isliye usko yahin rehne dete hain.
   */
  private sendToOwnApp(kind?: string): void {
    if (!kind || kind === 'agency' || kind === 'both') return;

    const host = location.hostname;
    const target: Record<string, string> = {
      manufacturer: 'mfg',
      transport:    'transport',
      buyer:        'buyer'
    };
    const sub = target[kind];
    if (!sub) return;

    // Pehle se sahi app me hain? (mfg.vyaparsetu… par 'mfg.' se shuru hoga)
    if (host.startsWith(sub + '.')) return;

    // Sirf apne hi domain ke andar bhejte hain — kisi bahar ki jagah nahi
    const base = 'vyaparsetu.anjaninex.com';
    if (!host.endsWith(base)) return;

    location.replace(`https://${sub}.${base}/`);
  }

  private clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
    sessionStorage.removeItem('user');
    // Tell server to clear the HttpOnly cookie
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  }

  hasPermission(perm: string): boolean {
    const u = this._user();
    if (!u) return false;

    // Role-based bypass — these roles have implicit all-access:
    //   super_admin: Anjaninex platform admin (sees everything across all firms)
    //   firm_owner:  Owner of the firm (full access within their firm)
    //   firm_admin:  Admin of the firm (full access within their firm)
    if (u.roles?.includes('super_admin')) return true;
    if (u.roles?.includes('firm_owner')) return true;
    if (u.roles?.includes('firm_admin')) return true;

    if (u.permissions.includes('*')) return true;
    if (u.permissions.includes(perm)) return true;
    // Hierarchical scope
    const parts = perm.split('.');
    if (parts.length === 4) {
      return u.permissions.includes(`${parts[0]}.${parts[1]}.${parts[2]}.firm`);
    }
    return false;
  }

  hasRole(role: string): boolean {
    const u = this._user();
    return u?.roles?.includes(role) ?? false;
  }
}
