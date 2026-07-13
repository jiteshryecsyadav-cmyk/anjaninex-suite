import { Component, inject, signal, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HrService, LocationPoint, LiveStaff } from '../services/hr.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { InDatePipe } from '../../../shared/in-date.pipe';

declare const maplibregl: any;
declare const google: any;

// Live Location Map. Provider admin choose karta hai (Admin -> AI Keys):
//   osm    = OpenStreetMap via MapLibre (FREE, no key)
//   ola    = Ola Maps via MapLibre (Indian, key)
//   google = Google Maps JS (key + billing)
// Dono modes: LIVE (Ola/Rapido style moving markers, 5s poll) + TRAILS (date-wise line).
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
          <p class="text-sm text-[#6b3fa0]">Field staff ki live movement · {{ providerLabel() }}</p>
        </div>
        <div class="flex gap-2 items-center flex-wrap">
          <div class="flex rounded-lg overflow-hidden border border-[#c9a8ec]">
            <button (click)="goLive()" [class]="mode()==='live' ? 'bg-[#5c1a8b] text-white' : 'bg-white text-[#5c1a8b]'" class="px-4 py-2 text-sm font-bold">🔴 Live</button>
            <button (click)="goTrails()" [class]="mode()==='trails' ? 'bg-[#5c1a8b] text-white' : 'bg-white text-[#5c1a8b]'" class="px-4 py-2 text-sm font-bold">📅 Trails</button>
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
          <div class="absolute top-3 left-3 z-10 bg-white/95 rounded-lg shadow px-3 py-1.5 text-sm font-bold text-[#5c1a8b] flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            LIVE · {{ liveStaff().length }} staff
          </div>
        }
        @if (loading()) {
          <div class="absolute inset-0 z-10 flex items-center justify-center text-gray-500 bg-white/70">Loading map…</div>
        }
        @if (noKey()) {
          <div class="absolute inset-0 z-10 flex flex-col items-center justify-center text-center p-6 bg-gray-50">
            <div class="text-5xl mb-3">🗺</div>
            <p class="text-gray-700 mb-1 font-semibold">{{ providerLabel() }} key set nahi hai</p>
            <p class="text-xs text-gray-500 max-w-md">
              Anjaninex super-admin: <b>Admin → AI Keys → Live Map Provider</b> me key daalo,
              ya provider <b>OpenStreetMap (free)</b> chuno — turant chal jayega.
            </p>
          </div>
        }
      </div>

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
  `,
  styles: [`
    .lm-marker { display:flex; flex-direction:column; align-items:center; cursor:pointer; }
    .lm-dot { width:18px; height:18px; border-radius:50%; border:3px solid #fff; box-shadow:0 1px 5px rgba(0,0,0,.35); }
    .lm-tag { margin-top:2px; background:#fff; color:#1f2937; font-size:11px; font-weight:700; padding:1px 6px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.25); white-space:nowrap; }
  `]
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

  private provider = 'osm';
  private engine: 'google' | 'maplibre' = 'maplibre';
  private map: any = null;
  private markers = new Map<string, any>();
  private trailIds: string[] = [];
  private trailMarkers: any[] = [];
  private mlPopup: any = null;
  private gInfo: any = null;
  private pollTimer: any = null;
  private firstFit = true;
  private colors = ['#5c1a8b', '#f57c00', '#16a34a', '#dc2626', '#0891b2', '#9333ea', '#ea580c', '#2563eb'];

  colorFor(i: number) { return this.colors[i % this.colors.length]; }
  totalPoints() { return this.trails().reduce((s, t) => s + t.points.length, 0); }
  providerLabel() { return this.provider === 'google' ? 'Google Maps' : this.provider === 'ola' ? 'Ola Maps' : 'OpenStreetMap'; }

  ngAfterViewInit() { this.boot(); }
  ngOnDestroy() { this.stopPoll(); if (this.map && this.engine === 'maplibre') this.map.remove(); }

  private async boot() {
    try {
      const res: any = await firstValueFrom(this.svc.mapsKey());
      this.provider = res?.provider || 'osm';
      const key = res?.key || null;
      this.engine = this.provider === 'google' ? 'google' : 'maplibre';

      if (this.provider === 'google') {
        if (!key) { this.noKey.set(true); this.loading.set(false); return; }
        await this.loadGoogle(key);
        this.initGoogle();
      } else if (this.provider === 'ola') {
        if (!key) { this.noKey.set(true); this.loading.set(false); return; }
        await this.loadMapLibre();
        this.initMapLibre('ola', key);
      } else {
        await this.loadMapLibre();
        this.initMapLibre('osm', null);
      }
    } catch (e) {
      console.error('map boot failed', e);
      this.loading.set(false);
      this.noKey.set(true);
    }
  }

  // ---- Library loaders ----
  private loadMapLibre(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof maplibregl !== 'undefined') return resolve();
      if (!document.getElementById('maplibre-css')) {
        const css = document.createElement('link');
        css.id = 'maplibre-css'; css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
        document.head.appendChild(css);
      }
      const ex = document.getElementById('maplibre-js') as HTMLScriptElement | null;
      if (ex) { ex.addEventListener('load', () => resolve()); ex.addEventListener('error', () => reject()); return; }
      const s = document.createElement('script');
      s.id = 'maplibre-js'; s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      s.onload = () => resolve(); s.onerror = () => reject();
      document.head.appendChild(s);
    });
  }
  private loadGoogle(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // google.maps.Map ready ho tabhi resolve — sirf `google.maps` check kaafi nahi tha
      if (typeof google !== 'undefined' && (google.maps as any)?.Map) return resolve();
      // `loading=async` mode me Map constructor seedha nahi milta (importLibrary chahiye hota),
      // isliye classic mode + callback — callback fire hone par pura namespace ready hota hai.
      (window as any).__gmapsReady = () => resolve();
      const ex = document.getElementById('gmaps-js') as HTMLScriptElement | null;
      if (ex) { ex.addEventListener('load', () => setTimeout(() => resolve(), 50)); ex.addEventListener('error', () => reject()); return; }
      const s = document.createElement('script');
      s.id = 'gmaps-js';
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__gmapsReady`;
      s.async = true; s.defer = true;
      s.onerror = () => reject();
      document.head.appendChild(s);
    });
  }

  // ---- Init per engine ----
  private initMapLibre(provider: string, key: string | null) {
    const olaStyle = 'https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json';
    const osmStyle = {
      version: 8,
      sources: { osm: { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
    };
    this.map = new maplibregl.Map({
      container: 'map',
      style: provider === 'ola' ? olaStyle : osmStyle,
      center: [75.7873, 26.9124],
      zoom: 11,
      transformRequest: (url: string) => {
        if (key && url.includes('api.olamaps.io')) {
          const sep = url.includes('?') ? '&' : '?';
          return { url: `${url}${sep}api_key=${encodeURIComponent(key)}` };
        }
        return { url };
      }
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    this.mlPopup = new maplibregl.Popup({ offset: 22 });
    this.map.on('load', () => { this.mapReady.set(true); this.loading.set(false); this.goLive(); });
    this.map.on('error', (e: any) => console.warn('maplibre error', e?.error?.message || e));
  }
  private initGoogle() {
    this.map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 26.9124, lng: 75.7873 }, zoom: 12,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: true
    });
    this.gInfo = new google.maps.InfoWindow();
    this.mapReady.set(true);
    this.loading.set(false);
    this.goLive();
  }

  // ---- LIVE ----
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
      const pts: [number, number][] = [];
      let idx = 0;
      for (const s of staff) {
        seen.add(s.employeeId);
        const lng = +s.longitude, lat = +s.latitude;
        pts.push([lng, lat]);
        const color = this.colorFor(idx++);
        let m = this.markers.get(s.employeeId);
        if (!m) { m = this.createLiveMarker(s, lng, lat, color); this.markers.set(s.employeeId, m); }
        else { this.moveMarker(m, lng, lat); }
      }
      for (const [id, m] of this.markers) { if (!seen.has(id)) { this.removeMarker(m); this.markers.delete(id); } }
      if (this.firstFit && pts.length > 0) { this.fitBounds(pts); this.firstFit = false; }
    } catch (e) { console.error('live poll failed', e); }
  }

  private createLiveMarker(s: LiveStaff, lng: number, lat: number, color: string) {
    if (this.engine === 'google') {
      const marker = new google.maps.Marker({
        position: { lat, lng }, map: this.map, title: s.name, zIndex: 999,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
        label: { text: this.firstName(s.name), color: '#1f2937', fontSize: '11px', fontWeight: '700' }
      });
      marker.addListener('click', () => {
        const cur = this.liveStaff().find(x => x.employeeId === s.employeeId) || s;
        this.gInfo.setContent(`<div style="font-size:13px"><b>${cur.name}</b><br>${cur.minutesAgo <= 1 ? 'abhi' : cur.minutesAgo + ' min pehle'}</div>`);
        this.gInfo.open(this.map, marker);
      });
      return marker;
    }
    const el = document.createElement('div');
    el.className = 'lm-marker';
    el.innerHTML = `<span class="lm-dot" style="background:${color}"></span><span class="lm-tag">${this.firstName(s.name)}</span>`;
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(this.map);
    el.addEventListener('click', () => {
      const cur = this.liveStaff().find(x => x.employeeId === s.employeeId) || s;
      this.mlPopup.setLngLat(marker.getLngLat())
        .setHTML(`<div style="font-size:13px"><b>${cur.name}</b><br>${cur.minutesAgo <= 1 ? 'abhi' : cur.minutesAgo + ' min pehle'}</div>`)
        .addTo(this.map);
    });
    return marker;
  }

  private moveMarker(marker: any, lng: number, lat: number) {
    let fromLng: number, fromLat: number;
    if (this.engine === 'google') { const p = marker.getPosition(); if (!p) { marker.setPosition({ lat, lng }); return; } fromLng = p.lng(); fromLat = p.lat(); }
    else { const p = marker.getLngLat(); fromLng = p.lng; fromLat = p.lat; }
    const dLng = lng - fromLng, dLat = lat - fromLat;
    if (Math.abs(dLng) < 1e-7 && Math.abs(dLat) < 1e-7) return;
    const dur = 900, start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const cl = fromLng + dLng * e, ca = fromLat + dLat * e;
      if (this.engine === 'google') marker.setPosition({ lat: ca, lng: cl }); else marker.setLngLat([cl, ca]);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private removeMarker(marker: any) { if (this.engine === 'google') marker.setMap(null); else marker.remove(); }

  private fitBounds(pts: [number, number][]) {
    if (this.engine === 'google') {
      const b = new google.maps.LatLngBounds();
      pts.forEach(p => b.extend({ lng: p[0], lat: p[1] }));
      this.map.fitBounds(b);
      if (pts.length === 1) this.map.setZoom(15);
    } else {
      const b = new maplibregl.LngLatBounds();
      pts.forEach(p => b.extend(p));
      this.map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 600 });
    }
  }

  private firstName(name: string) { return (name || 'Staff').split(' ')[0]; }

  focus(s: LiveStaff) {
    if (!this.map) return;
    const lng = +s.longitude, lat = +s.latitude;
    if (this.engine === 'google') { this.map.panTo({ lat, lng }); this.map.setZoom(16); }
    else { this.map.flyTo({ center: [lng, lat], zoom: 16 }); }
    const m = this.markers.get(s.employeeId);
    if (m) {
      if (this.engine === 'google') google.maps.event.trigger(m, 'click');
      else this.mlPopup.setLngLat(m.getLngLat()).setHTML(`<div style="font-size:13px"><b>${s.name}</b><br>${s.minutesAgo <= 1 ? 'abhi' : s.minutesAgo + ' min pehle'}</div>`).addTo(this.map);
    }
  }

  // ---- TRAILS ----
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
      const pts: [number, number][] = [];
      let colorIdx = 0, i = 0;
      for (const trail of trails) {
        const color = this.colorFor(colorIdx++);
        if (trail.points.length < 1) continue;
        const coords: [number, number][] = trail.points.map(p => [+p.longitude, +p.latitude]);
        coords.forEach(c => pts.push(c));
        if (coords.length >= 2) this.drawLine(`trail-${i++}`, coords, color);
        this.trailMarkers.push(this.dotMarker(coords[0], '#16a34a'));
        this.trailMarkers.push(this.dotMarker(coords[coords.length - 1], '#dc2626'));
      }
      if (pts.length > 0) this.fitBounds(pts);
    } catch (e) { console.error('Failed to load trails', e); }
    finally { this.loading.set(false); }
  }

  private drawLine(id: string, coords: [number, number][], color: string) {
    if (this.engine === 'google') {
      const line = new google.maps.Polyline({ path: coords.map(c => ({ lng: c[0], lat: c[1] })), strokeColor: color, strokeOpacity: 0.8, strokeWeight: 4, map: this.map });
      this.trailMarkers.push(line);
    } else {
      this.map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
      this.map.addLayer({ id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.8 } });
      this.trailIds.push(id);
    }
  }

  private dotMarker(c: [number, number], color: string) {
    if (this.engine === 'google') {
      return new google.maps.Marker({ position: { lng: c[0], lat: c[1] }, map: this.map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } });
    }
    const el = document.createElement('div');
    el.className = 'lm-marker';
    el.innerHTML = `<span class="lm-dot" style="background:${color}"></span>`;
    return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(c).addTo(this.map);
  }

  private clearTrails() {
    for (const id of this.trailIds) {
      if (this.map.getLayer && this.map.getLayer(id)) this.map.removeLayer(id);
      if (this.map.getSource && this.map.getSource(id)) this.map.removeSource(id);
    }
    this.trailIds = [];
    this.trailMarkers.forEach(m => this.engine === 'google' ? m.setMap(null) : m.remove());
    this.trailMarkers = [];
  }
  private clearLiveMarkers() { for (const [, m] of this.markers) this.removeMarker(m); this.markers.clear(); }

  refresh() { this.mode() === 'live' ? this.pollLive() : this.loadTrails(); }
}
