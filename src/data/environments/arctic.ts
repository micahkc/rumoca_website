import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addLandingPad, clearOfRunway } from './cognipilot-logo';
import { addEquirectSky, addHorizonHaze, addHighClouds, addPbrGround, addSnowMountains } from './atmosphere';

export function setupArcticEnvironment(
  scene: THREE.Scene,
  renderer?: THREE.WebGLRenderer | null,
  aircraft?: string,
): void {
  // Clean winter sky (Poly Haven "horn-koppe_snow", CC0): crisp blue sky over an
  // open snowfield. The snowy mountains come from addSnowMountains() below.
  // Occluder is off so the mountain range on the horizon stays visible; fog
  // still blends the 3D snow plane into the horizon.
  addEquirectSky(scene, '/textures/sky/arctic_sky.jpg', renderer);
  scene.fog = new THREE.FogExp2(0xdce6f0, 0.0014);
  addHorizonHaze(scene, {
    hazeColor: 0xd6e1ec, groundColor: 0xc2d0dd,
    hazeStrength: 0.4, occluder: false,
  });

  // Lighting -- cool blue-white
  const sun = new THREE.DirectionalLight(0xeef4ff, 1.6);
  sun.position.set(5, 10, 6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8899cc, 0.4);
  fill.position.set(-6, 3, -4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xccddff, 0.2);
  rim.position.set(0, -1, -5);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xc8d8f0, 0x889aaa, 0.45));

  addHighClouds(scene);

  // Ground -- PBR snow (ambientCG Snow010A, CC0)
  addPbrGround(scene, renderer, {
    basePath: '/textures/snow_pbr', prefix: 'Snow010A',
    roughness: 0.65, metalness: 0.05, bumpScale: 0.06, repeat: 160,
    gridColorA: 0xc0ccd8, gridColorB: 0xc0ccd8, gridOpacity: 0.08,
  });

  // Ice rocks -- crystalline blue tint, spread across the open snowfield
  const iceRockMat = new THREE.MeshStandardMaterial({ color: 0x8899bb, roughness: 0.4, metalness: 0.3 });
  const iceRockDarkMat = new THREE.MeshStandardMaterial({ color: 0x667799, roughness: 0.5, metalness: 0.25 });
  const rocks = [
    { x: 26, z: 34, s: 0.5 }, { x: -34, z: 20, s: 0.7 }, { x: 40, z: -24, s: 0.4 },
    { x: -22, z: -38, s: 0.6 }, { x: 32, z: 10, s: 0.45 }, { x: -42, z: -10, s: 0.5 },
    { x: 10, z: 46, s: 0.4 }, { x: -14, z: 40, s: 0.55 }, { x: 48, z: 22, s: 0.35 },
    { x: -48, z: 6, s: 0.4 },
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

  // Distant snow-capped mountain range on the horizon -- the "winter Alaska"
  // backdrop. Far, smooth and snowy, replacing the old close-up jagged cones.
  addSnowMountains(scene);

  // Frozen ice patch -- a flat, irregular sheet flush with the snow (an iced-over
  // pond) rather than a raised blue block.
  const iceShape = new THREE.Shape();
  const iceSegs = 24;
  for (let i = 0; i <= iceSegs; i++) {
    const a = (i / iceSegs) * Math.PI * 2;
    // Irregular outline, wider than it is deep.
    const r = 1 + Math.sin(a * 3 + 1.3) * 0.20 + Math.sin(a * 7 + 0.6) * 0.10;
    const x = Math.cos(a) * r * 26;
    const z = Math.sin(a) * r * 12;
    if (i === 0) iceShape.moveTo(x, z); else iceShape.lineTo(x, z);
  }
  const ice = new THREE.Mesh(
    new THREE.ShapeGeometry(iceShape),
    new THREE.MeshStandardMaterial({
      color: 0x9fc6dd, roughness: 0.22, metalness: 0.2,
      transparent: true, opacity: 0.82,
    }),
  );
  ice.rotation.x = -Math.PI / 2;
  // Off to the front-left, clear of the runway (x ±5.5) and the scattered rocks.
  ice.position.set(-42, 0.012, 55); // just above the ground plane to avoid z-fighting
  scene.add(ice);

  // Penguin (GLB model by Poly by Google, CC-BY 3.0)
  {
    const loader = new GLTFLoader();
    loader.load('/models/penguin.glb', (gltf) => {
      const penguin = gltf.scene;
      const [px, pz] = clearOfRunway(-5, -4, aircraft, 1);
      penguin.position.set(px, 0.44, pz);
      penguin.rotation.y = 0.8;
      penguin.scale.set(0.005, 0.005, 0.005);
      scene.add(penguin);
    });
  }

  // Igloo (GLB model by Poly by Google, CC-BY 3.0)
  {
    const loader = new GLTFLoader();
    loader.load('/models/igloo.glb', (gltf) => {
      const igloo = gltf.scene;
      const [ix, iz] = clearOfRunway(-10, 8, aircraft, 3);
      igloo.position.set(ix, 0.55, iz);
      igloo.rotation.y = 0.6;
      igloo.scale.set(1.5, 1.5, 1.5);
      scene.add(igloo);
    });
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

  addLandingPad(scene, aircraft);
}
