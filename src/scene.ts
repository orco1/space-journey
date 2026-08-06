import * as THREE from 'three';
import { PLANETS, SUN, type BodyDef } from './data';
import { loadBodyTexture, loadRingTexture, loadStarsTexture, makeGlowTexture } from './textures';

export interface PlanetNode {
  def: BodyDef;
  /** Free-running orbit angle (radians), always advancing. */
  angle: number;
  root: THREE.Group; // positioned on the orbit
  tiltGroup: THREE.Group;
  mesh: THREE.Mesh;
  hit: THREE.Mesh;
  pulse: number; // tap feedback animation, 0 = none
}

const LINEUP_ANGLE = Math.PI; // world -X → screen-left at default camera, matches RTL strip
const DEFAULT_TILT = THREE.MathUtils.degToRad(30);
const MIN_TILT = THREE.MathUtils.degToRad(15);
const MAX_TILT = THREE.MathUtils.degToRad(60);
const RETURN_DELAY = 4; // seconds of no touch before the camera eases home

function shortestDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export class SpaceScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly planets: PlanetNode[] = [];
  readonly sunMesh: THREE.Mesh;

  /** 0 = free orbits, 1 = all planets on one line (§4.5). */
  private lineupBlend = 0;
  lineupActive = false;

  // camera rig
  private azimuth = 0;
  private tilt = DEFAULT_TILT;
  private baseDistance = 60;
  private zoom = 1; // eased multiplier, <1 when a card is open
  private zoomTarget = 1;
  /** User pinch/wheel zoom. 1 = whole system in frame; smaller = closer. */
  private userZoom = 1;
  private lookAt = new THREE.Vector3();
  private lookAtTarget = new THREE.Vector3();
  private lastInteraction = -RETURN_DELAY;
  private elapsed = 0;

  private raycaster = new THREE.Raycaster();
  private hitMeshes: THREE.Mesh[] = [];
  private sunHit: THREE.Mesh;

  private beacon: THREE.Mesh;
  private beaconId: string | null = null;
  private burst: Burst;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

    this.scene.add(new THREE.AmbientLight(0x8890b0, 0.55));
    const sunLight = new THREE.PointLight(0xfff2d8, 2.6, 0, 0);
    this.scene.add(sunLight);

    // --- sun ---
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SUN.radius, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcc55 }),
    );
    this.scene.add(this.sunMesh);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    glow.scale.setScalar(SUN.radius * 5.2);
    this.scene.add(glow);

    this.sunHit = this.makeHitSphere(SUN.radius * 1.5);
    this.scene.add(this.sunHit);

    // --- orbit rings (teaching aid, §4.1) ---
    for (const def of PLANETS) {
      const ring = new THREE.Mesh(
        makeFlatRing(def.orbitRadius - 0.045, def.orbitRadius + 0.045),
        new THREE.MeshBasicMaterial({
          color: 0x7f8fc5,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      this.scene.add(ring);
    }

    // --- planets ---
    for (const def of PLANETS) {
      const node = this.buildPlanet(def);
      this.planets.push(node);
      this.scene.add(node.root);
    }

    // pulsing ring marking where the rocket is headed
    this.beacon = new THREE.Mesh(
      makeFlatRing(1, 1.18),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.beacon.visible = false;
    this.scene.add(this.beacon);

    this.burst = new Burst(this.scene);

    this.buildStars();
    void this.applyTextures();

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  private makeHitSphere(radius: number): THREE.Mesh {
    // Generous invisible tap target (§2). material.visible skips rendering
    // but keeps the mesh raycastable.
    const mat = new THREE.MeshBasicMaterial();
    mat.visible = false;
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), mat);
  }

  private buildPlanet(def: BodyDef): PlanetNode {
    const root = new THREE.Group();
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = THREE.MathUtils.degToRad(def.axialTiltDeg);
    root.add(tiltGroup);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius, 40, 28),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 1, metalness: 0 }),
    );
    tiltGroup.add(mesh);

    if (def.hasSaturnRings) {
      const rings = new THREE.Mesh(
        makeFlatRing(def.radius * 1.35, def.radius * 2.35),
        new THREE.MeshBasicMaterial({
          color: 0xf0e3c0,
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      rings.name = 'saturnRings';
      tiltGroup.add(rings);
    }

    if (def.hasFaintRing) {
      const rings = new THREE.Mesh(
        makeFlatRing(def.radius * 1.5, def.radius * 1.75),
        new THREE.MeshBasicMaterial({
          color: 0xbfeef2,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      tiltGroup.add(rings);
    }

    const hit = this.makeHitSphere(Math.max(def.radius * 2.1, 1.5));
    hit.userData.planetId = def.id;
    root.add(hit);
    this.hitMeshes.push(hit);

    const angle = Math.random() * Math.PI * 2;
    return { def, angle, root, tiltGroup, mesh, hit, pulse: 0 };
  }

  private buildStars() {
    // Milky-way sky sphere (falls back to plain points if the texture is missing)
    void loadStarsTexture().then((tex) => {
      if (!tex) return;
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(400, 48, 32),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }),
      );
      sky.material.color.setScalar(0.55); // dim so planets stay the heroes
      this.scene.add(sky);
    });

    const n = 2500;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(320 + Math.random() * 60);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.8 }),
    );
    this.scene.add(stars);
  }

  private async applyTextures() {
    const sunTex = await loadBodyTexture({ ...SUN, id: 'sun' });
    (this.sunMesh.material as THREE.MeshBasicMaterial).map = sunTex;
    (this.sunMesh.material as THREE.MeshBasicMaterial).color.setScalar(1);
    (this.sunMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;

    const ringTexPromise = loadRingTexture();
    await Promise.all(
      this.planets.map(async (node) => {
        const tex = await loadBodyTexture(node.def);
        const mat = node.mesh.material as THREE.MeshStandardMaterial;
        mat.map = tex;
        mat.color.setScalar(1);
        mat.needsUpdate = true;
        if (node.def.hasSaturnRings) {
          const rings = node.tiltGroup.getObjectByName('saturnRings') as THREE.Mesh;
          const rmat = rings.material as THREE.MeshBasicMaterial;
          rmat.map = await ringTexPromise;
          rmat.color.setScalar(1);
          rmat.needsUpdate = true;
        }
      }),
    );
  }

  // ---------------- interaction ----------------

  /** Register an extra tappable mesh (userData.planetId names the pick result). */
  addHitMesh(mesh: THREE.Mesh) {
    this.hitMeshes.push(mesh);
  }

  /** Returns 'sun', 'rocket', a planet id, or null for the tap at client coords. */
  pick(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([...this.hitMeshes, this.sunHit], false);
    if (hits.length === 0) return null;
    return (hits[0].object.userData.planetId as string) ?? 'sun';
  }

  notifyInteraction() {
    this.lastInteraction = this.elapsed;
  }

  dragBy(dxPx: number, dyPx: number) {
    this.azimuth -= dxPx * 0.004;
    this.tilt = THREE.MathUtils.clamp(this.tilt + dyPx * 0.004, MIN_TILT, MAX_TILT);
    this.notifyInteraction();
  }

  /**
   * Pinch/wheel zoom, clamped so the child can never get lost (§4.1).
   * When client coords are given, zooming in pulls the view toward the point
   * under the pointer, so you can dive onto any planet — not just the sun.
   * Zooming out proportionally re-centres, so full zoom-out is always the
   * default framing again.
   */
  zoomBy(factor: number, clientX?: number, clientY?: number) {
    const oldZoom = this.userZoom;
    // 0.035 ≈ two scene-units from the look point — a full-screen planet close-up
    this.userZoom = THREE.MathUtils.clamp(oldZoom / factor, 0.035, 1.25);
    const ratio = this.userZoom / oldZoom;
    if (ratio < 1 && clientX !== undefined && clientY !== undefined) {
      const p = this.groundPoint(clientX, clientY);
      if (p) {
        // keep the point under the pointer (roughly) fixed while diving in
        this.lookAtTarget.lerpVectors(p, this.lookAtTarget, ratio);
        this.clampLookAt();
      }
    } else if (ratio > 1) {
      this.lookAtTarget.multiplyScalar(1 / ratio);
    }
    this.notifyInteraction();
  }

  /** Two-finger pan: keep the world glued to the fingers' midpoint. */
  panBy(fromX: number, fromY: number, toX: number, toY: number) {
    const a = this.groundPoint(fromX, fromY);
    const b = this.groundPoint(toX, toY);
    if (a && b) {
      this.lookAtTarget.add(a.sub(b));
      this.clampLookAt();
    }
    this.notifyInteraction();
  }

  /** World point on the orbital plane under the given screen position. */
  private groundPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out);
    return hit ? out : null;
  }

  private clampLookAt() {
    this.lookAtTarget.y = 0;
    const len = this.lookAtTarget.length();
    if (len > 38) this.lookAtTarget.multiplyScalar(38 / len);
  }

  setLineup(active: boolean) {
    this.lineupActive = active;
  }

  /** Slight zoom toward a planet while its card is shown — system stays in frame. */
  focusPlanet(id: string | null) {
    // If the user has zoomed in themselves, they're steering — don't fight them.
    if (this.userZoom < 0.85) {
      this.zoomTarget = 1;
      return;
    }
    if (id === null || id === 'sun') {
      this.zoomTarget = 1;
      this.lookAtTarget.set(0, 0, 0);
      return;
    }
    const node = this.planets.find((p) => p.def.id === id);
    if (!node) return;
    this.zoomTarget = 0.92;
    this.lookAtTarget.copy(node.root.position).multiplyScalar(0.22);
  }

  planetPosition(id: string): THREE.Vector3 {
    const node = this.planets.find((p) => p.def.id === id)!;
    return node.root.position.clone();
  }

  pulsePlanet(id: string) {
    const node = this.planets.find((p) => p.def.id === id);
    if (node) node.pulse = 1;
  }

  /** Mark (or clear) the travel destination with a pulsing ring. */
  setBeacon(id: string | null) {
    this.beaconId = id;
    this.beacon.visible = id !== null;
  }

  /** Star-burst celebration around a planet on arrival. */
  celebrate(id: string) {
    const node = this.planets.find((p) => p.def.id === id);
    if (node) this.burst.fire(node.root.position, node.def.radius);
  }

  // ---------------- per-frame ----------------

  update(dt: number) {
    this.elapsed += dt;

    // lineup blend eases both ways
    const lineupSpeed = dt / 1.6;
    this.lineupBlend = THREE.MathUtils.clamp(
      this.lineupBlend + (this.lineupActive ? lineupSpeed : -lineupSpeed),
      0,
      1,
    );
    const eased = this.lineupBlend * this.lineupBlend * (3 - 2 * this.lineupBlend);

    for (const p of this.planets) {
      if (this.lineupBlend === 0) {
        p.angle += ((Math.PI * 2) / p.def.orbitPeriodSec) * dt;
      }
      const shown = p.angle + shortestDelta(p.angle, LINEUP_ANGLE) * eased;
      p.root.position.set(
        Math.cos(shown) * p.def.orbitRadius,
        0,
        Math.sin(shown) * p.def.orbitRadius,
      );
      p.mesh.rotation.y += ((Math.PI * 2) / p.def.spinPeriodSec) * dt;

      if (p.pulse > 0) {
        p.pulse = Math.max(0, p.pulse - dt * 2.5);
        const s = 1 + Math.sin(p.pulse * Math.PI) * 0.18;
        p.mesh.scale.setScalar(s);
      }
    }

    this.sunMesh.rotation.y += dt * 0.02;

    if (this.beaconId) {
      const node = this.planets.find((p) => p.def.id === this.beaconId);
      if (node) {
        this.beacon.position.copy(node.root.position);
        const s = node.def.radius * (1.6 + 0.25 * Math.sin(this.elapsed * 5));
        this.beacon.scale.setScalar(s);
        (this.beacon.material as THREE.MeshBasicMaterial).opacity =
          0.6 + 0.3 * Math.sin(this.elapsed * 5);
      }
    }
    this.burst.update(dt);

    // camera: ease home after a few idle seconds (§4.1)
    if (this.elapsed - this.lastInteraction > RETURN_DELAY) {
      const k = 1 - Math.exp(-dt * 0.9);
      this.azimuth += shortestDelta(this.azimuth, 0) * k;
      this.tilt += (DEFAULT_TILT - this.tilt) * k;
    }
    // zoom + pan drift back to the full view a little later, and more gently
    if (this.elapsed - this.lastInteraction > RETURN_DELAY * 2.5) {
      const rk = 1 - Math.exp(-dt * 0.35);
      this.userZoom += (1 - this.userZoom) * rk;
      if (this.userZoom > 0.85) this.lookAtTarget.multiplyScalar(1 - rk);
    }
    const zk = 1 - Math.exp(-dt * 3);
    this.zoom += (this.zoomTarget - this.zoom) * zk;
    this.lookAt.lerp(this.lookAtTarget, zk);

    const d = this.baseDistance * this.zoom * this.userZoom;
    this.camera.position.set(
      this.lookAt.x + d * Math.cos(this.tilt) * Math.sin(this.azimuth),
      this.lookAt.y + d * Math.sin(this.tilt),
      this.lookAt.z + d * Math.cos(this.tilt) * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.lookAt);

    this.renderer.render(this.scene, this.camera);
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Fit the whole system (Neptune at 37 + margin) in frame at any aspect.
    const extent = 41;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const tanV = Math.tan(vFov / 2);
    const tanH = tanV * this.camera.aspect;
    const byWidth = extent / tanH;
    const byHeight = (extent * Math.max(Math.sin(MAX_TILT), 0.55)) / tanV;
    this.baseDistance = Math.max(byWidth, byHeight) * 1.12;
  }
}

/** One-shot particle star-burst, reused for every arrival celebration. */
class Burst {
  private static readonly N = 90;
  private positions = new Float32Array(Burst.N * 3);
  private velocities: THREE.Vector3[] = [];
  private colors = new Float32Array(Burst.N * 3);
  private life = 0;
  private geo = new THREE.BufferGeometry();

  constructor(scene: THREE.Scene) {
    this.positions.fill(9999);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const points = new THREE.Points(
      this.geo,
      new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    points.frustumCulled = false;
    scene.add(points);
    for (let i = 0; i < Burst.N; i++) this.velocities.push(new THREE.Vector3());
  }

  fire(center: THREE.Vector3, radius: number) {
    this.life = 1;
    for (let i = 0; i < Burst.N; i++) {
      const dir = new THREE.Vector3().randomDirection();
      this.positions.set(
        [center.x + dir.x * radius, center.y + dir.y * radius, center.z + dir.z * radius],
        i * 3,
      );
      this.velocities[i].copy(dir).multiplyScalar(2.5 + Math.random() * 4);
    }
  }

  update(dt: number) {
    if (this.life <= 0) return;
    this.life = Math.max(0, this.life - dt * 0.8);
    const l = this.life;
    for (let i = 0; i < Burst.N; i++) {
      this.positions[i * 3] += this.velocities[i].x * dt;
      this.positions[i * 3 + 1] += this.velocities[i].y * dt;
      this.positions[i * 3 + 2] += this.velocities[i].z * dt;
      this.velocities[i].multiplyScalar(1 - dt * 1.5);
      // gold → white sparkle fading out
      const warm = i % 3 === 0;
      this.colors.set(warm ? [l, l * 0.8, l * 0.3] : [l, l, l * 0.9], i * 3);
    }
    if (this.life === 0) this.positions.fill(9999);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

/** Flat ring in the XZ plane with radial UVs (u = inner→outer), for ring textures. */
function makeFlatRing(inner: number, outer: number): THREE.RingGeometry {
  const geo = new THREE.RingGeometry(inner, outer, 128, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos as THREE.BufferAttribute, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  geo.rotateX(-Math.PI / 2);
  return geo;
}
