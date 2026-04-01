import * as THREE from 'three';
import { addLandingPad } from './cognipilot-logo';

export function setupDesertEnvironment(scene: THREE.Scene): void {
  // Sky dome
  const skyGeo = new THREE.SphereGeometry(200, 32, 16);
  const skyColors: number[] = [];
  const posAttr = skyGeo.getAttribute('position');
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const t = Math.max(0, Math.min(1, (y / 200 + 1) * 0.5));
    const r = 0.94 + (0.29 - 0.94) * Math.pow(t, 0.6);
    const g = 0.85 + (0.56 - 0.85) * Math.pow(t, 0.6);
    const b = 0.69 + (0.78 - 0.69) * Math.pow(t, 0.6);
    skyColors.push(r, g, b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  // Lighting
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.8);
  sun.position.set(8, 12, 4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd4a060, 0.4);
  fill.position.set(-5, 3, -4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffeebb, 0.25);
  rim.position.set(0, -1, -6);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x87ceeb, 0xc2956b, 0.5));

  // Ground
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xd4a860, roughness: 0.95, metalness: 0.02 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), sandMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
  const grid = new THREE.GridHelper(50, 50, 0xc49850, 0xc49850);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.12;
  scene.add(grid);

  // Sand dunes
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xd9b06a, roughness: 0.9 });
  const duneDarkMat = new THREE.MeshStandardMaterial({ color: 0xc49850, roughness: 0.95 });
  const dunes = [
    { x: -18, z: 20, sx: 12, sy: 1.5, sz: 5, ry: 0.3 },
    { x: 22, z: 15, sx: 15, sy: 2.0, sz: 6, ry: -0.2 },
    { x: -25, z: -10, sx: 10, sy: 1.2, sz: 4, ry: 0.5 },
    { x: 15, z: -22, sx: 18, sy: 2.5, sz: 7, ry: 0.1 },
    { x: -10, z: -25, sx: 14, sy: 1.8, sz: 5, ry: -0.4 },
    { x: 30, z: -5, sx: 8, sy: 1.0, sz: 4, ry: 0.6 },
    { x: -30, z: 5, sx: 11, sy: 1.3, sz: 5, ry: -0.1 },
    { x: 0, z: 30, sx: 20, sy: 2.2, sz: 6, ry: 0.15 },
  ];
  dunes.forEach((d) => {
    const dune = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      Math.random() > 0.5 ? duneMat : duneDarkMat,
    );
    dune.scale.set(d.sx, d.sy, d.sz);
    dune.position.set(d.x, -0.01, d.z);
    dune.rotation.y = d.ry;
    scene.add(dune);
  });

  // Rocks
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.85, metalness: 0.05 });
  const rockDarkMat = new THREE.MeshStandardMaterial({ color: 0x6b5740, roughness: 0.9, metalness: 0.05 });
  const rocks = [
    { x: 5, z: 8, s: 0.3 }, { x: -7, z: 6, s: 0.5 }, { x: 9, z: -4, s: 0.2 }, { x: -4, z: -8, s: 0.4 },
    { x: 12, z: 3, s: 0.35 }, { x: -11, z: -3, s: 0.25 }, { x: 3, z: -10, s: 0.45 }, { x: -8, z: 10, s: 0.3 },
  ];
  rocks.forEach((r) => {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(r.s, 1),
      Math.random() > 0.5 ? rockMat : rockDarkMat,
    );
    rock.position.set(r.x, r.s * 0.3, r.z);
    rock.scale.set(1 + Math.random() * 0.5, 0.5 + Math.random() * 0.4, 1 + Math.random() * 0.3);
    rock.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.2);
    scene.add(rock);
  });

  // Cacti
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x3a6b35, roughness: 0.8, metalness: 0.05 });
  const cactiPositions = [
    { x: -6, z: 12 }, { x: 14, z: 7 }, { x: -13, z: -6 }, { x: 8, z: -12 }, { x: -3, z: -15 },
  ];
  cactiPositions.forEach((c) => {
    const h = 0.8 + Math.random() * 1.2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, h, 8), cactusMat);
    trunk.position.set(c.x, h / 2, c.z);
    scene.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), cactusMat);
    top.position.set(c.x, h, c.z);
    scene.add(top);
    if (Math.random() > 0.3) {
      const armH = 0.4 + Math.random() * 0.4;
      const armY = h * 0.4 + Math.random() * h * 0.3;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const aH = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.3, 6), cactusMat);
      aH.rotation.z = dir * Math.PI / 2;
      aH.position.set(c.x + dir * 0.2, armY, c.z);
      scene.add(aH);
      const aV = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, armH, 6), cactusMat);
      aV.position.set(c.x + dir * 0.35, armY + armH / 2, c.z);
      scene.add(aV);
      const aT = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), cactusMat);
      aT.position.set(c.x + dir * 0.35, armY + armH, c.z);
      scene.add(aT);
    }
  });

  // Kangaroo
  {
    const roo = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0x8b6b45, roughness: 0.8 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0xb8956a, roughness: 0.75 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
    // Body -- upright, slightly forward-leaning
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), furMat);
    body.scale.set(0.7, 1.2, 0.7);
    body.position.y = 0.6;
    roo.add(body);
    // Belly patch
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bellyMat);
    belly.scale.set(0.5, 1.0, 0.4);
    belly.position.set(0.05, 0.55, 0);
    roo.add(belly);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), furMat);
    head.scale.set(0.8, 0.9, 0.8);
    head.position.set(0.08, 1.0, 0);
    roo.add(head);
    // Snout
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), furMat);
    snout.scale.set(1.3, 0.7, 0.7);
    snout.position.set(0.18, 0.96, 0);
    roo.add(snout);
    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), noseMat);
    nose.position.set(0.23, 0.97, 0);
    roo.add(nose);
    // Eyes
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), noseMat);
      eye.position.set(0.15, 1.04, side * 0.055);
      roo.add(eye);
    }
    // Ears -- tall and pointed
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 6), furMat);
      ear.position.set(0.02, 1.15, side * 0.05);
      ear.rotation.z = side * 0.15;
      roo.add(ear);
    }
    // Arms (small, forward)
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.18, 6), furMat);
      arm.position.set(0.12, 0.65, side * 0.1);
      arm.rotation.z = -0.5;
      arm.rotation.x = side * 0.15;
      roo.add(arm);
    }
    // Legs (large, bent at knee)
    for (const side of [-1, 1]) {
      // Thigh
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.22, 6), furMat);
      thigh.position.set(-0.05, 0.35, side * 0.08);
      thigh.rotation.z = 0.4;
      roo.add(thigh);
      // Shin
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.2, 6), furMat);
      shin.position.set(0.05, 0.12, side * 0.08);
      shin.rotation.z = -0.3;
      roo.add(shin);
      // Foot
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.04), furMat);
      foot.position.set(0.1, 0.02, side * 0.08);
      roo.add(foot);
    }
    // Tail -- thick, tapers, curves down and back
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.4, 6), furMat);
    tail.position.set(-0.25, 0.3, 0);
    tail.rotation.z = 1.2;
    roo.add(tail);

    roo.position.set(7, 0, -5);
    roo.rotation.y = -0.8;
    scene.add(roo);
  }

  addLandingPad(scene);
}
