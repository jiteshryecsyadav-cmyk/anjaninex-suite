import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, map, of, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Login kiye bina koi screen nahi khulti — PAR pehle chup-chaap koshish
 * karte hain. Aadmi agency wale login page se yahan bheja gaya hoga aur
 * uski refresh cookie yahan bhi pahunchti hai. Bina is koshish ke usko
 * dobara id/password daalna padta.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;

  return auth.trySilentLogin().pipe(
    map(() => true),
    catchError(() => { router.navigate(['/login']); return of(false); })
  );
};

/**
 * Screen kholne se pehle permission check. Jis aadmi ke paas ijazat nahi,
 * usko screen dikhni hi nahi chahiye — warna wo bharta rahega aur SAVE par
 * 403 milega. Ye zyada bura anubhav hai.
 */
export const requirePermission = (code: string): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.can(code)) return true;
  router.navigate(['/no-access'], { queryParams: { need: code } });
  return false;
};

/** Har request par token, aur 401 par seedha login. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token;

  const withAuth = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(withAuth).pipe(
    catchError((err: HttpErrorResponse) => {
      // 401 = token khatam/galat. 402 = firm ka plan band (renew screen alag).
      if (err.status === 401) auth.logout();
      return throwError(() => err);
    })
  );
};
