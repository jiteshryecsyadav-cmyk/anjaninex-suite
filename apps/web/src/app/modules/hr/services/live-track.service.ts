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

  get running() { return this.timer !== null; }

  /** Check-in page kholte / check-in karte hi bulao — checked-in ho to shuru. */
  start() {
    if (this.running || !navigator.geolocation) return;

    // watchPosition: GPS khud taaza position deta rehta hai (battery-friendly)
    this.watchId = navigator.geolocation.watchPosition(
      p => { this.last = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? null }; },
      () => {},   // deny/timeout par chup — check-in flow apna error khud dikhata hai
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );

    // Har 45 sec me aakhri position server ko — fail ho to agli baar phir koshish
    this.timer = setInterval(() => {
      if (!this.last) return;
      this.svc.ping(this.last.lat, this.last.lng, this.last.acc).subscribe({ error: () => {} });
    }, 45_000);

    // Pehli ping turant (45 sec ka intezar na ho)
    setTimeout(() => {
      if (this.last) this.svc.ping(this.last.lat, this.last.lng, this.last.acc).subscribe({ error: () => {} });
    }, 3_000);
  }

  /** Checkout par (ya logout par) band. */
  stop() {
    if (this.watchId !== null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.last = null;
  }
}
