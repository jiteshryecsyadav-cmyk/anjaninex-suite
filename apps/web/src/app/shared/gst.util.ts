// =============================================================================
// GSTIN checksum — 15th character pehle 14 se ganit se banta hai.
// AI scan ya typing me EK akshar bhi galat ho (F↔P, 0↔O...) to ye pakad leta
// hai. Backend (PartyService.ValidateGstChecksum) bhi yahi jaanchta hai —
// yahan frontend par isliye hai taaki user ko SCAN HOTE HI warning dikhe,
// save tak intezaar na karna pade.
// =============================================================================

const SET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** true = format + checksum dono sahi. Khaali/adhura string par false. */
export function isValidGstin(gst: string | null | undefined): boolean {
  const g = (gst || '').trim().toUpperCase();
  if (!GSTIN_REGEX.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = SET.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return SET[(36 - (sum % 36)) % 36] === g[14];
}

/**
 * 15 char ka GST jo dikhne me theek par checksum me fail — yani kahin EK akshar
 * galat hai (AI scan ki sabse aam galti). Warning dikhane ke liye.
 */
export function looksLikeTypo(gst: string | null | undefined): boolean {
  const g = (gst || '').trim().toUpperCase();
  return g.length === 15 && GSTIN_REGEX.test(g) && !isValidGstin(g);
}
