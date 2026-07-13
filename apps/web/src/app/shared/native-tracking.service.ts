import { Injectable, inject } from '@angular/core';
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
  private buffer: { latitude: number; longitude: number; accuracy: number | null; speed: number | null; batteryPct: number | null; isBackground: boolean }[] = [];
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

  /** Background watcher start — check-in ke baad call karo. Do baar call safe hai. */
  async startTracking(): Promise<void> {
    if (this.watcherId) return;   // already chal raha hai
    try {
      const { registerPlugin } = await import('@capacitor/core');
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
            // Location off ho to settings kholne ka native prompt
            if (error.code === 'NOT_AUTHORIZED' &&
                confirm('Location permission chahiye attendance tracking ke liye. Settings kholein?')) {
              BackgroundGeolocation.openSettings();
            }
            return;
          }
          if (!location) return;
          this.buffer.push({
            latitude: +location.latitude.toFixed(6),
            longitude: +location.longitude.toFixed(6),
            accuracy: location.accuracy != null ? Math.round(location.accuracy) : null,
            speed: location.speed != null ? +(+location.speed).toFixed(2) : null,
            batteryPct: null,
            isBackground: true
          });
        }
      );

      // Har 60s me jama points server ko bhejo
      this.flushTimer = setInterval(() => this.flush(), 60_000);
    } catch {
      // Browser/PWA ya plugin missing — koi baat nahi, web wala 5-min ping chalta rahega
    }
  }

  /** Check-out ya logout par tracking band. */
  async stopTracking(): Promise<void> {
    try {
      if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
      await this.flush();   // bache hue points bhej do
      if (this.watcherId) {
        const { registerPlugin } = await import('@capacitor/core');
        const BackgroundGeolocation: any = registerPlugin('BackgroundGeolocation');
        await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
        this.watcherId = null;
      }
    } catch { /* no-op */ }
  }

  private flush() {
    if (this.buffer.length === 0) return;
    const points = this.buffer.splice(0, this.buffer.length);
    this.http.post(`${environment.apiUrl}/api/hr/location/batch`, points).subscribe({
      next: () => {},
      error: () => { this.buffer.unshift(...points.slice(-20)); }   // fail hua to last 20 wapas buffer me
    });
  }
}
