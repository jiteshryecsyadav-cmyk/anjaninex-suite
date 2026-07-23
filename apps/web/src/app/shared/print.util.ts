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
  if (!on) { document.body.classList.remove('printing-doc'); return; }

  // Overlay ko app-root se nikaal kar seedha body me — Angular ki bindings/
  // events node ke saath chalti hain, jagah se matlab nahi.
  if (host && host.parentElement !== document.body) {
    try { document.body.appendChild(host); } catch { /* niche verify hoga */ }
  }
  // SAFETY: class (jo app ko chhupati hai) SIRF tab lage jab invoice sach me
  // body me pahunch chuka ho — warna print BLANK aata hai (app ke saath invoice
  // bhi chhup jata). Shift fail ho to class OFF: poora page chhapega (bura,
  // par blank se lakh guna behtar).
  const shifted = !!host && host.parentElement === document.body;
  document.body.classList.toggle('printing-doc', shifted);
}

/**
 * Print button — print-root mark + shift DOBARA pakka karke print dialog.
 * hostSelector: overlay jo body me hona chahiye ('.ip-overlay' ya '#cgPrintHost').
 */
export function printElement(el: HTMLElement | null, hostSelector?: string): void {
  if (el) el.setAttribute('data-print-root', '');
  if (hostSelector) {
    setPrintTarget(true, document.querySelector<HTMLElement>(hostSelector));
  }
  window.print();
}
