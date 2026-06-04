import { useState, useCallback, useRef, useEffect } from 'react';
import { getRumocaClient } from '../../lib/rumoca-worker-client';
import SimulationSettings from './SimulationSettings';
import PlotPanel from './PlotPanel';
import Viewer3DPanel from './Viewer3DPanel';

interface SimulationViewerProps {
  source: string;
  modelName: string;
  tEnd?: number;
  dt?: number;
  defaultScript?: string;
}

interface SimResult {
  names: string[];
  allData: number[][];
  nStates: number;
}

type ViewTab = 'plot' | '3d';

export default function SimulationViewer({
  source,
  modelName,
  tEnd: initialTEnd = 1.0,
  dt: initialDt = 0,
  defaultScript,
}: SimulationViewerProps) {
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [ready, setReady] = useState(false);
  const [selectedVars, setSelectedVars] = useState<Set<number>>(new Set());
  const [playbackIndex, setPlaybackIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('plot');

  // Simulation settings state
  const [tEnd, setTEnd] = useState(initialTEnd);
  const [dt, setDt] = useState(initialDt);
  const [solver, setSolver] = useState('auto');

  useEffect(() => {
    const client = getRumocaClient();
    client.ready.then(() => setReady(true));
  }, []);

  const handleSimulate = useCallback(async () => {
    setSimulating(true);
    setError('');
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
      setError(e.message || String(e));
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

  const tabStyle = (tab: ViewTab) => ({
    borderBottom: activeTab === tab ? '2px solid var(--color-teal, #15b7e7)' : '2px solid transparent',
    color: activeTab === tab ? 'var(--color-text)' : 'var(--color-text-muted)',
  });

  return (
    <div className="my-6 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      {/* Top bar: Simulate button + settings */}
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

      {/* Tab bar (only when we have results) */}
      {result && (
        <div className="flex gap-4 px-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <button
            onClick={() => setActiveTab('plot')}
            className="py-2 text-sm font-medium transition-colors"
            style={tabStyle('plot')}
          >
            Plot
          </button>
          <button
            onClick={() => setActiveTab('3d')}
            className="py-2 text-sm font-medium transition-colors"
            style={tabStyle('3d')}
          >
            3D Viewer
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="px-4 py-3">
          <pre className="text-red-500 text-sm font-mono whitespace-pre-wrap">{error}</pre>
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
      {result && activeTab === 'plot' && (
        <PlotPanel
          result={result}
          selectedVars={selectedVars}
          playbackIndex={playbackIndex}
          onToggleVar={toggleVar}
        />
      )}

      {result && activeTab === '3d' && (
        <Viewer3DPanel
          result={result}
          playbackIndex={playbackIndex}
          onPlaybackIndexChange={setPlaybackIndex}
          defaultScript={defaultScript}
        />
      )}

      {/* Empty state */}
      {!result && !error && !simulating && (
        <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Click "Simulate" to run the model and see results.
        </div>
      )}
    </div>
  );
}
