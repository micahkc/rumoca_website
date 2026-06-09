import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addLandingPad, clearOfRunway } from './cognipilot-logo';
import { addEquirectSky, addHorizonHaze, addHighClouds, addPbrGround } from './atmosphere';

export function setupForestEnvironment(
  scene: THREE.Scene,
  renderer?: THREE.WebGLRenderer | null,
  aircraft?: string,
): void {
  // Photographic sky (Poly Haven "forest_slope", CC0) + atmospheric depth
  addEquirectSky(scene, '/textures/sky/forest_sky.jpg', renderer);
  scene.fog = new THREE.FogExp2(0x9aa48f, 0.0032);
  addHorizonHaze(scene, { hazeColor: 0xaab4a0, groundColor: 0x5a6342 });

  // Lighting -- warm filtered sunlight through canopy
  const sun = new THREE.DirectionalLight(0xfff5d0, 1.6);
  sun.position.set(6, 14, 5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88aa66, 0.4);
  fill.position.set(-5, 4, -3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xddeeaa, 0.2);
  rim.position.set(0, -1, -6);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x8ec07c, 0x3a5a2a, 0.45));

  addHighClouds(scene);

  // Ground -- forest-floor dirt (sand PBR maps re-tinted earth-brown; the sand
  // set has no ROUGH map so we use a scalar roughness instead).
  addPbrGround(scene, renderer, {
    basePath: '/textures/sand_pbr', prefix: 'GroundSand005',
    color: 0x6b5234, useRoughnessMap: false,
    roughness: 0.96, metalness: 0.0, bumpScale: 0.07, repeat: 220,
    gridColorA: 0x4a3c26, gridColorB: 0x4a3c26, gridOpacity: 0.05,
  });

  // Seeded random for consistent placement.
  let seed = 42;
  function seededRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  // Rolling hills (forested ridges in the distance).
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x4d8033, roughness: 0.9 });
  const hillDarkMat = new THREE.MeshStandardMaterial({ color: 0x3a6628, roughness: 0.92 });
  const hills = [
    { x: -20, z: 25, sx: 16, sy: 2.5, sz: 10, ry: 0.2 },
    { x: 25, z: 20, sx: 12, sy: 1.8, sz: 8, ry: -0.3 },
    { x: -15, z: -20, sx: 18, sy: 3.0, sz: 12, ry: 0.4 },
    { x: 20, z: -18, sx: 14, sy: 2.0, sz: 9, ry: -0.1 },
    { x: 0, z: 30, sx: 22, sy: 2.8, sz: 10, ry: 0.15 },
  ];
  hills.forEach((h, i) => {
    const [hx, hz] = clearOfRunway(h.x, h.z, aircraft, h.sx);
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      i % 2 === 0 ? hillMat : hillDarkMat,
    );
    hill.scale.set(h.sx, h.sy, h.sz);
    hill.position.set(hx, -0.01, hz);
    hill.rotation.y = h.ry;
    scene.add(hill);
  });

  // ── Trees ─────────────────────────────────────────────────────────────────
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9, metalness: 0.02 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x2d6b1a, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x357f22, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x1f5a12, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x4a8a30, roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ color: 0x6b7a24, roughness: 0.85 }), // dry/olive
  ];

  // Layered conifer: tapering stack of cones on a short trunk.
  const makeConifer = (h: number, leafMat: THREE.Material): THREE.Group => {
    const g = new THREE.Group();
    const trunkH = h * 0.22;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.035, h * 0.07, trunkH, 6), trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    g.add(trunk);
    const tiers = 5;
    const base = trunkH * 0.7;
    const span = h * 1.05 - base;
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const r = h * 0.36 * (1 - f * 0.85) + h * 0.04;
      const ch = (span / tiers) * 1.7;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, ch, 9), leafMat);
      cone.position.y = base + f * span + ch * 0.3;
      cone.castShadow = true;
      g.add(cone);
    }
    return g;
  };

  // Broadleaf: clustered blobs forming a full rounded crown on a taller trunk.
  const makeBroadleaf = (h: number, leafMat: THREE.Material): THREE.Group => {
    const g = new THREE.Group();
    const trunkH = h * 0.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.045, h * 0.08, trunkH, 6), trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    g.add(trunk);
    const r = h * 0.3;
    const blobs: [number, number, number, number][] = [
      [0, trunkH + r * 0.7, 0, r * 1.05],
      [r * 0.6, trunkH + r * 0.45, r * 0.2, r * 0.7],
      [-r * 0.55, trunkH + r * 0.5, -r * 0.2, r * 0.72],
      [r * 0.15, trunkH + r * 1.05, -r * 0.3, r * 0.6],
      [-r * 0.2, trunkH + r * 0.95, r * 0.35, r * 0.62],
    ];
    for (const [bx, by, bz, br] of blobs) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(br, 8, 6), leafMat);
      s.position.set(bx, by, bz);
      s.scale.set(1, 0.9, 1);
      s.castShadow = true;
      g.add(s);
    }
    return g;
  };

  for (let i = 0; i < 95; i++) {
    const angle = seededRandom() * Math.PI * 2;
    const dist = 7 + seededRandom() * 52;
    let x = Math.cos(angle) * dist;
    let z = Math.sin(angle) * dist;
    [x, z] = clearOfRunway(x, z, aircraft, 2);
    const h = 2.5 + seededRandom() * 5;
    const leafMat = leafMats[Math.floor(seededRandom() * leafMats.length)];
    const tree = seededRandom() > 0.4 ? makeConifer(h, leafMat) : makeBroadleaf(h, leafMat);
    tree.position.set(x, 0, z);
    tree.rotation.y = seededRandom() * Math.PI * 2;
    tree.scale.setScalar(0.9 + seededRandom() * 0.4);
    scene.add(tree);
  }

  // ── Low shrubs / underbrush ────────────────────────────────────────────────
  const bushMats = [leafMats[0], leafMats[2], leafMats[3]];
  for (let i = 0; i < 45; i++) {
    const angle = seededRandom() * Math.PI * 2;
    const dist = 5 + seededRandom() * 55;
    let x = Math.cos(angle) * dist;
    let z = Math.sin(angle) * dist;
    [x, z] = clearOfRunway(x, z, aircraft, 1);
    const s = 0.4 + seededRandom() * 0.7;
    const mat = bushMats[Math.floor(seededRandom() * bushMats.length)];
    const bush = new THREE.Group();
    const offs: [number, number, number, number][] = [
      [0, s * 0.55, 0, s * 0.6],
      [s * 0.5, s * 0.4, s * 0.1, s * 0.45],
      [-s * 0.45, s * 0.45, -s * 0.2, s * 0.5],
    ];
    for (const [bx, by, bz, br] of offs) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(br, 7, 5), mat);
      m.position.set(bx, by, bz);
      m.scale.set(1, 0.7, 1);
      bush.add(m);
    }
    bush.position.set(x, 0, z);
    scene.add(bush);
  }

  // ── Mossy boulders ─────────────────────────────────────────────────────────
  const boulderMat = new THREE.MeshStandardMaterial({ color: 0x6b6660, roughness: 0.95, metalness: 0.0 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x46662c, roughness: 0.95, metalness: 0.0 });
  for (let i = 0; i < 16; i++) {
    const angle = seededRandom() * Math.PI * 2;
    const dist = 6 + seededRandom() * 50;
    let x = Math.cos(angle) * dist;
    let z = Math.sin(angle) * dist;
    [x, z] = clearOfRunway(x, z, aircraft, 1);
    const s = 0.4 + seededRandom() * 0.9;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), boulderMat);
    rock.position.set(x, s * 0.35, z);
    rock.scale.set(1 + seededRandom() * 0.5, 0.6 + seededRandom() * 0.4, 1 + seededRandom() * 0.4);
    rock.rotation.set(seededRandom() * 0.4, seededRandom() * Math.PI, seededRandom() * 0.4);
    rock.castShadow = true;
    scene.add(rock);
    // Moss cap.
    const moss = new THREE.Mesh(new THREE.SphereGeometry(s * 0.85, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2.4), mossMat);
    moss.position.copy(rock.position);
    moss.scale.copy(rock.scale);
    moss.rotation.copy(rock.rotation);
    scene.add(moss);
  }

  // Black bear (GLB model by Poly by Google, CC-BY 3.0)
  {
    const loader = new GLTFLoader();
    loader.load('/models/bear.glb', (gltf) => {
      const bear = gltf.scene;
      const [bx, bz] = clearOfRunway(7, 5, aircraft, 2);
      bear.position.set(bx, 0.04, bz);
      bear.rotation.y = -1.2 + Math.PI / 2;
      bear.scale.set(0.08, 0.08, 0.08);
      scene.add(bear);
    });
  }

  // T-Rex (loaded from GLB model by Quaternius, CC0)
  {
    const loader = new GLTFLoader();
    loader.load('/models/trex.glb', (gltf) => {
      const trex = gltf.scene;
      const [tx, tz] = clearOfRunway(10, -8, aircraft, 3);
      trex.position.set(tx, 0, tz);
      trex.rotation.y = 1.0 + Math.PI;
      trex.scale.set(0.25, 0.25, 0.25);
      trex.name = 'trex';
      scene.add(trex);

      // Animation: alternate between idle and attack
      const mixer = new THREE.AnimationMixer(trex);
      const clips = gltf.animations;
      const idleClip = clips.find((c) => c.name.includes('Idle'));
      const attackClip = clips.find((c) => c.name.includes('Attack'));
      if (idleClip && attackClip) {
        const idleAction = mixer.clipAction(idleClip);
        const attackAction = mixer.clipAction(attackClip);
        attackAction.loop = THREE.LoopOnce;
        attackAction.clampWhenFinished = true;
        idleAction.play();

        // Every 6-10s, crossfade to attack then back to idle
        const triggerAttack = () => {
          attackAction.reset().play();
          idleAction.crossFadeTo(attackAction, 0.3, true);
          setTimeout(() => {
            attackAction.crossFadeTo(idleAction, 0.3, true);
            idleAction.reset().play();
          }, (attackClip.duration - 0.3) * 1000);
        };
        setInterval(triggerAttack, (6 + Math.random() * 4) * 1000);
      } else {
        // Fallback: just play whatever is available
        const clip = idleClip || attackClip || clips[0];
        if (clip) mixer.clipAction(clip).play();
      }

      const clock = new THREE.Clock();
      trex.userData.update = () => mixer.update(clock.getDelta());
    });
  }

  addLandingPad(scene, aircraft);
}
