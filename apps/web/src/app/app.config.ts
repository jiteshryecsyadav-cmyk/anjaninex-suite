import { ApplicationConfig, provideZoneChangeDetection, isDevMode, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { branchInterceptor } from './core/http/branch.interceptor';
import { AuthService } from './core/auth/auth.service';
import { UpdateService } from './core/version/update.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withInterceptors([authInterceptor, branchInterceptor, errorInterceptor])
    ),
    provideAnimations(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [AuthService, UpdateService],
      useFactory: (auth: AuthService, upd: UpdateService) => () => {
        upd.init();
        // IMPORTANT: promise RETURN karo — Angular app start hone se pehle session
        // restore hone ka wait karega. (Pehle wait nahi hota tha → F5 par app bina
        // user ke render hoti thi → galat dashboard/firm calls/flash hota tha.)
        return auth.restoreSession();
      }
    }
  ]
};
