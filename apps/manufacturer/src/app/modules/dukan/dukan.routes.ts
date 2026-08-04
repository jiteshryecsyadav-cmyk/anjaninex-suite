import { Routes } from '@angular/router';

/**
 * Online Dukan — ADMIN routes.
 * Mounted under the authenticated Anjaninex shell at /dukan/admin (see app.routes.ts).
 * The firm owner manages their dukan here (already logged into Anjaninex).
 */
export const dukanAdminRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/admin/admin-shell.component').then(m => m.DukanAdminShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./pages/admin/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'categories', loadComponent: () => import('./pages/admin/categories.component').then(m => m.CategoriesComponent) },
      { path: 'products', loadComponent: () => import('./pages/admin/products.component').then(m => m.ProductsComponent) },
      { path: 'orders', loadComponent: () => import('./pages/admin/admin-orders.component').then(m => m.AdminOrdersComponent) },
      { path: 'billing', loadComponent: () => import('./pages/admin/billing.component').then(m => m.AdminBillingComponent) },
      { path: 'bank', loadComponent: () => import('./pages/admin/bank.component').then(m => m.AdminBankComponent) },
      { path: 'reviews', loadComponent: () => import('./pages/admin/reviews.component').then(m => m.AdminReviewsComponent) },
      { path: 'profile', loadComponent: () => import('./pages/admin/profile.component').then(m => m.AdminProfileComponent) },
    ],
  },
];

/**
 * Online Dukan — BUYER storefront routes.
 * Mounted as a separate top-level route at /dukan/shop (NOT under the Anjaninex
 * shell) so customers can reach it without an Anjaninex account. Buyer login is
 * its own page (phone + PIN), stored in a separate buyer token.
 */
export const dukanShopRoutes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/buyer/buyer-login.component').then(m => m.DukanBuyerLoginComponent) },
  {
    path: '',
    loadComponent: () => import('./pages/buyer/buyer-shell.component').then(m => m.DukanBuyerShellComponent),
    children: [
      { path: '', redirectTo: 'catalog', pathMatch: 'full' },
      { path: 'catalog', loadComponent: () => import('./pages/buyer/catalog.component').then(m => m.CatalogComponent) },
      { path: 'dashboard', loadComponent: () => import('./pages/buyer/dashboard.component').then(m => m.BuyerDashboardComponent) },
      { path: 'cart', loadComponent: () => import('./pages/buyer/cart.component').then(m => m.CartComponent) },
      { path: 'orders', loadComponent: () => import('./pages/buyer/orders.component').then(m => m.OrdersComponent) },
      { path: 'bills', loadComponent: () => import('./pages/buyer/bills.component').then(m => m.BillsComponent) },
      { path: 'ratings', loadComponent: () => import('./pages/buyer/ratings.component').then(m => m.RatingsComponent) },
      { path: 'profile', loadComponent: () => import('./pages/buyer/profile.component').then(m => m.ProfileComponent) },
    ],
  },
];
