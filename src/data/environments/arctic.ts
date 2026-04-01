import * as THREE from 'three';
import { addLandingPad } from './cognipilot-logo';

export function setupArcticEnvironment(scene: THREE.Scene): void {
  // Sky dome -- pale blue-white
  const skyGeo = new THREE.SphereGeometry(200, 32, 16);
  const skyColors: number[] = [];
  const posAttr = skyGeo.getAttribute('position');
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const t = Math.max(0, Math.min(1, (y / 200 + 1) * 0.5));
    // Horizon: white haze, zenith: pale arctic blue
    const r = 0.90 + (0.55 - 0.90) * Math.pow(t, 0.5);
    const g = 0.92 + (0.65 - 0.92) * Math.pow(t, 0.5);
    const b = 0.95 + (0.82 - 0.95) * Math.pow(t, 0.5);
    skyColors.push(r, g, b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  // Fog for atmosphere
  scene.fog = new THREE.Fog(0xe0e8f0, 30, 150);

  // Lighting -- cool blue-white
  const sun = new THREE.DirectionalLight(0xeef4ff, 1.5);
  sun.position.set(5, 10, 6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8899cc, 0.4);
  fill.position.set(-6, 3, -4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xccddff, 0.2);
  rim.position.set(0, -1, -5);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xc8d8f0, 0x889aaa, 0.5));

  // Ground -- white/ice
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xe8eef4, roughness: 0.6, metalness: 0.1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), iceMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
  const grid = new THREE.GridHelper(50, 50, 0xc0ccd8, 0xc0ccd8);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.12;
  scene.add(grid);

  // Ice/snow mounds
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xdde5ed, roughness: 0.7, metalness: 0.05 });
  const snowBrightMat = new THREE.MeshStandardMaterial({ color: 0xf0f4f8, roughness: 0.6, metalness: 0.08 });
  const mounds = [
    { x: -16, z: 22, sx: 10, sy: 1.2, sz: 6, ry: 0.2 },
    { x: 20, z: 18, sx: 13, sy: 1.8, sz: 7, ry: -0.3 },
    { x: -22, z: -12, sx: 8, sy: 1.0, sz: 5, ry: 0.5 },
    { x: 18, z: -20, sx: 16, sy: 2.0, sz: 8, ry: 0.1 },
    { x: -8, z: -22, sx: 12, sy: 1.5, sz: 6, ry: -0.4 },
    { x: 28, z: -3, sx: 7, sy: 0.8, sz: 4, ry: 0.6 },
  ];
  mounds.forEach((d) => {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      Math.random() > 0.5 ? snowMat : snowBrightMat,
    );
    mound.scale.set(d.sx, d.sy, d.sz);
    mound.position.set(d.x, -0.01, d.z);
    mound.rotation.y = d.ry;
    scene.add(mound);
  });

  // Ice rocks -- crystalline blue tint
  const iceRockMat = new THREE.MeshStandardMaterial({ color: 0x8899bb, roughness: 0.4, metalness: 0.3 });
  const iceRockDarkMat = new THREE.MeshStandardMaterial({ color: 0x667799, roughness: 0.5, metalness: 0.25 });
  const rocks = [
    { x: 6, z: 9, s: 0.4 }, { x: -8, z: 5, s: 0.6 }, { x: 10, z: -5, s: 0.3 },
    { x: -5, z: -9, s: 0.5 }, { x: 13, z: 4, s: 0.35 }, { x: -12, z: -4, s: 0.4 },
  ];
  rocks.forEach((r) => {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(r.s, 0),
      Math.random() > 0.5 ? iceRockMat : iceRockDarkMat,
    );
    rock.position.set(r.x, r.s * 0.3, r.z);
    rock.scale.set(1 + Math.random() * 0.4, 0.6 + Math.random() * 0.5, 1 + Math.random() * 0.3);
    rock.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.2);
    scene.add(rock);
  });

  // Jagged arctic peaks -- rocky bases with snow-covered tops and ridgelines
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.85, metalness: 0.08 });
  const rockDarkMat = new THREE.MeshStandardMaterial({ color: 0x404855, roughness: 0.9, metalness: 0.05 });
  const snowPeakMat = new THREE.MeshStandardMaterial({ color: 0xe8f0f8, roughness: 0.5, metalness: 0.05 });
  const glacierMat = new THREE.MeshStandardMaterial({ color: 0x9ec8dd, roughness: 0.3, metalness: 0.15 });

  const peaks = [
    { x: -35, z: 55, h: 18, w: 10 },
    { x: 15, z: 60, h: 24, w: 14 },
    { x: -10, z: 65, h: 20, w: 11 },
    { x: 40, z: 50, h: 16, w: 9 },
    { x: -55, z: 45, h: 14, w: 8 },
    { x: 60, z: 55, h: 22, w: 12 },
    { x: 0, z: 75, h: 28, w: 16 },
    { x: -40, z: -50, h: 15, w: 9 },
    { x: 50, z: -45, h: 18, w: 10 },
  ];
  peaks.forEach((p) => {
    // Rocky base -- wide, rough
    const baseGeo = new THREE.ConeGeometry(p.w, p.h * 0.7, 7);
    // Distort vertices for jagged look
    const pos = baseGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) {
        const jitter = 0.15 + Math.sin(i * 3.7) * 0.1;
        pos.setX(i, pos.getX(i) * (1 + jitter * (Math.sin(i * 7.3) * 0.5)));
        pos.setZ(i, pos.getZ(i) * (1 + jitter * (Math.cos(i * 5.1) * 0.5)));
      }
    }
    baseGeo.computeVertexNormals();
    const base = new THREE.Mesh(baseGeo, Math.random() > 0.5 ? rockMat : rockDarkMat);
    base.position.set(p.x, p.h * 0.35 - 2, p.z);
    base.rotation.y = Math.random() * Math.PI;
    scene.add(base);

    // Snow cap -- sits on top, slightly offset
    const capH = p.h * 0.45;
    const capGeo = new THREE.ConeGeometry(p.w * 0.5, capH, 6);
    // Distort cap too
    const capPos = capGeo.attributes.position;
    for (let i = 0; i < capPos.count; i++) {
      if (capPos.getY(i) > capH * 0.1) {
        capPos.setX(i, capPos.getX(i) * (1 + Math.sin(i * 4.2) * 0.12));
        capPos.setZ(i, capPos.getZ(i) * (1 + Math.cos(i * 3.8) * 0.12));
      }
    }
    capGeo.computeVertexNormals();
    const cap = new THREE.Mesh(capGeo, snowPeakMat);
    cap.position.set(p.x + Math.sin(p.x) * 0.5, p.h * 0.55, p.z + Math.cos(p.z) * 0.5);
    cap.rotation.y = Math.random() * Math.PI;
    scene.add(cap);

    // Secondary jagged spire beside main peak
    if (Math.random() > 0.4) {
      const spireH = p.h * 0.4 + Math.random() * p.h * 0.2;
      const spireGeo = new THREE.ConeGeometry(p.w * 0.25, spireH, 5);
      const spirePos = spireGeo.attributes.position;
      for (let i = 0; i < spirePos.count; i++) {
        spirePos.setX(i, spirePos.getX(i) * (1 + Math.sin(i * 6.1) * 0.2));
        spirePos.setZ(i, spirePos.getZ(i) * (1 + Math.cos(i * 4.7) * 0.2));
      }
      spireGeo.computeVertexNormals();
      const spire = new THREE.Mesh(spireGeo, rockDarkMat);
      spire.position.set(
        p.x + (Math.random() - 0.5) * p.w * 0.8,
        spireH * 0.4,
        p.z + (Math.random() - 0.5) * p.w * 0.5,
      );
      scene.add(spire);
    }
  });

  // Glacier shelf -- flat ice sheet in front of peaks
  const glacier = new THREE.Mesh(
    new THREE.BoxGeometry(60, 1.5, 8),
    glacierMat,
  );
  glacier.position.set(0, 0.5, 42);
  scene.add(glacier);
  // Glacier face -- blue-tinted vertical wall
  const glacierFace = new THREE.Mesh(
    new THREE.BoxGeometry(60, 2.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x7bb8d8, roughness: 0.25, metalness: 0.2 }),
  );
  glacierFace.position.set(0, 0.8, 38);
  scene.add(glacierFace);

  // Polar bear
  {
    const bear = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0xf0ebe0, roughness: 0.85 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    // Body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), furMat);
    body.scale.set(1.4, 0.9, 0.9);
    body.position.y = 0.4;
    bear.add(body);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), furMat);
    head.position.set(0.45, 0.55, 0);
    bear.add(head);
    // Snout
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), furMat);
    snout.scale.set(1.3, 0.8, 0.9);
    snout.position.set(0.6, 0.5, 0);
    bear.add(snout);
    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), noseMat);
    nose.position.set(0.67, 0.52, 0);
    bear.add(nose);
    // Eyes
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), noseMat);
      eye.position.set(0.56, 0.6, side * 0.1);
      bear.add(eye);
    }
    // Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), furMat);
      ear.position.set(0.38, 0.72, side * 0.12);
      bear.add(ear);
    }
    // Legs
    const legPositions = [
      [0.3, 0.15, 0.2], [0.3, 0.15, -0.2],
      [-0.3, 0.15, 0.2], [-0.3, 0.15, -0.2],
    ];
    legPositions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.3, 6), furMat);
      leg.position.set(lx, ly, lz);
      bear.add(leg);
    });
    bear.position.set(8, 0, -6);
    bear.rotation.y = -0.5;
    scene.add(bear);
  }

  // Penguin
  {
    const penguin = new THREE.Group();
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.6 });
    const whiteBellyMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 });
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff8822, roughness: 0.5 });
    // Body (black back)
    const pBody = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), blackMat);
    pBody.scale.set(0.8, 1.2, 0.8);
    pBody.position.y = 0.2;
    penguin.add(pBody);
    // White belly (front)
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), whiteBellyMat);
    belly.scale.set(0.7, 1.1, 0.5);
    belly.position.set(0.03, 0.2, 0);
    penguin.add(belly);
    // Head
    const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), blackMat);
    pHead.position.set(0, 0.4, 0);
    penguin.add(pHead);
    // White face patches
    for (const side of [-1, 1]) {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), whiteBellyMat);
      patch.position.set(0.04, 0.42, side * 0.035);
      penguin.add(patch);
    }
    // Eyes
    for (const side of [-1, 1]) {
      const pEye = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      pEye.position.set(0.055, 0.43, side * 0.03);
      penguin.add(pEye);
    }
    // Beak
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 4), orangeMat);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.09, 0.39, 0);
    penguin.add(beak);
    // Feet
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.05), orangeMat);
      foot.position.set(0.01, 0.005, side * 0.04);
      penguin.add(foot);
    }
    // Flippers
    for (const side of [-1, 1]) {
      const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.12, 0.04), blackMat);
      flipper.position.set(0, 0.2, side * 0.1);
      flipper.rotation.x = side * 0.2;
      penguin.add(flipper);
    }
    penguin.position.set(-5, 0, -4);
    penguin.rotation.y = 0.8;
    scene.add(penguin);
  }

  // Snow particles
  const snowCount = 2000;
  const snowGeo = new THREE.BufferGeometry();
  const snowPositions = new Float32Array(snowCount * 3);
  for (let i = 0; i < snowCount; i++) {
    snowPositions[i * 3] = (Math.random() - 0.5) * 100;
    snowPositions[i * 3 + 1] = Math.random() * 30;
    snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 100;
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  const snowMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.08,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const snowParticles = new THREE.Points(snowGeo, snowMaterial);
  snowParticles.name = 'snowParticles';
  scene.add(snowParticles);

  // Animate snow in the render loop by attaching update to userData
  snowParticles.userData.update = () => {
    const positions = snowGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < snowCount; i++) {
      positions.setY(i, positions.getY(i) - 0.02);
      positions.setX(i, positions.getX(i) + Math.sin(i * 0.1) * 0.003);
      if (positions.getY(i) < 0) {
        positions.setY(i, 25 + Math.random() * 5);
        positions.setX(i, (Math.random() - 0.5) * 100);
        positions.setZ(i, (Math.random() - 0.5) * 100);
      }
    }
    positions.needsUpdate = true;
  };

  addLandingPad(scene);
}
