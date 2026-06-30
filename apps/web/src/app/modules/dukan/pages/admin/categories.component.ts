import { Component, inject, signal } from '@angular/core';
import { DukanService } from '../../dukan.service';
import { Category } from '../../models';

@Component({
  selector: 'app-categories',
  standalone: true,
  template: `
  <div class="row" style="justify-content:space-between;margin-bottom:14px">
    <h2 style="font-size:18px">Categories Master</h2>
    <button class="btn sm" (click)="openForm()">+ Add Category</button>
  </div>

  @if (editing()) {
    <div class="card" style="padding:18px;margin-bottom:18px">
      <h3 style="margin-bottom:8px">{{ form.id ? 'Edit' : 'New' }} Category</h3>
      <div class="formgrid">
        <div><label>Category Name *</label><input [value]="form.name" (input)="form.name=$any($event.target).value" placeholder="e.g. Electronics & Gadgets"></div>
        <div><label>Status</label>
          <select [value]="form.status" (change)="form.status=$any($event.target).value">
            <option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <label>Parent Category <span style="font-weight:400;color:var(--muted)">(optional — sub-category banane ke liye choose karein)</span></label>
      <select [value]="form.parentId || ''" (change)="form.parentId = $any($event.target).value || null">
        <option value="">— Top-level category —</option>
        @for (p of parentOptions(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
      </select>
      <label>Description</label>
      <input [value]="form.desc" (input)="form.desc=$any($event.target).value" placeholder="Short description (optional)">
      <div class="row" style="margin-top:14px;gap:10px">
        <button class="btn sm" (click)="save()">Save</button>
        <button class="btn ghost sm" (click)="editing.set(false)">Cancel</button>
      </div>
    </div>
  }

  <div class="card" style="padding:6px 16px">
    <table class="tbl">
      <tr><th>Name</th><th>Parent</th><th>Status</th><th></th></tr>
      @for (c of sortedCats(); track c.id) {
        <tr>
          <td [style.padding-left.px]="c.parentId ? 26 : 12"><b>{{ c.parentId ? '↳ ' : '' }}{{ c.name }}</b><br><span style="font-size:11.5px;color:var(--muted)">{{ c.desc }}</span></td>
          <td style="font-size:12.5px;color:var(--muted)">{{ parentName(c) }}</td>
          <td><span class="badge" [style.background]="c.status==='active' ? '#e7f7ed':'var(--panel2)'" [style.color]="c.status==='active' ? 'var(--green)':'var(--muted)'" style="padding:3px 10px">{{ c.status }}</span></td>
          <td class="row" style="gap:6px">
            <button class="btn ghost sm" (click)="openForm(c)">Edit</button>
            <button class="btn danger sm" (click)="ds.delCategory(c.id)">Del</button>
          </td>
        </tr>
      }
    </table>
  </div>
  `,
})
export class CategoriesComponent {
  ds = inject(DukanService);
  editing = signal(false);
  form: Category = this.blank();

  blank(): Category { return { id: '', name: '', mrp: 0, disc: 0, rate: 0, status: 'active', desc: '', parentId: null }; }
  openForm(c?: Category) { this.form = c ? { ...c } : this.blank(); this.editing.set(true); }

  /** Top-level categories that can be a parent (exclude self + exclude categories that are themselves sub — keep 2 levels). */
  parentOptions(): Category[] { return this.ds.categories().filter(c => !c.parentId && c.id !== this.form.id); }
  parentName(c: Category): string { return c.parentId ? (this.ds.categories().find(x => x.id === c.parentId)?.name ?? '—') : '— top —'; }
  /** Sort: each top category followed by its sub-categories. */
  sortedCats(): Category[] {
    const all = this.ds.categories();
    const tops = all.filter(c => !c.parentId);
    const out: Category[] = [];
    for (const t of tops) { out.push(t); out.push(...all.filter(c => c.parentId === t.id)); }
    // any orphan subs (parent missing) at the end
    out.push(...all.filter(c => c.parentId && !tops.some(t => t.id === c.parentId)));
    return out;
  }
  onMrp(v: string) { this.form.mrp = +v; this.recalc(); }
  onDisc(v: string) { this.form.disc = +v; this.recalc(); }
  recalc() { this.form.rate = Math.round(this.form.mrp * (1 - this.form.disc / 100)); }
  save() {
    if (!this.form.name) { alert('Name dalein'); return; }
    if (!this.form.id) this.form.id = this.ds.newCatId();
    this.ds.saveCategory({ ...this.form });
    this.editing.set(false);
  }
}
