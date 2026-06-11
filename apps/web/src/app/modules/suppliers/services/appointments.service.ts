import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface ApptOption { id: string; name: string; sub: string | null; }
export interface ApptSample { name: string; qty: number; unit: string; }
export interface ApptStaff { employeeId: string; name: string; isLead: boolean; }

export interface AppointmentListItem {
  id: string;
  visitDirection: string;
  title: string | null;
  supplierId: string | null;
  supplierName: string | null;
  buyerId: string | null;
  buyerName: string | null;
  branchId: string | null;
  branchName: string | null;
  appointmentDate: string;
  appointmentTime: string | null;
  durationMinutes: number;
  city: string | null;
  status: string;
  staffNames: string[];
}

export interface AppointmentDetail extends AppointmentListItem {
  address: string | null;
  onlineLink: string | null;
  samples: ApptSample[];
  agenda: string | null;
  outcome: string | null;
  staff: ApptStaff[];
}

export interface CreateAppointment {
  visitDirection: string;
  title?: string;
  supplierId?: string | null;
  buyerId?: string | null;
  branchId?: string | null;
  appointmentDate: string;
  appointmentTime?: string | null;
  durationMinutes?: number;
  city?: string;
  address?: string;
  onlineLink?: string;
  samples?: ApptSample[];
  agenda?: string;
  status?: string;
  staffIds?: string[];
  leadStaffId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/appointments`;

  list(status?: string) {
    const params: any = {};
    if (status) params.status = status;
    return this.http.get<AppointmentListItem[]>(this.base, { params });
  }
  get(id: string) { return this.http.get<AppointmentDetail>(`${this.base}/${id}`); }
  create(data: CreateAppointment) { return this.http.post<AppointmentDetail>(this.base, data); }
  update(id: string, data: CreateAppointment) { return this.http.put<AppointmentDetail>(`${this.base}/${id}`, data); }
  updateStatus(id: string, status: string) { return this.http.patch(`${this.base}/${id}/status`, { status }); }
  delete(id: string) { return this.http.delete(`${this.base}/${id}`); }

  supplierOptions() { return this.http.get<ApptOption[]>(`${this.base}/options/suppliers`); }
  buyerOptions() { return this.http.get<ApptOption[]>(`${this.base}/options/buyers`); }
  // Branch-filtered staff — pass branchId to get only that branch's staff.
  staffOptions(branchId?: string) {
    const params: any = {};
    if (branchId) params.branchId = branchId;
    return this.http.get<ApptOption[]>(`${this.base}/options/staff`, { params });
  }
}
