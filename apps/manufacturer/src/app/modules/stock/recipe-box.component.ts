import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Item } from './items.component';

interface RecipeMaterial {
  id: string; materialId: string; materialName: string; materialRate: number;
  avgQty: number; unit: string; cost: number;
}
interface Recipe {
  id: string; designId: string; part: string; jobRate: number; rateUnit: string;
  materials: RecipeMaterial[]; materialCost: number; partCost: number;
}
interface DesignCost {
  designId: string; designName: string; saleRate: number;
  parts: Recipe[]; totalCost: number; margin: number;
}

const PARTS = ['Top', 'Bottom', 'Dupatta', 'Blouse', 'Lining', 'Full Set'];

/**
 * Design ka nuskha — HISSE ke hisab se.
 *
 * Ek suit ke teen hisse hote hain aur teeno ka kapda alag, majoori alag.
 * Neeche ek piece ki asli lagat dikhti hai — daam tay karte waqt sabse kaam ki
 * ginti. Ghaata ho to laal.
 */
@Component({
  selector: 'mfg-recipe-box',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
         (click)="closed.emit()">
      <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-auto p-5"
           (click)="$event.stopPropagation()">

        <div class="flex items-start gap-3 mb-4">
          <div>
            <h3 class="font-extrabold text-anjaninex-navy text-lg">🧪 {{ design().name }} ka nuskha</h3>
            <p class="text-xs text-gray-500">
              Har hisse ka apna kapda aur apni majoori. Job slip me hissa chunte hi
              ye material apne aap bhar jayega.
            </p>
          </div>
          <button class="ml-auto text-2xl text-slate-400" (click)="closed.emit()">✕</button>
        </div>

        @if (err()) {
          <div class="card border-l-4 border-anjaninex-red text-anjaninex-red text-sm mb-3">{{ err() }}</div>
        }

        @if (loading()) {
          <div class="text-center text-gray-500 py-8 text-sm">Ruk jaiye…</div>
        } @else {

          @for (p of cost()?.parts ?? []; track p.part) {
            <div class="border border-[color:var(--ax-border)] rounded-xl p-3 mb-3">
              <div class="flex items-center gap-2 mb-2">
                <span class="font-extrabold text-anjaninex-navy">{{ p.part }}</span>
                <span class="text-xs text-gray-500">majoori ₹{{ p.jobRate }} / {{ p.rateUnit }}</span>
                <button class="ml-auto text-[11px] font-bold text-anjaninex-navy"
                        (click)="edit(p)">BADLO</button>
                <button class="text-[11px] font-bold text-anjaninex-red"
                        (click)="remove(p.part)">HATAO</button>
              </div>
              <table class="w-full text-xs">
                <tr class="text-gray-500 text-left">
                  <th class="font-semibold pb-1">Material</th>
                  <th class="font-semibold pb-1">Ek piece me</th>
                  <th class="font-semibold pb-1 text-right">Daam</th>
                </tr>
                @for (m of p.materials; track m.id) {
                  <tr class="border-t border-[color:var(--ax-border)]">
                    <td class="py-1">{{ m.materialName }}</td>
                    <td class="py-1">{{ m.avgQty }} {{ m.unit }} × ₹{{ m.materialRate }}</td>
                    <td class="py-1 text-right font-semibold">₹{{ m.cost | number:'1.0-2' }}</td>
                  </tr>
                }
                <tr class="border-t border-[color:var(--ax-border)] font-bold">
                  <td class="py-1" colspan="2">Is hisse ki lagat (kapda + majoori)</td>
                  <td class="py-1 text-right">₹{{ p.partCost | number:'1.0-2' }}</td>
                </tr>
              </table>
            </div>
          }

          @if ((cost()?.parts ?? []).length === 0) {
            <div class="text-center text-slate-400 py-6 text-sm">
              Abhi koi hissa nahi joda
            </div>
          }

          <button class="btn-line w-full mb-4" (click)="addNew()">＋ HISSA JODO</button>

          <!-- Ek piece ki lagat — daam tay karte waqt sabse kaam ki ginti -->
          @if ((cost()?.parts ?? []).length) {
            <div class="rounded-xl p-3 bg-anjaninex-navy-soft">
              <div class="flex justify-between text-sm font-bold text-anjaninex-navy">
                <span>Ek piece ki lagat</span>
                <span>₹{{ cost()!.totalCost | number:'1.0-2' }}</span>
              </div>
              @if (cost()!.saleRate) {
                <div class="flex justify-between text-sm font-extrabold mt-1"
                     [class]="cost()!.margin < 0 ? 'text-anjaninex-red' : 'text-emerald-700'">
                  <span>{{ cost()!.margin < 0 ? 'GHAATA' : 'BACHAT' }}
                        (₹{{ cost()!.saleRate }} me bech kar)</span>
                  <span>₹{{ abs(cost()!.margin) | number:'1.0-2' }}</span>
                </div>
              } @else {
                <div class="text-[11px] text-gray-600 mt-1">
                  Design ka daam tay nahi hua — bachat ka hisaab tabhi dikhega
                </div>
              }
            </div>
          }
        }

        <!-- ── Hissa banao / badlo ── -->
        @if (form()) {
          <div class="mt-4 border-t-2 border-anjaninex-navy pt-4">
            <div class="grid grid-cols-3 gap-3 mb-3">
              <div><label class="label">Hissa</label>
                <select class="input" [(ngModel)]="form()!.part" [disabled]="!!editPart()">
                  @for (p of parts; track p) { <option [value]="p">{{ p }}</option> }
                </select></div>
              <div><label class="label">Majoori ₹</label>
                <input class="input" type="number" [(ngModel)]="form()!.jobRate"></div>
              <div><label class="label">Per</label>
                <select class="input" [(ngModel)]="form()!.rateUnit">
                  @for (u of ['Pcs','Meter','Kg','Set']; track u) { <option [value]="u">{{ u }}</option> }
                </select></div>
            </div>

            @for (m of form()!.materials; track $index) {
              <div class="flex gap-2 mb-2 items-end">
                <div class="flex-1">
                  <label class="label">Material</label>
                  <select class="input" [(ngModel)]="m.materialId">
                    <option [ngValue]="null">— chuniye —</option>
                    @for (mat of materials(); track mat.id) {
                      <option [ngValue]="mat.id">{{ mat.name }} (₹{{ mat.defaultRate }})</option>
                    }
                  </select>
                </div>
                <div class="w-28">
                  <label class="label">Ek piece me</label>
                  <input class="input" type="number" step="0.001" [(ngModel)]="m.avgQty">
                </div>
                <div class="w-24">
                  <label class="label">Unit</label>
                  <select class="input" [(ngModel)]="m.unit">
                    @for (u of ['Meter','Kg','Pcs','Than']; track u) { <option [value]="u">{{ u }}</option> }
                  </select>
                </div>
                <button class="text-anjaninex-red font-bold pb-2.5"
                        (click)="form()!.materials.splice($index,1)">✕</button>
              </div>
            }

            <button class="btn-line btn-sm mb-3" (click)="addMat()">＋ MATERIAL JODO</button>

            @if (formErr()) {
              <div class="text-anjaninex-red text-sm font-bold mb-2">{{ formErr() }}</div>
            }

            <div class="flex gap-2">
              <button class="btn-primary flex-1" [disabled]="saving()" (click)="save()">
                {{ saving() ? 'Ruk jaiye…' : 'HISSA SAVE KARO' }}</button>
              <button class="btn-line" (click)="form.set(null)">Cancel</button>
            </div>
          </div>
        }
      </div>
    </div>
  `
})
export class RecipeBoxComponent {
  design = input.required<Item>();
  closed = output<void>();

  private http = inject(HttpClient);
  parts = PARTS;
  abs = Math.abs;

  cost = signal<DesignCost | null>(null);
  materials = signal<Item[]>([]);
  loading = signal(true);
  err = signal('');

  form = signal<any | null>(null);
  editPart = signal<string | null>(null);
  formErr = signal('');
  saving = signal(false);

  constructor() {
    queueMicrotask(() => {
      this.load();
      this.http.get<Item[]>(`${environment.apiUrl}/api/mfg/items?kind=material`)
        .subscribe({ next: m => this.materials.set(m), error: () => {} });
    });
  }

  private url() { return `${environment.apiUrl}/api/mfg/designs/${this.design().id}/recipe`; }

  load() {
    this.loading.set(true);
    this.http.get<DesignCost>(this.url()).subscribe({
      next: c => { this.cost.set(c); this.loading.set(false); },
      error: e => { this.err.set(e?.error?.error ?? 'Nuskha nahi aa paya'); this.loading.set(false); }
    });
  }

  addNew() {
    this.editPart.set(null);
    this.formErr.set('');
    // Jo hisse pehle se hain wo dobara nahi — DB par bhi unique hai
    const used = new Set((this.cost()?.parts ?? []).map(p => p.part));
    const free = PARTS.find(p => !used.has(p)) ?? PARTS[0];
    this.form.set({ part: free, jobRate: 0, rateUnit: 'Pcs', materials: [] });
  }

  edit(p: Recipe) {
    this.editPart.set(p.part);
    this.formErr.set('');
    this.form.set({
      part: p.part, jobRate: p.jobRate, rateUnit: p.rateUnit,
      materials: p.materials.map(m => ({ materialId: m.materialId, avgQty: m.avgQty, unit: m.unit }))
    });
  }

  addMat() {
    this.form()!.materials.push({ materialId: null, avgQty: 0, unit: 'Meter' });
    this.form.set({ ...this.form()! });
  }

  save() {
    const f = this.form();
    if (!f) return;

    if (f.materials.some((m: any) => !m.materialId)) {
      this.formErr.set('Koi line me material chuna hi nahi gaya');
      return;
    }
    this.saving.set(true);
    this.formErr.set('');

    this.http.put(this.url(), f).subscribe({
      next: () => { this.saving.set(false); this.form.set(null); this.load(); },
      error: e => { this.formErr.set(e?.error?.error ?? 'Save nahi hua'); this.saving.set(false); }
    });
  }

  remove(part: string) {
    this.http.delete(`${this.url()}/${encodeURIComponent(part)}`).subscribe({
      next: () => this.load(),
      error: e => this.err.set(e?.error?.error ?? 'Nahi hata')
    });
  }
}
