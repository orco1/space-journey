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
 * The pilot's photo (public/pilot.png or .jpg), masked to a circle with a
 * white porthole rim. Returns null when no photo has been added.
 */
export async function loadPilotTexture(): Promise<THREE.Texture | null> {
  for (const name of ['pilot.png', 'pilot.jpg', 'pilot.jpeg']) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}${name}`);
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
      // cover-fit the photo into the circle
      const scale = Math.max(S / bmp.width, S / bmp.height);
      ctx.drawImage(
        bmp,
        (S - bmp.width * scale) / 2,
        (S - bmp.height * scale) / 2,
        bmp.width * scale,
        bmp.height * scale,
      );
      ctx.lineWidth = 18;
      ctx.strokeStyle = '#f2f2f2';
      ctx.stroke();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    } catch {
      /* missing — try next */
    }
  }
  return null;
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
