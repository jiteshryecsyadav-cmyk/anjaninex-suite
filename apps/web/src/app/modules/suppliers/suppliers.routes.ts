import { Routes } from '@angular/router';

export const suppliersRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/directory.component').then(m => m.SuppliersDirectoryComponent)
  },
  {
    path: 'categories',
    loadComponent: () => import('./pages/categories.component').then(m => m.SupplierCategoriesComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./pages/supplier-form.component').then(m => m.SupplierFormComponent)
  },
  // ----- Buyer directory (Phase 4) — MUST come before the supplier ':id' routes -----
  {
    path: 'buyers',
    loadComponent: () => import('./pages/buyers-directory.component').then(m => m.BuyersDirectoryComponent)
  },
  {
    path: 'buyers/new',
    loadComponent: () => import('./pages/buyer-form.component').then(m => m.BuyerFormComponent)
  },
  {
    path: 'buyers/:id/edit',
    loadComponent: () => import('./pages/buyer-form.component').then(m => m.BuyerFormComponent)
  },
  {
    path: 'buyers/:id',
    loadComponent: () => import('./pages/buyer-detail.component').then(m => m.BuyerDetailComponent)
  },
  // ----- Appointments (Phase 5) — also before supplier ':id' -----
  {
    path: 'appointments',
    loadComponent: () => import('./pages/appointments.component').then(m => m.AppointmentsComponent)
  },
  {
    path: 'appointments/new',
    loadComponent: () => import('./pages/appointment-form.component').then(m => m.AppointmentFormComponent)
  },
  {
    path: 'appointments/:id/edit',
    loadComponent: () => import('./pages/appointment-form.component').then(m => m.AppointmentFormComponent)
  },
  {
    path: 'appointments/:id',
    loadComponent: () => import('./pages/appointment-detail.component').then(m => m.AppointmentDetailComponent)
  },
  // ----- Match (Phase 6) -----
  {
    path: 'match',
    loadComponent: () => import('./pages/match.component').then(m => m.MatchComponent)
  },
  // ----- Search (Phase 7) -----
  {
    path: 'search',
    loadComponent: () => import('./pages/ad-search.component').then(m => m.AdSearchComponent)
  },
  // ----- Bot (Phase 9) -----
  {
    path: 'bot',
    loadComponent: () => import('./pages/bot.component').then(m => m.BotComponent)
  },
  // ----- Supplier detail/edit (catch-all :id — keep LAST) -----
  {
    path: ':id/edit',
    loadComponent: () => import('./pages/supplier-form.component').then(m => m.SupplierFormComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/supplier-detail.component').then(m => m.SupplierDetailComponent)
  }
];
