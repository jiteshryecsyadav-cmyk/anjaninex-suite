import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

export interface Godown {
  id: string;
  name: string;
  mobile: string;
  state: string | null; city: string | null; address: string | null; pincode: string | null;
  photoUrl: string | null;
  isMain: boolean;
  isActive: boolean;
}
type SaveGodown = Omit<Godown, 'id'>;

@Component({
  selector: 'mfg-godowns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-top-bar">
      <input class="input max-w-[280px]" placeholder="🔍 naam ya shehar se dhoondho"
             [(ngModel)]="search" (ngModelChange)="load()">
      <label class="flex items-center gap-2 text-xs text-gray-500 font-bold">
        <input type="checkbox" [(ngModel)]="showBand" (ngModelChange)="load()"
               class="w-4 h-4 accent-[#1B2E5C]">
        band kiye hue bhi dikhao
      </label>
      @if (auth.can('masters.office.create.firm')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ NAYI JAGAH</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Koi jagah nahi mili</div>
    } @else {
      <div class="space-y-2">
        @for (g of rows(); track g.id) {
          <div class="card flex gap-3 items-center" [class.opacity-60]="!g.isActive">
            <div class="w-11 h-11 rounded-xl bg-anjaninex-navy-soft grid place-items-center text-xl">🏬</div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm">
                {{ g.name }}
                @if (g.isMain) {
                  <span class="chip bg-anjaninex-red text-white ml-1">MAIN</span>
                }
                @if (!g.isActive) { <span class="chip bg-slate-100 text-slate-500 ml-1">BAND</span> }
              </div>
              <div class="text-xs text-slate-500">📞 {{ g.mobile }}</div>
              <div class="text-xs text-slate-500">
                {{ g.address || '' }}@if (g.city) { · {{ g.city }} }
              </div>
            </div>
            @if (auth.can('masters.office.edit.firm')) {
              <div class="flex gap-2 shrink-0">
                <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openEdit(g)">BADLO</button>
                <button class="text-[11px] font-bold text-anjaninex-red" (click)="toggle(g)">
                  {{ g.isActive ? 'BAND KARO' : 'CHALU KARO' }}</button>
              </div>
            }
          </div>
        }
      </div>
    }

    @if (form()) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="form.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-3">
            {{ editId() ? 'Jagah badlo' : 'Nayi jagah' }}</h3>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="label" style="color:#DC2626">Jagah ka naam *</label>
              <input class="input" [(ngModel)]="form()!.name" placeholder="Main Godown / Surat Office">
            </div>
            <div>
              <label class="label" style="color:#DC2626">Mobile *</label>
              <input class="input" [(ngModel)]="form()!.mobile" inputmode="numeric" placeholder="10 ank">
            </div>
            <div><label class="label">Pincode</label>
              <input class="input" [(ngModel)]="form()!.pincode"></div>
            <div><label class="label">Shehar</label>
              <input class="input" [(ngModel)]="form()!.city"></div>
            <div><label class="label">Rajya</label>
              <input class="input" [(ngModel)]="form()!.state"></div>
            <div class="col-span-2"><label class="label">Pata</label>
              <textarea class="input" rows="2" [(ngModel)]="form()!.address"></textarea></div>
          </div>

          <label class="flex gap-2.5 mt-4 p-3 rounded-lg bg-anjaninex-navy-soft cursor-pointer">
            <input type="checkbox" [(ngModel)]="form()!.isMain"
                   class="w-4 h-4 mt-0.5 accent-[#1B2E5C]">
            <span class="text-sm">
              <b>Ye MAIN jagah hai</b><br>
              <span class="text-[11.5px] text-gray-600">
                Nayi entry me yahi pehle se chuni aayegi. MAIN sirf ek ho sakti hai —
                doosri par tick lagaenge to yahan se apne aap hat jayegi.
              </span>
            </span>
          </label>

          <div class="flex gap-2 mt-5">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : 'SAVE KARO' }}</button>
            <button class="btn-line" (click)="form.set(null)">Cancel</button>
          </div>
        </div>
      </div>
    }
  `
})
export class GodownsComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg/godowns`;
  auth = inject(AuthService);

  rows = signal<Godown[]>([]);
  loading = signal(true);
  err = signal('');
  search = '';
  showBand = false;

  form = signal<SaveGodown | null>(null);
  editId = signal<string | null>(null);
  formErr = signal('');
  saving = signal(false);

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.search) q.set('search', this.search);
    if (this.showBand) q.set('includeInactive', 'true');

    this.http.get<Godown[]>(`${this.base}?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => {
        this.err.set(e?.error?.error ?? 'List nahi aa payi — dobara koshish kijiye');
        this.loading.set(false);
      }
    });
  }

  openNew() {
    this.editId.set(null);
    this.formErr.set('');
    this.form.set({
      name: '', mobile: '', state: null, city: null, address: null, pincode: null,
      photoUrl: null,
      // Pehli jagah apne aap MAIN — warna koi default hi nahi hota
      isMain: this.rows().length === 0,
      isActive: true
    });
  }

  openEdit(g: Godown) {
    this.editId.set(g.id);
    this.formErr.set('');
    const { id, ...rest } = g;
    this.form.set({ ...rest });
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    const id = this.editId();
    const req = id
      ? this.http.put<{ id: string }>(`${this.base}/${id}`, f)
      : this.http.post<{ id: string }>(this.base, f);

    req.subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  toggle(g: Godown) {
    this.http.post(`${this.base}/${g.id}/toggle`, {}).subscribe({
      next: () => this.load(),
      // "MAIN jagah band nahi hoti" / "abhi maal pada hai" — yahin dikhega
      error: e => this.err.set(e?.error?.error ?? 'Nahi ho paya')
    });
  }
}
