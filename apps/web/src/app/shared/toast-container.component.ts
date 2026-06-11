import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-wrap">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class.toast-success]="t.type === 'success'"
             [class.toast-error]="t.type === 'error'"
             [class.toast-info]="t.type === 'info'"
             (click)="toast.dismiss(t.id)">
          <span class="toast-ico">
            {{ t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ' }}
          </span>
          <span class="toast-msg">{{ t.message }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-wrap {
      position: fixed; top: 18px; right: 18px; z-index: 99999;
      display: flex; flex-direction: column; gap: 10px; max-width: 380px;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto; cursor: pointer;
      display: flex; align-items: flex-start; gap: 10px;
      padding: 13px 16px; border-radius: 10px; color: #fff;
      font-size: 13.5px; font-weight: 600; line-height: 1.4;
      box-shadow: 0 8px 24px rgba(0,0,0,.22);
      animation: toast-in .25s ease-out;
    }
    .toast-success { background: linear-gradient(135deg, #16a34a, #15803d); }
    .toast-error   { background: linear-gradient(135deg, #dc2626, #991b1b); }
    .toast-info    { background: linear-gradient(135deg, #4a1080, #5c1a8b); }
    .toast-ico {
      flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
      background: rgba(255,255,255,.22); display: flex; align-items: center;
      justify-content: center; font-size: 13px; font-weight: 900;
    }
    .toast-msg { padding-top: 1px; }
    @keyframes toast-in {
      from { opacity: 0; transform: translateX(40px); }
      to   { opacity: 1; transform: translateX(0); }
    }
  `]
})
export class ToastContainerComponent {
  toast = inject(ToastService);
}
