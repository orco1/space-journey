# המסע בחלל — The Space Journey 🚀

An interactive 3D solar system for a Hebrew-speaking 5-year-old.
Tap a planet → a rocket flies there (longer for farther planets) → the planet
introduces itself out loud in Hebrew.

Built with Three.js + Vite + TypeScript. Fully static, no backend, works offline.

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL on a tablet in landscape (or any browser).

Production build (a static folder you can host anywhere or open offline):

```bash
npm run build
npm run preview   # serves dist/ locally
```

## Record your own voice (do this!)

The app plays pre-recorded clips when they exist, and only falls back to the
browser's Hebrew text-to-speech when they don't. Recording the ~13 short lines
in your own voice takes about twenty minutes with a phone and is absolutely
worth it.

**See [RECORDING.md](RECORDING.md)** for the exact lines to read and the file
names to use. Drop the files into `public/audio/…` — no code changes needed.
Both `.mp3` and iPhone `.m4a` work.

## Put your kid in the rocket

Save a photo as `public/pilot.png` (or `.jpg`) — his face appears in the
rocket's porthole, always turned toward the camera. A square-ish, face-filling
photo works best.

## What's inside

| | |
|---|---|
| `src/data.ts` | Planet table (sizes, orbits, travel times) and all Hebrew strings |
| `src/scene.ts` | 3D scene: sun, planets, rings, stars, camera rig, "line them up" |
| `src/rocket.ts` | Rocket idle / countdown / curved transit / arrival orbit, particle trail |
| `src/audio.ts` | Recorded clips → Hebrew TTS fallback → silence; synthesized SFX |
| `src/ui.ts` | RTL planet strip, info card, line-up + mute buttons |
| `src/main.ts` | Game state, tap/drag/pinch input, main loop |

## Interactions

- **Tap a planet** (or its icon in the bottom strip) — countdown, launch, travel, arrival card + narration. Tapping the planet you're already at replays the narration instantly.
- **Tap somewhere else mid-flight** — the rocket redirects immediately. No waiting, ever.
- **כולם בשורה!** — lines all eight planets up in order; tap again to release.
- **Drag** rotates the view (clamped, eases back home). **Pinch / scroll** zooms (clamped, eases back).
- **Speaker button** (top corner) mutes everything.

## Credits

- Planet textures: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0), based on NASA/JPL imagery.
- Font: [Rubik](https://fonts.google.com/specimen/Rubik) (OFL), self-hosted for offline use.
