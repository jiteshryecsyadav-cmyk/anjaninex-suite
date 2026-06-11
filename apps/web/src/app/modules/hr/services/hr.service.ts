import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface Employee {
  id: string;
  contactId: string;
  employeeCode: string;
  fullName: string;
  designation: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  joiningDate: string | null;
  branchId: string | null;
  monthlyCtc: number | null;
  salaryStructureName: string | null;
  isActive: boolean;
  leavesAvailable: number;
}

export interface EmployeeDetail extends Employee {
  userId: string | null;
  leavingDate: string | null;
  salaryStructureId: string | null;
  branchName: string | null;
  panNumber: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  bankName: string | null;
  bankIfsc: string | null;
  profileSelfieUrl: string | null;
}

export interface CreateEmployee {
  fullName: string;
  phone?: string;
  email?: string;
  designation?: string;
  department?: string;
  joiningDate: string;
  salaryStructureId?: string;
  monthlyCtc?: number;
  branchId?: string;
  panNumber?: string;
  pfNumber?: string;
  esiNumber?: string;
  bankName?: string;
  bankIfsc?: string;
}

export interface AttendanceLog {
  id: string;
  employeeId: string;
  employeeName: string;
  logDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkInSelfieUrl: string | null;
  checkOutSelfieUrl: string | null;
  checkInAddress: string | null;
  checkOutAddress: string | null;
  totalMinutes: number | null;
  status: string | null;
  isLate: boolean;
  isEarlyOut: boolean;
}

export interface LeaveBalance {
  leaveType: string;
  totalAllocated: number;
  used: number;
  available: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  daysCount: number;
  reason: string | null;
  status: string;
  createdAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  remarks: string | null;
}

export interface LocationPoint {
  capturedAt: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface Payslip {
  id: string;
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
  basic: number;
  hra: number;
  da: number;
  special: number;
  conveyance: number;
  medical: number;
  bonus: number;
  incentive: number;
  overtimeAmount: number;
  otherEarnings: number;
  grossSalary: number;
  pfEmployee: number;
  esiEmployee: number;
  tds: number;
  professionalTax: number;
  loanDeduction: number;
  advanceDeduction: number;
  lopDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  pfEmployer: number;
  esiEmployer: number;
  netSalary: number;
  daysInMonth: number | null;
  daysPresent: number | null;
  daysAbsent: number | null;
  daysPaidLeave: number | null;
  isPaid: boolean;
  paidAt: string | null;
  voucherId: string | null;
  voucherNo: string | null;
}

export interface HrDashboard {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  absentToday: number;
  onLeaveToday: number;
  attendancePercent: number;
  pendingLeaveRequests: number;
  monthlyPayrollBudget: number;
  birthdaysThisWeek: number;
}

@Injectable({ providedIn: 'root' })
export class HrService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/hr`;

  // Dashboard
  dashboard() { return this.http.get<HrDashboard>(`${this.base}/dashboard`); }

  // Employees
  listEmployees(search?: string) {
    return this.http.get<Employee[]>(`${this.base}/employees`, { params: search ? { search } : {} });
  }
  getEmployee(id: string) { return this.http.get<EmployeeDetail>(`${this.base}/employees/${id}`); }
  createEmployee(data: CreateEmployee) { return this.http.post<EmployeeDetail>(`${this.base}/employees`, data); }
  updateEmployee(id: string, data: CreateEmployee) { return this.http.put<EmployeeDetail>(`${this.base}/employees/${id}`, data); }
  deleteEmployee(id: string) { return this.http.delete(`${this.base}/employees/${id}`); }

  // Attendance
  todayAttendance() { return this.http.get<AttendanceLog | null>(`${this.base}/attendance/today`); }
  checkIn(latitude: number, longitude: number, accuracy: number | null, address: string | null, selfie: File | null) {
    const fd = new FormData();
    fd.append('latitude', latitude.toString());
    fd.append('longitude', longitude.toString());
    if (accuracy != null) fd.append('accuracy', accuracy.toString());
    if (address) fd.append('address', address);
    if (selfie) fd.append('selfie', selfie);
    return this.http.post<AttendanceLog>(`${this.base}/attendance/check-in`, fd);
  }
  checkOut(latitude: number, longitude: number, accuracy: number | null, address: string | null, selfie: File | null) {
    const fd = new FormData();
    fd.append('latitude', latitude.toString());
    fd.append('longitude', longitude.toString());
    if (accuracy != null) fd.append('accuracy', accuracy.toString());
    if (address) fd.append('address', address);
    if (selfie) fd.append('selfie', selfie);
    return this.http.post<AttendanceLog>(`${this.base}/attendance/check-out`, fd);
  }
  register(year: number, month: number, branchId?: string) {
    return this.http.get<AttendanceLog[]>(`${this.base}/attendance/register/${year}/${month}`,
      { params: branchId ? { branchId } : {} });
  }
  employeeMonth(empId: string, year: number, month: number) {
    return this.http.get<AttendanceLog[]>(`${this.base}/attendance/employee/${empId}/${year}/${month}`);
  }

  // Location
  ping(lat: number, lng: number, accuracy: number | null) {
    return this.http.post(`${this.base}/location/ping`, {
      latitude: lat, longitude: lng, accuracy, speed: null, batteryPct: null, isBackground: false
    });
  }
  employeeTrail(empId: string, date: string) {
    return this.http.get<LocationPoint[]>(`${this.base}/location/trail/${empId}`, { params: { date } });
  }
  allTrails(date: string) {
    return this.http.get<{ employeeId: string; points: LocationPoint[] }[]>(`${this.base}/location/all-trails`, { params: { date } });
  }
  liveLocations() { return this.http.get<LocationPoint[]>(`${this.base}/location/live`); }

  // Leaves
  myBalance() { return this.http.get<LeaveBalance[]>(`${this.base}/leaves/my-balance`); }
  myLeaves(limit = 20) { return this.http.get<LeaveRequest[]>(`${this.base}/leaves/my-leaves`, { params: { limit } as any }); }
  pendingLeaves() { return this.http.get<LeaveRequest[]>(`${this.base}/leaves/pending`); }
  applyLeave(data: any) { return this.http.post<LeaveRequest>(`${this.base}/leaves/apply`, data); }
  approveLeave(id: string, remarks: string) {
    return this.http.post<LeaveRequest>(`${this.base}/leaves/${id}/approve`, { remarks });
  }
  rejectLeave(id: string, remarks: string) {
    return this.http.post<LeaveRequest>(`${this.base}/leaves/${id}/reject`, { remarks });
  }

  // Payroll
  runPayroll(year: number, month: number, employeeIds?: string[]) {
    return this.http.post<Payslip[]>(`${this.base}/payroll/run`, { year, month, employeeIds });
  }
  payrollMonth(year: number, month: number) {
    return this.http.get<Payslip[]>(`${this.base}/payroll/month/${year}/${month}`);
  }
  getPayslip(id: string) { return this.http.get<Payslip>(`${this.base}/payroll/${id}`); }
  markPaid(id: string) { return this.http.post(`${this.base}/payroll/${id}/mark-paid`, {}); }
}
