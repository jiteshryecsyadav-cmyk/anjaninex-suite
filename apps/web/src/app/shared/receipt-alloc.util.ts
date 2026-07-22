// =============================================================================
// RECEIPT ALLOCATION — paisa bills par kaise batega + kitna "kata hua" settle hoga
//
// Ye wahi hisaab hai jisme ₹407 wala bug tha (DIS 387 + PACKING 20 bill par
// hamesha "pending" atka rehta tha). Ab pure function hai taaki tests pehredaari
// karein — koi is logic ko chheda to test laal ho jayega, production nahi.
// =============================================================================

export interface AllocBill {
  billId: string;
  billNo: string;
  /** bill par abhi kitna baki hai (Total − PaidAmount) */
  pending: number;
  /** kat-kut (DIS/PACKING/RATE DIFF...) ke BAAD party ko dena kitna hai */
  toPay: number;
}

export interface Allocation {
  billId: string;
  billNo: string;
  /** cash jo aaya aur is bill par laga */
  allocated: number;
  /** discount/packing jo KATA — cash nahi aaya par bill se settle hua */
  deduction: number;
}

/**
 * Received amount ko selected bills par (upar se neeche, FIFO) baanto.
 *
 * Niyam:
 *  - Har bill par utna hi lagta hai jitna us par DENA hai (toPay) — zyada nahi.
 *  - Pura NET bhar gaya to bacha hua (pending − toPay = discount/packing/...)
 *    DEDUCTION ban kar bill se nikal jata hai — wo paisa kabhi aayega nahi.
 *  - Aadha paisa aaya ho to deduction 0 — discount tabhi jab bill pura settle ho.
 */
export function computeAllocations(bills: AllocBill[], totalReceived: number): Allocation[] {
  let remaining = totalReceived;
  return bills
    .map(b => {
      const owed = Math.min(b.pending, b.toPay || b.pending);
      const a = Math.min(owed, Math.max(0, remaining));
      remaining -= a;
      const ded = a >= owed - 0.01 ? Math.max(0, b.pending - owed) : 0;
      return { billId: b.billId, billNo: b.billNo, allocated: +a.toFixed(2), deduction: +ded.toFixed(2) };
    })
    .filter(a => a.allocated > 0);
}
