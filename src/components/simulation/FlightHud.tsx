import { useEffect, useRef } from 'react';
import type { SimulationSource } from '../../lib/simulation-source';
import type { InputManager } from '../../lib/input-manager';
import type { AircraftType } from './ConfigPanel';

interface FlightHudProps {
  visible: boolean;
  sourceRef: React.MutableRefObject<SimulationSource | null>;
  inputRef: React.MutableRefObject<InputManager | null>;
  aircraftType: AircraftType;
}

const HUD_COLOR = 'rgba(94, 255, 190, 0.92)';
const HUD_DIM = 'rgba(94, 255, 190, 0.42)';
const TEXT_SHADOW = 'rgba(0, 0, 0, 0.75)';

interface VehicleReading {
  roll: number;    // radians, +roll = right wing down
  pitch: number;   // radians, +pitch = nose up
  altitude: number;
  speed: number;
}

function readQuat(source: SimulationSource, names: [string, string, string, string]) {
  const q0 = source.get(names[0]) ?? 1;
  const q1 = source.get(names[1]) ?? 0;
  const q2 = source.get(names[2]) ?? 0;
  const q3 = source.get(names[3]) ?? 0;
  return { q0, q1, q2, q3 };
}

function quatToRollPitch(q0: number, q1: number, q2: number, q3: number) {
  // Tait–Bryan ZYX, body-to-world. Scalar-first quaternion (w, x, y, z).
  const roll = Math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 * q1 + q2 * q2));
  const sinp = Math.max(-1, Math.min(1, 2 * (q0 * q2 - q3 * q1)));
  const pitch = Math.asin(sinp);
  return { roll, pitch };
}

function readVehicleState(
  source: SimulationSource,
  aircraftType: AircraftType,
): VehicleReading | null {
  if (aircraftType === 'quadrotor') {
    const { q0, q1, q2, q3 } = readQuat(source, ['quat[1]', 'quat[2]', 'quat[3]', 'quat[4]']);
    // drone.glb's visual nose is body +Y, so the chase view looks down +Y, not
    // the body +X that quatToRollPitch assumes. Rotate the attitude into a
    // +X-forward frame (q ⊗ q_z90) so the horizon's roll/pitch match the view
    // (otherwise they read swapped). See reference_drone_glb_nose memory.
    const c = Math.SQRT1_2;
    const v0 = c * (q0 - q3);
    const v1 = c * (q1 + q2);
    const v2 = c * (q2 - q1);
    const v3 = c * (q0 + q3);
    const { roll, pitch } = quatToRollPitch(v0, v1, v2, v3);
    const pz = source.get('position[3]') ?? 0;
    const vx = source.get('velocity[1]') ?? 0;
    const vy = source.get('velocity[2]') ?? 0;
    const vz = source.get('velocity[3]') ?? 0;
    return { roll, pitch, altitude: pz, speed: Math.hypot(vx, vy, vz) };
  }
  if (aircraftType === 'fixedwing') {
    const { q0, q1, q2, q3 } = readQuat(source, ['quat[1]', 'quat[2]', 'quat[3]', 'quat[4]']);
    const { roll, pitch } = quatToRollPitch(q0, q1, q2, q3);
    // Fixed-wing model: world frame is Z-up, altitude = position[3].
    const pz = source.get('position[3]') ?? 0;
    const speed = source.get('airspeed')
      ?? Math.hypot(
        source.get('velocity[1]') ?? 0,
        source.get('velocity[2]') ?? 0,
        source.get('velocity[3]') ?? 0,
      );
    return { roll, pitch, altitude: pz, speed };
  }
  return null; // rover has no attitude
}

function drawFlightHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  reading: VehicleReading,
  rc: { throttle: number; roll: number; pitch: number; yaw: number },
): void {
  const { roll, pitch, altitude, speed } = reading;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const pitchPxPerRad = Math.min(w, h) * 0.42;

  // Artificial horizon — rotated by -roll, slid by pitch.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  ctx.translate(0, pitch * pitchPxPerRad);
  ctx.strokeStyle = HUD_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-160, 0);
  ctx.lineTo(-35, 0);
  ctx.moveTo(35, 0);
  ctx.lineTo(160, 0);
  ctx.stroke();

  // Pitch ladder (-30° to +30°, ticks every 10°).
  ctx.strokeStyle = HUD_DIM;
  ctx.lineWidth = 1.5;
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let deg = -30; deg <= 30; deg += 10) {
    if (deg === 0) continue;
    const y = (-deg * Math.PI) / 180 * pitchPxPerRad;
    const half = Math.abs(deg) % 20 === 0 ? 72 : 45;
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.lineTo(-16, y);
    ctx.moveTo(16, y);
    ctx.lineTo(half, y);
    ctx.stroke();
    ctx.fillStyle = HUD_COLOR;
    ctx.fillText(String(Math.abs(deg)), -half - 18, y);
    ctx.fillText(String(Math.abs(deg)), half + 18, y);
  }
  ctx.restore();

  // Centered boresight / aim reticle.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = HUD_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(-6, 0);
  ctx.lineTo(0, 8);
  ctx.lineTo(6, 0);
  ctx.lineTo(18, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Roll arc at the top of the screen.
  ctx.save();
  ctx.translate(cx, 76);
  ctx.rotate(-roll);
  ctx.strokeStyle = HUD_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 54, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  for (const deg of [-45, -30, -15, 0, 15, 30, 45]) {
    const a = ((deg - 90) * Math.PI) / 180;
    const r1 = deg === 0 ? 43 : 48;
    const r2 = 56;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.restore();

  // Text labels.
  const hudText = (text: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
    ctx.font = '15px monospace';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_SHADOW;
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = HUD_COLOR;
    ctx.fillText(text, x, y);
  };

  hudText(`ALT ${altitude.toFixed(1)} m`, w - 34, cy - 40, 'right');
  hudText(`SPD ${speed.toFixed(1)} m/s`, 34, cy - 40);
  hudText(`ROLL ${((roll * 180) / Math.PI).toFixed(1)}°`, 34, cy + 44);
  hudText(`PITCH ${((pitch * 180) / Math.PI).toFixed(1)}°`, w - 34, cy + 44, 'right');
  hudText(
    `AIL ${rc.roll.toFixed(2)}  ELE ${rc.pitch.toFixed(2)}  RUD ${rc.yaw.toFixed(2)}  THR ${rc.throttle.toFixed(2)}`,
    cx,
    h - 44,
    'center',
  );
}

export default function FlightHud({
  visible,
  sourceRef,
  inputRef,
  aircraftType,
}: FlightHudProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  // Mirror prop refs into local refs so the raf loop reads the latest value
  // without needing to restart when props change.
  const sourceProp = useRef(sourceRef);
  const inputProp = useRef(inputRef);
  const aircraftProp = useRef(aircraftType);
  sourceProp.current = sourceRef;
  inputProp.current = inputRef;
  aircraftProp.current = aircraftType;

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const source = sourceProp.current.current;
      const input = inputProp.current.current;
      if (!source) {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        return;
      }
      const reading = readVehicleState(source, aircraftProp.current);
      if (!reading) {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        return;
      }
      const rc = input?.rc ?? { throttle: 0, roll: 0, pitch: 0, yaw: 0 };
      drawFlightHud(ctx, canvas.clientWidth, canvas.clientHeight, reading, rc);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 11,
      }}
    />
  );
}
