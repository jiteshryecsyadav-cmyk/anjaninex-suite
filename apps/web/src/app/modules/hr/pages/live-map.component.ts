import { Component, inject, signal, computed, AfterViewInit, OnDestroy } from '@angular/core';
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
          <button (click)="refresh()" [disabled]="refreshing()" class="btn-primary text-sm">
            {{ refreshing() ? '⏳ …' : '↻ Refresh' }}
          </button>
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
            @for (s of liveStaff(); track s.employeeId) {
              <button (click)="focus(s)" class="card text-left flex items-center gap-3 hover:shadow-md transition">
                <span class="w-3 h-3 rounded-full shrink-0" [style.background]="colorOfStatus(statusOf(s))"></span>
                <div class="min-w-0">
                  <div class="font-bold text-sm truncate">{{ s.name }}</div>
                  <div class="text-xs" [style.color]="colorOfStatus(statusOf(s))">
                    {{ labelOfStatus(statusOf(s)) }}
                    <span class="text-gray-500">· {{ s.minutesAgo <= 1 ? 'abhi' : s.minutesAgo + ' min pehle' }}</span>
                    <!-- Trail nahi mila to ye check-in wali jagah hai, chalta-firta nahi -->
                    @if (s.source === 'checkin') { <span class="text-[#6b3fa0]">· 📍 check-in par</span> }
                  </div>
                </div>
              </button>
            }
          </div>
          <!-- Rang ka matlab — malik ko ek nazar me samajh aaye -->
          <div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-600">
            <span><span class="inline-block w-2.5 h-2.5 rounded-full align-middle" style="background:#16a34a"></span> chal raha hai</span>
            <span><span class="inline-block w-2.5 h-2.5 rounded-full align-middle" style="background:#f59e0b"></span> ek jagah khada</span>
            <span><span class="inline-block w-2.5 h-2.5 rounded-full align-middle" style="background:#dc2626"></span> location band (3 min se ping nahi)</span>
          </div>
        } @else if (!loading()) {
          <div class="card mt-4 text-center text-gray-500">
            Abhi koi staff map par nahi hai. Aaj ka check-in ho aur uske saath location aayi ho
            tabhi staff yahan dikhta hai; chalta-firta (moving) marker sirf mobile app ke
            location-tracking se banta hai.
          </div>
        }
      }

      @if (mode()==='trails') {
        <!-- ▶ PLAYBACK — din ka rasta chalta hua dekho (Google Timeline jaisa) -->
        @if (pbPoints().length > 1) {
          <div class="card mt-4">
            <div class="flex items-center gap-3 flex-wrap">
              <button (click)="pbToggle()" class="btn-primary text-sm w-24">
                {{ pbPlaying() ? '⏸ Rok' : '▶ Chalao' }}
              </button>

              @if (trails().length > 1) {
                <select [ngModel]="pbStaff()" (ngModelChange)="pbPickStaff($event)" class="input w-44 text-sm">
                  @for (t of trails(); track t.employeeId) {
                    <option [value]="t.employeeId">{{ staffName(t.employeeId) }}</option>
                  }
                </select>
              }

              <div class="flex gap-1">
                @for (sp of [1, 2, 4, 8]; track sp) {
                  <button (click)="pbSpeed.set(sp)"
                          class="px-2 py-1 text-xs rounded border"
                          [class.bg-\[#5c1a8b\]]="pbSpeed() === sp"
                          [class.text-white]="pbSpeed() === sp">{{ sp }}x</button>
                }
              </div>

              <div class="text-sm font-bold text-[#5c1a8b] ml-auto">
                🕐 {{ pbTimeLabel() }}
                <span class="text-gray-500 font-normal">· {{ pbIndex() + 1 }}/{{ pbPoints().length }}</span>
              </div>
            </div>

            <input type="range" class="w-full mt-3" min="0" [max]="pbPoints().length - 1"
                   [value]="pbIndex()" (input)="pbSeek($any($event.target).value)">
            <div class="flex justify-between text-xs text-gray-500">
              <span>{{ pbLabelAt(0) }}</span>
              <span>{{ pbLabelAt(pbPoints().length - 1) }}</span>
            </div>
            <p class="text-xs mt-2" [class.text-green-700]="snappedAny()" [class.text-gray-500]="!snappedAny()">
              {{ snappedAny()
                  ? '🛣️ Rasta asli sadak par bithaya gaya hai'
                  : '📍 Kachche GPS point — do point ke beech seedhi lakeer hai, asli rasta thoda alag ho sakta hai' }}
            </p>
          </div>
        }

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
    /* Google Maps jaisa: gol point, chalte waqt teer (arrow) aur pheelti hui laher */
    .lm-pin { position:relative; display:flex; align-items:center; justify-content:center; width:22px; height:22px; }
    .lm-pulse { position:absolute; inset:0; border-radius:50%; opacity:0; }
    .lm-dot { position:relative; width:20px; height:20px; border-radius:50%; border:3px solid #fff;
      box-shadow:0 1px 5px rgba(0,0,0,.35); display:flex; align-items:center; justify-content:center;
      background:#9ca3af; transition:background .35s ease; }
    .lm-arrow { display:none; width:0; height:0; border-left:4px solid transparent;
      border-right:4px solid transparent; border-bottom:8px solid #fff; transition:transform .6s ease; }
    .lm-tag { margin-top:2px; background:#fff; color:#1f2937; font-size:11px; font-weight:700; padding:1px 6px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.25); white-space:nowrap; }

    /* 🟢 chal raha · 🟠 khada hai · 🔴 location band */
    .lm-marker[data-status="move"] .lm-dot { background:#16a34a; }
    .lm-marker[data-status="move"] .lm-arrow { display:block; }
    .lm-marker[data-status="move"] .lm-pulse { background:rgba(22,163,74,.45); animation:lm-pulse 1.6s ease-out infinite; }
    .lm-marker[data-status="idle"] .lm-dot { background:#f59e0b; }
    .lm-marker[data-status="idle"] .lm-pulse { background:rgba(245,158,11,.35); animation:lm-pulse 2.8s ease-out infinite; }
    .lm-marker[data-status="off"] .lm-dot { background:#dc2626; }
    .lm-marker[data-status="off"] .lm-tag { opacity:.7; }
    @keyframes lm-pulse { 0% { transform:scale(1); opacity:.65; } 100% { transform:scale(3.2); opacity:0; } }
  `]
})
export class LiveMapComponent implements AfterViewInit, OnDestroy {
  private svc = inject(HrService);

  loading = signal(true);
  refreshing = signal(false);
  mapReady = signal(false);
  noKey = signal(false);
  mode = signal<'live' | 'trails'>('live');
  liveStaff = signal<LiveStaff[]>([]);
  trails = signal<{ employeeId: string; name?: string; points: LocationPoint[] }[]>([]);
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

  // ---- 🚦 STAFF KI HAALAT (Google Maps jaisa rang) ----
  // 🟢 chal raha · 🟠 ek jagah khada · 🔴 location band (ping aana ruk gayi)
  // Poll har 5 sec chalta hai par ping har 45 sec aati hai — isliye chalna/rukna
  // sirf NAYI ping par tay hota hai, warna har poll par rang bhadakta rehta.
  private liveState = new Map<string, { lng: number; lat: number; at: string; heading: number; moving: boolean }>();

  statusOf(s: LiveStaff): 'move' | 'idle' | 'off' {
    if (s.minutesAgo > 3) return 'off';                 // 45-sec wali ping ruk gayi
    return this.liveState.get(s.employeeId)?.moving ? 'move' : 'idle';
  }
  colorOfStatus(st: 'move' | 'idle' | 'off') {
    return st === 'move' ? '#16a34a' : st === 'idle' ? '#f59e0b' : '#dc2626';
  }
  labelOfStatus(st: 'move' | 'idle' | 'off') {
    return st === 'move' ? 'chal raha hai' : st === 'idle' ? 'ek jagah khada' : 'location band';
  }

  /** Do point ke beech ki doori (meter) — chal raha hai ya nahi, yahi batata hai. */
  private distM(lng1: number, lat1: number, lng2: number, lat2: number) {
    const R = 6371000, rad = (d: number) => d * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /** Kis disha me ja raha hai (0-360) — teer isi taraf ghoomta hai. */
  private bearing(lng1: number, lat1: number, lng2: number, lat2: number) {
    const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => r * 180 / Math.PI;
    const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
    const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
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
      for (const s of staff) {
        seen.add(s.employeeId);
        const lng = +s.longitude, lat = +s.latitude;
        pts.push([lng, lat]);

        // NAYI ping aayi tabhi chalna/rukna aur disha dobara naapo
        const prev = this.liveState.get(s.employeeId);
        let heading = prev?.heading ?? 0;
        let moving = prev?.moving ?? false;
        if (!prev) {
          moving = (+(s.speed ?? 0)) > 0.7;
        } else if (prev.at !== s.capturedAt) {
          const moved = this.distM(prev.lng, prev.lat, lng, lat);
          if (moved > 8) heading = this.bearing(prev.lng, prev.lat, lng, lat);
          moving = moved > 12 || (+(s.speed ?? 0)) > 0.7;   // GPS ka jitter 12m tak chhodo
        }
        this.liveState.set(s.employeeId, { lng, lat, at: s.capturedAt, heading, moving });

        const status = this.statusOf(s);
        let m = this.markers.get(s.employeeId);
        if (!m) { m = this.createLiveMarker(s, lng, lat, this.colorOfStatus(status)); this.markers.set(s.employeeId, m); }
        else { this.moveMarker(m, lng, lat); }
        this.applyStatus(m, status, heading);
      }
      for (const [id, m] of this.markers) { if (!seen.has(id)) { this.removeMarker(m); this.markers.delete(id); this.liveState.delete(id); } }
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
    el.innerHTML =
      `<div class="lm-pin"><span class="lm-pulse"></span>` +
      `<span class="lm-dot"><i class="lm-arrow"></i></span></div>` +
      `<span class="lm-tag">${this.firstName(s.name)}</span>`;
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(this.map);
    el.addEventListener('click', () => {
      const cur = this.liveStaff().find(x => x.employeeId === s.employeeId) || s;
      this.mlPopup.setLngLat(marker.getLngLat())
        .setHTML(`<div style="font-size:13px"><b>${cur.name}</b><br>${cur.minutesAgo <= 1 ? 'abhi' : cur.minutesAgo + ' min pehle'}</div>`)
        .addTo(this.map);
    });
    return marker;
  }

  /** Marker ka rang + teer ki disha har poll par taaza karo. */
  private applyStatus(marker: any, status: 'move' | 'idle' | 'off', heading: number) {
    const color = this.colorOfStatus(status);
    if (this.engine === 'google') {
      marker.setIcon(status === 'move'
        ? { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 5, rotation: heading,
            fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }
        : { path: google.maps.SymbolPath.CIRCLE, scale: 9,
            fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 });
      return;
    }
    const el: HTMLElement = marker.getElement();
    if (!el) return;
    el.dataset['status'] = status;
    const arrow = el.querySelector('.lm-arrow') as HTMLElement | null;
    if (arrow) arrow.style.transform = `rotate(${heading}deg)`;
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
    // Ek hi staff / ek hi jagah ho to fitBounds map ko itna zoom kar deta tha ki
    // sirf khali salaiti khane dikhte the. Aise me seedha center + tay zoom.
    if (pts.length === 1 || this.sameSpot(pts)) {
      const [lng, lat] = pts[0];
      if (this.engine === 'google') { this.map.setCenter({ lat, lng }); this.map.setZoom(16); }
      else this.map.easeTo({ center: [lng, lat], zoom: 16, duration: 600 });
      return;
    }
    if (this.engine === 'google') {
      const b = new google.maps.LatLngBounds();
      pts.forEach(p => b.extend({ lng: p[0], lat: p[1] }));
      this.map.fitBounds(b);
    } else {
      const b = new maplibregl.LngLatBounds();
      pts.forEach(p => b.extend(p));
      this.map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 600 });
    }
  }

  /** Saare point ek hi jagah (~50m ke andar) hain? Tab zoom bandhna padta hai. */
  private sameSpot(pts: [number, number][]) {
    if (pts.length < 2) return true;
    const [lng0, lat0] = pts[0];
    return pts.every(p => Math.abs(p[0] - lng0) < 0.0005 && Math.abs(p[1] - lat0) < 0.0005);
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
      // Playback nayi tareekh ke liye shuru se
      this.pbReset();
      if (trails.length > 0 && !trails.some(t => t.employeeId === this.pbStaff()))
        this.pbStaff.set(trails[0].employeeId);
      const pts: [number, number][] = [];
      let colorIdx = 0, i = 0;
      this.snappedAny.set(false);
      for (const trail of trails) {
        const color = this.colorFor(colorIdx++);
        if (trail.points.length < 1) continue;
        const raw: [number, number][] = trail.points.map(p => [+p.longitude, +p.latitude]);
        raw.forEach(c => pts.push(c));

        // 🛣️ Line ko ASLI SADAK par bithao — warna do point ke beech seedhi lakeer
        // makaanon ke beech se nikalti dikhti hai. Na ho paye to kachchi line hi.
        let coords = raw;
        if (raw.length >= 2) {
          try {
            const r = await firstValueFrom(this.svc.snapToRoad(
              trail.points.map(p => ({ latitude: +p.latitude, longitude: +p.longitude }))));
            if (r?.snapped && r.points?.length >= 2) {
              coords = r.points.map(p => [+p.longitude, +p.latitude]);
              this.snappedAny.set(true);
            }
          } catch { /* snap na ho to kachchi line — rasta dikhna band nahi hona chahiye */ }
          this.drawLine(`trail-${i++}`, coords, color);
        }
        // Shuruaat/ant ke nishan hamesha ASLI point par (snap ki hui line par nahi)
        this.trailMarkers.push(this.dotMarker(raw[0], '#16a34a'));
        this.trailMarkers.push(this.dotMarker(raw[raw.length - 1], '#dc2626'));
      }
      if (pts.length > 0) this.fitBounds(pts);
    } catch (e) { console.error('Failed to load trails', e); }
    finally { this.loading.set(false); }
  }

  // ======================= ▶ PLAYBACK =======================
  // Din ka rasta chalta hua — marker point-dar-point aage badhta hai, saath me
  // us waqt ka time. Do point ke beech ka gap chhota rakha hai (asli 45 sec ko
  // 1.2 sec me dikhate hain), warna 6 ghante ki duty dekhne me 6 ghante lagte.
  snappedAny = signal(false);   // line asli sadak par bithai gayi ya kachchi hai
  pbPlaying = signal(false);
  pbIndex = signal(0);
  pbSpeed = signal(1);
  pbStaff = signal<string>('');
  private pbTimer: any = null;
  private pbMarker: any = null;

  /** Chune hue staff ke us din ke saare point (time ke kram me). */
  pbPoints = computed(() => {
    const id = this.pbStaff();
    const t = this.trails().find(x => x.employeeId === id) ?? this.trails()[0];
    return t?.points ?? [];
  });

  staffName(employeeId: string) {
    return this.trails().find(t => t.employeeId === employeeId)?.name
        ?? this.liveStaff().find(s => s.employeeId === employeeId)?.name
        ?? 'Staff';
  }

  pbLabelAt(i: number) {
    const p = this.pbPoints()[i];
    if (!p) return '—';
    return new Date(p.capturedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  pbTimeLabel() { return this.pbLabelAt(this.pbIndex()); }

  pbPickStaff(id: string) {
    this.pbStop();
    this.pbStaff.set(id);
    this.pbIndex.set(0);
    this.pbShow(0);
  }

  pbToggle() { this.pbPlaying() ? this.pbStop() : this.pbPlay(); }

  private pbPlay() {
    const pts = this.pbPoints();
    if (pts.length < 2) return;
    if (this.pbIndex() >= pts.length - 1) this.pbIndex.set(0);   // ant par ho to shuru se
    this.pbPlaying.set(true);
    const tick = () => {
      if (!this.pbPlaying()) return;
      const i = this.pbIndex() + 1;
      if (i >= this.pbPoints().length) { this.pbStop(); return; }
      this.pbIndex.set(i);
      this.pbShow(i);
      this.pbTimer = setTimeout(tick, 1200 / this.pbSpeed());
    };
    this.pbTimer = setTimeout(tick, 1200 / this.pbSpeed());
  }

  private pbStop() {
    this.pbPlaying.set(false);
    if (this.pbTimer) { clearTimeout(this.pbTimer); this.pbTimer = null; }
  }

  pbSeek(v: string | number) {
    this.pbStop();
    const i = Math.max(0, Math.min(this.pbPoints().length - 1, +v));
    this.pbIndex.set(i);
    this.pbShow(i);
  }

  /** Playback ka marker us point par le jao (aur map usko peechha kare). */
  private pbShow(i: number) {
    const p = this.pbPoints()[i];
    if (!p || !this.map) return;
    const lng = +p.longitude, lat = +p.latitude;

    if (!this.pbMarker) {
      if (this.engine === 'google') {
        this.pbMarker = new google.maps.Marker({
          position: { lat, lng }, map: this.map, zIndex: 9999,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#5c1a8b',
                  fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 }
        });
      } else {
        const el = document.createElement('div');
        el.className = 'lm-marker';
        el.innerHTML = `<div class="lm-pin"><span class="lm-pulse" style="background:rgba(92,26,139,.45);animation:lm-pulse 1.6s ease-out infinite"></span>` +
                       `<span class="lm-dot" style="background:#5c1a8b"></span></div>`;
        this.pbMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(this.map);
      }
    } else {
      this.moveMarker(this.pbMarker, lng, lat);
    }

    // Marker screen se bahar na jaye — dheere se peechha karo
    if (this.engine === 'google') this.map.panTo({ lat, lng });
    else this.map.easeTo({ center: [lng, lat], duration: 600 });
  }

  private pbReset() {
    this.pbStop();
    this.pbIndex.set(0);
    if (this.pbMarker) {
      if (this.engine === 'google') this.pbMarker.setMap(null); else this.pbMarker.remove();
      this.pbMarker = null;
    }
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

  // Refresh = naya data + map ko markers par wapas le jao. Pehle sirf data aata
  // tha, map apni jagah khada rehta tha — lagta tha button kharab hai.
  async refresh() {
    this.refreshing.set(true);
    if (this.mode() === 'live') {
      this.firstFit = true;        // poll ke baad markers par zoom ho
      await this.pollLive();
    } else {
      this.loadTrails();
    }
    setTimeout(() => this.refreshing.set(false), 400);
  }
}
