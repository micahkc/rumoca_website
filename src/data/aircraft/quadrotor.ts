import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AircraftRenderer } from './types';
import type { SimulationSource } from '../../lib/simulation-source';

// Quadrotor renderer matching the rumoca QuadrotorAcro example
// (examples/interactive/quadrotor/quadrotor_scene.js). Loads drone.glb,
// pivots propellers, drives nav lights + arming beacon from motor speeds.
//
// Reads from the SimulationSource (QuadrotorAcro model variables):
//   position[1..3]  — world position (FLU, Z up)
//   quat[1..4]      — body→world quaternion (w,x,y,z, scalar-first)
//   omega_m[1..4]   — actual motor angular velocities [rad/s]
//
// Axis transform: Three.js (x,y,z) = (-py_model, pz_model, px_model).

const PROP_NAMES_BY_MOTOR = ['Object_34', 'Object_38', 'Object_36', 'Object_32'];
const PROP_SPIN_SIGNS = [-1, -1, -1, -1] as const;
const MOTOR_LIGHT_COLORS = [0x28ff45, 0xffffff, 0xffffff, 0xff1d10];

interface MarkerLight {
  marker: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
}

interface MarkerLightOptions {
  x: number;
  y: number;
  z: number;
  color: number;
  shape?: 'cylinder' | 'box' | 'sphere';
  radius?: number;
  height?: number;
  width?: number;
  depth?: number;
  intensity?: number;
  distance?: number;
  emissiveIntensity?: number;
}

function addMarkerLight(parent: THREE.Object3D, opts: MarkerLightOptions): MarkerLight {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color,
    emissive: opts.color,
    emissiveIntensity: opts.emissiveIntensity ?? 1.8,
    roughness: 0.35,
  });
  const geometry =
    opts.shape === 'cylinder'
      ? new THREE.CylinderGeometry(opts.radius ?? 0.018, opts.radius ?? 0.018, opts.height ?? 0.018, 16)
      : opts.shape === 'box'
        ? new THREE.BoxGeometry(opts.width ?? 0.04, opts.height ?? 0.014, opts.depth ?? 0.04)
        : new THREE.SphereGeometry(opts.radius ?? 0.018, 12, 8);
  const marker = new THREE.Mesh(geometry, mat);
  marker.position.set(opts.x, opts.y, opts.z);
  parent.add(marker);

  const light = new THREE.PointLight(opts.color, opts.intensity ?? 0.45, opts.distance ?? 1.4);
  light.position.copy(marker.position);
  parent.add(light);
  return { marker, mat, light };
}

export function createQuadrotor(scene: THREE.Scene): AircraftRenderer {
  const quad = new THREE.Group();
  quad.name = 'quadrotor';
  scene.add(quad);

  // Ground shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 20),
    new THREE.MeshBasicMaterial({ color: 0x3a2a10, transparent: true, opacity: 0.3 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  scene.add(shadow);

  // Async drone.glb load — onFrame early-returns until ready.
  const propGroups: { group: THREE.Group; spinSign: number }[] = [];
  let armingBeacon: MarkerLight | null = null;
  let loaded = false;

  (async () => {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/models/drone.glb');
    const model = gltf.scene;
    model.name = 'drone_glb';

    // Center + scale so the rotor span is ~0.9 m in Three units.
    const bounds = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);
    const span = Math.max(size.x, size.z, 1e-6);
    const sc = 0.9 / span;
    model.scale.setScalar(sc);
    model.position.set(-center.x * sc, -center.y * sc, -center.z * sc);
    quad.add(model);

    // Locate prop nodes inside the GLB by name. The drone GLB authored by
    // Cafitz3D uses Object_32, _34, _36, _38 for the four propellers.
    const propNodes = new Map<string, THREE.Object3D>();
    const motorLightPositions: THREE.Vector3[] = [];
    model.traverse((object) => {
      if (PROP_NAMES_BY_MOTOR.includes(object.name)) {
        propNodes.set(object.name, object);
      }
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    scene.updateMatrixWorld(true);
    for (const propName of PROP_NAMES_BY_MOTOR) {
      const prop = propNodes.get(propName);
      if (!prop || !prop.parent) continue;
      const propBounds = new THREE.Box3().setFromObject(prop);
      const propCenter = new THREE.Vector3();
      propBounds.getCenter(propCenter);
      motorLightPositions.push(quad.worldToLocal(propCenter.clone()));

      const pivot = new THREE.Group();
      pivot.name = `${prop.name}_pivot`;
      pivot.position.copy(prop.parent.worldToLocal(propCenter.clone()));
      prop.parent.add(pivot);
      pivot.attach(prop);

      propGroups.push({
        group: pivot,
        spinSign: PROP_SPIN_SIGNS[propGroups.length] ?? -1,
      });
    }
    if (propGroups.length === 0) {
      console.warn('drone.glb did not expose expected prop nodes; prop animation disabled');
    }

    // Navigation lights at each motor.
    motorLightPositions.forEach((pos, i) => {
      const angle = Math.atan2(pos.x, pos.z);
      const outboard = new THREE.Vector3(pos.x, 0, pos.z).normalize().multiplyScalar(0.045);
      const light = addMarkerLight(quad, {
        x: pos.x + outboard.x,
        y: pos.y - 0.045,
        z: pos.z + outboard.z,
        color: MOTOR_LIGHT_COLORS[i] ?? 0xffffff,
        shape: 'box',
        width: 0.034,
        height: 0.014,
        depth: 0.018,
        intensity: 0.12,
        distance: 0.38,
        emissiveIntensity: 1.9,
      });
      light.marker.rotation.y = angle;
    });

    // Top-mounted arming beacon.
    const modelWorldBounds = new THREE.Box3().setFromObject(model);
    const bodyTop = quad.worldToLocal(
      new THREE.Vector3(
        (modelWorldBounds.min.x + modelWorldBounds.max.x) * 0.5,
        modelWorldBounds.max.y,
        (modelWorldBounds.min.z + modelWorldBounds.max.z) * 0.5,
      ),
    );
    armingBeacon = addMarkerLight(quad, {
      x: 0,
      y: bodyTop.y + 0.018,
      z: 0,
      color: 0xff2a18,
      shape: 'cylinder',
      radius: 0.022,
      height: 0.018,
      intensity: 0,
      distance: 1.8,
      emissiveIntensity: 0.15,
    });

    loaded = true;
  })().catch((e) => {
    console.error('[quadrotor] failed to load drone.glb:', e);
  });

  return {
    group: quad,
    update(source: SimulationSource): void {
      if (!loaded) return;

      const px = source.get('position[1]') ?? 0;
      const py = source.get('position[2]') ?? 0;
      const pz = source.get('position[3]') ?? 0;
      const q0 = source.get('quat[1]') ?? 1;
      const q1 = source.get('quat[2]') ?? 0;
      const q2 = source.get('quat[3]') ?? 0;
      const q3 = source.get('quat[4]') ?? 0;

      // Model frame: Forward-Left-Up world. Three.js Y-up.
      // (x3, y3, z3) = (-py, pz, px).
      const tx = -py, ty = pz, tz = px;

      // Body-to-world DCM from quaternion (scalar-first).
      const R11 = 1 - 2 * (q2 * q2 + q3 * q3);
      const R12 = 2 * (q1 * q2 - q0 * q3);
      const R13 = 2 * (q1 * q3 + q0 * q2);
      const R21 = 2 * (q1 * q2 + q0 * q3);
      const R22 = 1 - 2 * (q1 * q1 + q3 * q3);
      const R23 = 2 * (q2 * q3 - q0 * q1);
      const R31 = 2 * (q1 * q3 - q0 * q2);
      const R32 = 2 * (q2 * q3 + q0 * q1);
      const R33 = 1 - 2 * (q1 * q1 + q2 * q2);

      // Three-frame matrix = A · R_model · A⁻¹, where A maps [x3,y3,z3]=[-y,z,x].
      quad.matrix.set(
        R22, -R23, -R21, tx,
        -R32,  R33,  R31, ty,
        -R12,  R13,  R11, tz,
          0,    0,    0,  1,
      );
      quad.matrixAutoUpdate = false;
      quad.matrixWorldNeedsUpdate = true;

      // Motor speeds drive prop spin and the arming-beacon visual.
      const omega1 = source.get('omega_m[1]') ?? 0;
      const omega2 = source.get('omega_m[2]') ?? 0;
      const omega3 = source.get('omega_m[3]') ?? 0;
      const omega4 = source.get('omega_m[4]') ?? 0;
      const omegas = [omega1, omega2, omega3, omega4];

      const motorsHot = omega1 + omega2 + omega3 + omega4 > 1.0;
      propGroups.forEach((p, i) => {
        if (!motorsHot) return;
        const speed = Math.min(Math.abs(omegas[i]) / 500, 2.0) * 0.8;
        p.group.rotation.y += p.spinSign * speed;
      });

      if (armingBeacon) {
        if (motorsHot) {
          armingBeacon.mat.color.setHex(0xff2a18);
          armingBeacon.mat.emissive.setHex(0xff2a18);
          armingBeacon.mat.emissiveIntensity = 2.4;
          armingBeacon.light.color.setHex(0xff2a18);
          armingBeacon.light.intensity = 0.75;
        } else {
          const breath = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
          armingBeacon.mat.color.setHex(0xffffff);
          armingBeacon.mat.emissive.setHex(0xffffff);
          armingBeacon.mat.emissiveIntensity = 0.35 + breath * 0.9;
          armingBeacon.light.color.setHex(0xffffff);
          armingBeacon.light.intensity = 0.05 + breath * 0.22;
        }
      }

      // Shadow
      shadow.position.set(tx, 0.003, tz);
      const alt = Math.max(ty, 0.01);
      const sc = Math.max(0.4, 1.2 - alt * 0.04);
      shadow.scale.set(sc, sc, 1);
      (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.03, 0.25 - alt * 0.015);
    },
    reset(): void {
      quad.matrixAutoUpdate = true;
      quad.position.set(0, 0, 0);
      quad.quaternion.identity();
    },
    dispose(): void {
      scene.remove(quad);
      scene.remove(shadow);
    },
  };
}
