import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addLandingPad, clearOfRunway } from './cognipilot-logo';

// Ported from rumoca's examples/interactive/quadrotor/quadrotor_scene.js so
// the simulation page matches the look of the rumoca interactive demo.

function deterministicUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function createCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const lobes = [
    { x: 140, y: 138, r: 82, a: 0.54 },
    { x: 210, y: 105, r: 98, a: 0.62 },
    { x: 295, y: 118, r: 90, a: 0.58 },
    { x: 365, y: 145, r: 76, a: 0.46 },
    { x: 250, y: 158, r: 126, a: 0.34 },
  ];
  for (const lobe of lobes) {
    const grad = ctx.createRadialGradient(lobe.x, lobe.y, 0, lobe.x, lobe.y, lobe.r);
    grad.addColorStop(0, `rgba(255, 255, 255, ${lobe.a})`);
    grad.addColorStop(0.55, `rgba(245, 247, 244, ${lobe.a * 0.45})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lobe.x, lobe.y, lobe.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export function setupDesertEnvironment(
  scene: THREE.Scene,
  renderer?: THREE.WebGLRenderer | null,
  aircraft?: string,
): void {
  // ── Desert skybox (arid2 cubemap) ─────────────────────────────────
  const skybox = new THREE.CubeTextureLoader().load([
    '/textures/skybox/arid2_rt.jpg',
    '/textures/skybox/arid2_lf.jpg',
    '/textures/skybox/arid2_up.jpg',
    '/textures/skybox/arid2_dn.jpg',
    '/textures/skybox/arid2_bk.jpg',
    '/textures/skybox/arid2_ft.jpg',
  ]);
  skybox.colorSpace = THREE.SRGBColorSpace;
  scene.background = skybox;
  scene.fog = new THREE.FogExp2(0xc9d4c4, 0.0022);

  // ── Horizon haze (procedural sphere shader) ───────────────────────
  const horizonHaze = new THREE.Mesh(
    new THREE.SphereGeometry(460, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { hazeColor: { value: new THREE.Color(0xc9d4c4) } },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(worldPos.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 hazeColor;
        varying vec3 vWorldDir;
        void main() {
          float lowerSky = 1.0 - smoothstep(0.04, 0.30, vWorldDir.y);
          float horizonCore = 1.0 - smoothstep(0.02, 0.16, abs(vWorldDir.y));
          float alpha = max(0.12 * horizonCore, 0.84 * lowerSky);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(hazeColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.BackSide,
    }),
  );
  horizonHaze.name = 'horizon_haze';
  horizonHaze.renderOrder = 900;
  // Tracks the camera in the render loop so it always wraps the viewer.
  horizonHaze.userData.followCamera = true;
  scene.add(horizonHaze);

  const lowerSkyOccluder = new THREE.Mesh(
    new THREE.SphereGeometry(450, 64, 24),
    new THREE.ShaderMaterial({
      uniforms: {
        groundColor: { value: new THREE.Color(0xb99c6c) },
        hazeColor: { value: new THREE.Color(0xc9d4c4) },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(worldPos.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 groundColor;
        uniform vec3 hazeColor;
        varying vec3 vWorldDir;
        void main() {
          float below = 1.0 - smoothstep(0.02, 0.16, vWorldDir.y);
          if (below < 0.01) discard;
          float deep = smoothstep(0.02, -0.5, vWorldDir.y);
          vec3 color = mix(hazeColor, groundColor, deep);
          gl_FragColor = vec4(color, below);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.BackSide,
    }),
  );
  lowerSkyOccluder.name = 'lower_sky_occluder';
  lowerSkyOccluder.renderOrder = 890;
  lowerSkyOccluder.userData.followCamera = true;
  scene.add(lowerSkyOccluder);

  // ── Lighting ──────────────────────────────────────────────────────
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

  // ── High clouds ───────────────────────────────────────────────────
  const cloudTexture = createCloudTexture();
  const cloudGroup = new THREE.Group();
  cloudGroup.name = 'cloud_layer';
  scene.add(cloudGroup);
  for (let i = 0; i < 36; i++) {
    const angle = deterministicUnit(i * 11 + 201) * Math.PI * 2;
    const radius = 220 + deterministicUnit(i * 11 + 202) * 760;
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.22 + deterministicUnit(i * 11 + 203) * 0.26,
      depthWrite: false,
      fog: true,
    }));
    cloud.position.set(
      Math.cos(angle) * radius,
      95 + deterministicUnit(i * 11 + 204) * 75,
      Math.sin(angle) * radius,
    );
    const scale = 70 + deterministicUnit(i * 11 + 205) * 130;
    cloud.scale.set(scale * (1.5 + deterministicUnit(i * 11 + 206)), scale, 1);
    cloudGroup.add(cloud);
  }

  // ── Desert ground (PBR sand) ──────────────────────────────────────
  const textureLoader = new THREE.TextureLoader();
  const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 16;
  const configureGroundMap = (texture: THREE.Texture, color = false) => {
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(100, 100);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = maxAniso;
    return texture;
  };
  const sandMat = new THREE.MeshStandardMaterial({
    map: configureGroundMap(textureLoader.load('/textures/sand_pbr/GroundSand005_COL_1K.jpg'), true),
    normalMap: configureGroundMap(textureLoader.load('/textures/sand_pbr/GroundSand005_NRM_1K.jpg')),
    aoMap: configureGroundMap(textureLoader.load('/textures/sand_pbr/GroundSand005_AO_1K.jpg')),
    bumpMap: configureGroundMap(textureLoader.load('/textures/sand_pbr/GroundSand005_BUMP_1K.jpg')),
    color: 0xffffff,
    roughness: 0.82,
    bumpScale: 0.035,
    metalness: 0.02,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), sandMat);
  // aoMap needs a second UV set; reuse the primary uv attribute.
  floor.geometry.setAttribute(
    'uv2',
    new THREE.BufferAttribute((floor.geometry.attributes.uv as THREE.BufferAttribute).array, 2),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
  const grid = new THREE.GridHelper(2000, 200, 0xe2bc72, 0xb78945);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.18;
  scene.add(grid);

  // ── Desert rocks (180 deterministic) ──────────────────────────────
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.85, metalness: 0.05 });
  const rockDarkMat = new THREE.MeshStandardMaterial({ color: 0x6b5740, roughness: 0.9, metalness: 0.05 });
  for (let i = 0; i < 180; i++) {
    const angle = deterministicUnit(i * 3 + 1) * Math.PI * 2;
    const radius = 8 + deterministicUnit(i * 3 + 2) ** 0.65 * 420;
    const s = 0.18 + deterministicUnit(i * 3 + 3) * 0.85;
    const squash = 0.35 + deterministicUnit(i * 3 + 4) * 0.35;
    const yaw = deterministicUnit(i * 3 + 5) * Math.PI;
    const tint = deterministicUnit(i * 3 + 6);
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(s, 1),
      tint > 0.45 ? rockMat : rockDarkMat,
    );
    const [rx, rz] = clearOfRunway(Math.cos(angle) * radius, Math.sin(angle) * radius, aircraft, s);
    rock.position.set(rx, s * 0.3, rz);
    rock.scale.set(1.0 + tint * 0.7, squash, 0.8 + tint * 0.6);
    rock.rotation.set(0.08 + tint * 0.18, yaw, 0.04 + tint * 0.12);
    scene.add(rock);
  }

  // ── Cacti (85 deterministic) ──────────────────────────────────────
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x2f6b35, roughness: 0.82, metalness: 0.02 });
  for (let i = 0; i < 85; i++) {
    const angle = deterministicUnit(i * 7 + 101) * Math.PI * 2;
    const radius = 20 + deterministicUnit(i * 7 + 102) ** 0.7 * 460;
    const h = 0.7 + deterministicUnit(i * 7 + 103) * 1.6;
    const yaw = deterministicUnit(i * 7 + 104) * Math.PI * 2;
    const arms = deterministicUnit(i * 7 + 105) > 0.35;
    const side = deterministicUnit(i * 7 + 106) > 0.5 ? 1 : -1;
    const armScale = 0.55 + deterministicUnit(i * 7 + 107) * 0.6;

    const cactus = new THREE.Group();
    const [cx, cz] = clearOfRunway(Math.cos(angle) * radius, Math.sin(angle) * radius, aircraft, 0.5);
    cactus.position.set(cx, 0, cz);
    cactus.rotation.y = yaw;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, h, 8), cactusMat);
    trunk.position.y = h / 2;
    cactus.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), cactusMat);
    top.position.y = h;
    cactus.add(top);

    if (arms) {
      const armY = h * 0.45;
      const armOut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.07, 0.42 * armScale, 7),
        cactusMat,
      );
      armOut.rotation.z = (side * Math.PI) / 2;
      armOut.position.set(side * 0.22 * armScale, armY, 0);
      cactus.add(armOut);

      const armUpH = 0.38 * armScale;
      const armUp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, armUpH, 7),
        cactusMat,
      );
      armUp.position.set(side * 0.42 * armScale, armY + armUpH / 2, 0);
      cactus.add(armUp);
      const armTop = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5), cactusMat);
      armTop.position.set(side * 0.42 * armScale, armY + armUpH, 0);
      cactus.add(armTop);
    }
    scene.add(cactus);
  }

  // ── Cognipilot landing pad ────────────────────────────────────────
  addLandingPad(scene, aircraft);

  // ── Kangaroo (Poly by Google, CC-BY 3.0) — kept from prior desert ─
  {
    const loader = new GLTFLoader();
    loader.load('/models/kangaroo.glb', (gltf) => {
      const roo = gltf.scene;
      const [rx, rz] = clearOfRunway(7, -5, aircraft, 2);
      roo.position.set(rx, 0.69, rz);
      roo.rotation.y = -0.8;
      roo.scale.set(0.01, 0.01, 0.01);
      scene.add(roo);
    });
  }
}
