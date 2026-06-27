import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { findHelp, LANG_LABEL, LANG_BCP, Lang, HelpPage } from './help-content';
import { AiService } from '../../modules/ai/services/ai.service';

/**
 * Anji — per-page Help Desk. No AI: hand-written help per page in 3 languages, with
 * browser Web Speech API for 🔊 listen (TTS) and 🎤 speak (STT). Mic input is
 * keyword-matched against the page's FAQs/steps to speak the best answer.
 */
@Component({
  selector: 'app-anji-help',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Floating launcher -->
    @if (!open()) {
      <button class="anji-fab" title="Assistant — pakad kar khisko (drag)"
              [style.left.px]="fabPos()?.x" [style.top.px]="fabPos()?.y"
              [style.right]="fabPos() ? 'auto' : null" [style.bottom]="fabPos() ? 'auto' : null"
              (pointerdown)="fabDown($event)">
        <span class="anji-face">🙋</span>
        <span class="anji-fab-txt">Help</span>
      </button>
    }

    @if (open()) {
      <div class="anji-wrap"
           [style.left.px]="panelPos()?.x" [style.top.px]="panelPos()?.y"
           [style.right]="panelPos() ? 'auto' : null" [style.bottom]="panelPos() ? 'auto' : null">
        <!-- Header (drag handle) -->
        <div class="anji-head anji-drag" (pointerdown)="panelDown($event)">
          <div class="anji-id"><span class="anji-face">🙋</span> <b>Assistant</b> <small>⠿ drag</small></div>
          <button class="anji-x" (click)="open.set(false); stopAll()">×</button>
        </div>

        <!-- Language tabs -->
        <div class="anji-langs">
          @for (l of langs; track l) {
            <button class="anji-lang" [class.on]="lang()===l" (click)="setLang(l)">{{ label(l) }}</button>
          }
        </div>

        <!-- Voice: female / male -->
        <div class="anji-langs" style="margin-top:6px;">
          <button class="anji-lang" [class.on]="voice()==='female'" (click)="setVoice('female')" title="Female voice">👩 Female</button>
          <button class="anji-lang" [class.on]="voice()==='male'" (click)="setVoice('male')" title="Male voice">👨 Male</button>
        </div>

        <!-- Body -->
        <div class="anji-body">
          <div class="anji-title">{{ page().title }}</div>
          <p class="anji-intro">{{ page().intro }}</p>

          <!-- Spoken Q&A result -->
          @if (askedQ()) {
            <div class="anji-qa">
              <div class="anji-q">🗣️ {{ askedQ() }}</div>
              <div class="anji-a">💬 {{ answer() }}</div>
            </div>
          }
          @if (listening()) { <div class="anji-listening">🎤 Sun raha hoon… boliye</div> }

          <button class="anji-sec anji-toggle" (click)="showSteps.set(!showSteps())">
            <span>{{ showSteps() ? '▾' : '▸' }} Steps</span>
          </button>
          @if (showSteps()) {
            <ol class="anji-steps">
              @for (s of page().steps; track s) { <li (click)="speak(s)">{{ s }}</li> }
            </ol>
          }

          <button class="anji-sec anji-toggle" (click)="showFaqs.set(!showFaqs())">
            <span>{{ showFaqs() ? '▾' : '▸' }} Common sawaal (dabao / pucho)</span>
          </button>
          @if (showFaqs()) {
            <div class="anji-faqs">
              @for (f of page().faqs; track f.q) {
                <button class="anji-faq" (click)="speakFaq(f.a)">❓ {{ f.q }}</button>
              }
            </div>
          }
        </div>

        <!-- Controls -->
        <div class="anji-ctrl">
          <input class="anji-input" [(ngModel)]="typed" (keyup.enter)="askTyped()"
                 [placeholder]="placeholder()">
          <button class="anji-mic" [class.on]="listening()" (click)="toggleMic()" title="Bol kar pucho">🎤</button>
          <button class="anji-spk" (click)="speakAll()" title="Pura padh kar sunao">🔊</button>
          @if (speaking()) { <button class="anji-stop" (click)="stopAll()" title="Stop">⏹</button> }
        </div>
        @if (err()) { <div class="anji-err">{{ err() }}</div> }
      </div>
    }
  `,
  styles: [`
    .anji-fab {
      position: fixed; right: 18px; bottom: 18px; z-index: 1190;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
      width: 60px; height: 60px; border: 0; border-radius: 50%; cursor: grab; color: #fff;
      background: var(--anjaninex-navy, #1B2E5C); box-shadow: 0 8px 22px rgba(0,0,0,.35);
      transition: transform .12s; touch-action: none; user-select: none;
    }
    .anji-fab:active { cursor: grabbing; }
    .anji-drag { cursor: grab; touch-action: none; user-select: none; }
    .anji-drag:active { cursor: grabbing; }
    .anji-id small { font-size: 9px; opacity: .65; }
    .anji-fab:hover { transform: scale(1.08); }
    .anji-fab::after { content: ''; position: absolute; inset: 0; border-radius: 50%;
      background: linear-gradient(180deg, rgba(255,255,255,.30), transparent 55%); pointer-events: none; }
    .anji-face { font-size: 22px; line-height: 1; }
    .anji-fab-txt { font-size: 10px; font-weight: 900; letter-spacing: .5px; }

    .anji-wrap {
      position: fixed; right: 18px; bottom: 18px; z-index: 1191;
      width: 360px; max-width: calc(100vw - 24px); max-height: 82vh; display: flex; flex-direction: column;
      background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 18px 55px rgba(0,0,0,.4);
      font-family: system-ui, sans-serif;
    }
    .anji-head { display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; background: var(--anjaninex-navy, #1B2E5C); color: #fff; }
    .anji-id { display: flex; align-items: center; gap: 6px; } .anji-id small { opacity: .8; font-weight: 600; }
    .anji-x { background: transparent; border: 0; color: #fff; font-size: 24px; cursor: pointer; line-height: 1; }

    .anji-langs { display: flex; gap: 6px; padding: 8px 12px; background: #f4f6fb; }
    .anji-lang { flex: 1; padding: 6px 4px; border: 1px solid #d6def0; background: #fff; border-radius: 8px;
      font-size: 12px; font-weight: 700; cursor: pointer; color: #475569; }
    .anji-lang.on { background: var(--anjaninex-navy, #1B2E5C); color: #fff; border-color: transparent; }

    .anji-body { padding: 12px 14px; overflow-y: auto; }
    .anji-title { font-size: 16px; font-weight: 800; color: var(--anjaninex-navy, #1B2E5C); }
    .anji-intro { font-size: 13px; color: #475569; margin: 4px 0 10px; line-height: 1.45; }
    .anji-qa { background: #eef4ff; border: 1px solid #cfe0ff; border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; }
    .anji-q { font-size: 12px; font-weight: 700; color: #1e3a8a; }
    .anji-a { font-size: 13px; color: #111827; margin-top: 3px; line-height: 1.45; }
    .anji-listening { font-size: 12px; color: #b91c1c; font-weight: 700; margin-bottom: 8px; }
    .anji-sec { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin: 10px 0 4px; }
    .anji-toggle { display: block; width: 100%; text-align: left; background: #f4f6fb; border: 1px solid #e2e8f0;
      border-radius: 8px; padding: 7px 10px; cursor: pointer; letter-spacing: .3px; }
    .anji-toggle:hover { background: #eef4ff; border-color: #cfe0ff; color: #1e3a8a; }
    .anji-steps { margin: 0; padding-left: 18px; }
    .anji-steps li { font-size: 13px; color: #334155; margin-bottom: 5px; line-height: 1.4; cursor: pointer; }
    .anji-steps li:hover { color: var(--anjaninex-navy, #1B2E5C); }
    .anji-faqs { display: flex; flex-direction: column; gap: 5px; }
    .anji-faq { text-align: left; font-size: 12.5px; padding: 7px 9px; border: 1px solid #e2e8f0; background: #f8fafc;
      border-radius: 8px; cursor: pointer; color: #334155; }
    .anji-faq:hover { background: #eef4ff; border-color: #cfe0ff; }

    .anji-ctrl { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-top: 1px solid #eef0f4; }
    .anji-input { flex: 1; padding: 9px 10px; border: 1px solid #d6def0; border-radius: 10px; font-size: 13px; }
    .anji-mic, .anji-spk, .anji-stop { width: 40px; height: 38px; border: 0; border-radius: 10px; cursor: pointer; font-size: 17px; }
    .anji-mic { background: #ffe9e9; } .anji-mic.on { background: #dc2626; animation: anjipulse 1s infinite; }
    .anji-spk { background: #e6ecff; } .anji-stop { background: #fde68a; }
    @keyframes anjipulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.5); } 50% { box-shadow: 0 0 0 6px rgba(220,38,38,0); } }
    .anji-err { padding: 6px 14px 10px; font-size: 11.5px; color: #b91c1c; }
  `]
})
export class AnjiHelpComponent {
  private router = inject(Router);
  private ai = inject(AiService);
  langs: Lang[] = ['hinglish', 'english', 'gujarati'];

  // Sarvam TTS playback state — base64 WAV chunks played sequentially via one
  // <audio> element. Reference rakhi jaati hai taaki stopAll() pause/reset kar sake.
  private sarvamAudio: HTMLAudioElement | null = null;
  private sarvamQueue: string[] = [];
  private sarvamIdx = 0;
  private speakToken = 0;   // har naye speak() par badhta — purani async TTS race se bachata

  open = signal(false);
  // Steps + Common Sawaal default me HIDDEN (collapsed) — taaki chat/jawab saaf dikhe.
  // Header tap karke khol/band kar sakte hain.
  showSteps = signal(false);
  showFaqs = signal(false);
  lang = signal<Lang>(this.loadLang());
  voice = signal<'male' | 'female'>(this.loadVoice());
  url = signal<string>(this.router.url);

  typed = '';
  askedQ = signal('');
  answer = signal('');
  listening = signal(false);
  speaking = signal(false);
  err = signal('');

  private recog: any = null;

  entry = computed(() => findHelp(this.url()));
  page = computed<HelpPage>(() => this.entry()[this.lang()]);
  placeholder = computed(() =>
    this.lang() === 'gujarati' ? 'પ્રશ્ન લખો કે 🎤 બોલો…'
    : this.lang() === 'english' ? 'Type or 🎤 ask a question…'
    : 'Sawaal likho ya 🎤 bolo…');

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => { this.url.set(this.router.url); this.askedQ.set(''); this.answer.set(''); });
  }

  label(l: Lang) { return LANG_LABEL[l]; }
  setLang(l: Lang) { this.lang.set(l); try { localStorage.setItem('anji_lang', l); } catch {} this.stopAll(); }
  private loadVoice(): 'male' | 'female' {
    try { const v = localStorage.getItem('anji_voice'); if (v === 'male' || v === 'female') return v; } catch {}
    return 'female';
  }
  setVoice(v: 'male' | 'female') { this.voice.set(v); try { localStorage.setItem('anji_voice', v); } catch {} this.stopAll(); }
  private loadLang(): Lang {
    try { const v = localStorage.getItem('anji_lang') as Lang; if (v) return v; } catch {}
    return 'hinglish';
  }

  openPanel() { this.open.set(true); this.err.set(''); }

  // ---------- DRAG (mouse + touch via Pointer Events) ----------
  // FAB aur khula panel dono ko screen pe kahin bhi khisko sakte ho. Position localStorage
  // me yaad rehti hai. Click vs drag: 5px se kam hila to click (FAB → panel khulta hai).
  fabPos = signal<{ x: number; y: number } | null>(this.loadPos('anji_fab_pos'));
  panelPos = signal<{ x: number; y: number } | null>(this.loadPos('anji_panel_pos'));
  private drag: { kind: 'fab' | 'panel'; dx: number; dy: number; w: number; h: number; sx: number; sy: number; moved: boolean } | null = null;

  private loadPos(key: string): { x: number; y: number } | null {
    try {
      const v = localStorage.getItem(key);
      if (v) {
        const p = JSON.parse(v);
        if (typeof p?.x === 'number' && typeof p?.y === 'number') {
          // viewport ke andar clamp (window chhoti ho gayi ho to off-screen na rahe)
          const x = Math.max(2, Math.min((window.innerWidth || 360) - 64, p.x));
          const y = Math.max(2, Math.min((window.innerHeight || 640) - 64, p.y));
          return { x, y };
        }
      }
    } catch {}
    return null;
  }
  private savePos(key: string, p: { x: number; y: number }) { try { localStorage.setItem(key, JSON.stringify(p)); } catch {} }

  fabDown(e: PointerEvent) { this.startDrag('fab', e); }
  panelDown(e: PointerEvent) {
    // close (×) button par drag mat shuru karo — uska click chalne do
    if ((e.target as HTMLElement)?.closest('.anji-x')) return;
    this.startDrag('panel', e);
  }

  private startDrag(kind: 'fab' | 'panel', e: PointerEvent) {
    const handle = e.currentTarget as HTMLElement;
    const host = kind === 'fab' ? handle : (handle.closest('.anji-wrap') as HTMLElement);
    if (!host) return;
    const r = host.getBoundingClientRect();
    this.drag = { kind, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, sx: e.clientX, sy: e.clientY, moved: false };
    try { handle.setPointerCapture?.(e.pointerId); } catch {}
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onDragUp);
    window.addEventListener('pointercancel', this.onDragUp);
    e.preventDefault();
  }

  private onDragMove = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 5) return;
    d.moved = true;
    const x = Math.max(2, Math.min(window.innerWidth - d.w - 2, e.clientX - d.dx));
    const y = Math.max(2, Math.min(window.innerHeight - d.h - 2, e.clientY - d.dy));
    if (d.kind === 'fab') this.fabPos.set({ x, y }); else this.panelPos.set({ x, y });
  };

  private onDragUp = () => {
    const d = this.drag; this.drag = null;
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragUp);
    window.removeEventListener('pointercancel', this.onDragUp);
    if (!d) return;
    if (!d.moved) {
      if (d.kind === 'fab') this.openPanel();   // bina khiske click = panel kholo
      return;
    }
    if (d.kind === 'fab') { const p = this.fabPos(); if (p) this.savePos('anji_fab_pos', p); }
    else { const p = this.panelPos(); if (p) this.savePos('anji_panel_pos', p); }
  };

  // ---------- TTS ----------
  // Sarvam AI ki natural Indian awaaz pehle try karo; key na ho / fail ho to
  // browser Web Speech voice par fallback (Anji kabhi nahi tootta).
  speak(text: string) {
    if (!text || !text.trim()) return;
    const token = ++this.speakToken;
    // Pehle koi bhi chal rahi awaaz band karo (Sarvam audio + browser synth).
    this.stopAudio();
    try { window.speechSynthesis?.cancel(); } catch {}
    this.err.set('');

    const langCode = this.shortLang();
    this.ai.ttsSarvam(text, langCode, this.voice()).then(res => {
      // Race guard: is beech naya speak()/stop() chala ho to ye result chhod do.
      if (token !== this.speakToken) return;
      if (res && res.audios && res.audios.length) {
        this.playSarvam(res.audios, token);
      } else {
        // 204 / empty / error → browser voice fallback.
        this.browserSpeak(text);
      }
    }).catch(() => {
      if (token !== this.speakToken) return;
      this.browserSpeak(text);
    });
  }

  // lang() signal ('hinglish'|'english'|'gujarati') → Sarvam short code.
  private shortLang(): string {
    const l = this.lang();
    return l === 'english' ? 'en' : l === 'gujarati' ? 'gu' : 'hi';
  }

  // Sequentially play base64 WAV chunks via one <audio> element; chain via onended.
  private playSarvam(audios: string[], token: number) {
    this.sarvamQueue = audios;
    this.sarvamIdx = 0;
    this.speaking.set(true);
    const audio = new Audio();
    this.sarvamAudio = audio;
    audio.onended = () => {
      if (token !== this.speakToken) return;
      this.sarvamIdx++;
      if (this.sarvamIdx < this.sarvamQueue.length) {
        audio.src = 'data:audio/wav;base64,' + this.sarvamQueue[this.sarvamIdx];
        audio.play().catch(() => this.speaking.set(false));
      } else {
        this.speaking.set(false);
      }
    };
    audio.onerror = () => { if (token === this.speakToken) this.speaking.set(false); };
    audio.src = 'data:audio/wav;base64,' + this.sarvamQueue[0];
    audio.play().catch(() => this.speaking.set(false));
  }

  // Pause + reset Sarvam audio and clear the queue (used by stop + new speak).
  private stopAudio() {
    try {
      if (this.sarvamAudio) {
        this.sarvamAudio.onended = null;
        this.sarvamAudio.onerror = null;
        this.sarvamAudio.pause();
        this.sarvamAudio.src = '';
      }
    } catch {}
    this.sarvamAudio = null;
    this.sarvamQueue = [];
    this.sarvamIdx = 0;
  }

  // FALLBACK — original browser Web Speech voice (kept intact). Sarvam na ho to.
  browserSpeak(text: string) {
    try {
      const synth = window.speechSynthesis;
      if (!synth) { this.err.set('Is browser me speaker support nahi. Chrome use karein.'); return; }
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const bcp = LANG_BCP[this.lang()];
      u.lang = bcp;
      const voices = synth.getVoices();
      // best voice for lang, fallback to hi-IN, then en-IN
      u.voice = voices.find(v => v.lang === bcp)
             || voices.find(v => v.lang?.startsWith(bcp.split('-')[0]))
             || voices.find(v => v.lang === 'hi-IN')
             || voices.find(v => v.lang?.startsWith('en')) || null;
      u.rate = 0.96; u.pitch = 1;
      u.onstart = () => this.speaking.set(true);
      u.onend = () => this.speaking.set(false);
      u.onerror = () => this.speaking.set(false);
      synth.speak(u);
    } catch { this.err.set('Speaker chalu nahi ho paya.'); }
  }
  speakFaq(a: string) { this.askedQ.set(''); this.answer.set(a); this.speak(a); }
  speakAll() {
    const p = this.page();
    const text = [p.title, p.intro, ...p.steps].join('. ');
    this.speak(text);
  }
  stopAll() {
    // Naya token → koi pending Sarvam TTS promise apna result play na kare.
    this.speakToken++;
    this.stopAudio();
    try { window.speechSynthesis?.cancel(); } catch {}
    this.speaking.set(false);
    try { this.recog?.stop(); } catch {}
    this.listening.set(false);
  }

  // ---------- STT ----------
  toggleMic() {
    if (this.listening()) { this.stopAll(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { this.err.set('Is browser me mic support nahi. Chrome use karein.'); return; }
    this.err.set('');
    try {
      const r = new SR();
      this.recog = r;
      r.lang = LANG_BCP[this.lang()];
      r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
      r.onstart = () => this.listening.set(true);
      r.onerror = (e: any) => { this.listening.set(false); this.err.set('Mic: ' + (e?.error || 'error') + ' — mic permission allow karein.'); };
      r.onend = () => this.listening.set(false);
      r.onresult = (e: any) => {
        const t = e?.results?.[0]?.[0]?.transcript || '';
        this.listening.set(false);
        if (t) this.ask(t);
      };
      r.start();
    } catch { this.listening.set(false); this.err.set('Mic chalu nahi ho paya.'); }
  }

  askTyped() { const t = this.typed.trim(); if (t) { this.ask(t); this.typed = ''; } }

  // ---------- keyword match ----------
  ask(query: string) {
    this.askedQ.set(query);
    const a = this.bestAnswer(query);
    this.answer.set(a);
    this.speak(a);
  }
  private norm(s: string) { return (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
  private bestAnswer(query: string): string {
    const p = this.page();
    const qWords = this.norm(query).split(' ').filter(w => w.length > 2);
    let best = { score: 0, text: '' };
    const consider = (text: string, hay: string) => {
      let s = 0; for (const w of qWords) if (hay.includes(w)) s++;
      if (s > best.score) best = { score: s, text };
    };
    for (const f of p.faqs) consider(f.a, this.norm(f.q + ' ' + f.a));
    for (const st of p.steps) consider(st, this.norm(st));
    if (best.score === 0) {
      return this.lang() === 'gujarati' ? 'માફ કરશો, બરાબર સમજાયું નહીં. નીચે Common સવાલ જુઓ કે ફરી પૂછો.'
        : this.lang() === 'english' ? "Sorry, I didn't catch that. See the common questions below or ask again."
        : 'Maaf kijiye, theek se samajh nahi aaya. Niche common sawaal dekho ya dobara pucho.';
    }
    return best.text;
  }
}
