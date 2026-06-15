import { Component, EventEmitter, Output, HostListener } from '@angular/core';

/**
 * Simple, reliable calculator panel — opened from the sidebar (every user, every page).
 * No eval(): a small operand/operator state machine. Keyboard supported.
 * Theme-aware header (var(--anjaninex-navy)).
 */
@Component({
  selector: 'app-calculator',
  standalone: true,
  template: `
    <div class="calc-backdrop" (click)="close()"></div>
    <div class="calc" (click)="$event.stopPropagation()">
      <div class="calc-head">
        <span>🧮 Calculator</span>
        <button class="calc-x" (click)="close()" title="Close">×</button>
      </div>
      <div class="calc-expr">{{ expr || ' ' }}</div>
      <div class="calc-disp" [title]="display">{{ display }}</div>
      <div class="calc-grid">
        <button class="k fn" (click)="clearAll()">C</button>
        <button class="k fn" (click)="back()">⌫</button>
        <button class="k fn" (click)="percent()">%</button>
        <button class="k op" (click)="setOp('/')">÷</button>

        <button class="k" (click)="num('7')">7</button>
        <button class="k" (click)="num('8')">8</button>
        <button class="k" (click)="num('9')">9</button>
        <button class="k op" (click)="setOp('*')">×</button>

        <button class="k" (click)="num('4')">4</button>
        <button class="k" (click)="num('5')">5</button>
        <button class="k" (click)="num('6')">6</button>
        <button class="k op" (click)="setOp('-')">−</button>

        <button class="k" (click)="num('1')">1</button>
        <button class="k" (click)="num('2')">2</button>
        <button class="k" (click)="num('3')">3</button>
        <button class="k op" (click)="setOp('+')">+</button>

        <button class="k" (click)="toggleSign()">±</button>
        <button class="k" (click)="num('0')">0</button>
        <button class="k" (click)="dot()">.</button>
        <button class="k eq" (click)="equals()">=</button>
      </div>
      <div class="calc-hint">Keyboard chalu hai · Esc = band</div>
    </div>
  `,
  styles: [`
    .calc-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 1200; }
    .calc {
      position: fixed; z-index: 1201; left: 50%; top: 50%; transform: translate(-50%,-50%);
      width: 290px; background: #fff; border-radius: 16px; overflow: hidden;
      box-shadow: 0 18px 50px rgba(0,0,0,.35); font-family: system-ui, sans-serif;
    }
    .calc-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; background: var(--anjaninex-navy, #1B2E5C); color: #fff; font-weight: 800;
    }
    .calc-x { background: transparent; border: 0; color: #fff; font-size: 22px; line-height: 1; cursor: pointer; }
    .calc-expr { padding: 6px 14px 0; text-align: right; color: #9aa3b2; font-size: 13px; min-height: 18px; }
    .calc-disp {
      padding: 0 14px 8px; text-align: right; font-size: 32px; font-weight: 800; color: #111827;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .calc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 10px 12px 4px; }
    .k {
      border: 0; border-radius: 12px; padding: 14px 0; font-size: 18px; font-weight: 700;
      background: #f1f3f7; color: #1f2937; cursor: pointer; transition: filter .12s, transform .05s;
    }
    .k:hover { filter: brightness(.95); }
    .k:active { transform: scale(.96); }
    .k.op { background: #e6ecff; color: var(--anjaninex-navy, #1B2E5C); }
    .k.fn { background: #ffe9e9; color: #b91c1c; }
    .k.eq { background: var(--anjaninex-navy, #1B2E5C); color: #fff; }
    .calc-hint { text-align: center; font-size: 10px; color: #9aa3b2; padding: 4px 0 10px; }
  `]
})
export class CalculatorComponent {
  @Output() closed = new EventEmitter<void>();

  display = '0';
  expr = '';
  private prev: number | null = null;
  private op: string | null = null;
  private fresh = true;   // next digit starts a new number

  close() { this.closed.emit(); }

  num(d: string) {
    if (this.fresh) { this.display = d === '.' ? '0.' : d; this.fresh = false; }
    else if (this.display.length < 15) this.display = this.display === '0' ? d : this.display + d;
  }
  dot() { if (this.fresh) { this.display = '0.'; this.fresh = false; } else if (!this.display.includes('.')) this.display += '.'; }

  toggleSign() {
    if (this.display === '0') return;
    this.display = this.display.startsWith('-') ? this.display.slice(1) : '-' + this.display;
  }

  percent() {
    const v = parseFloat(this.display) || 0;
    // X op Y% → Y% of X (common calculator behaviour); standalone → /100
    if (this.prev !== null && this.op) this.display = this.fmt(this.prev * v / 100);
    else this.display = this.fmt(v / 100);
    this.fresh = true;
  }

  setOp(o: string) {
    const cur = parseFloat(this.display) || 0;
    if (this.prev !== null && this.op && !this.fresh) {
      const r = this.compute(this.prev, cur, this.op);
      this.display = this.fmt(r);
      this.prev = r;
    } else {
      this.prev = cur;
    }
    this.op = o;
    this.expr = `${this.fmt(this.prev)} ${this.sym(o)}`;
    this.fresh = true;
  }

  equals() {
    if (this.prev === null || !this.op) return;
    const cur = parseFloat(this.display) || 0;
    const r = this.compute(this.prev, cur, this.op);
    this.expr = `${this.fmt(this.prev)} ${this.sym(this.op)} ${this.fmt(cur)} =`;
    this.display = this.fmt(r);
    this.prev = null; this.op = null; this.fresh = true;
  }

  clearAll() { this.display = '0'; this.expr = ''; this.prev = null; this.op = null; this.fresh = true; }
  back() {
    if (this.fresh) return;
    this.display = this.display.length > 1 ? this.display.slice(0, -1) : '0';
    if (this.display === '-' || this.display === '') this.display = '0';
  }

  private compute(a: number, b: number, o: string): number {
    switch (o) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? NaN : a / b;
      default: return b;
    }
  }
  private sym(o: string) { return o === '*' ? '×' : o === '/' ? '÷' : o === '-' ? '−' : '+'; }
  private fmt(n: number): string {
    if (!isFinite(n)) return 'Error';
    const r = Math.round((n + Number.EPSILON) * 1e8) / 1e8;
    return String(r);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const k = e.key;
    if (k >= '0' && k <= '9') { this.num(k); e.preventDefault(); }
    else if (k === '.') { this.dot(); e.preventDefault(); }
    else if (k === '+' || k === '-' || k === '*' || k === '/') { this.setOp(k); e.preventDefault(); }
    else if (k === 'Enter' || k === '=') { this.equals(); e.preventDefault(); }
    else if (k === 'Backspace') { this.back(); e.preventDefault(); }
    else if (k === 'Escape') { this.close(); }
    else if (k === '%') { this.percent(); e.preventDefault(); }
    else if (k === 'c' || k === 'C') { this.clearAll(); }
  }
}
