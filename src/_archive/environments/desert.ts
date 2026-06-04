import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

  // Kangaroo (GLB model by Poly by Google, CC-BY 3.0)
  {
    const loader = new GLTFLoader();
    loader.load('/models/kangaroo.glb', (gltf) => {
      const roo = gltf.scene;
      roo.position.set(7, 0.69, -5);
      roo.rotation.y = -0.8;
      roo.scale.set(0.01, 0.01, 0.01);
      scene.add(roo);
    });
  }

  addLandingPad(scene);
}
