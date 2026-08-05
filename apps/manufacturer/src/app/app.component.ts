import { HostListener, ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'mfg-root',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`
})
export class AppComponent {

  /**
   * F7 = browser ka "caret browsing". Galti se dab jaye to saade text par
   * blinking cursor aa jata hai aur app toota hua lagta hai — aadmi ko lagta
   * hai wo kuch badal raha hai.
   *
   * Ye ek business app hai, koi padhne wali website nahi. Jisko sach me
   * caret browsing chahiye wo browser ki Settings se chalu kar sakta hai —
   * hum sirf galti se dabne wali key rok rahe hain.
   */
  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'F7') e.preventDefault();
  }
}
