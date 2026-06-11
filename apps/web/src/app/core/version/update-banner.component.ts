import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { UpdateService } from './update.service';

@Component({
  selector: 'app-update-banner',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    @if (svc.newVersionAvailable()) {
      <div
        [class]="svc.forceUpdate()
          ? 'flex items-center gap-3 px-4 py-3 bg-red-600 text-white shadow-lg sticky top-0 z-[9998]'
          : 'flex items-center gap-3 px-4 py-3 bg-green-600 text-white shadow-lg sticky top-0 z-[9998]'">
        <span class="text-xl">{{ svc.forceUpdate() ? '⚠️' : '🎉' }}</span>
        <div class="flex-1">
          <strong class="block text-sm">
            {{ svc.forceUpdate() ? 'Critical update required' : 'New version available' }}
          </strong>
          @if (svc.changelog(); as cl) {
            <small class="text-xs opacity-90">
              v{{ cl.version }} · {{ cl.releaseDate | date: 'mediumDate' }}
            </small>
          }
        </div>
        <button
          (click)="svc.applyUpdate()"
          class="px-4 py-1.5 bg-white text-current rounded font-bold text-sm hover:opacity-90">
          {{ svc.forceUpdate() ? 'Updating in 5s...' : 'Update Now' }}
        </button>
        @if (!svc.forceUpdate()) {
          <button
            (click)="svc.snooze()"
            class="px-3 py-1.5 bg-white/20 text-white rounded text-sm hover:bg-white/30">
            Later
          </button>
        }
      </div>
    }
  `
})
export class UpdateBannerComponent {
  svc = inject(UpdateService);
}
