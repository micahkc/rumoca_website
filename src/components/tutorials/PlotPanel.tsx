import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface SimResult {
  names: string[];
  allData: number[][];
  nStates: number;
}

interface PlotPanelProps {
  result: SimResult;
  selectedVars: Set<number>;
  playbackIndex: number | null;
  onToggleVar: (idx: number) => void;
}

// X-axis selection: -1 means "time" (result.allData[0]); 0..N-1 maps to result.names[i].
const X_TIME = -1;

// Custom path builder for phase portraits: uPlot's default line renderer assumes X is
// sorted ascending and drops/misrenders points otherwise. This builder connects samples
// in their array (temporal) order regardless of X ordering.
const temporalLinearPath: uPlot.Series.PathBuilder = (u, seriesIdx) => {
  const stroke = new Path2D();
  const series = u.series[seriesIdx];
  const yScale = series.scale || 'y';
  const xData = u.data[0] as readonly (number | null)[];
  const yData = u.data[seriesIdx] as readonly (number | null)[];

  // Iterate the full data array in temporal order rather than uPlot's pre-computed
  // idx0..idx1, which is derived from a sorted-X binary search and may exclude points
  // when X is non-monotonic (e.g. limit-cycle phase portraits).
  let started = false;
  for (let i = 0; i < xData.length; i++) {
    const xv = xData[i];
    const yv = yData[i];
    if (xv == null || yv == null || !Number.isFinite(xv as number) || !Number.isFinite(yv as number)) {
      started = false;
      continue;
    }
    const x = u.valToPos(xv as number, 'x', true);
    const y = u.valToPos(yv as number, yScale, true);
    if (!started) {
      stroke.moveTo(x, y);
      started = true;
    } else {
      stroke.lineTo(x, y);
    }
  }

  return { stroke };
};

// Range builder that scans all X values rather than assuming sorted ascending.
const unsortedXRange: uPlot.Scale.Range = (u) => {
  const data = u.data[0] as readonly (number | null)[];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v != null && Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
};

const COLORS = [
  '#f0732e',
  '#15b7e7',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
];

export default function PlotPanel({ result, selectedVars, playbackIndex, onToggleVar }: PlotPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  const [xVarIdx, setXVarIdx] = useState<number>(X_TIME);

  // Reset X selection back to time when a new simulation result arrives.
  useEffect(() => {
    setXVarIdx(X_TIME);
  }, [result]);

  // Build sorted array of selected variable indices for stable ordering;
  // exclude the variable currently used on X to avoid plotting it against itself.
  const selectedArr = useMemo(
    () => Array.from(selectedVars).filter((i) => i !== xVarIdx).sort((a, b) => a - b),
    [selectedVars, xVarIdx],
  );

  const xData = xVarIdx === X_TIME ? result.allData[0] : result.allData[xVarIdx + 1];
  const xLabel = xVarIdx === X_TIME ? 'time (s)' : result.names[xVarIdx];

  // Build uPlot data: [xData, ...selectedSeriesData]
  const plotData = useMemo(() => {
    const data: uPlot.AlignedData = [xData];
    for (const vi of selectedArr) {
      data.push(result.allData[vi + 1]);
    }
    return data;
  }, [result, selectedArr, xData]);

  const phasePortrait = xVarIdx !== X_TIME;

  // Build uPlot options
  const buildOpts = useCallback(
    (width: number): uPlot.Options => {
      const series: uPlot.Series[] = [
        { label: xLabel },
      ];
      selectedArr.forEach((vi, i) => {
        const s: uPlot.Series = {
          label: result.names[vi],
          stroke: COLORS[i % COLORS.length],
          width: 2,
        };
        if (phasePortrait) {
          // Bypass uPlot's sorted-X assumption; draw lines in temporal order.
          s.paths = temporalLinearPath;
        }
        series.push(s);
      });

      return {
        width,
        height: 300,
        cursor: {
          drag: { x: true, y: true },
        },
        scales: {
          // X data is numeric (seconds or a state variable), not a unix timestamp.
          x: phasePortrait
            ? { time: false, range: unsortedXRange }
            : { time: false },
        },
        series,
        axes: [
          {
            label: xLabel,
            stroke: '#5a7a8a',
            grid: { stroke: '#d0d8e0', width: 0.5 },
            ticks: { stroke: '#d0d8e0', width: 0.5 },
            font: '11px Inter, system-ui, sans-serif',
            labelFont: '11px Inter, system-ui, sans-serif',
          },
          {
            stroke: '#5a7a8a',
            grid: { stroke: '#d0d8e0', width: 0.5 },
            ticks: { stroke: '#d0d8e0', width: 0.5 },
            font: '11px Inter, system-ui, sans-serif',
            labelFont: '11px Inter, system-ui, sans-serif',
          },
        ],
        hooks: {
          drawClear: [
            (u: uPlot) => {
              const ctx = u.ctx;
              ctx.save();
              ctx.fillStyle = '#f4f6f8';
              ctx.fillRect(0, 0, u.width * devicePixelRatio, u.height * devicePixelRatio);
              ctx.restore();
            },
          ],
        },
      };
    },
    [selectedArr, result.names, xLabel, phasePortrait],
  );

  // Create / rebuild uPlot when selectedVars or result changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Destroy previous instance
    if (plotRef.current) {
      plotRef.current.destroy();
      plotRef.current = null;
    }

    const width = el.clientWidth;
    if (width === 0) return;

    const opts = buildOpts(width);
    const plot = new uPlot(opts, plotData, el);
    plotRef.current = plot;

    return () => {
      plot.destroy();
      plotRef.current = null;
    };
  }, [plotData, buildOpts]);

  // Responsive resize via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (plotRef.current && width > 0) {
          plotRef.current.setSize({ width, height: 300 });
        }
      }
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  // Playback cursor
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;

    if (playbackIndex !== null && playbackIndex < xData.length) {
      const xVal = xData[playbackIndex];
      const left = plot.valToPos(xVal, 'x');
      plot.setCursor({ left, top: -1 });
    } else {
      // Clear cursor
      plot.setCursor({ left: -1, top: -1 });
    }
  }, [playbackIndex, xData]);

  return (
    <>
      <div
        ref={containerRef}
        style={{ height: '300px', width: '100%' }}
      />

      {/* X-axis selector */}
      <div
        className="px-4 py-2 flex items-center gap-2 border-t text-xs"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
      >
        <label htmlFor="plot-x-axis" className="font-mono">X axis:</label>
        <select
          id="plot-x-axis"
          value={xVarIdx}
          onChange={(e) => setXVarIdx(Number(e.target.value))}
          className="px-2 py-1 rounded-md text-xs font-mono border bg-transparent"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          <option value={X_TIME}>time (s)</option>
          {result.names.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>
      </div>

      {/* Y-axis variable toggle buttons (X variable is excluded) */}
      <div
        className="px-4 py-3 flex flex-wrap gap-2 border-t"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {result.names.map((name, i) => {
          if (i === xVarIdx) return null;
          const selIdx = selectedArr.indexOf(i);
          const isSelected = selIdx !== -1;
          const color = isSelected ? COLORS[selIdx % COLORS.length] : undefined;

          return (
            <button
              key={i}
              onClick={() => onToggleVar(i)}
              className="px-2.5 py-1 rounded-md text-xs font-mono border transition-colors inline-flex items-center gap-1.5"
              style={{
                borderColor: isSelected ? color : 'var(--color-border)',
                backgroundColor: isSelected ? color + '15' : 'transparent',
                color: isSelected ? color : 'var(--color-text-muted)',
              }}
            >
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center"
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '2px',
                  border: `1px solid ${isSelected ? color : 'var(--color-border)'}`,
                  backgroundColor: isSelected ? color : 'transparent',
                  color: '#fff',
                  fontSize: '10px',
                  lineHeight: 1,
                }}
              >
                {isSelected ? '✓' : ''}
              </span>
              {name}
            </button>
          );
        })}
      </div>
    </>
  );
}
