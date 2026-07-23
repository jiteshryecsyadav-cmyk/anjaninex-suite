// =============================================================================
// printElement — sirf DIYA HUA element chhapo, poora page nahi.
//
// Pehle window.print() + CSS-visibility se kaam chalate the; par modal
// position:fixed/scroll me phansa rehta tha aur kabhi khali page, kabhi
// PEECHE ka form chhap jata tha. Ab pakka tareeqa: ek nayi khali window me
// sirf invoice ka HTML + page ki saari styles daal kar wahan se print.
// Styles head se copy hoti hain (Angular ke scoped attributes outerHTML me
// saath aate hain, isliye design waisa ka waisa chhapta hai).
// =============================================================================

export function printElement(el: HTMLElement | null): void {
  if (!el) { window.print(); return; }

  const w = window.open('', '_blank', 'width=900,height=1200');
  if (!w) {
    // Popup block ho gaya — purane tareeke par giro (kuch to chhape)
    window.print();
    return;
  }

  // document.head me styles + <link> hote hain; Angular ke <script> body me
  // hote hain isliye app popup me boot NAHI hota.
  w.document.write(
    '<!doctype html><html><head><meta charset="utf-8">' + document.head.innerHTML +
    '</head><body style="background:#fff;margin:0;padding:16px">' + el.outerHTML +
    '</body></html>');
  w.document.close();
  w.focus();

  // Styles/fonts load hone ka chhota sa intezaar, phir print aur band.
  setTimeout(() => {
    try { w.print(); } catch { /* user ne pehle hi band kar diya */ }
    setTimeout(() => { try { w.close(); } catch {} }, 400);
  }, 350);
}
