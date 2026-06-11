import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradingSubNavComponent } from '../../trading/components/trading-sub-nav.component';
import {
  MastersService, UserListItem, UserDetail, CreateUser, UpdateUser, UserKpi,
  Branch, RoleItem, SessionItem
} from '../services/masters.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { PaginatorComponent } from '../../../shared/paginator.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, TradingSubNavComponent, BackButtonComponent, PaginatorComponent],
  template: `
  <div class="max-w-7xl mx-auto">
    <div class="page-top-bar"><app-back-button></app-back-button></div>


    <!-- HEADER -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="font-display font-black text-2xl text-[#1B2E5C]">👤 User Management</h2>
        <p class="text-sm text-[#4A5878]">Manage system users, roles &amp; access</p>
      </div>
      <button (click)="openAdd()" class="btn-primary">+ Add User</button>
    </div>

    <app-trading-sub-nav></app-trading-sub-nav>

    <!-- KPI CARDS -->
    <div class="grid grid-cols-5 gap-3 mb-4">
      <div class="kpi kpi-navy">
        <div class="kpi-lbl">TOTAL USERS</div>
        <div class="kpi-val">{{ kpi()?.total ?? '—' }}</div>
      </div>
      <div class="kpi kpi-green">
        <div class="kpi-lbl">✅ ACTIVE</div>
        <div class="kpi-val">{{ kpi()?.active ?? '—' }}</div>
      </div>
      <div class="kpi kpi-yellow">
        <div class="kpi-lbl">🕒 LOGGED IN TODAY</div>
        <div class="kpi-val">{{ kpi()?.loggedInToday ?? '—' }}</div>
      </div>
      <div class="kpi kpi-red">
        <div class="kpi-lbl">🔒 LOCKED</div>
        <div class="kpi-val">{{ kpi()?.locked ?? '—' }}</div>
      </div>
      <div class="kpi kpi-cream">
        <div class="kpi-lbl">📅 NEW THIS MONTH</div>
        <div class="kpi-val">{{ kpi()?.createdThisMonth ?? '—' }}</div>
      </div>
    </div>

    <!-- TOOLBAR -->
    <div class="card p-3 mb-3">
      <div class="grid grid-cols-12 gap-3 items-end">
        <div class="col-span-4">
          <label class="lbl">SEARCH</label>
          <input [(ngModel)]="searchTerm" (ngModelChange)="onSearchChange()"
                 placeholder="Search by name, username, mobile, email…" class="ip">
        </div>
        <div class="col-span-3">
          <label class="lbl">ROLE</label>
          <select [(ngModel)]="filterRoleId" (change)="load()" class="ip">
            <option value="">All Roles</option>
            @for (r of roles(); track r.id) {
              <option [value]="r.id">{{ r.name }}</option>
            }
          </select>
        </div>
        <div class="col-span-3">
          <label class="lbl">BRANCH</label>
          <select [(ngModel)]="filterBranchId" (change)="load()" class="ip">
            <option value="">All Branches</option>
            @for (b of branches(); track b.id) {
              <option [value]="b.id">{{ b.name }}</option>
            }
          </select>
        </div>
        <div class="col-span-2">
          <label class="lbl">STATUS</label>
          <select [(ngModel)]="filterStatus" (change)="load()" class="ip">
            <option value="">All</option>
            <option value="active">✅ Active</option>
            <option value="inactive">⚪ Inactive</option>
            <option value="locked">🔒 Locked</option>
          </select>
        </div>
      </div>
    </div>

    <!-- TABLE -->
    <div class="card p-0 overflow-hidden">
      @if (loading()) {
        <div class="p-8 text-center text-gray-500">Loading…</div>
      } @else if (users().length === 0) {
        <div class="p-8 text-center text-gray-500">
          <div class="text-4xl mb-2">🙋‍♂️</div>
          No users found. <button (click)="openAdd()" class="text-[#DC2626] font-bold hover:underline">Add the first user</button>
        </div>
      } @else {
        <table class="w-full text-sm">
          <thead class="bg-[#FAF7F0] text-[#1B2E5C] text-xs uppercase">
            <tr>
              <th class="px-3 py-3 text-left w-10">#</th>
              <th class="px-3 py-3 text-left">User</th>
              <th class="px-3 py-3 text-left">Contact</th>
              <th class="px-3 py-3 text-left">Role</th>
              <th class="px-3 py-3 text-left">Branch</th>
              <th class="px-3 py-3 text-left">Last Seen</th>
              <th class="px-3 py-3 text-center">Status</th>
              <th class="px-3 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (u of pagedUsers(); track u.id; let i = $index) {
              <tr class="border-t hover:bg-[#FAF7F0]">
                <td class="px-3 py-3 text-gray-500">{{ (pageClamped()-1)*pageSize() + i + 1 }}</td>
                <td class="px-3 py-3">
                  <div class="flex items-center gap-3">
                    <div class="avatar" [style.background]="avatarColor(u.fullName)">
                      <span class="online-dot"
                            [class.online]="u.activeSessionsCount > 0"></span>
                      {{ initials(u.fullName) }}
                    </div>
                    <div>
                      <div class="font-bold text-[#1B2E5C]">{{ u.fullName }}</div>
                      <div class="text-xs text-gray-500">&#64;{{ u.username }}</div>
                    </div>
                  </div>
                </td>
                <td class="px-3 py-3 text-xs">
                  <div>{{ u.phone || '—' }}</div>
                  <div class="text-gray-500">{{ u.email || '—' }}</div>
                </td>
                <td class="px-3 py-3">
                  @if (u.roleName) {
                    <span class="role-pill">{{ u.roleName }}</span>
                  } @else {
                    <span class="text-xs text-gray-400 italic">No role</span>
                  }
                </td>
                <td class="px-3 py-3 text-xs">{{ u.defaultBranchName || '—' }}</td>
                <td class="px-3 py-3 text-xs">
                  @if (u.lastLoginAt) {
                    {{ relativeTime(u.lastLoginAt) }}
                  } @else {
                    <span class="text-gray-400 italic">Never</span>
                  }
                </td>
                <td class="px-3 py-3 text-center">
                  @if (u.isLocked) {
                    <span class="status-pill status-red">🔒 Locked</span>
                  } @else if (u.isActive) {
                    <span class="status-pill status-green">✅ Active</span>
                  } @else {
                    <span class="status-pill status-grey">⚪ Inactive</span>
                  }
                </td>
                <td class="px-3 py-3 text-center">
                  <div class="action-icons">
                    <button (click)="openDetail(u.id)" title="View details" class="ai-btn">👁️</button>
                    <button (click)="openEdit(u.id)" title="Edit" class="ai-btn">✏️</button>
                    <button (click)="openReset(u)" title="Reset password" class="ai-btn">🔑</button>
                    @if (u.isLocked) {
                      <button (click)="unlock(u.id)" title="Unlock" class="ai-btn">🔓</button>
                    } @else {
                      <button (click)="lock(u.id)" title="Lock" class="ai-btn">🔒</button>
                    }
                    <button (click)="del(u)" title="Deactivate" class="ai-btn ai-danger">🗑️</button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-paginator [total]="users().length" [page]="pageClamped()" [pageSize]="pageSize()"
                       (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event); page.set(1)"></app-paginator>
      }
    </div>

    <!-- ============================================== -->
    <!--                ADD/EDIT MODAL                  -->
    <!-- ============================================== -->
    @if (showForm()) {
      <div class="modal-overlay" (click)="closeForm()">
        <div class="modal-paper" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editing() ? '✏️ Edit User' : '👤 Add New User' }}</h3>
            <button (click)="closeForm()" class="x-btn">×</button>
          </div>

          <!-- Step indicator -->
          <div class="step-bar">
            <div class="step" [class.active]="step() === 1" [class.done]="step() > 1">
              <span class="step-num">1</span> Identity
            </div>
            <div class="step-line" [class.done]="step() > 1"></div>
            <div class="step" [class.active]="step() === 2" [class.done]="step() > 2">
              <span class="step-num">2</span> Access
            </div>
            <div class="step-line" [class.done]="step() > 2"></div>
            <div class="step" [class.active]="step() === 3">
              <span class="step-num">3</span> Review
            </div>
          </div>

          <div class="modal-body">
            <!-- ============== STEP 1: IDENTITY ============== -->
            @if (step() === 1) {
              <div class="section-title">🪪 BASIC INFORMATION</div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="lbl">FULL NAME *</label>
                  <input [(ngModel)]="form.fullName" class="ip" placeholder="e.g. Jitesh Yadav">
                </div>
                <div>
                  <label class="lbl">USERNAME *</label>
                  <input [(ngModel)]="form.username" class="ip" [disabled]="!!editing()"
                         placeholder="login id (e.g. jitesh)">
                </div>
                <div>
                  <label class="lbl">MOBILE</label>
                  <input [(ngModel)]="form.phone" class="ip" placeholder="10-digit mobile">
                </div>
                <div>
                  <label class="lbl">EMAIL</label>
                  <input [(ngModel)]="form.email" type="email" class="ip" placeholder="user&#64;example.com">
                </div>
                @if (!editing()) {
                  <div class="col-span-2">
                    <label class="lbl">PASSWORD * (min 6 chars)</label>
                    <input [(ngModel)]="form.password" type="password" class="ip" placeholder="Set initial password">
                  </div>
                }
              </div>
            }

            <!-- ============== STEP 2: ACCESS ============== -->
            @if (step() === 2) {
              <div class="section-title">🛡️ ROLE &amp; BRANCH</div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="lbl">ROLE *</label>
                  <select [(ngModel)]="form.roleId" class="ip">
                    <option [ngValue]="null">— Select Role —</option>
                    @for (r of roles(); track r.id) {
                      <option [ngValue]="r.id">{{ r.name }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="lbl">DEFAULT BRANCH *</label>
                  <select [(ngModel)]="form.defaultBranchId" class="ip">
                    <option [ngValue]="null">— Select Branch —</option>
                    @for (b of branches(); track b.id) {
                      <option [ngValue]="b.id">{{ b.name }}</option>
                    }
                  </select>
                </div>
              </div>

              <div class="section-title mt-4">⚙️ ACCESS SETTINGS</div>
              <div class="grid grid-cols-2 gap-3">
                <label class="check">
                  <input type="checkbox" [(ngModel)]="form.isActive">
                  <span><strong>Active</strong> — User can log in</span>
                </label>
                <label class="check">
                  <input type="checkbox" [(ngModel)]="form.requires2fa">
                  <span><strong>Require 2FA</strong> — Stronger security</span>
                </label>
              </div>
            }

            <!-- ============== STEP 3: REVIEW ============== -->
            @if (step() === 3) {
              <div class="section-title">📝 REVIEW BEFORE SAVING</div>
              <div class="review-grid">
                <div><span>Full Name</span><strong>{{ form.fullName || '—' }}</strong></div>
                <div><span>Username</span><strong>&#64;{{ form.username || '—' }}</strong></div>
                <div><span>Mobile</span><strong>{{ form.phone || '—' }}</strong></div>
                <div><span>Email</span><strong>{{ form.email || '—' }}</strong></div>
                <div><span>Role</span><strong>{{ roleName(form.roleId) || '—' }}</strong></div>
                <div><span>Branch</span><strong>{{ branchName(form.defaultBranchId) || '—' }}</strong></div>
                <div><span>Status</span><strong>{{ form.isActive ? 'Active' : 'Inactive' }}</strong></div>
                <div><span>2FA</span><strong>{{ form.requires2fa ? 'Required' : 'Not required' }}</strong></div>
              </div>
              <div class="hint">
                @if (editing()) {
                  ✏️ Click <strong>Update User</strong> to save changes.
                } @else {
                  🚀 Click <strong>Create User</strong> to add this user. They can log in immediately with the password you set.
                }
              </div>
            }
          </div>

          <div class="modal-footer">
            @if (step() > 1) {
              <button (click)="prevStep()" class="btn-secondary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:5px"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
                Back
              </button>
            } @else { <div></div> }
            <div class="flex gap-2">
              <button (click)="closeForm()" class="btn-cancel">Cancel</button>
              @if (step() < 3) {
                <button (click)="nextStep()" class="btn-primary">Next →</button>
              } @else {
                <button (click)="save()" class="btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Saving…' : (editing() ? '✓ Update User' : '✨ Create User') }}
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }

    <!-- ============================================== -->
    <!--            DETAIL SLIDE-OVER PANEL             -->
    <!-- ============================================== -->
    @if (showDetail() && detail()) {
      <div class="slide-overlay" (click)="closeDetail()">
        <div class="slide-panel" (click)="$event.stopPropagation()">
          <div class="slide-head">
            <div class="flex items-center gap-3">
              <div class="avatar avatar-lg" [style.background]="avatarColor(detail()!.fullName)">
                {{ initials(detail()!.fullName) }}
              </div>
              <div>
                <div class="font-display font-black text-xl text-[#1B2E5C]">{{ detail()!.fullName }}</div>
                <div class="text-sm text-gray-500">&#64;{{ detail()!.username }}</div>
              </div>
            </div>
            <button (click)="closeDetail()" class="x-btn">×</button>
          </div>

          <div class="slide-body">
            <!-- Status pills row -->
            <div class="flex gap-2 mb-4">
              @if (detail()!.isLocked) { <span class="status-pill status-red">🔒 Locked</span> }
              @else if (detail()!.isActive) { <span class="status-pill status-green">✅ Active</span> }
              @else { <span class="status-pill status-grey">⚪ Inactive</span> }
              @if (detail()!.requires2fa) { <span class="status-pill status-navy">🔐 2FA Required</span> }
              @if (detail()!.canViewAllBranches) { <span class="status-pill status-navy">🌐 All Branches</span> }
            </div>

            <!-- Profile -->
            <div class="dp-card">
              <div class="dp-card-head">📇 CONTACT</div>
              <div class="dp-row"><span>Mobile</span><strong>{{ detail()!.phone || '—' }}</strong></div>
              <div class="dp-row"><span>Email</span><strong>{{ detail()!.email || '—' }}</strong></div>
              <div class="dp-row"><span>Role</span><strong>{{ detail()!.roleName || '—' }}</strong></div>
              <div class="dp-row"><span>Default Branch</span><strong>{{ detail()!.defaultBranchName || '—' }}</strong></div>
              <div class="dp-row"><span>Last Login</span>
                <strong>
                  @if (detail()!.lastLoginAt) {
                    {{ relativeTime(detail()!.lastLoginAt!) }}
                  } @else { Never }
                </strong>
              </div>
              <div class="dp-row"><span>Created</span><strong>{{ detail()!.createdAt | date:'dd MMM yyyy' }}</strong></div>
            </div>

            <!-- Sessions -->
            <div class="dp-card">
              <div class="dp-card-head flex justify-between items-center">
                <span>💻 ACTIVE SESSIONS</span>
                @if (activeSessionCount() > 0) {
                  <button (click)="revokeAllSessions()" class="text-xs px-2 py-1 bg-[#DC2626] text-white rounded font-bold">
                    Force Logout All
                  </button>
                }
              </div>
              @if (sessions().length === 0) {
                <div class="text-xs text-gray-500 italic p-2">No sessions yet.</div>
              } @else {
                @for (s of sessions(); track s.id) {
                  <div class="sess-row" [class.revoked]="s.isRevoked">
                    <div class="text-xs">
                      <div class="font-mono font-bold">{{ s.ipAddress || 'unknown' }}</div>
                      <div class="text-gray-500 truncate" style="max-width:300px">
                        {{ s.userAgent || '—' }}
                      </div>
                    </div>
                    <div class="text-xs text-right">
                      <div>Last: {{ relativeTime(s.lastSeenAt) }}</div>
                      @if (s.isRevoked) {
                        <div class="text-red-600 font-bold">REVOKED</div>
                      }
                    </div>
                  </div>
                }
              }
            </div>

            <!-- Quick Actions -->
            <div class="dp-card">
              <div class="dp-card-head">⚡ QUICK ACTIONS</div>
              <div class="grid grid-cols-2 gap-2 mt-2">
                <button (click)="openEdit(detail()!.id)" class="btn-action">✏️ Edit</button>
                <button (click)="openReset(detail()!)" class="btn-action">🔑 Reset Password</button>
                @if (detail()!.isLocked) {
                  <button (click)="unlock(detail()!.id)" class="btn-action">🔓 Unlock</button>
                } @else {
                  <button (click)="lock(detail()!.id)" class="btn-action">🔒 Lock</button>
                }
                <button (click)="del(detail()!)" class="btn-action btn-danger">🗑️ Deactivate</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- ============================================== -->
    <!--             RESET PASSWORD MODAL               -->
    <!-- ============================================== -->
    @if (showReset()) {
      <div class="modal-overlay" (click)="closeReset()">
        <div class="modal-paper" style="max-width:420px" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>🔑 Reset Password</h3>
            <button (click)="closeReset()" class="x-btn">×</button>
          </div>
          <div class="modal-body">
            <p class="text-sm text-[#4A5878] mb-3">
              Set new password for <strong>{{ resetTarget()?.fullName }}</strong> (&#64;{{ resetTarget()?.username }}).
            </p>
            <label class="lbl">NEW PASSWORD (min 6 chars) *</label>
            <input [(ngModel)]="newPassword" type="password" class="ip" placeholder="New password">
          </div>
          <div class="modal-footer">
            <button (click)="closeReset()" class="btn-cancel">Cancel</button>
            <button (click)="doReset()" class="btn-primary" [disabled]="(newPassword?.length ?? 0) < 6">
              Reset Password
            </button>
          </div>
        </div>
      </div>
    }

  </div>
  `,
  styles: [`
    .card { background:#fff; border:1px solid #D6DDEA; border-radius:10px; }
    .lbl { display:block; font-size:10px; font-weight:700; color:#4A5878; letter-spacing:0.5px; margin-bottom:4px; }
    .ip { width:100%; padding:8px 10px; font-size:13px; border:1px solid #D6DDEA; border-radius:6px; background:#fff; color:#1B2E5C; }
    .ip:focus { outline:none; border-color:#1B2E5C; box-shadow:0 0 0 2px rgba(27,46,92,0.08); }
    .ip:disabled { background:#F3F4F6; color:#6B7280; }
    .btn-primary { padding:9px 16px; background:#DC2626; color:#fff; border:0; border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }
    .btn-primary:hover:not(:disabled) { background:#B91C1C; }
    .btn-primary:disabled { background:#9CA3AF; cursor:not-allowed; }
    .btn-secondary { padding:9px 14px; background:#fff; color:#1B2E5C; border:1px solid #D6DDEA; border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }
    .btn-cancel { padding:9px 16px; background:#fff; color:#4A5878; border:1px solid #D6DDEA; border-radius:6px; font-weight:700; font-size:13px; cursor:pointer; }

    /* KPI cards */
    .kpi { padding:14px 16px; border-radius:10px; border:1px solid #D6DDEA; background:#fff; }
    .kpi-lbl { font-size:10px; font-weight:700; color:#4A5878; letter-spacing:0.5px; margin-bottom:4px; }
    .kpi-val { font-size:24px; font-weight:900; color:#1B2E5C; line-height:1; }
    .kpi-navy { border-left:4px solid #1B2E5C; }
    .kpi-green { border-left:4px solid #10B981; }
    .kpi-yellow { border-left:4px solid #F59E0B; }
    .kpi-red { border-left:4px solid #DC2626; }
    .kpi-cream { border-left:4px solid #FAF7F0; background:#FAF7F0; }

    /* avatars */
    .avatar { width:38px; height:38px; border-radius:50%; color:#fff;
      display:inline-flex; align-items:center; justify-content:center;
      font-size:13px; font-weight:800; position:relative; flex-shrink:0; }
    .avatar-lg { width:54px; height:54px; font-size:18px; }
    .online-dot { position:absolute; bottom:-1px; right:-1px; width:11px; height:11px;
      background:#9CA3AF; border:2px solid #fff; border-radius:50%; }
    .online-dot.online { background:#10B981; box-shadow:0 0 0 0 rgba(16,185,129,0.6); animation:pulse 2s infinite; }
    @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(16,185,129,0.6)} 70%{box-shadow:0 0 0 5px rgba(16,185,129,0)} 100%{box-shadow:0 0 0 0 rgba(16,185,129,0)} }

    .role-pill { display:inline-block; padding:3px 9px; font-size:11px; font-weight:700;
      background:#1B2E5C; color:#fff; border-radius:6px; }
    .status-pill { display:inline-block; padding:3px 9px; font-size:11px; font-weight:700; border-radius:6px; }
    .status-green { background:#D1FAE5; color:#065F46; }
    .status-grey { background:#E5E7EB; color:#4B5563; }
    .status-red { background:#FEE2E2; color:#991B1B; }
    .status-navy { background:#E0E7FF; color:#1E3A8A; }

    .action-icons { display:inline-flex; gap:2px; }
    .ai-btn { width:30px; height:30px; border:0; background:transparent; border-radius:6px;
      cursor:pointer; font-size:14px; transition:background 0.15s; }
    .ai-btn:hover { background:#FAF7F0; }
    .ai-danger:hover { background:#FEE2E2; }

    /* modal */
    .modal-overlay { position:fixed; inset:0; background:rgba(27,46,92,0.55); z-index:1000;
      display:flex; align-items:center; justify-content:center; padding:30px 20px; overflow:auto; }
    .modal-paper { background:#fff; max-width:640px; width:100%; border-radius:12px;
      box-shadow:0 20px 60px rgba(0,0,0,0.3); overflow:hidden; }
    .modal-header { padding:14px 20px; border-bottom:1px solid #D6DDEA; display:flex;
      justify-content:space-between; align-items:center; }
    .modal-header h3 { font-size:17px; font-weight:800; color:#1B2E5C; margin:0; }
    .x-btn { border:0; background:transparent; font-size:26px; cursor:pointer; color:#6B7280; line-height:1; padding:0 6px; }
    .x-btn:hover { color:#DC2626; }
    .modal-body { padding:18px 20px; }
    .modal-footer { padding:14px 20px; background:#FAF7F0; border-top:1px solid #D6DDEA;
      display:flex; justify-content:space-between; align-items:center; }
    .section-title { font-size:11px; font-weight:800; color:#DC2626; letter-spacing:0.6px; margin-bottom:10px; }

    /* step bar */
    .step-bar { display:flex; align-items:center; gap:8px; padding:14px 20px; background:#FAF7F0;
      border-bottom:1px solid #D6DDEA; }
    .step { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#9CA3AF; }
    .step-num { width:24px; height:24px; border-radius:50%; background:#E5E7EB; color:#4B5563;
      display:inline-flex; align-items:center; justify-content:center; font-size:11px; }
    .step.active .step-num { background:#DC2626; color:#fff; }
    .step.active { color:#1B2E5C; }
    .step.done .step-num { background:#10B981; color:#fff; }
    .step.done { color:#10B981; }
    .step-line { flex:1; height:2px; background:#E5E7EB; }
    .step-line.done { background:#10B981; }

    /* review grid */
    .review-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .review-grid > div { display:flex; flex-direction:column; padding:8px 10px;
      background:#FAF7F0; border-radius:6px; }
    .review-grid span { font-size:10px; font-weight:700; color:#4A5878; letter-spacing:0.4px; }
    .review-grid strong { font-size:13px; color:#1B2E5C; margin-top:2px; }
    .hint { margin-top:14px; padding:10px 12px; background:#FEF3C7; border:1px solid #FCD34D;
      border-radius:6px; font-size:12px; color:#92400E; }

    .check { display:flex; align-items:center; gap:8px; padding:10px 12px;
      border:1px solid #D6DDEA; border-radius:6px; cursor:pointer; font-size:12px; color:#1B2E5C; }
    .check input { width:16px; height:16px; }

    /* slide-over */
    .slide-overlay { position:fixed; inset:0; background:rgba(27,46,92,0.4); z-index:999; }
    .slide-panel { position:fixed; top:0; right:0; bottom:0; width:480px; background:#fff;
      box-shadow:-10px 0 40px rgba(0,0,0,0.18); z-index:1001; display:flex; flex-direction:column;
      animation:slideIn 0.25s ease-out; }
    @keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }
    .slide-head { padding:18px 20px; border-bottom:1px solid #D6DDEA; display:flex;
      justify-content:space-between; align-items:center; }
    .slide-body { padding:16px 20px; overflow-y:auto; flex:1; }

    .dp-card { background:#FAF7F0; border:1px solid #D6DDEA; border-radius:8px; padding:12px; margin-bottom:12px; }
    .dp-card-head { font-size:11px; font-weight:800; color:#1B2E5C; letter-spacing:0.5px;
      margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #D6DDEA; }
    .dp-row { display:flex; justify-content:space-between; padding:5px 0; font-size:12px; }
    .dp-row span { color:#4A5878; }
    .dp-row strong { color:#1B2E5C; }

    .sess-row { display:flex; justify-content:space-between; align-items:center; padding:8px;
      border-bottom:1px solid #E5E7EB; }
    .sess-row:last-child { border-bottom:0; }
    .sess-row.revoked { opacity:0.5; }

    .btn-action { padding:9px 12px; background:#fff; color:#1B2E5C; border:1px solid #D6DDEA;
      border-radius:6px; font-weight:700; font-size:12px; cursor:pointer; text-align:left; }
    .btn-action:hover { background:#FAF7F0; }
    .btn-action.btn-danger { color:#DC2626; }
    .btn-action.btn-danger:hover { background:#FEE2E2; }

    @media (max-width: 640px) {
      /* Wide tables: let the card scroll horizontally instead of clipping */
      .card { overflow-x:auto !important; -webkit-overflow-scrolling:touch; }
      /* Modal: full-width on phone, smaller padding */
      .modal-overlay { padding:12px !important; align-items:flex-start; }
      .modal-paper { width:100% !important; max-width:100% !important; }
      .modal-header, .modal-body, .modal-footer { padding-left:14px; padding-right:14px; }
      .step-bar { padding:12px 14px; gap:4px; flex-wrap:wrap; }
      .review-grid { grid-template-columns:1fr !important; }
      /* Slide-over detail panel: full-width */
      .slide-panel { width:100% !important; max-width:100% !important; }
      .action-icons { flex-wrap:wrap; }
    }
  `]
})
export class UsersComponent {
  private svc = inject(MastersService);

  users = signal<UserListItem[]>([]);
  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageClamped = computed(() => {
    const pages = Math.max(1, Math.ceil(this.users().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });
  pagedUsers = computed(() => {
    const st = (this.pageClamped() - 1) * this.pageSize();
    return this.users().slice(st, st + this.pageSize());
  });
  kpi = signal<UserKpi | null>(null);
  branches = signal<Branch[]>([]);
  roles = signal<RoleItem[]>([]);
  loading = signal(true);

  searchTerm = '';
  filterRoleId = '';
  filterBranchId = '';
  filterStatus = '';

  // Form
  showForm = signal(false);
  editing = signal<UserDetail | null>(null);
  step = signal(1);
  saving = signal(false);
  form: any = this.blankForm();

  // Detail
  showDetail = signal(false);
  detail = signal<UserDetail | null>(null);
  sessions = signal<SessionItem[]>([]);
  activeSessionCount = computed(() => this.sessions().filter(s => !s.isRevoked).length);

  // Reset password
  showReset = signal(false);
  resetTarget = signal<UserListItem | UserDetail | null>(null);
  newPassword = '';

  private searchDebounce: any = null;

  ngOnInit() {
    this.svc.listBranches().subscribe(bs => this.branches.set(bs));
    this.svc.listRoles().subscribe(rs => this.roles.set(rs));
    this.load();
    this.loadKpi();
  }

  load() {
    this.loading.set(true);
    this.svc.listUsers({
      search: this.searchTerm || undefined,
      roleId: this.filterRoleId || undefined,
      branchId: this.filterBranchId || undefined,
      status: this.filterStatus || undefined
    }).subscribe({
      next: us => { this.users.set(us); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  loadKpi() {
    this.svc.userKpi().subscribe(k => this.kpi.set(k));
  }

  onSearchChange() {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.load(), 300);
  }

  // ============ FORM ============
  private blankForm() {
    return {
      fullName: '',
      username: '',
      password: '',
      email: '',
      phone: '',
      defaultBranchId: null,
      roleId: null,
      isActive: true,
      requires2fa: false
    };
  }

  openAdd() {
    this.form = this.blankForm();
    this.editing.set(null);
    this.step.set(1);
    this.showForm.set(true);
  }

  openEdit(id: string) {
    this.svc.getUser(id).subscribe(u => {
      this.editing.set(u);
      this.form = {
        fullName: u.fullName,
        username: u.username,
        password: '',
        email: u.email ?? '',
        phone: u.phone ?? '',
        defaultBranchId: u.defaultBranchId,
        roleId: u.roleId,
        isActive: u.isActive,
        requires2fa: u.requires2fa
      };
      this.step.set(1);
      this.showForm.set(true);
      this.showDetail.set(false);
    });
  }

  closeForm() { this.showForm.set(false); }

  nextStep() {
    if (this.step() === 1) {
      if (!this.form.fullName?.trim()) { alert('Full name is required'); return; }
      if (!this.form.username?.trim()) { alert('Username is required'); return; }
      if (!this.editing() && (!this.form.password || this.form.password.length < 6)) {
        alert('Password must be at least 6 characters'); return;
      }
    }
    if (this.step() === 2) {
      if (!this.form.roleId) { alert('Please select a role'); return; }
      if (!this.form.defaultBranchId) { alert('Please select a default branch'); return; }
    }
    this.step.set(this.step() + 1);
  }

  prevStep() { this.step.set(this.step() - 1); }

  save() {
    this.saving.set(true);
    const editing = this.editing();
    if (editing) {
      const payload: UpdateUser = {
        fullName: this.form.fullName,
        email: this.form.email || null,
        phone: this.form.phone || null,
        defaultBranchId: this.form.defaultBranchId,
        roleId: this.form.roleId,
        isActive: this.form.isActive,
        requires2fa: this.form.requires2fa
      };
      this.svc.updateUser(editing.id, payload).subscribe({
        next: () => { this.saving.set(false); this.showForm.set(false); this.load(); this.loadKpi(); },
        error: (e) => { this.saving.set(false); alert('Failed: ' + (e?.error?.error ?? 'unknown')); }
      });
    } else {
      const payload: CreateUser = { ...this.form };
      this.svc.createUser(payload).subscribe({
        next: () => { this.saving.set(false); this.showForm.set(false); this.load(); this.loadKpi(); },
        error: (e) => { this.saving.set(false); alert('Failed: ' + (e?.error?.error ?? 'unknown')); }
      });
    }
  }

  // ============ DETAIL ============
  openDetail(id: string) {
    this.svc.getUser(id).subscribe(u => {
      this.detail.set(u);
      this.showDetail.set(true);
      this.svc.listUserSessions(id).subscribe(ss => this.sessions.set(ss));
    });
  }
  closeDetail() { this.showDetail.set(false); }

  revokeAllSessions() {
    const d = this.detail();
    if (!d) return;
    if (!confirm('Force logout all sessions for this user?')) return;
    this.svc.revokeAllUserSessions(d.id).subscribe(() => {
      this.svc.listUserSessions(d.id).subscribe(ss => this.sessions.set(ss));
      this.load();
    });
  }

  // ============ ACTIONS ============
  lock(id: string) {
    if (!confirm('Lock this user? They will not be able to log in.')) return;
    this.svc.lockUser(id).subscribe(() => { this.load(); this.loadKpi(); if (this.detail()?.id === id) this.openDetail(id); });
  }
  unlock(id: string) {
    this.svc.unlockUser(id).subscribe(() => { this.load(); this.loadKpi(); if (this.detail()?.id === id) this.openDetail(id); });
  }
  del(u: UserListItem | UserDetail) {
    if (!confirm(`Deactivate user "${u.fullName}"? They will not be able to log in.`)) return;
    this.svc.deleteUser(u.id).subscribe(() => { this.load(); this.loadKpi(); this.showDetail.set(false); });
  }

  openReset(u: UserListItem | UserDetail) {
    this.resetTarget.set(u);
    this.newPassword = '';
    this.showReset.set(true);
  }
  closeReset() { this.showReset.set(false); }
  doReset() {
    const t = this.resetTarget();
    if (!t || this.newPassword.length < 6) return;
    this.svc.resetUserPassword(t.id, this.newPassword).subscribe({
      next: () => { alert('✓ Password reset successfully'); this.showReset.set(false); },
      error: (e) => alert('Failed: ' + (e?.error?.error ?? 'unknown'))
    });
  }

  // ============ HELPERS ============
  initials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  avatarColor(name: string): string {
    const colors = ['#1B2E5C', '#DC2626', '#10B981', '#F59E0B', '#7C3AED', '#0EA5E9', '#EC4899'];
    let hash = 0;
    for (const ch of (name || '?')) hash = ((hash << 5) - hash) + ch.charCodeAt(0);
    return colors[Math.abs(hash) % colors.length];
  }
  relativeTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso).getTime();
    const now = Date.now();
    const sec = Math.floor((now - d) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  }
  roleName(id: string | null): string | null {
    if (!id) return null;
    return this.roles().find(r => r.id === id)?.name ?? null;
  }
  branchName(id: string | null): string | null {
    if (!id) return null;
    return this.branches().find(b => b.id === id)?.name ?? null;
  }
}
