import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { INDIAN_STATES, gstCodeForState, citiesForState } from '../../shared/india-data';

type Tab = 'users' | 'roles' | 'perms' | 'branches';

interface TeamBranch {
  id: string; code: string; name: string; address: string | null; city: string | null;
  state: string | null; pincode: string | null; phone: string | null;
  gstStateCode: string | null; isHeadOffice: boolean; isActive: boolean;
}
interface TeamUser {
  id: string; fullName: string; username: string; email: string | null; phone: string | null;
  isActive: boolean; lastLoginAt: string | null; canViewAllBranches: boolean;
  roles: { id: string; name: string; code: string }[]; branchIds: string[];
}
interface TeamRole {
  id: string; code: string; name: string; description: string | null; color: string | null;
  isSystem: boolean; users: number; permissions: number;
}
interface Perm {
  id: number; code: string; module: string; resource: string; action: string;
  scope: string; description: string | null; isDangerous: boolean;
}

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, FormsModule, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🛡️ Team &amp; Security</h2>
          <p class="text-sm text-[#6b3fa0]">Staff logins · Roles · Permissions · Branches</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-2 mb-5">
        <button (click)="tab.set('users')" [class]="tabCls('users')">👤 Users ({{ users().length }})</button>
        <button (click)="tab.set('roles')" [class]="tabCls('roles')">🎭 Roles ({{ roles().length }})</button>
        <button (click)="tab.set('perms')" [class]="tabCls('perms')">🔑 Permissions</button>
        <button (click)="tab.set('branches')" [class]="tabCls('branches')">🏢 Branches ({{ branches().length }})</button>
      </div>

      @if (error()) {
        <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">{{ error() }}</div>
      }

      <!-- ================= USERS ================= -->
      @if (tab() === 'users') {
        <div class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-[#5c1a8b]">Staff Logins</h3>
            <button (click)="openUserForm()" class="btn-primary text-sm">+ Add User</button>
          </div>
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] text-xs uppercase">
              <tr>
                <th class="px-2 py-2 text-left">S.NO</th>
                <th class="px-2 py-2 text-left">Name</th>
                <th class="px-2 py-2 text-left">Username</th>
                <th class="px-2 py-2 text-left">Role</th>
                <th class="px-2 py-2 text-left">Branches</th>
                <th class="px-2 py-2 text-center">Status</th>
                <th class="px-2 py-2 text-left">Last Login</th>
                <th class="px-2 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (u of users(); track u.id; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-2 py-2 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-2 py-2 font-semibold">{{ u.fullName }}</td>
                  <td class="px-2 py-2 font-mono text-xs">{{ u.username }}</td>
                  <td class="px-2 py-2">
                    @for (r of u.roles; track r.id) {
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ede9fe] text-[#5c1a8b] mr-1">{{ r.name }}</span>
                    }
                  </td>
                  <td class="px-2 py-2 text-xs">
                    {{ u.canViewAllBranches ? 'Saari branches' : branchNames(u.branchIds) }}
                  </td>
                  <td class="px-2 py-2 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          [class]="u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                      {{ u.isActive ? 'ACTIVE' : 'OFF' }}
                    </span>
                  </td>
                  <td class="px-2 py-2 text-xs text-gray-500">{{ u.lastLoginAt ? (u.lastLoginAt | date:'dd-MMM HH:mm') : '—' }}</td>
                  <td class="px-2 py-2 text-center whitespace-nowrap">
                    <button (click)="openUserForm(u)" class="text-xs font-bold text-[#5c1a8b] hover:underline mr-2">✏️ Edit</button>
                    <button (click)="openPwReset(u)" class="text-xs font-bold text-orange-600 hover:underline mr-2">🔒 Password</button>
                    <button (click)="deleteUser(u)" class="text-xs font-bold text-red-600 hover:underline">🗑 Delete</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="text-center text-gray-400 py-6">Koi user nahi</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- ================= ROLES ================= -->
      @if (tab() === 'roles') {
        <div class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-[#5c1a8b]">Roles</h3>
            <button (click)="showRoleForm.set(true)" class="btn-primary text-sm">+ Add Role</button>
          </div>
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] text-xs uppercase">
              <tr>
                <th class="px-2 py-2 text-left">S.NO</th>
                <th class="px-2 py-2 text-left">Role</th>
                <th class="px-2 py-2 text-left">Code</th>
                <th class="px-2 py-2 text-left">Description</th>
                <th class="px-2 py-2 text-center">Users</th>
                <th class="px-2 py-2 text-center">Permissions</th>
                <th class="px-2 py-2 text-center">Type</th>
              </tr>
            </thead>
            <tbody>
              @for (r of roles(); track r.id; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff] cursor-pointer" (click)="openPermGrid(r)">
                  <td class="px-2 py-2 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-2 py-2 font-semibold">{{ r.name }}</td>
                  <td class="px-2 py-2 font-mono text-xs">{{ r.code }}</td>
                  <td class="px-2 py-2 text-xs text-gray-500">{{ r.description || '—' }}</td>
                  <td class="px-2 py-2 text-center font-mono">{{ r.users }}</td>
                  <td class="px-2 py-2 text-center font-mono">{{ r.permissions }}</td>
                  <td class="px-2 py-2 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          [class]="r.isSystem ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'">
                      {{ r.isSystem ? 'SYSTEM' : 'CUSTOM' }}
                    </span>
                    @if (!r.isSystem) {
                      <button (click)="deleteRole(r); $event.stopPropagation()"
                              class="text-xs font-bold text-red-600 hover:underline ml-2">🗑</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="text-center text-gray-400 py-6">Koi role nahi</td></tr>
              }
            </tbody>
          </table>
          <p class="text-xs text-gray-400 mt-2">💡 Role par click karo → uske permissions khulenge</p>
        </div>
      }

      <!-- ================= PERMISSIONS GRID (Menu & screen CRUD) ================= -->
      @if (tab() === 'perms') {
        <div class="card mb-4">
          <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div>
              <h3 class="font-bold text-[#5c1a8b]">Menu &amp; screen CRUD</h3>
              <p class="text-xs text-gray-500">Har screen ke Create / Read / Update / Delete rights — selected role ke liye</p>
            </div>
            <div class="flex items-center gap-2">
              <div>
                <label class="lbl2">ROLE</label>
                <select [(ngModel)]="permRoleId" (ngModelChange)="loadRolePerms()" class="input text-sm py-1.5">
                  <option value="">— Role chuno —</option>
                  @for (r of roles(); track r.id) {
                    <option [value]="r.id">{{ r.name }} ({{ r.permissions }})</option>
                  }
                </select>
              </div>
              @if (permRoleId) {
                <button (click)="savePerms()" class="btn-primary text-sm self-end" [disabled]="savingPerms()">
                  {{ savingPerms() ? 'Saving…' : '✓ Save Permissions' }}
                </button>
              }
            </div>
          </div>

          @if (!permRoleId) {
            <div class="text-center text-gray-400 py-10">Upar se role chuno — uski screen-wise CRUD grid yahan khulegi</div>
          } @else {
            <div class="flex gap-2 my-3">
              <button (click)="allRead(true)" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#ede9fe] text-[#5c1a8b] hover:bg-[#ddc8f5]">All Read on</button>
              <button (click)="allRead(false)" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-[#ddc8f5] text-[#5c1a8b] hover:bg-[#f0e6ff]">All Read off</button>
              <button (click)="allEverything(true)" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200">Sab on</button>
              <button (click)="allEverything(false)" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100">Sab off</button>
            </div>

            <table class="w-full text-sm">
              <thead class="bg-[#f0e6ff] text-[#5c1a8b] text-xs uppercase">
                <tr>
                  <th class="px-2 py-2 text-left">Permission</th>
                  <th class="px-2 py-2 text-left">Code</th>
                  <th class="px-2 py-2 text-center w-10">C</th>
                  <th class="px-2 py-2 text-center w-10">R</th>
                  <th class="px-2 py-2 text-center w-10">U</th>
                  <th class="px-2 py-2 text-center w-10">D</th>
                  <th class="px-2 py-2 text-left">Extra</th>
                  <th class="px-2 py-2 text-center w-14 text-[#5c1a8b]">✓ All</th>
                </tr>
              </thead>
              <tbody>
                @for (row of permRows(); track row.key) {
                  <tr class="border-t hover:bg-[#faf5ff]">
                    <td class="px-2 py-1.5 font-semibold">{{ row.label }}</td>
                    <td class="px-2 py-1.5 font-mono text-[11px] text-gray-500">{{ row.key }}</td>
                    <td class="px-2 py-1.5 text-center">
                      @if (row.c) { <input type="checkbox" [checked]="checked().has(row.c.id)" (change)="togglePerm(row.c.id)"> }
                    </td>
                    <td class="px-2 py-1.5 text-center">
                      @if (row.r.length) { <input type="checkbox" [checked]="rowReadChecked(row)" (change)="toggleRowRead(row)"> }
                    </td>
                    <td class="px-2 py-1.5 text-center">
                      @if (row.u) { <input type="checkbox" [checked]="checked().has(row.u.id)" (change)="togglePerm(row.u.id)"> }
                    </td>
                    <td class="px-2 py-1.5 text-center">
                      @if (row.d) {
                        <input type="checkbox" [checked]="checked().has(row.d.id)" (change)="togglePerm(row.d.id)"
                               [title]="row.d.isDangerous ? 'Dangerous' : ''">
                      }
                    </td>
                    <td class="px-2 py-1.5">
                      @for (x of row.extra; track x.id) {
                        <label class="inline-flex items-center gap-1 text-[11px] mr-3 cursor-pointer">
                          <input type="checkbox" [checked]="checked().has(x.id)" (change)="togglePerm(x.id)">
                          {{ x.action }}
                        </label>
                      }
                    </td>
                    <td class="px-2 py-1.5 text-center bg-[#faf5ff]">
                      <input type="checkbox" [checked]="rowAllChecked(row)" (change)="toggleRowAll(row)"
                             title="Is line ke saare rights ek saath">
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="text-center text-gray-400 py-6">Permissions load nahi hue</td></tr>
                }
              </tbody>
            </table>
          }
        </div>
      }

      <!-- ================= BRANCHES ================= -->
      @if (tab() === 'branches') {
        <div class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-[#5c1a8b]">Branches</h3>
            <button (click)="openBranchForm()" class="btn-primary text-sm">+ Add Branch</button>
          </div>
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] text-xs uppercase">
              <tr>
                <th class="px-2 py-2 text-left">S.NO</th>
                <th class="px-2 py-2 text-left">Code</th>
                <th class="px-2 py-2 text-left">Name</th>
                <th class="px-2 py-2 text-left">City</th>
                <th class="px-2 py-2 text-left">Phone</th>
                <th class="px-2 py-2 text-center">HQ</th>
                <th class="px-2 py-2 text-center">Status</th>
                <th class="px-2 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (b of branches(); track b.id; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-2 py-2 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-2 py-2 font-mono font-bold text-[#5c1a8b]">{{ b.code }}</td>
                  <td class="px-2 py-2 font-semibold">{{ b.name }}</td>
                  <td class="px-2 py-2 text-xs">{{ b.city || '—' }}</td>
                  <td class="px-2 py-2 text-xs">{{ b.phone || '—' }}</td>
                  <td class="px-2 py-2 text-center">{{ b.isHeadOffice ? '⭐' : '' }}</td>
                  <td class="px-2 py-2 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          [class]="b.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                      {{ b.isActive ? 'ACTIVE' : 'OFF' }}
                    </span>
                  </td>
                  <td class="px-2 py-2 text-center whitespace-nowrap">
                    <button (click)="openBranchForm(b)" class="text-xs font-bold text-[#5c1a8b] hover:underline mr-2">✏️ Edit</button>
                    @if (!b.isHeadOffice) {
                      <button (click)="deleteBranch(b)" class="text-xs font-bold text-red-600 hover:underline">🗑 Delete</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="text-center text-gray-400 py-6">Koi branch nahi</td></tr>
              }
            </tbody>
          </table>
          <p class="text-xs text-gray-400 mt-2">💡 Branch code hi document numbers ka prefix banta hai (JPR-1, DEL-1...)</p>
        </div>
      }

      <!-- ================= USER FORM MODAL ================= -->
      @if (showUserForm()) {
        <div class="modal-bg" (click)="showUserForm.set(false)">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-[#5c1a8b] mb-4">{{ editUserId ? '✏️ Edit User' : '+ Naya User' }}</h3>
            @if (error()) {
              <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">{{ error() }}</div>
            }
            <div class="grid grid-cols-2 gap-3">
              <div><label class="lbl2">FULL NAME *</label><input [(ngModel)]="uf.fullName" class="input"></div>
              <div><label class="lbl2">USERNAME *</label><input [(ngModel)]="uf.username" class="input" [disabled]="!!editUserId"></div>
              <div><label class="lbl2">EMAIL</label><input [(ngModel)]="uf.email" class="input"></div>
              <div><label class="lbl2">PHONE</label><input [(ngModel)]="uf.phone" class="input" maxlength="10"></div>
              @if (!editUserId) {
                <div><label class="lbl2">PASSWORD *</label><input [(ngModel)]="uf.password" type="text" class="input" placeholder="kam se kam 6 chars"></div>
              }
              <div>
                <label class="lbl2">ROLE *</label>
                <select [(ngModel)]="uf.roleId" class="input">
                  <option value="">— Select —</option>
                  @for (r of roles(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
                </select>
              </div>
            </div>
            <div class="mt-3">
              <label class="lbl2">BRANCH ACCESS</label>
              <label class="flex items-center gap-2 text-sm mb-1 cursor-pointer">
                <input type="checkbox" [(ngModel)]="uf.canViewAllBranches"> Saari branches dekh sake
              </label>
              @if (!uf.canViewAllBranches) {
                <div class="flex flex-wrap gap-3 mt-1">
                  @for (b of branches(); track b.id) {
                    <label class="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" [checked]="uf.branchIds.includes(b.id)" (change)="toggleUserBranch(b.id)">
                      {{ b.name }}
                    </label>
                  }
                </div>
              }
            </div>
            @if (editUserId) {
              <label class="flex items-center gap-2 text-sm mt-3 cursor-pointer">
                <input type="checkbox" [(ngModel)]="uf.isActive"> Active (untick = login band)
              </label>
            }
            <div class="flex justify-end gap-2 mt-5">
              <button (click)="showUserForm.set(false)" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button (click)="saveUser()" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : '✓ Save' }}</button>
            </div>
          </div>
        </div>
      }

      <!-- ================= PASSWORD RESET MODAL ================= -->
      @if (pwUser()) {
        <div class="modal-bg" (click)="pwUser.set(null)">
          <div class="modal-card" style="max-width:420px" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-[#5c1a8b] mb-3">🔒 Password Reset — {{ pwUser()!.fullName }}</h3>
            <label class="lbl2">NAYA PASSWORD *</label>
            <input [(ngModel)]="newPassword" type="text" class="input" placeholder="kam se kam 6 chars">
            <div class="flex justify-end gap-2 mt-4">
              <button (click)="pwUser.set(null)" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button (click)="resetPassword()" class="btn-primary" [disabled]="saving()">✓ Reset</button>
            </div>
          </div>
        </div>
      }

      <!-- ================= ROLE FORM MODAL ================= -->
      @if (showRoleForm()) {
        <div class="modal-bg" (click)="showRoleForm.set(false)">
          <div class="modal-card" style="max-width:460px" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-[#5c1a8b] mb-3">+ Naya Role</h3>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="lbl2">NAME *</label><input [(ngModel)]="rf.name" class="input" placeholder="e.g. Accountant"></div>
              <div><label class="lbl2">CODE *</label><input [(ngModel)]="rf.code" class="input" placeholder="e.g. accountant"></div>
            </div>
            <div class="mt-3"><label class="lbl2">DESCRIPTION</label><input [(ngModel)]="rf.description" class="input"></div>
            <div class="flex justify-end gap-2 mt-4">
              <button (click)="showRoleForm.set(false)" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button (click)="saveRole()" class="btn-primary" [disabled]="saving()">✓ Save</button>
            </div>
            <p class="text-xs text-gray-400 mt-3">Save ke baad Permissions tab me role chunkar uske rights tick karo.</p>
          </div>
        </div>
      }

      <!-- ================= BRANCH FORM MODAL ================= -->
      @if (showBranchForm()) {
        <div class="modal-bg" (click)="showBranchForm.set(false)">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-[#5c1a8b] mb-4">{{ editBranchId ? '✏️ Edit Branch' : '+ Nayi Branch' }}</h3>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="lbl2">CODE * <small class="text-gray-400">(document prefix)</small></label>
                <input [(ngModel)]="bf.code" class="input" maxlength="10" placeholder="e.g. SRT" style="text-transform:uppercase"></div>
              <div><label class="lbl2">NAME *</label><input [(ngModel)]="bf.name" class="input" placeholder="e.g. Surat Branch"></div>
              <div>
                <label class="lbl2">PINCODE <small class="text-gray-400">(dalte hi city/state auto)</small></label>
                <input [(ngModel)]="bf.pincode" (ngModelChange)="onPincode($event)" class="input"
                       maxlength="6" inputmode="numeric" placeholder="e.g. 395002">
                @if (pinLoading()) { <small class="text-[#5c1a8b]">🔎 dhundh raha hoon…</small> }
                @if (pinError()) { <small class="text-red-600">{{ pinError() }}</small> }
              </div>
              <div>
                <label class="lbl2">STATE</label>
                <select [(ngModel)]="bf.state" (ngModelChange)="onStateChange($event)" class="input">
                  <option value="">— Select —</option>
                  @for (s of states; track s.name) {
                    <option [value]="s.name">{{ s.name }} ({{ s.gstCode }})</option>
                  }
                </select>
              </div>
              <div>
                <label class="lbl2">CITY <small class="text-gray-400">(pincode khali ho to auto aayega)</small></label>
                <input [(ngModel)]="bf.city" (change)="onCityChange()" class="input" list="cityList" placeholder="Type ya choose karo">
                <datalist id="cityList">
                  @for (c of cityOptions(); track c) { <option [value]="c"></option> }
                </datalist>
              </div>
              <div><label class="lbl2">PHONE</label><input [(ngModel)]="bf.phone" class="input" maxlength="10"></div>
              <div><label class="lbl2">GST STATE CODE <small class="text-gray-400">(state se auto)</small></label>
                <input [(ngModel)]="bf.gstStateCode" class="input" maxlength="2" placeholder="08"></div>
            </div>
            <div class="mt-3"><label class="lbl2">ADDRESS</label><input [(ngModel)]="bf.address" class="input"></div>
            @if (editBranchId) {
              <label class="flex items-center gap-2 text-sm mt-3 cursor-pointer">
                <input type="checkbox" [(ngModel)]="bf.isActive"> Active
              </label>
            }
            <div class="flex justify-end gap-2 mt-5">
              <button (click)="showBranchForm.set(false)" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button (click)="saveBranch()" class="btn-primary" [disabled]="saving()">✓ Save</button>
            </div>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    .lbl2 { display:block; font-size:10px; font-weight:800; color:#6b3fa0; text-transform:uppercase; letter-spacing:.4px; margin-bottom:3px; }

    /* Checkboxes — bade, brand color, smooth */
    input[type="checkbox"] {
      width: 18px; height: 18px;
      accent-color: #5c1a8b;
      cursor: pointer;
      vertical-align: middle;
      border-radius: 4px;
      transition: transform .1s;
    }
    input[type="checkbox"]:hover { transform: scale(1.15); }
    td input[type="checkbox"] { margin: 0 auto; display: inline-block; }
    .modal-bg { position:fixed; inset:0; background:rgba(20,10,40,.55); z-index:90; display:flex; align-items:center; justify-content:center; padding:16px; }
    .modal-card { background:#fff; border-radius:14px; padding:22px; width:100%; max-width:620px; max-height:90vh; overflow:auto; box-shadow:0 20px 60px rgba(0,0,0,.3); }
  `]
})
export class TeamComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/api/core/team`;

  tab = signal<Tab>('users');
  error = signal('');
  saving = signal(false);
  savingPerms = signal(false);

  branches = signal<TeamBranch[]>([]);
  users = signal<TeamUser[]>([]);
  roles = signal<TeamRole[]>([]);
  perms = signal<Perm[]>([]);
  checked = signal<Set<number>>(new Set());
  permRoleId = '';

  // forms
  showUserForm = signal(false);
  showRoleForm = signal(false);
  showBranchForm = signal(false);
  pwUser = signal<TeamUser | null>(null);
  newPassword = '';
  editUserId: string | null = null;
  editBranchId: string | null = null;

  uf = this.emptyUser();
  rf = { name: '', code: '', description: '' };
  bf = this.emptyBranch();

  private emptyUser() {
    return { fullName: '', username: '', email: '', phone: '', password: '',
             roleId: '', branchIds: [] as string[], canViewAllBranches: false, isActive: true };
  }
  private emptyBranch() {
    return { code: '', name: '', address: '', city: '', state: '', pincode: '',
             phone: '', gstStateCode: '', isActive: true };
  }

  tabCls(t: Tab): string {
    return this.tab() === t
      ? 'px-4 py-2 rounded-lg text-sm font-bold brand-gradient text-white'
      : 'px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-[#ddc8f5] text-[#5c1a8b] hover:bg-[#f0e6ff]';
  }

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    const fail = (e: any) => this.error.set(e?.error?.error ?? 'Load fail — kya aap firm admin ho?');
    this.http.get<TeamBranch[]>(`${this.base}/branches`).subscribe({ next: b => this.branches.set(b), error: fail });
    this.http.get<TeamUser[]>(`${this.base}/users`).subscribe({ next: u => this.users.set(u), error: fail });
    this.http.get<TeamRole[]>(`${this.base}/roles`).subscribe({ next: r => this.roles.set(r), error: fail });
    this.http.get<Perm[]>(`${this.base}/permissions`).subscribe({ next: p => this.perms.set(p), error: fail });
  }

  branchNames(ids: string[]): string {
    if (!ids?.length) return '—';
    return this.branches().filter(b => ids.includes(b.id)).map(b => b.name).join(', ') || '—';
  }

  // ===== Users =====
  openUserForm(u?: TeamUser) {
    if (u) {
      this.editUserId = u.id;
      this.uf = {
        fullName: u.fullName, username: u.username, email: u.email || '', phone: u.phone || '',
        password: '', roleId: u.roles[0]?.id || '', branchIds: [...(u.branchIds || [])],
        canViewAllBranches: u.canViewAllBranches, isActive: u.isActive
      };
    } else {
      this.editUserId = null;
      this.uf = this.emptyUser();
    }
    this.error.set('');
    this.showUserForm.set(true);
  }

  toggleUserBranch(id: string) {
    this.uf.branchIds = this.uf.branchIds.includes(id)
      ? this.uf.branchIds.filter(x => x !== id)
      : [...this.uf.branchIds, id];
  }

  saveUser() {
    if (!this.uf.fullName.trim() || !this.uf.roleId) { this.error.set('Naam aur role zaroori hain'); return; }
    this.saving.set(true);
    const done = () => { this.saving.set(false); this.showUserForm.set(false); this.loadAll(); };
    const fail = (e: any) => { this.saving.set(false); this.error.set(e?.error?.error ?? 'Save fail'); };

    if (this.editUserId) {
      this.http.put(`${this.base}/users/${this.editUserId}`, {
        fullName: this.uf.fullName, email: this.uf.email || null, phone: this.uf.phone || null,
        roleId: this.uf.roleId, branchIds: this.uf.branchIds,
        canViewAllBranches: this.uf.canViewAllBranches, isActive: this.uf.isActive
      }).subscribe({ next: () => { this.toast.success('User update ho gaya'); done(); }, error: fail });
    } else {
      this.http.post(`${this.base}/users`, {
        fullName: this.uf.fullName, username: this.uf.username, email: this.uf.email || null,
        phone: this.uf.phone || null, password: this.uf.password, roleId: this.uf.roleId,
        branchIds: this.uf.branchIds, canViewAllBranches: this.uf.canViewAllBranches
      }).subscribe({ next: () => { this.toast.success('User ban gaya — ab wo login kar sakta hai'); done(); }, error: fail });
    }
  }

  deleteUser(u: TeamUser) {
    if (!confirm(`User "${u.fullName}" (${u.username}) delete karna hai? Login hamesha ke liye band ho jayega.`)) return;
    this.http.delete(`${this.base}/users/${u.id}`).subscribe({
      next: () => { this.toast.success('User delete ho gaya'); this.loadAll(); },
      error: (e) => this.error.set(e?.error?.error ?? 'Delete fail')
    });
  }

  openPwReset(u: TeamUser) { this.pwUser.set(u); this.newPassword = ''; }
  resetPassword() {
    const u = this.pwUser(); if (!u) return;
    this.saving.set(true);
    this.http.post(`${this.base}/users/${u.id}/reset-password`, { password: this.newPassword }).subscribe({
      next: () => { this.saving.set(false); this.pwUser.set(null); this.toast.success('Password reset ho gaya'); },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.error ?? 'Reset fail'); }
    });
  }

  // ===== Roles =====
  saveRole() {
    this.saving.set(true);
    this.http.post(`${this.base}/roles`, this.rf).subscribe({
      next: () => {
        this.saving.set(false); this.showRoleForm.set(false);
        this.rf = { name: '', code: '', description: '' };
        this.toast.success('Role ban gaya — ab Permissions tab me rights do');
        this.loadAll();
      },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.error ?? 'Save fail'); }
    });
  }

  openPermGrid(r: TeamRole) {
    this.permRoleId = r.id;
    this.tab.set('perms');
    this.loadRolePerms();
  }

  // ===== Permissions — screen-wise CRUD rows =====
  permRows = computed(() => {
    const rows = new Map<string, {
      key: string; label: string;
      c: Perm | null; r: Perm[]; u: Perm | null; d: Perm | null; extra: Perm[];
    }>();
    for (const p of this.perms()) {
      if (p.module === 'platform') continue;   // Anjaninex-only — firm ko nahi dikhana
      const key = `${p.module}.${p.resource}`;
      if (!rows.has(key)) {
        const label = p.resource.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
        const modLabel = p.module.replace(/\b\w/g, ch => ch.toUpperCase());
        rows.set(key, { key, label: `${modLabel} › ${label}`, c: null, r: [], u: null, d: null, extra: [] });
      }
      const row = rows.get(key)!;
      switch (p.action) {
        case 'create': row.c = p; break;
        case 'view': case 'viewown': row.r.push(p); break;
        case 'edit': case 'update': row.u = p; break;
        case 'delete': row.d = p; break;
        default: row.extra.push(p);   // approve, export, send, use, recharge...
      }
    }
    return Array.from(rows.values());
  });

  /** Row ke saare perms (C+R+U+D+extra) ek list me. */
  private rowPerms(row: { c: Perm | null; r: Perm[]; u: Perm | null; d: Perm | null; extra: Perm[] }): Perm[] {
    const list: Perm[] = [...row.r, ...row.extra];
    if (row.c) list.push(row.c);
    if (row.u) list.push(row.u);
    if (row.d) list.push(row.d);
    return list;
  }
  rowAllChecked(row: any): boolean {
    const ps = this.rowPerms(row);
    return ps.length > 0 && ps.every(p => this.checked().has(p.id));
  }
  toggleRowAll(row: any) {
    const on = !this.rowAllChecked(row);
    this.checked.update(s => {
      const n = new Set(s);
      for (const p of this.rowPerms(row)) { on ? n.add(p.id) : n.delete(p.id); }
      return n;
    });
  }

  rowReadChecked(row: { r: Perm[] }): boolean {
    return row.r.length > 0 && row.r.every(p => this.checked().has(p.id));
  }
  toggleRowRead(row: { r: Perm[] }) {
    const on = !this.rowReadChecked(row);
    this.checked.update(s => {
      const n = new Set(s);
      for (const p of row.r) { on ? n.add(p.id) : n.delete(p.id); }
      return n;
    });
  }

  /** All Read on/off — saare view perms ek saath. */
  allRead(on: boolean) {
    this.checked.update(s => {
      const n = new Set(s);
      for (const p of this.perms()) {
        if (p.module === 'platform') continue;
        if (p.action === 'view' || p.action === 'viewown') { on ? n.add(p.id) : n.delete(p.id); }
      }
      return n;
    });
  }

  /** Sab on/off — pura grid. */
  allEverything(on: boolean) {
    this.checked.update(() => {
      if (!on) return new Set<number>();
      return new Set(this.perms().filter(p => p.module !== 'platform').map(p => p.id));
    });
  }

  loadRolePerms() {
    if (!this.permRoleId) { this.checked.set(new Set()); return; }
    this.http.get<number[]>(`${this.base}/roles/${this.permRoleId}/permissions`).subscribe({
      next: ids => this.checked.set(new Set(ids)),
      error: () => this.checked.set(new Set())
    });
  }

  togglePerm(id: number) {
    this.checked.update(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  savePerms() {
    if (!this.permRoleId) return;
    this.savingPerms.set(true);
    this.http.put(`${this.base}/roles/${this.permRoleId}/permissions`,
      { permissionIds: Array.from(this.checked()) }).subscribe({
      next: () => { this.savingPerms.set(false); this.toast.success('Permissions save ho gaye'); this.loadAll(); },
      error: (e) => { this.savingPerms.set(false); this.error.set(e?.error?.error ?? 'Save fail'); }
    });
  }

  // ===== India data: state dropdown + city suggestions + pincode lookup =====
  states = INDIAN_STATES;
  pinLoading = signal(false);
  pinError = signal('');

  // method (computed nahi) — bf plain object hai, har change pe fresh list chahiye
  cityOptions(): string[] { return citiesForState(this.bf.state); }

  onStateChange(stateName: string) {
    // State chunte hi GST state code auto bhar do
    const code = gstCodeForState(stateName);
    if (code) this.bf.gstStateCode = code;
  }

  /** 6-digit pincode dalte hi India Post API se city/state/GST code auto-fill. */
  onPincode(pin: string) {
    this.pinError.set('');
    const p = (pin || '').replace(/\D/g, '');
    if (p.length !== 6) return;
    this.pinLoading.set(true);
    this.http.get<any[]>(`https://api.postalpincode.in/pincode/${p}`).subscribe({
      next: (res) => {
        this.pinLoading.set(false);
        const po = res?.[0]?.PostOffice?.[0];
        if (!po) { this.pinError.set('Ye pincode nahi mila — city/state khud bhar do'); return; }
        this.bf.city = po.District || po.Block || this.bf.city;
        this.bf.state = this.matchStateName(po.State) || this.bf.state;
        const code = gstCodeForState(this.bf.state);
        if (code) this.bf.gstStateCode = code;
      },
      error: () => {
        this.pinLoading.set(false);
        this.pinError.set('Lookup fail (internet?) — city/state khud bhar do');
      }
    });
  }

  /** City likhne par (agar pincode khali hai) us city ka main pincode auto-fill. */
  onCityChange() {
    const city = (this.bf.city || '').trim();
    if (!city || (this.bf.pincode || '').length === 6) return;
    this.pinLoading.set(true);
    this.pinError.set('');
    this.http.get<any[]>(`https://api.postalpincode.in/postoffice/${encodeURIComponent(city)}`).subscribe({
      next: (res) => {
        this.pinLoading.set(false);
        const list: any[] = res?.[0]?.PostOffice || [];
        if (!list.length) return;
        // Pehle selected state wala PO dhundo, warna pehla
        const po = (this.bf.state
          ? list.find(x => (x.State || '').toLowerCase() === this.bf.state.toLowerCase())
          : null) || list[0];
        this.bf.pincode = po.Pincode || this.bf.pincode;
        if (!this.bf.state) {
          this.bf.state = this.matchStateName(po.State) || '';
          const code = gstCodeForState(this.bf.state);
          if (code) this.bf.gstStateCode = code;
        }
      },
      error: () => this.pinLoading.set(false)
    });
  }

  /** India Post ka state naam hamari list se match karo (spelling differences handle). */
  private matchStateName(apiState: string): string {
    const t = (apiState || '').toLowerCase().trim();
    const exact = this.states.find(s => s.name.toLowerCase() === t);
    if (exact) return exact.name;
    const partial = this.states.find(s => t.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(t));
    return partial?.name ?? apiState;
  }

  // ===== Branches =====
  openBranchForm(b?: TeamBranch) {
    if (b) {
      this.editBranchId = b.id;
      this.bf = {
        code: b.code, name: b.name, address: b.address || '', city: b.city || '',
        state: b.state || '', pincode: b.pincode || '', phone: b.phone || '',
        gstStateCode: b.gstStateCode || '', isActive: b.isActive
      };
    } else {
      this.editBranchId = null;
      this.bf = this.emptyBranch();
    }
    this.error.set('');
    this.showBranchForm.set(true);
    // City bhari ho aur pincode khali — auto le aao
    setTimeout(() => this.onCityChange());
  }

  deleteBranch(b: TeamBranch) {
    if (!confirm(`Branch "${b.name}" (${b.code}) delete karni hai?`)) return;
    this.http.delete(`${this.base}/branches/${b.id}`).subscribe({
      next: () => { this.toast.success('Branch delete ho gayi'); this.loadAll(); },
      error: (e) => this.error.set(e?.error?.error ?? 'Delete fail')
    });
  }

  deleteRole(r: TeamRole) {
    if (!confirm(`Role "${r.name}" delete karna hai?`)) return;
    this.http.delete(`${this.base}/roles/${r.id}`).subscribe({
      next: () => { this.toast.success('Role delete ho gaya'); this.loadAll(); },
      error: (e) => this.error.set(e?.error?.error ?? 'Delete fail')
    });
  }

  saveBranch() {
    this.saving.set(true);
    const body = { ...this.bf, address: this.bf.address || null, city: this.bf.city || null,
                   state: this.bf.state || null, pincode: this.bf.pincode || null,
                   phone: this.bf.phone || null, gstStateCode: this.bf.gstStateCode || null };
    const req = this.editBranchId
      ? this.http.put(`${this.base}/branches/${this.editBranchId}`, body)
      : this.http.post(`${this.base}/branches`, body);
    req.subscribe({
      next: () => {
        this.saving.set(false); this.showBranchForm.set(false);
        this.toast.success(this.editBranchId ? 'Branch update ho gayi' : 'Nayi branch ban gayi');
        this.loadAll();
      },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.error ?? 'Save fail'); }
    });
  }
}
