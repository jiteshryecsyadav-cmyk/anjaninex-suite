import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError, from, switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/auth/login') && !req.url.includes('/auth/refresh')) {
        // Silent refresh (single-flight), then REPLAY with the NEW token.
        // BUG FIX: pehle replay purane stale token ke saath hota tha → 401 → refresh →
        // 401 → infinite loop (screen blink + rate-limit). Ab naya token lagta hai.
        return from(auth.refresh()).pipe(
          switchMap((ok) => {
            if (!ok) {
              auth.hardLogout();   // session saaf — warna guard wapas andar bhej ke loop banata hai
              return throwError(() => err);
            }
            const fresh = auth.accessToken();
            const retried = fresh
              ? req.clone({ setHeaders: { Authorization: `Bearer ${fresh}` } })
              : req;
            return next(retried);
          })
        );
      }
      if (err.status === 403) {
        router.navigate(['/forbidden']);
      }
      return throwError(() => err);
    })
  );
};
