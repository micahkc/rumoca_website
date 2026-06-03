import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import RealTimeViewer from './RealTimeViewer';
import HUD from './HUD';
import ControlsHelp from './ControlsHelp';
import ConfigPanel, { type EnvironmentType, type AircraftType, type SimMode } from './ConfigPanel';
import { InputManager, type RCState, type InputMode } from '../../lib/input-manager';
import {
  type SimulationSource,
  AutopilotSource,
  createWasmControllerSource,
  createAutopilotSource,
} from '../../lib/simulation-source';
import { setupDesertEnvironment } from '../../data/environments/desert';
import { setupForestEnvironment } from '../../data/environments/forest';
import { setupArcticEnvironment } from '../../data/environments/arctic';
import { createQuadrotor, type AircraftRenderer } from '../../data/aircraft/quadrotor';
import { createFixedWing } from '../../data/aircraft/fixedwing';
import {
  QUADROTOR_CONTROLLER_MODEL,
  QUADROTOR_MODEL_NAME,
  MAX_THRUST,
  MAX_ANGLE,
  MAX_YAW_RATE,
} from '../../data/aircraft/quadrotor-controller-model';
import {
  FIXEDWING_CONTROLLER_MODEL,
  FIXEDWING_MODEL_NAME,
  TRIM_ELEV,
  TRIM_THR,
} from '../../data/aircraft/fixedwing-controller-model';
import { QUADROTOR_PLANT_MODEL, QUADROTOR_PLANT_MODEL_NAME } from '../../data/aircraft/quadrotor-plant-model';
import { FIXEDWING_PLANT_MODEL, FIXEDWING_PLANT_MODEL_NAME } from '../../data/aircraft/fixedwing-plant-model';
import ConnectionStatus from './ConnectionStatus';

const ENV_SETUP: Record<EnvironmentType, (scene: THREE.Scene) => void> = {
  desert: setupDesertEnvironment,
  forest: setupForestEnvironment,
  arctic: setupArcticEnvironment,
};

const AIRCRAFT_FACTORY: Record<AircraftType, (scene: THREE.Scene) => AircraftRenderer> = {
  quadrotor: createQuadrotor,
  fixedwing: createFixedWing,
};

function getModelConfig(aircraft: AircraftType, mode: SimMode) {
  if (mode === 'autopilot') {
    if (aircraft === 'fixedwing') {
      return { source: FIXEDWING_PLANT_MODEL, name: FIXEDWING_PLANT_MODEL_NAME };
    }
    return { source: QUADROTOR_PLANT_MODEL, name: QUADROTOR_PLANT_MODEL_NAME };
  }
  if (aircraft === 'fixedwing') {
    return { source: FIXEDWING_CONTROLLER_MODEL, name: FIXEDWING_MODEL_NAME };
  }
  return { source: QUADROTOR_CONTROLLER_MODEL, name: QUADROTOR_MODEL_NAME };
}

/** RC center/min/max values matching sil_config.toml */
const RC_CENTER = 1500;
const RC_MIN = 1000;
const RC_MAX = 2000;

function applyInputs(source: SimulationSource, rc: RCState, aircraft: AircraftType, armed?: boolean) {
  if (source.mode === 'autopilot') {
    // In autopilot mode, RC channels are sent to the proxy (not directly to the stepper).
    // The autopilot reads RC and computes motor/surface commands.
    const apSource = source as AutopilotSource;
    apSource.setRC({
      rc_0: RC_CENTER + Math.round(rc.roll * (RC_MAX - RC_CENTER)),     // roll
      rc_1: RC_CENTER + Math.round(rc.pitch * (RC_MAX - RC_CENTER)),    // pitch
      rc_2: RC_MIN + Math.round(rc.throttle * (RC_MAX - RC_MIN)),       // throttle
      rc_3: RC_CENTER + Math.round(rc.yaw * (RC_MAX - RC_CENTER)),      // yaw
      rc_4: armed ? RC_MAX : RC_MIN,   // arm channel
      rc_5: RC_MIN,   // aux
    });
    return;
  }
  // WASM controller mode: map sticks directly to model inputs
  if (aircraft === 'fixedwing') {
    source.setInput('thr', TRIM_THR + rc.throttle * (1 - TRIM_THR));
    source.setInput('ail', rc.roll);
    source.setInput('elev', TRIM_ELEV + rc.pitch * 0.5);
    source.setInput('rud', rc.yaw * 0.5);
  } else {
    source.setInput('cmd_thrust', MAX_THRUST * rc.throttle);
    source.setInput('cmd_roll', rc.roll * MAX_ANGLE);
    source.setInput('cmd_pitch', rc.pitch * MAX_ANGLE);
    source.setInput('cmd_yaw', rc.yaw * MAX_YAW_RATE);
  }
}

function getCameraTarget(source: SimulationSource, aircraft: AircraftType): THREE.Vector3 {
  if (aircraft === 'fixedwing') {
    // ENU→Three.js: tx=px(East), ty=pz(Up), tz=-py(South)
    return new THREE.Vector3(
      source.get('px') ?? 0,
      source.get('pz') ?? 50,
      -(source.get('py') ?? 0),
    );
  }
  // NED→Three.js: tx=py, ty=-pz, tz=px
  return new THREE.Vector3(
    source.get('py') ?? 0,
    -(source.get('pz') ?? 0),
    source.get('px') ?? 0,
  );
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

  // Camera orbit state
  const camAngleRef = useRef(0.8);
  const camElevRef = useRef(0.5);
  const camDistRef = useRef(4);
  const camTargetRef = useRef(new THREE.Vector3(0, 1, 0));
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Config state
  const [environment, setEnvironment] = useState<EnvironmentType>('desert');
  const [aircraftType, setAircraftType] = useState<AircraftType>('quadrotor');
  const [simMode, setSimMode] = useState<SimMode>('wasm-controller');
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState('Loading...');
  const [rc, setRc] = useState<RCState>({ throttle: 0, pitch: 0, roll: 0, yaw: 0 });
  const [inputMode, setInputMode] = useState<InputMode>('keyboard');
  const [hudTick, setHudTick] = useState(0);

  // Refs for current config (accessible in render loop)
  const aircraftTypeRef = useRef(aircraftType);
  aircraftTypeRef.current = aircraftType;
  const simModeRef = useRef(simMode);
  simModeRef.current = simMode;

  const clearScene = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    // Remove everything except the camera
    for (let i = scene.children.length - 1; i >= 0; i--) {
      const child = scene.children[i];
      if (!(child instanceof THREE.Camera)) {
        scene.remove(child);
      }
    }
    scene.fog = null;
    scene.background = null;
  }, []);

  const buildScene = useCallback(async (env: EnvironmentType, ac: AircraftType, mode?: SimMode) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentMode = mode ?? simModeRef.current;

    setLoading(true);
    setStatus('Compiling model...');

    // Stop current animation
    cancelAnimationFrame(animRef.current);

    // Dispose old source and aircraft
    sourceRef.current?.dispose();
    sourceRef.current = null;
    aircraftRef.current?.dispose();
    aircraftRef.current = null;

    // Clear and rebuild scene
    clearScene();
    ENV_SETUP[env](scene);
    const aircraft = AIRCRAFT_FACTORY[ac](scene);
    aircraftRef.current = aircraft;

    // Create source based on mode
    const modelCfg = getModelConfig(ac, currentMode);
    try {
      let source: SimulationSource;
      if (currentMode === 'autopilot') {
        source = await createAutopilotSource(modelCfg.source, modelCfg.name);
        setStatus('Autopilot (SIL)');
      } else {
        source = await createWasmControllerSource(modelCfg.source, modelCfg.name);
        setStatus('WASM Controller');
      }
      sourceRef.current = source;
    } catch (e: any) {
      setStatus(`Error: ${e.message || e}`);
      setLoading(false);
      return;
    }

    // Reset camera
    if (ac === 'fixedwing') {
      camTargetRef.current.set(0, 50, 0);
      camDistRef.current = 6;
    } else {
      camTargetRef.current.set(0, 0, 0);
      camDistRef.current = 4;
    }

    // Input manager (reuse existing)
    if (!inputRef.current) {
      inputRef.current = new InputManager();
    }
    inputRef.current.zeroSticks();

    setLoading(false);
    lastTimeRef.current = null;

    // Start render loop
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

      // Reset
      if (input.resetRequested) {
        input.resetRequested = false;
        input.zeroSticks();
        source.reset();
        aircraftRef.current?.reset();
        if (aircraftTypeRef.current === 'fixedwing') {
          camTargetRef.current.set(0, 50, 0);
        } else {
          camTargetRef.current.set(0, 0, 0);
        }
        lastTimeRef.current = null;
        return;
      }

      // Apply inputs
      try {
        applyInputs(source, input.rc, aircraftTypeRef.current, input.armed);
        source.step(dt);
      } catch (e: any) {
        console.error('[SIM] step error:', e);
        setStatus(`Sim error: ${e.message || e}`);
        cancelAnimationFrame(animRef.current);
        return;
      }

      // Update aircraft visuals
      aircraftRef.current?.update(source, dt);

      // Animate snow particles (arctic)
      const snow = sceneRef.current.getObjectByName('snowParticles');
      if (snow?.userData.update) snow.userData.update();

      // Animate T-Rex (forest)
      const trex = sceneRef.current.getObjectByName('trex');
      if (trex?.userData.update) trex.userData.update();

      // Camera follow – lock target directly to drone position
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

      renderer.render(sceneRef.current, camera);

      // HUD updates
      setRc({ ...input.rc });
      setInputMode(input.inputMode);
      setHudTick((t) => t + 1);
    };

    animRef.current = requestAnimationFrame(animate);
  }, [clearScene]);

  // Initialize on mount
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
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera orbit mouse handlers
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

  // Config change handlers
  const handleEnvChange = useCallback((env: EnvironmentType) => {
    setEnvironment(env);
    buildScene(env, aircraftType, simMode);
  }, [aircraftType, simMode, buildScene]);

  const handleAircraftChange = useCallback((ac: AircraftType) => {
    setAircraftType(ac);
    buildScene(environment, ac, simMode);
  }, [environment, simMode, buildScene]);

  const handleModeChange = useCallback((mode: SimMode) => {
    setSimMode(mode);
    buildScene(environment, aircraftType, mode);
  }, [environment, aircraftType, buildScene]);

  const [showAttribution, setShowAttribution] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <RealTimeViewer
        rendererRef={rendererRef}
        sceneRef={sceneRef}
        cameraRef={cameraRef}
      />
      <HUD
        source={sourceRef.current}
        rc={rc}
        inputMode={inputMode}
        status={status}
      />
      <ConfigPanel
        environment={environment}
        aircraft={aircraftType}
        mode={simMode}
        onEnvironmentChange={handleEnvChange}
        onAircraftChange={handleAircraftChange}
        onModeChange={handleModeChange}
        loading={loading}
      />
      <ControlsHelp inputMode={inputMode} />
      <ConnectionStatus
        mode={simMode}
        connected={sourceRef.current?.connected ?? false}
      />
      {/* Attribution info button */}
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
            maxWidth: 300,
            zIndex: 20,
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>3D Model Credits</div>
          <div>"T-Rex" by Quaternius (CC0 1.0)</div>
          <div>"Black Bear" by Poly by Google (CC-BY 3.0)</div>
          <div>"Kangaroo" by Poly by Google (CC-BY 3.0)</div>
          <div>"Penguin" by Poly by Google (CC-BY 3.0)</div>
          <div>"Igloo" by Poly by Google (CC-BY 3.0)</div>
          <div style={{ marginTop: 6, opacity: 0.6, fontSize: 11 }}>
            Models from <a href="https://poly.pizza" target="_blank" rel="noopener noreferrer" style={{ color: '#88bbff' }}>poly.pizza</a>
          </div>
        </div>
      )}
    </div>
  );
}
