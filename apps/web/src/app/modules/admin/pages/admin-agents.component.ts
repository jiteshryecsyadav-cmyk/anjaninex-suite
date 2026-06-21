import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  AdminService, AgentListItem, AgentDetail,
  CreateAgentReq, CreateAgentResp, UpdateAgentReq, AgentPayoutReq
} from '../services/admin.service';
import { BackButtonComponent } from '../../../shared/back-button.component';

const subNav = `
  <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
    <a routerLink="/admin/dashboard" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       [routerLinkActiveOptions]="{exact:true}"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
    <a routerLink="/admin/firms" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🏢 Firms</a>
    <a routerLink="/admin/agents" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">👥 Agents</a>
    <a routerLink="/admin/firm-report" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📈 Report</a>
    <a routerLink="/admin/plans" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💼 Plans</a>
    <a routerLink="/admin/billing" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💳 Billing</a>
    <a routerLink="/admin/ai-monitor" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🤖 AI Monitor</a>
    <a routerLink="/admin/changelog" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📝 Changelog</a>
  </div>
`;

@Component({
  selector: 'app-admin-agents',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, DatePipe, BackButtonComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">👥 Agents / Resellers</h2>
          <p class="text-sm text-[#6b3fa0]">Channel partners who refer firms & earn commission</p>
        </div>
        <button (click)="openAdd()" class="btn-primary">👤 + Add Agent</button>
      </div>

      ${subNav}

      <div class="card p-0 overflow-x-auto">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (agents().length === 0) {
          <div class="p-8 text-center text-gray-500">No agents yet</div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-3 py-2 text-left">Code</th>
                <th class="px-3 py-2 text-left">Name</th>
                <th class="px-3 py-2 text-left">Phone</th>
                <th class="px-3 py-2 text-right">Signup %</th>
                <th class="px-3 py-2 text-right">Recharge %</th>
                <th class="px-3 py-2 text-right">Firms</th>
                <th class="px-3 py-2 text-right">Earned</th>
                <th class="px-3 py-2 text-right">Pending</th>
                <th class="px-3 py-2 text-center">Status</th>
                <th class="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (a of agents(); track a.id) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-3 py-2 font-mono font-bold text-[#5c1a8b]">{{ a.code }}</td>
                  <td class="px-3 py-2">
                    <div class="font-semibold">{{ a.name }}</div>
                    <div class="text-xs text-gray-500">{{ a.email }}</div>
                  </td>
                  <td class="px-3 py-2 text-xs">{{ a.phone }}</td>
                  <td class="px-3 py-2 text-right">{{ a.signupCommissionPct | number:'1.0-2' }}%</td>
                  <td class="px-3 py-2 text-right">{{ a.rechargeCommissionPct | number:'1.0-2' }}%</td>
                  <td class="px-3 py-2 text-right font-bold">{{ a.firmsCount }}</td>
                  <td class="px-3 py-2 text-right font-mono text-green-700">₹{{ a.totalEarned | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono"
                      [class.text-orange-600]="a.pending > 0"
                      [class.font-bold]="a.pending > 0">₹{{ a.pending | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-center">
                    <span class="text-xs px-2 py-0.5 rounded uppercase font-bold"
                          [class.bg-green-100]="a.status === 'active'"
                          [class.text-green-700]="a.status === 'active'"
                          [class.bg-red-100]="a.status !== 'active'"
                          [class.text-red-700]="a.status !== 'active'">{{ a.status }}</span>
                  </td>
                  <td class="px-3 py-2 text-center">
                    <div class="flex gap-1 justify-center">
                      <button (click)="openDetail(a)" title="View commissions & payouts"
                              class="inline-flex items-center px-2 py-1 border border-[#5c1a8b] text-[#5c1a8b] rounded text-xs font-semibold hover:bg-purple-50">👁 View</button>
                      <button (click)="openEdit(a)" title="Edit agent"
                              class="inline-flex items-center px-2 py-1 border border-[#5c1a8b] text-[#5c1a8b] rounded text-xs font-semibold hover:bg-purple-50">✏️ Edit</button>
                      <button (click)="openPayout(a)" title="Record payout"
                              class="inline-flex items-center px-2 py-1 bg-gradient-to-r from-[#5c1a8b] to-[#7c2dab] text-white rounded text-xs font-semibold hover:from-[#4a1570] hover:to-[#6a2599] whitespace-nowrap">💸 Payout</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Add Agent modal -->
      @if (showAdd()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="showAdd.set(false)">
          <div class="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-5" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-[#5c1a8b] mb-1">👤 New Agent / Reseller</h3>
            <p class="text-xs text-gray-500 mb-3">Agent ko unique code milega. Firm banate waqt yeh code daalo to firm us agent se link ho jayega.</p>
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2"><label class="fl">Name *</label><input [(ngModel)]="nf.name" class="fi"></div>
              <div><label class="fl">Email *</label><input [(ngModel)]="nf.email" class="fi"></div>
              <div><label class="fl">Phone</label><input [(ngModel)]="nf.phone" class="fi font-mono"></div>
              <div><label class="fl">Signup Commission %</label><input type="number" step="0.01" [(ngModel)]="nf.signupCommissionPct" class="fi"></div>
              <div><label class="fl">Recharge Commission %</label><input type="number" step="0.01" [(ngModel)]="nf.rechargeCommissionPct" class="fi"></div>
              <div><label class="fl">Code (optional, auto-gen)</label><input [(ngModel)]="nf.code" class="fi font-mono uppercase"></div>
              <div><label class="fl">Password (optional, auto-gen)</label><input [(ngModel)]="nf.loginPassword" class="fi"></div>
            </div>
            @if (addErr()) { <div class="text-red-600 text-sm mt-2">{{ addErr() }}</div> }
            <div class="flex justify-end gap-2 mt-4">
              <button (click)="showAdd.set(false)" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button (click)="saveAgent()" [disabled]="addSaving()" class="btn-primary">{{ addSaving() ? 'Ban raha…' : 'Create Agent' }}</button>
            </div>
          </div>
        </div>
      }

      <!-- Created credentials box -->
      @if (created(); as c) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="created.set(null)">
          <div class="bg-white rounded-2xl w-full max-w-md p-5" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-green-700 mb-1">✓ Agent Created!</h3>
            <p class="text-xs text-gray-500 mb-3">Yeh login details agent ko bhej do (sirf abhi dikh raha hai).</p>
            <div class="bg-[#f7f0ff] border border-[#ddc8f5] rounded-lg p-4 space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">Agent Code</span><span class="font-mono font-bold text-[#5c1a8b]">{{ c.code }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Username</span><span class="font-mono font-bold">{{ c.loginUsername }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Temp Password</span><span class="font-mono font-bold">{{ c.tempPassword }}</span></div>
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <button (click)="copyCreds(c)" class="px-4 py-2 border border-[#5c1a8b] text-[#5c1a8b] rounded text-sm font-semibold">📋 Copy</button>
              <button (click)="created.set(null)" class="btn-primary">Done</button>
            </div>
          </div>
        </div>
      }

      <!-- Edit Agent modal -->
      @if (editing(); as e) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="editing.set(null)">
          <div class="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-5" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-[#5c1a8b] mb-3">✏️ Edit Agent</h3>
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2"><label class="fl">Name *</label><input [(ngModel)]="e.name" class="fi"></div>
              <div><label class="fl">Email</label><input [(ngModel)]="e.email" class="fi"></div>
              <div><label class="fl">Phone</label><input [(ngModel)]="e.phone" class="fi font-mono"></div>
              <div><label class="fl">Signup Commission %</label><input type="number" step="0.01" [(ngModel)]="e.signupCommissionPct" class="fi"></div>
              <div><label class="fl">Recharge Commission %</label><input type="number" step="0.01" [(ngModel)]="e.rechargeCommissionPct" class="fi"></div>
              <div><label class="fl">Status</label>
                <select [(ngModel)]="e.status" class="fi">
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                </select>
              </div>
            </div>
            @if (editErr()) { <div class="text-red-600 text-sm mt-2">{{ editErr() }}</div> }
            <div class="flex justify-end gap-2 mt-4">
              <button (click)="editing.set(null)" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button (click)="saveEdit()" [disabled]="editSaving()" class="btn-primary">{{ editSaving() ? 'Saving…' : 'Save' }}</button>
            </div>
          </div>
        </div>
      }

      <!-- Payout modal -->
      @if (payoutFor(); as a) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="payoutFor.set(null)">
          <div class="bg-white rounded-2xl w-full max-w-md p-5" (click)="$event.stopPropagation()">
            <h3 class="font-bold text-lg text-[#5c1a8b] mb-1">💸 Payout — {{ a.name }}</h3>
            <p class="text-xs text-gray-500 mb-3">Pending: ₹{{ a.pending | number:'1.2-2' }}</p>
            <div class="grid gap-3">
              <div><label class="fl">Amount (₹) *</label><input type="number" step="0.01" [(ngModel)]="pf.amount" class="fi text-lg font-bold"></div>
              <div><label class="fl">Method</label>
                <select [(ngModel)]="pf.method" class="fi">
                  <option value="upi">UPI</option>
                  <option value="neft">NEFT/RTGS</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div><label class="fl">Reference / UTR</label><input [(ngModel)]="pf.reference" class="fi font-mono"></div>
              <div><label class="fl">Notes</label><input [(ngModel)]="pf.notes" class="fi"></div>
            </div>
            @if (payoutErr()) { <div class="text-red-600 text-sm mt-2">{{ payoutErr() }}</div> }
            <div class="flex justify-end gap-2 mt-4">
              <button (click)="payoutFor.set(null)" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button (click)="savePayout()" [disabled]="payoutSaving() || !pf.amount || pf.amount <= 0" class="btn-primary">{{ payoutSaving() ? 'Saving…' : 'Record Payout' }}</button>
            </div>
          </div>
        </div>
      }

      <!-- Detail modal (commissions + payouts) -->
      @if (detail(); as d) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" (click)="detail.set(null)">
          <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto p-5" (click)="$event.stopPropagation()">
            <div class="flex items-start justify-between mb-3">
              <div>
                <h3 class="font-bold text-lg text-[#5c1a8b]">{{ d.name }} <span class="font-mono text-sm text-gray-400">({{ d.code }})</span></h3>
                <p class="text-xs text-gray-500">{{ d.email }} · {{ d.phone }}</p>
              </div>
              <button (click)="detail.set(null)" class="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div class="grid grid-cols-4 gap-2 mb-4">
              <div class="card text-center"><div class="text-xs text-gray-500">Firms</div><div class="text-lg font-bold">{{ d.firmsCount }}</div></div>
              <div class="card text-center"><div class="text-xs text-gray-500">Earned</div><div class="text-lg font-bold text-green-700">₹{{ d.totalEarned | number:'1.0-0' }}</div></div>
              <div class="card text-center"><div class="text-xs text-gray-500">Pending</div><div class="text-lg font-bold text-orange-600">₹{{ d.pending | number:'1.0-0' }}</div></div>
              <div class="card text-center"><div class="text-xs text-gray-500">Wallet</div><div class="text-lg font-bold">₹{{ d.walletBalance | number:'1.0-0' }}</div></div>
            </div>

            <h4 class="font-bold text-sm text-[#5c1a8b] mb-2">💰 Commissions</h4>
            <div class="card p-0 overflow-x-auto mb-4">
              @if (d.recentCommissions.length === 0) {
                <div class="p-4 text-center text-gray-400 text-sm">No commissions yet</div>
              } @else {
                <table class="w-full text-sm">
                  <thead class="bg-gray-50 text-xs uppercase">
                    <tr>
                      <th class="px-3 py-2 text-left">Date</th>
                      <th class="px-3 py-2 text-left">Firm</th>
                      <th class="px-3 py-2 text-left">Kind</th>
                      <th class="px-3 py-2 text-right">Recharge</th>
                      <th class="px-3 py-2 text-right">%</th>
                      <th class="px-3 py-2 text-right">Commission</th>
                      <th class="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of d.recentCommissions; track c.id) {
                      <tr class="border-t">
                        <td class="px-3 py-2 text-xs">{{ c.createdAt | date:'short' }}</td>
                        <td class="px-3 py-2">{{ c.firmName }}</td>
                        <td class="px-3 py-2 text-xs uppercase">{{ c.kind }}</td>
                        <td class="px-3 py-2 text-right font-mono">₹{{ c.rechargeAmount | number:'1.2-2' }}</td>
                        <td class="px-3 py-2 text-right">{{ c.commissionPct | number:'1.0-2' }}%</td>
                        <td class="px-3 py-2 text-right font-mono font-bold text-green-700">₹{{ c.commissionAmt | number:'1.2-2' }}</td>
                        <td class="px-3 py-2 text-center">
                          <span class="text-xs px-2 py-0.5 rounded uppercase"
                                [class.bg-green-100]="c.status === 'paid'"
                                [class.text-green-700]="c.status === 'paid'"
                                [class.bg-orange-100]="c.status !== 'paid'"
                                [class.text-orange-700]="c.status !== 'paid'">{{ c.status }}</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>

            <h4 class="font-bold text-sm text-[#5c1a8b] mb-2">💸 Payouts</h4>
            <div class="card p-0 overflow-x-auto">
              @if (d.payouts.length === 0) {
                <div class="p-4 text-center text-gray-400 text-sm">No payouts yet</div>
              } @else {
                <table class="w-full text-sm">
                  <thead class="bg-gray-50 text-xs uppercase">
                    <tr>
                      <th class="px-3 py-2 text-left">Date</th>
                      <th class="px-3 py-2 text-right">Amount</th>
                      <th class="px-3 py-2 text-left">Method</th>
                      <th class="px-3 py-2 text-left">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of d.payouts; track p.id) {
                      <tr class="border-t">
                        <td class="px-3 py-2 text-xs">{{ p.createdAt | date:'short' }}</td>
                        <td class="px-3 py-2 text-right font-mono font-bold">₹{{ p.amount | number:'1.2-2' }}</td>
                        <td class="px-3 py-2 text-xs uppercase">{{ p.method }}</td>
                        <td class="px-3 py-2 text-xs font-mono">{{ p.reference }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .fl { font-size: 10px; font-weight: 800; color: #6b3fa0; text-transform: uppercase; display:block; margin-bottom:3px; }
    .fi { width: 100%; padding: 8px 10px; border: 1.5px solid #ddc8f5; border-radius: 8px; font-size: 13px; outline: none; }
    .fi:focus { border-color: #5c1a8b; }

    @media (max-width: 640px) {
      .grid-cols-2, .grid-cols-4 { grid-template-columns: 1fr !important; }
      .col-span-2 { grid-column: span 1 !important; }
    }
  `]
})
export class AdminAgentsComponent {
  private svc = inject(AdminService);

  agents = signal<AgentListItem[]>([]);
  loading = signal(true);

  // Add
  showAdd = signal(false);
  addSaving = signal(false);
  addErr = signal('');
  created = signal<CreateAgentResp | null>(null);
  nf: CreateAgentReq = this.blankAgent();

  // Edit
  editing = signal<(UpdateAgentReq & { id: string }) | null>(null);
  editSaving = signal(false);
  editErr = signal('');

  // Payout
  payoutFor = signal<AgentListItem | null>(null);
  payoutSaving = signal(false);
  payoutErr = signal('');
  pf: AgentPayoutReq = { amount: 0, method: 'upi', reference: '', notes: '' };

  // Detail
  detail = signal<AgentDetail | null>(null);

  blankAgent(): CreateAgentReq {
    return { name: '', email: '', phone: '', signupCommissionPct: 0, rechargeCommissionPct: 0, code: '', loginPassword: '' };
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.listAgents().subscribe({
      next: (a) => {
        // Backend already returns newest-first (OrderByDescending CreatedAt).
        this.agents.set(a);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  openAdd() { this.nf = this.blankAgent(); this.addErr.set(''); this.showAdd.set(true); }

  saveAgent() {
    const f = this.nf;
    if (!f.name?.trim() || !f.email?.trim()) { this.addErr.set('Name aur Email zaroori hain.'); return; }
    this.addSaving.set(true); this.addErr.set('');
    // strip empty optionals
    const body: CreateAgentReq = {
      name: f.name, email: f.email, phone: f.phone,
      signupCommissionPct: +f.signupCommissionPct || 0,
      rechargeCommissionPct: +f.rechargeCommissionPct || 0
    };
    if (f.code?.trim()) body.code = f.code.trim();
    if (f.loginPassword?.trim()) body.loginPassword = f.loginPassword.trim();
    this.svc.createAgent(body).subscribe({
      next: (r) => { this.addSaving.set(false); this.showAdd.set(false); this.created.set(r); this.load(); },
      error: (e) => { this.addSaving.set(false); this.addErr.set(e?.error?.error ?? 'Agent nahi bana'); }
    });
  }

  copyCreds(c: CreateAgentResp) {
    const text = `Agent Code: ${c.code}\nUsername: ${c.loginUsername}\nPassword: ${c.tempPassword}`;
    navigator.clipboard?.writeText(text).then(
      () => alert('Login details copy ho gaye!'),
      () => alert(text)
    );
  }

  openEdit(a: AgentListItem) {
    this.editErr.set('');
    this.editing.set({
      id: a.id, name: a.name, email: a.email, phone: a.phone,
      signupCommissionPct: a.signupCommissionPct, rechargeCommissionPct: a.rechargeCommissionPct,
      status: a.status
    });
  }

  saveEdit() {
    const e = this.editing();
    if (!e) return;
    if (!e.name?.trim()) { this.editErr.set('Name zaroori hai.'); return; }
    this.editSaving.set(true); this.editErr.set('');
    const { id, ...body } = e;
    this.svc.updateAgent(id, {
      name: body.name, email: body.email, phone: body.phone,
      signupCommissionPct: +body.signupCommissionPct || 0,
      rechargeCommissionPct: +body.rechargeCommissionPct || 0,
      status: body.status
    }).subscribe({
      next: () => { this.editSaving.set(false); this.editing.set(null); this.load(); },
      error: (er) => { this.editSaving.set(false); this.editErr.set(er?.error?.error ?? 'Save nahi hua'); }
    });
  }

  openPayout(a: AgentListItem) {
    this.payoutErr.set('');
    this.pf = { amount: a.pending > 0 ? a.pending : 0, method: 'upi', reference: '', notes: '' };
    this.payoutFor.set(a);
  }

  savePayout() {
    const a = this.payoutFor();
    if (!a || !this.pf.amount || this.pf.amount <= 0) return;
    this.payoutSaving.set(true); this.payoutErr.set('');
    this.svc.agentPayout(a.id, this.pf).subscribe({
      next: () => { this.payoutSaving.set(false); this.payoutFor.set(null); this.load(); },
      error: (e) => { this.payoutSaving.set(false); this.payoutErr.set(e?.error?.error ?? 'Payout nahi hua'); }
    });
  }

  openDetail(a: AgentListItem) {
    this.detail.set(null);
    this.svc.getAgent(a.id).subscribe({
      next: (d) => this.detail.set(d),
      error: (e) => alert(e?.error?.error ?? 'Detail load nahi hua')
    });
  }
}
