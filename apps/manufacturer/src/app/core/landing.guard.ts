import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * App khulte hi kahan jaana hai.
 *
 * Pehle seedha Karigars par bhej rahe the — par Godown wale, Salesman aur
 * Munim me se kisi ke paas bhi `masters.karigar.view.firm` nahi hai, isliye
 * wo log app kholte hi "Ye screen aapke liye nahi hai" par pahunch jaate the.
 * Pehla hi pardah rok ka — isse bura swagat nahi ho sakta.
 *
 * Ab kram se dekhte hain aur jo pehli screen wo khol sakta hai, wahin bhejte
 * hain. Kram jaan-boojh kar "roz ka kaam pehle, masters baad me" rakha hai.
 */
const LANDING: { perm: string; path: string }[] = [
  { perm: 'sales.order.view.place',      path: '/sales/order' },
  { perm: 'sales.challan.view.place',    path: '/sales/challan' },
  { perm: 'production.jobslip.view.place', path: '/production/jobslip' },
  { perm: 'purchase.inward.view.place',  path: '/purchase/inward' },
  { perm: 'stock.design.view.firm',      path: '/stock/items' },
  { perm: 'masters.karigar.view.firm',   path: '/masters/karigars' },
  { perm: 'reports.sales.view.firm',     path: '/reports/sales' }
];

/**
 * Abhi sirf Karigars ki screen bani hai — baaki route hain hi nahi. Isliye
 * jab tak wo na banein, tab tak jo bhi mile usme se sirf banayi hui screen
 * par bhejte hain, warna 404 par pahunch jayega.
 */
const READY = new Set<string>([
  '/masters/karigars', '/masters/agents', '/masters/godowns',
  '/masters/customers', '/masters/suppliers', '/stock/items'
]);

export const landingRedirect: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const hit = LANDING.find(l => auth.can(l.perm) && READY.has(l.path));
  if (hit) return router.createUrlTree([hit.path]);

  // Kuch bhi nahi khol sakta — saaf batao ki role khali hai
  return router.createUrlTree(['/no-access'], {
    queryParams: { need: 'koi bhi screen — malik se role chalu karwaiye' }
  });
};
