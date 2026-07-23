// =============================================================================
// printElement — sirf DIYA HUA element chhapo, poora page nahi.
//
// Nayi-window / iframe wale tareeke bharose ke laayak nahi the (Angular ki
// component styles adoptedStyleSheets me hoti hain, dusri window me nahi
// jaatin → print khali). Isliye ISI page me chhapte hain jahan styles pehle
// se lagi hain — body par `printing-doc` class + element par `data-print-root`.
// @media print (styles.css) me: sab kuch hidden, sirf print-root dikhta hai.
// visibility (display nahi) isliye ki nested-visible child parent ke hidden
// ko override kar deta hai — modal fixed/overflow me bhi invoice chhap jata hai.
// =============================================================================

export function printElement(el: HTMLElement | null): void {
  if (!el) { window.print(); return; }
  el.setAttribute('data-print-root', '');

  document.body.classList.add('printing-doc');
  const cleanup = () => document.body.classList.remove('printing-doc');
  window.addEventListener('afterprint', cleanup, { once: true });

  // thoda ruk kar (class lagne do), print; safety cleanup agar afterprint na chale
  setTimeout(() => {
    try { window.print(); } catch {}
    setTimeout(cleanup, 1500);
  }, 80);
}
