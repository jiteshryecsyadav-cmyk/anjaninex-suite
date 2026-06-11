import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BuyersService, BuyerDetail } from '../services/buyers.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';

@Component({
  selector: 'app-buyer-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe, BackButtonComponent],
  template: `
    <div class="max-w-3xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      @if (loading()) {
        <div class="card text-center text-gray-500 py-8">Loading…</div>
      } @else if (!buyer()) {
        <div class="card text-center text-gray-500 py-8">Buyer nahi mila.</div>
      } @else {
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-display font-black text-2xl text-[#5c1a8b]">{{ buyer()!.displayName }}</h2>
            <p class="text-sm text-[#6b3fa0]">{{ buyer()!.buyerCode }} · {{ buyer()!.buyerType || 'Buyer' }}</p>
          </div>
          <div class="flex gap-2">
            <a [routerLink]="['/suppliers/buyers', buyer()!.id, 'edit']" class="btn-primary no-underline">✏️ Edit</a>
            <a [routerLink]="['/core-master', buyer()!.contactId]" class="px-4 py-2 border border-[#ddc8f5] rounded text-sm text-[#5c1a8b]">🗂️ Core Master</a>
          </div>
        </div>

        <div class="card grid grid-cols-2 gap-4 text-sm">
          <div><div class="lbl">Phone</div><div>{{ buyer()!.phone || '—' }}</div></div>
          <div><div class="lbl">Email</div><div>{{ buyer()!.email || '—' }}</div></div>
          <div><div class="lbl">GST</div><div class="font-mono">{{ buyer()!.gst || '—' }}</div></div>
          <div><div class="lbl">PAN</div><div class="font-mono">{{ buyer()!.pan || '—' }}</div></div>
          <div><div class="lbl">Brand</div><div>{{ buyer()!.brandName || '—' }}</div></div>
          <div><div class="lbl">City / State</div><div>{{ buyer()!.city || '—' }}, {{ buyer()!.state || '' }}</div></div>
          <div><div class="lbl">Budget</div><div>₹{{ buyer()!.budgetMin || 0 | number }} – ₹{{ buyer()!.budgetMax || 0 | number }} /{{ buyer()!.budgetUnit }}</div></div>
          <div><div class="lbl">Order Frequency</div><div>{{ buyer()!.orderFrequency || '—' }}</div></div>
          <div><div class="lbl">Quality Pref</div><div>{{ buyer()!.qualityPref || '—' }}</div></div>
          <div><div class="lbl">Payment Terms</div><div>{{ buyer()!.paymentTerms || '—' }}</div></div>
          <div class="col-span-2"><div class="lbl">Notes</div><div>{{ buyer()!.notes || '—' }}</div></div>
        </div>
      }
    </div>
  `,
  styles: [`.lbl{ font-size:10px; font-weight:800; color:#6b3fa0; text-transform:uppercase; letter-spacing:.5px; margin-bottom:2px; }`]
})
export class BuyerDetailComponent {
  private svc = inject(BuyersService);
  private route = inject(ActivatedRoute);

  buyer = signal<BuyerDetail | null>(null);
  loading = signal(true);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.loading.set(false); return; }
    this.svc.get(id).subscribe({
      next: (b) => { this.buyer.set(b); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}
