import { Injectable, inject } from '@angular/core';
import { HrService } from './hr.service';

/**
 * 📡 CHECK-IN ke baad live tracking APNE AAP.
 * Staff check-in kare → jab tak checkout nahi hota (aur app/tab khula hai),
 * har ~45 sec me location ping jati hai → malik ke Live Map par chalta-firta
 * marker banta hai. Checkout hote hi band.
 *
 * Seema (browser ka niyam): tab/app band ya screen lock ho to browser
 * location dena rok deta hai — poora background-tracking sirf native app
 * (Capacitor + background-geolocation) me hota hai. App khula ho tab ke liye
 * ye kaafi hai.
 */
@Injectable({ providedIn: 'root' })
export class LiveTrackService {
  private svc = inject(HrService);
  private watchId: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last: { lat: number; lng: number; acc: number | null } | null = null;
  private sentPos: { lat: number; lng: number } | null = null;   // aakhri BHEJI hui jagah
  private lastSentAt = 0;

  get running() { return this.timer !== null; }

  /** Check-in page kholte / check-in karte hi bulao — checked-in ho to shuru. */
  start() {
    if (this.running || !navigator.geolocation) return;

    // watchPosition: GPS khud taaza position deta rehta hai (battery-friendly)
    this.watchId = navigator.geolocation.watchPosition(
      p => {
        this.last = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? null };
        this.maybeSendOnMove();
      },
      () => {},   // deny/timeout par chup — check-in flow apna error khud dikhata hai
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );

    // 💓 DHADKAN — khada ho ya chal raha ho, har 45 sec me ek point zaroor
    // (isse "wo waqt kahan tha" ka record kabhi tootta nahi)
    this.timer = setInterval(() => this.send(), 45_000);

    // Pehli ping turant (45 sec ka intezar na ho)
    setTimeout(() => this.send(), 3_000);
  }

  /**
   * 🛣️ Rasta asli lage, iske liye CHALTE waqt zyada point.
   * Sirf 45-sec wale point se gaadi par aadha-aadha kilometer ka faasla ban jata
   * tha aur galiyon ke mod kat kar seedhi lakeer ban jati thi. Ab jaise hi 40
   * meter khiske, wahin point bhej dete hain (10 sec se jaldi nahi — battery aur
   * data dono bache).
   */
  private maybeSendOnMove() {
    if (!this.last) return;
    const now = Date.now();
    if (now - this.lastSentAt < 10_000) return;
    if (this.sentPos && this.distM(this.sentPos.lat, this.sentPos.lng, this.last.lat, this.last.lng) < 40) return;
    this.send();
  }

  private send() {
    if (!this.last) return;
    this.lastSentAt = Date.now();
    this.sentPos = { lat: this.last.lat, lng: this.last.lng };
    this.svc.ping(this.last.lat, this.last.lng, this.last.acc).subscribe({ error: () => {} });
  }

  /** Do jagah ke beech ki doori — meter me. */
  private distM(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371000, rad = (d: number) => d * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /** Checkout par (ya logout par) band. */
  stop() {
    if (this.watchId !== null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.last = null; this.sentPos = null; this.lastSentAt = 0;
  }
}
