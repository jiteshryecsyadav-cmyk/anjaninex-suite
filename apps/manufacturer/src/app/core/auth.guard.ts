import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Login kiye bina koi screen nahi khulti. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  router.navigate(['/login']);
  return false;
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
