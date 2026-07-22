import { computeAllocations } from './receipt-alloc.util';

// =============================================================================
// ₹407 wale bug ka pehredaar — HO-R2 ka ASLI case:
//   Bill U-70949: total 20,318 · DIS 387 + PACKING 20 kata · NET 19,911 aaya.
//   Pehle 407 bill par hamesha "pending" atka rehta tha. Ab deduction ban kar
//   settle hota hai. Koi ye niyam chheda to ye tests laal ho jayenge.
// =============================================================================
describe('computeAllocations — receipt ka batwara', () => {
  const ho_r2 = { billId: 'b1', billNo: 'U-70949', pending: 20318, toPay: 19911 };

  it('pura NET aaya → cash 19911 + kata hua 407 dono bill se nikle', () => {
    const [a] = computeAllocations([ho_r2], 19911);
    expect(a.allocated).toBe(19911);
    expect(a.deduction).toBe(407);          // 387 DIS + 20 PACKING
    expect(a.allocated + a.deduction).toBe(20318);   // bill PURA settle
  });

  it('aadha paisa aaya → deduction 0 (discount tabhi jab pura settle ho)', () => {
    const [a] = computeAllocations([ho_r2], 10000);
    expect(a.allocated).toBe(10000);
    expect(a.deduction).toBe(0);
  });

  it('zyada paisa aaya → bill par sirf NET jitna lage, baaki advance rahe', () => {
    const [a] = computeAllocations([ho_r2], 25000);
    expect(a.allocated).toBe(19911);        // 25000 nahi!
    expect(a.deduction).toBe(407);
  });

  it('do bills, paisa pehle ke liye pura + doosre ke liye aadha (FIFO)', () => {
    const b2 = { billId: 'b2', billNo: 'X-1', pending: 5000, toPay: 4900 };
    const out = computeAllocations([ho_r2, b2], 19911 + 2000);
    expect(out[0].allocated).toBe(19911);
    expect(out[0].deduction).toBe(407);     // pehla pura → kata hua bhi settle
    expect(out[1].allocated).toBe(2000);
    expect(out[1].deduction).toBe(0);       // doosra aadha → abhi koi kat-kut nahi
  });

  it('paisa hi nahi aaya → koi allocation nahi', () => {
    expect(computeAllocations([ho_r2], 0)).toEqual([]);
  });

  it('kat-kut nahi hai (toPay = pending) → deduction 0', () => {
    const plain = { billId: 'b3', billNo: 'P-1', pending: 1000, toPay: 1000 };
    const [a] = computeAllocations([plain], 1000);
    expect(a.allocated).toBe(1000);
    expect(a.deduction).toBe(0);
  });

  it('paise-wala rounding: 0.01 tak ka farak bhi "pura" maana jaye', () => {
    const b = { billId: 'b4', billNo: 'R-1', pending: 100.5, toPay: 100.0 };
    const [a] = computeAllocations([b], 99.995);
    expect(a.deduction).toBe(0.5);          // owed−0.01 tolerance ke andar
  });
});
