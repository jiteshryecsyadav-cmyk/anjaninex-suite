import { isValidGstin, looksLikeTypo, autoCorrectGstin } from './gst.util';

// =============================================================================
// GST auto-correct ke pehredaar — Riddhi ke ASLI scan-galtiyon par:
// scan ne 09AWPPM0622D1ZN (Khattri) me P→F, 0→O, 1→I jaise akshar galat padhe the.
// =============================================================================
describe('gst.util — checksum + OCR auto-correct', () => {
  const REAL = '09AWPPM0622D1ZN';   // Khattri Balkrishna — asli, checksum-valid

  it('sahi GST ko valid maane', () => {
    expect(isValidGstin(REAL)).toBeTrue();
    expect(isValidGstin('24AMAPV5715B1ZD')).toBeTrue();   // K.S. Textiles (verified)
  });

  it('ek akshar galat ho to typo pakde', () => {
    expect(looksLikeTypo('09AWFPM0622D1ZN')).toBeTrue();  // P ko F padha (asli case)
    expect(looksLikeTypo(REAL)).toBeFalse();
  });

  it('P→F wali scan galti khud sudhre (asli case)', () => {
    expect(autoCorrectGstin('09AWFPM0622D1ZN')).toBe(REAL);
  });

  it('O→0 position se sudhre (state code me letter nahi ho sakta)', () => {
    expect(autoCorrectGstin('O9AWPPM0622D1ZN')).toBe(REAL);
  });

  it('1→I wali galti checksum se sudhre', () => {
    expect(autoCorrectGstin('09AWPPM0622DIZN')).toBe(REAL);   // entity "1" ko I padha
  });

  it('sahi GST ko chhede nahi', () => {
    expect(autoCorrectGstin(REAL)).toBe(REAL);
  });

  it('jawab pakka na ho to andaza NA lagaye (null)', () => {
    // 2 akshar galat — single-swap se theek nahi ho sakta
    expect(autoCorrectGstin('09AWFFM0622D1ZN')).toBeNull();
  });
});
