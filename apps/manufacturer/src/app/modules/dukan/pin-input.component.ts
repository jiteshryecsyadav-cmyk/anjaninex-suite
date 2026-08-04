import { Component, ElementRef, EventEmitter, Output, ViewChildren, QueryList } from '@angular/core';

@Component({
  selector: 'app-pin-input',
  standalone: true,
  template: `
  <div class="pin-row">
    @for (i of idx; track i) {
      <input #box class="pin-box" type="password" inputmode="numeric" maxlength="1" autocomplete="off"
             (input)="onInput($event, i)" (keydown)="onKey($event, i)" (paste)="onPaste($event)">
    }
  </div>
  `,
})
export class PinInputComponent {
  @Output() valueChange = new EventEmitter<string>();
  idx = [0, 1, 2, 3, 4, 5];
  @ViewChildren('box') boxes!: QueryList<ElementRef<HTMLInputElement>>;

  private arr() { return this.boxes.toArray().map(b => b.nativeElement); }
  private emit() { this.valueChange.emit(this.arr().map(el => el.value).join('')); }

  onInput(e: Event, i: number) {
    const el = e.target as HTMLInputElement;
    el.value = el.value.replace(/\D/g, '').slice(0, 1);
    if (el.value && i < this.idx.length - 1) this.arr()[i + 1].focus();
    this.emit();
  }

  onKey(e: KeyboardEvent, i: number) {
    const els = this.arr();
    if (e.key === 'Backspace' && !els[i].value && i > 0) { els[i - 1].focus(); }
    else if (e.key === 'ArrowLeft' && i > 0) els[i - 1].focus();
    else if (e.key === 'ArrowRight' && i < this.idx.length - 1) els[i + 1].focus();
  }

  onPaste(e: ClipboardEvent) {
    e.preventDefault();
    const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6).split('');
    const els = this.arr();
    els.forEach((el, k) => el.value = digits[k] ?? '');
    els[Math.min(digits.length, 5)].focus();
    this.emit();
  }

  clear() { this.arr().forEach(el => el.value = ''); this.arr()[0]?.focus(); this.emit(); }
}
