import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

/**
 * NATIVE (APK) BACKGROUND LOCATION TRACKING — sirf Capacitor Android app me chalta hai.
 * Browser/PWA me har method chup-chaap no-op ho jata hai (dynamic import fail => catch).
 *
 * Flow:
 *  - Staff check-in hai → startTracking(): native watcher + Android foreground service
 *    (notification: "Duty par — location share ho rahi hai"). App band ho tab bhi chalta hai.
 *  - Points buffer me jama hote hain, har 60s me batch API (/api/hr/location/batch) pe jaate hain.
 *  - Check-out / logout → stopTracking().
 *
 * Native plugin: @capacitor-community/background-geolocation (Android project me installed).
 * JS side registerPlugin se bridge milta hai — community package ka JS import zaroori nahi.
 */
@Injectable({ providedIn: 'root' })
export class NativeTrackingService {
  private http = inject(HttpClient);
  private watcherId: string | null = null;
  private buffer: { latitude: number; longitude: number; accuracy: number | null; speed: number | null; batteryPct: number | null; isBackground: boolean; capturedAt?: string }[] = [];
  private flushTimer: any = null;

  /** Capacitor native app me chal rahe hain? (browser me false) */
  async isNative(): Promise<boolean> {
    try {
      const { Capacitor } = await import('@capacitor/core');
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  }

  /**
   * 📡 Haalat — screen par dikhane ke liye. Pehle har gadbad chup-chaap nigal li
   * jati thi (catch {}), isliye background tracking na chale to pata hi nahi
   * chalta tha ki permission ki dikkat hai, plugin ki, ya kuch aur.
   */
  status = signal<string>('—');
  lastPointAt = signal<string | null>(null);
  sentCount = signal(0);

  /** Background watcher start — check-in ke baad call karo. Do baar call safe hai. */
  async startTracking(): Promise<void> {
    if (this.watcherId) return;   // already chal raha hai
    try {
      const { Capacitor, registerPlugin } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        this.status.set('Browser me hain — background tracking sirf APK me chalti hai');
        return;
      }
      this.status.set('Chalu kar rahe hain…');
      const BackgroundGeolocation: any = registerPlugin('BackgroundGeolocation');

      this.watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Duty par — location share ho rahi hai',
          backgroundTitle: 'Vyapaar Setu',
          requestPermissions: true,
          stale: false,
          distanceFilter: 30   // meters — har 30m movement par point
        },
        (location: any, error: any) => {
          if (error) {
            this.status.set(error.code === 'NOT_AUTHORIZED'
              ? '⚠️ Location permission nahi mili — "Allow all the time" dijiye'
              : '⚠️ ' + (error.code || error.message || 'location error'));
            // Location off ho to settings kholne ka native prompt
            if (error.code === 'NOT_AUTHORIZED' &&
                confirm('Location permission chahiye attendance tracking ke liye. Settings kholein?')) {
              BackgroundGeolocation.openSettings();
            }
            return;
          }
          if (!location) return;
          this.status.set('✅ Background tracking CHALU');
          this.lastPointAt.set(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
          this.lastLoc = location;
          this.push(location, new Date(location.time ?? Date.now()));
        }
      );

      this.status.set('✅ Watcher laga diya — point ka intezar');
      // Pichhli baar ke ruke hue points (app band ho gayi thi / network nahi tha)
      this.loadBuffer();
      // Har 60s me jama points server ko bhejo
      this.flushTimer = setInterval(() => this.flush(), 60_000);
      setTimeout(() => this.flush(), 3_000);   // ruke hue points turant bhej do

      // 💓 DHADKAN — watcher sirf 30 meter CHALNE par jaagta hai. Aadmi ek jagah
      // baitha ho to ghanton koi point nahi banta aur map par wo "gayab" lagta hai.
      // Isliye har 3 minute me aakhri maloom jagah bhej dete hain: din bhar ka
      // record poora rehta hai aur battery bhi nahi jalti (naya GPS fix nahi lete).
      this.beatTimer = setInterval(() => {
        if (!this.lastLoc) return;
        if (Date.now() - this.lastPushMs < 150_000) return;   // abhi-abhi point gaya hai
        this.push(this.lastLoc, new Date());
      }, 180_000);
    } catch (e: any) {
      // Browser/PWA ya plugin missing — web wala ping chalta rahega, par ab
      // gadbad chhupti nahi: screen par saaf dikhegi.
      this.status.set('⚠️ Chalu nahi hua: ' + (e?.message || e?.code || 'plugin nahi mila'));
    }
  }

  /** Check-out ya logout par tracking band. */
  async stopTracking(): Promise<void> {
    try {
      if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
      if (this.beatTimer) { clearInterval(this.beatTimer); this.beatTimer = null; }
      this.lastLoc = null;
      await this.flush();   // bache hue points bhej do
      if (this.watcherId) {
        const { registerPlugin } = await import('@capacitor/core');
        const BackgroundGeolocation: any = registerPlugin('BackgroundGeolocation');
        await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
        this.watcherId = null;
      }
    } catch { /* no-op */ }
  }

  /**
   * 💾 Points phone ki PAKKI jagah me bhi likhte hain.
   * Pehle ye sirf RAM me the — network gaya ya app band hui to gum. Aur fail hone
   * par sirf aakhri 20 bachte the, baki rasta hamesha ke liye kho jata tha.
   * Ab: sab kuch localStorage me, network aate hi khud chala jayega, aur har
   * point apna ASLI waqt saath leke jata hai — isliye der se pahunche to bhi
   * rasta sahi kram me banta hai.
   */
  private static BUF_KEY = 'vs_track_buffer';
  private static BUF_MAX = 1000;   // ~2 ghante ka rasta

  private lastLoc: any = null;      // aakhri maloom jagah (dhadkan ke liye)
  private lastPushMs = 0;
  private beatTimer: any = null;

  /** Ek point buffer me + phone ki pakki jagah me. */
  private push(location: any, at: Date) {
    this.buffer.push({
      latitude: +location.latitude.toFixed(6),
      longitude: +location.longitude.toFixed(6),
      accuracy: location.accuracy != null ? Math.round(location.accuracy) : null,
      speed: location.speed != null ? +(+location.speed).toFixed(2) : null,
      batteryPct: null,
      isBackground: true,
      // Asli waqt — batch 60 sec me jata hai, warna sab points par ek hi waqt
      // lag jata aur rasta galat kram me banta
      capturedAt: at.toISOString()
    });
    this.lastPushMs = Date.now();
    this.saveBuffer();   // app mar bhi jaye to point bacha rahe
  }

  private saveBuffer() {
    try {
      const keep = this.buffer.slice(-NativeTrackingService.BUF_MAX);
      localStorage.setItem(NativeTrackingService.BUF_KEY, JSON.stringify(keep));
    } catch { /* storage bhara ho to chhodo — RAM wala buffer chalta rahega */ }
  }

  private loadBuffer() {
    try {
      const raw = localStorage.getItem(NativeTrackingService.BUF_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) this.buffer.unshift(...saved);
      }
    } catch { /* kharab data — chhodo */ }
  }

  private flush() {
    if (this.buffer.length === 0) return;
    const points = this.buffer.splice(0, this.buffer.length);
    this.http.post(`${environment.apiUrl}/api/hr/location/batch`, points).subscribe({
      next: () => {
        this.sentCount.update(n => n + points.length);
        this.saveBuffer();                      // bhej diye — pakki jagah bhi saaf
        if (this.buffer.length === 0) this.status.set('✅ Background tracking CHALU');
      },
      error: (e) => {
        // ⚠️ EK BHI POINT MAT PHENKO — network wapas aate hi sab chale jayenge
        this.buffer.unshift(...points);
        this.saveBuffer();
        this.status.set(`⚠️ ${this.buffer.length} point ruke hain (${e?.status || 'network'}) — apne aap dobara jayenge`);
      }
    });
  }
}
