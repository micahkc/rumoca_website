import * as THREE from 'three';

// Shared atmosphere/realism helpers used by the forest and arctic environments
// to reach parity with desert.ts (photographic equirectangular sky, PBR ground,
// camera-following horizon haze, and a high cloud layer). Kept separate so the
// two scenes don't each duplicate the ~130 lines desert.ts carries inline.

export function deterministicUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Loads an equirectangular JPG as the scene background and, when a renderer is
 * available, pre-filters it through PMREM so it also lights the scene as a
 * soft environment map (subtle PBR reflections on props/aircraft).
 */
export function addEquirectSky(
  scene: THREE.Scene,
  url: string,
  renderer?: THREE.WebGLRenderer | null,
): void {
  const texture = new THREE.TextureLoader().load(url, (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
    if (renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose();
    }
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
}

export interface HorizonOptions {
  hazeColor: number;
  groundColor: number;
  /** Peak opacity of the haze band (0 disables it). Default 0.84. */
  hazeStrength?: number;
  /**
   * Whether to add the lower-sky occluder sphere. This sphere covers the
   * background below the horizon, so disable it when the sky image itself has
   * content there worth seeing (e.g. snowy mountains on the horizon). Default true.
   */
  occluder?: boolean;
}

/**
 * Two camera-following shader spheres that fake atmospheric depth: a haze band
 * that brightens the lower sky toward the horizon, plus an optional occluder
 * that blends the haze down into the ground color. Ported from desert.ts.
 */
export function addHorizonHaze(scene: THREE.Scene, opts: HorizonOptions): void {
  const { hazeColor, groundColor, hazeStrength = 0.84, occluder = true } = opts;
  const horizonHaze = new THREE.Mesh(
    new THREE.SphereGeometry(460, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: {
        hazeColor: { value: new THREE.Color(hazeColor) },
        maxAlpha: { value: hazeStrength },
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
        uniform vec3 hazeColor;
        uniform float maxAlpha;
        varying vec3 vWorldDir;
        void main() {
          float lowerSky = 1.0 - smoothstep(0.04, 0.30, vWorldDir.y);
          float horizonCore = 1.0 - smoothstep(0.02, 0.16, abs(vWorldDir.y));
          float alpha = max(0.12 * horizonCore, maxAlpha * lowerSky);
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
  horizonHaze.userData.followCamera = true;
  scene.add(horizonHaze);

  if (!occluder) return;
  const lowerSkyOccluder = new THREE.Mesh(
    new THREE.SphereGeometry(450, 64, 24),
    new THREE.ShaderMaterial({
      uniforms: {
        groundColor: { value: new THREE.Color(groundColor) },
        hazeColor: { value: new THREE.Color(hazeColor) },
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

/** Scatters deterministic billboard clouds in a ring high above the scene. */
export function addHighClouds(scene: THREE.Scene, tint = 0xffffff): void {
  const cloudTexture = createCloudTexture();
  const cloudGroup = new THREE.Group();
  cloudGroup.name = 'cloud_layer';
  scene.add(cloudGroup);
  for (let i = 0; i < 36; i++) {
    const angle = deterministicUnit(i * 11 + 201) * Math.PI * 2;
    const radius = 220 + deterministicUnit(i * 11 + 202) * 760;
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTexture,
      color: tint,
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
}

/**
 * A ring of distant, smooth, snow-capped mountains sitting on the horizon — a
 * "winter Alaska" backdrop. Deliberately far (radius ~360-450) and gently
 * noised rather than the close, harshly-jittered cones it replaces; fog and the
 * environment map fade them into atmospheric depth.
 */
export function addSnowMountains(scene: THREE.Scene): void {
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xeaf1fb, roughness: 0.96, metalness: 0.0 });
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xbcc9dc, roughness: 0.96, metalness: 0.0 });
  const range = new THREE.Group();
  range.name = 'snow_mountains';
  const COUNT = 34;
  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * Math.PI * 2 + (deterministicUnit(i * 5 + 1) - 0.5) * 0.14;
    const radius = 360 + deterministicUnit(i * 5 + 2) * 90;     // 360..450
    const h = 70 + deterministicUnit(i * 5 + 3) * 95;           // 70..165
    const w = 130 + deterministicUnit(i * 5 + 4) * 120;         // base 130..250 -> heavy overlap
    const geo = new THREE.ConeGeometry(w, h, 18, 4);
    // Gentle, smooth perturbation for a natural ridgeline (not jagged spikes).
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      if (pos.getY(v) < h / 2 - 1) {
        const n = Math.sin(v * 2.3 + i) * 0.06 + Math.sin(v * 0.7 + i * 1.7) * 0.05;
        pos.setX(v, pos.getX(v) * (1 + n));
        pos.setZ(v, pos.getZ(v) * (1 + n));
      }
    }
    geo.computeVertexNormals();
    const peak = new THREE.Mesh(geo, deterministicUnit(i * 5 + 5) > 0.5 ? snowMat : shadeMat);
    // Base buried below the ground plane so they read as rising from the horizon.
    peak.position.set(Math.cos(angle) * radius, h / 2 - 10, Math.sin(angle) * radius);
    peak.rotation.y = deterministicUnit(i * 5 + 6) * Math.PI;
    range.add(peak);
  }
  scene.add(range);
}

export interface GroundOptions {
  /** Directory under /public holding the COL/NRM/AO/ROUGH/BUMP maps. */
  basePath: string;
  /** Filename prefix, e.g. 'Grass004' -> Grass004_COL_1K.jpg. */
  prefix: string;
  roughness?: number;
  metalness?: number;
  bumpScale?: number;
  /** Tiling repeat across the 2000-unit plane. */
  repeat?: number;
  /** Multiplies the colour map — use to re-tint a texture (e.g. sand → dirt). */
  color?: number;
  /** Set false when the texture set has no `_ROUGH` map (uses scalar roughness). */
  useRoughnessMap?: boolean;
  gridColorA?: number;
  gridColorB?: number;
  gridOpacity?: number;
}

/**
 * Builds the large PBR ground plane (albedo + normal + AO + roughness + bump)
 * with anisotropic filtering, matching desert.ts's sand floor.
 */
export function addPbrGround(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer | null | undefined,
  opts: GroundOptions,
): void {
  const {
    basePath, prefix,
    roughness = 0.9, metalness = 0.02, bumpScale = 0.04, repeat = 100,
    color = 0xffffff, useRoughnessMap = true,
    gridColorA = 0x888888, gridColorB = 0x888888, gridOpacity = 0.12,
  } = opts;
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 16;
  const configure = (texture: THREE.Texture, color = false) => {
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = maxAniso;
    return texture;
  };
  const p = `${basePath}/${prefix}`;
  const mat = new THREE.MeshStandardMaterial({
    map: configure(loader.load(`${p}_COL_1K.jpg`), true),
    normalMap: configure(loader.load(`${p}_NRM_1K.jpg`)),
    aoMap: configure(loader.load(`${p}_AO_1K.jpg`)),
    roughnessMap: useRoughnessMap ? configure(loader.load(`${p}_ROUGH_1K.jpg`)) : null,
    bumpMap: configure(loader.load(`${p}_BUMP_1K.jpg`)),
    color,
    roughness,
    metalness,
    bumpScale,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), mat);
  // aoMap needs a second UV set; reuse the primary uv attribute.
  floor.geometry.setAttribute(
    'uv2',
    new THREE.BufferAttribute((floor.geometry.attributes.uv as THREE.BufferAttribute).array, 2),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  const grid = new THREE.GridHelper(2000, 200, gridColorA, gridColorB);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = gridOpacity;
  scene.add(grid);

  // Tight grid hugging the origin so the aircraft reads as parked on the
  // landing pad rather than floating over an empty plane.
  const innerGrid = new THREE.GridHelper(40, 40, gridColorA, gridColorB);
  (innerGrid.material as THREE.Material).transparent = true;
  (innerGrid.material as THREE.Material).opacity = Math.min(0.35, gridOpacity * 3.5);
  scene.add(innerGrid);
}
