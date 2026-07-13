import { Routes } from '@angular/router';

export const mastersRoutes: Routes = [
  { path: '', redirectTo: 'branches', pathMatch: 'full' },
  {
    path: 'branches',
    loadComponent: () => import('./pages/branches.component').then(m => m.BranchesComponent)
  },
  {
    path: 'transporters',
    loadComponent: () => import('./pages/transporters.component').then(m => m.TransportersComponent)
  },
  // Purane user-management pages ab Team & Security me merge — old links kaam karte rahen
  { path: 'users', redirectTo: '/team', pathMatch: 'full' },
  { path: 'roles', redirectTo: '/team', pathMatch: 'full' },
  { path: 'permissions', redirectTo: '/team', pathMatch: 'full' },
  {
    path: 'credit-limits',
    loadComponent: () => import('./pages/credit-limits.component').then(m => m.CreditLimitsComponent)
  }
];
