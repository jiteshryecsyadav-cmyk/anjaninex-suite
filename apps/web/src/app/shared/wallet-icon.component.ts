import { Component, Input } from '@angular/core';

// Reusable wallet icon (blue wallet with folded flap + clasp button).
// Uses currentColor so it adapts to text color (white on active nav, blue elsewhere).
// Usage: <app-wallet-icon [size]="20"></app-wallet-icon>
@Component({
  selector: 'app-wallet-icon',
  standalone: true,
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 48 48"
         fill="none" xmlns="http://www.w3.org/2000/svg"
         style="display:inline-block;vertical-align:middle">
      <!-- body -->
      <rect x="4" y="15" width="36" height="27" rx="6" fill="currentColor"/>
      <!-- folded top flap -->
      <path d="M9 15 L26 7.5 L35 15 Z" fill="currentColor"/>
      <path d="M9 15 L26 7.5 L35 15" fill="none" stroke="#fff" stroke-width="1.7"
            stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>
      <!-- clasp pocket on right -->
      <rect x="32" y="22.5" width="14" height="11" rx="3.5" fill="currentColor"/>
      <circle cx="39.5" cy="28" r="3.4" fill="none" stroke="#fff" stroke-width="1.7" opacity="0.95"/>
      <circle cx="39.5" cy="28" r="1.3" fill="#fff"/>
    </svg>
  `
})
export class WalletIconComponent {
  @Input() size = 20;
}
