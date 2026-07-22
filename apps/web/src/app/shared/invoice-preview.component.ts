import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { amountInWords } from './amount-in-words.util';
import { FeatureService } from './feature.service';

export interface PreviewParty {
  /** Party Master ki id — Party Chat kholne ke liye. Na ho to chat button disabled. */
  id?: string | null;
  name: string;
  gst?: string | null;
  address?: string | null;
  mobile?: string | null;
  city?: string | null;
}

export interface PreviewLine {
  itemName: string;
  description?: string | null;
  hsnSac?: string | null;
  qty: number;
  unit?: string | null;
  rate: number;
  rd?: number;
  taxPct?: number;       // combined tax %
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface PreviewData {
  type: 'bill' | 'order' | 'payment' | 'gr' | 'commission';
  title: string;             // e.g. "SALES INVOICE", "ORDER CONFIRMATION"
  number: string;            // e.g. "BL/2026/00042" or "ORD-65"
  date: string;              // ISO date
  firmName: string;
  firmGst?: string;
  firmAddress?: string;
  supplier?: PreviewParty;
  buyer?: PreviewParty;
  lines: PreviewLine[];
  grossAmount: number;
  taxableAmount: number;
  totalTax: number;
  cdAmount?: number;
  netAmount: number;
  paymentTerms?: string | null;
  supplierOrderNo?: string | null;
  transport?: string | null;
  lrNo?: string | null;
  notes?: string | null;
  amount?: number;           // for payment receipts (simple)
  paymentMode?: string | null;
  /** Receipt ka txn-wise breakup — kitna cash/cheque/UPI, kis date ko */
  paymentTxns?: { mode: string; bank?: string | null; refNo?: string | null; date?: string | null; amount: number }[];
  /** Bills ka baki bacha amount (received ke baad) */
  balancePending?: number;
  /** Rate diff / discount / interest / GR jaisi kat-kut — sirf non-zero wali */
  adjustments?: { label: string; amount: number }[];
  /** Party card labels override — broker model (default SUPPLIER / BUYER) */
  supplierLabel?: string;
  buyerLabel?: string;
  /** Commission info (display-only — net amount par koi effect nahi) */
  commissionPct?: number;
  commissionAmount?: number;
}

@Component({
  selector: 'app-invoice-preview',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe],
  template: `
  <div class="ip-overlay" (click)="close.emit()">
    <div class="ip-paper" (click)="$event.stopPropagation()">

      <!-- Top toolbar -->
      <div class="ip-toolbar">
        <div class="tb-left">
          <span class="tb-icon">👁</span>
          <strong>{{ data.title }} Preview</strong>
        </div>
        <div class="tb-right">
          <button (click)="print()" class="tb-btn"><span>🖨️</span> Print</button>
          <button (click)="savePdf()" class="tb-btn"><span>📄</span> Save PDF</button>
          <button (click)="sharePartyChat()" class="tb-btn tb-wa" [disabled]="!chatPartyId()"
                  [title]="chatPartyId() ? 'Party Chat me bhejo' : 'Party Master me ye party nahi mili — chat nahi ho sakti'">
            <span>💬</span> Party Chat
          </button>
          <button (click)="close.emit()" class="tb-close">×</button>
        </div>
      </div>

      <!-- Invoice paper -->
      <div class="invoice" id="ipPrintArea" data-print-root>
        <div class="wm">{{ wmText() }}</div>

        <!-- Premium header band -->
        <div class="inv-band">
          <div class="ib-left">
            <div class="ib-firm">{{ data.firmName }}</div>
            @if (data.firmAddress) { <div class="ib-tag">{{ data.firmAddress }}</div> }
            @if (data.firmGst) { <div class="ib-meta">GSTIN: {{ data.firmGst }}</div> }
          </div>
          <div class="ib-right">
            <div class="ib-doctype">{{ data.title }}</div>
            <div class="ib-chip">{{ data.number }}</div>
            <div class="ib-date">Date: {{ data.date | date:'dd MMM yyyy' }}</div>
            @if (data.paymentTerms) { <div class="ib-date">Terms: {{ data.paymentTerms }}</div> }
          </div>
        </div>

        <!-- Parties grid -->
        @if (data.supplier || data.buyer) {
          <div class="parties-grid">
            @if (data.supplier; as s) {
              <div class="party-card">
                <div class="party-label">{{ data.supplierLabel || 'SUPPLIER' }}</div>
                <div class="party-name">{{ s.name }}</div>
                @if (s.gst) { <div class="party-line">GSTIN: {{ s.gst }}</div> }
                @if (s.address) { <div class="party-line">{{ s.address }}</div> }
                @if (s.mobile) { <div class="party-line">Mobile: {{ s.mobile }}</div> }
              </div>
            }
            @if (data.buyer; as b) {
              <div class="party-card party-to">
                <div class="party-label">{{ data.buyerLabel || 'BUYER' }}</div>
                <div class="party-name">{{ b.name }}</div>
                @if (b.gst) { <div class="party-line">GSTIN: {{ b.gst }}</div> }
                @if (b.address) { <div class="party-line">{{ b.address }}</div> }
                @if (b.mobile) { <div class="party-line">Mobile: {{ b.mobile }}</div> }
              </div>
            }
          </div>
        }

        <!-- Payment Receipt — simpler layout -->
        @if (data.type === 'payment') {
          <div class="pmt-block">
            <!-- Txn-wise breakup — kaise mila: cash/cheque/UPI, date ke saath -->
            @if (data.paymentTxns?.length) {
              <table class="pmt-txn-table">
                <thead>
                  <tr><th>#</th><th>MODE</th><th>BANK</th><th>CHQ/UTR NO.</th><th>DATE</th><th class="tr">AMOUNT (₹)</th></tr>
                </thead>
                <tbody>
                  @for (t of data.paymentTxns; track $index) {
                    <tr>
                      <td>{{ $index + 1 }}</td>
                      <td><strong>{{ t.mode }}</strong></td>
                      <td>{{ t.bank || '—' }}</td>
                      <td>{{ t.refNo || '—' }}</td>
                      <td>{{ t.date ? (t.date | date:'dd/MM/yy') : '—' }}</td>
                      <td class="tr"><strong>{{ t.amount | number:'1.2-2' }}</strong></td>
                    </tr>
                  }
                </tbody>
              </table>
            }
            <!-- Kat-kut detail — rate diff / discount / interest / GR (sirf jo lagi ho) -->
            @if (data.adjustments?.length) {
              @for (a of data.adjustments; track a.label) {
                <div class="pmt-row pmt-adj">
                  <span>{{ a.label }}:</span>
                  <strong [class.adj-minus]="a.amount < 0">{{ a.amount < 0 ? '−' : '+' }} ₹ {{ (a.amount < 0 ? -a.amount : a.amount) | number:'1.2-2' }}</strong>
                </div>
              }
            }
            <div class="pmt-row"><span>Amount Received:</span><strong>₹ {{ data.amount | number:'1.2-2' }}</strong></div>
            @if (!data.paymentTxns?.length && data.paymentMode) {
              <div class="pmt-row"><span>Payment Mode:</span><strong>{{ data.paymentMode }}</strong></div>
            }
            @if (data.balancePending != null) {
              <div class="pmt-row pmt-bal">
                <span>{{ data.balancePending < 0 ? 'Advance (Extra Received)' : 'Balance Pending (Bal. Payment)' }}:</span>
                <strong [class.bal-adv]="data.balancePending < 0">
                  {{ data.balancePending < 0 ? '− ₹ ' : '₹ ' }}{{ (data.balancePending < 0 ? -data.balancePending : data.balancePending) | number:'1.2-2' }}
                </strong>
              </div>
            }
            @if (data.notes) {
              <div class="pmt-row"><span>Notes:</span><strong>{{ data.notes }}</strong></div>
            }
          </div>
        }

        <!-- GR adjustments — Original Bill / Net after GR / Commission -->
        @if (data.type === 'gr' && data.adjustments?.length) {
          <div class="pmt-block">
            @for (a of data.adjustments; track a.label) {
              <div class="pmt-row pmt-adj">
                <span>{{ a.label }}:</span>
                <strong [class.adj-minus]="a.amount < 0">{{ a.amount < 0 ? '− ₹ ' : '₹ ' }}{{ (a.amount < 0 ? -a.amount : a.amount) | number:'1.2-2' }}</strong>
              </div>
            }
            @if (data.notes) {
              <div class="pmt-row"><span>Notes:</span><strong>{{ data.notes }}</strong></div>
            }
          </div>
        }

        <!-- Lines table (only if has lines) -->
        @if (data.lines.length > 0) {
          <table class="lines-table">
            <thead>
              <tr>
                <th class="t-sr">#</th>
                <th>ITEM / DESCRIPTION</th>
                <th class="t-right">QTY</th>
                <th class="t-c">UNIT</th>
                <th class="t-right">PRICE</th>
                @if (showRd()) { <th class="t-right">RD</th> }
                <th class="t-c">HSN</th>
                <th class="t-right">TAX %</th>
                <th class="t-right">TAXABLE</th>
                <th class="t-right">TAX AMT</th>
                <th class="t-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              @for (l of data.lines; track l; let i = $index) {
                <tr>
                  <td class="t-sr">{{ i + 1 }}</td>
                  <td>
                    <div class="it-name">{{ l.itemName }}</div>
                    @if (l.description) { <div class="it-desc">{{ l.description }}</div> }
                  </td>
                  <td class="t-right mono">{{ l.qty | number:'1.2-2' }}</td>
                  <td class="t-c">{{ l.unit || '—' }}</td>
                  <td class="t-right mono">{{ l.rate | number:'1.2-2' }}</td>
                  @if (showRd()) { <td class="t-right mono">{{ l.rd || 0 }}</td> }
                  <td class="t-c mono">{{ l.hsnSac || '—' }}</td>
                  <td class="t-right">{{ l.taxPct || 0 }}%</td>
                  <td class="t-right mono">{{ l.taxableAmount | number:'1.2-2' }}</td>
                  <td class="t-right mono">{{ l.taxAmount | number:'1.2-2' }}</td>
                  <td class="t-right mono"><strong>{{ l.totalAmount | number:'1.2-2' }}</strong></td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" class="t-right"><strong>TOTALS →</strong></td>
                <td class="t-right mono"><strong>{{ totalQty() | number:'1.2-2' }}</strong></td>
                <td [attr.colspan]="showRd() ? 5 : 4"></td>
                <td class="t-right mono"><strong>{{ data.taxableAmount | number:'1.2-2' }}</strong></td>
                <td class="t-right mono"><strong>{{ data.totalTax | number:'1.2-2' }}</strong></td>
                <td class="t-right mono"><strong>{{ data.grossAmount | number:'1.2-2' }}</strong></td>
              </tr>
            </tfoot>
          </table>
        }

        <!-- Summary + Total Payable -->
        @if (data.lines.length > 0) {
          <div class="inv-pay-wrap">
            <div class="inv-bank">
              <div class="bank-h">DETAILS</div>
              @if (data.supplierOrderNo) { <div class="bank-l">Supplier Order No.: <strong>{{ data.supplierOrderNo }}</strong></div> }
              @if (data.transport) { <div class="bank-l">Transporter: <strong>{{ data.transport }}</strong></div> }
              @if (data.lrNo) { <div class="bank-l">LR No.: <strong>{{ data.lrNo }}</strong></div> }
              <div class="bank-l">Total Items: <strong>{{ data.lines.length }}</strong> · Total Qty: <strong>{{ totalQty() | number:'1.2-2' }}</strong></div>
              <div class="bank-h" style="margin-top:10px;">BANK DETAILS</div>
              <div class="bank-l">Bank: <strong>ICICI Bank</strong> · A/C: XXXXXXXXXXX</div>
              <div class="bank-l">IFSC: ICIC0000XXX · Surat Branch</div>
              <div class="bank-words">In words: {{ inWords(data.netAmount) }}</div>
            </div>
            <div class="inv-pay">
              <div class="pay-row"><span>Gross Amount</span><strong>₹ {{ data.grossAmount | number:'1.2-2' }}</strong></div>
              <div class="pay-row"><span>Taxable</span><strong>₹ {{ data.taxableAmount | number:'1.2-2' }}</strong></div>
              <div class="pay-row"><span>Tax (GST)</span><strong>₹ {{ data.totalTax | number:'1.2-2' }}</strong></div>
              @if (data.cdAmount && data.cdAmount > 0) {
                <div class="pay-row"><span>CD Discount</span><strong>− ₹ {{ data.cdAmount | number:'1.2-2' }}</strong></div>
              }
              <div class="pay-total">
                <span>{{ data.type === 'gr' ? 'RETURN AMOUNT' : (data.type === 'order' ? 'NET TOTAL' : 'TOTAL PAYABLE') }}</span>
                <strong>₹ {{ data.netAmount | number:'1.2-2' }}</strong>
              </div>
              @if (data.commissionAmount != null && data.commissionAmount > 0) {
                <div class="pay-comm">
                  <span>Broker Commission &#64; {{ data.commissionPct }}%</span>
                  <strong>₹ {{ data.commissionAmount | number:'1.2-2' }}</strong>
                </div>
                <div class="pay-comm-note">Commission {{ features.firmName() || 'Anjaninex' }} ko — bill/payment par koi effect nahi.</div>
              }
            </div>
          </div>
        }

        @if (data.notes && data.type !== 'payment') {
          <div class="notes-block">
            <strong>Notes:</strong> {{ data.notes }}
          </div>
        }

        <!-- Footer -->
        <div class="inv-foot2">
          <div class="foot-terms">
            This is a computer-generated {{ data.title.toLowerCase() }} — no signature required.<br>
            {{ data.number }} · Date: {{ data.date | date:'dd MMM yyyy' }}
          </div>
          <div class="foot-sig">
            For <strong>{{ data.firmName }}</strong>
            <div class="sig-space"></div>
            Authorised Signatory
          </div>
        </div>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .ip-overlay { position:fixed; inset:0; background:rgba(27,46,92,0.6); z-index:1100;
      display:flex; align-items:flex-start; justify-content:center; padding:24px 16px; overflow:auto; }
    .ip-paper { background:#fff; max-width:900px; width:100%; border-radius:14px;
      box-shadow:0 30px 80px rgba(0,0,0,0.4); overflow:hidden; }

    .ip-toolbar { background:var(--anjaninex-navy, #1B2E5C); color:#fff; padding:14px 20px; display:flex;
      justify-content:space-between; align-items:center; }
    .tb-left { display:flex; align-items:center; gap:8px; font-size:15px; }
    .tb-icon { font-size:20px; }
    .tb-right { display:flex; gap:8px; align-items:center; }
    .tb-btn { background:#fff; color:#1B2E5C; border:0; padding:7px 14px; border-radius:6px;
      font-weight:700; font-size:12px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; }
    .tb-btn:hover { background:#FAF7F0; }
    .tb-wa { background:#10B981; color:#fff; }
    .tb-wa:hover { background:#059669; }
    .tb-close { background:transparent; color:#fff; border:0; font-size:26px; cursor:pointer;
      width:32px; height:32px; border-radius:6px; line-height:1; padding:0; margin-left:6px; }
    .tb-close:hover { background:rgba(255,255,255,0.15); }

    .invoice { padding:0 0 32px; font-family:'Inter', system-ui, sans-serif; color:#1B2E5C; background:#fff; position:relative; overflow:hidden; }
    .wm { position:absolute; top:46%; left:50%; transform:translate(-50%,-50%) rotate(-22deg);
      font-size:92px; font-weight:900; letter-spacing:8px; color:rgba(27,46,92,0.05);
      pointer-events:none; user-select:none; white-space:nowrap; z-index:0; }
    .invoice > *:not(.wm) { position:relative; z-index:1; }

    /* Premium header band */
    .inv-band { display:flex; justify-content:space-between; align-items:flex-start;
      background:linear-gradient(120deg,var(--anjaninex-navy, #1B2E5C) 0%,#2a4180 60%,#5c1a8b 100%);
      color:#fff; padding:24px 40px; }
    .ib-firm { font-size:26px; font-weight:900; letter-spacing:.3px; color:#fff; }
    .ib-tag { font-size:11.5px; color:#cdd6ec; margin-top:3px; }
    .ib-meta { font-size:10.5px; color:#aab6d6; margin-top:8px; }
    .ib-right { text-align:right; }
    .ib-doctype { font-size:11px; font-weight:800; letter-spacing:2px; color:#e9c46a; }
    .ib-chip { display:inline-block; margin-top:6px; background:#DC2626; color:#fff;
      font-weight:800; font-size:13px; padding:5px 12px; border-radius:6px; letter-spacing:.5px; }
    .ib-date { font-size:11px; color:#cdd6ec; margin-top:6px; }

    .parties-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:22px 40px 0; }
    .party-card { border:1px solid #E2E6F0; border-radius:10px; padding:14px 16px; background:#FAFBFE; }
    .party-card.party-to { border-color:#f1d9e8; background:#fcf7fb; }
    .party-label { font-size:9.5px; font-weight:800; color:#8a93ad; letter-spacing:1px; margin-bottom:6px; }
    .party-name { font-size:16px; font-weight:800; color:#1B2E5C; }
    .party-line { font-size:11.5px; color:#56607a; margin-top:2px; }

    /* Total Payable + details row */
    .inv-pay-wrap { display:flex; gap:16px; align-items:stretch; padding:18px 40px 0; }
    .inv-bank { flex:1; border:1px dashed #cfd6e6; border-radius:10px; padding:14px 16px; background:#fff; }
    .bank-h { font-size:9.5px; font-weight:800; letter-spacing:1px; color:#8a93ad; margin-bottom:6px; }
    .bank-l { font-size:11.5px; color:#56607a; margin-top:3px; }
    .bank-l strong { color:#1B2E5C; }
    .bank-words { font-size:11px; color:#065f46; font-style:italic; font-weight:600; margin-top:10px; }
    .inv-pay { width:320px; border:1px solid #E2E6F0; border-radius:10px; overflow:hidden; }
    .pay-row { display:flex; justify-content:space-between; padding:9px 16px; font-size:12.5px; color:#56607a; border-bottom:1px solid #EEF1F7; }
    .pay-row strong { color:#1B2E5C; font-family:'JetBrains Mono',monospace; }
    .pay-total { display:flex; justify-content:space-between; align-items:center; padding:13px 16px;
      background:linear-gradient(120deg,var(--anjaninex-navy, #1B2E5C),#5c1a8b); color:#fff; }
    .pay-total span { font-size:11px; font-weight:800; letter-spacing:1px; }
    .pay-total strong { font-size:19px; font-weight:900; font-family:'JetBrains Mono',monospace; }
    .pay-comm { display:flex; justify-content:space-between; padding:9px 16px; font-size:12px; background:#FFF7ED; color:#9a3412; border-top:1px dashed #fed7aa; }
    .pay-comm strong { font-family:'JetBrains Mono',monospace; }
    .pay-comm-note { padding:0 16px 10px; font-size:9.5px; color:#c2730a; background:#FFF7ED; font-style:italic; }

    .inv-foot2 { display:flex; justify-content:space-between; align-items:flex-end; padding:26px 40px 0; margin-top:18px; }
    .foot-terms { font-size:10px; color:#9aa3b8; line-height:1.6; max-width:60%; }
    .foot-sig { text-align:right; font-size:11px; color:#56607a; }
    .foot-sig strong { color:#1B2E5C; }
    .sig-space { height:44px; }

    .pmt-block { padding:14px; background:#F0FDF4; border:1px solid #86EFAC; border-radius:10px; margin:18px 40px 0; }
    .pmt-row { display:flex; justify-content:space-between; padding:5px 0; font-size:14px; }
    .pmt-row strong { color:#065F46; }
    .pmt-adj { font-size: 12.5px; color: #4A5878; }
    .pmt-adj .adj-minus { color: #B91C1C; }
    .pmt-bal { border-top: 1.5px dashed #86EFAC; margin-top: 4px; padding-top: 8px; }
    .pmt-bal strong { color:#B91C1C; }
    .pmt-bal strong.bal-adv { color:#047857; }   /* advance/extra — green minus */
    .pmt-txn-table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:12px; background:#fff; }
    .pmt-txn-table th { background:#065F46; color:#fff; padding:6px 8px; text-align:left; font-size:10px; }
    .pmt-txn-table th.tr, .pmt-txn-table td.tr { text-align:right; }
    .pmt-txn-table td { padding:6px 8px; border-bottom:1px solid #D1FAE5; }

    .lines-table { width:calc(100% - 80px); border-collapse:collapse; font-size:11px; margin:18px 40px 0; }
    .lines-table th { background:var(--anjaninex-navy, #1B2E5C); color:#fff; padding:8px 6px; text-align:left;
      font-size:10px; font-weight:700; letter-spacing:0.3px; }
    .lines-table th.t-right { text-align:right; }
    .lines-table th.t-c { text-align:center; }
    .lines-table th.t-sr { width:30px; text-align:center; }
    .lines-table td { padding:7px 6px; border-bottom:1px solid #E5E7EB; vertical-align:top; }
    .lines-table td.t-right { text-align:right; }
    .lines-table td.t-c { text-align:center; }
    .lines-table td.mono { font-family:'JetBrains Mono', monospace; }
    .lines-table tfoot { background:#FAF7F0; }
    .lines-table tfoot td { padding:8px 6px; }
    .it-name { font-weight:700; color:#1B2E5C; }
    .it-desc { font-size:10px; color:#4A5878; font-style:italic; }

    .summary-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:18px; }
    .sum-card { border:1px solid #D6DDEA; border-radius:6px; padding:12px; background:#FAF7F0; }
    .sum-head { font-size:10px; font-weight:800; color:#4A5878; letter-spacing:0.6px; margin-bottom:8px;
      padding-bottom:5px; border-bottom:1px solid #D6DDEA; }
    .sum-row { display:flex; justify-content:space-between; padding:4px 0; font-size:12px; }
    .sum-row span { color:#4A5878; }
    .sum-row strong { color:#1B2E5C; font-family:'JetBrains Mono', monospace; }
    .sum-row.sum-total { padding-top:8px; margin-top:6px; border-top:2px solid #DC2626;
      font-size:15px; font-weight:900; color:#DC2626; }
    .sum-row.sum-total span { color:#DC2626; font-weight:900; }
    .sum-row.sum-total strong { color:#DC2626; font-size:16px; }
    .text-red { color:#DC2626; }

    .notes-block { padding:10px 14px; background:#FEF3C7; border-radius:8px;
      font-size:12px; color:#92400E; margin:16px 40px 0; }

    .sig-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-top:30px;
      padding-top:30px; border-top:1px solid #D6DDEA; text-align:center; font-size:11px; color:#4A5878; }
    .sig-cell { padding-top:30px; border-top:1px solid #1B2E5C; }
    .sig-cell:nth-child(2) { color:#1B2E5C; font-weight:700; }

    .foot-note { text-align:center; font-size:10px; color:#9CA3AF; margin-top:18px;
      padding-top:12px; border-top:1px solid #E5E7EB; line-height:1.5; }

    /* PRINT CSS — clean layout when printing */
    @media print {
      body * { visibility:hidden; }
      #ipPrintArea, #ipPrintArea * { visibility:visible; }
      #ipPrintArea { position:absolute; left:0; top:0; width:100%; padding:20px; }
      .ip-overlay { background:#fff !important; padding:0; }
      .ip-paper { box-shadow:none; max-width:none; }
      .ip-toolbar { display:none !important; }
    }
  `]
})
export class InvoicePreviewComponent {
  @Input() data!: PreviewData;
  @Output() close = new EventEmitter<void>();
  features = inject(FeatureService);
  private router = inject(Router);   // Party Chat deep-link ke liye

  /** Watermark text — firm ka pehla shabd (Namokara) uppercase. */
  wmText(): string {
    return (this.data.firmName || '').split(' ')[0].toUpperCase() || 'INVOICE';
  }
  /** Amount in words (negative ho to "Minus"). */
  inWords(n: number): string {
    const v = Math.round(Math.abs(n || 0));
    if (v === 0) return 'Zero Rupees';
    return (n < 0 ? 'Minus ' : '') + amountInWords(v);
  }
  showRd(): boolean {
    return this.data.lines.some(l => (l.rd ?? 0) > 0);
  }
  totalQty(): number {
    return this.data.lines.reduce((s, l) => s + (l.qty || 0), 0);
  }
  /**
   * Print/PDF — body par .printing-doc laga kar chhapte hain (global print CSS
   * styles.css me). Pehle component-scoped CSS thi jo body par lagti hi nahi
   * thi — modal fixed me phansa rehta tha aur print KHALI aata tha.
   */
  private printDoc() {
    document.body.classList.add('printing-doc');
    const cleanup = () => document.body.classList.remove('printing-doc');
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => { window.print(); setTimeout(cleanup, 1000); }, 50);
  }
  print() { this.printDoc(); }
  savePdf() {
    // Browser's print dialog → user picks "Save as PDF" destination
    this.printDoc();
  }
  /** Kis party se baat karni hai — buyer pehle, warna supplier. */
  chatPartyId(): string | null {
    return this.data.buyer?.id || this.data.supplier?.id || null;
  }

  /** Document ki detail PARTY CHAT me bhejo (pehle WhatsApp par jata tha).
   *  Fayda: baat-cheet party ke saath app me record rehti hai — WhatsApp par
   *  bheja hua kahin nahi dikhta tha aur party ka jawab bhi gum ho jata tha.
   *  Message draft me bharta hai; bhejta user khud hai. */
  sharePartyChat() {
    const partyId = this.chatPartyId();
    if (!partyId) return;
    const msg =
      `${this.data.title}\n` +
      `No: ${this.data.number}\n` +
      `Date: ${new Date(this.data.date).toLocaleDateString('en-IN')}\n` +
      (this.data.supplier ? `Supplier: ${this.data.supplier.name}\n` : '') +
      (this.data.buyer ? `Buyer: ${this.data.buyer.name}\n` : '') +
      `Net Amount: ₹${this.data.netAmount.toFixed(2)}\n` +
      `\n— ${this.data.firmName}`;
    this.router.navigate(['/party-chat'], { queryParams: { partyId, msg } });
  }
}
