import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, from, switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/auth/login') && !req.url.includes('/auth/refresh')) {
        // Silent refresh (single-flight), phir NAYE token ke saath REPLAY.
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
      // 403: page-access to route-guards (requirePermission) pehle hi rok dete hain.
      // Background API 403 (jaise dashboard ki branches call) par poori app ko /forbidden
      // MAT bhejo — warna ek chhoti call bhi user ko poore app se lock kar deti thi.
      // Error ko propagate karo; component gracefully handle karega (khali data).
      return throwError(() => err);
    })
  );
};
