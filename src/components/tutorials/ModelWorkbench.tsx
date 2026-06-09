import { useState, useCallback, useEffect } from 'react';
import { getRumocaClient } from '../../lib/rumoca-worker-client';
import SimulationSettings from './SimulationSettings';
import PlotPanel from './PlotPanel';
import Viewer3DPanel from './Viewer3DPanel';

interface ModelWorkbenchProps {
  initialSource: string;
  modelName: string;
  tEnd?: number;
  dt?: number;
  showCompile?: boolean;
  defaultBackend?: string;
  defaultScript?: string;
  defaultSolver?: string;
}

interface SimResult {
  names: string[];
  allData: number[][];
  nStates: number;
}

interface Backend {
  name: string;
  label: string;
}

const JSON_BACKEND = { name: '__json__', label: 'JSON DAE IR' };

export default function ModelWorkbench({
  initialSource,
  modelName,
  tEnd: initialTEnd = 1.0,
  dt: initialDt = 0,
  showCompile = false,
  defaultBackend,
  defaultScript,
  defaultSolver = 'auto',
}: ModelWorkbenchProps) {
  // Shared source state
  const [source, setSource] = useState(initialSource);

  // Compile state
  const [backends, setBackends] = useState<Backend[]>([JSON_BACKEND]);
  const [selectedBackend, setSelectedBackend] = useState(defaultBackend || '__json__');
  const [compileOutput, setCompileOutput] = useState('');
  const [compileError, setCompileError] = useState('');
  const [compiling, setCompiling] = useState(false);

  // Simulation state
  const [result, setResult] = useState<SimResult | null>(null);
  const [simError, setSimError] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [selectedVars, setSelectedVars] = useState<Set<number>>(new Set());
  const [playbackIndex, setPlaybackIndex] = useState<number | null>(null);

  // Simulation settings
  const [tEnd, setTEnd] = useState(initialTEnd);
  const [dt, setDt] = useState(initialDt);
  const [solver, setSolver] = useState(defaultSolver);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = getRumocaClient();
    client.ready.then(async () => {
      setReady(true);
      try {
        const tplJson = await client.getBuiltinTargets();
        const tpls: string[] = JSON.parse(tplJson);
        setBackends([JSON_BACKEND, ...tpls.map((t) => ({ name: t, label: t }))]);
      } catch { /* ignore */ }
    });
  }, []);

  const handleReset = useCallback(() => {
    setSource(initialSource);
  }, [initialSource]);

  const handleCompile = useCallback(async () => {
    setCompiling(true);
    setCompileError('');
    setCompileOutput('');
    try {
      const client = getRumocaClient();
      const daeJson = await client.compile(source, modelName);
      if (selectedBackend === '__json__') {
        try {
          setCompileOutput(JSON.stringify(JSON.parse(daeJson), null, 2));
        } catch {
          setCompileOutput(daeJson);
        }
      } else {
        const rendered = await client.renderTarget(daeJson, modelName, selectedBackend);
        setCompileOutput(rendered);
      }
    } catch (e: any) {
      setCompileError(e.message || String(e));
    } finally {
      setCompiling(false);
    }
  }, [source, modelName, selectedBackend]);

  const handleSimulate = useCallback(async () => {
    setSimulating(true);
    setSimError('');
    setResult(null);
    setPlaybackIndex(null);
    try {
      const client = getRumocaClient();
      const raw = await client.simulate(source, modelName, tEnd, dt, solver);
      const parsed = JSON.parse(raw);
      // Newer rumoca wraps the result in { payload, metrics }; older builds returned the payload directly.
      const root = parsed.payload ?? parsed;
      let simResult: SimResult;
      if (root.names && root.allData) {
        simResult = root;
      } else if (root.names && root.times && root.data) {
        simResult = {
          names: root.names,
          allData: [root.times, ...root.data],
          nStates: root.nStates ?? 0,
        };
      } else {
        throw new Error('Unexpected simulation result format');
      }
      setResult(simResult);
      const nStates = simResult.nStates || Math.min(simResult.names.length, 4);
      setSelectedVars(new Set(Array.from({ length: nStates }, (_, i) => i)));
    } catch (e: any) {
      setSimError(e.message || String(e));
    } finally {
      setSimulating(false);
    }
  }, [source, modelName, tEnd, dt, solver]);

  const toggleVar = useCallback((idx: number) => {
    setSelectedVars((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const isModified = source !== initialSource;

  return (
    <div className="my-6 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      {/* Source editor header */}
      <div
        className="flex items-center gap-2 w-full px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          Modelica Source
        </span>
        <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
          ({source.split('\n').length} lines)
        </span>
        <div className="flex-1" />
        {isModified && (
          <span
            onClick={handleReset}
            className="px-3 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Reset
          </span>
        )}
      </div>
      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
        className="w-full px-4 py-3 font-mono text-sm resize-none focus:outline-none border-b leading-relaxed"
        style={{ backgroundColor: 'var(--color-code-bg)', color: 'var(--color-code-text)', borderColor: 'var(--color-border)', tabSize: 2, maxHeight: '28rem', overflowY: 'auto' }}
        rows={Math.min(source.split('\n').length + 1, 20)}
      />

      {/* Compile section (only shown when showCompile is true) */}
      {showCompile && (
        <>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <button
              onClick={handleCompile}
              disabled={compiling || !ready}
              className="px-4 py-1.5 rounded-md text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              {compiling ? 'Compiling...' : !ready ? 'Loading...' : 'Compile'}
            </button>
            <select
              value={selectedBackend}
              onChange={(e) => setSelectedBackend(e.target.value)}
              className="px-3 py-1.5 rounded-md border text-sm font-mono focus:outline-none"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {backends.map((b) => (
                <option key={b.name} value={b.name}>{b.label}</option>
              ))}
            </select>
          </div>

          {/* Compile output */}
          {(compileOutput || compileError || compiling) && (
            <div className="px-4 py-3 max-h-80 overflow-auto border-b" style={{ backgroundColor: 'var(--color-code-bg)', borderColor: 'var(--color-border)' }}>
              {compiling && (
                <div className="flex items-center gap-2 text-sm font-mono" style={{ color: 'var(--color-code-text)' }}>
                  <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
                  Compiling...
                </div>
              )}
              {compileError && <pre className="text-red-500 text-sm font-mono whitespace-pre-wrap">{compileError}</pre>}
              {compileOutput && !compiling && <pre className="text-sm font-mono whitespace-pre-wrap" style={{ color: 'var(--color-code-text)' }}>{compileOutput}</pre>}
            </div>
          )}
        </>
      )}

      {/* Simulate section */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={handleSimulate}
          disabled={simulating || !ready}
          className="px-4 py-1.5 rounded-md text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-teal)' }}
        >
          {simulating ? 'Simulating...' : !ready ? 'Loading...' : 'Simulate'}
        </button>

        <SimulationSettings
          tEnd={tEnd}
          dt={dt}
          solver={solver}
          onTEndChange={setTEnd}
          onDtChange={setDt}
          onSolverChange={setSolver}
        />
      </div>

      {/* Sim error */}
      {simError && (
        <div className="px-4 py-3">
          <pre className="text-red-500 text-sm font-mono whitespace-pre-wrap">{simError}</pre>
        </div>
      )}

      {/* Simulating spinner */}
      {simulating && (
        <div className="px-4 py-8 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-teal)', borderTopColor: 'transparent' }} />
          Running simulation...
        </div>
      )}

      {/* Content panels */}
      {result && (
        <PlotPanel
          result={result}
          selectedVars={selectedVars}
          playbackIndex={playbackIndex}
          onToggleVar={toggleVar}
        />
      )}

      {result && defaultScript && (
        <Viewer3DPanel
          result={result}
          playbackIndex={playbackIndex}
          onPlaybackIndexChange={setPlaybackIndex}
          defaultScript={defaultScript}
        />
      )}

      {/* Empty state */}
      {!result && !simError && !simulating && (
        <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Click "Simulate" to run the model and see results.
        </div>
      )}
    </div>
  );
}
