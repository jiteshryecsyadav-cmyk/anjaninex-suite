import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * GSTIN / PAN jaise field apne aap CAPITAL me.
 *
 * Kyun: GSTIN aur PAN hamesha uppercase hote hain. Log chhote akshar me type
 * kar dete the aur wahi save ho jata tha — phir GST portal se match nahi
 * hota tha aur report/matching me dikkat aati thi.
 *
 * Sirf CSS text-transform se kaam nahi chalta — wo dikhne me bada karta hai
 * par VALUE chhoti hi rehti hai. Isliye yahan asli value badalte hain
 * (ngModel aur reactive form dono me).
 *
 * Usage:  <input appUpper formControlName="gst">
 *         <input appUpper [(ngModel)]="supplierGstin">
 */
@Directive({
  selector: 'input[appUpper]',
  standalone: true
})
export class UppercaseDirective {
  private el = inject(ElementRef<HTMLInputElement>);
  private ctrl = inject(NgControl, { optional: true });

  @HostListener('input')
  onInput() {
    const input = this.el.nativeElement as HTMLInputElement;
    const upper = (input.value || '').toUpperCase();
    if (upper === input.value) return;

    // Cursor ki jagah bachao — warna beech me type karte hi cursor end par
    // chala jata hai aur naam ulta-pulta ho jata hai.
    const start = input.selectionStart;
    const end = input.selectionEnd;

    if (this.ctrl?.control) this.ctrl.control.setValue(upper, { emitEvent: false });
    input.value = upper;
    try { input.setSelectionRange(start, end); } catch { /* number/date input par nahi chalta */ }
  }

  /** Paste/autofill ke baad bhi pakka uppercase (input event miss ho sakta hai). */
  @HostListener('blur')
  onBlur() { this.onInput(); }
}
