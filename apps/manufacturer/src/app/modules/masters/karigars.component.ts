import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Karigar, KarigarService, SaveKarigar } from './karigar.service';
import { AuthService } from '../../core/auth.service';

const JOB_TYPES = ['Cutting', 'Silai / Stitching', 'Finishing', 'Dyeing / Rangai',
                   'Printing', 'Embroidery / Kaam', 'Washing', 'Packing'];

@Component({
  selector: 'mfg-karigars',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-top-bar">
      <input class="input max-w-[280px]" placeholder="🔍 naam ya mobile se dhoondho"
             [(ngModel)]="search" (ngModelChange)="load()">
      <label class="flex items-center gap-2 text-xs text-gray-500 font-bold">
        <input type="checkbox" [(ngModel)]="showBand" (ngModelChange)="load()"
               class="w-4 h-4 accent-[#1B2E5C]">
        band kiye hue bhi dikhao
      </label>
      @if (auth.can('masters.karigar.create.firm')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">＋ NAYA KARIGAR</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Koi karigar nahi mila</div>
    } @else {
      <div class="space-y-2">
        @for (k of rows(); track k.id) {
          <div class="card flex gap-3 items-center" [class.opacity-60]="!k.isActive">
            <div class="w-11 h-11 rounded-xl bg-anjaninex-navy-soft grid place-items-center text-xl">🧑‍🏭</div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm">
                {{ k.name }}
                @if (!k.isActive) { <span class="chip bg-slate-100 text-slate-500 ml-1">BAND</span> }
              </div>
              <div class="text-xs text-slate-500">
                @if (k.firmName) { {{ k.firmName }} · } 📞 {{ k.mobile }}
              </div>
              <div class="text-xs text-slate-500">
                🛠️ {{ k.jobType }}@if (k.city) { · {{ k.city }} }@if (k.agentName) { · agent: {{ k.agentName }} }
              </div>
            </div>
            <div class="text-right shrink-0">
              @if (k.majooriBaki > 0) {
                <div class="font-extrabold text-anjaninex-red">₹{{ k.majooriBaki | number:'1.0-0' }}</div>
                <div class="text-[11px] text-slate-500">majoori baki</div>
              } @else {
                <div class="text-[11px] font-bold text-emerald-700">khata saaf</div>
              }
              @if (auth.can('masters.karigar.edit.firm')) {
                <div class="flex gap-2 justify-end mt-1.5">
                  <button class="text-[11px] font-bold text-anjaninex-navy" (click)="openEdit(k)">BADLO</button>
                  <button class="text-[11px] font-bold text-anjaninex-red" (click)="toggle(k)">
                    {{ k.isActive ? 'BAND KARO' : 'CHALU KARO' }}</button>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- ── Form ── -->
    @if (form()) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
           (click)="form.set(null)">
        <div class="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-5"
             (click)="$event.stopPropagation()">
          <h3 class="font-extrabold text-anjaninex-navy text-lg mb-3">
            {{ editId() ? 'Karigar badlo' : 'Naya karigar' }}</h3>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="label" style="color:#DC2626">Poora naam *</label>
              <input class="input" [(ngModel)]="form()!.name" placeholder="Chintan Bhai">
            </div>
            <div>
              <label class="label" style="color:#DC2626">Mobile *</label>
              <input class="input" [(ngModel)]="form()!.mobile" inputmode="numeric" placeholder="10 ank">
            </div>
            <div>
              <label class="label">Firm ka naam</label>
              <input class="input" [(ngModel)]="form()!.firmName" placeholder="Chintan Tailors">
            </div>
            <div class="col-span-2">
              <label class="label" style="color:#DC2626">Kaam kaunsa karta hai *</label>
              <select class="input" [(ngModel)]="form()!.jobType">
                <option value="">— kaam chuniye —</option>
                @for (j of jobTypes; track j) { <option [value]="j">{{ j }}</option> }
              </select>
            </div>
            <div><label class="label">Shehar</label>
              <input class="input" [(ngModel)]="form()!.city"></div>
            <div><label class="label">Rajya</label>
              <input class="input" [(ngModel)]="form()!.state"></div>
            <div class="col-span-2"><label class="label">Pata</label>
              <input class="input" [(ngModel)]="form()!.address"></div>
            <div><label class="label">GST</label>
              <input class="input font-mono uppercase" [(ngModel)]="form()!.gstin"></div>
            <div><label class="label">PAN</label>
              <input class="input font-mono uppercase" [(ngModel)]="form()!.pan"></div>
          </div>

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
export class KarigarsComponent {
  private svc = inject(KarigarService);
  auth = inject(AuthService);

  jobTypes = JOB_TYPES;

  rows = signal<Karigar[]>([]);
  loading = signal(true);
  err = signal('');
  search = '';
  showBand = false;

  form = signal<SaveKarigar | null>(null);
  editId = signal<string | null>(null);
  formErr = signal('');
  saving = signal(false);

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    this.err.set('');
    this.svc.list(this.search, this.showBand).subscribe({
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
      name: '', firmName: null, mobile: '', jobType: '', agentId: null,
      state: null, city: null, address: null, pincode: null,
      gstin: null, gstType: null, pan: null, photoUrl: null, isActive: true
    });
  }

  openEdit(k: Karigar) {
    this.editId.set(k.id);
    this.formErr.set('');
    const { id, agentName, majooriBaki, ...rest } = k;
    this.form.set({ ...rest });
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    const id = this.editId();
    const req = id ? this.svc.update(id, f) : this.svc.create(f);

    req.subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => {
        // API Hinglish message bhejti hai (FriendlyError) — wahi dikhao
        this.formErr.set(e?.error?.error ?? 'Save nahi hua');
        this.saving.set(false);
      }
    });
  }

  toggle(k: Karigar) {
    this.svc.toggle(k.id).subscribe({
      next: () => this.load(),
      // "Iske paas 3 job slip abhi chal rahi hai" jaisa message yahin dikhega
      error: e => this.err.set(e?.error?.error ?? 'Nahi ho paya')
    });
  }
}
