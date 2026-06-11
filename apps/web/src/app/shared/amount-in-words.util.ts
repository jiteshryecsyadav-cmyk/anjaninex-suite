/**
 * Indian number-to-words (Lakhs / Crores style).
 * Examples:
 *   200000   → "Two Lakh Rupees Only"
 *   1500     → "One Thousand Five Hundred Rupees Only"
 *   12345678 → "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees Only"
 *
 * Used across Party Quick Add (credit limit), Order/Bill totals, Payment received, Commission grand total.
 */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigit(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}

function threeDigit(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let out = '';
  if (h) out += ONES[h] + ' Hundred';
  if (r) out += (out ? ' ' : '') + twoDigit(r);
  return out;
}

/**
 * Convert a number into Indian-style amount words.
 * Handles paise too: e.g. 1500.50 → "One Thousand Five Hundred Rupees and Fifty Paise Only"
 */
export function amountInWords(num: number | string | null | undefined): string {
  const value = Number(num);
  if (!value || isNaN(value) || value <= 0) return '';
  if (value >= 1_000_000_000_000) return 'Amount too large';

  const rupees = Math.floor(value);
  const paise  = Math.round((value - rupees) * 100);

  const crore    = Math.floor(rupees / 10_000_000);
  const lakh     = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1_000);
  const rest     = rupees % 1_000;

  const parts: string[] = [];
  if (crore)    parts.push(twoDigit(crore) + ' Crore');
  if (lakh)     parts.push(twoDigit(lakh) + ' Lakh');
  if (thousand) parts.push(twoDigit(thousand) + ' Thousand');
  if (rest)     parts.push(threeDigit(rest));

  let result = parts.join(' ') + ' Rupees';
  if (paise > 0) {
    result += ' and ' + twoDigit(paise) + ' Paise';
  }
  return result + ' Only';
}
