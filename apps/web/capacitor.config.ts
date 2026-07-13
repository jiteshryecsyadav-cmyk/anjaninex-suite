import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Vyapaar Setu — native Android shell (Capacitor).
 *
 * REMOTE URL MODE: app live website (trade.anjaninex.com) load karti hai —
 * matlab web deploy karte hi APK me bhi naya version aa jata hai, APK dobara
 * banane ki zaroorat sirf native changes (naya plugin/permission) par hoti hai.
 *
 * Native powers jo PWA me nahi thi:
 *  - Background location (app band ho tab bhi) — field staff tracking
 *  - Foreground service notification ("Duty par — location share ho rahi hai")
 */
const config: CapacitorConfig = {
  appId: 'com.anjaninex.vyapaarsetu',
  appName: 'Vyapaar Setu',
  webDir: 'dist/browser',
  server: {
    url: 'https://trade.anjaninex.com',
    cleartext: false
  }
};

export default config;
