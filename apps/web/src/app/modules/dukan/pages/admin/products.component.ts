import { Component, inject, signal, computed } from '@angular/core';
import { DukanService } from '../../dukan.service';
import { Product } from '../../models';
import { fileToResizedDataUrl } from '../../image.util';

@Component({
  selector: 'app-products',
  standalone: true,
  template: `
  <div class="row" style="justify-content:space-between;margin-bottom:14px">
    <h2 style="font-size:18px">Catalog Manage</h2>
    <button class="btn sm" (click)="openForm()">+ Post Product</button>
  </div>

  @if (editing()) {
    <div class="card" style="padding:18px;margin-bottom:18px">
      <h3 style="margin-bottom:8px">{{ form.id ? 'Edit' : 'Post New' }} Product</h3>
      <div class="row" style="gap:14px;align-items:center;margin-bottom:14px">
        <div style="width:84px;height:84px;border-radius:12px;border:1px solid var(--line);overflow:hidden;background:var(--panel2);display:flex;align-items:center;justify-content:center;font-size:32px;color:var(--gold);flex-shrink:0">
          @if (form.img) { <img [src]="form.img" style="width:100%;height:100%;object-fit:cover"> } @else { 📷 }
        </div>
        <div>
          <label>Product Photo</label>
          <input type="file" accept="image/*" (change)="onPhoto($event)" style="border:none;padding:6px 0">
          <div style="margin-top:4px">
            @if (uploading()) { <span style="font-size:12px;color:var(--muted)">⏳ uploading...</span> }
            @if (form.img && !uploading()) { <button class="btn ghost sm" (click)="form.img=null">Remove photo</button> }
          </div>
        </div>
      </div>
      <div class="formgrid">
        <div><label>Name *</label><input [value]="form.name" (input)="form.name=$any($event.target).value" placeholder="e.g. Wireless Earbuds"></div>
        <div><label>Code</label><input [value]="form.code" (input)="form.code=$any($event.target).value" placeholder="EL-100"></div>
        <div><label>Category</label>
          <select [value]="form.catId" (change)="form.catId=$any($event.target).value">
            @for (c of ds.categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>
        </div>
        <div><label>Type</label>
          <select [value]="isCombo() ? 'combo':'single'" (change)="combo.set($any($event.target).value==='combo')">
            <option value="single">Single Item</option><option value="combo">Set / Combo</option>
          </select>
        </div>
        <div><label>MRP</label><input type="number" [value]="form.mrp" (input)="form.mrp=+$any($event.target).value"></div>
        <div><label>GST %</label>
          <select [value]="form.gst ?? 0" (change)="form.gst=+$any($event.target).value">
            <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option>
          </select>
        </div>
        <div><label>GST in bill</label>
          <label class="sw" style="margin-top:9px"><input type="checkbox" [checked]="form.gstInc !== false" (change)="form.gstInc=$any($event.target).checked"><span class="sw-track"></span> {{ form.gstInc !== false ? 'Include' : 'Exclude' }}</label>
        </div>
        <div><label>Rate *</label><input type="number" [value]="form.rate" (input)="form.rate=+$any($event.target).value"></div>
        <div><label>Stock</label><input type="number" [value]="form.stock" (input)="form.stock=+$any($event.target).value"></div>
      </div>
      <div class="row" style="margin-top:14px;gap:10px">
        <button class="btn sm" (click)="save()">Save</button>
        <button class="btn ghost sm" (click)="editing.set(false)">Cancel</button>
      </div>
    </div>
  }

  @if (uncategorized().length) {
    <div class="sec-head" style="color:#c0392b">⚠️ Uncategorized <span class="pill" style="background:#fdeaea;color:#c0392b">{{ uncategorized().length }}</span></div>
    <div style="font-size:12px;color:var(--muted);margin:-6px 0 8px">In products ki category delete ho gayi — inhe delete karo ya kisi category mein move karo (Edit).</div>
    <div class="card" style="padding:6px 16px;margin-bottom:14px">
      <table class="tbl">
        <tr><th>Name</th><th>Code</th><th>Rate</th><th>Stock</th><th></th></tr>
        @for (p of uncategorized(); track p.id) {
          <tr>
            <td><b>{{ p.name }}</b></td><td>{{ p.code }}</td><td>₹{{ p.rate }}</td><td>{{ p.stock }}</td>
            <td class="row" style="gap:6px">
              <button class="btn ghost sm" (click)="openForm(p)">Edit</button>
              <button class="btn danger sm" (click)="ds.delProduct(p.id)">Del</button>
            </td>
          </tr>
        }
      </table>
    </div>
  }

  @for (cat of ds.categories(); track cat.id) {
    @if (productsIn(cat.id).length) {
      <div class="sec-head">{{ cat.name }} <span class="pill">{{ productsIn(cat.id).length }}</span></div>
      <div class="card" style="padding:6px 16px;margin-bottom:8px">
        <table class="tbl">
          <tr><th>Name</th><th>Code</th><th>MRP</th><th>Rate</th><th>Stock</th><th></th></tr>
          @for (p of productsIn(cat.id); track p.id) {
            <tr>
              <td>
                <div class="row" style="gap:8px">
                  <div style="width:34px;height:34px;border-radius:7px;overflow:hidden;background:var(--panel2);display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--gold);flex-shrink:0">
                    @if (p.img) { <img [src]="p.img" style="width:100%;height:100%;object-fit:cover"> } @else { {{ p.combo ? '🎁' : '📦' }} }
                  </div>
                  <span><b>{{ p.name }}</b> @if (p.combo) { <span class="badge combo">COMBO</span> }</span>
                </div>
              </td>
              <td>{{ p.code }}</td>
              <td style="text-decoration:line-through;color:var(--muted)">₹{{ p.mrp }}</td>
              <td><b>₹{{ p.rate }}</b></td>
              <td [style.color]="p.stock < 25 ? '#c0392b' : ''">{{ p.stock }}</td>
              <td class="row" style="gap:6px">
                <button class="btn ghost sm" (click)="openForm(p)">Edit</button>
                <button class="btn danger sm" (click)="ds.delProduct(p.id)">Del</button>
              </td>
            </tr>
          }
        </table>
      </div>
    }
  }
  `,
})
export class ProductsComponent {
  ds = inject(DukanService);
  editing = signal(false);
  combo = signal(false);
  uploading = signal(false);
  form: Product = this.blank();
  isCombo = computed(() => this.combo());

  blank(): Product { return { id: '', catId: this.ds.categories()[0]?.id ?? 'CAT1', name: '', code: '', mrp: 0, rate: 0, stock: 0, img: null, gst: 0, gstInc: true }; }

  async onPhoto(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    try { this.form.img = await fileToResizedDataUrl(file); }
    catch { alert('Photo upload nahi hui'); }
    this.uploading.set(false);
  }
  productsIn(catId: string) { return this.ds.products().filter(p => p.catId === catId); }
  uncategorized() { const ids = new Set(this.ds.categories().map(c => c.id)); return this.ds.products().filter(p => !ids.has(p.catId)); }
  openForm(p?: Product) {
    this.form = p ? { ...p } : this.blank();
    this.combo.set(!!p?.combo);
    this.editing.set(true);
  }
  save() {
    if (!this.form.name || !this.form.rate) { alert('Name aur rate dalein'); return; }
    if (!this.form.mrp) this.form.mrp = this.form.rate;
    this.form.combo = this.combo();
    if (!this.form.id) this.form.id = this.ds.newProductId(this.combo());
    if (!this.form.code) this.form.code = 'NEW';
    this.ds.saveProduct({ ...this.form });
    this.editing.set(false);
  }
}
