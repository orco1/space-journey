import { PLANETS, SUN, LINES, planetById, type BodyDef, type Temp } from './data';
import { makePlanetThumb } from './textures';

export interface UICallbacks {
  onSelect: (id: string) => void;
  onLineupToggle: () => boolean; // returns new state
  onReplay: () => void;
  onMuteToggle: () => boolean; // returns new muted state
  onBrightness: (value: number) => void;
}

/** Grown-up brightness control (§ screens and rooms vary a lot). */
export const BRIGHTNESS = { min: 0.5, max: 2.4, step: 0.05, default: 1.45 };
const BRIGHTNESS_KEY = 'space-journey.brightness';

export function loadBrightness(): number {
  const raw = Number(localStorage.getItem(BRIGHTNESS_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return BRIGHTNESS.default;
  return Math.min(BRIGHTNESS.max, Math.max(BRIGHTNESS.min, raw));
}

const SPEAKER_ON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const SPEAKER_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/></svg>';
const BRIGHTNESS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"/></svg>';

function planetIconSVG(def: BodyDef): string {
  const grad = `
    <radialGradient id="g-${def.id}" cx="35%" cy="35%" r="80%">
      <stop offset="0%" stop-color="${def.color}"/>
      <stop offset="100%" stop-color="${def.color2}"/>
    </radialGradient>`;
  let extras = '';
  if (def.hasSaturnRings) {
    extras = `<ellipse cx="24" cy="24" rx="22" ry="7" fill="none" stroke="#e6d5a8" stroke-width="3.4" transform="rotate(-18 24 24)"/>`;
  } else if (def.hasFaintRing) {
    extras = `<ellipse cx="24" cy="24" rx="17" ry="5" fill="none" stroke="#bfeef2" stroke-width="2" opacity="0.8" transform="rotate(78 24 24)"/>`;
  }
  return `<svg viewBox="0 0 48 48"><defs>${grad}</defs><circle cx="24" cy="24" r="13" fill="url(#g-${def.id})"/>${extras}</svg>`;
}

function tempIconSVG(temp: Temp): string {
  if (temp === 'home') {
    // house — "פה אנחנו גרים"
    return `<svg viewBox="0 0 48 48"><path d="M8 24 24 10l16 14" fill="none" stroke="#ffd166" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 23v14h22V23" fill="#ffd166" opacity="0.35" stroke="#ffd166" stroke-width="3" stroke-linejoin="round"/><rect x="21" y="27" width="6" height="10" rx="1.5" fill="#ffd166"/></svg>`;
  }
  const hot = temp === 'hot';
  const color = hot ? '#ff5d47' : '#6fc3ff';
  const level = hot ? 10 : 26; // mercury column top (svg y)
  return `<svg viewBox="0 0 48 48">
    <rect x="20" y="6" width="8" height="28" rx="4" fill="none" stroke="#e8ecff" stroke-width="3"/>
    <rect x="22.5" y="${level}" width="3" height="${32 - level}" fill="${color}"/>
    <circle cx="24" cy="38" r="7" fill="${color}"/>
    ${
      hot
        ? '<path d="M38 10q3 3 0 6t0 6" fill="none" stroke="#ff5d47" stroke-width="2.5" stroke-linecap="round"/><path d="M43 10q3 3 0 6t0 6" fill="none" stroke="#ff5d47" stroke-width="2.5" stroke-linecap="round"/>'
        : '<path d="M38 12l4 4m0-4-4 4M40 10v8m-4-4h8" stroke="#9fd8ff" stroke-width="1.8" stroke-linecap="round"/>'
    }
  </svg>`;
}

function sizeCompareSVG(def: BodyDef): string {
  // sqrt scale keeps Jupiter on-card while staying obviously bigger
  const earthR = 9;
  const r = Math.min(34, Math.max(4, earthR * Math.sqrt(def.sizeVsEarth)));
  const w = 110;
  const cy = 44;
  const px = 30;
  const ex = 82;
  return `<svg viewBox="0 0 ${w} 66">
    <circle cx="${px}" cy="${cy - r}" r="${r}" fill="${def.color}" stroke="${def.color2}" stroke-width="2"/>
    <circle cx="${ex}" cy="${cy - earthR}" r="${earthR}" fill="#4d8fd1" stroke="#3faf5e" stroke-width="2.5"/>
  </svg>`;
}

export class UI {
  private strip: HTMLElement;
  private card: HTMLElement;
  private cardName: HTMLElement;
  private cardIcons: HTMLElement;
  private lineupBtn: HTMLElement;
  private muteBtn: HTMLElement;
  private brightnessBtn: HTMLElement;
  private brightnessPanel: HTMLElement;
  private brightnessRange: HTMLInputElement;
  private countdownEl: HTMLElement;
  private cardTimer = 0;
  private countdownTimers: number[] = [];

  constructor(root: HTMLElement, private cb: UICallbacks) {
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="card" class="hidden" dir="rtl">
        <div id="card-name"></div>
        <div id="card-row">
          <div id="card-icons"></div>
          <button id="replay" aria-label="שמע שוב">${SPEAKER_ON}</button>
        </div>
      </div>
      <button id="lineup"><span class="lineup-icon">${lineupIconSVG()}</span><span class="lineup-label">${LINES.lineup}</span></button>
      <button id="mute" aria-label="השתק">${SPEAKER_ON}</button>
      <button id="brightness-btn" aria-label="בהירות">${BRIGHTNESS_ICON}</button>
      <div id="brightness-panel" class="hidden">
        <span class="bright-dim">${BRIGHTNESS_ICON}</span>
        <input id="brightness-range" type="range" aria-label="בהירות"
               min="${BRIGHTNESS.min}" max="${BRIGHTNESS.max}" step="${BRIGHTNESS.step}">
        <span class="bright-bright">${BRIGHTNESS_ICON}</span>
      </div>
      <div id="strip" dir="rtl"></div>
      <div id="countdown"></div>
      <div id="rotate-overlay"><div class="rotate-inner">🚀<div class="rotate-phone">📱</div></div></div>
      `,
    );

    this.strip = root.querySelector('#strip')!;
    this.card = root.querySelector('#card')!;
    this.cardName = root.querySelector('#card-name')!;
    this.cardIcons = root.querySelector('#card-icons')!;
    this.lineupBtn = root.querySelector('#lineup')!;
    this.muteBtn = root.querySelector('#mute')!;
    this.brightnessBtn = root.querySelector('#brightness-btn')!;
    this.brightnessPanel = root.querySelector('#brightness-panel')!;
    this.brightnessRange = root.querySelector('#brightness-range')!;
    this.countdownEl = root.querySelector('#countdown')!;

    // Strip: DOM order Mercury→Neptune; with dir="rtl" Mercury lands on the
    // right, matching Hebrew reading direction (§7).
    for (const def of PLANETS) {
      const btn = document.createElement('button');
      btn.className = 'strip-btn';
      btn.dataset.id = def.id;
      btn.setAttribute('aria-label', def.nameHe);
      btn.innerHTML = planetIconSVG(def); // stand-in until the photo is ready
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.cb.onSelect(def.id);
      });
      this.strip.appendChild(btn);

      // Swap in the real planet, rendered from the same texture the 3D body uses.
      void makePlanetThumb(def).then((url) => {
        if (!url) return; // texture missing — the drawn icon stays
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        btn.replaceChildren(img);
      });
    }

    this.brightnessBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.brightnessPanel.classList.toggle('hidden');
      this.brightnessBtn.classList.toggle('active', !this.brightnessPanel.classList.contains('hidden'));
    });

    this.brightnessRange.value = String(loadBrightness());
    this.brightnessRange.addEventListener('input', () => {
      const v = Number(this.brightnessRange.value);
      this.cb.onBrightness(v);
      localStorage.setItem(BRIGHTNESS_KEY, String(v));
    });
    // Keep slider drags away from the scene's camera/tap handling.
    for (const ev of ['pointerdown', 'pointermove', 'pointerup'] as const) {
      this.brightnessPanel.addEventListener(ev, (e) => e.stopPropagation());
    }

    this.lineupBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const active = this.cb.onLineupToggle();
      this.lineupBtn.classList.toggle('active', active);
    });

    this.muteBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const muted = this.cb.onMuteToggle();
      this.muteBtn.innerHTML = muted ? SPEAKER_OFF : SPEAKER_ON;
      this.muteBtn.classList.toggle('muted', muted);
    });

    this.card.querySelector('#replay')!.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.cb.onReplay();
      this.bumpCardTimer();
    });

    // Any tap dismisses the card (§6) — planets taps included, via bubbling.
    window.addEventListener('pointerdown', (e) => {
      this.brightnessPanel.classList.add('hidden');
      this.brightnessBtn.classList.remove('active');
      if (this.card.contains(e.target as Node)) return;
      this.hideCard();
    });
  }

  /** Big visual 3-2-1-🚀 to shout along with, synced to the spoken countdown. */
  showCountdown(totalSec: number) {
    this.cancelCountdown();
    const steps = ['3', '2', '1', '🚀'];
    const stepMs = (totalSec * 1000) / steps.length;
    steps.forEach((step, i) => {
      this.countdownTimers.push(
        window.setTimeout(() => {
          this.countdownEl.textContent = step;
          this.countdownEl.classList.remove('pop');
          void this.countdownEl.offsetWidth; // restart the pop animation
          this.countdownEl.classList.add('pop');
        }, i * stepMs),
      );
    });
    this.countdownTimers.push(
      window.setTimeout(() => this.cancelCountdown(), totalSec * 1000 + 600),
    );
  }

  cancelCountdown() {
    for (const t of this.countdownTimers) window.clearTimeout(t);
    this.countdownTimers = [];
    this.countdownEl.textContent = '';
    this.countdownEl.classList.remove('pop');
  }

  /** Highlight the planet the rocket is at (or flying to). */
  setActivePlanet(id: string | null) {
    for (const btn of this.strip.querySelectorAll<HTMLElement>('.strip-btn')) {
      btn.classList.toggle('active', btn.dataset.id === id);
    }
  }

  setTravelling(travelling: boolean) {
    this.strip.classList.toggle('travelling', travelling);
  }

  showCard(id: string) {
    const def = id === 'sun' ? null : planetById.get(id);
    this.cardName.textContent = def ? def.nameHe : SUN.nameHe;
    this.cardIcons.innerHTML = def
      ? `<div class="icon-box">${sizeCompareSVG(def)}</div><div class="icon-box">${tempIconSVG(def.temp)}</div>`
      : `<div class="icon-box">${tempIconSVG('hot')}</div>`;
    this.card.classList.remove('hidden');
    this.bumpCardTimer();
  }

  hideCard() {
    this.card.classList.add('hidden');
    window.clearTimeout(this.cardTimer);
  }

  get cardVisible(): boolean {
    return !this.card.classList.contains('hidden');
  }

  private bumpCardTimer() {
    window.clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => this.hideCard(), 8000);
  }
}

function lineupIconSVG(): string {
  const dots = [4, 12, 22, 34]
    .map((x, i) => `<circle cx="${x + 4}" cy="12" r="${2.5 + i * 0.9}" fill="currentColor"/>`)
    .join('');
  return `<svg viewBox="0 0 46 24">${dots}</svg>`;
}
