import './style.css';
import { planetById } from './data';
import { SpaceScene } from './scene';
import { Rocket } from './rocket';
import { AudioManager } from './audio';
import { UI } from './ui';

const COUNTDOWN_SEC = 1.9; // PRD §5.2: keep it under 2 seconds
const FILLER_MIN_TRANSIT = 6; // "עוד רגע מגיעים..." only on the long hauls

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.id = 'scene';
app.appendChild(canvas);

const scene = new SpaceScene(canvas);
const rocket = new Rocket(scene.scene);
const audio = new AudioManager();

type Phase = 'idle' | 'countdown' | 'transit';
let phase: Phase = 'idle';
let target: string | null = null; // where we're headed (or just arrived)
let currentPlanet: string | null = null; // where the rocket is parked
let countdownTimer = 0;
let lastCard: string | null = null; // what the open card (and replay button) refers to

const ui = new UI(app, {
  onSelect: (id) => select(id),
  onLineupToggle: () => {
    scene.setLineup(!scene.lineupActive);
    audio.tapPop();
    return scene.lineupActive;
  },
  onReplay: () => {
    if (lastCard) audio.say(lastCard);
  },
  onMuteToggle: () => {
    audio.setMuted(!audio.muted);
    return audio.muted;
  },
});

function select(id: string) {
  scene.notifyInteraction();

  if (id === 'sun') {
    // The sun introduces itself; the rocket stays put.
    lastCard = 'sun';
    ui.showCard('sun');
    audio.say('sun');
    return;
  }

  const def = planetById.get(id);
  if (!def) return;
  scene.pulsePlanet(id);

  // Already there → instant replay, no flight (repetition is the point, §2).
  if (phase === 'idle' && currentPlanet === id) {
    lastCard = id;
    ui.showCard(id);
    scene.focusPlanet(id);
    audio.say(id);
    return;
  }

  // Already flying there → let it fly.
  if (phase === 'transit' && target === id) return;

  ui.hideCard();
  scene.focusPlanet(null);
  target = id;
  ui.setActivePlanet(id);
  ui.setTravelling(true);
  scene.setBeacon(id);

  if (phase === 'countdown') return; // countdown continues toward the new target

  if (phase === 'transit') {
    // §5.4 — immediate smooth redirect, full duration from here.
    rocket.redirect(...transitArgs(id));
    audio.say('depart');
    audio.launchWhoosh();
    return;
  }

  // idle → countdown → launch
  phase = 'countdown';
  currentPlanet = null;
  rocket.prepare();
  if (audio.hasVoice()) audio.say('countdown');
  else audio.countdownBeeps();
  ui.showCountdown(COUNTDOWN_SEC);
  window.clearTimeout(countdownTimer);
  countdownTimer = window.setTimeout(launch, COUNTDOWN_SEC * 1000);
}

function launch() {
  if (!target) return;
  phase = 'transit';
  rocket.launch(...transitArgs(target));
  audio.launchWhoosh();
  audio.engineStart();
}

function transitArgs(
  id: string,
): [() => import('three').Vector3, number, number, () => void, () => void] {
  const def = planetById.get(id)!;
  return [
    () => scene.planetPosition(id),
    def.radius,
    def.transitSec,
    () => arrive(id),
    () => {
      if (def.transitSec >= FILLER_MIN_TRANSIT) audio.sayIfIdle('almost');
    },
  ];
}

function arrive(id: string) {
  phase = 'idle';
  currentPlanet = id;
  lastCard = id;
  scene.setBeacon(null);
  scene.celebrate(id);
  audio.engineStop();
  audio.arrivalChime();
  audio.saySequence(['arrive', id]);
  ui.setTravelling(false);
  ui.setActivePlanet(id);
  ui.showCard(id);
  scene.focusPlanet(id);
}

// ---------------- pointer input: tap vs drag vs pinch ----------------

const pointers = new Map<number, { x: number; y: number }>();
let pinching = false; // once a pinch starts, the gesture never becomes a tap
let moved = false;
let downX = 0;
let downY = 0;
let downTime = 0;

function pinchDistance(): number {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function pinchMid(): { x: number; y: number } {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
let lastPinch = 0;
let lastMid = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    pinching = true;
    lastPinch = pinchDistance();
    lastMid = pinchMid();
  } else if (pointers.size === 1) {
    pinching = false;
    moved = false;
    downX = e.clientX;
    downY = e.clientY;
    downTime = performance.now();
  }
  scene.notifyInteraction();
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const prevX = p.x;
  const prevY = p.y;
  p.x = e.clientX;
  p.y = e.clientY;

  if (pointers.size === 2) {
    const d = pinchDistance();
    const mid = pinchMid();
    if (lastPinch > 0) scene.zoomBy(d / lastPinch, mid.x, mid.y);
    scene.panBy(lastMid.x, lastMid.y, mid.x, mid.y);
    lastPinch = d;
    lastMid = mid;
    return;
  }
  if (pinching) return; // second finger lifted — don't turn the leftover into a drag

  const dx = e.clientX - downX;
  const dy = e.clientY - downY;
  if (!moved && Math.hypot(dx, dy) < 8) return;
  moved = true;
  scene.dragBy(e.clientX - prevX, e.clientY - prevY);
});

canvas.addEventListener('pointerup', (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size > 0) return;
  const wasPinch = pinching;
  pinching = false;
  if (wasPinch || moved || performance.now() - downTime > 500) return;
  const picked = scene.pick(e.clientX, e.clientY);
  if (picked) select(picked);
});

canvas.addEventListener('pointercancel', (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    pinching = false;
    moved = true; // a cancelled gesture is never a tap
  }
});

// desktop: scroll wheel / trackpad zoom
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    scene.zoomBy(1 - e.deltaY * 0.0016, e.clientX, e.clientY);
  },
  { passive: false },
);

// Audio needs a user gesture (§9) — unlock/resume on every touch.
window.addEventListener('pointerdown', () => audio.unlock());

// When the card fades, ease the camera back out.
new MutationObserver(() => {
  if (!ui.cardVisible) scene.focusPlanet(null);
}).observe(document.getElementById('card')!, { attributes: true, attributeFilter: ['class'] });

// ---------------- main loop ----------------

let last = performance.now();
function step(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  scene.update(dt);
  rocket.update(dt);
}
function frame(now: number) {
  step(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Watchdog: some embedded webviews throttle rAF while timers keep running.
// If rAF stalls, keep the world moving from a timer instead.
window.setInterval(() => {
  const now = performance.now();
  if (now - last > 120) step(now);
}, 33);
