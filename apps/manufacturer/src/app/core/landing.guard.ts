import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { findSection, tabKhulta } from './nav';

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
 * Kuch screen abhi bani nahi (patti me "aage" likha dikhta hai). Un par bhej
 * diya to 404 par pahunch jayega — isliye sirf banayi hui screen chunte hain.
 */
const READY = new Set<string>([
  '/masters/karigars', '/masters/agents', '/masters/godowns',
  '/masters/customers', '/masters/suppliers', '/stock/items',
  '/production/jobslip',
  '/purchase/po', '/purchase/inward', '/purchase/return',
  '/sales/order', '/sales/challan', '/sales/invoice', '/sales/return'
]);

/**
 * Kisi bhi hisse ke andar ka pehla khulne wala pardah — /sales, /purchase,
 * /masters waghera par aate hi.
 *
 * Kaunsa hissa hai wo route ke `data.section` se aata hai, aur kram
 * [core/nav.ts]{@link ../core/nav} me hai. Har hisse ka apna guard likhne se
 * kram do jagah bat jata tha.
 */
export const sectionLanding: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const sec = findSection(route.data['section'] as string ?? '');
  const hit = sec?.tabs.find(t => !t.soon && tabKhulta(t, p => auth.can(p)));
  if (hit) return router.createUrlTree([hit.path]);

  return router.createUrlTree(['/no-access'], {
    queryParams: {
      need: `${sec?.title ?? 'Is hisse'} ka koi bhi pardah — malik se role chalu karwaiye`
    }
  });
};

/**
 * App khulte hi Dashboard — wahi jagah jahan "aaj kya atka hai" ek nazar me
 * dikh jata hai. Wo har kisi ko khulta hai, isliye LANDING wali chhaanni ab
 * sirf tab chalti hai jab dashboard hi na khule (aage kabhi band kiya jaye to).
 */
export const landingRedirect: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const hit = LANDING.find(l => auth.can(l.perm) && READY.has(l.path));
  if (hit) return router.createUrlTree(['/dashboard']);

  // Kuch bhi nahi khol sakta — saaf batao ki role khali hai
  return router.createUrlTree(['/no-access'], {
    queryParams: { need: 'koi bhi screen — malik se role chalu karwaiye' }
  });
};
