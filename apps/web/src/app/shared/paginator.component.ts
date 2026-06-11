import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Reusable list paginator: page-size dropdown (10/50/100) + ‹ › arrows.
// Usage:
//   <app-paginator [total]="filtered().length" [page]="pageClamped()" [pageSize]="pageSize()"
//                  (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event); page.set(1)">
//   </app-paginator>
@Component({
  selector: 'app-paginator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="pgr">
      <div class="pgr-left">
        <span>Show</span>
        <select [ngModel]="pageSize" (ngModelChange)="pageSizeChange.emit(+$event)">
          <option [ngValue]="10">10</option>
          <option [ngValue]="50">50</option>
          <option [ngValue]="100">100</option>
        </select>
        <span>entries · <b>{{ from }}–{{ to }}</b> of {{ total }}</span>
      </div>
      <div class="pgr-right">
        <button class="pgr-btn" [disabled]="page <= 1" (click)="go(page - 1)" title="Previous">‹</button>
        <span class="pgr-pg">{{ page }} / {{ totalPages }}</span>
        <button class="pgr-btn" [disabled]="page >= totalPages" (click)="go(page + 1)" title="Next">›</button>
      </div>
    </div>
  `,
  styles: [`
    .pgr{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;
         padding:10px 14px;border-top:1px solid #e5e7eb;background:#FAF7F0;font-size:12px;color:#4A5878}
    .pgr-left{display:flex;align-items:center;gap:6px}
    .pgr-left select{padding:4px 8px;border:1.5px solid #d6ddea;border-radius:6px;font-size:12px;
                     font-weight:700;font-family:inherit;cursor:pointer;color:#1B2E5C;background:#fff}
    .pgr-left b{color:#1B2E5C;font-family:'JetBrains Mono',monospace}
    .pgr-right{display:flex;align-items:center;gap:8px}
    .pgr-pg{font-weight:800;color:#1B2E5C;font-family:'JetBrains Mono',monospace;min-width:54px;text-align:center}
    .pgr-btn{width:30px;height:30px;border:1.5px solid #d6ddea;background:#fff;border-radius:8px;
             font-size:18px;font-weight:800;color:#1B2E5C;cursor:pointer;line-height:1;display:flex;
             align-items:center;justify-content:center}
    .pgr-btn:hover:not(:disabled){border-color:#1B2E5C;background:#E5E9F2}
    .pgr-btn:disabled{opacity:.35;cursor:not-allowed}
  `]
})
export class PaginatorComponent {
  @Input() total = 0;
  @Input() page = 1;
  @Input() pageSize = 10;
  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get from(): number { return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1; }
  get to(): number { return Math.min(this.total, this.page * this.pageSize); }

  go(p: number): void {
    const np = Math.min(Math.max(1, p), this.totalPages);
    this.pageChange.emit(np);
  }
}
