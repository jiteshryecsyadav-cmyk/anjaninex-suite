import { Component, inject, Input } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';

/**
 * Reusable back button — uses browser history (Location.back()) by default
 * so user goes back to wherever they came from. If no history exists,
 * falls back to the optional [fallback] route.
 *
 * Usage:
 *   <app-back-button></app-back-button>              // history.back() or /dashboard
 *   <app-back-button label="Home"></app-back-button>
 *   <app-back-button fallback="/trading/bills"></app-back-button>
 */
@Component({
  selector: 'app-back-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button" (click)="goBack()" class="back-link" [title]="'Back'">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 14 4 9 9 4"></polyline>
        <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
      </svg>
      {{ label }}
    </button>
  `
})
export class BackButtonComponent {
  @Input() label = 'Back';
  @Input() fallback = '/dashboard';

  private location = inject(Location);
  private router = inject(Router);

  goBack() {
    // Check if there's any history to go back to
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigateByUrl(this.fallback);
    }
  }
}
