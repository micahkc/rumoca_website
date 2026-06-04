import * as THREE from 'three';
import type { SimulationSource } from '../../lib/simulation-source';
import type { AircraftRenderer } from './types';

// Sport Cub fixed-wing visualization — white/blue livery
// Adapted from /home/micah/Research/modelica_models/.rumoca/models/by-id/sportcubflight_9eb3dd6b/states_time.js
// Model frame: +X = left wing, +Y = up, +Z = forward (nose)

const MAX_TRAIL = 800;

function makeAirfoilShape(THREE_ns: typeof THREE, chord: number, maxThick: number): THREE.Shape {
  const shape = new THREE_ns.Shape();
  const tc = maxThick / chord;
  const N = 24;
  function yt(xc: number) {
    return tc * 5.0 * chord * (
      0.2969 * Math.sqrt(xc) - 0.1260 * xc
      - 0.3516 * xc * xc + 0.2843 * xc * xc * xc
      - 0.1015 * xc * xc * xc * xc
    );
  }
  const teY = yt(1.0);
  shape.moveTo(chord / 2, -teY * 0.6);
  for (let i = N - 1; i >= 0; i--) {
    const xc = i / N;
    shape.lineTo(xc * chord - chord / 2, -yt(xc) * 0.6);
  }
  for (let i = 1; i <= N; i++) {
    const xc = i / N;
    shape.lineTo(xc * chord - chord / 2, yt(xc));
  }
  shape.lineTo(chord / 2, -teY * 0.6);
  return shape;
}

function makeWingGeo(chord: number, thickness: number, spanLen: number, bevelSize?: number): THREE.ExtrudeGeometry {
  const shape = makeAirfoilShape(THREE, chord, thickness);
  const bv = bevelSize || 0;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: spanLen,
    bevelEnabled: bv > 0,
    bevelThickness: bv,
    bevelSize: bv * 0.8,
    bevelSegments: 4,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(-spanLen / 2, 0, 0);
  return geo;
}

export function createFixedWing(scene: THREE.Scene): AircraftRenderer {
  const aircraft = new THREE.Group();
  aircraft.name = 'aircraft';

  // Materials
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3, metalness: 0.01, side: THREE.DoubleSide });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x1a3f8f, roughness: 0.3, metalness: 0.02, side: THREE.DoubleSide });
  const ctrlMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.45, metalness: 0.01 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.4 });
  const strutMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.4, metalness: 0.3 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.0 });

  // Dimensions
  const wingSpan = 0.500;
  const fuseLen = 0.350;
  const wingChord = 0.085;
  const wingThick = 0.012;
  const fuseRad = 0.024;
  const innerHalf = wingSpan * 0.35;
  const ailHalf = wingSpan / 2 - innerHalf;
  const wingZ = 0.03;
  const wingY = fuseRad + wingThick * 0.3;
  const hstabSpan = 0.16;
  const hstabChord = 0.045;
  const elevChord = 0.018;
  const hstabFixedChord = hstabChord - elevChord;
  const vstabHeight = 0.065;
  const vstabChord = 0.045;
  const rudChord = 0.018;
  const vstabFixedChord = vstabChord - rudChord;
  const tailZ = -fuseLen / 2 + 0.025;
  const tailY = fuseRad * 0.15;
  const ailChord = wingChord * 0.28;

  // Fuselage — smooth split-color half-cylinders
  const fusePoints: THREE.Vector2[] = [];
  const nPts = 32;
  for (let j = 0; j <= nPts; j++) {
    const t = j / nPts;
    const z = (t - 0.5) * fuseLen;
    let r: number;
    if (t < 0.08) {
      const tn = t / 0.08;
      r = fuseRad * 0.65 + fuseRad * 0.35 * (3 * tn * tn - 2 * tn * tn * tn);
    } else if (t > 0.78) {
      const tt = (t - 0.78) / 0.22;
      r = fuseRad * (1 - 0.6 * (3 * tt * tt - 2 * tt * tt * tt));
    } else {
      const tb = (t - 0.08) / 0.70;
      r = fuseRad * (1 + 0.04 * Math.sin(tb * Math.PI));
    }
    fusePoints.push(new THREE.Vector2(r, z));
  }

  const fuseUpper = new THREE.Mesh(new THREE.LatheGeometry(fusePoints, 24, Math.PI, Math.PI), blueMat);
  fuseUpper.rotation.x = Math.PI / 2;
  aircraft.add(fuseUpper);
  const fuseLower = new THREE.Mesh(new THREE.LatheGeometry(fusePoints, 24, 0, Math.PI), whiteMat);
  fuseLower.rotation.x = Math.PI / 2;
  aircraft.add(fuseLower);

  // Cowl
  const cowlLen = fuseLen * 0.18;
  const cowlPoints: THREE.Vector2[] = [];
  for (let j = 0; j <= 14; j++) {
    const t = j / 14;
    const z = t * cowlLen;
    const tn = 1 - t;
    const r = fuseRad * 0.65 + fuseRad * 0.38 * (3 * tn * tn - 2 * tn * tn * tn);
    cowlPoints.push(new THREE.Vector2(r + 0.0008, z));
  }
  const cowl = new THREE.Mesh(new THREE.LatheGeometry(cowlPoints, 24), blueMat);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.z = fuseLen / 2 - cowlLen;
  aircraft.add(cowl);

  // Wing
  const fullWingGeo = makeWingGeo(wingChord, wingThick, wingSpan, 0.008);
  const wing = new THREE.Mesh(fullWingGeo, whiteMat);
  wing.position.set(0, wingY, wingZ);
  aircraft.add(wing);

  // Ailerons
  const wingTE = wingZ - wingChord / 2;

  const leftAilPivot = new THREE.Group();
  leftAilPivot.position.set(innerHalf, wingY, wingTE);
  const leftAil = new THREE.Mesh(new THREE.BoxGeometry(ailHalf, wingThick * 0.8, ailChord), ctrlMat);
  leftAil.position.set(ailHalf / 2, 0, -ailChord / 2);
  leftAilPivot.add(leftAil);
  aircraft.add(leftAilPivot);

  const rightAilPivot = new THREE.Group();
  rightAilPivot.position.set(-innerHalf, wingY, wingTE);
  const rightAil = new THREE.Mesh(new THREE.BoxGeometry(ailHalf, wingThick * 0.8, ailChord), ctrlMat);
  rightAil.position.set(-ailHalf / 2, 0, -ailChord / 2);
  rightAilPivot.add(rightAil);
  aircraft.add(rightAilPivot);

  // Wing struts
  for (const side of [1, -1]) {
    const pairs: number[][] = [
      [side * innerHalf * 0.55, wingY - 0.002, wingZ, side * fuseRad * 1.0, -fuseRad * 0.5, wingZ + 0.012],
      [side * innerHalf * 0.55, wingY - 0.002, wingZ - 0.03, side * fuseRad * 1.0, -fuseRad * 0.5, wingZ - 0.005],
    ];
    for (const [tx, ty, tz, bx, by, bz] of pairs) {
      const top = new THREE.Vector3(tx, ty, tz);
      const bot = new THREE.Vector3(bx, by, bz);
      const dir = new THREE.Vector3().subVectors(bot, top);
      const sLen = dir.length();
      const geo = new THREE.CylinderGeometry(0.0012, 0.0012, sLen, 6);
      const strut = new THREE.Mesh(geo, strutMat);
      strut.position.addVectors(top, bot).multiplyScalar(0.5);
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      aircraft.add(strut);
    }
  }

  // Horizontal stabilizer
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(hstabSpan, 0.005, hstabFixedChord), whiteMat);
  hstab.position.set(0, tailY, tailZ + hstabFixedChord / 2);
  aircraft.add(hstab);

  // Elevator
  const elevPivot = new THREE.Group();
  elevPivot.position.set(0, tailY, tailZ);
  const elevSurf = new THREE.Mesh(new THREE.BoxGeometry(hstabSpan, 0.004, elevChord), ctrlMat);
  elevSurf.position.set(0, 0, -elevChord / 2);
  elevPivot.add(elevSurf);
  aircraft.add(elevPivot);

  // Vertical stabilizer
  const vstab = new THREE.Mesh(new THREE.BoxGeometry(0.005, vstabHeight, vstabFixedChord), whiteMat);
  vstab.position.set(0, tailY + vstabHeight / 2, tailZ + vstabFixedChord / 2);
  aircraft.add(vstab);

  // Rudder
  const rudPivot = new THREE.Group();
  rudPivot.position.set(0, tailY, tailZ);
  const rudSurf = new THREE.Mesh(new THREE.BoxGeometry(0.004, vstabHeight, rudChord), ctrlMat);
  rudSurf.position.set(0, vstabHeight / 2, -rudChord / 2);
  rudPivot.add(rudSurf);
  aircraft.add(rudPivot);

  // Windshield
  const wsMat = new THREE.MeshStandardMaterial({
    color: 0x88bbdd, roughness: 0.02, metalness: 0.3,
    transparent: true, opacity: 0.65, side: THREE.DoubleSide,
  });
  const wsWidth = fuseRad * 1.7;
  const wsHeight = fuseRad * 1.5;
  const wsZ = wingZ + wingChord / 2 + 0.02;
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(wsWidth, wsHeight, 0.001), wsMat);
  windshield.rotation.x = -1.05;
  windshield.position.set(0, fuseRad + wsHeight * 0.2, wsZ);
  aircraft.add(windshield);

  for (const side of [1, -1]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.001, fuseRad * 0.8, fuseLen * 0.12), wsMat);
    sw.position.set(side * (fuseRad + 0.002), fuseRad * 0.5, wsZ - 0.04);
    aircraft.add(sw);
  }

  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.4 });
  const wsFrameTop = new THREE.Mesh(new THREE.BoxGeometry(wsWidth + 0.002, 0.003, 0.003), frameMat);
  wsFrameTop.rotation.x = -1.05;
  wsFrameTop.position.set(0, fuseRad + wsHeight * 0.45, wsZ - wsHeight * 0.18);
  aircraft.add(wsFrameTop);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, fuseLen * 0.15), frameMat);
  spine.position.set(0, fuseRad + 0.005, wsZ - 0.06);
  aircraft.add(spine);

  // Landing gear
  for (const side of [1, -1]) {
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.0013, 0.04, 6), strutMat);
    gear.position.set(side * 0.025, -fuseRad - 0.018, 0.03);
    gear.rotation.z = side * 0.2;
    aircraft.add(gear);

    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0035, 8, 14), tireMat);
    wheel.position.set(side * 0.035, -fuseRad - 0.035, 0.03);
    wheel.rotation.y = Math.PI / 2;
    aircraft.add(wheel);

    const wHub = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.003, 8), strutMat);
    wHub.position.set(side * 0.035, -fuseRad - 0.035, 0.03);
    wHub.rotation.x = Math.PI / 2;
    wHub.rotation.z = Math.PI / 2;
    aircraft.add(wHub);
  }

  // Tail wheel
  const twStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.018, 4), strutMat);
  twStrut.position.set(0, -fuseRad - 0.007, tailZ);
  aircraft.add(twStrut);
  const twWheel = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.002, 6, 10), tireMat);
  twWheel.position.set(0, -fuseRad - 0.015, tailZ);
  twWheel.rotation.y = Math.PI / 2;
  aircraft.add(twWheel);

  // Propeller
  const propGroup = new THREE.Group();
  propGroup.position.set(0, 0, fuseLen / 2 + 0.005);
  const bladeH = 0.055;
  const bladePitch = 0.35;
  const bladeGeo = new THREE.BoxGeometry(0.012, bladeH, 0.002);
  const b1 = new THREE.Mesh(bladeGeo, darkMat);
  b1.position.y = bladeH / 2;
  b1.rotation.y = bladePitch;
  propGroup.add(b1);
  const b2 = new THREE.Mesh(bladeGeo.clone(), darkMat);
  b2.position.y = -bladeH / 2;
  b2.rotation.y = -bladePitch;
  propGroup.add(b2);
  const pHub = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.008, 8), darkMat);
  pHub.rotation.x = Math.PI / 2;
  propGroup.add(pHub);
  aircraft.add(propGroup);

  // Spinner
  const spinner = new THREE.Mesh(new THREE.SphereGeometry(fuseRad * 0.55, 14, 10), blueMat);
  spinner.scale.set(1, 1, 0.6);
  spinner.position.set(0, 0, fuseLen / 2 + 0.008);
  aircraft.add(spinner);

  scene.add(aircraft);

  // Flight trail
  const trailPos = new Float32Array(MAX_TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: 0xcc5511, transparent: true, opacity: 0.6 }),
  );
  scene.add(trail);
  let trailCount = 0;

  // Ground shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.25, 20),
    new THREE.MeshBasicMaterial({ color: 0x3a2a10, transparent: true, opacity: 0.3 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  scene.add(shadow);

  // Coordinate frame quaternion transforms (ENU body FLU → Three.js Y-up)
  const s = Math.SQRT1_2;
  const qCoord = new THREE.Quaternion(-s, 0, 0, s);
  const qBody = new THREE.Quaternion(0.5, 0.5, 0.5, 0.5);

  return {
    group: aircraft,
    update(source: SimulationSource, dt: number): void {
      // ENU frame: px=East, py=North, pz=Up
      const px = source.get('px') ?? 0;
      const py = source.get('py') ?? 0;
      const pz = source.get('pz') ?? 50;
      const q0 = source.get('q0') ?? 1;
      const q1 = source.get('q1') ?? 0;
      const q2 = source.get('q2') ?? 0;
      const q3 = source.get('q3') ?? 0;

      // ENU to Three.js (Y-up): tx=px(East), ty=pz(Up), tz=-py(South)
      const tx = px, ty = pz, tz = -py;
      aircraft.position.set(tx, ty, tz);

      // Quaternion transform: ENU body-FLU → Three.js
      const qSim = new THREE.Quaternion(q1, q2, q3, q0);
      const qFinal = new THREE.Quaternion();
      qFinal.copy(qCoord);
      qFinal.multiply(qSim);
      qFinal.multiply(qBody);
      aircraft.quaternion.copy(qFinal);

      // Animate control surfaces
      const ail = source.get('ail_rad') ?? 0;
      const elev_val = source.get('elev_rad') ?? 0;
      const rud_val = source.get('rud_rad') ?? 0;
      const thr = source.get('thr') ?? 0;

      if (Number.isFinite(ail)) {
        leftAilPivot.rotation.x = -ail;
        rightAilPivot.rotation.x = ail;
      }
      if (Number.isFinite(elev_val)) {
        elevPivot.rotation.x = elev_val;
      }
      if (Number.isFinite(rud_val)) {
        rudPivot.rotation.y = -rud_val;
      }
      propGroup.rotation.z += thr * 7.5;

      // Trail
      const idx = trailCount % MAX_TRAIL;
      trailPos[idx * 3] = tx;
      trailPos[idx * 3 + 1] = ty;
      trailPos[idx * 3 + 2] = tz;
      trailCount++;
      trail.geometry.attributes.position.needsUpdate = true;
      trailGeo.setDrawRange(0, Math.min(trailCount, MAX_TRAIL));

      // Shadow
      shadow.position.set(tx, 0.003, tz);
      const alt = Math.max(ty, 0.01);
      const sc = Math.max(0.3, 1.0 - alt * 0.01);
      shadow.scale.set(sc, sc, 1);
      (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.02, 0.2 - alt * 0.003);
    },
    reset(): void {
      trailCount = 0;
      trailGeo.setDrawRange(0, 0);
      aircraft.position.set(0, 50, 0);
      aircraft.quaternion.identity();
    },
    dispose(): void {
      scene.remove(aircraft);
      scene.remove(trail);
      scene.remove(shadow);
      trailGeo.dispose();
    },
  };
}
