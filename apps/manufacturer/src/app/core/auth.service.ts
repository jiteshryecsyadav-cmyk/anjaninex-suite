import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../environments/environment';
import { goToCentralLogin } from './login-redirect';

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
  /** agency | manufacturer | transport | buyer | both */
  businessKind: string;
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
  /** agency | manufacturer | transport | buyer | both */
  businessKind: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private static TOKEN = 'mfg_token';
  private static USER  = 'mfg_user';

  user = signal<Session | null>(this.readUser());
  isLoggedIn = computed(() => !!this.user());

  /** Permission Set me — har guard par array ghumana mehnga hai. */
  private permSet = computed(() => new Set(this.user()?.permissions ?? []));

  get token(): string | null { return localStorage.getItem(AuthService.TOKEN); }

  // NOTE: is app ka apna login() nahi hai. Login sabka ek hi jagah hota hai
  // (vyaparsetu.anjaninex.com) — waise hi jaise Super Admin ka. Yahan sirf
  // cookie se chup-chaap andar aane wala rasta hai (trySilentLogin).

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
      permissions: u.permissions ?? [],
      businessKind: u.businessKind ?? 'agency'
    };
  }

  setSession(s: Session) {
    localStorage.setItem(AuthService.TOKEN, s.token);
    localStorage.setItem(AuthService.USER, JSON.stringify(s));
    this.user.set(s);
    this.sendToOwnApp(s.businessKind);
  }

  /**
   * Agency ka aadmi galti se yahan login kar le to usko agency app par bhej do.
   * Warna wo manufacturer ki screen dekhta rehta — jinme uska koi data hi nahi
   * hoga — aur samajhta ki app khali hai.
   */
  private sendToOwnApp(kind: string): void {
    if (kind === 'manufacturer' || kind === 'both') return;

    const base = 'vyaparsetu.anjaninex.com';
    if (!location.hostname.endsWith(base)) return;   // dev/local par kuch mat karo

    const sub: Record<string, string> = { transport: 'transport.', buyer: 'buyer.' };
    location.replace(`https://${sub[kind] ?? ''}${base}/`);
  }

  /**
   * BINA DOBARA LOGIN ke andar aane ki koshish.
   *
   * Login sabka ek hi jagah hota hai (vyaparsetu.anjaninex.com). MFG firm ka
   * aadmi wahan se yahan bheja jata hai — par uska token us domain ki storage
   * me hai, yahan nahi. Bina iske wo yahan pahunch kar phir se id/password
   * maangta dikhta, aur usko lagta ki kuch toota hua hai.
   *
   * Refresh cookie ".vyaparsetu.anjaninex.com" par lagti hai, isliye yahan bhi
   * pahunchti hai. Usi se naya token maang lete hain.
   */
  trySilentLogin() {
    return this.http.post<ApiLoginResponse>(
      `${environment.apiUrl}/api/auth/refresh`, {}, { withCredentials: true }
    ).pipe(
      map(r => {
        if (!r.user) throw new Error('no session');
        const s = this.toSession(r);
        // Yahan setSession nahi — wo dobara redirect chala deta
        localStorage.setItem(AuthService.TOKEN, s.token);
        localStorage.setItem(AuthService.USER, JSON.stringify(s));
        this.user.set(s);
        return s;
      })
    );
  }

  /** Firm ka naam baad me mile to session me chipka do (shell me dikhta hai). */
  setFirmName(name: string) {
    const s = this.user();
    if (!s) return;
    const next = { ...s, firmName: name };
    localStorage.setItem(AuthService.USER, JSON.stringify(next));
    this.user.set(next);
  }

  /**
   * Logout. Server ko bhi batate hain taaki cookie hate — warna agla banda
   * isi computer par app kholte hi andar pahunch jayega.
   *
   * Aakhir me wahi login page jahan se aadmi andar aaya tha. Pehle is app ka
   * apna login dikhta tha, aur aadmi ko lagta tha ki ye koi teesri hi jagah hai.
   */
  logout() {
    this.http.post(`${environment.apiUrl}/api/auth/logout`, {}, { withCredentials: true })
      .subscribe({ next: () => this.clearAndGo(), error: () => this.clearAndGo() });
  }

  private clearAndGo() {
    localStorage.removeItem(AuthService.TOKEN);
    localStorage.removeItem(AuthService.USER);
    this.user.set(null);
    goToCentralLogin();
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
