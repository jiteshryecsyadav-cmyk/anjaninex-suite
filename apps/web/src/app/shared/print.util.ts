// =============================================================================
// printElement — sirf DIYA HUA element chhapo, poora page nahi.
//
// Ek nayi khali window me sirf invoice ka HTML + page ki SAARI styles daal kar
// wahan se print. Angular apni component styles do jagah rakhta hai:
//   1. <style> tags <head> me  → document.head.innerHTML se aate hain
//   2. adoptedStyleSheets       → innerHTML me NAHI aate (isliye print khali
//      aata tha) — inhe alag se serialize karke <style> me daalte hain.
// =============================================================================

function collectAllCss(): string {
  let css = '';
  // adoptedStyleSheets (Angular ki component styles yahan hoti hain)
  const sheets = (document as any).adoptedStyleSheets as CSSStyleSheet[] | undefined;
  if (sheets) {
    for (const sheet of sheets) {
      try {
        for (const rule of Array.from(sheet.cssRules)) css += rule.cssText + '\n';
      } catch { /* cross-origin — skip */ }
    }
  }
  // <style> ya <link> se aayi stylesheets bhi (jinke rules padh sakein)
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) css += rule.cssText + '\n';
    } catch { /* cross-origin (fonts CDN etc) — skip */ }
  }
  return css;
}

export function printElement(el: HTMLElement | null): void {
  if (!el) { window.print(); return; }

  const w = window.open('', '_blank', 'width=900,height=1200');
  if (!w) { window.print(); return; }   // popup block — purane tareeke par giro

  const css = collectAllCss();
  w.document.write(
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>' + css + '</style>' +
    '<style>@page{margin:12mm} body{background:#fff;margin:0;padding:16px;' +
    '-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>' +
    '</head><body>' + el.outerHTML + '</body></html>');
  w.document.close();
  w.focus();

  // Styles/fonts settle hone ka chhota intezaar, phir print aur band.
  setTimeout(() => {
    try { w.print(); } catch {}
    setTimeout(() => { try { w.close(); } catch {} }, 400);
  }, 400);
}
