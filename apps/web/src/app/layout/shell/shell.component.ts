import { Component, inject, signal, effect, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { WalletService } from '../../modules/wallet/wallet.service';
import { RechargeModalComponent } from '../../modules/wallet/recharge-modal.component';
import { SubscriptionService } from '../../modules/subscription/subscription.service';
import { TrialBannerComponent } from '../../modules/subscription/trial-banner.component';
import { SuspendedLockoutComponent } from '../../modules/subscription/suspended-lockout.component';
import { FeatureService } from '../../shared/feature.service';
import { NativeTrackingService } from '../../shared/native-tracking.service';
import { UpgradeNudgeComponent } from '../../shared/upgrade-nudge.component';
import { WalletIconComponent } from '../../shared/wallet-icon.component';
import { AnjiHelpComponent } from '../../shared/help/anji-help.component';
import { CalculatorComponent } from '../../shared/calculator.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterOutlet, RouterLink, RouterLinkActive, RechargeModalComponent, TrialBannerComponent, SuspendedLockoutComponent, UpgradeNudgeComponent, WalletIconComponent, AnjiHelpComponent, CalculatorComponent],
  template: `
    <!-- Suspended firms see ONLY the lockout screen — nothing else accessible -->
    @if (subscription.isLocked()) {
      <app-suspended-lockout></app-suspended-lockout>
    } @else {
    <div class="h-screen flex flex-col bg-anjaninex-cream overflow-hidden">

      <!-- Trial / grace-period banner (auto-shows when ≤7 days left) -->
      <app-trial-banner></app-trial-banner>

      <!-- Smart upgrade nudges (AI quota, wallet low, etc.) -->
      <app-upgrade-nudge></app-upgrade-nudge>

      <div class="flex flex-1 min-h-0">

        <!-- Mobile backdrop (sidebar khula ho to) -->
        @if (sidebarOpen()) {
          <div class="sidebar-backdrop" (click)="sidebarOpen.set(false)"></div>
        }

        <!-- ============ SIDEBAR ============ -->
        <aside class="app-sidebar shrink-0 bg-anjaninex-navy text-white flex flex-col overflow-y-auto overflow-x-hidden transition-all duration-200"
               [class.w-56]="sidebarOpen()" [class.w-0]="!sidebarOpen()"
               (click)="onNavClick($event)">

          <!-- Module nav (vertical) -->
          <nav class="flex-1 p-2 flex flex-col gap-1">

            <!-- ===== SUPER ADMIN: sirf Anjaninex panel menu ===== -->
            @if (isSuperAdmin()) {
              <a routerLink="/admin/dashboard" routerLinkActive="!bg-anjaninex-red !text-white"
                 [routerLinkActiveOptions]="{exact:true}"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📊</span> Dashboard
              </a>
              <a routerLink="/admin/firms" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">🏢</span> Firms
              </a>
              <a routerLink="/admin/firm-report" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📈</span> Firms Report
              </a>
              <a routerLink="/admin/plans" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">💼</span> Plans
              </a>
              <a routerLink="/admin/agents" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">👥</span> Agents
              </a>
              <a routerLink="/admin/billing" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">💳</span> Billing
              </a>
              <a routerLink="/admin/accounting" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📒</span> Accounting
              </a>
              <a routerLink="/admin/invoices" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">🧾</span> Invoices
              </a>
              <a routerLink="/admin/ai-monitor" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">🤖</span> AI Monitor
              </a>
              <a routerLink="/admin/ai-keys" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">🔑</span> AI Keys
              </a>
              <a routerLink="/admin/whatsapp" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📱</span> WhatsApp
              </a>
              <a routerLink="/admin/credil" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📈</span> CREDIL
              </a>
              <a routerLink="/admin/complaints" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📢</span> Complaints
              </a>
              <a routerLink="/admin/feature-flags" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">🧪</span> Feature Flags
              </a>
              <a routerLink="/admin/changelog" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📝</span> Changelog
              </a>
            } @else {

            <a routerLink="/" routerLinkActive="!bg-anjaninex-red !text-white"
               [routerLinkActiveOptions]="{exact:true}"
               class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
              <span class="w-5 text-center">📊</span> Dashboard
            </a>
            @if (features.has('trading')) {
              <a routerLink="/trading" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">🛒</span> Trading
              </a>
            }
            @if (features.has('accounting')) {
              <a routerLink="/accounting" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📒</span> Accounting
              </a>
            }
            <!-- Bazaar Link (Active Directory / Suppliers) -->
            @if (features.has('active_directory')) {
              <a routerLink="/suppliers" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 flex justify-center">
                  <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;">
                    <path d="M3 5h6l2 2h10v2H3z"/>
                    <path d="M3 10h18v8H3z" opacity=".25"/>
                    <circle cx="12" cy="14" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
                  </svg>
                </span> Bazaar Link
              </a>
            }
            <!-- HR -->
            @if (features.has('hr')) {
              <a routerLink="/hr" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">👥</span> HR
              </a>
            }
            <!-- Online Dukan — firm ka apna e-commerce store (categories/products/orders/reviews) -->
            @if (features.has('online_dukan')) {
            <a routerLink="/dukan/admin" routerLinkActive="!bg-anjaninex-red !text-white"
               class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
              <span class="w-5 text-center">🛒</span> Online Dukan
            </a>
            }
            @if (features.has('wallet')) {
              <a routerLink="/wallet" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center inline-flex justify-center"><app-wallet-icon [size]="18"></app-wallet-icon></span> Wallet
              </a>
            }
            <!-- Reports — module on ho tabhi (Trading ke andar bhi milte hain, par yahan seedha) -->
            @if (features.hasAny('reports_core', 'reports_advanced')) {
              <a routerLink="/reports/dashboard" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📊</span> Reports
              </a>
            }
            <!-- Plans — subscription plans + usage; wallet ke turant neeche -->
            <a routerLink="/plans" routerLinkActive="!bg-anjaninex-red !text-white"
               class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
              <span class="w-5 text-center">💎</span> Plans
            </a>
            <!-- Complaint Box — Anjaninex ko complaint bhejo (default ON; sadmin firm-wise band kar sakta hai) -->
            @if (features.complaintBoxEnabled()) {
              <a routerLink="/complaints" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📢</span> Complaint Box
              </a>
            }
            <!-- Party Chat — apni parties se chat (feature flag: pilot pehle Riddhi) -->
            @if (features.flag('party_chat')) {
              <a routerLink="/party-chat" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">💬</span> Party Chat
              </a>
            }
            @if (features.credilEnabled()) {
              <a routerLink="/credil" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">📈</span> CREDIL
              </a>
            }
            @if (auth.hasRole('firm_admin') || auth.hasRole('firm_owner') || auth.hasRole('admin') || auth.hasRole('owner')) {
              <a routerLink="/team" routerLinkActive="!bg-anjaninex-red !text-white"
                 class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
                <span class="w-5 text-center">🛡️</span> Team
              </a>
            }
            <a routerLink="/core-master" routerLinkActive="!bg-anjaninex-red !text-white"
               class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
              <span class="w-5 text-center">🗂️</span> Core Master
            </a>
            <!-- Import & Migration — naye customer ka purana data bulk import (har firm user) -->
            <a routerLink="/migration" routerLinkActive="!bg-anjaninex-red !text-white"
               class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/75 hover:text-white hover:bg-white/10">
              <span class="w-5 text-center">📥</span> Import &amp; Migration
            </a>
            }
            <!-- Theme Color picker removed — theme is now fixed per-firm (set by Anjaninex super-admin). -->
          </nav>

          <!-- 🧮 Calculator (har user, har page) -->
          <button (click)="calcOpen.set(true)" class="calc-side-btn" title="Calculator">
            <span style="font-size:18px">🧮</span>
            <span style="font-size:13px;font-weight:700">Calculator</span>
          </button>

          <!-- ⏻ Logout (glossy square button — power icon SVG) -->
          <button (click)="logout()" class="logout-btn" title="Logout">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
                 stroke="white" stroke-width="2.6" stroke-linecap="round">
              <path d="M12 3v8"/>
              <path d="M6.2 6.3a8 8 0 1 0 11.6 0"/>
            </svg>
            <span class="logout-txt">LOGOUT</span>
          </button>
        </aside>

        <!-- ============ CONTENT COLUMN ============ -->
        <div class="flex-1 flex flex-col min-w-0">

          <!-- ===== Slim top bar (tools only) ===== -->
          <header class="bg-anjaninex-navy text-white shadow-lg z-40">
            <div class="flex items-center gap-2 px-4 py-2">

              <!-- Hamburger: sidebar andar-bahar -->
              <button (click)="sidebarOpen.set(!sidebarOpen())"
                      class="p-1.5 hover:bg-white/10 rounded text-xl leading-none"
                      title="Menu chhupao / dikhao">☰</button>

              <div class="flex-1"></div>

              <!-- Brand (center) — logged-in firm ka naam (super admin = Anjaninex) -->
              <div class="font-display leading-none text-center mr-2 whitespace-nowrap">
                <div class="font-black text-sm text-white">{{ isSuperAdmin() ? 'Anjaninex' : (features.firmName() || '—') }}</div>
                <div class="text-[10px] font-semibold tracking-wide text-white/60">{{ isSuperAdmin() ? 'Super Admin Panel' : 'Vyapaar Setu' }}</div>
              </div>

              <div class="flex-1"></div>

              @if (!isSuperAdmin()) {
                <!-- Branch switcher (real — select karte hi pura app us branch me) -->
                <div class="relative">
                  <button (click)="toggleBranchMenu()"
                          class="h-8 px-3 bg-white/10 rounded text-xs flex items-center gap-1.5 hover:bg-white/20 whitespace-nowrap">
                    🏢 {{ currentBranchName() }} ▾
                  </button>
                  @if (branchMenuOpen()) {
                    <div class="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-xl text-anjaninex-navy-dark py-2 z-50 border border-anjaninex-navy-soft">
                      @for (b of shellBranches(); track b.id) {
                        <button (click)="switchBranch(b)"
                                class="block w-full text-left px-4 py-2 text-sm hover:bg-anjaninex-navy-soft"
                                [class.font-bold]="currentBranchId() === b.id">
                          🏢 {{ b.name }} @if (currentBranchId() === b.id) { ✓ }
                        </button>
                      }
                    </div>
                  }
                </div>
              }

              <!-- Notifications -->
              <div class="relative" (mouseleave)="scheduleClose()" (mouseenter)="cancelClose()">
                <button (click)="toggleNotifs()" class="relative p-1.5 hover:bg-white/10 rounded">
                  <span class="inline-block" [class.bell-wiggle]="unreadCount() > 0">🔔</span>
                  @if (unreadCount() > 0) {
                    <span class="absolute top-0.5 right-0.5 flex h-2.5 w-2.5">
                      <span class="notif-ping absolute inline-flex h-full w-full rounded-full bg-anjaninex-red"></span>
                      <span class="notif-dot relative inline-flex rounded-full h-2.5 w-2.5 bg-anjaninex-red ring-1 ring-white/70"></span>
                    </span>
                  }
                </button>
                @if (notifOpen()) {
                  <div class="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl text-anjaninex-navy-dark py-2 z-50 border border-anjaninex-navy-soft max-h-96 overflow-y-auto">
                    <div class="px-4 py-2 border-b border-anjaninex-navy-soft flex justify-between items-center">
                      <span class="font-bold text-sm">🔔 Notifications</span>
                      @if (unreadCount() > 0) {
                        <button (click)="markAllRead()" class="text-xs text-anjaninex-red font-semibold hover:underline">Sab padh liya</button>
                      }
                    </div>
                    @if (notifs().length === 0) {
                      <div class="px-4 py-6 text-center text-sm text-gray-400">Koi notification nahi 🎉</div>
                    }
                    @for (n of notifs(); track n.id) {
                      <div class="px-4 py-2 border-b border-gray-50" [class.bg-purple-50]="!n.read">
                        <div class="text-sm font-semibold">{{ n.title }}</div>
                        @if (n.body) { <div class="text-xs text-gray-500">{{ n.body }}</div> }
                        <div class="text-[10px] text-gray-400 mt-0.5">{{ n.createdAt | date:'dd MMM, HH:mm' }}</div>
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Theme toggle (day/night) -->
              <button (click)="toggleTheme()" class="p-1.5 hover:bg-white/10 rounded text-sm" [title]="dark() ? 'Day mode' : 'Night mode'">
                {{ dark() ? '☀️' : '🌙' }}
              </button>

              <!-- User menu -->
              <div class="relative" (mouseleave)="scheduleMenuClose()" (mouseenter)="cancelMenuClose()">
                <button (click)="menuOpen.set(!menuOpen())" class="flex items-center gap-2 p-1 hover:bg-white/10 rounded">
                  <span class="w-7 h-7 rounded-full bg-anjaninex-red text-white flex items-center justify-center text-xs font-bold">
                    {{ initials() }}
                  </span>
                  <span class="text-xs">{{ auth.user()?.fullName }}</span>
                  <span class="text-xs">▾</span>
                </button>
                @if (menuOpen()) {
                  <div class="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl text-anjaninex-navy-dark py-2 z-50 border border-anjaninex-navy-soft">
                    <div class="px-4 py-2 border-b border-anjaninex-navy-soft">
                      <div class="font-bold text-sm">{{ auth.user()?.fullName }}</div>
                      <div class="text-xs text-gray-500">{{ auth.user()?.email }}</div>
                      <div class="text-xs text-anjaninex-red font-bold mt-1">
                        {{ auth.user()?.roles?.join(', ') }}
                      </div>
                    </div>
                    <button (click)="openProfile()" class="block w-full text-left px-4 py-2 text-sm hover:bg-anjaninex-navy-soft">
                      Profile Settings
                    </button>
                    <button (click)="openPassword()" class="block w-full text-left px-4 py-2 text-sm hover:bg-anjaninex-navy-soft">
                      Change Password
                    </button>
                    <button (click)="openSessions()" class="block w-full text-left px-4 py-2 text-sm hover:bg-anjaninex-navy-soft">
                      My Sessions
                    </button>
                    <div class="border-t border-anjaninex-navy-soft my-2"></div>
                    <button
                      (click)="logout()"
                      class="block w-full text-left px-4 py-2 text-sm text-anjaninex-red hover:bg-anjaninex-red-soft font-bold">
                      🚪 Sign Out
                    </button>
                  </div>
                }
              </div>
            </div>
          </header>

          <!-- ============ MAIN CONTENT ============ -->
          <main class="flex-1 overflow-y-auto p-6 bg-anjaninex-cream">
            <router-outlet></router-outlet>
          </main>

          <!-- ============ FOOTER ============ -->
          <footer class="flex justify-between items-center px-5 py-2 bg-white border-t-2 border-anjaninex-navy text-xs text-anjaninex-navy">
            <div class="flex items-center gap-2">
              <button (click)="showWhatsNew()" title="What's New — is version me kya naya hai"
                      class="font-mono bg-anjaninex-navy-soft text-anjaninex-navy px-2 py-0.5 rounded hover:bg-anjaninex-navy hover:text-white">
                v{{ version }}
              </button>
              <span class="opacity-50">·</span>
              <span>© 2026 {{ features.firmName() || 'Anjaninex' }}</span>
              <span class="opacity-50">·</span>
              <a href="/about.html" target="_blank" rel="noopener" class="hover:text-anjaninex-red">About</a>
              <a href="/contact.html" target="_blank" rel="noopener" class="hover:text-anjaninex-red">Contact</a>
              <a href="/privacy.html" target="_blank" rel="noopener" class="hover:text-anjaninex-red">Privacy</a>
              <a href="/terms.html" target="_blank" rel="noopener" class="hover:text-anjaninex-red">Terms</a>
              <a href="/refund.html" target="_blank" rel="noopener" class="hover:text-anjaninex-red">Refund</a>
            </div>
            <a
              [href]="anjaninexUrl"
              target="_blank"
              rel="noopener"
              class="flex items-center gap-2 hover:text-anjaninex-red font-semibold">
              <img src="anjaninex-logo.jpeg" alt="Anjaninex" width="22" height="22" class="object-contain">
              <strong>Vyapaar Setu</strong> — an Anjaninex product
            </a>
          </footer>
        </div>
      </div>
    </div>

    <!-- Anji Help Desk — har page par (self-contained floating button) -->
    <app-anji-help></app-anji-help>

    <!-- Calculator (sidebar button se khulta hai) -->
    @if (calcOpen()) {
      <app-calculator (closed)="calcOpen.set(false)"></app-calculator>
    }

    <!-- Recharge modal mount -->
    @if (rechargeOpen()) {
      <app-recharge-modal (closed)="rechargeOpen.set(false)"></app-recharge-modal>
    }

    <!-- Profile Settings modal -->
    @if (profileOpen()) {
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="profileOpen.set(false)">
        <div class="bg-white rounded-2xl p-6 w-full max-w-md text-anjaninex-navy-dark" (click)="$event.stopPropagation()">
          <h3 class="font-display font-bold text-lg mb-4">👤 Profile Settings</h3>
          <label class="m-lbl">Full Name</label>
          <input [(ngModel)]="pfName" class="m-input">
          <label class="m-lbl">Email</label>
          <input [(ngModel)]="pfEmail" type="email" class="m-input">
          <label class="m-lbl">Phone</label>
          <input [(ngModel)]="pfPhone" class="m-input">
          @if (mErr()) { <p class="text-red-600 text-sm mt-2">{{ mErr() }}</p> }
          @if (mMsg()) { <p class="text-green-600 text-sm mt-2">{{ mMsg() }}</p> }
          <div class="flex justify-end gap-2 mt-4">
            <button (click)="profileOpen.set(false)" class="px-4 py-2 border rounded text-sm">Close</button>
            <button (click)="saveProfile()" [disabled]="mBusy()" class="m-btn">{{ mBusy() ? 'Saving…' : '💾 Save' }}</button>
          </div>
        </div>
      </div>
    }

    <!-- Change Password modal -->
    @if (passwordOpen()) {
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="passwordOpen.set(false)">
        <div class="bg-white rounded-2xl p-6 w-full max-w-md text-anjaninex-navy-dark" (click)="$event.stopPropagation()">
          <h3 class="font-display font-bold text-lg mb-4">🔑 Change Password</h3>
          <label class="m-lbl">Abhi wala password</label>
          <input [(ngModel)]="cpCurrent" type="password" class="m-input">
          <label class="m-lbl">Naya password (min 6)</label>
          <input [(ngModel)]="cpNew" type="password" class="m-input">
          <label class="m-lbl">Naya password dobara</label>
          <input [(ngModel)]="cpConfirm" type="password" class="m-input">
          @if (mErr()) { <p class="text-red-600 text-sm mt-2">{{ mErr() }}</p> }
          @if (mMsg()) { <p class="text-green-600 text-sm mt-2">{{ mMsg() }}</p> }
          <div class="flex justify-end gap-2 mt-4">
            <button (click)="passwordOpen.set(false)" class="px-4 py-2 border rounded text-sm">Close</button>
            <button (click)="changePassword()" [disabled]="mBusy()" class="m-btn">{{ mBusy() ? '…' : '🔑 Change' }}</button>
          </div>
        </div>
      </div>
    }

    <!-- My Sessions modal -->
    @if (sessionsOpen()) {
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="sessionsOpen.set(false)">
        <div class="bg-white rounded-2xl p-6 w-full max-w-lg text-anjaninex-navy-dark max-h-[85vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <h3 class="font-display font-bold text-lg mb-4">💻 My Sessions (logged-in devices)</h3>
          @if (sessions().length === 0) { <p class="text-sm text-gray-400">Koi session nahi mili.</p> }
          @for (s of sessions(); track s.id) {
            <div class="border rounded-lg p-3 mb-2 text-sm" [class.opacity-50]="s.revoked">
              <div class="font-semibold truncate">{{ s.device || 'Unknown device' }}</div>
              <div class="text-xs text-gray-500">IP: {{ s.ip || '—' }} · Last active: {{ s.lastSeenAt | date:'dd MMM, HH:mm' }}</div>
              @if (s.revoked) { <span class="text-[10px] font-bold text-red-500">REVOKED</span> }
            </div>
          }
          @if (mMsg()) { <p class="text-green-600 text-sm mt-2">{{ mMsg() }}</p> }
          <div class="flex justify-between gap-2 mt-4">
            <button (click)="revokeOthers()" [disabled]="mBusy()" class="px-4 py-2 border border-red-300 text-red-600 rounded text-sm font-semibold">
              🚪 Baki sab devices logout karo
            </button>
            <button (click)="sessionsOpen.set(false)" class="px-4 py-2 border rounded text-sm">Close</button>
          </div>
        </div>
      </div>
    }

    <!-- Theme Color picker popup removed — theme is fixed per-firm by super-admin. -->
    }
  `,
  styles: [`
    @keyframes bellWiggle { 0%,100%{transform:rotate(0)} 20%{transform:rotate(-12deg)} 40%{transform:rotate(10deg)} 60%{transform:rotate(-7deg)} 80%{transform:rotate(4deg)} }
    .bell-wiggle { display:inline-block; animation: bellWiggle 1s ease-in-out infinite; transform-origin: 50% 0; }
    @keyframes notifBlink { 0%,100%{opacity:1; transform:scale(1)} 50%{opacity:.3; transform:scale(1.4)} }
    .notif-dot { animation: notifBlink 1s ease-in-out infinite; }
    @keyframes notifPing { 0%{transform:scale(1);opacity:.7} 75%,100%{transform:scale(2.3);opacity:0} }
    .notif-ping { animation: notifPing 1.2s cubic-bezier(0,0,.2,1) infinite; }
    .m-lbl { display:block; font-size:10px; font-weight:700; color:#6b3fa0; text-transform:uppercase; letter-spacing:.5px; margin:10px 0 4px; }
    .m-input { width:100%; padding:8px 10px; border:1.5px solid #ddc8f5; border-radius:8px; font-size:13px; outline:none; background:#faf5ff; color:#2d1040; }
    .m-btn { padding:8px 16px; background:linear-gradient(135deg,#4a1080,#5c1a8b); color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; }
    .m-btn:disabled { opacity:.5; }

    /* Glossy LOGOUT button (image jaisa — power symbol + shine) */
    .calc-side-btn {
      display: flex; align-items: center; gap: 8px; margin: 6px 12px 8px;
      padding: 9px 12px; border: 0; border-radius: 10px; cursor: pointer; color: #fff;
      background: rgba(255,255,255,.12); transition: background .15s;
    }
    .calc-side-btn:hover { background: rgba(255,255,255,.22); }
    .logout-btn {
      position: relative; overflow: hidden;
      margin: 0 auto 14px; display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 48px; height: 48px; border-radius: 11px; border: none; cursor: pointer; gap: 1px;
      /* theme ke accent color se chalta hai — har theme me apna rang */
      background: linear-gradient(180deg, var(--anjaninex-red) 0%, var(--anjaninex-red-dark) 65%, var(--anjaninex-navy-dark) 140%);
      box-shadow: 0 7px 16px rgba(0,0,0,.45), inset 0 -4px 8px rgba(0,0,0,.3);
      transition: transform .15s;
    }
    /* upar wali shine (glossy look) */
    .logout-btn::before {
      content: ''; position: absolute; top: 3px; left: 6px; right: 6px; height: 38%;
      border-radius: 16px 16px 50% 50%;
      background: linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0));
      pointer-events: none;
    }
    .logout-btn:hover { transform: scale(1.07); }
    .logout-btn:active { transform: scale(.97); }
    .logout-btn svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
    .logout-txt { font-size: 7px; font-weight: 900; color: #fff; letter-spacing: .8px; text-shadow: 0 1px 2px rgba(0,0,0,.45); }

    /* ===== MOBILE (PWA/phone) ===== */
    .sidebar-backdrop { display: none; }
    @media (max-width: 767px) {
      .app-sidebar {
        position: fixed; top: 0; left: 0; bottom: 0; z-index: 60;
        box-shadow: 4px 0 24px rgba(0,0,0,.35);
      }
      .sidebar-backdrop {
        display: block; position: fixed; inset: 0; z-index: 55;
        background: rgba(0,0,0,.45);
      }
    }
  `]
})
export class ShellComponent {
  auth = inject(AuthService);
  wallet = inject(WalletService);
  subscription = inject(SubscriptionService);
  features = inject(FeatureService);
  private nativeTracking = inject(NativeTrackingService);
  private http = inject(HttpClient);
  menuOpen = signal(false);
  private menuCloseTimer: any = null;
  // Mobile par sidebar default band (overlay), desktop par khula
  sidebarOpen = signal(window.innerWidth >= 768);

  /** Width badalne par sidebar sync: desktop(≥768) khula, mobile band */
  @HostListener('window:resize')
  onResize() {
    this.sidebarOpen.set(window.innerWidth >= 768);
  }

  /** Mobile: nav link/button dabate hi sidebar band (overlay UX) */
  onNavClick(e: Event) {
    if (window.innerWidth >= 768) return;
    const t = e.target as HTMLElement;
    if (t.closest('a') || t.closest('button')) this.sidebarOpen.set(false);
  }

  // ---- Branch switcher (topbar) ----
  branchMenuOpen = signal(false);
  private branchMenuTimer: any = null;
  // Open/close branch menu. On open, auto-close after 10s (no instant mouseleave close).
  toggleBranchMenu(): void {
    if (this.branchMenuTimer) { clearTimeout(this.branchMenuTimer); this.branchMenuTimer = null; }
    const next = !this.branchMenuOpen();
    this.branchMenuOpen.set(next);
    if (next) {
      this.branchMenuTimer = setTimeout(() => this.branchMenuOpen.set(false), 10000);
    }
  }
  shellBranches = signal<{ id: string; name: string }[]>([]);
  currentBranchId = signal(localStorage.getItem('branchId') || '');
  currentBranchName = signal(localStorage.getItem('branchName') || 'Branch');

  loadBranches() {
    this.http.get<any[]>(`${environment.apiUrl}/api/core/branches`).subscribe({
      next: (b) => {
        this.shellBranches.set(b.map(x => ({ id: x.id, name: x.name })));
        // Saved nahi to head office / pehli branch dikha do (sirf label ke liye)
        if (!this.currentBranchId() && b.length) {
          const ho = b.find(x => x.isHeadOffice) || b[0];
          this.currentBranchName.set(ho.name);
        }
      },
      error: () => {}
    });
  }

  switchBranch(b: { id: string; name: string }) {
    localStorage.setItem('branchId', b.id);
    localStorage.setItem('branchName', b.name);
    this.currentBranchId.set(b.id);
    this.currentBranchName.set(b.name);
    if (this.branchMenuTimer) { clearTimeout(this.branchMenuTimer); this.branchMenuTimer = null; }
    this.branchMenuOpen.set(false);
    // Pura app naye branch context me — fresh reload sabse safe
    window.location.reload();
  }

  // ---- Notifications (bell) ----
  notifOpen = signal(false);
  notifs = signal<any[]>([]);
  unreadCount = signal(0);
  private notifCloseTimer: any = null;

  // Cursor bell se hate to turant band nahi — 2 sec baad.
  scheduleClose() { this.cancelClose(); this.notifCloseTimer = setTimeout(() => this.notifOpen.set(false), 2000); }
  cancelClose() { if (this.notifCloseTimer) { clearTimeout(this.notifCloseTimer); this.notifCloseTimer = null; } }
  // Profile menu: cursor hatne ke 4 sec baad band.
  scheduleMenuClose() { this.cancelMenuClose(); this.menuCloseTimer = setTimeout(() => this.menuOpen.set(false), 4000); }
  cancelMenuClose() { if (this.menuCloseTimer) { clearTimeout(this.menuCloseTimer); this.menuCloseTimer = null; } }

  private lastSeen(): number {
    try { return +(localStorage.getItem('notif_last_seen') || 0); } catch { return 0; }
  }

  toggleNotifs() {
    this.notifOpen.set(!this.notifOpen());
    if (this.notifOpen()) this.loadNotifs();
  }
  loadNotifs() {
    this.http.get<any[]>(`${environment.apiUrl}/api/me/notifications`).subscribe({
      next: n => {
        this.notifs.set(n);
        const seen = this.lastSeen();
        // Unread = jo abhi tak padha nahi (real read=false) AUR last-seen ke baad aaya.
        this.unreadCount.set(n.filter(x => !x.read && new Date(x.createdAt).getTime() > seen).length);

        // 🔔 Naya notification aaya (pichli baar se naya timestamp)? Ding bajao — PC + mobile.
        const newest = n.filter(x => !x.read)
          .reduce((m, x) => Math.max(m, new Date(x.createdAt).getTime()), 0);
        if (this.lastNotifStamp > 0 && newest > this.lastNotifStamp) this.playDing();
        if (newest > 0) this.lastNotifStamp = newest;
      },
      error: () => {}
    });
  }

  // WhatsApp-style "ding" — Web Audio se generate hota hai (koi file nahi chahiye).
  // Browser policy: user ne page par ek baar click/tap kiya ho tabhi bajta hai.
  private lastNotifStamp = 0;
  private audioCtx: AudioContext | null = null;
  private playDing() {
    try {
      this.audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
      const t = ctx.currentTime;
      // do-tone chime: E6 -> C6
      [[1318.5, 0], [1046.5, 0.12]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + delay);
        gain.gain.exponentialRampToValueAtTime(0.25, t + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + delay);
        osc.stop(t + delay + 0.55);
      });
    } catch { /* audio blocked/unsupported — chup raho */ }
  }
  markAllRead() {
    // Pending-payment notifications derived hote hain (DB me nahi) — isliye "last seen" time yaad
    // rakho; usse purane notifications red-dot me count nahi honge. Naya aaya to phir dot aayega.
    try { localStorage.setItem('notif_last_seen', String(Date.now())); } catch {}
    this.unreadCount.set(0);
    this.http.post(`${environment.apiUrl}/api/me/notifications/read-all`, {}).subscribe({
      next: () => this.loadNotifs(),
      error: () => {}
    });
  }

  // ---- Color themes (5) — sidebar dots se ----
  colorThemes = [
    { key: 'classic',      name: 'Classic Navy',  color: '#1B2E5C' },
    { key: 'theme-sunset', name: 'Sunset Blend',  color: 'linear-gradient(135deg,#7C3AED,#EC4899,#F97316)' },
    { key: 'theme-aurora', name: 'Aurora Blend',  color: 'linear-gradient(135deg,#06B6D4,#3B82F6,#8B5CF6)' },
    { key: 'theme-neon',   name: 'Neon Cyber',    color: '#00E676' },
    { key: 'theme-violet', name: 'Neon Violet',   color: '#E040FB' },
    { key: 'theme-gold',   name: 'Royal Cherry Gold', color: 'linear-gradient(135deg,#5E1219,#D4AF37)' }
  ];
  // Theme now comes from the firm (set by super-admin), not localStorage / user picker.
  colorTheme = signal('classic');

  private applyColorTheme(k: string) {
    document.body.classList.remove(
      'theme-sunset', 'theme-aurora', 'theme-neon', 'theme-violet', 'theme-gold',
      'theme-path1', 'theme-path2', 'theme-path3', 'theme-path4', 'theme-anjaninex',
      'theme-royal', 'theme-forest', 'theme-ocean', 'theme-midnight'   // purane keys cleanup
    );
    if (k !== 'classic') document.body.classList.add(k);
  }

  // ---- Theme (day/night) ----
  dark = signal(localStorage.getItem('theme') === 'dark');
  toggleTheme() {
    this.dark.set(!this.dark());
    localStorage.setItem('theme', this.dark() ? 'dark' : 'light');
    document.body.classList.toggle('dark-mode', this.dark());
  }

  // ---- Profile / Password / Sessions modals ----
  profileOpen = signal(false);
  passwordOpen = signal(false);
  sessionsOpen = signal(false);
  mBusy = signal(false);
  mMsg = signal('');
  mErr = signal('');

  pfName = ''; pfEmail = ''; pfPhone = '';
  cpCurrent = ''; cpNew = ''; cpConfirm = '';
  sessions = signal<any[]>([]);

  private resetModalState() { this.mBusy.set(false); this.mMsg.set(''); this.mErr.set(''); }

  openProfile() {
    this.menuOpen.set(false);
    this.resetModalState();
    this.profileOpen.set(true);
    this.http.get<any>(`${environment.apiUrl}/api/me/profile`).subscribe({
      next: p => { this.pfName = p.fullName; this.pfEmail = p.email || ''; this.pfPhone = p.phone || ''; },
      error: () => {}
    });
  }
  saveProfile() {
    this.resetModalState();
    if (!this.pfName.trim()) { this.mErr.set('Naam khali nahi ho sakta.'); return; }
    this.mBusy.set(true);
    this.http.put(`${environment.apiUrl}/api/me/profile`, {
      fullName: this.pfName.trim(), email: this.pfEmail || null, phone: this.pfPhone || null
    }).subscribe({
      next: () => { this.mBusy.set(false); this.mMsg.set('✅ Profile save ho gaya! (naya naam agli login par dikhega)'); },
      error: (e) => { this.mBusy.set(false); this.mErr.set(e?.error?.error ?? 'Save nahi hua'); }
    });
  }

  openPassword() {
    this.menuOpen.set(false);
    this.resetModalState();
    this.cpCurrent = ''; this.cpNew = ''; this.cpConfirm = '';
    this.passwordOpen.set(true);
  }
  changePassword() {
    this.resetModalState();
    if (this.cpNew.length < 6) { this.mErr.set('Naya password kam se kam 6 character ka ho.'); return; }
    if (this.cpNew !== this.cpConfirm) { this.mErr.set('Dono naye password match nahi karte.'); return; }
    this.mBusy.set(true);
    this.http.post(`${environment.apiUrl}/api/me/change-password`, {
      currentPassword: this.cpCurrent, newPassword: this.cpNew
    }).subscribe({
      next: () => { this.mBusy.set(false); this.mMsg.set('✅ Password badal gaya!'); this.cpCurrent = this.cpNew = this.cpConfirm = ''; },
      error: (e) => { this.mBusy.set(false); this.mErr.set(e?.error?.error ?? 'Password nahi badla'); }
    });
  }

  openSessions() {
    this.menuOpen.set(false);
    this.resetModalState();
    this.sessionsOpen.set(true);
    this.http.get<any[]>(`${environment.apiUrl}/api/me/sessions`).subscribe({
      next: s => this.sessions.set(s),
      error: () => {}
    });
  }
  revokeOthers() {
    if (!confirm('Baki saare devices se logout kar dein? (ye device logged-in rahega)')) return;
    this.mBusy.set(true);
    this.http.post<any>(`${environment.apiUrl}/api/me/sessions/revoke-others`, {}).subscribe({
      next: (r) => { this.mBusy.set(false); this.mMsg.set(`✅ ${r.revoked} session(s) logout ho gaye`); this.openSessions(); },
      error: () => this.mBusy.set(false)
    });
  }
  rechargeOpen = signal(false);
  calcOpen = signal(false);   // sidebar Calculator
  version = (window as any).__APP_VERSION__ ?? '1.0.0';
  anjaninexUrl = environment.anjaninexUrl;

  constructor() {
    // Day/night dark-mode (user-controlled — unchanged).
    document.body.classList.toggle('dark-mode', this.dark());

    // UI color theme is FIXED per-firm (assigned by Anjaninex super-admin).
    // firmTheme is a signal that fills in once /api/me/modules resolves, so apply
    // it reactively — applies immediately if already loaded, and re-applies on load.
    effect(() => {
      const k = this.features.firmTheme() || 'classic';
      this.colorTheme.set(k);
      this.applyColorTheme(k);
    });

    // Notification count (bell ka red dot) — har 30s refresh, taaki nayi
    // complaint/payment aate hi bell blink ho (page reload ke bina).
    this.loadNotifs();
    setInterval(() => this.loadNotifs(), 30_000);

    // Super admin ki koi firm nahi — firm-scoped APIs (wallet/subscription/modules)
    // uske liye call karna = errors + retry loop + rate-limit. Skip karo.
    if (this.isSuperAdmin()) return;

    this.loadBranches();

    // Load wallet, subscription status, and feature flags on shell mount
    this.wallet.refresh();
    this.subscription.refresh();
    this.features.refresh();
    // Refresh every 60s while shell is active
    setInterval(() => {
      this.wallet.refresh();
      this.subscription.refresh();
    }, 60_000);

    // STAFF LIVE LOCATION — jo staff aaj check-in hai (check-out nahi hua), uski
    // location har 5 min me server ko jati hai → HR Live Map par dikhti hai.
    // Limitation: app/browser khula hona chahiye — band app background me GPS nahi de sakti.
    this.startLocationPings();
  }

  private startLocationPings() {
    const tick = () => {
      if (!this.features.has('hr')) return;   // HR module hi nahi to kuch mat karo
      this.http.get<any>(`${environment.apiUrl}/api/hr/attendance/today`).subscribe({
        next: async (log) => {
          const checkedIn = !!(log && log.checkInAt && !log.checkOutAt);

          // NATIVE APK: background watcher (app band ho tab bhi chalta hai)
          if (await this.nativeTracking.isNative()) {
            if (checkedIn) this.nativeTracking.startTracking();
            else this.nativeTracking.stopTracking();
            return;   // native me web-ping ki zaroorat nahi
          }

          // BROWSER/PWA: app khuli ho tabhi — har 5 min ka ping
          if (checkedIn && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
              this.http.post(`${environment.apiUrl}/api/hr/location/ping`, {
                latitude: +pos.coords.latitude.toFixed(6),
                longitude: +pos.coords.longitude.toFixed(6),
                accuracy: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
                speed: pos.coords.speed != null ? +pos.coords.speed.toFixed(2) : null,
                batteryPct: null,
                isBackground: false
              }).subscribe({ next: () => {}, error: () => {} });
            }, () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
          }
        },
        error: () => {}   // 404 = login employee se linked nahi — chup-chaap skip
      });
    };
    setTimeout(tick, 15_000);                 // login ke 15s baad pehla ping
    setInterval(tick, 5 * 60_000);            // fir har 5 minute
  }

  initials(): string {
    const name = this.auth.user()?.fullName ?? '';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  isSuperAdmin(): boolean {
    // Only Anjaninex super_admin role should see this button — NOT firm_owner/firm_admin
    return this.auth.hasRole('super_admin');
  }

  // Footer version button → "What's New": latest release ki features/fixes dikhाओ
  showWhatsNew() {
    this.http.get<any>(`${environment.apiUrl}/api/version/changelog/latest`).subscribe({
      next: (c) => {
        if (!c) { alert(`Vyapaar Setu v${this.version}`); return; }
        const list = (arr: any, icon: string) => {
          try {
            const a = Array.isArray(arr) ? arr : JSON.parse(arr || '[]');
            return a.map((x: string) => `${icon} ${x}`).join('\n');
          } catch { return ''; }
        };
        const parts = [
          `✨ Vyapaar Setu v${c.version} — ${c.releaseDate || ''}`,
          '',
          list(c.newFeatures, '🆕'),
          list(c.improvements, '⚡'),
          list(c.fixes, '🔧')
        ].filter(Boolean);
        alert(parts.join('\n'));
      },
      error: () => alert(`Vyapaar Setu v${this.version}`)
    });
  }

  openRecharge(): void {
    this.rechargeOpen.set(true);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
