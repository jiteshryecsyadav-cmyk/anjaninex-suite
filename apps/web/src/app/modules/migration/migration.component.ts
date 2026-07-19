import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MigrationService, MigrationType, ImportResult } from './migration.service';
import { ToastService } from '../../shared/toast.service';

interface TabDef {
  key: MigrationType;
  label: string;
  icon: string;
  hint: string;
  columns: string;
}

import { BackButtonComponent } from '../../shared/back-button.component';
@Component({
  selector: 'app-migration',
  standalone: true,
  imports: [BackButtonComponent, CommonModule],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
    <div class="max-w-5xl mx-auto">

      <!-- Header -->
      <div class="mg-header">
        <span class="mg-ico">📥</span>
        <div>
          <h2 class="mg-title">Import &amp; Migration</h2>
          <p class="mg-sub">Purana data (Tally / Busy / Marg / Excel) bulk import karein — pehle din se khata sahi.</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="mg-tabs">
        @for (t of tabs; track t.key) {
          <button class="mg-tab" [class.active]="active() === t.key" (click)="selectTab(t.key)">
            <span>{{ t.icon }}</span> {{ t.label }}
          </button>
        }
      </div>

      <!-- Active tab panel -->
      @if (activeTab(); as t) {
        <div class="mg-panel">
          <div class="mg-step">
            <div class="mg-step-no">1</div>
            <div class="flex-1">
              <h3 class="mg-step-title">Template download karein</h3>
              <p class="mg-step-hint">{{ t.hint }}</p>
              <p class="mg-cols"><strong>Columns:</strong> {{ t.columns }}</p>
              <button class="mg-btn-outline" (click)="download(t.key)" [disabled]="downloading()">
                {{ downloading() ? 'Ban raha hai…' : '⬇️ Download Excel Template' }}
              </button>
            </div>
          </div>

          <div class="mg-step">
            <div class="mg-step-no">2</div>
            <div class="flex-1">
              <h3 class="mg-step-title">File upload karein (.xlsx ya .csv)</h3>
              <p class="mg-step-hint">Template me data bhar kar yahan upload karein. Pehli row header hai.</p>
              <input type="file" accept=".xlsx,.csv" (change)="onFile($event)" class="mg-file">
              @if (selectedName()) {
                <p class="mg-file-name">📄 {{ selectedName() }}</p>
              }
            </div>
          </div>

          <div class="mg-step">
            <div class="mg-step-no">3</div>
            <div class="flex-1">
              <h3 class="mg-step-title">Import shuru karein</h3>
              <button class="mg-btn" (click)="runImport()" [disabled]="!selectedFile() || importing()">
                {{ importing() ? 'Import ho raha hai…' : '🚀 Import ' + t.label }}
              </button>
            </div>
          </div>

          <!-- Result report -->
          @if (result(); as r) {
            <div class="mg-result">
              <div class="mg-summary">
                <span class="mg-pill total">📊 Total: {{ r.total }}</span>
                <span class="mg-pill ok">✅ Success: {{ r.success }}</span>
                <span class="mg-pill fail">❌ Failed: {{ r.failed }}</span>
              </div>
              <div class="mg-rows">
                <table class="mg-table">
                  <thead>
                    <tr><th>Row</th><th>Status</th><th>Message</th></tr>
                  </thead>
                  <tbody>
                    @for (row of r.rows; track row.row) {
                      <tr [class.row-ok]="row.ok" [class.row-fail]="!row.ok">
                        <td>{{ row.row }}</td>
                        <td>{{ row.ok ? '✅' : '❌' }}</td>
                        <td>{{ row.message }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .mg-header { display:flex; align-items:center; gap:14px; margin-bottom:18px; }
    .mg-ico { font-size:36px; }
    .mg-title { font-size:22px; font-weight:800; color:#1B2E5C; }
    .mg-sub { font-size:13px; color:#64748b; }

    .mg-tabs { display:flex; flex-wrap:wrap; gap:6px; border-bottom:2px solid #e2e8f0; margin-bottom:18px; }
    .mg-tab { padding:9px 16px; border:none; background:transparent; cursor:pointer; font-size:13px;
              font-weight:700; color:#64748b; border-bottom:3px solid transparent; margin-bottom:-2px; }
    .mg-tab:hover { color:#1B2E5C; }
    .mg-tab.active { color:#1B2E5C; border-bottom-color:#DC2626; }

    .mg-panel { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:22px; }
    .mg-step { display:flex; gap:14px; padding:14px 0; border-bottom:1px dashed #e2e8f0; }
    .mg-step:last-of-type { border-bottom:none; }
    .mg-step-no { width:28px; height:28px; flex:none; border-radius:50%; background:#1B2E5C; color:#fff;
                  display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; }
    .mg-step-title { font-weight:700; color:#1B2E5C; font-size:15px; }
    .mg-step-hint { font-size:12px; color:#64748b; margin:2px 0 8px; }
    .mg-cols { font-size:11px; color:#475569; background:#f8fafc; border:1px solid #e2e8f0;
               border-radius:8px; padding:8px 10px; margin-bottom:10px; }

    .mg-btn { padding:9px 18px; background:linear-gradient(135deg,#1B2E5C,#2a437f); color:#fff;
              border:none; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; }
    .mg-btn:disabled { opacity:.5; cursor:not-allowed; }
    .mg-btn-outline { padding:8px 16px; background:#fff; color:#1B2E5C; border:1.5px solid #1B2E5C;
                      border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; }
    .mg-btn-outline:disabled { opacity:.5; }
    .mg-file { display:block; font-size:13px; }
    .mg-file-name { font-size:12px; color:#16a34a; font-weight:600; margin-top:6px; }

    .mg-result { margin-top:18px; }
    .mg-summary { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
    .mg-pill { padding:6px 12px; border-radius:999px; font-size:12px; font-weight:700; }
    .mg-pill.total { background:#eef2ff; color:#1B2E5C; }
    .mg-pill.ok { background:#dcfce7; color:#16a34a; }
    .mg-pill.fail { background:#fee2e2; color:#dc2626; }

    .mg-rows { max-height:420px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:10px; }
    .mg-table { width:100%; border-collapse:collapse; font-size:12px; }
    .mg-table th { text-align:left; padding:8px 10px; background:#f8fafc; color:#475569;
                   position:sticky; top:0; font-weight:700; }
    .mg-table td { padding:7px 10px; border-top:1px solid #f1f5f9; }
    .row-ok { background:#f0fdf4; }
    .row-fail { background:#fef2f2; }
  `]
})
export class MigrationComponent {
  private svc = inject(MigrationService);
  private toast = inject(ToastService);

  tabs: TabDef[] = [
    { key: 'parties', label: 'Parties', icon: '👥',
      hint: 'Supplier / buyer / customer master.',
      columns: 'Name*, Type (supplier/buyer/both), GSTIN, PAN, Phone, Email, Address, City, State, Pincode' },
    { key: 'items', label: 'Descriptions / Items', icon: '📦',
      hint: 'Item / description master.',
      columns: 'Name*, HSN, Unit, DefaultRate' },
    { key: 'ledgers', label: 'Account Ledgers', icon: '📒',
      hint: 'Accounting ledgers (Rent, Salary, etc.).',
      columns: 'LedgerName*, Group, OpeningBalance, DrCr (Dr/Cr)' },
    { key: 'bills', label: 'Bills', icon: '🧾',
      hint: 'Purchase / sale bills — accounting voucher auto-post hoga.',
      columns: 'BillNo*, BillDate* (dd-mm-yyyy), BillType (sale/purchase), SupplierName*, BuyerName, City, TaxableValue*, CGSTPct, SGSTPct, IGSTPct, BillAmount, Remark' },
    { key: 'opening', label: 'Opening Balances', icon: '⚖️',
      hint: 'Per-party opening Dr/Cr — opening journal voucher auto-post hoga (khata day-1 se sahi).',
      columns: 'PartyName*, AsOnDate (dd-mm-yyyy), Amount*, DrCr (Dr/Cr)' },
  ];

  active = signal<MigrationType>('parties');
  activeTab = computed(() => this.tabs.find(t => t.key === this.active()));

  downloading = signal(false);
  importing = signal(false);
  selectedFile = signal<File | null>(null);
  selectedName = signal<string>('');
  result = signal<ImportResult | null>(null);

  selectTab(k: MigrationType) {
    this.active.set(k);
    // Tab badalne par purana result + file reset (confusion na ho)
    this.selectedFile.set(null);
    this.selectedName.set('');
    this.result.set(null);
  }

  download(type: MigrationType) {
    this.downloading.set(true);
    this.svc.downloadTemplate(type).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}-import-template.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.downloading.set(false);
        this.toast.error(e?.error?.error ?? 'Template download nahi hua.');
      }
    });
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.selectedFile.set(f);
    this.selectedName.set(f?.name ?? '');
    this.result.set(null);
  }

  runImport() {
    const f = this.selectedFile();
    const t = this.active();
    if (!f) { this.toast.error('Pehle file chunein.'); return; }
    this.importing.set(true);
    this.result.set(null);
    this.svc.import(t, f).subscribe({
      next: (r) => {
        this.importing.set(false);
        this.result.set(r);
        if (r.failed === 0) this.toast.success(`Sab ${r.success} rows import ho gaye! 🎉`);
        else if (r.success === 0) this.toast.error(`Koi row import nahi hui (${r.failed} fail).`);
        else this.toast.info(`${r.success} success, ${r.failed} fail — neeche report dekhein.`);
      },
      error: (e) => {
        this.importing.set(false);
        this.toast.error(e?.error?.error ?? 'Import fail ho gaya.');
      }
    });
  }
}
