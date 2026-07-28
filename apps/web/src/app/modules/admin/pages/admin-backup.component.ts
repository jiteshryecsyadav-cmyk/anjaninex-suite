import { Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';

interface BackupStatus {
  lastAt?: string; dbFile?: string; dbSize?: number; uploadsSize?: number; driveOk?: number;
}

// =============================================================================
// BACKUP SETTING (sadmin) — WhatsApp ki "Chat backup" screen jaisa:
// Last backup kab/kitna (DB + chat-photos), Google Drive on/off, [Back up] button.
// Raat 2 baje khud bhi chalta hai (cron) — ye screen dekhne + haath se chalane ko.
// =============================================================================
@Component({
  selector: 'app-admin-backup',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, BackButtonComponent],
  template: `
    <div class="max-w-2xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <h2 class="font-display font-black text-2xl text-[#5c1a8b] mb-1">🗄️ Backup</h2>
      <p class="text-sm text-[#6b3fa0] mb-5">Poore platform ka backup — database + saari chat-photos. Raat 2 baje khud hota hai; yahan se abhi bhi chala sakte ho.</p>

      <!-- WhatsApp jaisi backup card -->
      <div class="card" style="max-width:520px">
        <div class="text-xs uppercase font-bold text-gray-400 mb-1">Backup settings</div>
        <p class="text-sm text-gray-600 mb-4">Data roz server par backup hota hai (14 din/8 hafte/24 mahine/8 saal ka GFS) — Drive on ho to cloud par bhi.</p>

        @if (st(); as s) {
          <div class="mb-1 text-[15px]">
            <b>Last Backup:</b>
            @if (s.lastAt) { {{ s.lastAt | date:'dd/MM/yy, h:mm a' }} }
            @else { <span class="text-red-600">abhi tak nahi hua</span> }
          </div>
          <div class="mb-4 text-[15px]">
            <b>Size:</b> DB {{ fmt(s.dbSize) }} · Chat-photos {{ fmt(s.uploadsSize) }}
          </div>
        }

        <button (click)="runNow()" [disabled]="running()"
                class="px-6 py-2.5 rounded-full font-bold text-[#0B57D0] border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 mb-5">
          {{ running() ? 'Backup chal raha hai…' : 'Back up' }}
        </button>

        <div class="border-t pt-4">
          <div class="text-xs uppercase font-bold text-gray-400 mb-1">Google Drive</div>
          @if (st()?.driveOk === 1) {
            <div class="text-green-700 font-semibold">✅ ON — backup Drive par bhi ja raha hai (taale ke saath encrypted)</div>
          } @else {
            <div class="text-amber-700 font-semibold mb-2">⚠️ Abhi OFF — sirf server par hai (WhatsApp jaise Drive par bhi bhejne ke liye ek baar setup)</div>
            <div class="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
              <b>Ek-baar ka setup (Hostinger Web Terminal me):</b><br>
              1. <code>rclone config</code> → naya remote, naam <code>gdrive</code>, type Google Drive → browser link se Google login<br>
              2. <code>openssl rand -base64 32 > /root/.backup-pass && chmod 600 /root/.backup-pass</code><br>
              3. <code>cat /root/.backup-pass</code> ka PRINT nikaal kar tijori me rakho (kho gaya to Drive-backup kabhi nahi khulega)<br>
              Bas — agli raat se Drive par bhi jayega. ✓
            </div>
          }
        </div>
      </div>
      <p class="text-xs text-gray-400 mt-3">Backup me kya-kya: poora database (sab firms ka hisaab) + Party Chat ki saari photos/files. Drive par DB 90 din, photos 30 din, FY-closing 8 saal.</p>
    </div>
  `
})
export class AdminBackupComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/api/admin/backup`;

  st = signal<BackupStatus | null>(null);
  running = signal(false);

  ngOnInit() { this.load(); }

  load() {
    this.http.get<BackupStatus>(`${this.base}/status`).subscribe({
      next: s => this.st.set(s || {}),
      error: () => this.st.set({})
    });
  }

  fmt(n?: number): string {
    if (!n || n <= 0) return '—';
    if (n > 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    if (n > 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.round(n / 1024) + ' KB';
  }

  runNow() {
    this.running.set(true);
    const before = this.st()?.lastAt;
    this.http.post<any>(`${this.base}/run`, {}).subscribe({
      next: () => {
        this.toast.success('Backup shuru — 1-2 min me ho jayega');
        // Status har 5 sec dekho jab tak naya lastAt na aa jaye (max ~2 min)
        let tries = 0;
        const t = setInterval(() => {
          this.load();
          if ((this.st()?.lastAt && this.st()?.lastAt !== before) || ++tries > 24) {
            clearInterval(t); this.running.set(false);
            if (this.st()?.lastAt !== before) this.toast.success('✅ Backup poora ho gaya!');
          }
        }, 5000);
      },
      error: (e) => { this.running.set(false); alert('⚠️ ' + (e?.error?.error ?? 'Backup shuru nahi hua')); }
    });
  }
}
