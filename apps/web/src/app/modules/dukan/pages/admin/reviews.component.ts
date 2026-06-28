import { Component, inject, signal } from '@angular/core';
import { DukanService } from '../../dukan.service';

@Component({
  selector: 'app-admin-reviews',
  standalone: true,
  template: `
  <div class="row" style="justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <h2 style="font-size:18px">Buyer Reviews</h2>
    <div class="card" style="padding:8px 14px;display:flex;align-items:center;gap:8px">
      <span class="stars-lg" style="font-size:18px">
        @for (s of [1,2,3,4,5]; track s) { <span [style.opacity]="ds.avgRating() >= s - 0.4 ? '1':'0.25'">★</span> }
      </span>
      <b>{{ ds.avgRating() ? (ds.avgRating().toFixed(1)) : '—' }}</b>
      <span style="font-size:12px;color:var(--muted)">({{ ds.allReviews().length }})</span>
    </div>
  </div>

  @if (ds.allReviews().length === 0) {
    <div class="empty card" style="padding:50px">Abhi koi review nahi aaya ⭐</div>
  } @else {
    @for (r of ds.allReviews(); track r.id) {
      <div class="card" style="padding:16px;margin-bottom:12px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
          <div>
            <span class="stars-lg" style="font-size:18px">@for (s of [1,2,3,4,5]; track s) { <span [style.opacity]="r.stars >= s ? '1':'0.25'">★</span> }</span>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">{{ r.buyer }} · Order {{ r.id }} · {{ r.date }}</div>
          </div>
        </div>
        @if (r.text) { <div style="font-size:14px;margin-top:8px">"{{ r.text }}"</div> }

        @if (r.reply) {
          <div style="margin-top:10px;background:var(--panel2);padding:10px 12px;border-radius:10px;border-left:3px solid var(--orange)">
            <div style="font-size:11.5px;font-weight:700;color:var(--deep)">Online Dukan replied · {{ r.replyDate }}</div>
            <div style="font-size:13.5px;margin-top:3px">{{ r.reply }}</div>
            <button class="btn ghost sm" style="margin-top:8px" (click)="openReply(r.id, r.reply)">Edit reply</button>
          </div>
        } @else if (replyingId() === r.id) {
          <textarea rows="2" placeholder="Apna reply likhein..." style="margin-top:10px"
                    [value]="draft()" (input)="draft.set($any($event.target).value)"></textarea>
          <div class="row" style="gap:8px;margin-top:8px">
            <button class="btn sm" (click)="postReply(r.id)">Post Reply</button>
            <button class="btn ghost sm" (click)="replyingId.set(null)">Cancel</button>
          </div>
        } @else {
          <button class="btn ghost sm" style="margin-top:10px" (click)="openReply(r.id, '')">↩ Reply</button>
        }
      </div>
    }
  }
  `,
})
export class AdminReviewsComponent {
  ds = inject(DukanService);
  replyingId = signal<string | null>(null);
  draft = signal('');

  openReply(id: string, existing: string | undefined) { this.replyingId.set(id); this.draft.set(existing ?? ''); }
  postReply(id: string) {
    if (!this.draft().trim()) { alert('Reply likhein'); return; }
    this.ds.replyReview(id, this.draft());
    this.replyingId.set(null); this.draft.set('');
  }
}
