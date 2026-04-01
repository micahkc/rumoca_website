import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface SimResult {
  names: string[];
  allData: number[][];
  nStates: number;
}

interface Viewer3DPanelProps {
  result: SimResult;
  playbackIndex: number | null;
  onPlaybackIndexChange: (idx: number | null) => void;
  defaultScript?: string;
}

const DEFAULT_SCRIPT = `ctx.onInit = (api) => {
  const { THREE, state } = api;
  state.scene.background = new THREE.Color(0x101010);
  const light = new THREE.DirectionalLight(0xffffff, 1.0);
  light.position.set(2, 4, 3);
  state.scene.add(light);
  state.scene.add(new THREE.AmbientLight(0x404040, 0.9));
  state.scene.add(new THREE.GridHelper(12, 24, 0x2f4f63, 0x2a2a2a));
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x444444 })
  );
  floor.position.set(0, -0.05, 0);
  state.scene.add(floor);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0x3cb4ff })
  );
  ball.name = "ball";
  state.scene.add(ball);
  state.ball = ball;
};

ctx.onFrame = (api) => {
  const ball = api.state?.ball;
  if (ball) {
    const x = api.getValue("x", api.sampleIndex);
    const y = api.getValue("y", api.sampleIndex);
    const z = api.getValue("z", api.sampleIndex);
    ball.position.set(
      Number.isFinite(y) ? y : 0,
      Number.isFinite(x) ? x : 0,
      Number.isFinite(z) ? z : 0
    );
  }
};`;

export default function Viewer3DPanel({
  result,
  playbackIndex,
  onPlaybackIndexChange,
  defaultScript,
}: Viewer3DPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const renderLoopRef = useRef<number>(0);
  const scriptCtxRef = useRef<{ onInit: ((api: any) => void) | null; onFrame: ((api: any) => void) | null }>({ onInit: null, onFrame: null });
  const stateRef = useRef<Record<string, any>>({});

  const [scriptText, setScriptText] = useState(defaultScript ?? DEFAULT_SCRIPT);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const playbackIndexRef = useRef(playbackIndex);
  const resultRef = useRef(result);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { playbackIndexRef.current = playbackIndex; }, [playbackIndex]);
  useEffect(() => { resultRef.current = result; }, [result]);

  // Build the API object used by scripts
  const buildApi = useCallback((sampleIndex: number) => {
    const r = resultRef.current;
    const scene = sceneRef.current;
    return {
      THREE,
      state: { scene, ...stateRef.current },
      get sampleIndex() { return sampleIndex; },
      times: r.allData[0],
      getTime(idx: number) {
        return r.allData[0]?.[idx] ?? 0;
      },
      getValue(name: string, idx: number) {
        const nameIdx = r.names.indexOf(name);
        if (nameIdx === -1) return undefined;
        return r.allData[nameIdx + 1]?.[idx];
      },
    };
  }, []);

  // Initialize Three.js renderer, scene, camera
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.01, 1000);
    camera.position.set(3, 3, 3);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controlsRef.current = controls;

    // Render loop
    const animate = () => {
      renderLoopRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(renderLoopRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // Clear scene helper (keep camera)
  const clearScene = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj !== scene && !(obj instanceof THREE.Camera)) {
        toRemove.push(obj);
      }
    });
    // Remove only top-level children (not camera)
    for (let i = scene.children.length - 1; i >= 0; i--) {
      const child = scene.children[i];
      if (!(child instanceof THREE.Camera)) {
        scene.remove(child);
      }
    }
    stateRef.current = {};
  }, []);

  // Execute user script
  const runScript = useCallback(() => {
    setScriptError(null);
    clearScene();

    const ctx: { onInit: ((api: any) => void) | null; onFrame: ((api: any) => void) | null } = {
      onInit: null,
      onFrame: null,
    };

    try {
      const fn = new Function('ctx', scriptText);
      fn(ctx);
    } catch (e: any) {
      setScriptError(`Script parse error: ${e.message || String(e)}`);
      return;
    }

    scriptCtxRef.current = ctx;

    if (ctx.onInit) {
      try {
        const api = buildApi(playbackIndexRef.current ?? 0);
        ctx.onInit(api);
        // Capture state mutations back
        const { scene: _s, ...rest } = api.state;
        stateRef.current = rest;
      } catch (e: any) {
        setScriptError(`onInit error: ${e.message || String(e)}`);
      }
    }

    // Run initial frame
    if (ctx.onFrame) {
      try {
        const api = buildApi(playbackIndexRef.current ?? 0);
        // Merge current state into api
        Object.assign(api.state, stateRef.current);
        ctx.onFrame(api);
        const { scene: _s, ...rest } = api.state;
        stateRef.current = rest;
      } catch (e: any) {
        setScriptError(`onFrame error: ${e.message || String(e)}`);
      }
    }
  }, [scriptText, clearScene, buildApi]);

  // Run script on mount
  useEffect(() => {
    // Small delay to ensure renderer is initialized
    const timer = setTimeout(() => {
      runScript();
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Call onFrame when playbackIndex changes
  useEffect(() => {
    const ctx = scriptCtxRef.current;
    if (!ctx?.onFrame || playbackIndex === null) return;
    try {
      const api = buildApi(playbackIndex);
      Object.assign(api.state, stateRef.current);
      ctx.onFrame(api);
      const { scene: _s, ...rest } = api.state;
      stateRef.current = rest;
    } catch (e: any) {
      setScriptError(`onFrame error: ${e.message || String(e)}`);
    }
  }, [playbackIndex, buildApi]);

  // Playback animation
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const totalFrames = result.allData[0].length;
    lastTimeRef.current = performance.now();

    const step = (now: number) => {
      if (!playingRef.current) return;

      const elapsed = now - lastTimeRef.current;
      // Target ~30fps, speed multiplier
      const framesPerTick = Math.max(1, Math.round((elapsed / 33.3) * speedRef.current));
      lastTimeRef.current = now;

      const currentIdx = playbackIndexRef.current ?? 0;
      let nextIdx = currentIdx + framesPerTick;

      if (nextIdx >= totalFrames) {
        nextIdx = totalFrames - 1;
        setPlaying(false);
        onPlaybackIndexChange(nextIdx);
        return;
      }

      onPlaybackIndexChange(nextIdx);
      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [playing, result, onPlaybackIndexChange]);

  const totalFrames = result.allData[0].length;
  const currentTime = playbackIndex !== null ? result.allData[0][playbackIndex]?.toFixed(2) : '0.00';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: 3D Viewport */}
      <div className="flex flex-col rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <div
          ref={containerRef}
          style={{ minHeight: '350px', background: '#111' }}
          className="w-full flex-1"
        />
        {/* Transport controls */}
        <div
          className="flex items-center gap-1.5 px-3 py-2 border-t"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
          <button
            onClick={() => { setPlaying(false); onPlaybackIndexChange(0); }}
            className="px-1.5 py-0.5 rounded text-xs font-mono border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            title="Go to start"
          >
            |&lt;
          </button>
          <button
            onClick={() => { setSpeed(4); if (!playing) setPlaying(true); }}
            className="px-1.5 py-0.5 rounded text-xs font-mono border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            title="Rewind (4x)"
          >
            &lt;&lt;
          </button>
          <button
            onClick={() => {
              if (playing) {
                setPlaying(false);
              } else {
                setSpeed(1);
                if (playbackIndex !== null && playbackIndex >= totalFrames - 1) {
                  onPlaybackIndexChange(0);
                }
                setPlaying(true);
              }
            }}
            className="px-2.5 py-0.5 rounded text-xs font-semibold border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={() => { setSpeed(4); if (!playing) setPlaying(true); }}
            className="px-1.5 py-0.5 rounded text-xs font-mono border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            title="Fast forward (4x)"
          >
            &gt;&gt;
          </button>
          <button
            onClick={() => { setPlaying(false); onPlaybackIndexChange(totalFrames - 1); }}
            className="px-1.5 py-0.5 rounded text-xs font-mono border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            title="Go to end"
          >
            &gt;|
          </button>
          <input
            type="range"
            min={0}
            max={totalFrames - 1}
            value={playbackIndex ?? 0}
            onChange={(e) => {
              setPlaying(false);
              onPlaybackIndexChange(Number(e.target.value));
            }}
            className="flex-1 min-w-16"
          />
          <span className="text-xs font-mono whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
            t={currentTime}s
          </span>
        </div>
      </div>

      {/* Right: Script Editor */}
      <div className="flex flex-col rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <button
            onClick={runScript}
            className="px-3 py-1 rounded-md text-white text-xs font-semibold"
            style={{ backgroundColor: '#3cb4ff' }}
          >
            Run Script
          </button>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            3D Viewer Script
          </span>
        </div>
        <textarea
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          spellCheck={false}
          className="flex-1 w-full p-3 text-sm font-mono leading-relaxed outline-none resize-y"
          style={{
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            minHeight: '300px',
            border: 'none',
          }}
        />
        {scriptError && (
          <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <pre className="text-red-400 text-xs font-mono whitespace-pre-wrap">{scriptError}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
