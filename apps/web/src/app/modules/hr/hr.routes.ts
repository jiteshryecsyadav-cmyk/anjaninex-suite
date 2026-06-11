import { Routes } from '@angular/router';

export const hrRoutes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/hr-dashboard.component').then(m => m.HrDashboardComponent)
  },
  {
    path: 'staff',
    loadComponent: () => import('./pages/hr-pages.components').then(m => m.StaffComponent)
  },
  {
    path: 'check-in',
    loadComponent: () => import('./pages/check-in.component').then(m => m.CheckInComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/hr-pages.components').then(m => m.RegisterComponent)
  },
  {
    path: 'live-map',
    loadComponent: () => import('./pages/live-map.component').then(m => m.LiveMapComponent)
  },
  {
    path: 'leaves',
    loadComponent: () => import('./pages/hr-pages.components').then(m => m.LeavesComponent)
  },
  {
    path: 'payroll',
    loadComponent: () => import('./pages/hr-pages.components').then(m => m.PayrollComponent)
  }
];
