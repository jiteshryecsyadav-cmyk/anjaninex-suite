import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface VoiceAgent {
  firmId: string; firmName: string; enabled: boolean;
  agentName: string; firstMessage: string; systemPrompt: string;
  language: string; voiceSpeaker: string; exotelNumber: string;
  _saving?: boolean; _open?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-admin-voice-agents',
  imports: [CommonModule, FormsModule],
  template: `
  <div class="wrap">
    <h1>🎙️ Voice Agents</h1>
    <p class="sub">Har firm ka AI phone agent yahan se set karo — naam, script, awaaz, bhasha, ON/OFF.
       Sarvam self-host bridge inhi values se chalta hai.</p>

    <div class="cfg">
      <div class="cfg-title">🔑 Bridge Setup (central — sab firms ke liye ek baar)</div>

      <label>Voice bridge domain</label>
      <input class="inp" [(ngModel)]="baseDomain" placeholder="voice.anjaninex.com">

      <div class="grid2">
        <div>
          <label>Sarvam API key {{ cfg.sarvamKeySet ? '✓ saved' : '' }}</label>
          <input class="inp" type="password" [(ngModel)]="sarvamKey"
                 [placeholder]="cfg.sarvamKeySet ? '•••••• (saved — khali = koi change nahi)' : 'Sarvam key paste karo'">
        </div>
        <div>
          <label>Gemini API key {{ cfg.geminiKeySet ? '✓ saved' : '' }}</label>
          <input class="inp" type="password" [(ngModel)]="geminiKey"
                 [placeholder]="cfg.geminiKeySet ? '•••••• (saved — khali = koi change nahi)' : 'Gemini key paste karo'">
        </div>
        <div>
          <label>OpenAI API key {{ cfg.openaiKeySet ? '✓ saved (LLM active)' : '' }}</label>
          <input class="inp" type="password" [(ngModel)]="openaiKey"
                 [placeholder]="cfg.openaiKeySet ? '•••••• (saved — khali = koi change nahi)' : 'OpenAI key (recommended LLM)'">
        </div>
      </div>
      <small style="color:#0f766e">💡 LLM (dimaag): OpenAI key set ho to wahi use hoga (reliable). Gemini ki free quota 0 aa rahi thi. Sarvam = awaaz (STT+TTS).</small>

      <button class="btn primary" [disabled]="savingCfg()" (click)="saveConfig()">
        {{ savingCfg() ? 'Saving…' : 'Save bridge keys' }}
      </button>
      <small>Sarvam (dashboard.sarvam.ai) + Gemini (aistudio.google.com/apikey) keys yahan daalo — bridge inhe DB se padhta hai. Key badalne ke baad bridge restart karna (systemctl restart voice-bridge).</small>
    </div>

    @if (msg()) { <div class="ok">{{ msg() }}</div> }
    @if (err()) { <div class="err">{{ err() }}</div> }

    <input class="inp search" [(ngModel)]="filter" placeholder="Firm search…">

    @if (loading()) { <p class="muted">Load…</p> }
    @else {
      @for (a of filtered(); track a.firmId) {
        <div class="card" [class.on]="a.enabled">
          <div class="row" (click)="a._open = !a._open">
            <div class="firm">
              <span class="dot" [class.green]="a.enabled"></span>
              <strong>{{ a.firmName }}</strong>
              <span class="agent">{{ a.enabled ? a.agentName : 'OFF' }}</span>
            </div>
            <span class="chev">{{ a._open ? '▾' : '▸' }}</span>
          </div>

          @if (a._open) {
            <div class="body">
              <label class="sw">
                <input type="checkbox" [(ngModel)]="a.enabled"> <span>Voice Agent ON</span>
              </label>

              <div class="grid">
                <div>
                  <label>Agent ka naam</label>
                  <input class="inp" [(ngModel)]="a.agentName" placeholder="Riddhi">
                </div>
                <div>
                  <label>Bhasha</label>
                  <select class="inp" [(ngModel)]="a.language">
                    <option value="hi-IN">Hindi</option>
                    <option value="en-IN">English (India)</option>
                    <option value="gu-IN">Gujarati</option>
                    <option value="mr-IN">Marathi</option>
                    <option value="ta-IN">Tamil</option>
                    <option value="te-IN">Telugu</option>
                    <option value="kn-IN">Kannada</option>
                    <option value="bn-IN">Bengali</option>
                    <option value="pa-IN">Punjabi</option>
                  </select>
                </div>
                <div>
                  <label>Awaaz (Sarvam)</label>
                  <select class="inp" [(ngModel)]="a.voiceSpeaker">
                    <option value="anushka">Anushka (F)</option>
                    <option value="manisha">Manisha (F)</option>
                    <option value="vidya">Vidya (F)</option>
                    <option value="arya">Arya (F)</option>
                    <option value="abhilash">Abhilash (M)</option>
                    <option value="karun">Karun (M)</option>
                    <option value="hitesh">Hitesh (M)</option>
                  </select>
                </div>
                <div>
                  <label>Exotel Number (is firm ka)</label>
                  <input class="inp" [(ngModel)]="a.exotelNumber" placeholder="020XXXXXXXX">
                </div>
              </div>

              <label>First message (call uthate hi bolegi)</label>
              <textarea class="inp ta" rows="2" [(ngModel)]="a.firstMessage"
                placeholder="Namaste! Main Riddhi bol rahi hoon…"></textarea>

              <label>System prompt (script — kaise/kya bole)</label>
              <textarea class="inp ta" rows="6" [(ngModel)]="a.systemPrompt"
                placeholder="Tum ek friendly hindi phone assistant ho…"></textarea>

              <div class="urlbox">
                <label>Exotel Voicebot applet URL (is firm ke liye — copy karke Exotel me daalo):</label>
                <div class="urlrow">
                  <code>{{ urlFor(a) }}</code>
                  <button class="btn sm" (click)="copy(urlFor(a))">Copy</button>
                </div>
              </div>

              <button class="btn primary" [disabled]="a._saving" (click)="save(a)">
                {{ a._saving ? 'Saving…' : 'Save' }}
              </button>
            </div>
          }
        </div>
      }
    }
  </div>
  `,
  styles: [`
    .wrap{max-width:820px;margin:0 auto;padding:18px}
    h1{font-size:24px;color:#0f766e;margin:0}
    .sub{color:#64748b;font-size:13px;margin:4px 0 16px}
    .cfg{background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:14px 16px;margin-bottom:14px}
    .cfg label{font-size:12px;font-weight:700;color:#0f766e;display:block;margin:10px 0 5px}
    .cfg small{color:#64748b;font-size:11px;display:block;margin-top:8px}
    .cfg-title{font-size:14px;font-weight:800;color:#0f766e;margin-bottom:4px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .inp{width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;font-size:14px;box-sizing:border-box;font-family:inherit}
    .inp.search{max-width:300px;margin-bottom:12px}
    .ta{resize:vertical}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;overflow:hidden}
    .card.on{border-color:#5eead4}
    .row{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer}
    .firm{display:flex;align-items:center;gap:10px}
    .dot{width:9px;height:9px;border-radius:50%;background:#cbd5e1}
    .dot.green{background:#10b981}
    .agent{font-size:12px;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:20px}
    .chev{color:#94a3b8}
    .body{padding:0 16px 16px;border-top:1px solid #f1f5f9}
    .body label{font-size:12px;font-weight:700;color:#475569;display:block;margin:12px 0 5px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .sw{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:14px;font-weight:700;color:#0f766e}
    .urlbox{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:9px;padding:10px;margin:14px 0}
    .urlrow{display:flex;align-items:center;gap:8px}
    .urlrow code{flex:1;font-size:12px;word-break:break-all;color:#0f172a}
    .btn{border:1px solid #cbd5e1;background:#fff;padding:9px 16px;border-radius:9px;font-weight:700;cursor:pointer;color:#334155;margin-top:12px}
    .btn.sm{padding:5px 12px;font-size:12px;margin:0}
    .btn.primary{background:#0d9488;color:#fff;border-color:#0d9488}
    .btn:disabled{opacity:.6}
    .ok{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;padding:9px 12px;border-radius:9px;font-size:13px;margin-bottom:10px}
    .err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:9px 12px;border-radius:9px;font-size:13px;margin-bottom:10px}
    .muted{color:#94a3b8}
  `]
})
export class AdminVoiceAgentsComponent implements OnInit {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/admin/voice-agents`;

  agents = signal<VoiceAgent[]>([]);
  loading = signal(false);
  msg = signal(''); err = signal('');
  filter = '';
  baseDomain = 'voice.anjaninex.com';

  cfg: { sarvamKeySet: boolean; geminiKeySet: boolean; openaiKeySet: boolean; bridgeDomain: string } =
    { sarvamKeySet: false, geminiKeySet: false, openaiKeySet: false, bridgeDomain: 'voice.anjaninex.com' };
  sarvamKey = '';
  geminiKey = '';
  openaiKey = '';
  savingCfg = signal(false);

  ngOnInit() {
    this.loadConfig();
    this.load();
  }

  async loadConfig() {
    try {
      this.cfg = await firstValueFrom(this.http.get<any>(`${this.base}/config`));
      if (this.cfg.bridgeDomain) this.baseDomain = this.cfg.bridgeDomain;
    } catch {}
  }

  async saveConfig() {
    this.savingCfg.set(true); this.err.set('');
    try {
      this.cfg = await firstValueFrom(this.http.put<any>(`${this.base}/config`, {
        sarvamKey: this.sarvamKey || null,
        geminiKey: this.geminiKey || null,
        openaiKey: this.openaiKey || null,
        bridgeDomain: (this.baseDomain || '').trim() || null
      }));
      this.sarvamKey = ''; this.geminiKey = ''; this.openaiKey = '';
      this.flash('Bridge keys saved. (Bridge restart karna: systemctl restart voice-bridge)');
    } catch (e: any) { this.err.set(e?.error?.error || 'Save fail.'); }
    finally { this.savingCfg.set(false); }
  }

  private flash(m: string) { this.msg.set(m); setTimeout(() => this.msg.set(''), 3000); }

  async load() {
    this.loading.set(true); this.err.set('');
    try { this.agents.set(await firstValueFrom(this.http.get<VoiceAgent[]>(this.base))); }
    catch (e: any) { this.err.set(e?.error?.error || 'Load fail.'); }
    finally { this.loading.set(false); }
  }

  filtered() {
    const q = this.filter.trim().toLowerCase();
    return q ? this.agents().filter(a => (a.firmName || '').toLowerCase().includes(q)) : this.agents();
  }

  urlFor(a: VoiceAgent) {
    const d = (this.baseDomain || 'voice.anjaninex.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `wss://${d}/media?firm_id=${a.firmId}`;
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => this.flash('Copy ho gaya!'));
  }

  async save(a: VoiceAgent) {
    a._saving = true; this.err.set('');
    try {
      await firstValueFrom(this.http.put(`${this.base}/${a.firmId}`, {
        enabled: a.enabled, agentName: a.agentName, firstMessage: a.firstMessage,
        systemPrompt: a.systemPrompt, language: a.language,
        voiceSpeaker: a.voiceSpeaker, exotelNumber: a.exotelNumber
      }));
      this.flash(`${a.firmName} — saved.`);
    } catch (e: any) { this.err.set(e?.error?.error || 'Save fail.'); }
    finally { a._saving = false; }
  }
}
