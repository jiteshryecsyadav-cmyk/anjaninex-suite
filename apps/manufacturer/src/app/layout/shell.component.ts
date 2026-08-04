import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../core/auth.service';
import { SECTIONS } from '../core/nav';
import { environment } from '../../environments/environment';

/** Sidebar ki ek line = poora ek hissa. Andar ke pardah patti me khulte hain. */
interface NavLine {
  title: string;
  icon: string;
  path: string;
  /** Koi pardah khulta hi nahi (sab "aage" hain) — line dikhe par dabe nahi. */
  soon: boolean;
}

/**
 * Manufacturer app ka dhaancha.
 *
 * Sidebar me chhe line — har hisse ki ek. Andar ke pardah upar wali horizontal
 * patti me khulte hain (trading app jaisa). Pehle har pardah ki apni line thi
 * to sidebar 20 line ka ho jata tha aur roz ka kaam neeche chhup jata.
 *
 * List [core/nav.ts] me hai — sidebar aur patti dono wahi padhte hain, isliye
 * nayi screen ek hi jagah jodni padti hai.
 */
@Component({
  selector: 'mfg-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-screen overflow-hidden">

      <!-- ── SIDEBAR — agency app jaisa navy ── -->
      <aside class="bg-anjaninex-navy text-white w-56 shrink-0 flex flex-col
                    overflow-y-auto overflow-x-hidden transition-all duration-200
                    max-md:fixed max-md:inset-y-0 max-md:z-40 max-md:shadow-2xl"
             [class.max-md:-translate-x-full]="!sideOpen()">

        <nav class="flex-1 p-2 flex flex-col gap-1">
          @for (l of lines(); track l.path) {
            @if (l.soon) {
              <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                          font-semibold text-white/30 cursor-not-allowed">
                <span class="w-5 text-center">{{ l.icon }}</span>
                <span class="flex-1">{{ l.title }}</span>
                <span class="chip bg-white/10 text-white/40">aage</span>
              </div>
            } @else {
              <a [routerLink]="l.path"
                 routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                        font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">{{ l.icon }}</span>
                <span>{{ l.title }}</span>
              </a>
            }
          }
        </nav>

        <!-- ⏻ Logout — agency app wala hi glossy square button -->
        <button (click)="auth.logout()" class="logout-btn" title="Logout">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
               stroke="white" stroke-width="2.6" stroke-linecap="round">
            <path d="M12 3v8"/>
            <path d="M6.2 6.3a8 8 0 1 0 11.6 0"/>
          </svg>
          <span class="logout-txt">LOGOUT</span>
        </button>
      </aside>

      <!-- mobile par sidebar khule to peeche ka parda -->
      @if (sideOpen()) {
        <div class="fixed inset-0 bg-black/40 z-30 md:hidden"
             (click)="sideOpen.set(false)"></div>
      }

      <!-- ── CONTENT ── -->
      <div class="flex-1 flex flex-col min-w-0">

        <!-- Header — navy, firm ka naam beech me (agency jaisa) -->
        <header class="bg-anjaninex-navy text-white shadow-lg z-40 shrink-0">
          <div class="flex items-center gap-2 px-4 py-2">
            <button (click)="sideOpen.set(!sideOpen())"
                    class="p-1.5 hover:bg-white/10 rounded text-xl leading-none"
                    title="Menu chhupao / dikhao">☰</button>

            <div class="flex-1"></div>
            <div class="font-display leading-none text-center whitespace-nowrap">
              <div class="font-black text-sm text-white">
                {{ auth.user()?.firmName || 'Manufacturer' }}</div>
              <div class="text-[10px] font-semibold tracking-wide text-white/60">
                Vyapaar Setu · Manufacturer</div>
            </div>
            <div class="flex-1"></div>

            <div class="h-8 px-3 bg-white/10 rounded text-xs flex items-center gap-1.5">
              <span class="w-5 h-5 rounded-full bg-anjaninex-red grid place-items-center
                           text-[10px] font-black">{{ initial() }}</span>
              {{ auth.user()?.fullName }}
            </div>
          </div>
        </header>

        <main class="flex-1 overflow-y-auto p-6 bg-anjaninex-cream">
          <router-outlet />
        </main>

        <!-- Footer — agency app jaisa. Version stamp sabse zaroori: deploy ke
             baad "purana dikh raha hai" ki uljhan yahin se sulajhti hai. -->
        <footer class="flex justify-between items-center gap-3 px-5 py-2 bg-white
                       border-t-2 border-anjaninex-navy text-xs text-anjaninex-navy shrink-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-mono bg-anjaninex-navy-soft text-anjaninex-navy px-2 py-0.5 rounded"
                  title="Is browser me kaunsa build chal raha hai">v{{ version }}</span>
            <span class="opacity-50">·</span>
            <span>© 2026 {{ auth.user()?.firmName || 'Anjaninex' }}</span>
            <span class="opacity-50">·</span>
            <a href="https://vyaparsetu.anjaninex.com/about.html" target="_blank" rel="noopener"
               class="hover:text-anjaninex-red">About</a>
            <a href="https://vyaparsetu.anjaninex.com/contact.html" target="_blank" rel="noopener"
               class="hover:text-anjaninex-red">Contact</a>
            <a href="https://vyaparsetu.anjaninex.com/privacy.html" target="_blank" rel="noopener"
               class="hover:text-anjaninex-red">Privacy</a>
            <a href="https://vyaparsetu.anjaninex.com/terms.html" target="_blank" rel="noopener"
               class="hover:text-anjaninex-red">Terms</a>
            <a href="https://vyaparsetu.anjaninex.com/refund.html" target="_blank" rel="noopener"
               class="hover:text-anjaninex-red">Refund</a>
            <span class="opacity-50">·</span>
            <a href="tel:9511540583"
               class="hover:text-anjaninex-red font-semibold whitespace-nowrap">📞 9511540583</a>
          </div>
          <a [href]="anjaninexUrl" target="_blank" rel="noopener"
             class="flex items-center gap-2 hover:text-anjaninex-red font-semibold whitespace-nowrap">
            <strong>Vyapaar Setu</strong> — an Anjaninex product
          </a>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    /* Glossy LOGOUT — agency app se hu-ba-hu, taaki dono app ek hi lagen */
    .logout-btn {
      position: relative; overflow: hidden;
      margin: 0 auto 14px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 1px;
      width: 48px; height: 48px; border-radius: 11px; border: none; cursor: pointer;
      background: linear-gradient(180deg, var(--ax-red) 0%, var(--ax-red-dark) 65%, var(--ax-navy-dark) 140%);
      box-shadow: 0 7px 16px rgba(0,0,0,.45), inset 0 -4px 8px rgba(0,0,0,.3);
      transition: transform .15s;
    }
    /* upar wali shine */
    .logout-btn::before {
      content: ''; position: absolute; top: 3px; left: 6px; right: 6px; height: 38%;
      border-radius: 16px 16px 50% 50%;
      background: linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0));
      pointer-events: none;
    }
    .logout-btn:hover { transform: scale(1.07); }
    .logout-btn:active { transform: scale(.97); }
    .logout-btn svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
    .logout-txt {
      font-size: 7px; font-weight: 900; color: #fff; letter-spacing: .8px;
      text-shadow: 0 1px 2px rgba(0,0,0,.45);
    }
  `]
})
export class ShellComponent {
  auth = inject(AuthService);
  sideOpen = signal(false);

  /** index.html me build ke waqt bhara jata hai (scripts/gen-version.js). */
  version = (window as any).__APP_VERSION__ ?? '0.0.0';
  anjaninexUrl = environment.anjaninexUrl;

  /** Header ke gol nishaan me pehla akshar — agency app me bhi wahi hai. */
  initial = computed(() =>
    (this.auth.user()?.fullName ?? '?').trim().charAt(0).toUpperCase());

  constructor() {
    // Firm ka naam login ke jawab me nahi aata (wo sirf user ki baat karta hai).
    // Header me "Manufacturer" likha rehta to aadmi ko pata hi nahi chalta ki
    // wo kis firm me baitha hai — khaas kar jiski do firms hain.
    if (!this.auth.user()?.firmName) {
      inject(HttpClient)
        .get<{ firmName?: string }>(`${environment.apiUrl}/api/me/modules`)
        .subscribe({
          next: r => { if (r?.firmName) this.auth.setFirmName(r.firmName); },
          error: () => { /* naam na mile to header 'Manufacturer' hi dikhata rahe */ }
        });
    }
  }

  /**
   * Sidebar ki lines — [core/nav.ts]{@link ../core/nav} se.
   *
   * · Jis hisse ka ek bhi pardah nahi khul sakta, wo line hi nahi dikhti
   *   (Godown wale ko Reports ka naam bhi nahi dikhega).
   * · Jis hisse ke sare pardah "aage" wale hain (jaise abhi Reports), wo
   *   dikhta hai par dabta nahi — roadmap saaf rahe, par khali pardah na khule.
   */
  lines = computed<NavLine[]>(() =>
    SECTIONS
      .map(s => {
        // Bina tab wala hissa (Dashboard) — hamesha khulta hai
        if (s.tabs.length === 0)
          return { title: s.title, icon: s.icon, path: s.path, soon: false, koiHai: true };

        const mile = s.tabs.filter(t => this.auth.can(t.perm));
        return {
          title: s.title, icon: s.icon, path: s.path,
          soon: !mile.some(t => !t.soon),
          koiHai: mile.length > 0
        };
      })
      .filter(l => l.koiHai)
      .map(({ title, icon, path, soon }) => ({ title, icon, path, soon }))
  );
}
