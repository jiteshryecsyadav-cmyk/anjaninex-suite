import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { RecipeBoxComponent } from './recipe-box.component';

export interface Item {
  id: string;
  itemKind: 'design' | 'material';
  code: string | null;
  name: string;
  hsnSac: string | null;
  taxRate: number;
  unit: string;
  defaultRate: number;
  category: string | null;
  notes: string | null;
  photoUrl: string | null;
  colourHint: string | null;
  minStockQty: number | null;
  minOrderQty: number | null;
  setPieces: number | null;
  showOutOfStock: boolean;
  samplePrice: number | null;
  sampleSource: string | null;
  isActive: boolean;
  onHand: number;
  isLow: boolean;
  tags: string[];
}

const UNITS = ['PCS', 'Meter', 'Kg', 'Than', 'Set'];

@Component({
  selector: 'mfg-items',
  standalone: true,
  imports: [CommonModule, FormsModule, RecipeBoxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
      <input class="input max-w-[240px]" placeholder="🔍 naam ya code se dhoondho"
             [(ngModel)]="search" (ngModelChange)="load()">

      @if (kind() === 'design' && allTags().length) {
        <select class="input max-w-[170px]" [(ngModel)]="tag" (ngModelChange)="load()">
          <option value="">🏷️ saare tag</option>
          @for (t of allTags(); track t) { <option [value]="t">{{ t }}</option> }
        </select>
      }

      <!-- "Kaunsa maal khatam hone wala hai" — sabse zyada poocha jane wala sawal -->
      <label class="flex items-center gap-2 text-xs font-bold"
             [class]="lowOnly ? 'text-anjaninex-red' : 'text-gray-500'">
        <input type="checkbox" [(ngModel)]="lowOnly" (ngModelChange)="load()"
               class="w-4 h-4 accent-[#DC2626]">
        sirf khatam hone wala
      </label>

      @if (auth.can('stock.design.create.firm')) {
        <button class="btn-primary btn-sm ml-auto" (click)="openNew()">
          ＋ {{ kind() === 'material' ? 'NAYA MATERIAL' : 'NAYA DESIGN' }}</button>
      }
    </div>

    @if (err()) {
      <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
    }

    @if (loading()) {
      <div class="text-center text-gray-500 py-10 text-sm">Ruk jaiye…</div>
    } @else if (rows().length === 0) {
      <div class="text-center text-slate-400 py-10 text-sm">Kuch nahi mila</div>
    } @else {
      <div class="space-y-2">
        @for (i of rows(); track i.id) {
          <div class="card flex gap-3 items-center" [class.opacity-60]="!i.isActive">
            <!-- Material par rang ka gol nishaan — naam padhne se pehle pehchan -->
            <div class="w-11 h-11 rounded-xl grid place-items-center text-xl shrink-0"
                 [style.background]="i.colourHint ? i.colourHint + '22' : '#E8ECF5'"
                 [style.border]="i.colourHint ? '2px solid ' + i.colourHint : 'none'">
              {{ i.itemKind === 'material' ? '🧵' : '🥻' }}
            </div>

            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm">
                {{ i.name }}
                @if (i.code) { <span class="text-slate-400 font-mono text-xs ml-1">{{ i.code }}</span> }
                @if (!i.isActive) { <span class="chip bg-slate-100 text-slate-500 ml-1">BAND</span> }
              </div>
              <div class="text-xs text-slate-500">
                {{ i.defaultRate ? '₹' + i.defaultRate : 'daam tay nahi' }} / {{ i.unit }}
                @if (i.hsnSac) { · HSN {{ i.hsnSac }} }
                @if (i.setPieces) { · set me {{ i.setPieces }} }
              </div>
              @if (i.tags.length) {
                <div class="flex gap-1 mt-1 flex-wrap">
                  @for (t of i.tags; track t) {
                    <span class="chip bg-anjaninex-navy-soft text-anjaninex-navy">{{ t }}</span>
                  }
                </div>
              }
            </div>

            <div class="text-right shrink-0">
              <div class="font-extrabold" [class]="i.isLow ? 'text-anjaninex-red' : 'text-anjaninex-navy'">
                {{ i.onHand | number:'1.0-2' }}</div>
              <div class="text-[11px] text-slate-500">
                @if (i.isLow) {
                  <span class="text-anjaninex-red font-bold">⚠️ {{ i.minStockQty }} se kam</span>
                } @else { stock }
              </div>
              @if (auth.can('stock.design.edit.firm')) {
                <div class="flex gap-2 justify-end mt-1.5">
                  @if (i.itemKind === 'design') {
                    <button class="text-[11px] font-bold text-anjaninex-navy"
                            (click)="recipeFor.set(i)">🧪 RECIPE</button>
                  }
                  <button class="text-[11px] font-bold text-anjaninex-navy"
                          (click)="openEdit(i)">BADLO</button>
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
            {{ editId() ? 'Badlo' : (form()!.itemKind === 'material' ? 'Naya material' : 'Naya design') }}</h3>

          @if (formErr()) {
            <div class="text-anjaninex-red text-sm font-bold mb-3">{{ formErr() }}</div>
          }

          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="label" style="color:#DC2626">Naam *</label>
              <input class="input" [(ngModel)]="form()!.name"
                     [placeholder]="form()!.itemKind === 'material' ? 'Rayon 14kg' : 'DES-7234'">
            </div>
            <div><label class="label">Code</label>
              <input class="input font-mono" [(ngModel)]="form()!.code"></div>
            <div><label class="label">Unit</label>
              <select class="input" [(ngModel)]="form()!.unit">
                @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
              </select></div>
            <div><label class="label">Rate ₹</label>
              <input class="input" type="number" [(ngModel)]="form()!.defaultRate"></div>
            <div><label class="label">HSN</label>
              <input class="input font-mono" [(ngModel)]="form()!.hsnSac"></div>
            <div><label class="label">GST %</label>
              <select class="input" [(ngModel)]="form()!.taxRate">
                @for (g of [0,5,12,18,28]; track g) { <option [ngValue]="g">{{ g }}%</option> }
              </select></div>
            <div>
              <label class="label">Stock itne se kam ho to batao</label>
              <input class="input" type="number" [(ngModel)]="form()!.minStockQty">
            </div>

            @if (form()!.itemKind === 'material') {
              <div class="col-span-2"><label class="label">Rang ka nishaan</label>
                <input class="input h-10 p-1" type="color" [(ngModel)]="form()!.colourHint">
                <p class="text-[11px] text-gray-500 mt-1">
                  List me gol nishaan banega — naam padhne se pehle pehchan aa jati hai</p>
              </div>
            } @else {
              <div><label class="label">Set me kitne piece</label>
                <input class="input" type="number" [(ngModel)]="form()!.setPieces"></div>
              <div><label class="label">Kam se kam order (MOQ)</label>
                <input class="input" type="number" [(ngModel)]="form()!.minOrderQty"></div>
              <div class="col-span-2"><label class="label">Tag (comma se)</label>
                <input class="input" [(ngModel)]="tagText"
                       placeholder="cotton, party wear, silk"></div>
            }

            <div class="col-span-2"><label class="label">Note</label>
              <input class="input" [(ngModel)]="form()!.notes"></div>
          </div>

          <div class="flex gap-2 mt-5">
            <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Ruk jaiye…' : 'SAVE KARO' }}</button>
            <button class="btn-line" (click)="form.set(null)">Cancel</button>
          </div>
        </div>
      </div>
    }

    <!-- ── Recipe ── -->
    @if (recipeFor(); as d) {
      <mfg-recipe-box [design]="d" (closed)="recipeFor.set(null); load()" />
    }
  `
})
export class ItemsComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/mfg/items`;
  auth = inject(AuthService);

  tabs: { key: 'design' | 'material'; label: string }[] = [
    { key: 'design',   label: '🥻 Design' },
    { key: 'material', label: '🧵 Material' }
  ];
  kind = signal<'design' | 'material'>('design');
  units = UNITS;

  rows = signal<Item[]>([]);
  allTags = signal<string[]>([]);
  loading = signal(true);
  err = signal('');
  search = '';
  tag = '';
  lowOnly = false;

  form = signal<any | null>(null);
  editId = signal<string | null>(null);
  formErr = signal('');
  saving = signal(false);
  tagText = '';

  recipeFor = signal<Item | null>(null);

  constructor() {
    this.load();
    this.http.get<string[]>(`${this.base}/tags`).subscribe({
      next: t => this.allTags.set(t), error: () => {}
    });
  }

  load() {
    this.loading.set(true);
    this.err.set('');
    const q = new URLSearchParams({ kind: this.kind() });
    if (this.search) q.set('search', this.search);
    if (this.tag) q.set('tag', this.tag);
    if (this.lowOnly) q.set('lowOnly', 'true');

    this.http.get<Item[]>(`${this.base}?${q}`).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => {
        this.err.set(e?.error?.error ?? 'List nahi aa payi');
        this.loading.set(false);
      }
    });
  }

  openNew() {
    this.editId.set(null);
    this.formErr.set('');
    this.tagText = '';
    this.form.set({
      itemKind: this.kind(), code: null, name: '',
      hsnSac: null, taxRate: 5, unit: this.kind() === 'material' ? 'Meter' : 'PCS',
      defaultRate: 0, category: null, notes: null,
      photoUrl: null, colourHint: '#1B2E5C',
      minStockQty: null, minOrderQty: null, setPieces: null,
      showOutOfStock: false, samplePrice: null, sampleSource: null,
      tags: [], isActive: true
    });
  }

  openEdit(i: Item) {
    this.editId.set(i.id);
    this.formErr.set('');
    this.tagText = i.tags.join(', ');
    const { id, onHand, isLow, ...rest } = i;
    this.form.set({ ...rest });
  }

  save() {
    const f = this.form();
    if (!f) return;
    this.saving.set(true);
    this.formErr.set('');

    const body = {
      ...f,
      tags: this.tagText.split(',').map(t => t.trim()).filter(Boolean)
    };
    const id = this.editId();
    const req = id
      ? this.http.put<{ id: string }>(`${this.base}/${id}`, body)
      : this.http.post<{ id: string }>(this.base, body);

    req.subscribe({
      next: () => {
        this.saving.set(false); this.form.set(null); this.load();
        this.http.get<string[]>(`${this.base}/tags`).subscribe({ next: t => this.allTags.set(t) });
      },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }
}
