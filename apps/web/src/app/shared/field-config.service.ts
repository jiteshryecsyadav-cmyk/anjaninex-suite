import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { FieldDef, findField, SCREEN_BY_KEY, splitFieldPath } from './field-registry';

export interface FieldSettingRow {
  screen: string;
  fieldKey: string;
  visible?: boolean | null;
  required?: boolean | null;
  label?: string | null;
}

/**
 * FieldConfigService — registry (code) + firm ki settings (DB) mila kar batata
 * hai ki kaunsa field dikhega, zaroori hai ya nahi, aur uska naam kya hai.
 *
 * Settings me row na ho to registry ka default chalta hai — isliye naya field
 * jodne par kuch aur karne ki zarurat nahi.
 */
@Injectable({ providedIn: 'root' })
export class FieldConfigService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/firm-fields`;

  /** 'screen|field' → row */
  private rows = signal<Map<string, FieldSettingRow>>(new Map());
  loaded = signal(false);
  /** har badlaav par badhta hai — *fld directive isi ko sunti hai */
  revision = signal(0);

  private static k(screen: string, field: string) { return screen + '|' + field; }

  /** App startup par ek baar — FeatureService ke saath. Reset/reload ke baad bhi. */
  load(done?: () => void) {
    this.http.get<FieldSettingRow[]>(this.base).subscribe({
      next: rows => {
        const m = new Map<string, FieldSettingRow>();
        for (const r of rows) m.set(FieldConfigService.k(r.screen, r.fieldKey), r);
        this.rows.set(m);
        this.loaded.set(true);
        this.revision.update(v => v + 1);
        done?.();
      },
      // Settings na aayen to app rukna nahi chahiye — sab default par chalega.
      error: () => { this.loaded.set(true); done?.(); }
    });
  }

  /** Settings page save karne ke baad — dobara server se poochhe bina turant asar. */
  applyLocal(screen: string, saved: FieldSettingRow[]) {
    const m = new Map(this.rows());
    for (const key of Array.from(m.keys())) {
      if (key.startsWith(screen + '|')) m.delete(key);
    }
    for (const r of saved) m.set(FieldConfigService.k(screen, r.fieldKey), r);
    this.rows.set(m);
    this.revision.update(v => v + 1);
  }

  private row(screen: string, field: string) {
    return this.rows().get(FieldConfigService.k(screen, field));
  }

  /** Poori screen on hai? (Master menu se chhupane ke liye) */
  screenOn(screen: string): boolean {
    return this.row(screen, '*')?.visible !== false;
  }

  /** Field dikhega? — 'group_master.incentive_pct' ya (screen, field) dono chalte hain. */
  show(path: string, field?: string): boolean {
    const { screen, fieldKey, def } = this.resolve(path, field);
    if (!def) return true;              // registry me nahi hai → chhupana nahi
    if (def.locked) return true;        // band ho hi nahi sakta
    if (!this.screenOn(screen)) return false;
    const r = this.row(screen, fieldKey);
    if (r?.visible != null) return r.visible;
    return !def.defaultOff;
  }

  /** Field zaroori hai? */
  required(path: string, field?: string): boolean {
    const { screen, fieldKey, def } = this.resolve(path, field);
    if (!def) return false;
    const r = this.row(screen, fieldKey);
    if (r?.required != null) return r.required;
    return !!def.defaultRequired;
  }

  /** Field ka naam — firm ne badla ho to wahi, warna registry wala. */
  label(path: string, field?: string): string {
    const { screen, fieldKey, def } = this.resolve(path, field);
    const r = this.row(screen, fieldKey);
    return (r?.label && r.label.trim()) || def?.label || fieldKey;
  }

  /** Settings page ke liye — ek screen ke saare fields, current values ke saath. */
  rowsForScreen(screen: string): { def: FieldDef; visible: boolean; required: boolean; label: string }[] {
    const s = SCREEN_BY_KEY.get(screen);
    if (!s) return [];
    return s.fields.map(def => ({
      def,
      visible: this.show(screen, def.key),
      required: this.required(screen, def.key),
      label: this.label(screen, def.key)
    }));
  }

  /**
   * ZAROORI ki rok — save se pehle bulao. Jo fields firm ne "zaroori" tick kiye
   * hain aur khali hain, unke NAAM wapas milte hain (Hinglish error ke liye).
   * Chhupa hua field kabhi zaroori nahi maana jata — jo dikh hi nahi raha use
   * bharne ko kehna bemaani hai.
   */
  missingRequired(screen: string, values: Record<string, unknown>): string[] {
    const missing: string[] = [];
    for (const [key, val] of Object.entries(values)) {
      if (!this.show(screen, key)) continue;
      if (!this.required(screen, key)) continue;
      const empty = val === null || val === undefined
        || (typeof val === 'string' && val.trim() === '')
        || (typeof val === 'number' && val === 0);
      if (empty) missing.push(this.label(screen, key));
    }
    return missing;
  }

  private resolve(path: string, field?: string) {
    const screen = field ? path : splitFieldPath(path).screen;
    const fieldKey = field ?? splitFieldPath(path).field;
    return { screen, fieldKey, def: findField(screen, fieldKey) };
  }
}
