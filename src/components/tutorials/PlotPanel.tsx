import { useRef, useEffect, useMemo, useCallback } from 'react';
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

  // Build sorted array of selected variable indices for stable ordering
  const selectedArr = useMemo(() => Array.from(selectedVars).sort((a, b) => a - b), [selectedVars]);

  // Build uPlot data: [times, ...selectedSeriesData]
  const plotData = useMemo(() => {
    const data: uPlot.AlignedData = [result.allData[0]];
    for (const vi of selectedArr) {
      data.push(result.allData[vi + 1]);
    }
    return data;
  }, [result, selectedArr]);

  // Build uPlot options
  const buildOpts = useCallback(
    (width: number): uPlot.Options => {
      const series: uPlot.Series[] = [
        { label: 'time (s)' },
      ];
      selectedArr.forEach((vi, i) => {
        series.push({
          label: result.names[vi],
          stroke: COLORS[i % COLORS.length],
          width: 2,
        });
      });

      return {
        width,
        height: 300,
        cursor: {
          drag: { x: true, y: true },
        },
        series,
        axes: [
          {
            label: 'time (s)',
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
    [selectedArr, result.names],
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

    if (playbackIndex !== null && playbackIndex < result.allData[0].length) {
      const time = result.allData[0][playbackIndex];
      // Convert time value to pixel position via the x scale
      const left = plot.valToPos(time, 'x');
      plot.setCursor({ left, top: -1 });
    } else {
      // Clear cursor
      plot.setCursor({ left: -1, top: -1 });
    }
  }, [playbackIndex, result]);

  return (
    <>
      <div
        ref={containerRef}
        style={{ height: '300px', width: '100%' }}
      />

      {/* Variable toggle buttons */}
      <div
        className="px-4 py-3 flex flex-wrap gap-2 border-t"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {result.names.map((name, i) => {
          const selIdx = selectedArr.indexOf(i);
          const isSelected = selIdx !== -1;
          const color = isSelected ? COLORS[selIdx % COLORS.length] : undefined;

          return (
            <button
              key={i}
              onClick={() => onToggleVar(i)}
              className="px-2.5 py-1 rounded-md text-xs font-mono border transition-colors"
              style={{
                borderColor: isSelected ? color : 'var(--color-border)',
                backgroundColor: isSelected ? color + '15' : 'transparent',
                color: isSelected ? color : 'var(--color-text-muted)',
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
    </>
  );
}
