import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<Toast[]>([]);
  toasts = this._toasts.asReadonly();
  private nextId = 1;

  /** Green success toast — e.g. "Bill successfully save ho gaya". */
  success(message: string) { this.push('success', message); }
  /** Red error toast. */
  error(message: string)   { this.push('error', message); }
  /** Neutral info toast. */
  info(message: string)    { this.push('info', message); }

  private push(type: Toast['type'], message: string) {
    const id = this.nextId++;
    this._toasts.update(list => [...list, { id, type, message }]);
    // Auto-dismiss: success/info after 3.5s, errors stay a bit longer (5s).
    const ttl = type === 'error' ? 5000 : 3500;
    setTimeout(() => this.dismiss(id), ttl);
  }

  dismiss(id: number) {
    this._toasts.update(list => list.filter(t => t.id !== id));
  }
}
