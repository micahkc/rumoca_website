import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import RealTimeViewer from './RealTimeViewer';
import HUD from './HUD';
import FlightHud from './FlightHud';
import ControlsHelp from './ControlsHelp';
import ConfigPanel, { type EnvironmentType, type AircraftType } from './ConfigPanel';
import { InputManager, type RCState, type InputMode } from '../../lib/input-manager';
import type { SimulationSource } from '../../lib/simulation-source';
import { SimClient } from '../../lib/sim-client';
import { setupDesertEnvironment } from '../../data/environments/desert';
import { setupForestEnvironment } from '../../data/environments/forest';
import { setupArcticEnvironment } from '../../data/environments/arctic';
import type { AircraftRenderer } from '../../data/aircraft/types';
import { createQuadrotor } from '../../data/aircraft/quadrotor';
import { createFixedWing } from '../../data/aircraft/fixedwing';
import { createRover } from '../../data/aircraft/rover';
import { QUADROTOR_ACRO_MODEL, QUADROTOR_ACRO_MODEL_NAME } from '../../data/aircraft/quadrotor-acro-model';
import { ROVER_MODEL, ROVER_MODEL_NAME } from '../../data/aircraft/rover-model';
import {
  FIXEDWING_CONTROLLER_MODEL,
  FIXEDWING_MODEL_NAME,
} from '../../data/aircraft/fixedwing-controller-model';

type EnvironmentSetup = (
  scene: THREE.Scene,
  renderer?: THREE.WebGLRenderer | null,
  aircraft?: AircraftType,
) => void;

const ENV_SETUP: Record<EnvironmentType, EnvironmentSetup> = {
  desert: setupDesertEnvironment,
  forest: setupForestEnvironment,
  arctic: setupArcticEnvironment,
};

const AIRCRAFT_FACTORY: Record<AircraftType, (scene: THREE.Scene) => AircraftRenderer> = {
  quadrotor: createQuadrotor,
  fixedwing: createFixedWing,
  rover: createRover,
};

const TRACKED_NAMES: Record<AircraftType, string[]> = {
  quadrotor: [
    'position[1]', 'position[2]', 'position[3]',
    'quat[1]', 'quat[2]', 'quat[3]', 'quat[4]',
    'velocity[1]', 'velocity[2]', 'velocity[3]',
    'omega_m[1]', 'omega_m[2]', 'omega_m[3]', 'omega_m[4]',
  ],
  fixedwing: [
    'position[1]', 'position[2]', 'position[3]',
    'velocity[1]', 'velocity[2]', 'velocity[3]',
    'quat[1]', 'quat[2]', 'quat[3]', 'quat[4]',
    'gyro[1]', 'gyro[2]', 'gyro[3]',
    'ail_rad', 'elev_rad', 'rud_rad', 'thr_out',
    'airspeed', 'alpha_deg',
  ],
  rover: [
    'x', 'y', 'theta', 'wheel_rpm', 'front_wheel_yaw',
  ],
};

function getModelConfig(aircraft: AircraftType): {
  source: string;
  name: string;
  solver?: string;
} {
  if (aircraft === 'fixedwing') {
    return { source: FIXEDWING_CONTROLLER_MODEL, name: FIXEDWING_MODEL_NAME, solver: 'rk-like' };
  }
  if (aircraft === 'rover') {
    return { source: ROVER_MODEL, name: ROVER_MODEL_NAME };
  }
  return { source: QUADROTOR_ACRO_MODEL, name: QUADROTOR_ACRO_MODEL_NAME, solver: 'rk-like' };
}

function applyInputs(
  source: SimulationSource,
  rc: RCState,
  aircraft: AircraftType,
  armed: boolean,
) {
  if (aircraft === 'rover') {
    source.setInput('throttle', rc.throttle);
    source.setInput('steering', rc.roll);
    return;
  }
  source.setInput('stick_roll', rc.roll);
  source.setInput('stick_pitch', rc.pitch);
  source.setInput('stick_yaw', rc.yaw);
  source.setInput('stick_throttle', rc.throttle);
  source.setInput('armed', armed ? 1.0 : 0.0);
}

function getCameraTarget(source: SimulationSource, aircraft: AircraftType): THREE.Vector3 {
  if (aircraft === 'fixedwing') {
    // World (FLU) → three: tx=py, ty=pz, tz=px (see createFixedWing).
    return new THREE.Vector3(
      source.get('position[2]') ?? 0,
      source.get('position[3]') ?? 0,
      source.get('position[1]') ?? 0,
    );
  }
  if (aircraft === 'rover') {
    return new THREE.Vector3(
      source.get('x') ?? 0,
      0.15,
      source.get('y') ?? 0,
    );
  }
  return new THREE.Vector3(
    -(source.get('position[2]') ?? 0),
    source.get('position[3]') ?? 0,
    source.get('position[1]') ?? 0,
  );
}

/** Vehicle heading (three.js azimuth, so that `angle = heading + π` sits the
 *  chase camera behind it), or null for the rover. The fixed wing flies level
 *  under its FBW, so its nose-forward azimuth is stable; the acro quadrotor
 *  pitches hard, so we take a pitch-invariant yaw from the body-left axis
 *  (matches the rumoca quadrotor scene) — otherwise the camera swings to the
 *  side whenever the quad pitches to translate. */
function getVehicleHeading(source: SimulationSource, aircraft: AircraftType): number | null {
  if (aircraft === 'rover') return null;
  const q0 = source.get('quat[1]') ?? 1;
  const q1 = source.get('quat[2]') ?? 0;
  const q2 = source.get('quat[3]') ?? 0;
  const q3 = source.get('quat[4]') ?? 0;
  if (aircraft === 'fixedwing') {
    // Nose-forward azimuth: forward (+X body) → three (R21, _, R11).
    const R11 = 1 - 2 * (q2 * q2 + q3 * q3);
    const R21 = 2 * (q1 * q2 + q0 * q3);
    return Math.atan2(R21, R11);
  }
  // Quadrotor: the drone.glb's visual nose points along body +Y (so chasing
  // body +X put the camera beside it). Use the +Y axis mapped to three.js as
  // the nose azimuth; this also stays put under pitch (the dominant acro
  // motion), so the camera doesn't swing when the quad pitches to translate.
  const R12 = 2 * (q1 * q2 - q0 * q3);
  const R22 = 1 - 2 * (q1 * q1 + q3 * q3);
  return Math.atan2(R22, -R12);
}

function defaultCameraForAircraft(ac: AircraftType): { dist: number; angle: number; elev: number; target: THREE.Vector3 } {
  if (ac === 'fixedwing') return { dist: 7, angle: 0.8, elev: 0.35, target: new THREE.Vector3(0, 1, 0) };
  if (ac === 'rover') return { dist: 3.5, angle: Math.PI, elev: 0.4, target: new THREE.Vector3(0, 0.15, 0) };
  return { dist: 4, angle: 0.8, elev: 0.5, target: new THREE.Vector3(0, 0, 0) };
}

function aircraftLabel(ac: AircraftType): string {
  if (ac === 'rover') return 'Rover';
  if (ac === 'fixedwing') return 'Fixed Wing';
  return 'Quadrotor';
}

function compileNote(ac: AircraftType): string {
  if (ac === 'rover') return 'The rover compiles almost instantly.';
  if (ac === 'fixedwing') return '~2 s for the closed-loop fixed wing.';
  return '~8 s for the closed-loop quadrotor.';
}

type CompileStatus = 'idle' | 'compiling' | 'running' | 'error';

export default function SimulationApp() {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const clientRef = useRef<SimClient | null>(null);
  const sourceRef = useRef<SimulationSource | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const aircraftRef = useRef<AircraftRenderer | null>(null);
  const animRef = useRef<number>(0);

  const camAngleRef = useRef(0.8);
  const camElevRef = useRef(0.5);
  const camDistRef = useRef(4);
  const camTargetRef = useRef(new THREE.Vector3(0, 1, 0));
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const [environment, setEnvironment] = useState<EnvironmentType>('desert');
  const [aircraftType, setAircraftType] = useState<AircraftType>('quadrotor');
  const [started, setStarted] = useState(false);
  const [compileStatus, setCompileStatus] = useState<CompileStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const [rc, setRc] = useState<RCState>({ throttle: 0, pitch: 0, roll: 0, yaw: 0 });
  const [inputMode, setInputMode] = useState<InputMode>('keyboard');
  const [armed, setArmed] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [, setHudTick] = useState(0);

  const aircraftTypeRef = useRef(aircraftType);
  aircraftTypeRef.current = aircraftType;

  const clearScene = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (let i = scene.children.length - 1; i >= 0; i--) {
      const child = scene.children[i];
      if (!(child instanceof THREE.Camera)) {
        scene.remove(child);
      }
    }
    scene.fog = null;
    scene.background = null;
    scene.environment = null;
  }, []);

  /** Rebuild the Three.js scene (env + aircraft renderer) without touching the
   *  WasmStepper. Cheap (~50 ms). Triggered on env or aircraft change. */
  const buildVisuals = useCallback((env: EnvironmentType, ac: AircraftType) => {
    const scene = sceneRef.current;
    if (!scene) return;
    aircraftRef.current?.dispose();
    aircraftRef.current = null;
    clearScene();
    ENV_SETUP[env](scene, rendererRef.current, ac);
    aircraftRef.current = AIRCRAFT_FACTORY[ac](scene);
    const camDefaults = defaultCameraForAircraft(ac);
    camDistRef.current = camDefaults.dist;
    camAngleRef.current = camDefaults.angle;
    camElevRef.current = camDefaults.elev;
    camTargetRef.current.copy(camDefaults.target);
  }, [clearScene]);

  /** Spawn a worker, compile the model for the chosen aircraft, subscribe to
   *  its variables, and start the step loop. Expensive (~7 s for quadrotor).
   *  Triggered on aircraft change. */
  const buildSimulation = useCallback(async (ac: AircraftType) => {
    setCompileStatus('compiling');
    setErrorMessage('');

    clientRef.current?.dispose();
    clientRef.current = null;
    sourceRef.current = null;

    const client = new SimClient();
    clientRef.current = client;
    sourceRef.current = client;
    const modelCfg = getModelConfig(ac);

    try {
      await client.compile(modelCfg.source, modelCfg.name, modelCfg.solver);
    } catch (e: any) {
      if (clientRef.current !== client) return;
      setCompileStatus('error');
      setErrorMessage(e?.message || String(e));
      return;
    }
    if (clientRef.current !== client) return;

    client.subscribe(TRACKED_NAMES[ac]);
    client.start();
    setCompileStatus('running');

    if (!inputRef.current) inputRef.current = new InputManager();
    inputRef.current.setProfile(ac);
    inputRef.current.zeroSticks();
  }, []);

  // Build visuals when env or aircraft changes — no recompile on env switch.
  useEffect(() => {
    if (!started) return;
    buildVisuals(environment, aircraftType);
  }, [started, environment, aircraftType, buildVisuals]);

  // (Re)compile only when the aircraft changes.
  useEffect(() => {
    if (!started) return;
    buildSimulation(aircraftType);
  }, [started, aircraftType, buildSimulation]);

  // Animate loop — runs continuously while started, reads from refs.
  useEffect(() => {
    if (!started) return;
    const animate = () => {
      animRef.current = requestAnimationFrame(animate);

      const input = inputRef.current;
      const source = sourceRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const scene = sceneRef.current;
      const aircraft = aircraftRef.current;
      if (!input || !source || !renderer || !camera || !scene || !aircraft) return;

      input.update();

      if (input.resetRequested) {
        input.resetRequested = false;
        input.zeroSticks();
        source.reset();
        aircraft.reset();
        const reset = defaultCameraForAircraft(aircraftTypeRef.current);
        camTargetRef.current.copy(reset.target);
      }

      applyInputs(source, input.rc, aircraftTypeRef.current, input.armed);
      // Worker steps internally; no source.step() needed.

      aircraft.update(source, 0.016);

      const snow = scene.getObjectByName('snowParticles');
      if (snow?.userData.update) snow.userData.update();
      const trex = scene.getObjectByName('trex');
      if (trex?.userData.update) trex.userData.update();

      const target = camTargetRef.current;
      target.copy(getCameraTarget(source, aircraftTypeRef.current));
      const dist = camDistRef.current;
      const elev = camElevRef.current;
      // HUD view locks the azimuth behind the vehicle (chase cam); otherwise the
      // mouse-controlled angle lets the user orbit freely.
      let angle = camAngleRef.current;
      if (input.hudVisible && aircraftTypeRef.current !== 'rover') {
        const heading = getVehicleHeading(source, aircraftTypeRef.current);
        if (heading != null) {
          angle = heading + Math.PI;
          // Keep the stored orbit angle in sync so turning HUD view off resumes
          // from behind the vehicle rather than snapping to a stale angle.
          camAngleRef.current = angle;
        }
      }
      camera.position.set(
        target.x + dist * Math.sin(angle) * Math.cos(elev),
        target.y + dist * Math.sin(elev),
        target.z + dist * Math.cos(angle) * Math.cos(elev),
      );
      camera.lookAt(target);

      scene.children.forEach((child) => {
        if (child.userData.followCamera) child.position.copy(camera.position);
      });

      renderer.render(scene, camera);

      setRc({ ...input.rc });
      setInputMode(input.inputMode);
      setArmed(input.armed);
      setHudVisible(input.hudVisible);
      setHudTick((t) => t + 1);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [started]);

  // Unmount cleanup — terminates the worker (cancels in-flight compile).
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      clientRef.current?.dispose();
      clientRef.current = null;
      sourceRef.current = null;
      aircraftRef.current?.dispose();
      aircraftRef.current = null;
      inputRef.current?.dispose();
      inputRef.current = null;
    };
  }, []);

  // Mouse-orbit handlers — wired once started.
  useEffect(() => {
    if (!started) return;
    const checkInterval = setInterval(() => {
      const el = rendererRef.current?.domElement;
      if (!el) return;
      clearInterval(checkInterval);

      const onWheel = (e: WheelEvent) => {
        camDistRef.current = Math.max(1, Math.min(40, camDistRef.current + e.deltaY * 0.005));
      };
      const onMouseDown = (e: MouseEvent) => {
        draggingRef.current = true;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      };
      const onMouseUp = () => { draggingRef.current = false; };
      const onMouseMove = (e: MouseEvent) => {
        if (!draggingRef.current) return;
        camAngleRef.current -= (e.clientX - lastMouseRef.current.x) * 0.005;
        camElevRef.current = Math.max(
          -1.2,
          Math.min(1.5, camElevRef.current + (e.clientY - lastMouseRef.current.y) * 0.005),
        );
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      };

      el.addEventListener('wheel', onWheel);
      el.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('mousemove', onMouseMove);
    }, 200);
    return () => clearInterval(checkInterval);
  }, [started]);

  const handleStop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    clientRef.current?.dispose();
    clientRef.current = null;
    sourceRef.current = null;
    aircraftRef.current?.dispose();
    aircraftRef.current = null;
    clearScene();
    setStarted(false);
    setCompileStatus('idle');
  }, [clearScene]);

  const [showAttribution, setShowAttribution] = useState(false);

  // ─── Setup view ──────────────────────────────────────────────────────────
  if (!started) {
    return (
      <SetupView
        environment={environment}
        aircraft={aircraftType}
        onEnvironmentChange={setEnvironment}
        onAircraftChange={setAircraftType}
        onStart={() => setStarted(true)}
      />
    );
  }

  // ─── Simulation view ─────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <style>{`
        @keyframes sim-spin { to { transform: rotate(360deg); } }
      `}</style>
      <RealTimeViewer
        rendererRef={rendererRef}
        sceneRef={sceneRef}
        cameraRef={cameraRef}
      />
      {(compileStatus === 'compiling' || compileStatus === 'error') && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(2px)',
            color: '#eee',
            fontFamily: 'monospace',
            fontSize: 13,
            zIndex: 15,
          }}
        >
          {compileStatus === 'compiling' ? (
            <>
              <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: 'sim-spin 0.9s linear infinite' }}>
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(232,200,64,0.2)" strokeWidth="4" />
                <path d="M 24 4 A 20 20 0 0 1 44 24" fill="none" stroke="#e8c840" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <div style={{ color: '#e8c840', fontWeight: 'bold' }}>Compiling {aircraftLabel(aircraftType)}…</div>
              <div style={{ color: '#a89070', fontSize: 11, maxWidth: 360, textAlign: 'center' }}>
                {compileNote(aircraftType)} The page stays responsive — click any nav link to cancel.
              </div>
              <button
                onClick={handleStop}
                style={{
                  marginTop: 10,
                  padding: '6px 14px',
                  background: 'transparent',
                  color: '#a89070',
                  border: '1px solid rgba(168,144,112,0.5)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <div style={{ color: '#ff7a5c', fontWeight: 'bold' }}>Compile failed</div>
              <pre style={{
                color: '#a89070', maxWidth: 520, fontSize: 11, whiteSpace: 'pre-wrap',
                background: 'rgba(0,0,0,0.4)', padding: 10, borderRadius: 6,
              }}>{errorMessage}</pre>
              <button
                onClick={handleStop}
                style={{
                  padding: '6px 14px',
                  background: '#e8c840',
                  color: '#000',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
              >
                Back to Setup
              </button>
            </>
          )}
        </div>
      )}
      <HUD
        source={sourceRef.current}
        rc={rc}
        inputMode={inputMode}
        status={aircraftLabel(aircraftType)}
        armed={aircraftType === 'rover' ? undefined : armed}
      />
      <ConfigPanel
        environment={environment}
        aircraft={aircraftType}
        onEnvironmentChange={setEnvironment}
        onAircraftChange={setAircraftType}
        loading={compileStatus === 'compiling'}
      />
      {aircraftType !== 'rover' && (
        <FlightHud
          visible={hudVisible}
          sourceRef={sourceRef}
          inputRef={inputRef}
          aircraftType={aircraftType}
        />
      )}
      <ControlsHelp inputMode={inputMode} profile={aircraftType} />
      <button
        onClick={handleStop}
        style={{
          position: 'absolute',
          top: 76,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '4px 12px',
          background: 'rgba(30,20,10,0.75)',
          color: '#a89070',
          border: '1px solid rgba(200,160,80,0.2)',
          borderRadius: 6,
          fontFamily: 'monospace',
          fontSize: 11,
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
          zIndex: 12,
        }}
        title="Return to setup"
      >
        ← Setup
      </button>
      {aircraftType !== 'rover' && (
        <button
          onClick={() => {
            const input = inputRef.current;
            if (!input) return;
            input.hudVisible = !input.hudVisible;
            setHudVisible(input.hudVisible);
          }}
          style={{
            position: 'absolute',
            top: 108,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 12px',
            background: hudVisible ? 'rgba(94,255,190,0.16)' : 'rgba(30,20,10,0.75)',
            color: hudVisible ? 'rgba(94,255,190,0.92)' : '#a89070',
            border: `1px solid ${hudVisible ? 'rgba(94,255,190,0.5)' : 'rgba(200,160,80,0.2)'}`,
            borderRadius: 6,
            fontFamily: 'monospace',
            fontSize: 11,
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            zIndex: 12,
            whiteSpace: 'nowrap',
          }}
          title="Toggle HUD view: chase camera locked behind the vehicle (on) vs. free orbit (off). Shortcut: H"
        >
          HUD view: {hudVisible ? 'ON' : 'OFF'}
        </button>
      )}
      <button
        onClick={() => setShowAttribution(!showAttribution)}
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.3)',
          background: 'rgba(0,0,0,0.5)',
          color: 'rgba(255,255,255,0.7)',
          fontSize: 14,
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}
        title="Attribution"
      >
        i
      </button>
      {showAttribution && (
        <div
          style={{
            position: 'absolute',
            bottom: 44,
            left: 10,
            background: 'rgba(0,0,0,0.8)',
            color: 'rgba(255,255,255,0.9)',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            maxWidth: 320,
            zIndex: 20,
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Asset Credits</div>
          <div>"Drone" by Cafitz3D (CC-BY 4.0)</div>
          <div>"arid2 skybox" by skiingpenguins (CC-BY-SA 3.0)</div>
          <div>Forest &amp; arctic skies by Poly Haven (CC0)</div>
          <div>Ground textures (sand, grass, snow) by ambientCG (CC0)</div>
          <div>"T-Rex" by Quaternius (CC0 1.0)</div>
          <div>"Black Bear", "Kangaroo", "Penguin", "Igloo" by Poly by Google (CC-BY 3.0)</div>
          <div>"Buggy" by Nick Slough (CC-BY 3.0)</div>
          <div style={{ marginTop: 6, opacity: 0.6, fontSize: 11 }}>
            Procedural models from <a href="https://poly.pizza" target="_blank" rel="noopener noreferrer" style={{ color: '#88bbff' }}>poly.pizza</a>
          </div>
        </div>
      )}
    </div>
  );
}

interface SetupViewProps {
  environment: EnvironmentType;
  aircraft: AircraftType;
  onEnvironmentChange: (env: EnvironmentType) => void;
  onAircraftChange: (ac: AircraftType) => void;
  onStart: () => void;
}

function SetupView({
  environment,
  aircraft,
  onEnvironmentChange,
  onAircraftChange,
  onStart,
}: SetupViewProps) {
  const optionClass = (selected: boolean) =>
    [
      'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
      selected
        ? 'bg-accent/10 border-accent text-accent'
        : 'bg-surface-light border-border text-text-muted hover:text-text hover:border-text-muted',
    ].join(' ');

  return (
    <div className="w-full h-full flex items-center justify-center px-4 py-8 bg-bg overflow-y-auto">
      <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-text mb-2">Choose a vehicle</h1>
        <p className="text-text-muted text-sm leading-relaxed mb-8">
          The Modelica model compiles in a background worker when you press Start — the page stays
          responsive, and you can cancel by clicking any nav link. The closed-loop quadrotor and fixed
          wing take a few seconds. The rover is nearly instant.
        </p>

        <div className="space-y-6">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              Environment
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(['desert', 'forest', 'arctic'] as EnvironmentType[]).map((env) => (
                <button
                  key={env}
                  onClick={() => onEnvironmentChange(env)}
                  className={optionClass(environment === env)}
                 
                >
                  {env.charAt(0).toUpperCase() + env.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              Aircraft
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(['quadrotor', 'fixedwing', 'rover'] as AircraftType[]).map((ac) => (
                <button
                  key={ac}
                  onClick={() => onAircraftChange(ac)}
                  className={optionClass(aircraft === ac)}
                 
                >
                  {ac === 'fixedwing' ? 'Fixed Wing' : ac.charAt(0).toUpperCase() + ac.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onStart}
            className="w-full mt-2 px-4 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-bold text-base transition-colors"
           
          >
            Start Simulation →
          </button>
        </div>
      </div>
    </div>
  );
}
