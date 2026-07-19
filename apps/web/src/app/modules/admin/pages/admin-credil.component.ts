import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CredilService } from '../../credil/credil.service';

import { BackButtonComponent } from '../../../shared/back-button.component';
@Component({
  standalone: true,
  selector: 'app-admin-credil',
  imports: [BackButtonComponent, CommonModule, FormsModule],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
  <div class="wrap">
    <h1>CREDIL — Admin</h1>
    <p class="sub">Report requests approve karo, rate card set karo, aur firms ke liye feature ON/OFF karo.</p>

    <div class="tabs">
      <button [class.active]="tab()==='queue'" (click)="tab.set('queue'); loadQueue()">📥 Requests</button>
      <button [class.active]="tab()==='config'" (click)="tab.set('config'); loadConfig()">💰 Rate Card</button>
      <button [class.active]="tab()==='firms'" (click)="tab.set('firms'); loadFirms()">🏢 Firm Access</button>
    </div>

    @if (msg()) { <div class="ok">{{ msg() }}</div> }
    @if (err()) { <div class="err">{{ err() }}</div> }

    <!-- QUEUE -->
    @if (tab()==='queue') {
      <div class="card">
        <div class="row-top">
          <span class="muted">Paid requests approval ke liye upar hain.</span>
          <button class="btn sm" (click)="refresh()">↻ Scores refresh</button>
        </div>
        @if (loading()) { <p class="muted">Load…</p> }
        @else if (queue().length===0) { <p class="muted">Koi request nahi.</p> }
        @else {
          <table class="tbl">
            <thead><tr><th>Firm</th><th>GST</th><th>Components</th><th>Fee</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>
              @for (r of queue(); track r.id) {
                <tr [class.hot]="r.status==='paid'">
                  <td>{{ r.firmName }}</td>
                  <td class="mono">{{ r.targetGst }}</td>
                  <td>{{ r.components?.length }} scores</td>
                  <td>₹{{ r.amount }}</td>
                  <td><span class="pill" [class]="'p-'+r.status">{{ r.status }}</span></td>
                  <td>{{ r.createdAt | date:'dd MMM, HH:mm' }}</td>
                  <td class="act">
                    @if (r.status==='paid') {
                      <button class="btn sm primary" [disabled]="busyId()===r.id" (click)="approve(r)">Approve</button>
                      <button class="btn sm danger" [disabled]="busyId()===r.id" (click)="reject(r)">Reject</button>
                    } @else { <span class="muted">—</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    }

    <!-- CONFIG -->
    @if (tab()==='config') {
      <div class="card narrow">
        <label class="lbl">Full report price (₹) — saare components</label>
        <input class="inp" type="number" [(ngModel)]="cfg.fullReportPrice">
        <label class="lbl">Per-component price (₹)</label>
        <input class="inp" type="number" [(ngModel)]="cfg.perComponentPrice">
        <label class="lbl">Min firms (insufficient-data threshold)</label>
        <input class="inp" type="number" [(ngModel)]="cfg.minFirms">
        <label class="lbl">Min data points</label>
        <input class="inp" type="number" [(ngModel)]="cfg.minDataPoints">
        <button class="btn primary" [disabled]="busy()" (click)="saveConfig()">Save</button>
      </div>
    }

    <!-- FIRMS -->
    @if (tab()==='firms') {
      <div class="card">
        <input class="inp search" [(ngModel)]="firmFilter" placeholder="Firm search…">
        @if (loading()) { <p class="muted">Load…</p> }
        @else {
          <table class="tbl">
            <thead><tr><th>Firm</th><th>CREDIL Access</th></tr></thead>
            <tbody>
              @for (f of filteredFirms(); track f.firmId) {
                <tr>
                  <td>{{ f.firmName }}</td>
                  <td>
                    <label class="switch">
                      <input type="checkbox" [checked]="f.enabled" (change)="toggle(f)">
                      <span class="sl"></span>
                      <span class="st">{{ f.enabled ? 'ON' : 'OFF' }}</span>
                    </label>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    }
  </div>
  `,
  styles: [`
    .wrap{max-width:960px;margin:0 auto;padding:18px}
    h1{font-size:24px;color:#0f766e;margin:0}
    .sub{color:#64748b;font-size:13px;margin:4px 0 16px}
    .tabs{display:flex;gap:8px;margin-bottom:14px}
    .tabs button{border:1px solid #e2e8f0;background:#fff;padding:8px 16px;border-radius:10px;cursor:pointer;font-weight:600;color:#475569}
    .tabs button.active{background:#0d9488;color:#fff;border-color:#0d9488}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px}
    .card.narrow{max-width:420px}
    .row-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    .tbl{width:100%;border-collapse:collapse;font-size:14px}
    .tbl th{text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;padding:8px}
    .tbl td{padding:10px 8px;border-top:1px solid #f1f5f9}
    tr.hot{background:#fffbeb}
    .mono{font-family:monospace;font-size:13px}
    .muted{color:#94a3b8}
    .act{display:flex;gap:6px}
    .pill{font-size:11px;padding:3px 9px;border-radius:20px;font-weight:700;text-transform:capitalize}
    .p-paid{background:#dbeafe;color:#1d4ed8}.p-delivered{background:#dcfce7;color:#15803d}
    .p-rejected{background:#fee2e2;color:#b91c1c}.p-approved{background:#e0e7ff;color:#4338ca}
    .lbl{display:block;font-size:12px;font-weight:700;color:#475569;margin:12px 0 5px}
    .inp{width:100%;padding:10px 13px;border:1px solid #cbd5e1;border-radius:9px;font-size:14px;box-sizing:border-box}
    .inp.search{margin-bottom:12px;max-width:300px}
    .btn{border:1px solid #cbd5e1;background:#fff;padding:9px 16px;border-radius:9px;font-weight:700;cursor:pointer;color:#334155;margin-top:12px}
    .btn.sm{padding:6px 12px;font-size:13px;margin:0}
    .btn.primary{background:#0d9488;color:#fff;border-color:#0d9488}
    .btn.danger{background:#fff;color:#b91c1c;border-color:#fecaca}
    .btn:disabled{opacity:.6}
    .ok{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;padding:9px 12px;border-radius:9px;font-size:13px;margin-bottom:10px}
    .err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:9px 12px;border-radius:9px;font-size:13px;margin-bottom:10px}
    .switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer}
    .switch input{display:none}
    .sl{width:40px;height:22px;background:#cbd5e1;border-radius:20px;position:relative;transition:.2s}
    .sl::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s}
    .switch input:checked + .sl{background:#0d9488}
    .switch input:checked + .sl::after{left:20px}
    .st{font-size:12px;font-weight:700;color:#64748b}
  `]
})
export class AdminCredilComponent implements OnInit {
  private svc = inject(CredilService);

  tab = signal<'queue' | 'config' | 'firms'>('queue');
  loading = signal(false);
  busy = signal(false);
  busyId = signal<string | null>(null);
  msg = signal(''); err = signal('');

  queue = signal<any[]>([]);
  firms = signal<any[]>([]);
  firmFilter = '';
  cfg: any = { fullReportPrice: 500, perComponentPrice: 150, minFirms: 2, minDataPoints: 5 };

  ngOnInit() { this.loadQueue(); }

  private flash(m: string) { this.msg.set(m); setTimeout(() => this.msg.set(''), 3000); }

  async loadQueue() {
    this.loading.set(true); this.err.set('');
    try { this.queue.set(await this.svc.adminRequests()); } catch { this.queue.set([]); }
    finally { this.loading.set(false); }
  }

  async approve(r: any) {
    this.busyId.set(r.id); this.err.set('');
    try { await this.svc.approve(r.id); this.flash('Approve ho gaya — report deliver + firm notified.'); await this.loadQueue(); }
    catch (e: any) { this.err.set(e?.error?.error || 'Approve fail.'); }
    finally { this.busyId.set(null); }
  }

  async reject(r: any) {
    const note = prompt('Reject reason (firm ko dikhega):', '') ?? '';
    this.busyId.set(r.id); this.err.set('');
    try { await this.svc.reject(r.id, note); this.flash('Rejected.'); await this.loadQueue(); }
    catch (e: any) { this.err.set(e?.error?.error || 'Reject fail.'); }
    finally { this.busyId.set(null); }
  }

  async refresh() {
    this.err.set('');
    try { const r = await this.svc.refreshScores(); this.flash(`Scores refreshed: ${r.scored} parties.`); }
    catch (e: any) { this.err.set(e?.error?.error || 'Refresh fail.'); }
  }

  async loadConfig() {
    try { this.cfg = await this.svc.getConfig(); } catch {}
  }
  async saveConfig() {
    this.busy.set(true); this.err.set('');
    try { this.cfg = await this.svc.saveConfig(this.cfg); this.flash('Rate card saved.'); }
    catch (e: any) { this.err.set(e?.error?.error || 'Save fail.'); }
    finally { this.busy.set(false); }
  }

  async loadFirms() {
    this.loading.set(true);
    try { this.firms.set(await this.svc.adminFirms()); } catch { this.firms.set([]); }
    finally { this.loading.set(false); }
  }
  filteredFirms() {
    const q = this.firmFilter.trim().toLowerCase();
    return q ? this.firms().filter(f => (f.firmName || '').toLowerCase().includes(q)) : this.firms();
  }
  async toggle(f: any) {
    try { await this.svc.toggleFirm(f.firmId, !f.enabled); f.enabled = !f.enabled; }
    catch (e: any) { this.err.set(e?.error?.error || 'Toggle fail.'); }
  }
}
