import { Component, inject, signal, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HrService, LocationPoint, LiveStaff } from '../services/hr.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { InDatePipe } from '../../../shared/in-date.pipe';

declare const google: any;

// Live Location Map on Google Maps. Two modes:
//  - LIVE (default): Ola/Rapido style. Poll each staff's latest position every 5s and
//    smoothly animate the marker from old -> new position.
//  - TRAILS: pick a date, draw each staff's full GPS trail as a polyline.
@Component({
  selector: 'app-live-map',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BackButtonComponent, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🗺 Live Location Map</h2>
          <p class="text-sm text-[#6b3fa0]">Field staff ki live movement (Google Maps)</p>
        </div>
        <div class="flex gap-2 items-center flex-wrap">
          <div class="flex rounded-lg overflow-hidden border border-[#c9a8ec]">
            <button (click)="goLive()"
              [class]="mode()==='live' ? 'bg-[#5c1a8b] text-white' : 'bg-white text-[#5c1a8b]'"
              class="px-4 py-2 text-sm font-bold">🔴 Live</button>
            <button (click)="goTrails()"
              [class]="mode()==='trails' ? 'bg-[#5c1a8b] text-white' : 'bg-white text-[#5c1a8b]'"
              class="px-4 py-2 text-sm font-bold">📅 Trails</button>
          </div>
          @if (mode()==='trails') {
            <input [(ngModel)]="selectedDate" type="date" (change)="loadTrails()" class="input w-44">
          }
          <button (click)="refresh()" class="btn-primary text-sm">↻ Refresh</button>
        </div>
      </div>

      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/hr/dashboard" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
        <a routerLink="/hr/staff" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">👤 Staff</a>
        <a routerLink="/hr/check-in" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📸 My Attendance</a>
        <a routerLink="/hr/register" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📋 Register</a>
        <a routerLink="/hr/live-map" class="px-4 py-2 text-sm font-semibold !border-[#5c1a8b] !text-[#5c1a8b] border-b-2">🗺 Live Map</a>
        <a routerLink="/hr/leaves" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🏖 Leaves</a>
        <a routerLink="/hr/payroll" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💰 Payroll</a>
      </div>

      <div class="card p-0 overflow-hidden relative">
        <div id="map" class="h-[600px] w-full bg-gray-100"></div>

        @if (mode()==='live' && mapReady()) {
          <div class="absolute top-3 left-3 bg-white/95 rounded-lg shadow px-3 py-1.5 text-sm font-bold text-[#5c1a8b] flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            LIVE · {{ liveStaff().length }} staff
          </div>
        }

        @if (loading()) {
          <div class="absolute inset-0 flex items-center justify-center text-gray-500 bg-white/70">Loading map…</div>
        }
        @if (noKey()) {
          <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-gray-50">
            <div class="text-5xl mb-3">🗺</div>
            <p class="text-gray-700 mb-1 font-semibold">Google Maps key set nahi hai</p>
            <p class="text-xs text-gray-500 max-w-md">
              Anjaninex super-admin ko: <b>Admin → AI Keys</b> me <b>Google Maps key</b> daalni hai.
              Uske baad ye map live chalega.
            </p>
          </div>
        }
      </div>

      <!-- LIVE staff list (Ola/Rapido style) -->
      @if (mode()==='live' && mapReady()) {
        @if (liveStaff().length > 0) {
          <div class="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            @for (s of liveStaff(); track s.employeeId; let i = $index) {
              <button (click)="focus(s)" class="card text-left flex items-center gap-3 hover:shadow-md transition">
                <span class="w-3 h-3 rounded-full shrink-0" [style.background]="colorFor(i)"></span>
                <div class="min-w-0">
                  <div class="font-bold text-sm truncate">{{ s.name }}</div>
                  <div class="text-xs" [class.text-green-600]="s.minutesAgo <= 3" [class.text-gray-500]="s.minutesAgo > 3">
                    {{ s.minutesAgo <= 1 ? 'abhi' : s.minutesAgo + ' min pehle' }}
                  </div>
                </div>
              </button>
            }
          </div>
        } @else if (!loading()) {
          <div class="card mt-4 text-center text-gray-500">
            Abhi koi staff live nahi hai. Field staff ko app se check-in / location tracking chalu karni hogi (last 30 min).
          </div>
        }
      }

      <!-- TRAILS stats -->
      @if (mode()==='trails') {
        @if (trails().length > 0) {
          <div class="mt-4 grid grid-cols-3 gap-3">
            <div class="card text-center"><div class="text-2xl mb-1">👥</div><div class="text-xl font-bold">{{ trails().length }}</div><div class="text-xs text-gray-500">Staff Tracked</div></div>
            <div class="card text-center"><div class="text-2xl mb-1">📍</div><div class="text-xl font-bold">{{ totalPoints() }}</div><div class="text-xs text-gray-500">GPS Pings</div></div>
            <div class="card text-center"><div class="text-2xl mb-1">📅</div><div class="text-xl font-bold">{{ selectedDate | inDate }}</div><div class="text-xs text-gray-500">Selected Date</div></div>
          </div>
        } @else if (!loading()) {
          <div class="card mt-4 text-center text-gray-500">No GPS data for {{ selectedDate | inDate }}.</div>
        }
      }
    </div>
  `
})
export class LiveMapComponent implements AfterViewInit, OnDestroy {
  private svc = inject(HrService);

  loading = signal(true);
  mapReady = signal(false);
  noKey = signal(false);
  mode = signal<'live' | 'trails'>('live');
  liveStaff = signal<LiveStaff[]>([]);
  trails = signal<{ employeeId: string; points: LocationPoint[] }[]>([]);
  selectedDate = new Date().toISOString().split('T')[0];

  private map: any = null;
  private markers = new Map<string, any>();   // employeeId -> { marker, info }
  private trailLayers: any[] = [];
  private pollTimer: any = null;
  private firstFit = true;
  private colors = ['#5c1a8b', '#f57c00', '#16a34a', '#dc2626', '#0891b2', '#9333ea', '#ea580c', '#2563eb'];

  colorFor(i: number) { return this.colors[i % this.colors.length]; }
  totalPoints() { return this.trails().reduce((s, t) => s + t.points.length, 0); }

  ngAfterViewInit() { this.boot(); }
  ngOnDestroy() { this.stopPoll(); }

  private async boot() {
    try {
      const res = await firstValueFrom(this.svc.mapsKey());
      if (!res?.key) { this.noKey.set(true); this.loading.set(false); return; }
      await this.loadGoogle(res.key);
      this.initMap();
    } catch (e) {
      console.error('map boot failed', e);
      this.loading.set(false);
      this.noKey.set(true);
    }
  }

  private loadGoogle(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.maps) return resolve();
      const existing = document.getElementById('gmaps-js') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject());
        return;
      }
      const s = document.createElement('script');
      s.id = 'gmaps-js';
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async`;
      s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject();
      document.head.appendChild(s);
    });
  }

  private initMap() {
    this.map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 26.9124, lng: 75.7873 },   // Jaipur default
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true
    });
    this.mapReady.set(true);
    this.loading.set(false);
    this.goLive();
  }

  // ---- LIVE mode ----
  goLive() {
    if (!this.mapReady()) return;
    this.mode.set('live');
    this.clearTrails();
    this.firstFit = true;
    this.pollLive();
    this.stopPoll();
    this.pollTimer = setInterval(() => this.pollLive(), 5000);
  }

  private stopPoll() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } }

  private async pollLive() {
    if (this.mode() !== 'live' || !this.map) return;
    try {
      const staff = await firstValueFrom(this.svc.liveLatest());
      this.liveStaff.set(staff);
      const seen = new Set<string>();
      let idx = 0;
      const bounds = new google.maps.LatLngBounds();

      for (const s of staff) {
        seen.add(s.employeeId);
        const pos = { lat: +s.latitude, lng: +s.longitude };
        bounds.extend(pos);
        const color = this.colorFor(idx++);
        let entry = this.markers.get(s.employeeId);
        if (!entry) {
          const marker = new google.maps.Marker({
            position: pos, map: this.map, title: s.name,
            icon: this.dotIcon(color), label: this.nameLabel(s.name), zIndex: 999
          });
          const info = new google.maps.InfoWindow();
          marker.addListener('click', () => {
            info.setContent(`<div style="font-size:13px"><b>${s.name}</b><br>${s.minutesAgo <= 1 ? 'abhi' : s.minutesAgo + ' min pehle'}</div>`);
            info.open(this.map, marker);
          });
          this.markers.set(s.employeeId, { marker, info });
        } else {
          this.animateMarker(entry.marker, pos);
        }
      }
      // remove staff no longer live
      for (const [id, entry] of this.markers) {
        if (!seen.has(id)) { entry.marker.setMap(null); this.markers.delete(id); }
      }
      if (this.firstFit && staff.length > 0) {
        this.map.fitBounds(bounds);
        if (staff.length === 1) this.map.setZoom(15);
        this.firstFit = false;
      }
    } catch (e) {
      console.error('live poll failed', e);
    }
  }

  // Smoothly slide a marker from its current position to `to` (Ola/Rapido feel).
  private animateMarker(marker: any, to: { lat: number; lng: number }) {
    const from = marker.getPosition();
    if (!from) { marker.setPosition(to); return; }
    const fromLat = from.lat(), fromLng = from.lng();
    const dLat = to.lat - fromLat, dLng = to.lng - fromLng;
    if (Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7) return;
    const dur = 900, start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;   // easeInOut
      marker.setPosition({ lat: fromLat + dLat * e, lng: fromLng + dLng * e });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private dotIcon(color: string) {
    return {
      path: google.maps.SymbolPath.CIRCLE, scale: 9,
      fillColor: color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3
    };
  }

  private nameLabel(name: string) {
    return { text: (name || 'Staff').split(' ')[0], color: '#1f2937', fontSize: '11px', fontWeight: '700', className: 'gm-name' };
  }

  focus(s: LiveStaff) {
    if (!this.map) return;
    this.map.panTo({ lat: +s.latitude, lng: +s.longitude });
    this.map.setZoom(16);
    const entry = this.markers.get(s.employeeId);
    if (entry) google.maps.event.trigger(entry.marker, 'click');
  }

  // ---- TRAILS mode ----
  goTrails() {
    if (!this.mapReady()) return;
    this.mode.set('trails');
    this.stopPoll();
    this.clearLiveMarkers();
    this.loadTrails();
  }

  async loadTrails() {
    if (!this.map) return;
    this.loading.set(true);
    this.clearTrails();
    try {
      const trails = await firstValueFrom(this.svc.allTrails(this.selectedDate));
      this.trails.set(trails);
      const bounds = new google.maps.LatLngBounds();
      let colorIdx = 0;
      for (const trail of trails) {
        const color = this.colorFor(colorIdx++);
        if (trail.points.length < 1) continue;
        const path = trail.points.map(p => ({ lat: +p.latitude, lng: +p.longitude }));
        path.forEach(pt => bounds.extend(pt));
        if (path.length >= 2) {
          const line = new google.maps.Polyline({ path, strokeColor: color, strokeOpacity: 0.8, strokeWeight: 4, map: this.map });
          this.trailLayers.push(line);
        }
        const start = new google.maps.Marker({ position: path[0], map: this.map, icon: this.dotIcon('#16a34a'), title: 'Start' });
        const end = new google.maps.Marker({ position: path[path.length - 1], map: this.map, icon: this.dotIcon('#dc2626'), title: 'Last seen' });
        this.trailLayers.push(start, end);
      }
      if (trails.some(t => t.points.length > 0)) this.map.fitBounds(bounds);
    } catch (e) {
      console.error('Failed to load trails', e);
    } finally {
      this.loading.set(false);
    }
  }

  private clearTrails() { this.trailLayers.forEach(l => l.setMap(null)); this.trailLayers = []; }
  private clearLiveMarkers() { for (const [, e] of this.markers) e.marker.setMap(null); this.markers.clear(); }

  refresh() { this.mode() === 'live' ? this.pollLive() : this.loadTrails(); }
}
