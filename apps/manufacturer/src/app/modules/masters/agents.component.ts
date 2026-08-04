import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

export interface Agent {
  id: string;
  name: string;
  agencyName: string | null;
  mobile: string;
  isKarigarAgent: boolean;
  state: string | null; city: string | null; address: string | null; pincode: string | null;
  gstin: string | null; gstType: string | null; pan: string | null; photoUrl: string | null;
  visibility: string;
  isActive: boolean;
  /** Iske through kitne karigar aaye. */
  karigarCount: number;
}
type SaveAgent = Omit<Agent, 'id' | 'karigarCount'>;

@Component({
  selector: 'mfg-agents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Do tarah ke agent — alag-alag dekhna sabse zaroori kaam hai -->
    <div class="flex gap-1 mb-3 text-sm font-bold">
      @for (t of tabs; track t.key) {
        <button (click)="kind.set(t.key); load()"
                class="px-4 py-1.5 rounded-lg transition"
                [class]="kind() === t.key
                  ? 'bg-anjaninex-navy text-white'
                  : 'bg-white text-anjaninex-navy hover:bg-anjaninex-navy-soft'">
          {{ t.label }}
        </button>
      }
    </div>

    <div class="page-top-bar">
      <input class="input max-w-[280px]" placeholder="🔍 naam ya mobile se dhoondho"
             [(ngModel)]="search" (ngModelChange)="load()">
      <label class="flex items-center gap-2 text-xs text-gray-500 font-bold">
        <input type="checkbox" [(ngModel)]="showBand" (ngModelChange)="load()"
               class="w-4 h-4 accent-[#1B2E5C]">
        band kiye hue bhi dikhao
      </label>
      @if (auth.can('masters.agent.create.firm')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ NAYA AGENT</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Koi agent nahi mila</div>
    } @else {
      <div class="space-y-2">
        @for (a of rows(); track a.id) {
          <div class="card flex gap-3 items-center" [class.opacity-60]="!a.isActive">
            <div class="w-11 h-11 rounded-xl bg-anjaninex-navy-soft grid place-items-center text-xl">🤝</div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm">
                {{ a.name }}
                @if (!a.isActive) { <span class="chip bg-slate-100 text-slate-500 ml-1">BAND</span> }
              </div>
              <div class="text-xs text-slate-500">
                @if (a.agencyName) { {{ a.agencyName }} · } 📞 {{ a.mobile }}
              </div>
              <div class="text-xs text-slate-500">
                {{ a.city || '—' }}@if (a.karigarCount) { · {{ a.karigarCount }} karigar jude hain }
              </div>
            </div>
            <div class="text-right shrink-0">
              <span class="chip"
                    [class]="a.isKarigarAgent
                      ? 'bg-amber-50 text-amber-700' : 'bg-anjaninex-navy-soft text-anjaninex-navy'">
                {{ a.isKarigarAgent ? '🧑‍🏭 karigar wala' : '🏢 grahak wala' }}
              </span>
              @if (auth.can('masters.agent.edit.firm')) {
                <div class="flex gap-2 justify-end mt-1.5">
                  <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openEdit(a)">BADLO</button>
                  <button class="text-[11px] font-bold text-anjaninex-red" (click)="toggle(a)">
                    {{ a.isActive ? 'BAND KARO' : 'CHALU KARO' }}</button>
                </div>
              }
            </div>
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
            {{ editId() ? 'Agent badlo' : 'Naya agent' }}</h3>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="label" style="color:#DC2626">Agent ka naam *</label>
              <input class="input" [(ngModel)]="form()!.name" placeholder="Mahendra Pandey">
            </div>
            <div>
              <label class="label" style="color:#DC2626">Mobile *</label>
              <input class="input" [(ngModel)]="form()!.mobile" inputmode="numeric" placeholder="10 ank">
            </div>
            <div>
              <label class="label">Agency ka naam</label>
              <input class="input" [(ngModel)]="form()!.agencyName" placeholder="Pandey Agency">
            </div>
            <div><label class="label">Shehar</label>
              <input class="input" [(ngModel)]="form()!.city"></div>
            <div><label class="label">Rajya</label>
              <input class="input" [(ngModel)]="form()!.state"></div>
            <div><label class="label">GST</label>
              <input class="input font-mono uppercase" [(ngModel)]="form()!.gstin"></div>
            <div><label class="label">PAN</label>
              <input class="input font-mono uppercase" [(ngModel)]="form()!.pan"></div>
          </div>

          <!-- Ye tick sabse zaroori hai — isi se tay hota hai naam kis khaane
               me dikhega. Isliye SAVE ke bilkul upar rakha hai. -->
          <label class="flex gap-2.5 mt-4 p-3 rounded-lg bg-anjaninex-navy-soft cursor-pointer">
            <input type="checkbox" [(ngModel)]="form()!.isKarigarAgent"
                   class="w-4 h-4 mt-0.5 accent-[#1B2E5C]">
            <span class="text-sm">
              <b>Ye karigar ka agent hai</b><br>
              <span class="text-[11.5px] text-gray-600">
                Tick karenge to ye naam job slip / karigar wale khaane me aayega, grahak wale me nahi
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
export class AgentsComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg/agents`;
  auth = inject(AuthService);

  tabs = [
    { key: '',        label: 'Sab' },
    { key: 'grahak',  label: '🏢 Grahak wale' },
    { key: 'karigar', label: '🧑‍🏭 Karigar wale' }
  ];
  kind = signal('');

  rows = signal<Agent[]>([]);
  loading = signal(true);
  err = signal('');
  search = '';
  showBand = false;

  form = signal<SaveAgent | null>(null);
  editId = signal<string | null>(null);
  formErr = signal('');
  saving = signal(false);

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams();
    if (this.search) q.set('search', this.search);
    if (this.kind()) q.set('kind', this.kind());
    if (this.showBand) q.set('includeInactive', 'true');

    this.http.get<Agent[]>(`${this.base}?${q}`).subscribe({
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
      name: '', agencyName: null, mobile: '',
      // Jis tab par khade hain wahi tick pehle se — sabse aam kaam yahi hai
      isKarigarAgent: this.kind() === 'karigar',
      state: null, city: null, address: null, pincode: null,
      gstin: null, gstType: null, pan: null, photoUrl: null,
      visibility: 'all', isActive: true
    });
  }

  openEdit(a: Agent) {
    this.editId.set(a.id);
    this.formErr.set('');
    const { id, karigarCount, ...rest } = a;
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

  toggle(a: Agent) {
    this.http.post(`${this.base}/${a.id}/toggle`, {}).subscribe({
      next: () => this.load(),
      error: e => this.err.set(e?.error?.error ?? 'Nahi ho paya')
    });
  }
}
