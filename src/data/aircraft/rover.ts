import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AircraftRenderer } from './types';
import type { SimulationSource } from '../../lib/simulation-source';

// Rover renderer matching rumoca's examples/interactive/rover/rover_scene.js.
// Loads a Sketchfab/poly.pizza jeep GLB at runtime, recenters each wheel's
// geometry onto its hub, and animates rolling + front-wheel steering from the
// Rover.mo output signals.
//
// Reads from the SimulationSource (Rover model variables):
//   x, y               — planar world position [m]
//   theta              — heading [rad] (CCW around +Z)
//   wheel_rpm          — rear-wheel angular velocity [rad/s]
//   front_wheel_yaw    — front steering angle [rad]

// "Buggy" by Nick Slough (CC-BY 3.0), via poly.pizza (https://poly.pizza/m/eZ_13w7qZh7)
const JEEP_URL = 'https://static.poly.pizza/8036e526-b08a-4d8c-a4b3-0214097cbc18.glb';
const JEEP_SCALE = 0.30;
const WHEEL_NODES = {
  frontLeft: 83,
  frontRight: 82,
  rearLeft: 77,
  rearRight: 76,
} as const;

type WheelSlot = keyof typeof WHEEL_NODES;
type WheelMap = Record<WheelSlot, { pivot: THREE.Group; wheel: THREE.Object3D }>;

const MAX_TRAIL = 512;

export function createRover(scene: THREE.Scene): AircraftRenderer {
  const rover = new THREE.Group();
  rover.name = 'rover';
  scene.add(rover);

  // Ground shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  scene.add(shadow);

  // Trail
  const trailPos = new Float32Array(MAX_TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.5 }),
  );
  scene.add(trail);
  let trailCount = 0;

  let wheels: WheelMap | null = null;
  let rollPhase = 0;
  let lastWall: number | null = null;

  (async () => {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(JEEP_URL);
    const model = gltf.scene;

    // Recenter each wheel's geometry onto its hub and reparent into a pivot.
    // Done in the GLB's local space before scale/position are applied so
    // bbox math is in the same coordinates the vertices were authored in.
    const out = {} as WheelMap;
    for (const [slot, nodeIdx] of Object.entries(WHEEL_NODES) as [WheelSlot, number][]) {
      const node = (await gltf.parser.getDependency('node', nodeIdx)) as THREE.Object3D;
      const box = new THREE.Box3().setFromObject(node);
      const centroid = new THREE.Vector3();
      box.getCenter(centroid);

      node.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry) {
          mesh.geometry.translate(-centroid.x, -centroid.y, -centroid.z);
        }
      });

      const pivot = new THREE.Group();
      pivot.position.copy(centroid);
      node.parent?.remove(node);
      pivot.add(node);
      model.add(pivot);
      out[slot] = { pivot, wheel: node };
    }

    // The jeep's nose points at GLB -X; rotate 180° about Y so it points to
    // rover +X (forward). Then scale and lift so the lowest vertex sits at y=0.
    model.rotation.y = Math.PI;
    model.scale.setScalar(JEEP_SCALE);
    rover.add(model);
    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;

    wheels = out;
  })().catch((e) => {
    console.error('[rover] failed to load jeep GLB:', e);
  });

  return {
    group: rover,
    update(source: SimulationSource): void {
      if (!wheels) return;

      const xr = source.get('x') ?? 0;
      const yr = source.get('y') ?? 0;
      const theta = source.get('theta') ?? 0;
      const rpm = source.get('wheel_rpm') ?? 0;
      const steer = source.get('front_wheel_yaw') ?? 0;

      // Rover (x, y) → Three (x, z). theta CCW around +Z maps to -Y in Three.
      rover.position.x = xr;
      rover.position.z = yr;
      rover.rotation.y = -theta;
      shadow.position.set(xr, 0.001, yr);

      // Wall-time rolling integration so wheel spin is smooth regardless of
      // the simulation's realtime ratio.
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dtWall = lastWall == null ? 0 : Math.min(0.1, (nowMs - lastWall) / 1000);
      lastWall = nowMs;
      rollPhase += rpm * dtWall;
      wheels.rearLeft.wheel.rotation.z = rollPhase;
      wheels.rearRight.wheel.rotation.z = rollPhase;
      wheels.frontLeft.wheel.rotation.z = rollPhase;
      wheels.frontRight.wheel.rotation.z = rollPhase;

      // Front pivot yaw — sign flipped to match the body yaw convention
      // (rover +Y maps to Three +Z, so the steering sense mirrors).
      wheels.frontLeft.pivot.rotation.y = -steer;
      wheels.frontRight.pivot.rotation.y = -steer;

      // Trail
      const idx = trailCount % MAX_TRAIL;
      trailPos[idx * 3] = xr;
      trailPos[idx * 3 + 1] = 0.02;
      trailPos[idx * 3 + 2] = yr;
      trailCount++;
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.setDrawRange(0, Math.min(trailCount, MAX_TRAIL));
    },
    reset(): void {
      trailCount = 0;
      trailGeo.setDrawRange(0, 0);
      rover.position.set(0, 0, 0);
      rover.rotation.set(0, 0, 0);
      rollPhase = 0;
      lastWall = null;
    },
    dispose(): void {
      scene.remove(rover);
      scene.remove(shadow);
      scene.remove(trail);
      trailGeo.dispose();
    },
  };
}
