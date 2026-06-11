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
  {
    path: 'users',
    loadComponent: () => import('./pages/users.component').then(m => m.UsersComponent)
  },
  {
    path: 'roles',
    loadComponent: () => import('./pages/roles.component').then(m => m.RolesComponent)
  },
  {
    path: 'permissions',
    loadComponent: () => import('./pages/permissions.component').then(m => m.PermissionsComponent)
  },
  {
    path: 'credit-limits',
    loadComponent: () => import('./pages/credit-limits.component').then(m => m.CreditLimitsComponent)
  }
];
