import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HrService, AttendanceLog } from '../services/hr.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

@Component({
  selector: 'app-check-in',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent],
  template: `
    <div class="max-w-md mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <div class="text-center mb-6">
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📸 My Attendance</h2>
        <p class="text-sm text-[#6b3fa0]">{{ today() }}</p>
      </div>

      <!-- Sub-nav (hidden on mobile compact view) -->
      <div class="hidden sm:flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/hr/dashboard" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
        <a routerLink="/hr/staff" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">👤 Staff</a>
        <a routerLink="/hr/check-in" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📸 My Attendance</a>
        <a routerLink="/hr/leaves" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🏖 Leaves</a>
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-500">Loading…</div>
      } @else {

        <!-- Current status card -->
        @if (todayLog(); as log) {
          <div class="card mb-4">
            <div class="text-center">
              @if (log.checkInAt) {
                <div class="text-5xl mb-2">✅</div>
                <div class="font-display font-bold text-lg text-green-700">Checked In</div>
                <div class="text-2xl font-mono font-bold mt-1">{{ formatTime(log.checkInAt) }}</div>
                @if (log.isLate) {
                  <div class="text-xs text-red-600 mt-1">⚠️ Late check-in</div>
                }
              }

              @if (log.checkOutAt) {
                <div class="border-t mt-4 pt-4">
                  <div class="text-3xl mb-1">🚪</div>
                  <div class="font-display font-bold text-orange-700">Checked Out</div>
                  <div class="text-2xl font-mono font-bold mt-1">{{ formatTime(log.checkOutAt) }}</div>
                  <div class="text-sm text-gray-600 mt-1">
                    Total: <strong>{{ formatDuration(log.totalMinutes) }}</strong>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- Action buttons -->
        @if (!todayLog()?.checkInAt) {
          <button (click)="action('check-in')" [disabled]="processing()"
                  class="w-full py-6 bg-gradient-to-r from-green-500 to-green-700 text-white rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition">
            @if (processing()) { ⏳ Capturing... } @else { 📸 Check In Now }
          </button>
        } @else if (!todayLog()?.checkOutAt) {
          <button (click)="action('check-out')" [disabled]="processing()"
                  class="w-full py-6 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition">
            @if (processing()) { ⏳ Capturing... } @else { 🚪 Check Out Now }
          </button>
        } @else {
          <div class="card text-center bg-blue-50 border-blue-200 text-blue-900">
            ✓ Attendance complete for today. See you tomorrow!
          </div>
        }

        <!-- Status messages -->
        @if (status()) {
          <div class="mt-3 p-3 rounded-lg text-sm"
               [class.bg-yellow-50]="status()?.type === 'info'"
               [class.text-yellow-700]="status()?.type === 'info'"
               [class.bg-red-50]="status()?.type === 'error'"
               [class.text-red-700]="status()?.type === 'error'">
            {{ status()?.msg }}
          </div>
        }

        <!-- Live preview when capturing -->
        @if (showCamera()) {
          <div class="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
            <video #videoEl autoplay playsinline class="w-full max-w-md rounded-lg"></video>
            <div class="mt-4 flex gap-3">
              <button (click)="cancelCamera()" class="px-6 py-3 bg-gray-700 text-white rounded-full">Cancel</button>
              <button (click)="captureAndSubmit()" class="px-6 py-3 bg-gradient-to-r from-green-500 to-green-700 text-white rounded-full font-bold">
                📸 Capture & Submit
              </button>
            </div>
            <div class="mt-4 text-white text-sm text-center">
              <div>📍 Lat: {{ currentLat()?.toFixed(6) }}, Lng: {{ currentLng()?.toFixed(6) }}</div>
              @if (currentAccuracy()) {
                <div class="text-xs opacity-75">Accuracy: ±{{ currentAccuracy() | number:'1.0-0' }}m</div>
              }
            </div>
          </div>
        }

        <!-- Today's details -->
        @if (todayLog()?.checkInAt) {
          <div class="card mt-4">
            <h3 class="font-display font-bold text-sm text-[#5c1a8b] uppercase mb-3">Today's Details</h3>
            @if (todayLog()?.checkInSelfieUrl) {
              <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div class="text-xs text-gray-500 mb-1">Check-in Selfie</div>
                  <img [src]="todayLog()!.checkInSelfieUrl!" class="rounded-lg w-full">
                </div>
                @if (todayLog()?.checkOutSelfieUrl) {
                  <div>
                    <div class="text-xs text-gray-500 mb-1">Check-out Selfie</div>
                    <img [src]="todayLog()!.checkOutSelfieUrl!" class="rounded-lg w-full">
                  </div>
                }
              </div>
            }
            <div class="space-y-1 text-sm">
              @if (todayLog()?.checkInLat) {
                <div>📍 <strong>In:</strong> {{ todayLog()!.checkInLat?.toFixed(4) }}, {{ todayLog()!.checkInLng?.toFixed(4) }}</div>
              }
              @if (todayLog()?.checkOutLat) {
                <div>📍 <strong>Out:</strong> {{ todayLog()!.checkOutLat?.toFixed(4) }}, {{ todayLog()!.checkOutLng?.toFixed(4) }}</div>
              }
            </div>
          </div>
        }
      }
    </div>
  `
})
export class CheckInComponent implements OnDestroy {
  private svc = inject(HrService);

  todayLog = signal<AttendanceLog | null>(null);
  loading = signal(true);
  processing = signal(false);
  showCamera = signal(false);
  status = signal<{ type: 'info' | 'error'; msg: string } | null>(null);

  currentLat = signal<number | null>(null);
  currentLng = signal<number | null>(null);
  currentAccuracy = signal<number | null>(null);

  private stream: MediaStream | null = null;
  private currentAction: 'check-in' | 'check-out' = 'check-in';

  today(): string {
    return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  ngOnInit() { this.loadToday(); }

  loadToday() {
    this.svc.todayAttendance().subscribe({
      next: (log) => { this.todayLog.set(log); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  formatDuration(min: number | null): string {
    if (!min) return '—';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
  }

  async action(type: 'check-in' | 'check-out') {
    this.currentAction = type;
    this.processing.set(true);
    this.status.set({ type: 'info', msg: 'Getting your location...' });

    // 1. Get GPS
    try {
      const position = await this.getLocation();
      this.currentLat.set(position.coords.latitude);
      this.currentLng.set(position.coords.longitude);
      this.currentAccuracy.set(position.coords.accuracy);
    } catch (e: any) {
      this.status.set({ type: 'error', msg: `Location access denied: ${e?.message ?? 'unknown'}. Please enable GPS.` });
      this.processing.set(false);
      return;
    }

    // 2. Start camera
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }   // front camera for selfie
      });
      this.showCamera.set(true);
      setTimeout(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video && this.stream) video.srcObject = this.stream;
      }, 100);
      this.status.set(null);
    } catch (e: any) {
      this.status.set({ type: 'error', msg: 'Camera access denied. Cannot proceed without selfie.' });
      this.processing.set(false);
    }
  }

  async captureAndSubmit() {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const selfieFile = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });

      this.stopCamera();
      this.showCamera.set(false);

      const lat = this.currentLat()!;
      const lng = this.currentLng()!;
      const acc = this.currentAccuracy();

      const obs = this.currentAction === 'check-in'
        ? this.svc.checkIn(lat, lng, acc, null, selfieFile)
        : this.svc.checkOut(lat, lng, acc, null, selfieFile);

      obs.subscribe({
        next: (log) => {
          this.todayLog.set(log);
          this.processing.set(false);
          this.status.set({ type: 'info', msg: `✓ ${this.currentAction === 'check-in' ? 'Checked in' : 'Checked out'} successfully!` });
        },
        error: (e) => {
          this.status.set({ type: 'error', msg: e?.error?.error ?? 'Failed to submit' });
          this.processing.set(false);
        }
      });
    }, 'image/jpeg', 0.85);
  }

  cancelCamera() {
    this.stopCamera();
    this.showCamera.set(false);
    this.processing.set(false);
    this.status.set(null);
  }

  private stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  private getLocation(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    });
  }

  ngOnDestroy() {
    this.stopCamera();
  }
}
