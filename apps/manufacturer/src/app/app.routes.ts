import { Routes } from '@angular/router';
import { authGuard, requirePermission } from './core/auth.guard';
import { landingRedirect } from './core/landing.guard';

/**
 * Har screen lazy hai — pehli baar khulne par hi download hoti hai. Manufacturer
 * app phone par bhi chalega, isliye pehla bundle chhota rakhna zaroori hai.
 */
export const routes: Routes = [
  {
    path: 'no-access',
    loadComponent: () => import('./modules/auth/no-access.component').then(m => m.NoAccessComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then(m => m.ShellComponent),
    children: [
      // Fix redirect nahi — aadmi ki permission dekh kar tay hota hai.
      // Warna Godown wala/Salesman app kholte hi rok wale pardah par pahunchte the.
      { path: '', pathMatch: 'full', canActivate: [landingRedirect], children: [] },
      {
        path: 'masters/karigars',
        canActivate: [requirePermission('masters.karigar.view.firm')],
        loadComponent: () =>
          import('./modules/masters/karigars.component').then(m => m.KarigarsComponent)
      },
      {
        path: 'masters/agents',
        canActivate: [requirePermission('masters.agent.view.firm')],
        loadComponent: () =>
          import('./modules/masters/agents.component').then(m => m.AgentsComponent)
      },
      {
        path: 'masters/godowns',
        canActivate: [requirePermission('masters.office.view.firm')],
        loadComponent: () =>
          import('./modules/masters/godowns.component').then(m => m.GodownsComponent)
      },
      // Baaki screen aage — sidebar me "aage" likha dikhta hai.
      // Anjaan rasta bhi landing par hi jaye, kisi fix screen par nahi.
      { path: '**', pathMatch: 'full', canActivate: [landingRedirect], children: [] }
    ]
  },
  { path: '**', redirectTo: '' }
];
