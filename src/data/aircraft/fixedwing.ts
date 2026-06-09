import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SimulationSource } from '../../lib/simulation-source';
import type { AircraftRenderer } from './types';

// Fixed-wing renderer for the rumoca FixedWing example
// (examples/interactive/fixedwing/fixedwing_scene.js). Loads the rigged
// airplane.glb and drives its control surfaces from the model outputs.
//
// Reads from the SimulationSource (FixedWing model variables):
//   position[1..3]  — world position (FLU, Z up)
//   quat[1..4]      — body→world quaternion (w,x,y,z, scalar-first)
//   ail_rad/elev_rad/rud_rad — surface deflections [rad]
//   thr_out         — throttle fraction [0..1]
//
// The GLB is authored nose +Z, up +Y, LEFT wing +X. The world frame is FLU
// (fwd,left,up) Z-up; mapping A' = {fwd,left,up} -> three {left,up,fwd} gives
// position [py,pz,px] and orientation M' = A'·R·A'⁻¹ (see fixedwing_scene.js).

const MODEL_SCALE = 0.16; // 1 GLB unit = 0.16 m (gear contact offsets assume this)
const VIS = 1.6;          // surface deflection exaggeration for visibility
const MAX_TRAIL = 1500;

// Pivot/mesh pairs and their local hinge axes (the *Pivot nodes are pre-rotated
// ~-90° about Y, so spanwise hinges are local Z, the vertical hinge is local Y,
// and the prop spin axis is local X).
const RIG: { pivot: string; mesh: string; ax: [number, number, number]; sign: number }[] = [
  { pivot: 'ElevatorPivot', mesh: 'Elevator', ax: [0, 0, 1], sign: 1 },
  // Each wing's trailing edge is two meshes (aileron + flap); drive them
  // together so the surface reads as one. Left/right opposite for roll.
  { pivot: 'LeftAileronPivot', mesh: 'LeftAileron', ax: [0, 0, 1], sign: 1 },
  { pivot: 'LeftFlapPivot', mesh: 'LeftFlap', ax: [0, 0, 1], sign: 1 },
  { pivot: 'RightAileronPivot', mesh: 'RightAileron', ax: [0, 0, 1], sign: -1 },
  { pivot: 'RightFlapPivot', mesh: 'RightFlap', ax: [0, 0, 1], sign: -1 },
  { pivot: 'RudderPivot', mesh: 'Rudder', ax: [0, 1, 0], sign: 1 },
  { pivot: 'PropPivot', mesh: 'Prop', ax: [1, 0, 0], sign: 1 },
];

interface Surface {
  node: THREE.Object3D;
  base: THREE.Quaternion;
  ax: THREE.Vector3;
  sign: number;
}

export function createFixedWing(scene: THREE.Scene): AircraftRenderer {
  const aircraft = new THREE.Group();
  aircraft.name = 'aircraft';
  scene.add(aircraft);

  // Ground shadow.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 24),
    new THREE.MeshBasicMaterial({ color: 0x2a1d0a, transparent: true, opacity: 0.32 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  scene.add(shadow);

  // Flight trail.
  const trailPos = new Float32Array(MAX_TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.7 }),
  );
  scene.add(trail);
  let trailCount = 0;

  const surfaces: Record<string, Surface> = {};
  let propSpin = 0;
  let loaded = false;

  // Async airplane.glb load — update() early-returns until ready.
  (async () => {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/models/airplane.glb');
    const model = gltf.scene;
    model.name = 'airplane_glb';

    // Scale only — do NOT recenter, so the GLB origin (~CG) stays at the group
    // origin and the wheels sit at the physics contact height.
    model.scale.setScalar(MODEL_SCALE);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    aircraft.add(model);

    // Re-parent each surface mesh under its hinge pivot (preserving world
    // transform), so rotating the pivot deflects the surface about its hinge.
    const byName: Record<string, THREE.Object3D> = {};
    model.traverse((o) => { byName[o.name] = o; });
    for (const r of RIG) {
      const pv = byName[r.pivot];
      const ms = byName[r.mesh];
      if (!pv || !ms) {
        console.warn('[fixedwing] missing rig node', r.pivot, r.mesh);
        continue;
      }
      pv.attach(ms); // re-parent, preserving world transform
      surfaces[r.pivot] = {
        node: pv,
        base: pv.quaternion.clone(),
        ax: new THREE.Vector3(r.ax[0], r.ax[1], r.ax[2]),
        sign: r.sign,
      };
    }

    loaded = true;
  })().catch((e) => {
    console.error('[fixedwing] failed to load airplane.glb:', e);
  });

  const q = new THREE.Quaternion();
  const setSurf = (name: string, ang: number) => {
    const sf = surfaces[name];
    if (!sf) return;
    q.setFromAxisAngle(sf.ax, sf.sign * ang);
    sf.node.quaternion.copy(sf.base).multiply(q);
  };

  return {
    group: aircraft,
    update(source: SimulationSource): void {
      if (!loaded) return;

      const px = source.get('position[1]') ?? 0;
      const py = source.get('position[2]') ?? 0;
      const pz = source.get('position[3]') ?? 0;
      const q0 = source.get('quat[1]') ?? 1;
      const q1 = source.get('quat[2]') ?? 0;
      const q2 = source.get('quat[3]') ?? 0;
      const q3 = source.get('quat[4]') ?? 0;

      // Body→world DCM (FLU), scalar-first quaternion.
      const R11 = 1 - 2 * (q2 * q2 + q3 * q3);
      const R12 = 2 * (q1 * q2 - q0 * q3);
      const R13 = 2 * (q1 * q3 + q0 * q2);
      const R21 = 2 * (q1 * q2 + q0 * q3);
      const R22 = 1 - 2 * (q1 * q1 + q3 * q3);
      const R23 = 2 * (q2 * q3 - q0 * q1);
      const R31 = 2 * (q1 * q3 - q0 * q2);
      const R32 = 2 * (q2 * q3 + q0 * q1);
      const R33 = 1 - 2 * (q1 * q1 + q2 * q2);

      // World (FLU) → three via A' = {fwd,left,up}->{left,up,fwd}: pos [py,pz,px].
      // Orientation M' = A'·R·A'⁻¹ (airplane mesh is left wing +X).
      const tx = py, ty = pz, tz = px;
      aircraft.matrixAutoUpdate = false;
      aircraft.matrix.set(
        R22, R23, R21, tx,
        R32, R33, R31, ty,
        R12, R13, R11, tz,
        0, 0, 0, 1,
      );
      aircraft.matrixWorldNeedsUpdate = true;

      // Control surfaces, applied about each pivot's local hinge axis.
      const ail = (source.get('ail_rad') ?? 0) * VIS;
      const elev = (source.get('elev_rad') ?? 0) * VIS;
      const rud = (source.get('rud_rad') ?? 0) * VIS;
      const thr = source.get('thr_out') ?? 0;
      if (Number.isFinite(ail)) {
        // Negated so the ailerons deflect in the correct direction; the flap
        // segment on each wing follows its aileron so the trailing edge is one.
        setSurf('LeftAileronPivot', -ail);
        setSurf('LeftFlapPivot', -ail);
        setSurf('RightAileronPivot', -ail);
        setSurf('RightFlapPivot', -ail);
      }
      if (Number.isFinite(elev)) setSurf('ElevatorPivot', elev);
      if (Number.isFinite(rud)) setSurf('RudderPivot', -rud); // negated: correct yaw direction
      propSpin += 0.6 + thr * 5.0;
      setSurf('PropPivot', propSpin);

      // Trail.
      const idx = trailCount % MAX_TRAIL;
      trailPos[idx * 3] = tx;
      trailPos[idx * 3 + 1] = ty;
      trailPos[idx * 3 + 2] = tz;
      trailCount++;
      trail.geometry.attributes.position.needsUpdate = true;
      trailGeo.setDrawRange(0, Math.min(trailCount, MAX_TRAIL));

      // Shadow.
      shadow.position.set(tx, 0.02, tz);
      const alt = Math.max(ty, 0.05);
      const sc = Math.max(0.35, 1.0 - alt * 0.02);
      shadow.scale.set(sc, sc, 1);
      (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.04, 0.32 - alt * 0.008);
    },
    reset(): void {
      trailCount = 0;
      trailGeo.setDrawRange(0, 0);
      propSpin = 0;
      aircraft.matrixAutoUpdate = true;
      aircraft.position.set(0, 0, 0);
      aircraft.quaternion.identity();
    },
    dispose(): void {
      scene.remove(aircraft);
      scene.remove(trail);
      scene.remove(shadow);
      trailGeo.dispose();
    },
  };
}
