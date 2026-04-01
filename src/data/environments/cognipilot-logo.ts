import * as THREE from 'three';

/**
 * Add the Rumoca logo as a landing pad on the ground at the origin.
 */
export function addLandingPad(scene: THREE.Scene): void {
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
