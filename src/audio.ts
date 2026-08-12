import { CLIPS } from './data';

// Audio strategy (PRD §9):
// 1. Pre-recorded clips from /audio/**.mp3 (drop-in, parent-recorded).
// 2. Fallback: speechSynthesis with a real he-* voice.
// 3. If neither exists — stay silent (never read Hebrew with a non-Hebrew voice).
// All SFX (engine, whoosh, chime, ambient pad) are synthesized with WebAudio,
// so they need no files at all.

interface VoiceItem {
  key: string;
  text: string;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private voiceGain: GainNode | null = null;

  private rawClips = new Map<string, ArrayBuffer>();
  private buffers = new Map<string, AudioBuffer>();

  private heVoice: SpeechSynthesisVoice | null = null;
  private voiceSource: AudioBufferSourceNode | null = null;
  private queue: VoiceItem[] = [];
  private speakingSeq = 0;

  private engineNodes: { gain: GainNode; src: AudioBufferSourceNode } | null = null;

  muted = false;

  constructor() {
    this.preloadClips();
    this.findHebrewVoice();
  }

  private preloadClips() {
    for (const [key, clip] of Object.entries(CLIPS)) {
      void this.tryFetchClip(key, clip.url, ['mp3', 'm4a']);
    }
  }

  private async tryFetchClip(key: string, base: string, exts: string[]) {
    for (const ext of exts) {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}${base}.${ext}`);
        const type = res.headers.get('content-type') ?? '';
        // Dev servers answer missing files with index.html — treat that as absent.
        if (!res.ok || type.includes('text/html')) continue;
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 200) {
          this.rawClips.set(key, buf);
          return;
        }
      } catch {
        /* offline or missing — fall through */
      }
    }
  }

  private findHebrewVoice() {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this.heVoice = voices.find((v) => v.lang.toLowerCase().startsWith('he')) ?? null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  }

  /** Must be called from a user gesture before any sound can play. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.value = 1;
    this.voiceGain.connect(this.master);
    this.startAmbient();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    if (muted) this.stopVoice();
  }

  // ---------------- voice ----------------

  /** Play one clip (or its TTS fallback), cancelling anything queued. */
  say(key: string) {
    this.saySequence([key]);
  }

  /** Play clips one after another, cancelling anything already playing. */
  saySequence(keys: string[]) {
    this.stopVoice();
    if (this.muted) return;
    const seq = ++this.speakingSeq;
    this.queue = keys
      .map((key) => ({ key, text: CLIPS[key]?.text ?? '' }))
      .filter((i) => i.text.length > 0);
    this.playNext(seq);
  }

  /** Speak only if nothing else is playing (used for the "almost there" filler). */
  sayIfIdle(key: string) {
    if (this.queue.length > 0 || this.voiceSource || speechSynthesis?.speaking) return;
    this.say(key);
  }

  private stopVoice() {
    this.speakingSeq++;
    this.queue = [];
    if (this.voiceSource) {
      try {
        this.voiceSource.stop();
      } catch {
        /* already stopped */
      }
      this.voiceSource = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  private async playNext(seq: number) {
    if (seq !== this.speakingSeq) return;
    const item = this.queue.shift();
    if (!item) return;

    const buffer = await this.getBuffer(item.key);
    if (seq !== this.speakingSeq) return;

    if (buffer && this.ctx && this.voiceGain) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.voiceGain);
      src.onended = () => {
        if (this.voiceSource === src) this.voiceSource = null;
        this.playNext(seq);
      };
      this.voiceSource = src;
      src.start();
      return;
    }

    // TTS fallback — only with a genuine Hebrew voice.
    if (this.heVoice) {
      const utter = new SpeechSynthesisUtterance(item.text);
      utter.voice = this.heVoice;
      utter.lang = this.heVoice.lang;
      utter.rate = 1.05;
      utter.pitch = 1.1;
      utter.onend = () => this.playNext(seq);
      utter.onerror = () => this.playNext(seq);
      speechSynthesis.speak(utter);
      return;
    }

    this.playNext(seq);
  }

  private async getBuffer(key: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(key)) return this.buffers.get(key)!;
    const raw = this.rawClips.get(key);
    if (!raw || !this.ctx) return null;
    try {
      const buf = await this.ctx.decodeAudioData(raw.slice(0));
      this.buffers.set(key, buf);
      return buf;
    } catch {
      this.rawClips.delete(key);
      return null;
    }
  }

  /** True if the countdown will actually be heard (clip or Hebrew TTS). */
  hasVoice(): boolean {
    return this.rawClips.has('countdown') || this.heVoice !== null;
  }

  // ---------------- synthesized SFX ----------------

  private noiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Three ticks + a rising "launch" zip — countdown feel without words. */
  countdownBeeps() {
    if (!this.ctx || !this.sfx) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.blip(440, t0 + i * 0.45, 0.12, 0.25);
    }
    this.blip(700, t0 + 3 * 0.45, 0.35, 0.3, 1400);
  }

  private blip(freq: number, at: number, dur: number, gain: number, glideTo?: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g).connect(this.sfx!);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  launchWhoosh() {
    if (!this.ctx || !this.sfx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    const t = ctx.currentTime;
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(2400, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 1);
  }

  engineStart() {
    if (!this.ctx || !this.sfx || this.engineNodes) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.3);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start();
    this.engineNodes = { gain: g, src };
  }

  engineStop() {
    if (!this.ctx || !this.engineNodes) return;
    const { gain, src } = this.engineNodes;
    this.engineNodes = null;
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0.0001, t, 0.15);
    src.stop(t + 0.8);
  }

  arrivalChime() {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    this.bell(784, t, 0.9, 0.25);
    this.bell(1175, t + 0.18, 1.1, 0.2);
  }

  private bell(freq: number, at: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    for (const [mult, amp] of [
      [1, 1],
      [2.76, 0.3],
      [5.4, 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(gain * amp, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      osc.connect(g).connect(this.sfx!);
      osc.start(at);
      osc.stop(at + dur + 0.1);
    }
  }

  tapPop() {
    if (!this.ctx || !this.sfx) return;
    this.blip(520, this.ctx.currentTime, 0.09, 0.15, 780);
  }

  private startAmbient() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const pad = ctx.createGain();
    pad.gain.value = 0.022;
    pad.connect(this.master);
    for (const [freq, detune] of [
      [130.81, 0],
      [196.0, 3],
      [261.63, -3],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      // slow independent breathing per note
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.25;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(g).connect(pad);
      osc.start();
      lfo.start();
    }
  }
}
