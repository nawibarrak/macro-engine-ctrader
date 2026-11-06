import React, { useState, useRef, useMemo, useId } from 'react';

export interface ChartSeries {
  name: string;
  pts: [string, number][];
  color: string;
}

interface InteractiveChartProps {
  series: ChartSeries[];
  days?: number;
  height?: number;
  zero?: boolean;
  dec?: number;
  label?: string;
  showTable?: boolean;
  onRangeChange?: (days: number) => void;
}

const ts = (d: string) => Date.parse(d + 'T00:00:00Z');
const nf = (v: number | null | undefined, dec = 2) =>
  v == null || isNaN(v)
    ? '–'
    : Number(v).toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fd = (d: string) =>
  d
    ? new Date(ts(d)).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '–';

function niceStep(r: number) {
  const e = Math.pow(10, Math.floor(Math.log10(r)));
  const f = r / e;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
}

function cutDays(pts: [string, number][], days?: number): [string, number][] {
  if (!days || !pts.length) return pts;
  const ref = ts(pts[pts.length - 1][0]) - days * 864e5;
  const i = pts.findIndex((p) => ts(p[0]) >= ref);
  return i < 0 ? pts : pts.slice(i);
}

// Compute 20-period Simple Moving Average
function computeSMA(pts: [string, number][], period = 20): [string, number][] {
  if (pts.length < period) return [];
  const out: [string, number][] = [];
  for (let i = period - 1; i < pts.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += pts[i - j][1];
    }
    out.push([pts[i][0], Number((sum / period).toFixed(4))]);
  }
  return out;
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  series,
  days = 365,
  height = 240,
  zero = false,
  dec,
  label,
  showTable = true,
  onRangeChange,
}) => {
  const [activeRange, setActiveRange] = useState<number>(days);
  const [showSMA, setShowSMA] = useState<boolean>(false);
  const [showTableDetails, setShowTableDetails] = useState<boolean>(false);
  const [hoverData, setHoverData] = useState<{
    day: string;
    x: number;
    y: number;
    values: { name: string; val: number; color: string }[];
  } | null>(null);

  const rawId = useId();
  const chartId = useMemo(() => 'chart_' + rawId.replace(/[^a-zA-Z0-9]/g, '_'), [rawId]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleRange = (d: number) => {
    setActiveRange(d);
    if (onRangeChange) onRangeChange(d);
  };

  const activeSeries = useMemo(() => {
    return series
      .map((s) => ({ ...s, pts: cutDays(s.pts, activeRange) }))
      .filter((s) => s.pts.length > 1);
  }, [series, activeRange]);

  if (!activeSeries.length) {
    return <div className="empty">Data tidak tersedia untuk grafik ini.</div>;
  }

  const primarySeries = activeSeries[0];
  const primaryPts = primarySeries.pts;
  const latestPt = primaryPts[primaryPts.length - 1];
  const firstPt = primaryPts[0];
  const periodReturn = firstPt && latestPt ? ((latestPt[1] / firstPt[1]) - 1) * 100 : 0;

  // Window Min / Max
  const windowVals = primaryPts.map((p) => p[1]);
  const windowMin = Math.min(...windowVals);
  const windowMax = Math.max(...windowVals);

  // Optional SMA 20
  const sma20Pts = useMemo(() => {
    return showSMA ? computeSMA(primaryPts, Math.min(20, Math.floor(primaryPts.length / 2))) : [];
  }, [primaryPts, showSMA]);

  const W = 640;
  const H = height;
  const m = { l: 52, r: 16, t: 14, b: 26 };

  const t0 = Math.min(...activeSeries.map((s) => ts(s.pts[0][0])));
  const t1 = Math.max(...activeSeries.map((s) => ts(s.pts[s.pts.length - 1][0])));

  let lo = Infinity;
  let hi = -Infinity;
  activeSeries.forEach((s) =>
    s.pts.forEach((p) => {
      if (p[1] < lo) lo = p[1];
      if (p[1] > hi) hi = p[1];
    })
  );

  if (zero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }

  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;

  const X = (t: number) => m.l + ((t - t0) / ((t1 - t0) || 1)) * (W - m.l - m.r);
  const Y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);

  const step = niceStep((hi - lo) / 4);
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    yTicks.push(v);
  }

  const xTicks = [0, 1, 2, 3].map((k) => {
    const t = t0 + ((t1 - t0) * k) / 3;
    const d = new Date(t);
    return {
      t,
      x: X(t),
      label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      align: k === 0 ? ('start' as const) : k === 3 ? ('end' as const) : ('middle' as const),
    };
  });

  const handlePointer = (ev: React.PointerEvent<SVGRectElement>) => {
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = (ev.clientX - rect.left) * (W / rect.width);
    const py = (ev.clientY - rect.top) * (H / rect.height);
    const t = t0 + ((px - m.l) / (W - m.l - m.r)) * (t1 - t0);

    const ref = activeSeries[0].pts;
    let best = 0;
    let bd = 1e18;
    for (let i = 0; i < ref.length; i++) {
      const dd = Math.abs(ts(ref[i][0]) - t);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    const day = ref[best][0];
    const x = X(ts(day));
    const y = py;

    const values = activeSeries
      .map((s) => {
        const p = s.pts.find((pt) => pt[0] === day);
        return p ? { name: s.name, val: p[1], color: s.color } : null;
      })
      .filter((v): v is { name: string; val: number; color: string } => v !== null);

    setHoverData({ day, x, y, values });
  };

  const tableRows = primaryPts.slice(-20).reverse();

  return (
    <div className="chart" ref={containerRef}>
      {/* Chart HUD & Metric Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
            {label || primarySeries.name}
          </span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
            {nf(latestPt[1], dec)}
          </span>
          <span
            style={{
              fontFamily: 'var(--f-mono)',
              fontSize: 11,
              fontWeight: 600,
              color: periodReturn >= 0 ? 'var(--up)' : 'var(--down)',
            }}
          >
            {periodReturn >= 0 ? '▲ +' : '▼ '}
            {periodReturn.toFixed(2)}%
          </span>
          <span className="mute small" style={{ fontFamily: 'var(--f-mono)' }}>
            L: {nf(windowMin, dec)} · H: {nf(windowMax, dec)}
          </span>
        </div>

        {/* Action Controls: Range Selector + Overlay Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Overlays */}
          <button
            type="button"
            className="btn sm"
            style={{
              fontFamily: 'var(--f-mono)',
              fontSize: 10,
              padding: '2px 6px',
              background: showSMA ? 'var(--accent-soft)' : 'transparent',
              borderColor: showSMA ? 'var(--accent-border)' : 'var(--line)',
              color: showSMA ? 'var(--accent)' : 'var(--mute)',
            }}
            onClick={() => setShowSMA(!showSMA)}
            title="Toggle 20-period Moving Average"
          >
            SMA 20
          </button>

          {/* Timeframe Presets */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--panel2)', padding: 2, borderRadius: 4, border: '1px solid var(--line)' }}>
            {[
              ['1B', 30],
              ['3B', 91],
              ['1T', 365],
              ['2T', 730],
              ['ALL', 0],
            ].map(([lbl, val]) => (
              <button
                key={lbl}
                type="button"
                style={{
                  fontFamily: 'var(--f-mono)',
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 3,
                  border: 'none',
                  background: activeRange === val ? 'var(--accent-soft)' : 'transparent',
                  color: activeRange === val ? 'var(--accent)' : 'var(--mute)',
                  fontWeight: activeRange === val ? 700 : 500,
                  cursor: 'pointer',
                }}
                onClick={() => handleRange(val as number)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div style={{ position: 'relative', width: '100%' }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label || 'grafik kuantitatif'}>
          <defs>
            {activeSeries.map((s, idx) => {
              const seriesColor = s.color || 'var(--s1, #38bdf8)';
              return (
                <linearGradient key={idx} id={`${chartId}-grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={seriesColor} stopOpacity="0.28" />
                  <stop offset="95%" stopColor={seriesColor} stopOpacity="0.0" />
                </linearGradient>
              );
            })}
          </defs>

          {/* Horizontal Gridlines & Y-Axis Labels */}
          {yTicks.map((v, i) => {
            const y = Y(v);
            return (
              <g key={i}>
                <line x1={m.l} x2={W - m.r} y1={y} y2={y} stroke="var(--chart-grid, #202636)" strokeWidth="1" strokeDasharray="2 3" />
                <text
                  x={m.l - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="9.5"
                  fill="var(--chart-axis, #94a3b8)"
                  fontFamily="var(--f-mono)"
                >
                  {nf(v, dec ?? (step < 1 ? 2 : step < 10 ? 1 : 0))}
                </text>
              </g>
            );
          })}

          {/* Zero Line */}
          {zero && lo < 0 && hi > 0 && (
            <line x1={m.l} x2={W - m.r} y1={Y(0)} y2={Y(0)} stroke="var(--chart-zero, #475569)" strokeWidth="1.2" strokeDasharray="3 3" />
          )}

          {/* X Axis Ticks */}
          {xTicks.map((xt, i) => (
            <text
              key={i}
              x={xt.x}
              y={H - 6}
              textAnchor={xt.align}
              fontSize="9.5"
              fill="var(--chart-axis, #94a3b8)"
              fontFamily="var(--f-mono)"
            >
              {xt.label}
            </text>
          ))}

          {/* Series Curves */}
          {activeSeries.map((s, idx) => {
            const seriesColor = s.color || 'var(--s1, #38bdf8)';
            const d = s.pts.map((p, i) => (i ? 'L' : 'M') + X(ts(p[0])).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('');
            const firstX = X(ts(s.pts[0][0])).toFixed(1);
            const lastX = X(ts(s.pts[s.pts.length - 1][0])).toFixed(1);
            const areaD = `${d} L ${lastX},${H - m.b} L ${firstX},${H - m.b} Z`;
            const lastPt = s.pts[s.pts.length - 1];

            return (
              <g key={idx}>
                {activeSeries.length === 1 && <path d={areaD} fill={`url(#${chartId}-grad-${idx})`} />}
                <path
                  d={d}
                  fill="none"
                  stroke={seriesColor}
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle
                  cx={X(ts(lastPt[0]))}
                  cy={Y(lastPt[1])}
                  r="4"
                  fill={seriesColor}
                  stroke="var(--panel, #0f0f13)"
                  strokeWidth="2"
                />
              </g>
            );
          })}

          {/* Optional SMA 20 Overlay */}
          {showSMA && sma20Pts.length > 1 && (
            <path
              d={sma20Pts.map((p, i) => (i ? 'L' : 'M') + X(ts(p[0])).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('')}
              fill="none"
              stroke="var(--warn, #f59e0b)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}

          {/* Crosshair Vertical & Horizontal */}
          {hoverData && (
            <g>
              <line
                x1={hoverData.x}
                x2={hoverData.x}
                y1={m.t}
                y2={H - m.b}
                stroke="var(--mute)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            </g>
          )}

          {/* Interactive Hit Area */}
          <rect
            x={m.l}
            y={m.t}
            width={W - m.l - m.r}
            height={H - m.t - m.b}
            fill="transparent"
            style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={() => setHoverData(null)}
          />
        </svg>

        {/* Dynamic Precision Tooltip */}
        {hoverData && (
          <div
            className="tip"
            style={{
              display: 'block',
              left: `${Math.min(Math.max(10, (hoverData.x / W) * 100), 75)}%`,
              top: '12px',
            }}
          >
            <div className="d">{fd(hoverData.day)}</div>
            {hoverData.values.map((v, idx) => (
              <div className="r" key={idx}>
                <span>
                  <i className="k" style={{ borderColor: v.color }} />
                  {v.name}
                </span>
                <b className="num">{nf(v.val, dec ?? 2)}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabular inspection collapse */}
      {showTable && (
        <details
          open={showTableDetails}
          onToggle={(e) => setShowTableDetails((e.target as HTMLDetailsElement).open)}
          style={{ marginTop: 8 }}
        >
          <summary>Buka log tabel data ({tableRows.length} titik observasi)</summary>
          <div className="tw" style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  {activeSeries.map((s, i) => (
                    <th key={i} className="r">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((p, rIdx) => (
                  <tr key={rIdx}>
                    <td style={{ fontFamily: 'var(--f-mono)' }}>{fd(p[0])}</td>
                    {activeSeries.map((s, cIdx) => {
                      const match = s.pts.find((pt) => pt[0] === p[0]);
                      return (
                        <td key={cIdx} className="r num">
                          {match ? nf(match[1], dec ?? 2) : '–'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
};
