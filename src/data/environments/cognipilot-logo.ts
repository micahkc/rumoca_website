import * as THREE from 'three';

/**
 * Add the Rumoca branding at the origin. For the fixed wing this is a paved
 * runway (the aircraft does a ground roll along +Z, so it needs a strip with
 * the logo on it); for the other vehicles it's a small circular landing pad.
 */
export function addLandingPad(scene: THREE.Scene, aircraft?: string): void {
  if (aircraft === 'fixedwing') {
    addRunway(scene);
    return;
  }
  // Pad circle
  const padGeo = new THREE.CircleGeometry(0.8, 32);
  const padMat = new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.7,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.004;
  scene.add(pad);

  // Outer ring
  const ringGeo = new THREE.RingGeometry(0.75, 0.8, 32);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  scene.add(ring);

  // Logo texture
  const loader = new THREE.TextureLoader();
  loader.load('/images/rumoca.svg', (texture) => {
    texture.anisotropy = 4;
    const logoMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const logoGeo = new THREE.PlaneGeometry(0.8, 0.8);
    const logo = new THREE.Mesh(logoGeo, logoMat);
    logo.rotation.x = -Math.PI / 2;
    logo.position.y = 0.006;
    scene.add(logo);
  });
}

// Runway footprint (origin-centred, long axis +Z). Single source of truth so
// environments can keep scenery out of the corridor.
export const RUNWAY_HALF_LENGTH = 85;
export const RUNWAY_HALF_WIDTH = 5.5;

/**
 * Push a scattered scenery position clear of the fixed-wing runway corridor.
 * No-op for other aircraft (they have no runway). `clearance` is the object's
 * own half-extent so large props (hills) fully clear. Objects beyond the runway
 * ends are left alone; ones over the strip are slid sideways with a stable,
 * position-derived spread so they read as a treeline rather than a wall.
 */
export function clearOfRunway(
  x: number,
  z: number,
  aircraft: string | undefined,
  clearance = 1.5,
): [number, number] {
  if (aircraft !== 'fixedwing') return [x, z];
  const margin = RUNWAY_HALF_WIDTH + clearance + 2;
  if (Math.abs(z) < RUNWAY_HALF_LENGTH + clearance && Math.abs(x) < margin) {
    const sign = x >= 0 ? 1 : -1;
    const spread = Math.abs(Math.sin(x * 12.9898 + z * 4.1414)) * 38;
    return [sign * (margin + spread), z];
  }
  return [x, z];
}

/**
 * A paved runway centred on the origin and running along +Z (the fixed wing's
 * takeoff-roll direction), with painted edge lines, a dashed centreline,
 * threshold "piano key" bars, and the Rumoca logo near the start.
 */
function addRunway(scene: THREE.Scene): void {
  const LEN = RUNWAY_HALF_LENGTH * 2;
  const WIDTH = RUNWAY_HALF_WIDTH * 2;

  // Asphalt strip.
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2e,
    roughness: 0.92,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, LEN), asphaltMat);
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.004;
  strip.receiveShadow = true;
  scene.add(strip);

  const paintMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  const addPaint = (w: number, l: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), paintMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.005, z);
    scene.add(m);
  };

  // Solid edge lines down both sides.
  for (const side of [-1, 1]) {
    addPaint(0.35, LEN - 8, side * (WIDTH / 2 - 0.7), 0);
  }

  // Dashed centreline.
  const dash = 5;
  const gap = 5;
  const nDash = Math.floor((LEN - 24) / (dash + gap));
  for (let i = 0; i < nDash; i++) {
    const z = -((nDash - 1) * (dash + gap)) / 2 + i * (dash + gap);
    addPaint(0.45, dash, 0, z);
  }

  // Threshold "piano key" bars at each end.
  for (const end of [-1, 1]) {
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue; // gap for the centreline
      addPaint(0.9, 7, k * 1.25, end * (LEN / 2 - 8));
    }
  }

  // Rumoca logo painted on the runway near the start of the roll.
  const loader = new THREE.TextureLoader();
  loader.load('/images/rumoca.svg', (texture) => {
    texture.anisotropy = 4;
    // Rotate the logo 180° in-plane.
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI;
    // Painted-on look: a lit, matte material (so it takes the runway's shading
    // instead of glowing like a decal) blended down so the asphalt reads
    // through it, rather than a flat full-bright sticker.
    const logoMat = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8,
      roughness: 0.85,
      metalness: 0.0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), logoMat);
    logo.rotation.x = -Math.PI / 2;
    logo.position.set(0, 0.006, -10); // near the start of the takeoff roll
    scene.add(logo);
  });
}
