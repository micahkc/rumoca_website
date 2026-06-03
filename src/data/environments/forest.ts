import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addLandingPad } from './cognipilot-logo';

export function setupForestEnvironment(scene: THREE.Scene): void {
  // Sky dome -- green-tinted gradient
  const skyGeo = new THREE.SphereGeometry(200, 32, 16);
  const skyColors: number[] = [];
  const posAttr = skyGeo.getAttribute('position');
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const t = Math.max(0, Math.min(1, (y / 200 + 1) * 0.5));
    // Horizon: warm haze, zenith: forest blue-green
    const r = 0.82 + (0.22 - 0.82) * Math.pow(t, 0.6);
    const g = 0.88 + (0.50 - 0.88) * Math.pow(t, 0.6);
    const b = 0.75 + (0.72 - 0.75) * Math.pow(t, 0.6);
    skyColors.push(r, g, b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  // Lighting -- warm filtered sunlight through canopy
  const sun = new THREE.DirectionalLight(0xfff5d0, 1.4);
  sun.position.set(6, 14, 5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88aa66, 0.5);
  fill.position.set(-5, 4, -3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xddeeaa, 0.2);
  rim.position.set(0, -1, -6);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x8ec07c, 0x3a5a2a, 0.6));

  // Ground -- grass green
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x4a7a32, roughness: 0.92, metalness: 0.02 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), grassMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
  const grid = new THREE.GridHelper(50, 50, 0x3a6a28, 0x3a6a28);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.1;
  scene.add(grid);

  // Rolling hills
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x4d8033, roughness: 0.9 });
  const hillDarkMat = new THREE.MeshStandardMaterial({ color: 0x3a6628, roughness: 0.92 });
  const hills = [
    { x: -20, z: 25, sx: 16, sy: 2.5, sz: 10, ry: 0.2 },
    { x: 25, z: 20, sx: 12, sy: 1.8, sz: 8, ry: -0.3 },
    { x: -15, z: -20, sx: 18, sy: 3.0, sz: 12, ry: 0.4 },
    { x: 20, z: -18, sx: 14, sy: 2.0, sz: 9, ry: -0.1 },
    { x: 0, z: 30, sx: 22, sy: 2.8, sz: 10, ry: 0.15 },
  ];
  hills.forEach((h) => {
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      Math.random() > 0.5 ? hillMat : hillDarkMat,
    );
    hill.scale.set(h.sx, h.sy, h.sz);
    hill.position.set(h.x, -0.01, h.z);
    hill.rotation.y = h.ry;
    scene.add(hill);
  });

  // Trees
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.85, metalness: 0.05 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x2d6b1a, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x3a8025, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x1f5a12, roughness: 0.85 }),
  ];

  // Seeded random for consistent tree placement
  let seed = 42;
  function seededRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let i = 0; i < 35; i++) {
    const angle = seededRandom() * Math.PI * 2;
    const dist = 6 + seededRandom() * 40;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const h = 2 + seededRandom() * 4;
    const trunkR = 0.08 + seededRandom() * 0.12;

    // Trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.7, trunkR, h, 8), trunkMat);
    trunk.position.set(x, h / 2, z);
    scene.add(trunk);

    // Canopy -- mix of cones and spheres
    const leafMat = leafMats[Math.floor(seededRandom() * leafMats.length)];
    if (seededRandom() > 0.4) {
      // Conifer style
      const coneH = h * 0.8 + seededRandom() * h * 0.4;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(h * 0.25, coneH, 8), leafMat);
      cone.position.set(x, h + coneH * 0.35, z);
      scene.add(cone);
    } else {
      // Deciduous style
      const sphereR = h * 0.3 + seededRandom() * h * 0.15;
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(sphereR, 8, 6), leafMat);
      sphere.position.set(x, h + sphereR * 0.5, z);
      sphere.scale.set(1, 0.7 + seededRandom() * 0.3, 1);
      scene.add(sphere);
    }
  }

  // Scattered wildflowers (small colored dots)
  const flowerColors = [0xff6688, 0xffdd44, 0xaa88ff, 0xff8844, 0xffffff];
  for (let i = 0; i < 40; i++) {
    const angle = seededRandom() * Math.PI * 2;
    const dist = 2 + seededRandom() * 20;
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.03 + seededRandom() * 0.03, 6, 4),
      new THREE.MeshStandardMaterial({
        color: flowerColors[Math.floor(seededRandom() * flowerColors.length)],
        roughness: 0.7,
      }),
    );
    flower.position.set(Math.cos(angle) * dist, 0.03, Math.sin(angle) * dist);
    scene.add(flower);
  }

  // Black bear (GLB model by Poly by Google, CC-BY 3.0)
  {
    const loader = new GLTFLoader();
    loader.load('/models/bear.glb', (gltf) => {
      const bear = gltf.scene;
      bear.position.set(7, 0.04, 5);
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
      trex.position.set(10, 0, -8);
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

  addLandingPad(scene);
}
