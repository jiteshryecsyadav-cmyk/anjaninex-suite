import { Component, inject, signal, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HrService, LocationPoint } from '../services/hr.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { InDatePipe } from '../../../shared/in-date.pipe';

declare const L: any;  // Leaflet from CDN

@Component({
  selector: 'app-live-map',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, BackButtonComponent, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🗺 Live Location Map</h2>
          <p class="text-sm text-[#6b3fa0]">GPS trails of field staff</p>
        </div>
        <div class="flex gap-2">
          <input [(ngModel)]="selectedDate" type="date" (change)="loadTrails()" class="input w-44">
          <button (click)="refresh()" class="btn-primary text-sm">↻ Refresh</button>
        </div>
      </div>

      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
        <a routerLink="/hr/dashboard" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
        <a routerLink="/hr/staff" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">👤 Staff</a>
        <a routerLink="/hr/check-in" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📸 My Attendance</a>
        <a routerLink="/hr/register" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📋 Register</a>
        <a routerLink="/hr/live-map" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🗺 Live Map</a>
        <a routerLink="/hr/leaves" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🏖 Leaves</a>
        <a routerLink="/hr/payroll" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💰 Payroll</a>
      </div>

      <div class="card p-0 overflow-hidden">
        <div id="map" class="h-[600px] w-full bg-gray-100">
          @if (loading()) {
            <div class="h-full flex items-center justify-center text-gray-500">Loading map…</div>
          } @else if (!mapLoaded()) {
            <div class="h-full flex flex-col items-center justify-center text-center p-6 bg-gray-50">
              <div class="text-5xl mb-3">🗺</div>
              <p class="text-gray-700 mb-2">Map library not loaded</p>
              <p class="text-xs text-gray-500">
                Add this to <code>index.html</code>:
              </p>
              <pre class="text-xs bg-white p-2 rounded mt-2 text-left overflow-x-auto max-w-full">{{ leafletInstructions }}</pre>
            </div>
          }
        </div>
      </div>

      <!-- Stats below -->
      @if (trails().length > 0) {
        <div class="mt-4 grid grid-cols-3 gap-3">
          <div class="card text-center">
            <div class="text-2xl mb-1">👥</div>
            <div class="text-xl font-bold">{{ trails().length }}</div>
            <div class="text-xs text-gray-500">Staff Tracked</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl mb-1">📍</div>
            <div class="text-xl font-bold">{{ totalPoints() }}</div>
            <div class="text-xs text-gray-500">GPS Pings</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl mb-1">📅</div>
            <div class="text-xl font-bold">{{ selectedDate | inDate }}</div>
            <div class="text-xs text-gray-500">Selected Date</div>
          </div>
        </div>
      } @else if (!loading()) {
        <div class="card mt-4 text-center text-gray-500">
          No GPS data for {{ selectedDate | inDate }}.
          @if (mapLoaded()) { Field staff need to start tracking via check-in. }
        </div>
      }
    </div>
  `
})
export class LiveMapComponent implements AfterViewInit, OnDestroy {
  private svc = inject(HrService);
  loading = signal(true);
  mapLoaded = signal(false);
  trails = signal<{ employeeId: string; points: LocationPoint[] }[]>([]);

  selectedDate = new Date().toISOString().split('T')[0];

  private map: any = null;
  private layers: any[] = [];

  leafletInstructions = `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>`;

  totalPoints() {
    return this.trails().reduce((s, t) => s + t.points.length, 0);
  }

  ngAfterViewInit() {
    // Wait for Leaflet to be loaded
    setTimeout(() => this.initMap(), 200);
  }

  ngOnDestroy() {
    if (this.map) this.map.remove();
  }

  private initMap() {
    if (typeof L === 'undefined') {
      this.mapLoaded.set(false);
      this.loading.set(false);
      return;
    }

    this.mapLoaded.set(true);
    this.map = L.map('map').setView([26.9124, 75.7873], 13);   // Jaipur default
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    this.loadTrails();
  }

  async loadTrails() {
    if (!this.map) return;
    this.loading.set(true);

    // Clear existing layers
    this.layers.forEach(l => this.map.removeLayer(l));
    this.layers = [];

    try {
      const trails = await firstValueFrom(this.svc.allTrails(this.selectedDate));
      this.trails.set(trails);

      const colors = ['#5c1a8b', '#f57c00', '#16a34a', '#dc2626', '#0891b2', '#9333ea', '#ea580c'];
      let colorIdx = 0;

      for (const trail of trails) {
        const color = colors[colorIdx++ % colors.length];
        if (trail.points.length < 2) continue;

        const latLngs = trail.points.map(p => [p.latitude, p.longitude]);

        // Polyline for trail
        const polyline = L.polyline(latLngs, { color, weight: 4, opacity: 0.7 }).addTo(this.map);
        this.layers.push(polyline);

        // Markers for start, end, and intermediate stops
        const startMarker = L.marker(latLngs[0], { icon: this.createIcon('🟢', color) })
          .bindPopup(`<b>Start</b><br>${new Date(trail.points[0].capturedAt).toLocaleTimeString()}`)
          .addTo(this.map);
        const endMarker = L.marker(latLngs[latLngs.length - 1], { icon: this.createIcon('🔴', color) })
          .bindPopup(`<b>Last seen</b><br>${new Date(trail.points[trail.points.length - 1].capturedAt).toLocaleTimeString()}`)
          .addTo(this.map);
        this.layers.push(startMarker, endMarker);
      }

      // Fit bounds if data
      if (trails.some(t => t.points.length > 0)) {
        const allPoints = trails.flatMap(t => t.points.map(p => [p.latitude, p.longitude] as [number, number]));
        this.map.fitBounds(allPoints);
      }
    } catch (e) {
      console.error('Failed to load trails', e);
    } finally {
      this.loading.set(false);
    }
  }

  refresh() { this.loadTrails(); }

  private createIcon(emoji: string, color: string) {
    return L.divIcon({
      html: `<div style="background:${color};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);font-size:12px;">${emoji}</div>`,
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }
}
