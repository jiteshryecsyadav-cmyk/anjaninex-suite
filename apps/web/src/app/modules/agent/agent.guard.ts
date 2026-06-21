import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

// Sirf agent (reseller) login hi /agent area access kar sakta hai.
export const agentGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }
  if (auth.user()?.agentId) return true;
  // Agent nahi hai → normal home
  router.navigate(['/']);
  return false;
};
