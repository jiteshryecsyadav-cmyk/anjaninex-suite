/**
 * LOCAL date helpers — toISOString() UTC deta hai, jisse IST me raat
 * 12:00–5:30 ke beech PICHLI date aa jati thi. Hamesha ye use karo.
 */

/** Aaj ki LOCAL date — YYYY-MM-DD */
export function todayLocal(): string {
  return toLocalYmd(new Date());
}

/** Kisi bhi Date ko LOCAL YYYY-MM-DD me convert karo (UTC shift ke bina) */
export function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
