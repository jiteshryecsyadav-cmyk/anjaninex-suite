import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

export const branchInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  // 'branchId' is the key the branch switcher (shell) writes to. Keep both keys as
  // fallbacks, then default branch — so the header always matches the selected branch.
  const branchId = localStorage.getItem('branchId')
    ?? localStorage.getItem('current_branch_id')
    ?? auth.user()?.defaultBranchId;

  if (branchId && !req.headers.has('X-Branch-Id')) {
    req = req.clone({ setHeaders: { 'X-Branch-Id': branchId } });
  }

  return next(req);
};
