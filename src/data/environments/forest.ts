import * as THREE from 'three';
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

  // Brown bear
  {
    const bear = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0x5c3820, roughness: 0.85 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const snoutMat = new THREE.MeshStandardMaterial({ color: 0x7a5030, roughness: 0.8 });
    // Body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), furMat);
    body.scale.set(1.5, 1.0, 1.0);
    body.position.y = 0.5;
    bear.add(body);
    // Shoulder hump
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), furMat);
    hump.position.set(0.2, 0.8, 0);
    bear.add(hump);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), furMat);
    head.position.set(0.55, 0.65, 0);
    bear.add(head);
    // Snout
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), snoutMat);
    snout.scale.set(1.3, 0.8, 0.9);
    snout.position.set(0.72, 0.58, 0);
    bear.add(snout);
    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), noseMat);
    nose.position.set(0.82, 0.6, 0);
    bear.add(nose);
    // Eyes
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), noseMat);
      eye.position.set(0.66, 0.72, side * 0.12);
      bear.add(eye);
    }
    // Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), furMat);
      ear.position.set(0.45, 0.85, side * 0.14);
      bear.add(ear);
    }
    // Legs
    const legPositions: [number, number, number][] = [
      [0.35, 0.2, 0.22], [0.35, 0.2, -0.22],
      [-0.35, 0.2, 0.22], [-0.35, 0.2, -0.22],
    ];
    legPositions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.4, 6), furMat);
      leg.position.set(lx, ly, lz);
      bear.add(leg);
    });
    bear.position.set(7, 0, 5);
    bear.rotation.y = -1.2;
    scene.add(bear);
  }

  addLandingPad(scene);
}
