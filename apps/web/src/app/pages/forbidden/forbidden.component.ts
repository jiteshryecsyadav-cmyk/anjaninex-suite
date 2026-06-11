import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div class="text-6xl mb-4">🚫</div>
      <h1 class="text-2xl font-display font-bold text-[#5c1a8b]">Access Denied</h1>
      <p class="text-gray-600 mt-2">
        @if (required()) {
          You need <code class="bg-[#f0e6ff] px-2 py-1 rounded">{{ required() }}</code> permission.
        } @else {
          You don't have permission to view this page.
        }
      </p>
      <a routerLink="/" class="btn-primary mt-6">Back to Dashboard</a>
    </div>
  `
})
export class ForbiddenComponent {
  private route = inject(ActivatedRoute);
  required = () => this.route.snapshot.queryParamMap.get('required');
}
