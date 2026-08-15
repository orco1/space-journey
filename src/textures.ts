import * as THREE from 'three';
import type { BodyDef } from './data';

const loader = new THREE.TextureLoader();

function tryLoad(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        resolve(tex);
      },
      undefined,
      () => resolve(null),
    );
  });
}

// ---------- procedural fallbacks (used only if a texture file is missing) ----------

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 256): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const r = 1 + Math.random() * 5;
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${alpha * Math.random()})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function fallbackBody(def: Pick<BodyDef, 'color' | 'color2' | 'id'>): THREE.Texture {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = def.color;
    ctx.fillRect(0, 0, w, h);
    // soft horizontal bands
    for (let y = 0; y < h; y += 8 + Math.random() * 22) {
      const bh = 6 + Math.random() * 18;
      ctx.fillStyle = def.color2;
      ctx.globalAlpha = 0.15 + Math.random() * 0.3;
      ctx.fillRect(0, y, w, bh);
    }
    ctx.globalAlpha = 1;
    if (def.id === 'mercury' || def.id === 'mars') speckle(ctx, w, h, 250, 0.25);
    else speckle(ctx, w, h, 80, 0.08);
    if (def.id === 'jupiter') {
      ctx.fillStyle = '#b13a2a';
      ctx.beginPath();
      ctx.ellipse(w * 0.7, h * 0.62, 34, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function fallbackSun(): THREE.Texture {
  return canvasTexture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffdf6b');
    g.addColorStop(0.5, '#ffc93a');
    g.addColorStop(1, '#ffdf6b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 200, 0.1);
  });
}

function fallbackRing(): THREE.Texture {
  return canvasTexture(
    (ctx, w) => {
      for (let x = 0; x < w; x++) {
        const t = x / w;
        const a = 0.25 + 0.6 * Math.abs(Math.sin(t * 40)) * (0.4 + 0.6 * Math.sin(t * Math.PI));
        ctx.fillStyle = `rgba(226, 210, 172, ${a.toFixed(3)})`;
        ctx.fillRect(x, 0, 1, 32);
      }
    },
    1024,
    32,
  );
}

// ---------- public API ----------

export async function loadBodyTexture(def: Pick<BodyDef, 'color' | 'color2' | 'id' | 'texture'>): Promise<THREE.Texture> {
  const tex = await tryLoad(`${import.meta.env.BASE_URL}textures/${def.texture}`);
  if (tex) return tex;
  return def.id === 'sun' ? fallbackSun() : fallbackBody(def);
}

export async function loadRingTexture(): Promise<THREE.Texture> {
  const tex = await tryLoad(`${import.meta.env.BASE_URL}textures/saturn_ring_alpha.png`);
  return tex ?? fallbackRing();
}

export async function loadStarsTexture(): Promise<THREE.Texture | null> {
  return tryLoad(`${import.meta.env.BASE_URL}textures/2k_stars_milky_way.jpg`);
}

/**
 * Pilot photos, masked to circles with a white porthole rim.
 * Sources: public/pilot.png|jpg (legacy single photo) plus
 * public/pilots/1.*, 2.*, 3.* … numbered without gaps.
 * Tapping the rocket cycles between them.
 */
export async function loadPilotTextures(): Promise<THREE.Texture[]> {
  const out: THREE.Texture[] = [];
  const legacy = await tryLoadPhoto('pilot');
  if (legacy) out.push(legacy);
  for (let i = 1; i <= 12; i++) {
    const tex = await tryLoadPhoto(`pilots/${i}`);
    if (!tex) break; // numbering stops at the first gap
    out.push(tex);
  }
  return out;
}

async function tryLoadPhoto(base: string): Promise<THREE.Texture | null> {
  for (const ext of ['png', 'jpg', 'jpeg']) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}${base}.${ext}`);
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.startsWith('image/')) continue;
      const bmp = await createImageBitmap(await res.blob());
      const S = 256;
      const c = document.createElement('canvas');
      c.width = S;
      c.height = S;
      const ctx = c.getContext('2d')!;
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2);
      ctx.clip();
      // cover-fit; portrait photos anchor near the top, where the face usually is
      const scale = Math.max(S / bmp.width, S / bmp.height);
      const dy =
        bmp.height > bmp.width ? -(bmp.height * scale - S) * 0.15 : (S - bmp.height * scale) / 2;
      ctx.drawImage(bmp, (S - bmp.width * scale) / 2, dy, bmp.width * scale, bmp.height * scale);
      ctx.lineWidth = 18;
      ctx.strokeStyle = '#f2f2f2';
      ctx.stroke();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    } catch {
      /* missing — try next extension */
    }
  }
  return null;
}

// ---------- strip thumbnails: the real texture, wrapped onto a little globe ----------

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Equirectangular pixels of a texture file, small enough to sample cheaply. */
function samplePixels(img: HTMLImageElement, w = 512, h = 256): ImageData {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Renders `def.texture` as a lit sphere — the same map the 3D planet wears, so
 * the strip icon and the planet the child flies to are recognisably the same
 * thing. Returns a data URL, or null if the texture file is missing.
 */
export async function makePlanetThumb(
  def: Pick<BodyDef, 'id' | 'texture' | 'hasSaturnRings' | 'hasFaintRing'>,
  size = 128,
): Promise<string | null> {
  const img = await loadImage(`${import.meta.env.BASE_URL}textures/${def.texture}`);
  if (!img) return null;

  const src = samplePixels(img);
  const SS = 2; // supersample, then downscale for a clean anti-aliased limb
  const S = size * SS;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;

  // Rings sit in a wider box, so the globe shrinks to leave room for them.
  const ringed = !!(def.hasSaturnRings || def.hasFaintRing);
  const R = (S / 2) * (ringed ? 0.5 : 0.62);
  const cx = S / 2;
  const cy = S / 2;
  const ringAngle = def.hasSaturnRings ? -0.32 : 1.36; // Uranus rides nearly upright

  if (ringed) drawRing(ctx, cx, cy, R, ringAngle, def.hasSaturnRings ? 'saturn' : 'faint', 'back');

  // Sphere: for every pixel of the disc, project back to a surface normal,
  // read the equirectangular map there, and shade it like the 3D planet is lit.
  const out = ctx.createImageData(Math.ceil(R * 2) + 2, Math.ceil(R * 2) + 2);
  const ox = Math.floor(cx - R) - 1;
  const oy = Math.floor(cy - R) - 1;
  const lx = -0.45;
  const ly = -0.42;
  const lz = 0.79; // key light from the upper-left, toward the viewer
  for (let py = 0; py < out.height; py++) {
    for (let px = 0; px < out.width; px++) {
      const nx = (px + ox + 0.5 - cx) / R;
      const ny = (py + oy + 0.5 - cy) / R;
      const r2 = nx * nx + ny * ny;
      const di = (py * out.width + px) * 4;
      if (r2 >= 1) continue;
      const nz = Math.sqrt(1 - r2);

      // north pole up: v runs 0..1 from the top of the map
      const u = 0.5 + Math.atan2(nx, nz) / (Math.PI * 2);
      const v = 0.5 + Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
      const sx = Math.min(src.width - 1, Math.max(0, Math.round(u * src.width)));
      const sy = Math.min(src.height - 1, Math.max(0, Math.round(v * src.height)));
      const si = (sy * src.width + sx) * 4;

      const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
      const shade = 0.34 + 0.95 * diffuse; // ambient floor keeps the dark side readable
      out.data[di] = Math.min(255, src.data[si] * shade);
      out.data[di + 1] = Math.min(255, src.data[si + 1] * shade);
      out.data[di + 2] = Math.min(255, src.data[si + 2] * shade);
      // feather the last pixel of the limb so the downscale has something to blend
      out.data[di + 3] = Math.min(1, (1 - Math.sqrt(r2)) * R) * 255;
    }
  }
  ctx.putImageData(out, ox, oy);

  if (ringed) drawRing(ctx, cx, cy, R, ringAngle, def.hasSaturnRings ? 'saturn' : 'faint', 'front');

  const final = document.createElement('canvas');
  final.width = size;
  final.height = size;
  const fctx = final.getContext('2d')!;
  fctx.drawImage(c, 0, 0, size, size);
  return final.toDataURL('image/png');
}

/**
 * Half of a ring ellipse: the `back` half is drawn before the globe (so the
 * globe hides it), the `front` half after (so it crosses in front).
 */
function drawRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  angle: number,
  kind: 'saturn' | 'faint',
  half: 'back' | 'front',
) {
  const rx = R * (kind === 'saturn' ? 2.05 : 1.7);
  const ry = rx * 0.3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  // clip to the half of the ring plane that is on the viewer's side (front) or not
  ctx.rect(-rx * 1.2, half === 'front' ? 0 : -ry * 1.4, rx * 2.4, ry * 1.4);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  if (kind === 'saturn') {
    ctx.strokeStyle = 'rgba(232, 216, 176, 0.95)';
    ctx.lineWidth = R * 0.42;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 104, 74, 0.55)'; // Cassini-ish gap
    ctx.lineWidth = R * 0.07;
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(191, 238, 242, 0.7)';
    ctx.lineWidth = R * 0.16;
    ctx.stroke();
  }
  ctx.restore();
}

/** Radial-gradient sprite texture for the sun glow. */
export function makeGlowTexture(): THREE.Texture {
  return canvasTexture(
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255, 236, 170, 0.85)');
      g.addColorStop(0.25, 'rgba(255, 200, 90, 0.35)');
      g.addColorStop(0.6, 'rgba(255, 160, 40, 0.1)');
      g.addColorStop(1, 'rgba(255, 140, 20, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    256,
    256,
  );
}
