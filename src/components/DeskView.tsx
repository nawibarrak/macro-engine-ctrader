import React, { useState, useMemo } from 'react';
import {
  BundleData,
  StatusData,
  AuditSeriesData,
  GatesData,
  PipelineData,
  ConceptCheckData,
  FeedData,
  ConsensusItem,
} from '../types/macro';
import { InteractiveChart } from './InteractiveChart';
import { OtakPanel } from './OtakPanel';

interface DeskViewProps {
  bundle: BundleData;
  status: StatusData;
  audit: AuditSeriesData;
  gates: GatesData;
  pipeline: PipelineData;
  conceptCheck: ConceptCheckData;
  feed: FeedData | null;
  consensus: ConsensusItem[];
  phase: any | null;
  otak: any | null;
  onNavigateToLanjutan: () => void;
}

const ts = (d: string) => Date.parse(d + 'T00:00:00Z');
const addDays = (d: string, n: number) => new Date(ts(d) + n * 864e5).toISOString().slice(0, 10);
const nf = (v: number | null | undefined, dec = 2) =>
  v == null || isNaN(v)
    ? '–'
    : Number(v).toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const sg = (v: number | null | undefined, dec = 2) =>
  v == null || isNaN(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), dec);
const fd = (d: string | null | undefined) =>
  d
    ? new Date(ts(d)).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '–';

const arrow = (v: number | null | undefined) => (v == null ? '' : v > 0 ? '▲' : v < 0 ? '▼' : '■');
const cls = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'dn' : '');

function idx(p: [string, number][], d: string) {
  let lo = 0,
    hi = p.length - 1,
    r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (p[m][0] <= d) {
      r = m;
      lo = m + 1;
    } else {
      hi = m - 1;
    }
  }
  return r;
}

function at(p: [string, number][], d: string): [string, number] | null {
  const i = idx(p, d);
  return i < 0 ? null : p[i];
}

function chgOver(p: [string, number][] | undefined, days: number, kind: 'pct' | 'diff'): number | null {
  if (!p || p.length < 2) return null;
  const L = p[p.length - 1];
  let j: number;
  if (days === 1) {
    j = p.length - 2;
  } else {
    j = idx(p, addDays(L[0], -days));
    if (j < 0) return null;
    if (ts(L[0]) - ts(p[j][0]) > (days + 12) * 864e5) return null;
  }
  const a = L[1],
    b = p[j][1];
  if (b == null) return null;
  return kind === 'pct' ? (b ? ((a / b) - 1) * 100 : null) : a - b;
}

function cutDays(pts: [string, number][], days?: number): [string, number][] {
  if (!days || !pts.length) return pts;
  const c = addDays(pts[pts.length - 1][0], -days);
  const i = idx(pts, c);
  return pts.slice(Math.max(0, i));
}

let sparkCounter = 0;
function sparkSVG(pts: [string, number][], color = 'var(--s1, #38bdf8)') {
  if (!pts || pts.length < 2) return null;
  sparkCounter = (sparkCounter + 1) % 10000;
  const gradId = `spark-g-${sparkCounter}`;
  const W = 200,
    H = 34;
  const v = pts.map((p) => p[1]);
  let lo = Math.min(...v),
    hi = Math.max(...v);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const x = (i: number) => (i / (pts.length - 1)) * (W - 6) + 3;
  const y = (u: number) => H - 4 - ((u - lo) / (hi - lo)) * (H - 8);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p[1]).toFixed(1)).join('');
  const areaD = `${d} L ${(W - 3).toFixed(1)},${H} L 3,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function derive(p: [string, number][], mode: 'lvl' | 'mom' | 'diff1' | 'ma4' | 'yoy'): [string, number][] {
  const o: [string, number][] = [];
  for (let i = 0; i < p.length; i++) {
    if (mode === 'lvl') {
      o.push(p[i]);
      continue;
    }
    if (mode === 'mom') {
      if (i && p[i - 1][1]) o.push([p[i][0], ((p[i][1] / p[i - 1][1]) - 1) * 100]);
      continue;
    }
    if (mode === 'diff1') {
      if (i) o.push([p[i][0], p[i][1] - p[i - 1][1]]);
      continue;
    }
    if (mode === 'ma4') {
      if (i >= 3) o.push([p[i][0], (p[i][1] + p[i - 1][1] + p[i - 2][1] + p[i - 3][1]) / 4]);
      continue;
    }
    if (mode === 'yoy') {
      const t = addDays(p[i][0], -365);
      const j = idx(p, t);
      if (j >= 0 && Math.abs(ts(p[j][0]) - ts(t)) < 40 * 864e5 && p[j][1]) {
        o.push([p[i][0], ((p[i][1] / p[j][1]) - 1) * 100]);
      }
    }
  }
  return o;
}

function pctRank(arr: number[], x: number): number | null {
  if (!arr.length) return null;
  let n = 0;
  for (const v of arr) if (v <= x) n++;
  return (n / arr.length) * 100;
}

const CARDS: [string, string, 'pct' | 'diff', number][] = [
  ['SPX', 'S&P 500', 'pct', 0],
  ['NDX', 'Nasdaq 100', 'pct', 0],
  ['IHSG', 'IHSG', 'pct', 0],
  ['NIKKEI', 'Nikkei 225', 'pct', 0],
  ['DXY', 'Indeks dolar AS', 'pct', 2],
  ['US02Y', 'Yield AS 2 tahun (%)', 'diff', 2],
  ['US10Y', 'Yield AS 10 tahun (%)', 'diff', 2],
  ['CURVE', 'Kurva 10Y−2Y (poin)', 'diff', 2],
  ['REAL10Y', 'Yield riil 10 tahun (%)', 'diff', 2],
  ['XAUUSD', 'Emas (USD/oz)', 'pct', 1],
  ['WTI', 'Minyak WTI (USD)', 'pct', 2],
  ['COPPER', 'Tembaga (USD/lb)', 'pct', 3],
  ['BTC', 'Bitcoin (USD)', 'pct', 0],
  ['VIX', 'VIX (poin)', 'diff', 2],
  ['USDJPY', 'USD/JPY', 'pct', 2],
  ['EURUSD', 'EUR/USD', 'pct', 4],
  ['USDIDR', 'USD/IDR', 'pct', 0],
];

const HEAT: [string, string][] = [
  ['SPY', 'Saham AS (SPY)'],
  ['NDX', 'Saham Nasdaq 100'],
  ['EEM', 'Saham pasar berkembang (EEM)'],
  ['IHSG', 'Saham Indonesia (IHSG)'],
  ['NIKKEI', 'Saham Jepang (Nikkei)'],
  ['TLT', 'Obligasi AS panjang (TLT)'],
  ['HYG', 'Obligasi high-yield (HYG)'],
  ['DXY', 'Dolar AS (DXY)'],
  ['XAUUSD', 'Emas'],
  ['WTI', 'Minyak WTI'],
  ['COPPER', 'Tembaga'],
  ['BTC', 'Bitcoin'],
];

const HC: [string, number, number][] = [
  ['1 hari', 1, 2],
  ['1 minggu', 7, 4],
  ['1 bulan', 30, 8],
  ['3 bulan', 91, 15],
];

const PAIRS: [string, string, string | null, number][] = [
  ['Saham AS vs obligasi AS panjang (SPY−TLT)', 'SPY', 'TLT', 1],
  ['Kredit berisiko vs Treasury menengah (HYG−IEF)', 'HYG', 'IEF', 1],
  ['Pasar berkembang vs saham AS (EEM−SPY)', 'EEM', 'SPY', 1],
  ['AUD/JPY (naik = selera risiko)', 'AUDJPY', null, 1],
  ['Tembaga vs emas', 'COPPER', 'XAUUSD', 1],
  ['VIX dibanding VIX 3 bulan (rasio)', 'VIX', 'VIX3M', -1],
];

const MAC = [
  {
    group: 'Inflasi',
    rows: [
      { id: 'CPI', name: 'Harga konsumen (CPI), tahunan', mode: 'yoy', u: '%', dec: 2 },
      { id: 'CPICORE', name: 'CPI inti, tahunan', mode: 'yoy', u: '%', dec: 2 },
      { id: 'PCECORE', name: 'PCE inti, tahunan', mode: 'yoy', u: '%', dec: 2 },
      { id: 'PPI', name: 'Harga produsen, tahunan', mode: 'yoy', u: '%', dec: 2 },
      { id: 'AHE', name: 'Upah per jam, tahunan', mode: 'yoy', u: '%', dec: 2 },
    ] as const,
  },
  {
    group: 'Tenaga kerja',
    rows: [
      { id: 'NFP', name: 'Penggajian nonpertanian, perubahan bulanan', mode: 'diff1', u: ' ribu', dec: 0 },
      { id: 'UNEMP', name: 'Tingkat pengangguran', mode: 'lvl', u: '%', dec: 1 },
      { id: 'CLAIMS', name: 'Klaim pengangguran awal, rata-rata 4 minggu', mode: 'ma4', u: '', dec: 0 },
    ] as const,
  },
  {
    group: 'Aktivitas',
    rows: [
      { id: 'RETAIL', name: 'Penjualan ritel, bulanan', mode: 'mom', u: '%', dec: 2 },
      { id: 'INDPRO', name: 'Produksi industri, tahunan', mode: 'yoy', u: '%', dec: 2 },
      { id: 'EMPIRE', name: 'Survei manufaktur New York', mode: 'lvl', u: '', dec: 1 },
      { id: 'PHILLY', name: 'Survei manufaktur Philadelphia', mode: 'lvl', u: '', dec: 1 },
      { id: 'GDP', name: 'PDB riil AS, kuartalan (tahunan berantai)', mode: 'lvl', u: '%', dec: 1 },
    ] as const,
  },
];

const POL: [string, string, string][] = [
  ['FED', 'Federal Reserve (batas atas target)', ''],
  ['ECB', 'Bank Sentral Eropa (suku bunga deposito)', ''],
  ['BOE', 'Bank of England', 'proksi: SONIA semalam'],
  ['BOJ', 'Bank of Japan', 'proksi: antarbank'],
  ['BOC', 'Bank of Canada', 'proksi: antarbank 3 bulan'],
  ['RBA', 'Reserve Bank of Australia', 'proksi: antarbank 3 bulan'],
  ['SNB', 'Swiss National Bank', 'proksi: antarbank 3 bulan'],
];

const COTL: Record<string, string> = {
  COT_GOLD: 'Emas',
  COT_CRUDE: 'Minyak mentah',
  COT_COPPER: 'Tembaga',
  COT_SPX: 'S&P 500 e-mini',
  COT_NDX: 'Nasdaq e-mini',
  COT_EUR: 'Euro',
  COT_JPY: 'Yen',
  COT_GBP: 'Poundsterling',
  COT_AUD: 'Dolar Australia',
  COT_BTC: 'Bitcoin CME',
};

const IND_NAMES: Record<string, string> = {
  cpi: 'CPI bulanan (%)',
  cpi_core: 'CPI inti bulanan (%)',
  pce_core: 'PCE inti bulanan (%)',
  ppi: 'PPI bulanan (%)',
  ahe: 'Upah per jam bulanan (%)',
  nfp: 'Penggajian nonpertanian (ribu)',
  unemp: 'Tingkat pengangguran (%)',
  claims: 'Klaim pengangguran (ribu)',
  jolts: 'Lowongan kerja JOLTS (juta)',
  retail: 'Penjualan ritel bulanan (%)',
  ip: 'Produksi industri bulanan (%)',
  empire: 'Survei manufaktur New York',
  philly: 'Survei manufaktur Philadelphia',
  gdp: 'PDB kuartalan (%)',
};

export const DeskView: React.FC<DeskViewProps> = ({
  bundle,
  status,
  audit,
  gates,
  pipeline,
  conceptCheck,
  feed,
  consensus,
  phase,
  otak,
  onNavigateToLanjutan,
}) => {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [detailDays, setDetailDays] = useState<number>(365);
  const [stressDays, setStressDays] = useState<number>(365);
  const [healthFilter, setHealthFilter] = useState<string>('Semua');

  const S = (id: string) => bundle.series[id] || null;

  // Status computations
  const lastUpdateMin = useMemo(() => {
    const gen = bundle.generated || status.generated;
    return gen ? Math.max(0, Math.round((Date.now() - Date.parse(gen)) / 60000)) : null;
  }, [bundle.generated, status.generated]);

  // Executive Market Pulse Top Ribbon
  const marketPulse = useMemo(() => {
    const items = [
      { id: 'SPX', label: 'S&P 500', dec: 0, kind: 'pct' as const },
      { id: 'US10Y', label: 'US 10Y Yield', dec: 2, kind: 'diff' as const },
      { id: 'XAUUSD', label: 'Emas (XAU)', dec: 1, kind: 'pct' as const },
      { id: 'WTI', label: 'Minyak WTI', dec: 2, kind: 'pct' as const },
      { id: 'BTC', label: 'Bitcoin', dec: 0, kind: 'pct' as const },
      { id: 'DXY', label: 'Dolar DXY', dec: 2, kind: 'pct' as const },
    ];
    return items.map((it) => {
      const s = S(it.id);
      const val = s?.p[s.p.length - 1];
      const d1 = s ? chgOver(s.p, 1, it.kind) : null;
      return {
        ...it,
        lastVal: val ? val[1] : null,
        delta: d1,
        spark: s ? cutDays(s.p, 30) : [],
      };
    });
  }, [bundle]);

  // Risk on/off pairs
  const pairsData = useMemo(() => {
    let on = 0,
      tot = 0;
    const zs: number[] = [];

    const rows = PAIRS.map(([name, a, b, dir]) => {
      const ratio = dir < 0;
      const sA = S(a);
      const sB = b ? S(b) : null;
      if (!sA || (b && !sB)) {
        return { name, value: null, z: 0, ratio, riskOn: false, w: 0 };
      }

      let v: number | null = null;
      const hist: number[] = [];

      if (ratio && sB) {
        const lastA = sA.p[sA.p.length - 1];
        const lastB = sB.p[sB.p.length - 1];
        v = lastA && lastB ? lastA[1] / lastB[1] : null;
        for (const p of sA.p.slice(-320)) {
          const X = at(sB.p, p[0]);
          if (X && Math.abs(ts(X[0]) - ts(p[0])) < 6 * 864e5 && X[1]) {
            hist.push(p[1] / X[1]);
          }
        }
      } else {
        const lastA = sA.p[sA.p.length - 1];
        if (lastA) {
          const A0 = at(sA.p, addDays(lastA[0], -30));
          if (A0 && sB) {
            const Bn = at(sB.p, lastA[0]);
            const B0 = at(sB.p, addDays(lastA[0], -30));
            if (Bn && B0 && A0[1] && B0[1]) {
              v = ((lastA[1] / A0[1]) - 1) * 100 - ((Bn[1] / B0[1]) - 1) * 100;
            }
          } else if (A0 && !sB && A0[1]) {
            v = ((lastA[1] / A0[1]) - 1) * 100;
          }
        }

        for (const p of sA.p.slice(-320)) {
          const A0 = at(sA.p, addDays(p[0], -30));
          if (!A0 || !A0[1]) continue;
          if (!sB) {
            hist.push(((p[1] / A0[1]) - 1) * 100);
          } else {
            const Bn = at(sB.p, p[0]);
            const B0 = at(sB.p, addDays(p[0], -30));
            if (Bn && B0 && B0[1]) {
              hist.push(((p[1] / A0[1]) - 1) * 100 - ((Bn[1] / B0[1]) - 1) * 100);
            }
          }
        }
      }

      if (v == null) return { name, value: null, z: 0, ratio, riskOn: false, w: 0 };

      const mu = hist.reduce((x, y) => x + y, 0) / (hist.length || 1);
      const sd = Math.sqrt(hist.reduce((x, y) => x + (y - mu) ** 2, 0) / (hist.length || 1)) || 1;
      const z = (v - mu) / sd;
      const sig = ratio ? -z : z;
      const riskOn = ratio ? v < 1 : v > 0;
      tot++;
      if (riskOn) on++;
      zs.push(sig);
      const w = Math.min(1, Math.abs(sig) / 2) * 50;

      return { name, value: v, sig, ratio, riskOn, w };
    });

    const avg = zs.length ? zs.reduce((x, y) => x + y, 0) / zs.length : null;
    return { rows, on, tot, avg };
  }, [bundle]);

  // Yield curve calculations
  const yieldCurveData = useMemo(() => {
    const tenors = [
      { label: '2 th', id: 'US02Y' },
      { label: '10 th', id: 'US10Y' },
      { label: '30 th', id: 'US30Y' },
    ].filter((x) => S(x.id));

    const s10 = S('US10Y');
    if (tenors.length < 2 || !s10) return null;
    const ref = s10.p[s10.p.length - 1][0];

    const curves = [
      { name: 'Sekarang', days: 0, color: 'var(--s1, #38bdf8)' },
      { name: '1 bulan lalu', days: 30, color: 'var(--s2, #fb923c)' },
      { name: '1 tahun lalu', days: 365, color: 'var(--s3, #34d399)' },
    ].map((c) => ({
      name: c.name,
      color: c.color,
      points: tenors.map((t) => {
        const s = S(t.id);
        const p = s ? at(s.p, addDays(ref, -c.days)) : null;
        return { tenor: t.label, val: p ? p[1] : null };
      }),
    }));

    const lastCurve = S('CURVE')?.p.slice(-1)[0];
    return { tenors, curves, lastCurve };
  }, [bundle]);

  // Net liquidity series: WALCL/1000 - TGA/1000 - RRP
  const liqSeries: [string, number][] = useMemo(() => {
    const w = S('WALCL');
    const t = S('TGA');
    const r = S('RRP');
    if (!w || !t || !r) return [];
    const pts: [string, number][] = [];
    for (const p of w.p.slice(-200)) {
      const tVal = at(t.p, p[0]);
      const rVal = at(r.p, p[0]);
      if (tVal && rVal) {
        pts.push([p[0], p[1] / 1e3 - tVal[1] / 1e3 - rVal[1]]);
      }
    }
    return pts;
  }, [bundle]);

  // Status series for health table
  const healthGroups = useMemo(() => {
    const grps = new Set(status.series.map((s) => s.group));
    return ['Semua', ...Array.from(grps)];
  }, [status.series]);

  const filteredHealthSeries = useMemo(() => {
    const ord: Record<string, number> = { gagal: 0, mati: 1, ditahan: 2, basi: 3, ok: 4 };
    return status.series
      .filter((r) => healthFilter === 'Semua' || r.group === healthFilter)
      .sort((a, b) => (ord[a.state] ?? 5) - (ord[b.state] ?? 5) || a.id.localeCompare(b.id));
  }, [status.series, healthFilter]);

  const selectedSeriesMeta = selectedCardId ? S(selectedCardId) : null;
  const selectedCardConfig = CARDS.find((x) => x[0] === selectedCardId);

  return (
    <main className="wrap">
      {/* 0. Executive Market Pulse Ribbon */}
      <div className="market-strip">
        {marketPulse.map((it) => (
          <div key={it.id} className="market-strip-item">
            <div className="hdr">
              <span>{it.label}</span>
              <span className={cls(it.delta)}>
                {arrow(it.delta)} {sg(it.delta, it.kind === 'pct' ? 2 : 2)}
                {it.kind === 'pct' ? '%' : ''}
              </span>
            </div>
            <div className="val">{it.lastVal ? nf(it.lastVal, it.dec) : '–'}</div>
            {it.spark.length > 1 && (
              <div style={{ height: 24, marginTop: 2 }}>{sparkSVG(it.spark, it.delta && it.delta >= 0 ? 'var(--up)' : 'var(--down)')}</div>
            )}
          </div>
        ))}
      </div>

      {/* 1. Status Bar Panel */}
      <section className="p" id="status">
        <div className="bar">
          <div className="it">
            <b>Gerbang Sinyal</b>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {gates.umum.open ? (
                <span className="chip c-ok">✓ Gerbang Umum Terbuka</span>
              ) : (
                <span className="chip c-bad">✕ Gerbang Tertutup</span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {Object.entries(gates.aset).map(([asset, g]) => (
                <span
                  key={asset}
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--f-num)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: g.open ? 'var(--good-soft)' : 'var(--bad-soft)',
                    color: g.open ? 'var(--good)' : 'var(--bad)',
                  }}
                >
                  {g.open ? '✓' : '✕'} {asset}
                </span>
              ))}
            </div>
          </div>

          <div className="it">
            <b>Integritas Data</b>
            <div style={{ fontSize: 13 }}>
              <span className="num font-semibold" style={{ color: 'var(--good)' }}>
                {status.counts.ok}
              </span>{' '}
              segar
              {status.counts.basi + status.counts.ditahan + status.counts.gagal + status.counts.mati > 0 && (
                <span style={{ color: 'var(--warn)' }}>
                  {' · '}
                  <span className="num font-semibold">
                    {status.counts.basi + status.counts.ditahan + status.counts.gagal + status.counts.mati}
                  </span>{' '}
                  perhatian
                </span>
              )}{' '}
              <span className="mute">/ {status.n} seri total</span>
            </div>
            <div className="small mute">Umur maksimum dipantau per tier</div>
          </div>

          <div className="it">
            <b>Audit & Konsep</b>
            <div style={{ fontSize: 13 }}>
              <span className="num font-semibold">{audit.counts.pass}</span> lolos ·{' '}
              <span className={`num font-semibold ${audit.counts.fail ? 's-gagal' : ''}`}>
                {audit.counts.fail}
              </span>{' '}
              gagal ·{' '}
              <span className={`num font-semibold ${audit.counts.warn ? 's-basi' : ''}`}>
                {audit.counts.warn}
              </span>{' '}
              peringatan
            </div>
            <div style={{ marginTop: 2 }}>
              {conceptCheck.violations.length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--good)', fontWeight: 600 }}>✓ Konsep terverifikasi</span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--bad)', fontWeight: 600 }}>
                  ✕ {conceptCheck.violations.length} pelanggaran
                </span>
              )}
            </div>
          </div>

          <div className="it">
            <b>Siklus Pembaruan</b>
            <div style={{ fontSize: 13, fontFamily: 'var(--f-num)' }}>
              {bundle.generated
                ? new Date(bundle.generated).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : '–'}
            </div>
            <div className="small mute">
              {lastUpdateMin == null ? 'Memeriksa…' : `${lastUpdateMin} menit lalu`} · Auto-refresh 10 mnt
            </div>
          </div>
        </div>
      </section>

      {/* 2. Pasar */}
      <section className="p" id="pasar">
        <div className="ph">
          <h2>Pasar</h2>
          <span className="tag t-m">TERUKUR</span>
          <span className="sub">
            Nilai terakhir, perubahan waktu, dan 90 hari terakhir. Ketuk kartu untuk grafik interaktif & riwayat lengkap.
          </span>
        </div>

        <div className="cards">
          {CARDS.map(([id, name, kind, dec]) => {
            const s = S(id);
            const isSelected = selectedCardId === id;
            if (!s || !s.p.length) {
              return (
                <button key={id} type="button" className="card" disabled>
                  <div className="nm">
                    <span>{name}</span>
                  </div>
                  <div className="big mute">–</div>
                  <div className="ft">belum ada data</div>
                </button>
              );
            }

            const L = s.p[s.p.length - 1];
            const u = kind === 'pct' ? '%' : '';
            const chgs: [string, number][] = [
              ['1 hari', 1],
              ['1 minggu', 7],
              ['1 bulan', 30],
            ];

            return (
              <button
                key={id}
                type="button"
                className="card"
                aria-pressed={isSelected}
                onClick={() => setSelectedCardId(isSelected ? null : id)}
              >
                <div className="nm">
                  <span>{name}</span>
                  <span className="fq">{s.f}</span>
                </div>
                <div className="big">{nf(L[1], dec)}</div>
                <div className="chg">
                  {chgs.map(([lbl, days]) => {
                    const v = chgOver(s.p, days, kind);
                    return (
                      <span key={lbl} className={cls(v)} title={`Perubahan ${lbl}`}>
                        {arrow(v)} {sg(v, 2)}
                        {u} <span className="mute">{lbl.replace('1 ', '')}</span>
                      </span>
                    );
                  })}
                </div>
                {sparkSVG(cutDays(s.p, 90), isSelected ? 'var(--accent)' : 'var(--s1)')}
                <div className="ft">
                  <span>{fd(L[0])}</span>
                  {s.st !== 'ok' && (
                    <span className="chip c-warn" style={{ padding: '1px 6px', fontSize: 10.5 }}>
                      {s.st} {s.ag != null && s.ag > 0 ? `${s.ag}h` : ''}
                    </span>
                  )}
                  {s.fb && <span>(sumber cadangan)</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail Modal / Panel */}
        {selectedSeriesMeta && selectedCardConfig && (
          <div className="dt">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h3>{selectedSeriesMeta.l}</h3>
              <div className="small mute">
                Sumber: <b>{selectedSeriesMeta.pv || '?'}</b> ({selectedSeriesMeta.r || '?'})
                {selectedSeriesMeta.fb ? ' · sumber cadangan' : ''} · frekuensi {selectedSeriesMeta.f} · data
                terakhir {fd(selectedSeriesMeta.a)} · status {selectedSeriesMeta.st} · satuan {selectedSeriesMeta.u}
              </div>
            </div>

            <div className="rng">
              {[
                ['3 bulan', 91],
                ['1 tahun', 365],
                ['2 tahun', 730],
                ['Semua riwayat', 0],
              ].map(([t, d]) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={detailDays === d}
                  onClick={() => setDetailDays(d as number)}
                >
                  {t}
                </button>
              ))}
            </div>

            <InteractiveChart
              series={[
                {
                  name: selectedSeriesMeta.l,
                  pts: selectedSeriesMeta.p,
                  color: 'var(--s1, #38bdf8)',
                },
              ]}
              days={detailDays}
              height={260}
              dec={selectedCardConfig[3]}
              label={selectedSeriesMeta.l}
            />
          </div>
        )}
      </section>

      {/* 3. Aliran Modal */}
      <section className="p" id="aliran">
        <div className="ph">
          <h2>Aliran modal</h2>
          <span className="tag t-m">TERUKUR</span>
          <span className="sub">
            Ke mana uang bergerak: rotasi kelas aset dan barometer risiko pasar. Proksi kinerja harga relatif.
          </span>
        </div>

        <div className="g2">
          {/* Heatmap */}
          <div>
            <h3 className="sh">Kinerja kelas aset (%)</h3>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Kelas aset</th>
                    {HC.map(([lbl]) => (
                      <th key={lbl} className="r">
                        {lbl}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HEAT.map(([id, name]) => {
                    const s = S(id);
                    return (
                      <tr key={id}>
                        <td style={{ fontWeight: 500 }}>
                          {name}
                          {s && s.st !== 'ok' && <span className="small s-basi"> ({s.st})</span>}
                        </td>
                        {HC.map(([lbl, d, sc]) => {
                          const v = s ? chgOver(s.p, d, 'pct') : null;
                          const bgStyle =
                            v != null
                              ? {
                                  backgroundColor: `color-mix(in srgb, ${
                                    v >= 0 ? 'var(--up)' : 'var(--down)'
                                  } ${Math.min(55, Math.abs(v) * (55 / sc)).toFixed(0)}%, transparent)`,
                                }
                              : {};
                          return (
                            <td key={lbl} className="hm" style={bgStyle} title={`${name}, ${lbl}`}>
                              {v == null ? '–' : `${arrow(v)} ${sg(v, 2)}`}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="small mute" style={{ marginTop: 8 }}>
              Biru/Hijau = apresiasi, Merah = depresiasi. Perubahan 1 hari dihitung dibanding observasi sebelumnya.
            </div>
          </div>

          {/* Risk-on / Risk-off Pairs */}
          <div>
            <h3 className="sh">Pasangan risk-on / risk-off (Horizon 1 bulan)</h3>
            <div className="pairs" style={{ background: 'var(--panel)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--line)' }}>
              {pairsData.tot > 0 && (
                <div className="note" style={{ marginBottom: 10 }}>
                  <b>
                    {pairsData.on} dari {pairsData.tot}
                  </b>{' '}
                  pasangan mencerminkan selera risiko (risk-on)
                  {pairsData.avg != null && (
                    <span> · deviasi rata-rata {sg(pairsData.avg, 2)}σ dari kebiasaannya</span>
                  )}
                  . Batang kanan (hijau/biru) = condong risk-on, batang kiri (merah) = risk-off.
                </div>
              )}

              {pairsData.rows.map((row, idx) => (
                <div key={idx} className="row">
                  <span style={{ fontWeight: 500 }}>{row.name}</span>
                  {row.value == null ? (
                    <span className="mute">belum ada data</span>
                  ) : (
                    <div
                      className="track"
                      role="img"
                      aria-label={`${row.name}: ${row.riskOn ? 'mendukung risk-on' : 'mendukung risk-off'}`}
                    >
                      <div
                        className="fill"
                        style={
                          row.sig >= 0
                            ? { left: '50%', width: `${row.w}%`, background: 'var(--up)' }
                            : {
                                right: '50%',
                                width: `${row.w}%`,
                                background: 'var(--down)',
                                borderRadius: '4px 0 0 4px',
                              }
                        }
                      />
                    </div>
                  )}
                  <span className="small">
                    {row.value != null && (
                      <>
                        <b className="num">{row.ratio ? nf(row.value, 3) : `${sg(row.value, 2)}%`}</b> ·{' '}
                        <span style={{ color: row.riskOn ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>
                          {row.riskOn ? 'risk-on' : 'risk-off'}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Makro Aktual */}
      <section className="p" id="makro">
        <div className="ph">
          <h2>Makro aktual</h2>
          <span className="tag t-m">TERUKUR</span>
          <span className="sub">
            Angka ekonomi resmi dari rilis pertama FRED. Arah rilis mencerminkan perubahan dibanding periode sebelumnya.
          </span>
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Indikator</th>
                <th className="r">Terbaru</th>
                <th className="r">Sebelumnya</th>
                <th>Arah</th>
                <th>Frekuensi</th>
                <th>Tanggal Rilis</th>
                <th>Tren 60 Periode</th>
              </tr>
            </thead>
            <tbody>
              {MAC.map((grp) => (
                <React.Fragment key={grp.group}>
                  <tr>
                    <td colSpan={7} style={{ background: 'var(--panel2)', fontWeight: 700, fontSize: 12 }}>
                      {grp.group.toUpperCase()}
                    </td>
                  </tr>
                  {grp.rows.map((r) => {
                    const s = S(r.id);
                    const d = s ? derive(s.p, r.mode as any) : [];
                    if (!s || d.length < 2) {
                      return (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td colSpan={6} className="mute">
                            belum ada data
                          </td>
                        </tr>
                      );
                    }
                    const a = d[d.length - 1];
                    const prev = d[d.length - 2];
                    const df = a[1] - prev[1];

                    return (
                      <tr key={r.id}>
                        <td>
                          {r.name}
                          {s.st !== 'ok' && <span className="small s-basi"> ({s.st})</span>}
                        </td>
                        <td className="r num">
                          <b>
                            {nf(a[1], r.dec)}
                            {r.u}
                          </b>
                        </td>
                        <td className="r num mute">
                          {nf(prev[1], r.dec)}
                          {r.u}
                        </td>
                        <td className={cls(df)}>
                          {arrow(df)} {df > 0 ? 'naik' : df < 0 ? 'turun' : 'tetap'} {sg(df, r.dec)}
                        </td>
                        <td>
                          <span className="fq">{s.f}</span>
                        </td>
                        <td className="small">{fd(a[0])}</td>
                        <td style={{ minWidth: 120 }}>{sparkSVG(d.slice(-60))}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Kebijakan & Suku Bunga */}
      <section className="p" id="kebijakan">
        <div className="ph">
          <h2>Kebijakan dan suku bunga</h2>
          <span className="tag t-m">TERUKUR</span>
          <span className="sub">Struktur kurva yield obligasi Treasury AS dan benchmark suku bunga bank sentral global.</span>
        </div>

        <div className="g2">
          {/* US Yield Curve */}
          <div>
            <h3 className="sh">Kurva yield AS (Tenor 2Y, 10Y, 30Y)</h3>
            {yieldCurveData && (
              <div className="chart" style={{ position: 'relative' }}>
                <div className="lg">
                  {yieldCurveData.curves.map((c, i) => (
                    <span key={i}>
                      <i style={{ borderColor: c.color }} />
                      {c.name}
                    </span>
                  ))}
                </div>
                <svg viewBox="0 0 520 220" role="img" aria-label="Kurva yield AS">
                  {/* Gridlines */}
                  {[0, 1, 2, 3, 4, 5, 6].map((v) => {
                    const y = 20 + (1 - (v - 3) / 3) * 170;
                    return (
                      <g key={v}>
                        <line x1="42" x2="474" y1={y} y2={y} stroke="var(--chart-grid, #202636)" strokeDasharray="2 3" />
                        <text x="36" y={y + 4} textAnchor="end" fontSize="10.5" fill="var(--chart-axis, #94a3b8)" fontFamily="var(--f-num)">
                          {v.toFixed(1)}%
                        </text>
                      </g>
                    );
                  })}

                  {/* Tenor Labels */}
                  {yieldCurveData.tenors.map((t, i) => {
                    const x = 42 + (i / (yieldCurveData.tenors.length - 1)) * 432;
                    return (
                      <text key={t.id} x={x} y="214" textAnchor="middle" fontSize="11" fill="var(--chart-axis, #94a3b8)" fontWeight="600" fontFamily="var(--f-ui)">
                        Tenor {t.label}
                      </text>
                    );
                  })}

                  {/* Lines & Points */}
                  {yieldCurveData.curves.map((c, cIdx) => {
                    const pts = c.points
                      .map((pt, i) => {
                        if (pt.val == null) return null;
                        const x = 42 + (i / (yieldCurveData.tenors.length - 1)) * 432;
                        const y = 20 + (1 - (pt.val - 3) / 3) * 170;
                        return { x, y, val: pt.val };
                      })
                      .filter(Boolean);

                    if (!pts.length) return null;
                    const pathD = pts.map((p, i) => (i ? 'L' : 'M') + p!.x.toFixed(1) + ',' + p!.y.toFixed(1)).join('');

                    return (
                      <g key={cIdx}>
                        <path d={pathD} fill="none" stroke={c.color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                        {pts.map((p, pIdx) => (
                          <circle
                            key={pIdx}
                            cx={p!.x}
                            cy={p!.y}
                            r="5"
                            fill={c.color}
                            stroke="var(--panel, #0f0f13)"
                            strokeWidth="2"
                          >
                            <title>{`${c.name}: ${nf(p!.val, 2)}%`}</title>
                          </circle>
                        ))}
                      </g>
                    );
                  })}
                </svg>

                {yieldCurveData.lastCurve && (
                  <div className="small note" style={{ marginTop: 8 }}>
                    Selisih yield 10 tahun minus 2 tahun: <b>{sg(yieldCurveData.lastCurve[1], 2)} poin %</b> → kurva{' '}
                    <span style={{ fontWeight: 600, color: yieldCurveData.lastCurve[1] < 0 ? 'var(--bad)' : 'var(--good)' }}>
                      {yieldCurveData.lastCurve[1] < 0 ? 'TERBALIK (inversi yield curve)' : 'normal (slope positif)'}
                    </span>
                    .
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Central Bank Policy Rates */}
          <div>
            <h3 className="sh">Suku bunga kebijakan dunia</h3>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Bank sentral</th>
                    <th className="r">Suku bunga</th>
                    <th className="r">Δ 3 bulan</th>
                    <th className="r">Δ 12 bulan</th>
                    <th>Frek.</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {POL.map(([id, name, note]) => {
                    const s = S(id);
                    if (!s || !s.p.length) {
                      return (
                        <tr key={id}>
                          <td>{name}</td>
                          <td colSpan={5} className="mute">
                            belum ada data
                          </td>
                        </tr>
                      );
                    }
                    const L = s.p[s.p.length - 1];
                    const d3 = chgOver(s.p, 91, 'diff');
                    const d12 = chgOver(s.p, 365, 'diff');

                    return (
                      <tr key={id}>
                        <td>
                          <b>{name}</b>
                          {note && <div className="small mute">{note}</div>}
                        </td>
                        <td className="r num">
                          <b>{nf(L[1], 2)}%</b>
                        </td>
                        <td className={`r num ${cls(d3)}`}>{d3 == null ? '–' : sg(d3, 2)}</td>
                        <td className={`r num ${cls(d12)}`}>{d12 == null ? '–' : sg(d12, 2)}</td>
                        <td>
                          <span className="fq">{s.f}</span>
                        </td>
                        <td className="small">
                          {fd(L[0])}
                          {s.st !== 'ok' && <span className="s-basi"> ({s.st})</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Stres dan Likuiditas */}
      <section className="p" id="stres">
        <div className="ph">
          <h2>Stres dan likuiditas</h2>
          <span className="tag t-m">TERUKUR</span>
          <span className="sub">
            Ketegangan volatilitas pasar, selisih spread kredit, dan ekspansi/kontraksi likuiditas riil bank sentral.
          </span>
        </div>

        {/* Metric Tiles */}
        <div className="tiles">
          {(() => {
            const vix = S('VIX');
            const vix3m = S('VIX3M');
            const hy = S('HYOAS');
            const move = S('MOVE');
            const nfci = S('NFCI');
            const rrp = S('RRP');

            const vL = vix?.p.slice(-1)[0];
            const v3L = vix3m?.p.slice(-1)[0];
            const ratio = vL && v3L ? vL[1] / v3L[1] : null;

            const pVix = vix ? pctRank(vix.p.slice(-252).map((x) => x[1]), vL![1]) : null;
            const pHy = hy ? pctRank(hy.p.slice(-252).map((x) => x[1]), hy.p.slice(-1)[0][1]) : null;
            const pMove = move ? pctRank(move.p.slice(-252).map((x) => x[1]), move.p.slice(-1)[0][1]) : null;
            const pNfci = nfci ? pctRank(nfci.p.slice(-52).map((x) => x[1]), nfci.p.slice(-1)[0][1]) : null;
            const pRrp = rrp ? pctRank(rrp.p.slice(-252).map((x) => x[1]), rrp.p.slice(-1)[0][1]) : null;

            return (
              <>
                <div className="tile">
                  <b>VIX Saham AS</b>
                  <div className="v">{vL ? nf(vL[1], 2) : '–'}</div>
                  <div className="small mute">
                    persentil {pVix != null ? nf(pVix, 0) : '–'} · {fd(vL?.[0])}
                  </div>
                </div>

                {ratio != null && (
                  <div className="tile">
                    <b>Struktur Tenor VIX</b>
                    <div className="v">{nf(ratio, 3)}</div>
                    <div className="small mute">
                      {ratio < 1 ? (
                        <span style={{ color: 'var(--good)', fontWeight: 600 }}>contango (tenang)</span>
                      ) : (
                        <span style={{ color: 'var(--bad)', fontWeight: 600 }}>backwardation (tegang)</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="tile">
                  <b>Selisih Kredit HY (%)</b>
                  <div className="v">{hy ? nf(hy.p.slice(-1)[0][1], 2) : '–'}</div>
                  <div className="small mute">
                    persentil {pHy != null ? nf(pHy, 0) : '–'} · {fd(hy?.p.slice(-1)[0][0])}
                  </div>
                </div>

                <div className="tile">
                  <b>MOVE (Volatilitas Obligasi)</b>
                  <div className="v">{move ? nf(move.p.slice(-1)[0][1], 1) : '–'}</div>
                  <div className="small mute">
                    persentil {pMove != null ? nf(pMove, 0) : '–'} · {fd(move?.p.slice(-1)[0][0])}
                  </div>
                </div>

                <div className="tile">
                  <b>Kondisi Keuangan (NFCI)</b>
                  <div className="v">{nfci ? nf(nfci.p.slice(-1)[0][1], 3) : '–'}</div>
                  <div className="small mute">
                    persentil {pNfci != null ? nf(pNfci, 0) : '–'} · {fd(nfci?.p.slice(-1)[0][0])}
                  </div>
                </div>

                <div className="tile">
                  <b>Reverse Repo Fed</b>
                  <div className="v">{rrp ? `${nf(rrp.p.slice(-1)[0][1], 1)} B` : '–'}</div>
                  <div className="small mute">
                    persentil {pRrp != null ? nf(pRrp, 0) : '–'} · {fd(rrp?.p.slice(-1)[0][0])}
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* Range switcher */}
        <div className="rng">
          {[
            ['3 bulan', 91],
            ['1 tahun', 365],
            ['2 tahun', 730],
          ].map(([t, d]) => (
            <button
              key={t}
              type="button"
              aria-pressed={stressDays === d}
              onClick={() => setStressDays(d as number)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* 3 Charts in Grid */}
        <div className="g3">
          <div>
            <h3 className="sh">VIX dan VIX 3 bulan</h3>
            <InteractiveChart
              series={[
                ...(S('VIX') ? [{ name: 'VIX', pts: S('VIX')!.p, color: 'var(--s1, #38bdf8)' }] : []),
                ...(S('VIX3M') ? [{ name: 'VIX 3 bulan', pts: S('VIX3M')!.p, color: 'var(--s2, #fb923c)' }] : []),
              ]}
              days={stressDays}
              height={210}
              dec={1}
              label="VIX dan VIX 3 bulan"
            />
          </div>

          <div>
            <h3 className="sh">Selisih kredit high-yield (%)</h3>
            <InteractiveChart
              series={S('HYOAS') ? [{ name: 'Selisih kredit HY', pts: S('HYOAS')!.p, color: 'var(--s1, #38bdf8)' }] : []}
              days={stressDays}
              height={210}
              dec={2}
              label="Selisih kredit high-yield"
            />
          </div>

          <div>
            <h3 className="sh">Likuiditas bersih Fed (miliar USD)</h3>
            <InteractiveChart
              series={liqSeries.length ? [{ name: 'Likuiditas bersih', pts: liqSeries, color: 'var(--s1, #38bdf8)' }] : []}
              days={stressDays}
              height={210}
              dec={0}
              label="Likuiditas bersih Fed"
            />
            <div className="small mute" style={{ marginTop: 6 }}>
              Neraca Fed dikurangi kas Treasury (TGA) dan fasilitas reverse repo.
            </div>
          </div>
        </div>
      </section>

      {/* 7. Posisi Spekulan (COT) */}
      <section className="p" id="posisi">
        <div className="ph">
          <h2>Posisi spekulan (COT)</h2>
          <span className="tag t-m">TERUKUR</span>
          <span className="sub">
            Posisi bersih non-komersial (long dikurangi short) terhadap 3 tahun terakhir dari laporan mingguan CFTC.
          </span>
        </div>

        <div className="small mute" style={{ marginBottom: 10 }}>
          Skala persentil: 0–10 ekstrem short · 10–35 condong short · 35–65 seimbang · 65–90 condong long · 90–100 ekstrem
          long.
        </div>

        <div className="cot" style={{ background: 'var(--panel)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--line)' }}>
          {Object.entries(COTL).map(([id, label]) => {
            const s = S(id);
            if (!s || s.p.length < 10) {
              return (
                <div key={id} className="row">
                  <span>{label}</span>
                  <span className="mute">belum ada data cukup</span>
                  <span></span>
                </div>
              );
            }

            const a = s.p.slice(-156).map((p) => p[1]);
            const L = s.p[s.p.length - 1];
            const prev = s.p[s.p.length - 2] || L;
            const dw = L[1] - prev[1];
            const pr = pctRank(a, L[1]) ?? 50;

            const category =
              pr < 10
                ? { text: 'Ekstrem short', chipCls: 'c-bad' }
                : pr < 35
                ? { text: 'Condong short', chipCls: 'c-warn' }
                : pr < 65
                ? { text: 'Seimbang', chipCls: '' }
                : pr < 90
                ? { text: 'Condong long', chipCls: 'c-warn' }
                : { text: 'Ekstrem long', chipCls: 'c-bad' };

            return (
              <div key={id} className="row">
                <span>
                  <b>{label}</b>
                  <div className="small mute">
                    <span className="fq">{s.f}</span> {fd(L[0])} · riwayat {a.length} minggu
                  </div>
                </span>

                <div
                  className="zone"
                  role="img"
                  aria-label={`${label}: persentil ${nf(pr, 0)}, ${category.text}`}
                >
                  <i style={{ width: '10%' }} />
                  <i style={{ width: '25%' }} />
                  <i style={{ width: '30%' }} />
                  <i style={{ width: '25%' }} />
                  <i style={{ width: '10%' }} />
                  <span className="mk" style={{ left: `calc(${pr}% - 2px)` }} />
                </div>

                <span className="small">
                  <span
                    className={`chip ${category.chipCls}`}
                    style={!category.chipCls ? { background: 'var(--panel2)', color: 'var(--ink)' } : {}}
                  >
                    {category.text}
                  </span>{' '}
                  <b className="num">{nf(pr, 0)}%</b>
                  <div className="num mute" style={{ marginTop: 2 }}>
                    {nf(L[1], 0)} kontrak · {arrow(dw)} {sg(dw, 0)} minggu ini
                  </div>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 8. Kalender Rilis */}
      <section className="p" id="kalender">
        <div className="ph">
          <h2>Kalender rilis</h2>
          <span className="tag t-m">TERUKUR</span>
          <span className="sub">
            Rilis AS yang akan datang beserta konsensus pasar, dan rilis terakhir dengan deviasi kejutan makro.
          </span>
        </div>

        <div className="g2">
          {/* Upcoming */}
          <div>
            <h3 className="sh">Akan datang</h3>
            <div className="tw">
              {consensus.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Tanggal (AS)</th>
                      <th>Rilis</th>
                      <th className="r">Konsensus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consensus.slice(0, 10).map((c, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--f-num)' }}>{fd(c.date)}</td>
                        <td style={{ fontWeight: 500 }}>{IND_NAMES[c.ind] || c.ind}</td>
                        <td className="r num">
                          <b>{nf(c.cons, 2)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">Belum ada rilis mendatang di kalender konsensus.</div>
              )}
            </div>
          </div>

          {/* Last releases */}
          <div>
            <h3 className="sh">Rilis terakhir</h3>
            <div className="tw">
              {feed?.releases && feed.releases.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Rilis</th>
                      <th className="r">Aktual</th>
                      <th className="r">Konsensus</th>
                      <th className="r">Selisih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feed.releases.slice(0, 10).map((r, i) => {
                      const df = r.cons != null && r.act != null ? r.act - r.cons : null;
                      return (
                        <tr key={i}>
                          <td style={{ fontFamily: 'var(--f-num)' }}>{fd(r.date)}</td>
                          <td style={{ fontWeight: 500 }}>{IND_NAMES[r.ind] || r.ind}</td>
                          <td className="r num">
                            <b>{nf(r.act, 2)}</b>
                          </td>
                          <td className="r num mute">
                            {r.cons == null ? '–' : nf(r.cons, 2)}
                            {r.src === 'proxy' && <span className="small"> (proksi)</span>}
                          </td>
                          <td className={`r num ${cls(df)}`}>
                            {df == null ? '–' : `${arrow(df)} ${sg(df, 2)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty">Belum ada rilis terakhir yang terekam.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 9. Sinyal Fundamental Note */}
      <OtakPanel phase={phase} otak={otak} />

      <section className="p" id="sinyal">
        <div className="ph">
          <h2>Sinyal fundamental</h2>
          <span className="tag t-d">DIPUTUSKAN</span>
        </div>
        <div className="note" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            Mesin inferensi multi-faktor BUY / SELL / HOLD, penguraian atribusi faktor makro, dan simulasi skenario
            geopolitik terintegrasi di <b>Workbench Lanjutan</b>.
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={onNavigateToLanjutan}
          >
            Buka Workbench Sinyal & Model →
          </button>
        </div>
      </section>

      {/* 10. Kesehatan Data & Legenda */}
      <section className="p" id="data">
        <div className="ph">
          <h2>Kesehatan data dan legenda</h2>
          <span className="tag t-m">TERUKUR</span>
          <span className="sub">
            Setiap angka di halaman ini diverifikasi: sumber penyedia, ticker, tanggal observasi, dan validasi gerbang.
          </span>
        </div>

        <div className="note" style={{ marginBottom: 12 }}>
          <b>Frekuensi:</b> harian, mingguan, bulanan, kuartalan. <b>Status:</b> ok = segar · basi = lewat batas umur ·
          ditahan = anomali menunggu konfirmasi · gagal = penyedia tidak merespons · mati = tidak diperbarui lama.
        </div>

        {/* Group Filter */}
        <div className="foot" role="group" aria-label="Filter kelompok">
          {healthGroups.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={healthFilter === g}
              onClick={() => setHealthFilter(g)}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Health Table */}
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Seri</th>
                <th>Kelompok</th>
                <th>Frekuensi</th>
                <th>Sumber</th>
                <th>Data terakhir</th>
                <th className="r">Umur (hari)</th>
                <th>Status</th>
                <th>Kepercayaan</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {filteredHealthSeries.map((r) => {
                const icon =
                  r.state === 'ok'
                    ? '✓'
                    : r.state === 'basi'
                    ? '!'
                    : r.state === 'ditahan'
                    ? '⏸'
                    : '✕';
                const trust = audit.trust[r.id];
                const trustCls =
                  trust === 'terverifikasi' || trust === 'konsisten'
                    ? 's-ok'
                    : trust === 'bermasalah'
                    ? 's-gagal'
                    : 's-basi';

                return (
                  <tr key={r.id}>
                    <td>
                      <b style={{ color: 'var(--ink)' }}>{r.label}</b>
                      <div className="small mute">
                        {r.id}
                        {r.unverified && ' · belum teruji penuh'}
                      </div>
                    </td>
                    <td>{r.group}</td>
                    <td>
                      <span className="fq">{r.freq}</span>
                    </td>
                    <td className="small">
                      {r.prov || '–'}
                      {r.ref && `: ${r.ref}`}
                      {r.fallback && <b> (cadangan)</b>}
                    </td>
                    <td className="small" style={{ fontFamily: 'var(--f-num)' }}>{fd(r.asof)}</td>
                    <td className="r num">{r.age == null ? '–' : r.age}</td>
                    <td className={`state s-${r.state}`}>
                      {icon} {r.state}
                    </td>
                    <td className="small">
                      {trust ? <span className={`state ${trustCls}`}>{trust}</span> : <span className="mute">–</span>}
                    </td>
                    <td className="small mute">{r.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Audit Silang */}
        <h3 style={{ margin: '20px 0 8px', fontSize: 15, fontFamily: 'var(--f-display)', fontWeight: 700 }}>
          Audit silang: apakah angkanya benar?
        </h3>
        <div className="small" style={{ marginBottom: 10, color: 'var(--mute)' }}>
          Dibuat{' '}
          {new Date(audit.generated).toLocaleString('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}{' '}
          · {audit.counts.pass} lolos · {audit.counts.warn} peringatan · {audit.counts.fail} gagal
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Uji</th>
                <th>Jenis</th>
                <th>Hasil</th>
                <th>Rincian</th>
              </tr>
            </thead>
            <tbody>
              {audit.checks.map((c, i) => (
                <tr key={i}>
                  <td>
                    <b style={{ color: 'var(--ink)' }}>{c.name}</b>
                    <div className="small mute">{c.series.join(', ')}</div>
                  </td>
                  <td className="small">{c.kind}</td>
                  <td
                    className={`state ${
                      c.status === 'pass' ? 's-ok' : c.status === 'warn' ? 's-basi' : 's-gagal'
                    }`}
                  >
                    {c.status === 'pass' ? '✓ lolos' : c.status === 'warn' ? '! peringatan' : '✕ gagal'}
                  </td>
                  <td className="small mute">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        Bukan saran investasi. Sumber data: FRED, Yahoo Finance (yfinance), CFTC, DefiLlama, kalender konsensus mingguan.
        Sistem pemantauan makroekonomi terminal.
      </footer>
    </main>
  );
};
