import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';
import { FIELD_REGISTRY, FieldDef } from '../../../shared/field-registry';

interface RowVm { def: FieldDef; visible: boolean; required: boolean; label: string; }
interface FirmOpt { id: string; name: string; }
interface SettingRow { screen: string; fieldKey: string; visible?: boolean | null; required?: boolean | null; label?: string | null; }

/**
 * SADMIN › FIRM FIELDS — kisi bhi firm ki Screen & Fields yahan se set karo,
 * aur "Copy from firm" se ek firm ka poora setup doosri me 1 click me daalo
 * (naya client onboard karne ka sabse tez tareeqa).
 *
 * Firm-side page (settings/screen-fields) FieldConfigService (apni firm) use
 * karta hai; yahan hum chuni hui firm ki settings admin API se laate hain aur
 * registry ke saath khud jodte hain.
 */
@Component({
  selector: 'app-admin-firm-fields',
  standalone: true,
  imports: [CommonModule, FormsModule, BackButtonComponent],
  template: `
    <div class="max-w-5xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Firm Fields</h2>
          <p class="text-sm text-[#6b3fa0]">Kisi bhi firm ki screens yahan se set karo — field on/off, zaroori, naam.</p>
        </div>
        <div class="flex gap-2">
          <button (click)="makeDefault()" [disabled]="saving() || !firmId()"
                  class="px-4 py-2 rounded-lg border-2 border-amber-500 text-amber-700 font-bold text-sm hover:bg-amber-50"
                  title="Is firm ka poora setup SAB firms ka default ban jayega — nayi firm ko bhi pehle din se yahi milega">
            ⭐ Sab ka DEFAULT banao
          </button>
          <button (click)="save()" [disabled]="saving() || !firmId()" class="btn-primary">
            {{ saving() ? 'Save ho raha...' : 'Save' }}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label class="text-xs text-gray-500 block mb-1">FIRM</label>
          <select [ngModel]="firmId()" (ngModelChange)="pickFirm($event)" class="input w-64">
            <option value="">— Firm chuno —</option>
            @for (f of firms(); track f.id) { <option [value]="f.id">{{ f.name }}</option> }
          </select>
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">COPY FROM (poora setup is firm se laao)</label>
          <div class="flex gap-2">
            <select [(ngModel)]="copyFromId" class="input w-64">
              <option value="">— Source firm —</option>
              @for (f of firms(); track f.id) {
                @if (f.id !== firmId()) { <option [value]="f.id">{{ f.name }}</option> }
              }
            </select>
            <button (click)="copyFrom()" [disabled]="!copyFromId || !firmId() || saving()"
                    class="px-3 py-2 rounded-lg border border-[#5c1a8b] text-[#5c1a8b] text-sm font-semibold hover:bg-purple-50">
              📋 Copy
            </button>
          </div>
        </div>
      </div>

      @if (!firmId()) {
        <div class="card p-8 text-center text-gray-500">👆 Pehle firm chuno — uski saari screens yahan khul jayengi.</div>
      } @else if (loading()) {
        <div class="card p-8 text-center text-gray-500">⏳ Settings aa rahi hain...</div>
      } @else {
        <input [ngModel]="search()" (ngModelChange)="search.set($event)"
               placeholder="🔍 field dhoondho..." class="input w-full mb-3">

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
                      <th class="py-2 w-64">NAAM</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of rowsFor(s.key); track r.def.key) {
                      <tr class="border-b last:border-0 hover:bg-purple-50/40">
                        <td class="py-2">
                          <span class="font-medium">{{ r.def.label }}</span>
                          @if (r.def.locked) { <span class="ml-1 text-[11px] text-gray-400">🔒</span> }
                          @if (r.def.hint) { <div class="text-[11px] text-gray-500">{{ r.def.hint }}</div> }
                        </td>
                        <td class="text-center"><input type="checkbox" [(ngModel)]="r.visible" [disabled]="!!r.def.locked"></td>
                        <td class="text-center"><input type="checkbox" [(ngModel)]="r.required" [disabled]="!r.visible"></td>
                        <td><input [(ngModel)]="r.label" class="input w-full text-sm" [placeholder]="r.def.label"></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
      }
    </div>
  `
})
export class AdminFirmFieldsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/api/admin/firm-fields`;

  screens = FIELD_REGISTRY;
  firms = signal<FirmOpt[]>([]);
  firmId = signal('');
  copyFromId = '';
  loading = signal(false);
  saving = signal(false);
  search = signal('');
  private open = signal<Set<string>>(new Set());
  private rowsMap = signal<Map<string, RowVm[]>>(new Map());

  ngOnInit() {
    // Firms ki list feature-flags wale endpoint se — wahi already naam+id deta hai.
    this.http.get<{ firms: FirmOpt[] }>(`${environment.apiUrl}/api/admin/feature-flags`).subscribe({
      next: r => this.firms.set(r.firms || []),
      error: () => this.toast.error('Firms ki list nahi aayi. Page refresh karke dekhein.')
    });
  }

  pickFirm(id: string) {
    this.firmId.set(id);
    this.rowsMap.set(new Map());
    this.open.set(new Set());
    if (!id) return;
    this.loading.set(true);
    this.http.get<SettingRow[]>(`${this.base}/${id}`).subscribe({
      next: rows => {
        // registry + firm ke badlaav → editable rows (wahi merge jo FieldConfigService karta hai)
        const byKey = new Map(rows.map(r => [r.screen + '|' + r.fieldKey, r]));
        const m = new Map<string, RowVm[]>();
        for (const s of FIELD_REGISTRY) {
          m.set(s.key, s.fields.map(def => {
            const r = byKey.get(s.key + '|' + def.key);
            return {
              def,
              visible: def.locked ? true : (r?.visible ?? !def.defaultOff),
              required: r?.required ?? !!def.defaultRequired,
              label: (r?.label && r.label.trim()) || def.label
            };
          }));
        }
        this.rowsMap.set(m);
        if (this.screens.length) this.open.set(new Set([this.screens[0].key]));
        this.loading.set(false);
      },
      error: e => {
        this.loading.set(false);
        this.toast.error(e?.error?.error || 'Firm ki settings nahi aayi.');
      }
    });
  }

  isOpen(k: string) { return this.open().has(k); }
  toggle(k: string) {
    const s = new Set(this.open());
    s.has(k) ? s.delete(k) : s.add(k);
    this.open.set(s);
  }

  rowsFor(k: string): RowVm[] {
    const rows = this.rowsMap().get(k) ?? [];
    const q = this.search().trim().toLowerCase();
    return q ? rows.filter(r => r.def.label.toLowerCase().includes(q) || r.label.toLowerCase().includes(q)) : rows;
  }

  onCount(k: string): number {
    return (this.rowsMap().get(k) ?? []).filter(r => r.visible).length;
  }

  save() {
    const firmId = this.firmId();
    if (!firmId) return;
    const entries = Array.from(this.rowsMap().entries());
    this.saving.set(true);
    const next = (i: number) => {
      if (i >= entries.length) {
        this.saving.set(false);
        this.toast.success('Firm ki settings save ho gayi.');
        return;
      }
      const [screen, rows] = entries[i];
      // Poore rows — default layer ke upar firm ki setting poori tarah shadow kare
      const payload = rows.map(r => ({
        screen, fieldKey: r.def.key,
        visible: r.def.locked ? true : r.visible,
        required: r.required,
        label: (r.label || '').trim() || r.def.label
      }));
      this.http.put(`${this.base}/${firmId}/${screen}`, payload).subscribe({
        next: () => next(i + 1),
        error: e => { this.saving.set(false); this.toast.error(e?.error?.error || `${screen} save fail.`); }
      });
    };
    next(0);
  }

  /** ⭐ Chuni hui firm ka setup PLATFORM DEFAULT bana do — sab firms + nayi firms ke liye. */
  makeDefault() {
    const from = this.firmId();
    if (!from) return;
    const name = this.firms().find(f => f.id === from)?.name || 'is firm';
    if (!confirm(`"${name}" ka POORA Screen & Fields setup SAB firms ka DEFAULT ban jayega.\n\n` +
                 `• Jin firms ne apni setting khud badli hai, unki apni hi rahegi\n` +
                 `• Baaki sab + har NAYI firm ko yahi setup milega\n\nPakka?`)) return;
    this.saving.set(true);
    this.http.post<{ saved: number }>(`${this.base}/make-default?fromFirmId=${from}`, {}).subscribe({
      next: r => {
        this.saving.set(false);
        this.toast.success(`⭐ Default set ho gaya (${r.saved} fields) — ab har firm ko yahi milega.`);
      },
      error: e => { this.saving.set(false); this.toast.error(e?.error?.error || 'Default set nahi hua.'); }
    });
  }

  copyFrom() {
    const to = this.firmId(), from = this.copyFromId;
    if (!to || !from) return;
    if (!confirm('Source firm ka POORA fields-setup is firm par chadh jayega (purana overwrite). Pakka?')) return;
    this.saving.set(true);
    this.http.post(`${this.base}/copy?fromFirmId=${from}&toFirmId=${to}`, {}).subscribe({
      next: () => { this.saving.set(false); this.toast.success('Copy ho gaya.'); this.pickFirm(to); },
      error: e => { this.saving.set(false); this.toast.error(e?.error?.error || 'Copy fail.'); }
    });
  }
}
