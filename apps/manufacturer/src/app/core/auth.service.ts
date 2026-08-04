import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { map, tap } from 'rxjs';
import { environment } from '../../environments/environment';

/** API ka asli jawab — apps/api/Modules/Core/Services/AuthService.cs se. */
interface ApiUserInfo {
  id: string;
  firmId: string | null;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  defaultBranchId: string | null;
  canViewAllBranches: boolean;
  roles: string[];
  permissions: string[];
  agentId: string | null;
}
interface ApiFirmChoice { firmId: string; firmName: string; }
interface ApiLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: ApiUserInfo | null;
  /** Ek hi id kai firms me ho to token ki jagah ye list aati hai. */
  firms: ApiFirmChoice[] | null;
}

/** App ke andar ka saaf shape. */
export interface Session {
  token: string;
  refreshToken: string;
  userId: string;
  firmId: string | null;
  fullName: string;
  firmName: string;
  roles: string[];
  permissions: string[];
}

export interface FirmChoice { firmId: string; firmName: string; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private static TOKEN = 'mfg_token';
  private static USER  = 'mfg_user';

  user = signal<Session | null>(this.readUser());
  isLoggedIn = computed(() => !!this.user());

  /** Permission Set me — har guard par array ghumana mehnga hai. */
  private permSet = computed(() => new Set(this.user()?.permissions ?? []));

  get token(): string | null { return localStorage.getItem(AuthService.TOKEN); }

  /**
   * Login. Do tarah ka jawab aata hai:
   *   · token + user  → seedha andar
   *   · firms ki list → ek hi id kai firms me hai, pehle firm chunni padegi
   * Isliye jawab ko waise ka waisa nahi maanta — dono haalat sambhalta hai.
   */
  login(username: string, password: string, remember: boolean, firmId?: string) {
    return this.http.post<ApiLoginResponse>(
      `${environment.apiUrl}/api/auth/login`,
      { identifier: username, password, remember, firmId: firmId ?? null }
    ).pipe(
      map(r => {
        if (r.firms?.length && !r.user) {
          return { kind: 'choose-firm' as const, firms: r.firms };
        }
        if (!r.user) throw new Error('Login ka jawab adhoora aaya');
        return { kind: 'ok' as const, session: this.toSession(r) };
      }),
      tap(res => { if (res.kind === 'ok') this.setSession(res.session); })
    );
  }

  private toSession(r: ApiLoginResponse): Session {
    const u = r.user!;
    return {
      token: r.accessToken,
      refreshToken: r.refreshToken,
      userId: u.id,
      firmId: u.firmId,
      fullName: u.fullName,
      // API firm ka naam login me nahi bhejti — /api/auth/me ya firm API se
      // aata hai. Tab tak khali; shell me user ka naam hi kaafi hai.
      firmName: '',
      roles: u.roles ?? [],
      permissions: u.permissions ?? []
    };
  }

  setSession(s: Session) {
    localStorage.setItem(AuthService.TOKEN, s.token);
    localStorage.setItem(AuthService.USER, JSON.stringify(s));
    this.user.set(s);
  }

  /** Firm ka naam baad me mile to session me chipka do (shell me dikhta hai). */
  setFirmName(name: string) {
    const s = this.user();
    if (!s) return;
    const next = { ...s, firmName: name };
    localStorage.setItem(AuthService.USER, JSON.stringify(next));
    this.user.set(next);
  }

  logout() {
    localStorage.removeItem(AuthService.TOKEN);
    localStorage.removeItem(AuthService.USER);
    this.user.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Ijazat hai ya nahi. Malik ke liye alag shortcut jaan-boojh kar nahi —
   * seed usko 84 ki 84 deta hai, isliye ek hi rasta rehta hai aur test
   * karna aasaan.
   */
  can(code: string): boolean { return this.permSet().has(code); }

  private readUser(): Session | null {
    try {
      const raw = localStorage.getItem(AuthService.USER);
      return raw ? JSON.parse(raw) as Session : null;
    } catch {
      return null;   // kharab data — logout jaisa vyavhaar
    }
  }
}
