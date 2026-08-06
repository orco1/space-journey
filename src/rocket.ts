import * as THREE from 'three';
import { loadPilotTexture } from './textures';

export type RocketState = 'idle' | 'prep' | 'transit' | 'orbit';

const IDLE_ORBIT_RADIUS = 4.9; // parked just outside the sun glow
const IDLE_ORBIT_SPEED = 0.22;

/**
 * The rocket: idles near the sun, launches along a curved arc, then settles
 * into a small orbit around the target planet (PRD §5).
 */
export class Rocket {
  readonly group = new THREE.Group();
  state: RocketState = 'idle';

  private idleAngle = 0;
  private orbitAngle = 0;

  // transit
  private start = new THREE.Vector3();
  private elapsed = 0;
  private duration = 1;
  private targetPos: (() => THREE.Vector3) | null = null;
  private targetRadius = 1;
  private onArrive: (() => void) | null = null;
  private onMidway: (() => void) | null = null;
  private midwayFired = false;

  private prevPos = new THREE.Vector3();
  private trail: Trail;
  private time = 0;
  private pathLine: THREE.Line;

  constructor(scene: THREE.Scene) {
    this.buildModel();
    scene.add(this.group);
    this.trail = new Trail(scene);
    this.group.position.set(IDLE_ORBIT_RADIUS, 0, 0);

    // The planned route, drawn while flying (the child sees the distance ahead)
    this.pathLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0xffd166,
        dashSize: 0.9,
        gapSize: 0.6,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.pathLine.frustumCulled = false;
    this.pathLine.visible = false;
    scene.add(this.pathLine);

    // עומר in the porthole, if a photo was added (see README)
    void loadPilotTexture().then((tex) => {
      if (!tex) return;
      const face = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      face.position.set(0, 0.2, 0);
      face.scale.setScalar(0.52);
      face.renderOrder = 2;
      this.group.add(face);
    });
  }

  private buildModel() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: 0xe23b3b, roughness: 0.6 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.85, 16), white);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 16), red);
    nose.position.y = 0.65;
    const window_ = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x7fd0ff, roughness: 0.2 }),
    );
    window_.position.set(0, 0.18, 0.2);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.18, 12), red);
    engine.position.y = -0.5;
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.5, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 }),
    );
    flame.name = 'flame';
    flame.rotation.x = Math.PI;
    flame.position.y = -0.85;
    flame.visible = false;

    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.3), red);
      const a = (i / 3) * Math.PI * 2;
      fin.position.set(Math.sin(a) * 0.24, -0.38, Math.cos(a) * 0.24);
      fin.rotation.y = a;
      this.group.add(fin);
    }
    this.group.add(body, nose, window_, engine, flame);
    // big enough to spot from the full-system view
    this.group.scale.setScalar(2.0);
  }

  private setFlame(on: boolean) {
    (this.group.getObjectByName('flame') as THREE.Mesh).visible = on;
  }

  /** Small pre-launch shake during the countdown. */
  prepare() {
    this.state = 'prep';
    this.setFlame(false);
  }

  launch(
    targetPos: () => THREE.Vector3,
    targetRadius: number,
    durationSec: number,
    onArrive: () => void,
    onMidway?: () => void,
  ) {
    this.start.copy(this.group.position);
    this.elapsed = 0;
    this.duration = durationSec;
    this.targetPos = targetPos;
    this.targetRadius = targetRadius;
    this.onArrive = onArrive;
    this.onMidway = onMidway ?? null;
    this.midwayFired = false;
    this.state = 'transit';
    this.setFlame(true);
  }

  /** Mid-flight redirect (§5.4): restart the arc from wherever we are now. */
  redirect(targetPos: () => THREE.Vector3, targetRadius: number, durationSec: number, onArrive: () => void, onMidway?: () => void) {
    this.launch(targetPos, targetRadius, durationSec, onArrive, onMidway);
  }

  update(dt: number) {
    this.time += dt;
    this.prevPos.copy(this.group.position);

    switch (this.state) {
      case 'idle':
        this.idleAngle += dt * IDLE_ORBIT_SPEED;
        this.group.position.set(
          Math.cos(this.idleAngle) * IDLE_ORBIT_RADIUS,
          Math.sin(this.time * 1.4) * 0.25, // gentle bob — reads as alive (§5.1)
          Math.sin(this.idleAngle) * IDLE_ORBIT_RADIUS,
        );
        this.faceVelocity(dt);
        break;

      case 'prep': {
        const shake = 0.035;
        this.group.position.x += (Math.random() - 0.5) * shake;
        this.group.position.z += (Math.random() - 0.5) * shake;
        break;
      }

      case 'transit': {
        this.elapsed += dt;
        const t = Math.min(this.elapsed / this.duration, 1);
        const e = easeInOutCubic(t);
        const end = this.targetPos!();
        const cp = this.controlPoint(this.start, end);
        this.updatePathLine(cp, end);

        const a = new THREE.Vector3().lerpVectors(this.start, cp, e);
        const b = new THREE.Vector3().lerpVectors(cp, end, e);
        this.group.position.lerpVectors(a, b, e);
        this.faceVelocity(dt);

        const speed = this.prevPos.distanceTo(this.group.position) / Math.max(dt, 1e-4);
        this.trail.emit(this.tailPosition(), Math.min(3, 1 + speed * 0.25));

        if (!this.midwayFired && t > 0.55) {
          this.midwayFired = true;
          this.onMidway?.();
        }
        if (t >= 1) {
          this.state = 'orbit';
          this.setFlame(false);
          this.pathLine.visible = false;
          this.orbitAngle = Math.atan2(
            this.group.position.z - end.z,
            this.group.position.x - end.x,
          );
          this.onArrive?.();
        }
        break;
      }

      case 'orbit': {
        const center = this.targetPos!();
        this.orbitAngle += dt * (1.6 / Math.sqrt(this.targetRadius));
        const r = this.targetRadius * 1.9 + 0.35;
        this.group.position.set(
          center.x + Math.cos(this.orbitAngle) * r,
          Math.sin(this.time * 1.2) * 0.12,
          center.z + Math.sin(this.orbitAngle) * r,
        );
        this.faceVelocity(dt);
        break;
      }
    }

    this.trail.update(dt);
  }

  /** Send the rocket home to its idle orbit near the sun (not currently user-facing). */
  goHome() {
    this.state = 'idle';
    this.setFlame(false);
    this.pathLine.visible = false;
    this.idleAngle = Math.atan2(this.group.position.z, this.group.position.x);
  }

  private updatePathLine(cp: THREE.Vector3, end: THREE.Vector3) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const s = i / 40;
      const a = new THREE.Vector3().lerpVectors(this.start, cp, s);
      const b = new THREE.Vector3().lerpVectors(cp, end, s);
      pts.push(a.lerp(b, s));
    }
    this.pathLine.geometry.setFromPoints(pts);
    this.pathLine.computeLineDistances();
    this.pathLine.visible = true;
  }

  private controlPoint(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3 {
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dist = start.distanceTo(end);
    // lift above the plane so the arc reads as a curve
    mid.y += Math.min(dist * 0.18, 4.5);
    // bulge outward so the path never dives through the sun
    const flat = new THREE.Vector3(mid.x, 0, mid.z);
    const flatLen = flat.length();
    const minR = 7.5;
    if (flatLen < minR) {
      if (flatLen < 0.1) {
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        flat.set(-dir.z, 0, dir.x);
      }
      flat.normalize().multiplyScalar(minR);
      mid.x = flat.x;
      mid.z = flat.z;
    }
    return mid;
  }

  private tailPosition(): THREE.Vector3 {
    const back = new THREE.Vector3(0, -0.9, 0).applyQuaternion(this.group.quaternion);
    return this.group.position.clone().add(back);
  }

  private faceVelocity(dt: number) {
    const vel = new THREE.Vector3().subVectors(this.group.position, this.prevPos);
    if (vel.lengthSq() < 1e-8 || dt <= 0) return;
    vel.normalize();
    // rocket's nose is +Y
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vel);
    this.group.quaternion.slerp(q, Math.min(1, dt * 8));
  }
}

/** Additive point-sprite trail; particles fade to black (= invisible). */
class Trail {
  private static readonly N = 240;
  private positions = new Float32Array(Trail.N * 3);
  private colors = new Float32Array(Trail.N * 3);
  private life = new Float32Array(Trail.N);
  private cursor = 0;
  private points: THREE.Points;
  private geo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.geo = new THREE.BufferGeometry();
    this.positions.fill(9999);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(
      this.geo,
      new THREE.PointsMaterial({
        size: 0.34,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(pos: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % Trail.N;
      this.positions.set(
        [
          pos.x + (Math.random() - 0.5) * 0.15,
          pos.y + (Math.random() - 0.5) * 0.15,
          pos.z + (Math.random() - 0.5) * 0.15,
        ],
        idx * 3,
      );
      this.life[idx] = 1;
    }
  }

  update(dt: number) {
    for (let i = 0; i < Trail.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt * 1.1);
      const l = this.life[i];
      // orange → deep red → black
      this.colors.set([l * 1.0, l * l * 0.55, l * l * 0.12], i * 3);
      if (l === 0) this.positions.set([9999, 9999, 9999], i * 3);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
