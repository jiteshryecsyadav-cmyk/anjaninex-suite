/**
 * Date input (`<input type="date">`) ke liye YYYY-MM-DD.
 *
 * ⚠️ `toISOString()` KABHI mat use karna — wo UTC deta hai. India UTC se
 * saade paanch ghante aage hai, isliye raat 12:00 se 5:30 ke beech wo ek din
 * PEECHE ka date deta hai. Munshi raat ko bill banaye to usme kal ki tareekh
 * bhar jati thi — aur server (jo Asia/Kolkata dekhta hai) kuch aur samajhta.
 * Mahine ki pehli tareekh to aur bura: 1 August ki jagah 31 July aata tha.
 *
 * Yahan browser ke apne (local) din-mahine-saal lete hain — Indian user ke
 * liye wahi IST hai.
 */
export function toDateInput(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Aaj — jaisa user ki ghadi kehti hai. */
export function todayStr(): string {
  return toDateInput(new Date());
}

/** Is mahine ki pehli tareekh. */
export function monthStartStr(): string {
  const d = new Date();
  return toDateInput(new Date(d.getFullYear(), d.getMonth(), 1));
}
