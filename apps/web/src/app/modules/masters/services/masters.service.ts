import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface Branch {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  isHeadOffice: boolean;
  isActive: boolean;
}

export interface CreateBranch {
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  isActive: boolean;
}

export interface Transporter {
  id: string;
  firmName: string;
  contactPerson: string | null;
  mobile: string | null;
  whatsapp: string | null;
  gstNo: string | null;
  pan: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  email: string | null;
  address: string | null;
  contactMobile: string | null;
  landline: string | null;
  avgDeliveryDays: number | null;
  damageRate: number | null;
  rating: string | null;
  stars: number | null;
  remark: string | null;
  isActive: boolean;
}

export interface CreateTransporter {
  firmName: string;
  contactPerson?: string;
  mobile?: string;
  whatsapp?: string;
  gstNo?: string;
  pan?: string;
  city?: string;
  state?: string;
  pincode?: string;
  email?: string;
  address?: string;
  contactMobile?: string;
  landline?: string;
  avgDeliveryDays?: number;
  damageRate?: number;
  rating?: string;
  stars?: number;
  remark?: string;
  isActive: boolean;
}

// ============== USERS ==============
export interface UserListItem {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  defaultBranchId: string | null;
  defaultBranchName: string | null;
  roleName: string | null;
  roleId: string | null;
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  activeSessionsCount: number;
}

export interface UserDetail extends UserListItem {
  requires2fa: boolean;
  canViewAllBranches: boolean;
  locale: string;
  theme: string;
  accessibleBranchIds: string[];
}

export interface CreateUser {
  fullName: string;
  username: string;
  password: string;
  email?: string;
  phone?: string;
  defaultBranchId?: string | null;
  roleId?: string | null;
  isActive: boolean;
  requires2fa?: boolean;
}

export interface UpdateUser {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  defaultBranchId?: string | null;
  roleId?: string | null;
  isActive: boolean;
  requires2fa: boolean;
}

export interface UserKpi {
  total: number;
  active: number;
  locked: number;
  loggedInToday: number;
  createdThisMonth: number;
}

export interface SessionItem {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  expiresAt: string;
  isRevoked: boolean;
}

// ============== ROLES ==============
export interface RoleItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  inheritsFrom: string | null;
  inheritsFromName: string | null;
  isSystem: boolean;
  color: string | null;
  userCount: number;
  permissionCount: number;
}

export interface CreateRole {
  code?: string;
  name: string;
  description?: string;
  inheritsFrom?: string | null;
  color?: string;
}

// ============== PERMISSIONS MATRIX ==============
// Backend: GET /api/core/permissions → module › resource › cells tree.
export interface PermissionCell {
  code: string;
  action: string;       // view / create / edit / delete / approve / export / use ...
  scope: string;        // branch / firm / self / all / platform
  description: string | null;
  isDangerous: boolean;
}
export interface PermissionResource {
  resource: string;
  label: string;
  permissions: PermissionCell[];
}
export interface PermissionModule {
  module: string;
  label: string;
  resources: PermissionResource[];
}

@Injectable({ providedIn: 'root' })
export class MastersService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/core`;

  // Branches
  listBranches(search?: string) { return this.http.get<Branch[]>(`${this.base}/branches`, { params: search ? { search } : {} }); }
  getBranch(id: string) { return this.http.get<Branch>(`${this.base}/branches/${id}`); }
  createBranch(data: CreateBranch) { return this.http.post<Branch>(`${this.base}/branches`, data); }
  updateBranch(id: string, data: CreateBranch) { return this.http.put<Branch>(`${this.base}/branches/${id}`, data); }
  deleteBranch(id: string) { return this.http.delete(`${this.base}/branches/${id}`); }

  // Transporters
  listTransporters(search?: string) { return this.http.get<Transporter[]>(`${this.base}/transporters`, { params: search ? { search } : {} }); }
  getTransporter(id: string) { return this.http.get<Transporter>(`${this.base}/transporters/${id}`); }
  createTransporter(data: CreateTransporter) { return this.http.post<Transporter>(`${this.base}/transporters`, data); }
  updateTransporter(id: string, data: CreateTransporter) { return this.http.put<Transporter>(`${this.base}/transporters/${id}`, data); }
  deleteTransporter(id: string) { return this.http.delete(`${this.base}/transporters/${id}`); }

  // Users
  listUsers(opts?: { search?: string; roleId?: string; branchId?: string; status?: string }) {
    const params: any = {};
    if (opts?.search) params.search = opts.search;
    if (opts?.roleId) params.roleId = opts.roleId;
    if (opts?.branchId) params.branchId = opts.branchId;
    if (opts?.status) params.status = opts.status;
    return this.http.get<UserListItem[]>(`${this.base}/users`, { params });
  }
  getUser(id: string) { return this.http.get<UserDetail>(`${this.base}/users/${id}`); }
  userKpi() { return this.http.get<UserKpi>(`${this.base}/users/kpi`); }
  createUser(data: CreateUser) { return this.http.post<{ id: string }>(`${this.base}/users`, data); }
  updateUser(id: string, data: UpdateUser) { return this.http.put(`${this.base}/users/${id}`, data); }
  deleteUser(id: string) { return this.http.delete(`${this.base}/users/${id}`); }
  resetUserPassword(id: string, newPassword: string) {
    return this.http.post(`${this.base}/users/${id}/reset-password`, { newPassword });
  }
  lockUser(id: string) { return this.http.post(`${this.base}/users/${id}/lock`, {}); }
  unlockUser(id: string) { return this.http.post(`${this.base}/users/${id}/unlock`, {}); }
  listUserSessions(id: string) { return this.http.get<SessionItem[]>(`${this.base}/users/${id}/sessions`); }
  revokeAllUserSessions(id: string) { return this.http.post(`${this.base}/users/${id}/sessions/revoke-all`, {}); }

  // Roles
  listRoles(search?: string) {
    return this.http.get<RoleItem[]>(`${this.base}/roles`, { params: search ? { search } : {} });
  }
  createRole(data: CreateRole) { return this.http.post<{ id: string }>(`${this.base}/roles`, data); }
  updateRole(id: string, data: CreateRole) { return this.http.put(`${this.base}/roles/${id}`, data); }
  deleteRole(id: string) { return this.http.delete(`${this.base}/roles/${id}`); }

  // Permissions matrix
  permissionCatalog() { return this.http.get<PermissionModule[]>(`${this.base}/permissions`); }
  getRolePermissionCodes(roleId: string) { return this.http.get<string[]>(`${this.base}/roles/${roleId}/permissions`); }
  setRolePermissionCodes(roleId: string, codes: string[]) {
    return this.http.put<{ ok: boolean; count: number }>(`${this.base}/roles/${roleId}/permissions`, { codes });
  }
}
