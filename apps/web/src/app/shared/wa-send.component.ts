import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TradingService } from '../modules/trading/services/trading.service';

/**
 * Report ko PARTY CHAT me bhejne ka button + popover.
 *
 * Pehle ye WhatsApp bhejta tha aur user ko 10-digit number HAATH SE daalna
 * padta tha (in reports me party list load hi nahi hoti thi). Do dikkat:
 *   - WhatsApp par bheja hua app me kahin record nahi hota tha, party ka jawab
 *     bhi gum ho jata tha
 *   - har baar number yaad karke type karna padta tha
 * Ab: party SEARCH karke chuno -> uska chat khul jata hai, report draft me
 * bhari hui. Bhejta user khud hai.
 *
 * Selector 'app-wa-send' JAAN-BOOJH KAR wahi rakha hai — 5 report pages isse
 * use karte hain, naam badalne se sab jagah chhedna padta.
 *
 * Usage (pehle jaisa hi):
 *   <app-wa-send [message]="waMessage()"></app-wa-send>
 */
@Component({
  selector: 'app-wa-send',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="was-wrap">
      <button type="button" class="was-btn" (click)="toggle()" title="Report Party Chat me bhejo">
        💬 Party Chat
      </button>
      @if (open()) {
        <div class="was-pop">
          <div class="was-title">💬 Kis party ko bhejni hai?</div>
          <input type="text" [ngModel]="search()" (ngModelChange)="onSearch($event)"
                 placeholder="Naam ya mobile no" class="was-ip" autocomplete="off">
          @if (err()) { <div class="was-err">⚠️ {{ err() }}</div> }
          <div class="was-list">
            @for (p of shown(); track p.id) {
              <button type="button" class="was-item" (click)="pick(p)">
                <span class="was-item-name">{{ p.displayName }}</span>
                <span class="was-item-sub">
                  {{ p.phone || 'mobile nahi' }}@if (p.city) { <span> · {{ p.city }}</span> }
                </span>
              </button>
            }
            @if (shown().length === 0) {
              <div class="was-empty">
                @if (searching()) { Dhoondh rahe hain… }
                @else if (search().trim()) { "{{ search() }}" se koi party nahi mili }
                @else { Naam ya mobile no type karke dhoondo }
              </div>
            }
          </div>
          <div class="was-foot">
            <button type="button" class="was-cancel" (click)="open.set(false)">Cancel</button>
          </div>
          <div class="was-hint">Report chat me pehle se bhari milegi — aap dekh kar Send karna</div>
        </div>
      }
    </div>
  `,
  styles: [`
    .was-wrap { position: relative; display: inline-block; }
    .was-btn { border: 1px solid #ddd6fe; background: #ede9fe; color: #6D28D9; border-radius: 8px;
      padding: 7px 14px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: inherit; }
    .was-btn:hover { background: #ddd6fe; }
    .was-pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 60; width: 280px;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.15); }
    .was-title { font-size: 12px; font-weight: 800; color: #1B2E5C; margin-bottom: 8px; }
    .was-ip { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px;
      font-size: 13px; }
    .was-err { font-size: 11px; color: #b91c1c; margin-top: 5px; }
    .was-list { max-height: 190px; overflow-y: auto; margin-top: 8px; }
    .was-item { display: block; width: 100%; text-align: left; border: none; background: none;
      padding: 7px 8px; border-radius: 6px; cursor: pointer; font-family: inherit; }
    .was-item:hover { background: #f5f3ff; }
    .was-item-name { display: block; font-size: 13px; font-weight: 700; color: #1B2E5C; }
    .was-item-sub { display: block; font-size: 11px; color: #6B7280; }
    .was-empty { font-size: 12px; color: #9CA3AF; padding: 10px 4px; text-align: center; }
    .was-foot { display: flex; gap: 6px; margin-top: 8px; }
    .was-cancel { flex: 1; border: 1px solid #d1d5db; background: #fff; color: #374151;
      border-radius: 8px; padding: 7px; font-size: 12px; font-weight: 700; cursor: pointer; }
    .was-hint { font-size: 10px; color: #9ca3af; margin-top: 7px; text-align: center; }
  `]
})
export class WaSendComponent {
  /** Jo text chat ke draft me jayega (report ka summary) */
  @Input() message = '';
  /** Purane call-sites compatibility ke liye — ab istemal nahi hota. */
  @Input() suggestedPhone: string | null | undefined;
  @Output() sent = new EventEmitter<string>();

  private router = inject(Router);
  private trading = inject(TradingService);

  open = signal(false);
  err = signal('');
  /** SIGNAL hona zaroori hai — plain property hoti to computed ko badalne ka
   *  pata hi nahi chalta aur list kabhi update nahi hoti (typing par kuch na hota). */
  search = signal('');
  private parties = signal<any[]>([]);
  searching = signal(false);

  /** Bina kuch type kiye poori list nahi dikhate — 600+ parties me scroll bekaar. */
  shown = computed(() => (this.search().trim() ? this.parties() : []));

  toggle() {
    this.open.set(!this.open());
    this.err.set('');
  }

  /** SERVER se search — naam, MOBILE NO aur GST teeno se dhoondta hai.
   *  Client-side filter me sirf naam milta, aur list bhi sirf ACTIVE parties
   *  ki hoti — isliye server par hi chhodna behtar hai. */
  private timer: any;
  onSearch(v: string) {
    this.search.set(v);
    clearTimeout(this.timer);
    const q = (v || '').trim();
    if (!q) { this.parties.set([]); return; }
    this.searching.set(true);
    this.timer = setTimeout(() => {
      this.trading.listParties(q).subscribe({
        next: (p: any) => { this.parties.set((p || []).slice(0, 40)); this.searching.set(false); },
        error: () => { this.err.set('Party list nahi aayi — dobara try karo'); this.searching.set(false); }
      });
    }, 300);
  }

  pick(p: any) {
    if (!this.message?.trim()) {
      this.err.set('Bhejne ke liye report me data nahi hai');
      return;
    }
    // Bahut lamba message draft me theek se nahi aata — trim kar dete hain.
    const text = this.message.length > 1800 ? this.message.slice(0, 1800) + '\n…' : this.message;
    this.open.set(false);
    this.sent.emit(p.id);
    this.router.navigate(['/party-chat'], { queryParams: { partyId: p.id, msg: text } });
  }
}
