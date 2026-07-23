// =============================================================================
// Print helpers — sirf invoice chhape, poora page kabhi nahi.
//
// Kaam global CSS karti hai (styles.css): body.printing-doc hone par sab
// hidden, sirf [data-print-root] dikhta hai.
//
// SEEKH: class ko print() ke waqt timer se lagana-hatana GALAT tha — Chrome
// ka print-preview baad me DOBARA render hota hai (Destination/settings
// badalne par), tab tak class hat chuki hoti thi aur peeche ka form invoice
// me ghul kar chhap jata tha. Isliye ab class PREVIEW MODAL ke poore jeevan
// bhar rehti hai: modal khula = class lagi; modal band = class hati.
// =============================================================================

/** Preview modal khulte hi on karo, band hote hi off — component lifecycle se. */
export function setPrintTarget(on: boolean): void {
  document.body.classList.toggle('printing-doc', on);
}

/** Print button — element ko print-root mark karke seedha print dialog. */
export function printElement(el: HTMLElement | null): void {
  if (el) el.setAttribute('data-print-root', '');
  window.print();
}
