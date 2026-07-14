import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth/auth.service';

export type ModuleKey =
  | 'trading'
  | 'accounting'
  | 'reports_core'
  | 'reports_advanced'
  | 'ai_scan'
  | 'active_directory'
  | 'commission'
  | 'hr'
  | 'online_dukan'
  | 'wallet'
  | 'white_label'
  | 'api_access'
  | 'priority_support';

export interface MeModulesResponse {
  firmName?: string;
  firmGst?: string;
  firmPan?: string;
  firmCity?: string;
  firmState?: string;
  firmTheme?: string;
  modules: ModuleKey[];
  features?: string[];   // feature flags (pilot/rollout) — sadmin Feature Flags page se
  credilEnabled?: boolean;
  complaintBoxEnabled?: boolean;
  planCode: string;
  limits: {
    userLimit: number;
    branchLimit: number;
    aiQuotaMonthly: number;
  };
  usage: {
    aiUsedThisMonth: number;
    walletBalance: number;
    usersCount?: number;
    branchesCount?: number;
  };
  subscription: {
    status: string;
    trialEndsAt: string | null;
    subscriptionEndsAt: string | null;
  };
}

/**
 * FeatureService — single source of truth for module entitlements (the firm's plan).
 *
 * Used everywhere in the UI to hide/show menus, buttons, and pages based on what
 * the customer has paid for.
 *
 *   Usage in template:  @if (features.has('hr')) { ... }
 *   Usage in route:     canActivate: [moduleGuard('hr')]
 *   Usage in code:      if (features.has('ai_scan')) { ... }
 *
 * Refresh logic: call refresh() on shell mount + after any admin toggle change.
 */
@Injectable({ providedIn: 'root' })
export class FeatureService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/me`;

  /** Set of enabled module keys for the current firm. */
  modules = signal<Set<ModuleKey>>(new Set());
  /** Feature flags — naya feature pehle pilot firm me, fir sab ko (sadmin control). */
  flags = signal<Set<string>>(new Set());
  firmName = signal<string>('');
  firmGst = signal<string>('');
  firmPan = signal<string>('');
  firmCity = signal<string>('');
  firmState = signal<string>('');
  /** Fixed UI theme color assigned by Anjaninex super-admin (users can't change). */
  firmTheme = signal<string>('classic');
  credilEnabled = signal<boolean>(false);
  complaintBoxEnabled = signal<boolean>(true);   // default ON — support ka rasta
  planCode = signal<string>('starter');
  userLimit = signal<number>(3);
  branchLimit = signal<number>(1);
  aiQuotaMonthly = signal<number>(0);
  aiUsedThisMonth = signal<number>(0);
  usersCount = signal<number>(0);      // abhi kitne active logins bane hain
  branchesCount = signal<number>(0);   // abhi kitni branches bani hain
  walletBalance = signal<number>(0);
  loaded = signal<boolean>(false);

  /** Computed convenience — % AI quota used. */
  aiQuotaPctUsed = computed(() => {
    const q = this.aiQuotaMonthly();
    return q > 0 ? Math.round((this.aiUsedThisMonth() / q) * 100) : 0;
  });

  /** True if the firm has access to this module. */
  has(module: ModuleKey): boolean {
    return this.modules().has(module);
  }

  /** True if this feature flag is on for the current firm (pilot ya sab firms). */
  flag(key: string): boolean {
    return this.flags().has(key);
  }

  /** True if any of these modules is enabled (OR check). */
  hasAny(...mods: ModuleKey[]): boolean {
    const set = this.modules();
    return mods.some(m => set.has(m));
  }

  /** True if all of these modules are enabled (AND check). */
  hasAll(...mods: ModuleKey[]): boolean {
    const set = this.modules();
    return mods.every(m => set.has(m));
  }

  /** Refresh modules from the backend. Call on app/shell startup + after admin changes. */
  refresh() {
    // Super admin (firm-less user) ke liye firm-modules call mat karo — error hi aayega.
    const u = this.auth.user();
    if (u && !u.firmId) { this.loaded.set(true); return; }

    this.http.get<MeModulesResponse>(`${this.base}/modules`).subscribe({
      next: (r) => {
        this.modules.set(new Set<ModuleKey>(r.modules));
        this.flags.set(new Set<string>(r.features || []));
        this.firmName.set(r.firmName || '');
        this.firmGst.set(r.firmGst || '');
        this.firmPan.set(r.firmPan || '');
        this.firmCity.set(r.firmCity || '');
        this.firmState.set(r.firmState || '');
        this.firmTheme.set(r.firmTheme || 'classic');
        this.credilEnabled.set(!!r.credilEnabled);
        this.complaintBoxEnabled.set(r.complaintBoxEnabled !== false);   // missing = ON
        // is device pe yaad rakho — login page (pre-auth) par bhi yahi theme dikhe
        try { localStorage.setItem('ax_firm_theme', r.firmTheme || 'classic'); } catch {}
        this.planCode.set(r.planCode);
        this.userLimit.set(r.limits.userLimit);
        this.branchLimit.set(r.limits.branchLimit);
        this.aiQuotaMonthly.set(r.limits.aiQuotaMonthly);
        this.aiUsedThisMonth.set(r.usage.aiUsedThisMonth);
        this.usersCount.set(r.usage.usersCount ?? 0);
        this.branchesCount.set(r.usage.branchesCount ?? 0);
        this.walletBalance.set(r.usage.walletBalance ?? 0);
        this.loaded.set(true);
      },
      error: (e) => {
        console.warn('[FeatureService] Failed to load modules', e);
        // Fail-open for safety: don't accidentally lock users out on a network blip.
        this.loaded.set(true);
      }
    });
  }

  /** Local override (for testing / preview mode) — does not persist. */
  setLocal(modules: ModuleKey[]) {
    this.modules.set(new Set(modules));
  }
}
