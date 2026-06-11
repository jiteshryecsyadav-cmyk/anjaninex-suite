import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradingService, Party, CreateParty } from '../modules/trading/services/trading.service';
import { INDIA_STATES, STATES_ALPHA, findStateByName, findStateByGstCode, suggestPincode } from './india-states';

@Component({
  selector: 'app-party-quick-add',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="qa-overlay" (click)="close.emit()">
      <div class="qa-modal" (click)="$event.stopPropagation()">
        <div class="qa-head">
          <div class="qa-title">
            ➕ Quick Add {{ partyType === 'supplier' ? 'Supplier' : partyType === 'buyer' ? 'Buyer' : 'Party' }}
          </div>
          <button class="qa-close" (click)="close.emit()">✕</button>
        </div>

        <div class="qa-body">
          <!-- Party Type -->
          <div class="qa-row">
            <div class="qa-field">
              <label>PARTY TYPE <span class="req">*</span></label>
              <select [(ngModel)]="partyTypeLocal" class="qa-ip"
                      [class.qa-ip-err]="submitted() && !partyTypeLocal">
                <option value="supplier">🏭 Supplier (Seller / Mill)</option>
                <option value="buyer">🛒 Buyer (Customer / Shop)</option>
                <option value="both">↔️ Both (Supplier + Buyer)</option>
              </select>
            </div>
            <div class="qa-field">
              <label>PARTY CODE</label>
              <input type="text" [(ngModel)]="partyCode" placeholder="auto" class="qa-ip" disabled>
            </div>
          </div>

          <div class="qa-row">
            <div class="qa-field">
              <label>DISPLAY NAME <span class="req">*</span></label>
              <input type="text" [(ngModel)]="displayName" placeholder="e.g., Shree Textiles"
                     class="qa-ip" [class.qa-ip-err]="submitted() && !displayName.trim()">
            </div>
            <div class="qa-field">
              <label>LEGAL NAME</label>
              <input type="text" [(ngModel)]="legalName" placeholder="(optional)" class="qa-ip">
            </div>
          </div>

          <!-- URP toggle: unregistered party (no GSTIN). GST portal me aise party ko
               "URP" likhte hain aur PAN use karte hain. -->
          <div class="qa-row">
            <div class="qa-field qa-full">
              <label class="qa-urp-toggle">
                <input type="checkbox" [(ngModel)]="isUrp" (ngModelChange)="onUrpToggle()">
                <span>🧾 Unregistered Party (URP) — GST number nahi hai (PAN use hoga)</span>
              </label>
            </div>
          </div>

          <div class="qa-row">
            <div class="qa-field">
              <label>GSTIN @if (!isUrp) { <span class="req">*</span> } @else { <span class="qa-urp-tag">URP</span> }</label>
              @if (isUrp) {
                <input type="text" value="URP" disabled class="qa-ip" title="Unregistered party — no GSTIN">
                <div class="qa-hint">Unregistered party — GSTIN ki jagah "URP". PAN neeche zaroori hai.</div>
              } @else {
                <input type="text" [(ngModel)]="gst" placeholder="e.g., 24AABCO5612R1ZX"
                       maxlength="15" (input)="gst = gst.toUpperCase()"
                       class="qa-ip" [class.qa-ip-err]="submitted() && !isValidGst()">
                @if (gst && gst.length > 0 && gst.length < 15) {
                  <div class="qa-hint">⚠️ GSTIN must be exactly 15 characters (currently {{ gst.length }})</div>
                }
              }
            </div>
            <div class="qa-field">
              <label>PAN @if (isUrp) { <span class="req">*</span> }</label>
              <input type="text" [(ngModel)]="pan" placeholder="AABCO5612R" maxlength="10"
                     (input)="pan = pan.toUpperCase()" class="qa-ip"
                     [class.qa-ip-err]="submitted() && isUrp && !isValidPan()">
              @if (isUrp && pan && pan.length > 0 && !isValidPan()) {
                <div class="qa-hint">⚠️ PAN must be 10 chars (e.g. AABCO5612R)</div>
              }
            </div>
          </div>

          <div class="qa-row">
            <div class="qa-field">
              <label>PHONE / WHATSAPP <span class="req">*</span></label>
              <input type="text" [(ngModel)]="phone" placeholder="+91 98765 43210"
                     class="qa-ip" [class.qa-ip-err]="submitted() && !isValidPhone()">
            </div>
            <div class="qa-field">
              <label>EMAIL</label>
              <input type="email" [(ngModel)]="email" placeholder="contact@example.com" class="qa-ip">
            </div>
          </div>

          <div class="qa-row">
            <div class="qa-field qa-full">
              <label>ADDRESS</label>
              <input type="text" [(ngModel)]="address" placeholder="Street / area / area" class="qa-ip">
            </div>
          </div>

          <div class="qa-row">
            <div class="qa-field">
              <label>STATE</label>
              <select [(ngModel)]="state" (ngModelChange)="onStateChange()" class="qa-ip">
                <option value="">— Select State —</option>
                <!-- Naam pehle — taaki keyboard pe 'R' dabate hi Rajasthan pe jump ho -->
                @for (s of states; track s.code) {
                  <option [value]="s.name">{{ s.name }} ({{ s.code }})</option>
                }
              </select>
            </div>
            <div class="qa-field">
              <label>CITY <span class="req">*</span></label>
              <input type="text" [(ngModel)]="city" (ngModelChange)="onCityChange()"
                     [attr.list]="'cities-' + state" placeholder="Select state first"
                     class="qa-ip" [class.qa-ip-err]="submitted() && !city.trim()">
              @if (currentStateCities().length > 0) {
                <datalist [id]="'cities-' + state">
                  @for (c of currentStateCities(); track c) {
                    <option [value]="c"></option>
                  }
                </datalist>
              }
            </div>
            <div class="qa-field">
              <label>PINCODE</label>
              <input type="text" [(ngModel)]="pincode" placeholder="395001" maxlength="6" class="qa-ip">
            </div>
          </div>

          <div class="qa-row">
            <div class="qa-field">
              <label>CREDIT LIMIT (₹) <span class="req">*</span></label>
              <input type="number" [(ngModel)]="creditLimit" placeholder="e.g., 100000"
                     class="qa-ip" [class.qa-ip-err]="submitted() && !(creditLimit > 0)">
              @if (+creditLimit > 0) {
                <div class="qa-amt-words">≈ {{ amountInWords(+creditLimit) }}</div>
              }
            </div>
            <div class="qa-field">
              <label>CREDIT DAYS <span class="req">*</span></label>
              <input type="number" [(ngModel)]="creditDays" placeholder="30"
                     class="qa-ip" [class.qa-ip-err]="submitted() && !(creditDays > 0)">
            </div>
            <div class="qa-field">
              <label class="flex items-center justify-between">
                <span>COMMISSION % @if (commissionEnabled) { <span class="req">*</span> }</span>
                <!-- Buyer mostly commission nahi deta; toggle OFF = optional. Sirf supplier deta hai. -->
                <label class="qa-comm-toggle" title="Commission applicable? (buyer ke liye aksar OFF)">
                  <input type="checkbox" [(ngModel)]="commissionEnabled" (ngModelChange)="onCommissionToggle()">
                  <span>{{ commissionEnabled ? 'ON' : 'OFF' }}</span>
                </label>
              </label>
              <input type="number" [(ngModel)]="commissionRate" placeholder="2" step="0.1"
                     [disabled]="!commissionEnabled"
                     class="qa-ip" [class.qa-ip-err]="submitted() && commissionEnabled && !(commissionRate > 0)">
              @if (!commissionEnabled) {
                <div class="qa-hint" style="color:#16a34a">No commission for this party</div>
              }
            </div>
          </div>

          <div class="qa-row">
            <div class="qa-field">
              <label>OPENING BALANCE</label>
              <input type="number" [(ngModel)]="openingBalance" placeholder="0" class="qa-ip">
            </div>
            <div class="qa-field">
              <label>OPENING TYPE</label>
              <select [(ngModel)]="openingType" class="qa-ip">
                <option value="debit">Debit (They owe us)</option>
                <option value="credit">Credit (We owe them)</option>
              </select>
            </div>
          </div>

          @if (error()) {
            <div class="qa-err" style="white-space: pre-line">⚠️ {{ error() }}</div>
          }
        </div>

        <div class="qa-foot">
          <button class="qa-btn qa-btn-cancel" (click)="close.emit()">Cancel</button>
          <button class="qa-btn qa-btn-save" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Saving…' : '✓ Save & Use' }}
          </button>
        </div>
      </div>

      <!-- PARTY ALREADY EXISTS MODAL — strict block on GST duplicate -->
      @if (existingParty(); as ex) {
        <div class="pex-overlay" (click)="closeExistingModal()">
          <div class="pex-modal" (click)="$event.stopPropagation()">
            <div class="pex-head">
              🚫 PARTY PEHLE SE EXIST HAI
              <button type="button" (click)="closeExistingModal()" class="pex-close">✕</button>
            </div>
            <div class="pex-body">
              <div class="pex-warn">
                Ye party <b>pehle se database me maujood hai</b> (GSTIN ya Phone match hua).
                Same party ki 2 entries allowed nahi — neeche <b>Use Existing</b> dabakar isi ko use karo.
              </div>
              <div class="pex-card">
                <div class="pex-name">{{ ex.displayName }}</div>
                <div class="pex-row"><span>GSTIN:</span><b>{{ ex.gst }}</b></div>
                @if (ex.phone) { <div class="pex-row"><span>Phone:</span><b>{{ ex.phone }}</b></div> }
                @if (ex.city)  { <div class="pex-row"><span>City:</span><b>{{ ex.city }}</b></div> }
                <div class="pex-row"><span>Added:</span><b>{{ ex.createdAt | date:'dd MMM yyyy' }}</b></div>
              </div>
              <div class="pex-actions">
                <button type="button" (click)="useExistingParty()" class="pex-btn-primary">
                  ✅ Use Existing
                </button>
                <button type="button" (click)="closeExistingModal()" class="pex-btn-secondary">
                  ✕ Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .qa-overlay {
      position: fixed; inset: 0; background: rgba(45,16,64,.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; padding: 16px; backdrop-filter: blur(2px);
    }
    .qa-modal {
      background: #fff; border-radius: 14px; width: min(720px, 100%);
      max-height: 92vh; overflow: hidden; display: flex; flex-direction: column;
      box-shadow: 0 12px 48px rgba(0,0,0,.3);
    }
    .qa-head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 18px; background: linear-gradient(135deg, #4a1080, #5c1a8b);
      color: #fff;
    }
    .qa-title { font-size: 16px; font-weight: 800; }
    .qa-close {
      background: rgba(255,255,255,.18); color: #fff; border: none;
      width: 28px; height: 28px; border-radius: 6px; font-size: 14px;
      cursor: pointer;
    }
    .qa-close:hover { background: rgba(255,255,255,.3); }

    .qa-body { padding: 16px 18px; overflow-y: auto; flex: 1; }
    .qa-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .qa-row:has(.qa-field:nth-child(3)) { grid-template-columns: 1fr 1fr 1fr; }
    .qa-field.qa-full { grid-column: 1 / -1; }
    .qa-field label {
      display: block; font-size: 10px; font-weight: 800;
      color: #6b3fa0; text-transform: uppercase; letter-spacing: .5px;
      margin-bottom: 4px;
    }
    .qa-ip {
      width: 100%; padding: 8px 10px; font-size: 13px; font-family: inherit;
      border: 1.5px solid #ddc8f5; border-radius: 8px; background: #faf5ff; outline: none;
    }
    .qa-ip:focus { border-color: #5c1a8b; box-shadow: 0 0 0 3px rgba(92,26,139,.1); }
    .qa-ip:disabled { background: #f0e6ff; color: #b39cc0; }
    .qa-ip-err { border-color: #dc2626 !important; background: #fef2f2 !important; }
    .qa-ip-err:focus { box-shadow: 0 0 0 3px rgba(220,38,38,.15) !important; }
    .req { color: #dc2626; font-weight: 800; }
    .qa-hint {
      font-size: 11px; color: #b45309; margin-top: 4px;
    }
    .qa-urp-toggle {
      display: flex !important; align-items: center; gap: 8px; cursor: pointer;
      background: #fff7ed; border: 1.5px solid #fed7aa; border-radius: 8px;
      padding: 8px 12px; text-transform: none !important; letter-spacing: 0 !important;
      font-size: 12.5px !important; font-weight: 600 !important; color: #9a3412 !important;
    }
    .qa-urp-toggle input { width: 16px; height: 16px; cursor: pointer; }
    .qa-urp-tag {
      background: #f97316; color: #fff; font-size: 9px; font-weight: 800;
      padding: 1px 6px; border-radius: 4px; letter-spacing: .5px;
    }
    .qa-comm-toggle {
      display: inline-flex !important; align-items: center; gap: 5px; cursor: pointer;
      text-transform: none !important; letter-spacing: 0 !important;
      font-size: 10px !important; font-weight: 800 !important; color: #5c1a8b !important;
    }
    .qa-comm-toggle input { width: 14px; height: 14px; cursor: pointer; }
    .qa-amt-words {
      font-size: 11.5px; color: #065f46; margin-top: 4px;
      background: #ecfdf5; border-left: 3px solid #10b981;
      padding: 4px 8px; border-radius: 4px;
      font-weight: 600; font-style: italic;
    }

    .qa-err {
      background: #fde8e8; color: #c62828; padding: 10px 14px;
      border-radius: 8px; font-size: 12.5px; font-weight: 600; margin-top: 10px;
      border-left: 4px solid #dc2626; line-height: 1.5;
    }
    .qa-err b { font-weight: 800; }

    /* PARTY ALREADY EXISTS MODAL — strict block on GST duplicate */
    .pex-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .pex-modal {
      background: #fff; border-radius: 12px; max-width: 440px; width: 100%;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5); overflow: hidden;
    }
    .pex-head {
      padding: 14px 18px; background: linear-gradient(135deg, #DC2626, #991B1B); color: #fff;
      display: flex; align-items: center; justify-content: space-between;
      font-weight: 900; font-size: 14px; letter-spacing: 0.5px;
    }
    .pex-close {
      background: rgba(255,255,255,0.2); border: 0; color: #fff;
      width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-weight: 700;
    }
    .pex-body { padding: 18px; }
    .pex-warn {
      background: #FEF2F2; border-left: 4px solid #DC2626; padding: 11px 13px;
      border-radius: 6px; font-size: 12.5px; color: #7F1D1D; margin-bottom: 14px; line-height: 1.5;
    }
    .pex-card {
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;
      padding: 14px 16px; margin-bottom: 14px;
    }
    .pex-name { font-size: 15px; font-weight: 900; color: #5c1a8b; margin-bottom: 8px; }
    .pex-row {
      display: flex; justify-content: space-between; padding: 5px 0;
      font-size: 12.5px; border-bottom: 1px solid #F1F5F9;
    }
    .pex-row:last-child { border-bottom: 0; }
    .pex-row span:first-child { color: #6b7280; }
    .pex-row b { color: #1B2E5C; font-weight: 700; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; }
    .pex-actions { display: flex; gap: 10px; }
    .pex-btn-primary {
      flex: 1; padding: 10px 14px; background: linear-gradient(135deg, #16a34a, #15803d);
      color: #fff; border: 0; border-radius: 8px; font-weight: 800; font-size: 12.5px; cursor: pointer;
    }
    .pex-btn-primary:hover { background: linear-gradient(135deg, #15803d, #166534); }
    .pex-btn-secondary {
      padding: 10px 14px; background: #F1F5F9; color: #475569;
      border: 0; border-radius: 8px; font-weight: 700; font-size: 12.5px; cursor: pointer;
    }
    .pex-btn-secondary:hover { background: #E2E8F0; }

    .qa-foot {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 18px; border-top: 1px solid #ddc8f5; background: #faf5ff;
    }
    .qa-btn {
      padding: 9px 18px; border-radius: 8px; border: none; font-size: 13px;
      font-weight: 700; cursor: pointer; font-family: inherit;
    }
    .qa-btn-cancel { background: #fff; border: 1.5px solid #ddc8f5; color: #6b3fa0; }
    .qa-btn-cancel:hover { background: #f0e6ff; }
    .qa-btn-save { background: linear-gradient(135deg, #4a1080, #5c1a8b); color: #fff; }
    .qa-btn-save:hover { background: linear-gradient(135deg, #3a0a64, #4a1080); }
    .qa-btn-save:disabled { opacity: .6; cursor: not-allowed; }
  `]
})
export class PartyQuickAddComponent {
  private svc = inject(TradingService);

  @Input() partyType: 'supplier' | 'buyer' | 'both' = 'supplier';
  @Input() prefill: Partial<{
    displayName: string;
    legalName: string;
    gst: string;
    pan: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  }> | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<Party>();

  partyTypeLocal: 'supplier' | 'buyer' | 'both' = 'supplier';
  partyCode = '';
  displayName = '';
  legalName = '';
  gst = '';
  pan = '';
  isUrp = false;   // Unregistered party — no GSTIN, PAN used instead
  phone = '';
  email = '';
  address = '';
  city = '';
  state = '';
  pincode = '';
  creditLimit = 100000;   // sensible default ₹1,00,000
  creditDays = 30;
  commissionRate = 0;
  commissionEnabled = true;   // toggle — buyer ke liye aksar OFF (commission nahi dete)
  openingBalance = 0;
  openingType = 'debit';

  /** When commission toggled OFF, zero the rate so nothing stale is sent. */
  onCommissionToggle() {
    if (!this.commissionEnabled) this.commissionRate = 0;
  }

  saving = signal(false);
  error = signal('');
  submitted = signal(false);   // becomes true after first save attempt — triggers red borders

  /** GSTIN basic format: 15 chars uppercase alphanumeric. */
  isValidGst(): boolean {
    return /^[0-9A-Z]{15}$/.test(this.gst.trim());
  }
  /** PAN format: 10 chars — 5 letters, 4 digits, 1 letter (e.g. AABCO5612R). */
  isValidPan(): boolean {
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(this.pan.trim().toUpperCase());
  }
  /** When URP toggled on, clear any typed GSTIN. */
  onUrpToggle() {
    if (this.isUrp) this.gst = '';
  }
  /** Phone: at least 10 digits anywhere (allows +91, dashes, etc.) */
  isValidPhone(): boolean {
    return (this.phone.match(/\d/g) || []).length >= 10;
  }

  // ────────── Indian number-to-words (Lakhs/Crores) ──────────
  private readonly _onesWord = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  private readonly _tensWord = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  private _twoDigit(n: number): string {
    if (n < 20) return this._onesWord[n];
    return this._tensWord[Math.floor(n / 10)] + (n % 10 ? ' ' + this._onesWord[n % 10] : '');
  }
  private _threeDigit(n: number): string {
    const h = Math.floor(n / 100), r = n % 100;
    let out = '';
    if (h) out += this._onesWord[h] + ' Hundred';
    if (r) out += (out ? ' ' : '') + this._twoDigit(r);
    return out;
  }
  /** Indian-style: One Lakh, Ten Lakh, One Crore. e.g. 200000 → "Two Lakh Rupees" */
  amountInWords(num: number): string {
    if (!num || num <= 0) return '';
    num = Math.floor(num);
    if (num >= 1_000_000_000_000) return 'Amount too large';

    const crore    = Math.floor(num / 10_000_000);
    const lakh     = Math.floor((num % 10_000_000) / 100_000);
    const thousand = Math.floor((num % 100_000) / 1_000);
    const rest     = num % 1_000;

    const parts: string[] = [];
    if (crore)    parts.push(this._twoDigit(crore) + ' Crore');
    if (lakh)     parts.push(this._twoDigit(lakh) + ' Lakh');
    if (thousand) parts.push(this._twoDigit(thousand) + ' Thousand');
    if (rest)     parts.push(this._threeDigit(rest));

    return parts.join(' ') + ' Rupees Only';
  }

  ngOnInit() {
    // initialise local from input
    this.partyTypeLocal = this.partyType;

    // Buyers mostly don't pay commission to the broker (only suppliers do), so
    // default the commission toggle OFF for buyers. User can switch it ON for the
    // rare case. Suppliers default ON.
    if (this.partyType === 'buyer') {
      this.commissionEnabled = false;
      this.commissionRate = 0;
    }

    // Pre-fill from AI scan data (or any other source)
    if (this.prefill) {
      if (this.prefill.displayName) this.displayName = this.prefill.displayName;
      if (this.prefill.legalName)   this.legalName = this.prefill.legalName;
      if (this.prefill.gst) {
        const g = this.prefill.gst.toUpperCase().trim();
        // AI scanned "URP" / "UNREGISTERED" → treat as unregistered party.
        if (g === 'URP' || g.includes('UNREG')) { this.isUrp = true; this.gst = ''; }
        else this.gst = g;
      }
      if (this.prefill.pan)         this.pan = this.prefill.pan.toUpperCase();
      // GST nahi par PAN hai → ye URP party hai, khud tick kar do
      if (!this.gst && this.pan && this.pan.length === 10) this.isUrp = true;
      if (this.prefill.phone)       this.phone = this.prefill.phone;
      if (this.prefill.email)       this.email = this.prefill.email;
      if (this.prefill.address)     this.address = this.prefill.address;
      if (this.prefill.city)        this.city = this.prefill.city;

      // Try multiple sources for state (matches dropdown options)
      if (this.prefill.state) {
        const match = findStateByName(this.prefill.state);
        this.state = match?.name ?? '';   // empty if AI gave junk — user picks from dropdown
      } else if (this.prefill.gst) {
        // No state but GSTIN given — derive from first 2 digits
        const match = findStateByGstCode(this.prefill.gst);
        if (match) this.state = match.name;
      }

      if (this.prefill.pincode)     this.pincode = this.prefill.pincode;
      else if (this.city)           this.pincode = suggestPincode(this.city);
    }
  }

  save() {
    // Mark as submitted so red borders show on all invalid mandatory fields
    this.submitted.set(true);

    // Collect ALL missing mandatory fields and show together
    const missing: string[] = [];
    if (!this.displayName.trim())          missing.push('Display Name');
    if (!this.partyTypeLocal)              missing.push('Party Type');
    // URP (unregistered) → GSTIN not needed, but PAN required.
    // Registered → GSTIN required (15 chars).
    if (this.isUrp) {
      if (!this.isValidPan())              missing.push('PAN (10 chars) — required for URP party');
    } else {
      if (!this.isValidGst())              missing.push('GSTIN (15 chars) — or tick "Unregistered (URP)"');
    }
    if (!this.isValidPhone())              missing.push('Phone / WhatsApp (10 digits)');
    if (!this.city.trim())                 missing.push('City');
    if (!(+this.creditLimit > 0))          missing.push('Credit Limit (> 0)');
    if (!(+this.creditDays > 0))           missing.push('Credit Days (> 0)');
    // Commission only required when the toggle is ON (suppliers). Buyers/OFF → optional.
    if (this.commissionEnabled && !(+this.commissionRate > 0))
      missing.push('Commission % (> 0) — ya commission toggle OFF karein');

    if (missing.length > 0) {
      this.error.set(
        `Please fill these required fields:\n• ${missing.join('\n• ')}`
      );
      return;
    }

    this.error.set('');
    this.saving.set(true);

    const payload: CreateParty = {
      displayName: this.displayName.trim(),
      legalName: this.legalName || undefined,
      phone: this.phone || undefined,
      email: this.email || undefined,
      // URP party → no GSTIN stored (DB keeps it null; "URP" shown in UI).
      gst: this.isUrp ? undefined : (this.gst || undefined),
      pan: this.pan || undefined,
      address: this.address || undefined,
      city: this.city || undefined,
      state: this.state || undefined,
      pincode: this.pincode || undefined,
      partyType: this.partyTypeLocal,
      creditLimit: +this.creditLimit || 0,
      creditDays: +this.creditDays || 30,
      commissionRate: +this.commissionRate || 0,
      openingBalance: +this.openingBalance || 0,
      openingType: this.openingType
    };

    this.svc.createParty(payload).subscribe({
      next: (p) => {
        this.saving.set(false);
        alert(`✓ ${p.displayName} added to Party Master!`);
        this.created.emit(p);
        this.close.emit();
      },
      error: (e) => {
        this.saving.set(false);
        // 409 Conflict → PARTY_EXISTS — show structured existing party modal (strict block)
        if (e?.status === 409 && e?.error?.error === 'PARTY_EXISTS') {
          this.existingParty.set(e.error.existing);
          return;
        }
        // Extract real backend error message — try multiple shapes
        const msg =
          (e?.error?.errors ? this.formatValidationErrors(e.error.errors) : null)
          ?? e?.error?.error
          ?? e?.error?.title
          ?? e?.error?.detail
          ?? (typeof e?.error === 'string' ? e.error : null)
          ?? `Save failed (${e?.status ?? 'unknown'}). Please check fields and try again.`;
        this.error.set(msg);
      }
    });
  }

  /** Party already exists modal state. */
  existingParty = signal<{ id: string; displayName: string; gst: string; phone: string; city: string; createdAt: string } | null>(null);
  closeExistingModal() { this.existingParty.set(null); }
  /** User clicked "Use Existing" → emit the existing party so caller auto-selects it. */
  useExistingParty() {
    const ex = this.existingParty();
    if (!ex) return;
    // Emit minimal Party shape so the parent dropdown auto-selects it.
    this.created.emit({
      id: ex.id,
      displayName: ex.displayName,
      gst: ex.gst,
      phone: ex.phone,
      city: ex.city,
      partyCode: '',
      partyType: this.partyType,
      creditLimit: 0,
      creditDays: 30,
      commissionRate: 0
    } as any);
    this.existingParty.set(null);
    this.close.emit();
  }

  /** Convert ASP.NET ModelState errors to a flat readable list. */
  private formatValidationErrors(errors: Record<string, string[]>): string {
    if (!errors || typeof errors !== 'object') return '';
    return Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${(msgs || []).join(', ')}`)
      .join(' · ');
  }

  // ============================================================
  // India states dropdown helpers
  // ============================================================
  states = STATES_ALPHA;
  currentStateCities = computed<string[]>(() => {
    const s = INDIA_STATES.find(x => x.name === this.state);
    return s?.cities ?? [];
  });

  /** When state changes — clear city if it doesn't belong, auto-fill pincode if empty. */
  onStateChange() {
    const cities = this.currentStateCities();
    if (this.city && !cities.includes(this.city)) {
      // City no longer matches new state — clear it
      this.city = '';
    }
  }

  /** When city changes — suggest pincode if empty. */
  onCityChange() {
    if (!this.pincode && this.city) {
      const pin = suggestPincode(this.city);
      if (pin) this.pincode = pin;
    }
  }
}
