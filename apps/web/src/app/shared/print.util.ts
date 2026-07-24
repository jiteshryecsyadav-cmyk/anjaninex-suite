// =============================================================================
// PRINT — bilkul naya, akela tareeka (purane visibility/class/shift sab DELETE).
//
// Invoice ka HTML ek chhupe IFRAME ke apne document me jata hai — us document
// me SIRF invoice hai, page ka koi hissa nahi. Isliye:
//   • form ghul nahi sakta (wahan hai hi nahi)
//   • blank nahi aa sakta (content seedha likha jata hai)
//   • popup-blocker ka lafda nahi (iframe kabhi block nahi hota)
// Styling: page ki saari CSS serialize karke iframe me daal dete hain —
// Angular ke scoped attributes markup ke saath jaate hain, isliye rang-roop
// waisa ka waisa. CSS na bhi mile to content phir bhi chhapta hai (kabhi khali nahi).
// =============================================================================

function collectAllCss(): string {
  let css = '';
  const grab = (sheet: CSSStyleSheet) => {
    try { for (const r of Array.from(sheet.cssRules)) css += r.cssText + '\n'; } catch {}
  };
  const adopted = (document as any).adoptedStyleSheets as CSSStyleSheet[] | undefined;
  if (adopted) for (const s of adopted) grab(s);
  for (const s of Array.from(document.styleSheets)) grab(s as CSSStyleSheet);
  return css;
}

/** El (invoice paper) ko apne alag document me print karo. */
export function printElement(el: HTMLElement | null): void {
  if (!el) { window.print(); return; }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  // ZAROORI: 0x0 iframe ka layout Chrome kabhi-kabhi skip kar deta hai → BLANK
  // print. Isliye ASLI A4 size (794x1123px @96dpi), screen ke bahar + opacity:0
  // se chhupa — layout/paint hota hai, dikhta nahi.
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;' +
    'opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>Invoice</title>' +
    '<style>' + collectAllCss() + '</style>' +
    '<style>@page{margin:10mm} html,body{background:#fff !important;margin:0;padding:0}' +
    'body>*{position:static !important;max-height:none !important;overflow:visible !important;' +
    'box-shadow:none !important;max-width:100% !important;width:100% !important}' +
    '*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}</style>' +
    '</head><body>' + el.outerHTML + '</body></html>');
  doc.close();

  const win = iframe.contentWindow!;
  const cleanup = () => { try { iframe.remove(); } catch {} };
  win.onafterprint = () => setTimeout(cleanup, 500);
  // Layout + CSS/fonts settle hone do (do frame), phir IFRAME ka print
  setTimeout(() => {
    try {
      (doc.body as HTMLElement).getBoundingClientRect();   // layout force
      win.focus(); win.print();
    } catch { cleanup(); }
    setTimeout(cleanup, 60000);   // safety — dialog bahut der khula rahe to bhi hat jaye
  }, 400);
}
