import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SalesSubNavComponent } from './sales-sub-nav.component';

/**
 * Sales ke chaaron pardon ka common khol — patti ek baar bante hai, upar hi
 * rehti hai, aur andar ka pardah badalta rehta hai.
 *
 * Patti ko chaaron component me alag-alag daalne se wo har baar dobara banti
 * aur pardah badalte waqt jhilmilaati.
 */
@Component({
  selector: 'mfg-sales-shell',
  standalone: true,
  imports: [RouterOutlet, SalesSubNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mfg-sales-sub-nav />
    <router-outlet />
  `
})
export class SalesShellComponent {}
