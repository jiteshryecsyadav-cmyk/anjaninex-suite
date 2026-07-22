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

// OCR ke jaani-maani jhagde — kaun sa akshar kis jaisa dikhta hai.
// (Q↔O, I↔1 user ke asli bills me pakde gaye the.)
const LOOKALIKES: Record<string, string[]> = {
  '0': ['O', 'Q', 'D'], O: ['0', 'Q', 'D'], Q: ['O', '0'], D: ['0', 'O'],
  '1': ['I', 'L', 'T'], I: ['1', 'L', 'T'], L: ['1', 'I'], T: ['1', 'I'],
  '5': ['S'], S: ['5'], '8': ['B'], B: ['8'],
  '2': ['Z'], Z: ['2', '7'], '7': ['Z', '1'],
  '6': ['G'], G: ['6'], U: ['V'], V: ['U'],
  F: ['P', 'E'], P: ['F', 'R'], R: ['P'], E: ['F'],
};

// GSTIN ka dhancha: 2 ank (state) + PAN(5 akshar, 4 ank, 1 akshar) + 1 + 'Z' + checksum
const MUST_DIGIT = new Set([0, 1, 7, 8, 9, 10]);
const MUST_ALPHA = new Set([2, 3, 4, 5, 6, 11]);
const TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', T: '1', S: '5', B: '8', Z: '2', G: '6' };
const TO_ALPHA: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G', '7': 'Z' };

/**
 * Scan ka GST khud sudharne ki koshish:
 *  1. Position ke hisaab se — jahan ank hona chahiye wahan O/I/S aaye to 0/1/5 karo (aur ulta)
 *  2. 14th char hamesha 'Z' hota hai
 *  3. Phir bhi checksum fail? Har position par lookalike badal kar dekho —
 *     jis EK badlav se checksum pass ho, wahi sahi tha (Q↔O, I↔1 waghairah)
 * Sirf tab lautata hai jab jawab EK hi nikle — andaza kabhi nahi.
 */
export function autoCorrectGstin(raw: string | null | undefined): string | null {
  let g = (raw || '').trim().toUpperCase().replace(/\s/g, '');
  if (g.length !== 15) return null;

  const chars = g.split('');
  for (let i = 0; i < 15; i++) {
    if (MUST_DIGIT.has(i) && /[A-Z]/.test(chars[i]) && TO_DIGIT[chars[i]]) chars[i] = TO_DIGIT[chars[i]];
    if (MUST_ALPHA.has(i) && /[0-9]/.test(chars[i]) && TO_ALPHA[chars[i]]) chars[i] = TO_ALPHA[chars[i]];
  }
  if (chars[13] !== 'Z' && (chars[13] === '2' || chars[13] === '7')) chars[13] = 'Z';
  g = chars.join('');
  if (isValidGstin(g)) return g;

  // Ek-akshar lookalike search — checksum hi judge hai
  const found = new Set<string>();
  for (let i = 0; i < 15; i++) {
    for (const alt of LOOKALIKES[g[i]] || []) {
      if (MUST_DIGIT.has(i) && !/[0-9]/.test(alt)) continue;
      if (MUST_ALPHA.has(i) && !/[A-Z]/.test(alt)) continue;
      const candidate = g.slice(0, i) + alt + g.slice(i + 1);
      if (isValidGstin(candidate)) found.add(candidate);
    }
  }
  return found.size === 1 ? [...found][0] : null;
}
