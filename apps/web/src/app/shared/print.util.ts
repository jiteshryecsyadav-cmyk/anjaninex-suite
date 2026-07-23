// =============================================================================
// Print helpers — sirf invoice chhape, poora page KABHI nahi.
//
// AAKHRI (structural) tareeka — visibility-tricks teen baar dhokha de chuke:
//   1. Preview khulte hi uska overlay-element BODY me shift ho jata hai
//      (app-root ke BAHAR). Screen par farak nahi (overlay fixed hai).
//   2. body par 'printing-doc' class lagti hai.
//   3. @media print (styles.css): app-root { display:none } — poora app band
//      dabbe me. Sirf body-level overlay (invoice) bachta hai = wahi chhapta hai.
//      display:none ke andar se KUCH BHI leak nahi ho sakta — ye CSS ki guarantee hai.
//   4. Modal band/destroy → Angular node ko body se khud hata deta hai; class off.
// =============================================================================

/**
 * Preview modal khulne par: on=true + uska host element do (body me shift hoga).
 * Band hone par: on=false (element Angular khud hata deta hai).
 */
export function setPrintTarget(on: boolean, host?: HTMLElement | null): void {
  document.body.classList.toggle('printing-doc', on);
  if (on && host && host.parentElement !== document.body) {
    // Overlay ko app-root se nikaal kar seedha body me — Angular ki bindings/
    // events node ke saath chalti hain, jagah se matlab nahi.
    document.body.appendChild(host);
  }
}

/** Print button — element ko print-root mark karke seedha print dialog. */
export function printElement(el: HTMLElement | null): void {
  if (el) el.setAttribute('data-print-root', '');
  window.print();
}
