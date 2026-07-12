import { Routes } from '@angular/router';

export const credilRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/credil-page.component').then(m => m.CredilPageComponent)
  }
];
