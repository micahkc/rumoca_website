import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import RealTimeViewer from './RealTimeViewer';
import HUD from './HUD';
import FlightHud from './FlightHud';
import ControlsHelp from './ControlsHelp';
import ConfigPanel, { type EnvironmentType, type AircraftType } from './ConfigPanel';
import { InputManager, type RCState, type InputMode } from '../../lib/input-manager';
import {
  type SimulationSource,
  createWasmControllerSource,
} from '../../lib/simulation-source';
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
  TRIM_ELEV,
  TRIM_THR,
} from '../../data/aircraft/fixedwing-controller-model';

type EnvironmentSetup = (scene: THREE.Scene, renderer?: THREE.WebGLRenderer | null) => void;

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

function getModelConfig(aircraft: AircraftType): {
  source: string;
  name: string;
  solver?: string;
} {
  if (aircraft === 'fixedwing') {
    return { source: FIXEDWING_CONTROLLER_MODEL, name: FIXEDWING_MODEL_NAME };
  }
  if (aircraft === 'rover') {
    return { source: ROVER_MODEL, name: ROVER_MODEL_NAME };
  }
  // QuadrotorAcro's initial Jacobian trips diffsol's sparse-LU under BDF
  // (motor thrust ∝ ω² → zero column at ω=0); the rumoca CLI runs this
  // model with rk-like for the same reason.
  return { source: QUADROTOR_ACRO_MODEL, name: QUADROTOR_ACRO_MODEL_NAME, solver: 'rk-like' };
}

function applyInputs(
  source: SimulationSource,
  rc: RCState,
  aircraft: AircraftType,
  armed: boolean,
) {
  if (aircraft === 'fixedwing') {
    source.setInput('thr', TRIM_THR + rc.throttle * (1 - TRIM_THR));
    source.setInput('ail', rc.roll);
    source.setInput('elev', TRIM_ELEV + rc.pitch * 0.5);
    source.setInput('rud', rc.yaw * 0.5);
    return;
  }
  if (aircraft === 'rover') {
    source.setInput('throttle', rc.throttle);
    source.setInput('steering', rc.roll);
    return;
  }
  // QuadrotorAcro
  source.setInput('stick_roll', rc.roll);
  source.setInput('stick_pitch', rc.pitch);
  source.setInput('stick_yaw', rc.yaw);
  source.setInput('stick_throttle', rc.throttle);
  source.setInput('armed', armed ? 1.0 : 0.0);
}

function getCameraTarget(source: SimulationSource, aircraft: AircraftType): THREE.Vector3 {
  if (aircraft === 'fixedwing') {
    // ENU→Three: tx=px(East), ty=pz(Up), tz=-py(South)
    return new THREE.Vector3(
      source.get('px') ?? 0,
      source.get('pz') ?? 50,
      -(source.get('py') ?? 0),
    );
  }
  if (aircraft === 'rover') {
    // Rover (x, y) → Three (x, z) at ground.
    return new THREE.Vector3(
      source.get('x') ?? 0,
      0.15,
      source.get('y') ?? 0,
    );
  }
  // QuadrotorAcro: position[1..3] in FLU. Three (x,y,z)=(-py, pz, px).
  return new THREE.Vector3(
    -(source.get('position[2]') ?? 0),
    source.get('position[3]') ?? 0,
    source.get('position[1]') ?? 0,
  );
}

function defaultCameraForAircraft(ac: AircraftType): { dist: number; angle: number; elev: number; target: THREE.Vector3 } {
  if (ac === 'fixedwing') return { dist: 6, angle: 0.8, elev: 0.5, target: new THREE.Vector3(0, 50, 0) };
  if (ac === 'rover') return { dist: 3.5, angle: Math.PI, elev: 0.4, target: new THREE.Vector3(0, 0.15, 0) };
  return { dist: 4, angle: 0.8, elev: 0.5, target: new THREE.Vector3(0, 0, 0) };
}

export default function SimulationApp() {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sourceRef = useRef<SimulationSource | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const aircraftRef = useRef<AircraftRenderer | null>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number | null>(null);

  const camAngleRef = useRef(0.8);
  const camElevRef = useRef(0.5);
  const camDistRef = useRef(4);
  const camTargetRef = useRef(new THREE.Vector3(0, 1, 0));
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const [environment, setEnvironment] = useState<EnvironmentType>('desert');
  const [aircraftType, setAircraftType] = useState<AircraftType>('quadrotor');
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState('Loading...');
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
  }, []);

  const buildScene = useCallback(async (env: EnvironmentType, ac: AircraftType) => {
    const scene = sceneRef.current;
    if (!scene) return;

    setLoading(true);
    setStatus('Compiling model...');

    cancelAnimationFrame(animRef.current);

    sourceRef.current?.dispose();
    sourceRef.current = null;
    aircraftRef.current?.dispose();
    aircraftRef.current = null;

    clearScene();
    ENV_SETUP[env](scene, rendererRef.current);
    const aircraft = AIRCRAFT_FACTORY[ac](scene);
    aircraftRef.current = aircraft;

    const modelCfg = getModelConfig(ac);
    try {
      sourceRef.current = await createWasmControllerSource(
        modelCfg.source,
        modelCfg.name,
        modelCfg.solver,
      );
      setStatus(
        ac === 'rover' ? 'Rover' : ac === 'fixedwing' ? 'Fixed Wing' : 'Quadrotor (QuadrotorAcro)',
      );
    } catch (e: any) {
      setStatus(`Error: ${e.message || e}`);
      setLoading(false);
      return;
    }

    const camDefaults = defaultCameraForAircraft(ac);
    camDistRef.current = camDefaults.dist;
    camAngleRef.current = camDefaults.angle;
    camElevRef.current = camDefaults.elev;
    camTargetRef.current.copy(camDefaults.target);

    if (!inputRef.current) {
      inputRef.current = new InputManager();
    }
    inputRef.current.setProfile(ac);
    inputRef.current.zeroSticks();

    setLoading(false);
    lastTimeRef.current = null;

    const input = inputRef.current;
    const animate = (timestamp: number) => {
      animRef.current = requestAnimationFrame(animate);

      const source = sourceRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      if (!source || !renderer || !camera || !sceneRef.current) return;

      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
        return;
      }
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;

      input.update();

      if (input.resetRequested) {
        input.resetRequested = false;
        input.zeroSticks();
        // source.reset() rebuilds the stepper (~7s for QuadrotorAcro). Pause
        // the animate loop, show the loading overlay, and defer the blocking
        // call to a double-RAF so the spinner paints before the main thread
        // freezes.
        cancelAnimationFrame(animRef.current);
        setStatus('Resetting...');
        setLoading(true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              source.reset();
              aircraftRef.current?.reset();
              const reset = defaultCameraForAircraft(aircraftTypeRef.current);
              camTargetRef.current.copy(reset.target);
            } catch (e: any) {
              setStatus(`Reset failed: ${e.message || e}`);
              setLoading(false);
              return;
            }
            setStatus(
              aircraftTypeRef.current === 'rover' ? 'Rover'
                : aircraftTypeRef.current === 'fixedwing' ? 'Fixed Wing'
                : 'Quadrotor (QuadrotorAcro)',
            );
            setLoading(false);
            lastTimeRef.current = null;
            animRef.current = requestAnimationFrame(animate);
          });
        });
        return;
      }

      try {
        applyInputs(source, input.rc, aircraftTypeRef.current, input.armed);
        source.step(dt);
      } catch (e: any) {
        console.error('[SIM] step error:', e);
        setStatus(`Sim error: ${e.message || e}`);
        cancelAnimationFrame(animRef.current);
        return;
      }

      aircraftRef.current?.update(source, dt);

      // Per-environment dynamic updates.
      const snow = sceneRef.current.getObjectByName('snowParticles');
      if (snow?.userData.update) snow.userData.update();
      const trex = sceneRef.current.getObjectByName('trex');
      if (trex?.userData.update) trex.userData.update();

      // Camera follow.
      const target = camTargetRef.current;
      target.copy(getCameraTarget(source, aircraftTypeRef.current));
      const dist = camDistRef.current;
      const angle = camAngleRef.current;
      const elev = camElevRef.current;
      camera.position.set(
        target.x + dist * Math.sin(angle) * Math.cos(elev),
        target.y + dist * Math.sin(elev),
        target.z + dist * Math.cos(angle) * Math.cos(elev),
      );
      camera.lookAt(target);

      // Camera-following sky shells (horizon haze / lower sky occluder).
      sceneRef.current.children.forEach((child) => {
        if (child.userData.followCamera) child.position.copy(camera.position);
      });

      renderer.render(sceneRef.current, camera);

      setRc({ ...input.rc });
      setInputMode(input.inputMode);
      setArmed(input.armed);
      setHudVisible(input.hudVisible);
      setHudTick((t) => t + 1);
    };

    animRef.current = requestAnimationFrame(animate);
  }, [clearScene]);

  useEffect(() => {
    const timer = setTimeout(() => {
      buildScene(environment, aircraftType);
    }, 100);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animRef.current);
      inputRef.current?.dispose();
      sourceRef.current?.dispose();
      aircraftRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
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
      const onMouseUp = () => {
        draggingRef.current = false;
      };
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
  }, []);

  const handleEnvChange = useCallback((env: EnvironmentType) => {
    setEnvironment(env);
    buildScene(env, aircraftType);
  }, [aircraftType, buildScene]);

  const handleAircraftChange = useCallback((ac: AircraftType) => {
    setAircraftType(ac);
    buildScene(environment, ac);
  }, [environment, buildScene]);

  const [showAttribution, setShowAttribution] = useState(false);

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
      {loading && (
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
            pointerEvents: 'none',
          }}
        >
          <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: 'sim-spin 0.9s linear infinite' }}>
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(232,200,64,0.2)" strokeWidth="4" />
            <path d="M 24 4 A 20 20 0 0 1 44 24" fill="none" stroke="#e8c840" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <div style={{ color: '#e8c840', fontWeight: 'bold' }}>{status}</div>
          <div style={{ color: '#a89070', fontSize: 11 }}>
            First load can take ~8 s for the closed-loop quadrotor.
          </div>
        </div>
      )}
      <HUD
        source={sourceRef.current}
        rc={rc}
        inputMode={inputMode}
        status={status}
        armed={aircraftType === 'quadrotor' ? armed : undefined}
      />
      <ConfigPanel
        environment={environment}
        aircraft={aircraftType}
        onEnvironmentChange={handleEnvChange}
        onAircraftChange={handleAircraftChange}
        loading={loading}
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
          <div>GroundSand005 PBR by ambientCG (CC0)</div>
          <div>"T-Rex" by Quaternius (CC0 1.0)</div>
          <div>"Black Bear", "Kangaroo", "Penguin", "Igloo" by Poly by Google (CC-BY 3.0)</div>
          <div style={{ marginTop: 6, opacity: 0.6, fontSize: 11 }}>
            Procedural models from <a href="https://poly.pizza" target="_blank" rel="noopener noreferrer" style={{ color: '#88bbff' }}>poly.pizza</a>
          </div>
        </div>
      )}
    </div>
  );
}
