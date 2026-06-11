import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // SECURITY: token sirf HAMARI API ko jaye — external URLs (pincode lookup,
  // CDN waghaira) par Bearer/branch headers bilkul nahi.
  const isOurApi = req.url.startsWith('/') || req.url.startsWith(environment.apiUrl);
  if (!isOurApi) return next(req);

  const auth = inject(AuthService);
  const token = auth.accessToken();

  const headers: Record<string, string> = {};
  if (token && !req.headers.has('Authorization')) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Selected branch (topbar switcher) — backend CurrentBranchId isi header se uthata hai
  const branchId = localStorage.getItem('branchId');
  if (branchId && !req.headers.has('X-Branch-Id')) {
    headers['X-Branch-Id'] = branchId;
  }

  if (Object.keys(headers).length) {
    req = req.clone({ setHeaders: headers });
  }

  return next(req);
};
