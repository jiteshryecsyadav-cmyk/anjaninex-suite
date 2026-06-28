import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DukanService } from '../../dukan.service';

@Component({
  selector: 'app-ratings',
  standalone: true,
  imports: [DecimalPipe],
  template: `
  <div class="card" style="padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <div style="font-size:34px;font-weight:800;color:var(--deep)">{{ ds.avgRating() ? (ds.avgRating() | number:'1.1-1') : '—' }}</div>
    <div>
      <div class="stars-lg">
        @for (s of [1,2,3,4,5]; track s) {
          <span [style.opacity]="ds.avgRating() >= s - 0.4 ? '1':'0.25'">★</span>
        }
      </div>
      <div style="font-size:12.5px;color:var(--muted)">Your Average Rating · {{ reviewCount() }} review(s)</div>
    </div>
  </div>

  @if (ds.orders().length === 0) {
    <div class="empty card" style="padding:50px">Order complete hone ke baad rating + review de sakte hain ⭐</div>
  } @else {
    @for (o of ds.orders(); track o.id) {
      <div class="card" style="padding:16px;margin-bottom:12px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-weight:700">{{ o.id }} <span style="font-size:12px;color:var(--muted)">· {{ o.billNo }}</span></div>
            <div style="font-size:12px;color:var(--muted)">{{ o.items.length }} items · ₹{{ o.total }}</div>
          </div>
        </div>

        @if (ds.reviews()[o.id]; as r) {
          <div style="margin-top:10px">
            <div class="stars-lg">@for (s of [1,2,3,4,5]; track s) { <span [style.opacity]="r.stars >= s ? '1':'0.25'">★</span> }</div>
            @if (r.text) { <div style="font-size:13.5px;margin-top:8px;background:var(--panel2);padding:10px 12px;border-radius:10px">"{{ r.text }}"</div> }
            <div style="font-size:11.5px;color:var(--muted);margin-top:6px">— {{ r.buyer }} · {{ r.date }}</div>
            @if (r.reply) {
              <div style="margin-top:10px;margin-left:14px;background:#fff;border:1px solid var(--line);padding:10px 12px;border-radius:10px;border-left:3px solid var(--orange)">
                <div style="font-size:11.5px;font-weight:700;color:var(--deep)">↩ Online Dukan replied · {{ r.replyDate }}</div>
                <div style="font-size:13.5px;margin-top:3px">{{ r.reply }}</div>
              </div>
            }
            <button class="btn ghost sm" style="margin-top:8px" (click)="edit(o.id, r.stars, r.text)">Edit review</button>
          </div>
        } @else {
          <div style="margin-top:10px">
            <div style="font-size:12.5px;color:var(--muted);margin-bottom:4px">Rate this order:</div>
            <div class="stars-lg pick">
              @for (s of [1,2,3,4,5]; track s) {
                <span [style.opacity]="(draftStars()[o.id] ?? 0) >= s ? '1':'0.25'" (click)="setStar(o.id, s)">★</span>
              }
            </div>
            <textarea rows="2" placeholder="Apna review likhein (optional)..." style="margin-top:8px"
                      [value]="draftText()[o.id] ?? ''" (input)="setText(o.id, $any($event.target).value)"></textarea>
            <button class="btn sm" style="margin-top:8px" (click)="submit(o.id)">Submit Review</button>
          </div>
        }
      </div>
    }
  }
  `,
})
export class RatingsComponent {
  ds = inject(DukanService);
  draftStars = signal<Record<string, number>>({});
  draftText = signal<Record<string, string>>({});

  reviewCount() { return Object.keys(this.ds.reviews()).length; }
  setStar(id: string, s: number) { this.draftStars.set({ ...this.draftStars(), [id]: s }); }
  setText(id: string, t: string) { this.draftText.set({ ...this.draftText(), [id]: t }); }
  submit(id: string) {
    const stars = this.draftStars()[id] ?? 0;
    if (!stars) { alert('Pehle star rating chunein'); return; }
    this.ds.submitReview(id, stars, this.draftText()[id] ?? '');
  }
  edit(id: string, stars: number, text: string) {
    const r = { ...this.ds.reviews() }; delete r[id]; this.ds.reviews.set(r);
    this.setStar(id, stars); this.setText(id, text);
  }
}
