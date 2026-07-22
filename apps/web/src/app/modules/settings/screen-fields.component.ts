import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { BackButtonComponent } from '../../shared/back-button.component';
import { ToastService } from '../../shared/toast.service';
import { FieldConfigService, FieldSettingRow } from '../../shared/field-config.service';
import { FIELD_REGISTRY, FieldDef } from '../../shared/field-registry';

interface RowVm {
  def: FieldDef;
  visible: boolean;
  required: boolean;
  label: string;
}

/**
 * SCREEN & FIELDS — firm apni screen ke fields khud tay kare.
 *
 * Order-vs-Bill report jaisa accordion: har screen ek row, click karo to uske
 * fields khul jate hain. Har field par teen cheezein: dikhe / zaroori / naam.
 * 🔒 wale field band nahi ho sakte — unke bina screen ka matlab nahi rehta.
 *
 * Naya field code me juda to yahan apne aap aa jayega (registry se aata hai) —
 * is page ko chhedna nahi padta.
 */
@Component({
  selector: 'app-screen-fields',
  standalone: true,
  imports: [CommonModule, FormsModule, BackButtonComponent],
  template: `
    <div class="max-w-5xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Screen &amp; Fields</h2>
          <p class="text-sm text-[#6b3fa0]">
            Screen par click karo — uske fields khulenge. Jo field kaam ka nahi uska tick hata do,
            screen se gayab ho jayega. Data kahin nahi jata, sirf chhupta hai.
          </p>
        </div>
        <button (click)="save()" [disabled]="saving()" class="btn-primary">
          {{ saving() ? 'Save ho raha...' : 'Save' }}
        </button>
      </div>

      <input [ngModel]="search()" (ngModelChange)="search.set($event)"
             placeholder="🔍 field dhoondho (kisi bhi screen me)..." class="input w-full mb-3">

      <!-- Accordion: har screen ek section -->
      @for (s of screens; track s.key) {
        <div class="bg-white rounded-xl border mb-2 overflow-hidden">
          <button (click)="toggle(s.key)"
                  class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-purple-50/50">
            <span class="font-bold text-[#5c1a8b]">
              <span class="inline-block w-4 text-[#9333ea]">{{ isOpen(s.key) ? '▾' : '▸' }}</span>
              {{ s.name }}
            </span>
            <span class="text-xs text-gray-500">{{ onCount(s.key) }}/{{ s.fields.length }} on</span>
          </button>

          @if (isOpen(s.key)) {
            <div class="px-4 pb-4 border-t">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-[11px] text-gray-500 border-b">
                    <th class="py-2">FIELD</th>
                    <th class="py-2 w-20 text-center">DIKHE</th>
                    <th class="py-2 w-20 text-center">ZAROORI</th>
                    <th class="py-2 w-64">NAAM (jo screen par dikhega)</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of rowsFor(s.key); track r.def.key) {
                    <tr class="border-b last:border-0 hover:bg-purple-50/40">
                      <td class="py-2">
                        <span class="font-medium">{{ r.def.label }}</span>
                        @if (r.def.locked) {
                          <span class="ml-1 text-[11px] text-gray-400" title="Ye field band nahi ho sakta">🔒</span>
                        }
                        @if (r.def.hint) {
                          <div class="text-[11px] text-gray-500">{{ r.def.hint }}</div>
                        }
                      </td>
                      <td class="text-center">
                        <input type="checkbox" [(ngModel)]="r.visible" [disabled]="!!r.def.locked">
                      </td>
                      <td class="text-center">
                        <input type="checkbox" [(ngModel)]="r.required" [disabled]="!r.visible">
                      </td>
                      <td>
                        <input [(ngModel)]="r.label" class="input w-full text-sm" [placeholder]="r.def.label">
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (!rowsFor(s.key).length) {
                <p class="text-sm text-gray-500 py-4 text-center">Is naam ka koi field is screen me nahi mila.</p>
              }
            </div>
          }
        </div>
      }

      <p class="text-[11px] text-gray-400 mt-3">
        Aur screens (Bill, Order, GR, Payment, Commission...) ek-ek karke isi list me judte jayenge.
      </p>
    </div>
  `
})
export class ScreenFieldsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  cfg = inject(FieldConfigService);

  screens = FIELD_REGISTRY;
  search = signal('');
  saving = signal(false);
  /** kaunse sections khule hain */
  private open = signal<Set<string>>(new Set());
  /** screen → editable rows (pehli baar kholne par bharta hai) */
  private rowsMap = signal<Map<string, RowVm[]>>(new Map());

  ngOnInit() {
    // Pehla section khula rakho — khali page na dikhe
    if (this.screens.length) this.toggle(this.screens[0].key);
  }

  isOpen(key: string) { return this.open().has(key); }

  toggle(key: string) {
    const s = new Set(this.open());
    if (s.has(key)) { s.delete(key); }
    else {
      s.add(key);
      if (!this.rowsMap().has(key)) {
        const m = new Map(this.rowsMap());
        m.set(key, this.cfg.rowsForScreen(key));
        this.rowsMap.set(m);
      }
    }
    this.open.set(s);
  }

  rowsFor(key: string): RowVm[] {
    const rows = this.rowsMap().get(key) ?? [];
    const q = this.search().trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.def.label.toLowerCase().includes(q) || r.label.toLowerCase().includes(q));
  }

  onCount(key: string): number {
    const rows = this.rowsMap().get(key);
    if (rows) return rows.filter(r => r.visible).length;
    return this.cfg.rowsForScreen(key).filter(r => r.visible).length;
  }

  save() {
    const changed = Array.from(this.rowsMap().entries());
    if (!changed.length) return;
    this.saving.set(true);

    // Har screen apni PUT — ek-ek karke, taaki adhura save na ho
    const saveNext = (i: number) => {
      if (i >= changed.length) {
        this.saving.set(false);
        this.toast.success('Settings save ho gayi — screen turant badal jayegi.');
        return;
      }
      const [screen, rows] = changed[i];
      const payload: FieldSettingRow[] = rows
        .map(r => {
          const visChanged = r.visible !== !r.def.defaultOff;
          const reqChanged = r.required !== !!r.def.defaultRequired;
          const lblChanged = (r.label || '').trim() !== r.def.label && (r.label || '').trim() !== '';
          if (!visChanged && !reqChanged && !lblChanged) return null;
          return {
            screen,
            fieldKey: r.def.key,
            visible: visChanged ? r.visible : null,
            required: reqChanged ? r.required : null,
            label: lblChanged ? (r.label || '').trim() : null
          } as FieldSettingRow;
        })
        .filter((x): x is FieldSettingRow => x !== null);

      this.http.put(`${environment.apiUrl}/api/firm-fields/${screen}`, payload).subscribe({
        next: () => {
          this.cfg.applyLocal(screen, payload);
          saveNext(i + 1);
        },
        error: (e) => {
          this.saving.set(false);
          this.toast.error(e?.error?.error || `${screen} save nahi ho paya. Dobara try karein.`);
        }
      });
    };
    saveNext(0);
  }
}
