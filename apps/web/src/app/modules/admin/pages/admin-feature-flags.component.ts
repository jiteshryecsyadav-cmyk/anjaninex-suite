import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../shared/toast.service';

interface FlagFirm { id: string; name: string; }
interface Flag {
  key: string; name: string; description: string | null;
  enabledAll: boolean; firmIds: string[];
}

/**
 * FEATURE FLAGS — pilot/rollout switch-board.
 * Naya feature pehle pilot firm (jaise Riddhi Agency) me on karo, test karo,
 * fir "Sab firms" master switch on kar do. Code chhedne ki zaroorat nahi.
 */
@Component({
  selector: 'app-admin-feature-flags',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-5xl mx-auto p-4">
      <div class="mb-5">
        <h2 class="font-display font-black text-2xl text-[#1B2E5C]">🧪 Feature Flags</h2>
        <p class="text-sm text-gray-500">Naya feature pehle pilot firm me test karo, fir sab ko do — bina code badle</p>
      </div>

      @if (loading()) { <div class="p-8 text-center text-gray-500">Loading…</div> }
      @else if (flags().length === 0) { <div class="p-8 text-center text-gray-500">Koi flag nahi</div> }
      @else {
        @for (f of flags(); track f.key) {
          <div class="bg-white rounded-xl border border-[#D6DDEA] p-4 mb-4">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div class="font-bold text-[#1B2E5C]">{{ f.name }}</div>
                <div class="text-xs text-gray-500 font-mono">{{ f.key }}</div>
                @if (f.description) { <div class="text-sm text-gray-600 mt-1">{{ f.description }}</div> }
              </div>
              <!-- Master switch: sab firms -->
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <span class="text-sm font-bold" [class]="f.enabledAll ? 'text-green-700' : 'text-gray-500'">
                  {{ f.enabledAll ? '✅ SAB FIRMS ME ON' : 'Sab firms' }}
                </span>
                <input type="checkbox" class="w-5 h-5 accent-green-600"
                       [checked]="f.enabledAll" (change)="toggleAll(f, $any($event.target).checked)">
              </label>
            </div>

            @if (!f.enabledAll) {
              <div class="mt-3 pt-3 border-t border-dashed border-[#D6DDEA]">
                <div class="text-xs font-bold uppercase text-[#4A5878] mb-2">
                  Pilot firms ({{ f.firmIds.length }}) — sirf inme feature on hai
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-1">
                  @for (firm of firms(); track firm.id) {
                    <label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#FAF7F0] cursor-pointer text-sm">
                      <input type="checkbox" class="accent-[#1B2E5C]"
                             [checked]="f.firmIds.includes(firm.id)"
                             (change)="toggleFirm(f, firm, $any($event.target).checked)">
                      <span [class.font-bold]="f.firmIds.includes(firm.id)">{{ firm.name }}</span>
                      @if (f.firmIds.includes(firm.id)) { <span class="text-xs text-green-700 font-bold">PILOT</span> }
                    </label>
                  }
                </div>
              </div>
            } @else {
              <p class="text-xs text-green-700 mt-2">Ye feature ab har firm ke liye chalu hai — pilot list ki zaroorat nahi.</p>
            }
          </div>
        }
      }
    </div>
  `
})
export class AdminFeatureFlagsComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/api/admin/feature-flags`;

  flags = signal<Flag[]>([]);
  firms = signal<FlagFirm[]>([]);
  loading = signal(true);

  ngOnInit() { this.load(); }

  load() {
    this.http.get<{ flags: Flag[]; firms: FlagFirm[] }>(this.base).subscribe({
      next: r => { this.flags.set(r.flags); this.firms.set(r.firms); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.error('Flags load nahi hue'); }
    });
  }

  toggleAll(f: Flag, enabled: boolean) {
    // Optimistic update
    this.flags.update(list => list.map(x => x.key === f.key ? { ...x, enabledAll: enabled } : x));
    this.http.post(`${this.base}/${f.key}/all`, { enabled }).subscribe({
      next: () => this.toast.success(enabled ? `"${f.name}" ab SAB firms me on` : `"${f.name}" sab firms se off — sirf pilot firms me chalega`),
      error: () => { this.toast.error('Save nahi hua'); this.load(); }
    });
  }

  toggleFirm(f: Flag, firm: FlagFirm, enabled: boolean) {
    this.flags.update(list => list.map(x => x.key === f.key
      ? { ...x, firmIds: enabled ? [...x.firmIds, firm.id] : x.firmIds.filter(id => id !== firm.id) }
      : x));
    this.http.post(`${this.base}/${f.key}/firm`, { firmId: firm.id, enabled }).subscribe({
      next: () => this.toast.success(`${firm.name}: "${f.name}" ${enabled ? 'ON' : 'OFF'}`),
      error: () => { this.toast.error('Save nahi hua'); this.load(); }
    });
  }
}
