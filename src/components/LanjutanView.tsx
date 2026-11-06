import React, { useState, useMemo } from 'react';
import { BetasData } from '../types/macro';
import { InteractiveChart } from './InteractiveChart';

export interface LanjutanState {
  v: number;
  asof: string;
  example: boolean;
  set: {
    hl: number;
    win: number;
    k: number;
    gi: 'aktual' | 'surprise';
  };
  sigma: Record<string, number>;
  releases: {
    id: string;
    date: string;
    ind: string;
    act: number | null;
    cons: number | null;
    prev: number | null;
    note: string;
  }[];
  cb: Record<
    string,
    {
      rate: number | null;
      imp: number | null;
      infl: number | null;
      txt: number;
      dec: number;
    }
  >;
  cot: Record<
    string,
    {
      rows: { d: string; net: number; oi: number }[];
      min: number | null;
      max: number | null;
    }
  >;
  shock: {
    vix: number | null;
    vix3m: number | null;
    move: number | null;
    hy: number | null;
    hyp: number | null;
    scn: string;
    int: number;
    ph: number;
  };
  liq: {
    w0: number | null;
    t0: number | null;
    r0: number | null;
    w1: number | null;
    t1: number | null;
    r1: number | null;
  };
  model: {
    beta: Record<string, number[]>;
    hub: {
      ry: Record<string, number>;
      usd: Record<string, number>;
    };
    mult: Record<string, { ry: number; usd: number }>;
  };
}

interface LanjutanViewProps {
  betasData: BetasData | null;
  onBackToDesk: () => void;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const num = (v: any) => {
  if (v === '' || v == null) return null;
  const x = parseFloat(String(v).replace(',', '.'));
  return isFinite(x) ? x : null;
};
const sg = (x: number | null | undefined, d = 2) =>
  x == null || !isFinite(x) ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
const fx = (x: number | null | undefined, d = 2) =>
  x == null || !isFinite(x) ? '–' : x.toFixed(d);
const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a: string, b: string) =>
  Math.round((new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / 864e5);
const dow = (s: string) => new Date(s + 'T00:00:00Z').getUTCDay();

const IND = [
  { id: 'cpi_core', n: 'CPI inti (m/m)', c: 'I', s: 1, u: '%', sd: 0.1 },
  { id: 'cpi', n: 'CPI headline (m/m)', c: 'I', s: 1, u: '%', sd: 0.12 },
  { id: 'pce_core', n: 'PCE inti (m/m)', c: 'I', s: 1, u: '%', sd: 0.08 },
  { id: 'ppi', n: 'PPI (m/m)', c: 'I', s: 1, u: '%', sd: 0.25 },
  { id: 'ahe', n: 'Upah per jam (m/m)', c: 'I', s: 1, u: '%', sd: 0.12 },
  { id: 'nfp', n: 'NFP', c: 'G', s: 1, u: 'ribu', sd: 75 },
  { id: 'unemp', n: 'Tingkat pengangguran', c: 'G', s: -1, u: '%', sd: 0.12 },
  { id: 'claims', n: 'Klaim awal pengangguran', c: 'G', s: -1, u: 'ribu', sd: 15 },
  { id: 'jolts', n: 'JOLTS lowongan', c: 'G', s: 1, u: 'juta', sd: 0.35 },
  { id: 'ism_m', n: 'ISM manufaktur', c: 'G', s: 1, u: 'poin', sd: 1.5 },
  { id: 'ism_s', n: 'ISM jasa', c: 'G', s: 1, u: 'poin', sd: 1.8 },
  { id: 'retail', n: 'Penjualan ritel (m/m)', c: 'G', s: 1, u: '%', sd: 0.5 },
  { id: 'ip', n: 'Produksi industri (m/m)', c: 'G', s: 1, u: '%', sd: 0.3 },
  { id: 'empire', n: 'Empire State (NY Fed)', c: 'G', s: 1, u: 'poin', sd: 8 },
  { id: 'philly', n: 'Philly Fed', c: 'G', s: 1, u: 'poin', sd: 9 },
  { id: 'gdp', n: 'GDP (q/q anualisasi)', c: 'G', s: 1, u: '%', sd: 0.7 },
  { id: 'cn_pmi', n: 'PMI manufaktur China', c: 'G', s: 1, u: 'poin', sd: 0.7 },
  { id: 'eu_pmi', n: 'PMI komposit Eropa', c: 'G', s: 1, u: 'poin', sd: 1.2 },
];
const IND_BY = Object.fromEntries(IND.map((d) => [d.id, d]));

const CBS: [string, string][] = [
  ['FED', 'Federal Reserve'],
  ['ECB', 'ECB'],
  ['BOE', 'Bank of England'],
  ['BOJ', 'Bank of Japan'],
  ['RBA', 'RBA'],
  ['BI', 'Bank Indonesia'],
];

const COTS: [string, string][] = [
  ['GOLD', 'Emas'],
  ['CRUDE', 'Minyak WTI'],
  ['COPPER', 'Tembaga'],
  ['EUR', 'EUR'],
  ['GBP', 'GBP'],
  ['JPY', 'JPY'],
  ['AUD', 'AUD'],
  ['SPX', 'S&P 500 E-mini'],
  ['NDX', 'Nasdaq 100 E-mini'],
  ['BTC', 'Bitcoin CME'],
];

const ASSETS: { k: string; n: string; cot?: string; inv?: boolean; hub?: string }[] = [
  { k: 'XAU', n: 'XAUUSD (emas)', cot: 'GOLD' },
  { k: 'WTI', n: 'WTI minyak', cot: 'CRUDE' },
  { k: 'CU', n: 'Tembaga', cot: 'COPPER' },
  { k: 'SPX', n: 'S&P 500', cot: 'SPX' },
  { k: 'NDX', n: 'Nasdaq 100', cot: 'NDX' },
  { k: 'BTC', n: 'Bitcoin', cot: 'BTC' },
  { k: 'EEM', n: 'EEM (emerging)' },
  { k: 'IHSG', n: 'IHSG' },
  { k: 'EURUSD', n: 'EURUSD', cot: 'EUR' },
  { k: 'GBPUSD', n: 'GBPUSD', cot: 'GBP' },
  { k: 'USDJPY', n: 'USDJPY', cot: 'JPY', inv: true },
  { k: 'AUDUSD', n: 'AUDUSD', cot: 'AUD' },
  { k: 'USDIDR', n: 'USDIDR' },
  { k: 'US02Y', n: 'Yield US 2Y' },
  { k: 'DXY', n: 'DXY (hub USD)', hub: 'usd' },
  { k: 'RY', n: 'Real yield 10Y (hub)', hub: 'ry' },
];

const BETA_PRIOR: Record<string, number[]> = {
  XAU: [0, 0.3, 0, 0.3, 0.4, -0.7, -0.5],
  WTI: [0.5, 0.4, 0, 0.1, -0.4, 0, -0.3],
  CU: [0.7, 0, 0, 0.2, -0.5, 0, -0.4],
  SPX: [0.4, -0.1, -0.1, 0.4, -0.7, -0.4, -0.2],
  NDX: [0.3, -0.1, -0.1, 0.5, -0.8, -0.6, -0.2],
  BTC: [0.1, 0, 0, 0.7, -0.7, -0.4, -0.4],
  EEM: [0.3, 0, 0, 0.4, -0.6, -0.3, -0.5],
  IHSG: [0.3, 0, 0, 0.3, -0.6, -0.3, -0.4],
  EURUSD: [0, 0, 0, 0, -0.2, 0, -0.9],
  GBPUSD: [0.1, 0, 0, 0, -0.3, 0, -0.8],
  USDJPY: [0.1, 0, 0, 0, -0.5, 0.6, 0.4],
  AUDUSD: [0.4, 0, 0, 0, -0.5, -0.1, -0.6],
  USDIDR: [-0.1, 0, 0, -0.2, 0.6, 0.2, 0.7],
  US02Y: [0.3, 0.3, 0.9, 0, -0.4, 0.3, 0],
};

const QUAD: Record<string, string> = {
  GOLD: 'Goldilocks (Growth Akselerasi, Inflasi Melandai)',
  OVER: 'Reflasi / Overheating (Growth & Inflasi Meningkat)',
  STAG: 'Stagflasi (Growth Melambat, Inflasi Membandel)',
  SLOW: 'Perlambatan / Deflasi (Growth & Inflasi Melemah)',
};

const PH: Record<number, Record<string, number>> = {
  1: {
    XAU: -0.5,
    WTI: -1.5,
    CU: -1.5,
    SPX: -2,
    NDX: -2,
    BTC: -2,
    EEM: -2,
    IHSG: -2,
    EURUSD: -1,
    GBPUSD: -1.2,
    USDJPY: -1.2,
    AUDUSD: -1.5,
    USDIDR: 1.5,
    US02Y: -1,
    DXY: 1.8,
    RY: -0.5,
  },
  2: {
    XAU: 1.2,
    WTI: 0.3,
    CU: 0.3,
    SPX: 0.8,
    NDX: 1,
    BTC: 1,
    EEM: 0.7,
    IHSG: 0.5,
    EURUSD: 0.8,
    GBPUSD: 0.8,
    USDJPY: -0.3,
    AUDUSD: 0.6,
    USDIDR: -0.5,
    US02Y: -1.5,
    DXY: -1.2,
    RY: -1.2,
  },
  3: {
    XAU: 1,
    WTI: 1.2,
    CU: 1.5,
    SPX: 1.5,
    NDX: 1.8,
    BTC: 1.8,
    EEM: 1.4,
    IHSG: 1.2,
    EURUSD: 0.6,
    GBPUSD: 0.6,
    USDJPY: 0.6,
    AUDUSD: 1.2,
    USDIDR: -0.8,
    US02Y: 0.6,
    DXY: -0.6,
    RY: 0.4,
  },
};

const PHN: Record<number, string> = {
  1: 'Fase 1: Panik Pasar, Cash is King',
  2: 'Fase 2: Intervensi Likuiditas Bank Sentral',
  3: 'Fase 3: Pemulihan Aset Berisiko / Reflasi',
};

const SCEN: Record<string, { n: string; t: string; v: Record<string, number> }> = {
  none: { n: 'Tidak Ada Overlay', t: '', v: {} },
  energi: {
    n: 'Shock Pasokan Energi Global',
    t: 'Arus modal menuju energi, USD, emas. Menekan importir energi dan bursa Eropa.',
    v: { WTI: 1.5, XAU: 0.5, DXY: 0.5, EURUSD: -0.6, SPX: -0.5, NDX: -0.4, EEM: -0.4, USDIDR: 0.4, CU: -0.2 },
  },
  bank: {
    n: 'Stres Perbankan Regional',
    t: 'Flight to quality ke instrumen pasar uang, yield obligasi pendek turun drastis, emas menguat.',
    v: { US02Y: -1.5, XAU: 1, SPX: -0.5, NDX: 0.3, DXY: -0.2, RY: -0.7 },
  },
  tarif: {
    n: 'Eskalasi Perang Tarif / Dagang',
    t: 'Dekomposisi safe-haven klasik: emas melonjak, term premium Treasury AS meningkat.',
    v: { DXY: -0.8, XAU: 1.2, SPX: -1, NDX: -1, CU: -0.8, EEM: -0.8, AUDUSD: -0.6, USDIDR: 0.5, RY: 0.3 },
  },
  carry: {
    n: 'Unwind Carry Trade JPY',
    t: 'Yen menguat tajam, likuidasi aset berisiko dan kripto global, lonjakan VIX temporer.',
    v: { USDJPY: -2, SPX: -1, NDX: -1, BTC: -1.2, AUDUSD: -1, XAU: 0.3, EEM: -0.6 },
  },
  mideast: {
    n: 'Ketegangan Geopolitik Timur Tengah',
    t: 'Premi risiko minyak mentah dan emas meningkat, penguatan dolar AS temporer.',
    v: { WTI: 1.2, XAU: 0.8, DXY: 0.4, SPX: -0.4, EEM: -0.3, USDIDR: 0.3 },
  },
  pandemi: {
    n: 'Kontraksi Permintaan Global',
    t: 'Likuidasi komoditas industri dan ekuitas, ekspansi safe-haven ke obligasi pemerintah.',
    v: { WTI: -1.2, CU: -1, SPX: -1, NDX: -0.5, XAU: 0.3, DXY: 0.5, US02Y: -1 },
  },
};

const TXT_OPTIONS: [number, string][] = [
  [-2, 'Sangat Dovish (-2)'],
  [-1, 'Dovish (-1)'],
  [0, 'Netral (0)'],
  [1, 'Hawkish (+1)'],
  [2, 'Sangat Hawkish (+2)'],
];

const DEC_OPTIONS: [number, string][] = [
  [-2, 'Jauh Lebih Dovish (-2)'],
  [-1, 'Sedikit Lebih Dovish (-1)'],
  [0, 'Sesuai Ekspektasi (0)'],
  [1, 'Sedikit Lebih Hawkish (+1)'],
  [2, 'Jauh Lebih Hawkish (+2)'],
];

const buildInitialState = (): LanjutanState => {
  const today = new Date().toISOString().slice(0, 10);
  const beta: Record<string, number[]> = {};
  for (const k in BETA_PRIOR) beta[k] = [...BETA_PRIOR[k]];

  return {
    v: 1,
    asof: today,
    example: true,
    set: { hl: 30, win: 90, k: 1, gi: 'surprise' },
    sigma: {},
    releases: [
      { id: 'x1', date: addDays(today, -3), ind: 'ism_s', act: 51.5, cons: 51, prev: null, note: 'contoh' },
      { id: 'x2', date: addDays(today, -5), ind: 'claims', act: 232, cons: 225, prev: null, note: 'contoh' },
      { id: 'x3', date: addDays(today, -9), ind: 'pce_core', act: 0.2, cons: 0.2, prev: null, note: 'contoh' },
      { id: 'x4', date: addDays(today, -18), ind: 'cpi_core', act: 0.3, cons: 0.25, prev: null, note: 'contoh' },
      { id: 'x5', date: addDays(today, -20), ind: 'retail', act: 0.4, cons: 0.3, prev: null, note: 'contoh' },
      { id: 'x6', date: addDays(today, -29), ind: 'nfp', act: 142, cons: 160, prev: null, note: 'contoh' },
      { id: 'x7', date: addDays(today, -29), ind: 'unemp', act: 4.4, cons: 4.3, prev: null, note: 'contoh' },
      { id: 'x8', date: addDays(today, -29), ind: 'ahe', act: 0.4, cons: 0.3, prev: null, note: 'contoh' },
      { id: 'x9', date: addDays(today, -31), ind: 'ism_m', act: 49.2, cons: 49.8, prev: null, note: 'contoh' },
      { id: 'x10', date: addDays(today, -35), ind: 'gdp', act: 3.0, cons: 2.8, prev: null, note: 'contoh' },
    ],
    cb: {
      FED: { rate: 4.75, imp: 4.25, infl: 2.7, txt: 0, dec: 0 },
      ECB: { rate: 3.25, imp: 3.0, infl: 2.1, txt: 0, dec: 0 },
      BOE: { rate: 5.0, imp: 4.5, infl: 2.3, txt: 0, dec: 0 },
      BOJ: { rate: 0.25, imp: 0.5, infl: 2.5, txt: 1, dec: 0 },
      RBA: { rate: 4.35, imp: 4.2, infl: 2.8, txt: 0, dec: 0 },
      BI: { rate: 6.0, imp: 5.75, infl: 2.2, txt: 0, dec: 0 },
    },
    cot: {
      GOLD: {
        rows: Array.from({ length: 14 }, (_, i) => ({
          d: addDays(today, -7 * (13 - i)),
          net: Math.round(180000 + i * 5000 + Math.sin(i) * 10000),
          oi: 520000,
        })),
        min: null,
        max: null,
      },
      CRUDE: { rows: [], min: null, max: null },
      COPPER: { rows: [], min: null, max: null },
      EUR: { rows: [], min: null, max: null },
      GBP: { rows: [], min: null, max: null },
      JPY: {
        rows: Array.from({ length: 14 }, (_, i) => ({
          d: addDays(today, -7 * (13 - i)),
          net: Math.round(-40000 - i * 3000 + Math.cos(i) * 8000),
          oi: 240000,
        })),
        min: null,
        max: null,
      },
      AUD: { rows: [], min: null, max: null },
      SPX: { rows: [], min: null, max: null },
      NDX: { rows: [], min: null, max: null },
      BTC: { rows: [], min: null, max: null },
    },
    shock: {
      vix: 19.5,
      vix3m: 21.8,
      move: 98,
      hy: 3.4,
      hyp: 3.3,
      scn: 'none',
      int: 1,
      ph: 1,
    },
    liq: {
      w0: 6600,
      t0: 850,
      r0: 120,
      w1: 6580,
      t1: 820,
      r1: 140,
    },
    model: {
      beta,
      hub: {
        ry: { P: 0.6, G: 0.3, I: 0.1, R: -0.3, L: -0.1 },
        usd: { Pd: 0.4, RY: 0.3, R: 0.2, L: -0.15, G: 0.1 },
      },
      mult: {
        GOLD: { ry: 0.6, usd: 1 },
        OVER: { ry: 1.3, usd: 1 },
        STAG: { ry: 1.5, usd: 1 },
        SLOW: { ry: 0.6, usd: 1.1 },
      },
    },
  };
};

export const LanjutanView: React.FC<LanjutanViewProps> = ({ betasData, onBackToDesk }) => {
  const [state, setState] = useState<LanjutanState>(() => {
    try {
      const saved = localStorage.getItem('med-v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return buildInitialState();
  });

  const [activeTab, setActiveTab] = useState<'dash' | 'rel' | 'cb' | 'cot' | 'shock' | 'model'>('dash');
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>('');

  const [relDraft, setRelDraft] = useState({
    date: state.asof,
    ind: 'cpi_core',
    act: '',
    cons: '',
  });
  const [relCsv, setRelCsv] = useState('');
  const [cotKey, setCotKey] = useState('GOLD');
  const [cotDraft, setCotDraft] = useState({ d: '', net: '', oi: '' });
  const [cotCsv, setCotCsv] = useState('');
  const [impJson, setImpJson] = useState('');

  const saveState = (newState: LanjutanState) => {
    setState(newState);
    try {
      localStorage.setItem('med-v1', JSON.stringify(newState));
    } catch (e) {}
  };

  // Inference Model Computation
  const engineResult = useMemo(() => {
    const acc = { G: { n: 0, d: 0, c: 0 }, I: { n: 0, d: 0, c: 0 } };
    const rows: any[] = [];

    for (const r of state.releases) {
      const d = IND_BY[r.ind];
      if (!d) continue;
      const age = diffDays(state.asof, r.date);
      const sigmaVal = state.sigma[r.ind] || d.sd;
      const z = r.cons == null || r.act == null ? null : (d.s * (r.act - r.cons)) / sigmaVal;
      const inW = age >= 0 && age <= state.set.win;
      const w = inW ? Math.pow(0.5, age / state.set.hl) : 0;
      rows.push({ ...r, z, age, w, cat: d.c, sig: sigmaVal });
      if (z != null && inW) {
        const o = acc[d.c as 'G' | 'I'];
        o.n += w * clamp(z, -3, 3);
        o.d += w;
        o.c++;
      }
    }

    const calcIdx = (o: { n: number; d: number }) => clamp(o.n / (o.d + state.set.k), -3, 3);
    const sG = calcIdx(acc.G);
    const sI = calcIdx(acc.I);

    const cbStance = (c: any) => {
      const em = c.rate != null && c.imp != null ? clamp((c.imp - c.rate) / 0.25, -4, 4) : 0;
      const has = (c.rate != null && c.imp != null) || !!c.txt || !!c.dec;
      return {
        st: clamp(0.35 * em + 0.35 * (c.txt || 0) + 0.3 * (c.dec || 0), -3, 3),
        em,
        has,
        real: c.rate != null && c.infl != null ? c.rate - c.infl : null,
      };
    };

    const cbs: Record<string, ReturnType<typeof cbStance>> = {};
    for (const [k] of CBS) cbs[k] = cbStance(state.cb[k] || {});

    const P = cbs.FED?.st || 0;
    const oth = CBS.slice(1)
      .map(([k]) => cbs[k])
      .filter((c) => c?.has);
    const Pd = P - (oth.length ? oth.reduce((a, c) => a + c.st, 0) / oth.length : 0);

    const s = state.shock;
    const ratio = s.vix != null && s.vix3m ? s.vix / s.vix3m : null;
    const hyd = s.hy != null && s.hyp != null ? s.hy - s.hyp : null;

    const triggers = [
      { k: 'VIX di atas 30', on: s.vix != null && s.vix > 30, v: s.vix != null ? fx(s.vix, 1) : '–' },
      { k: 'VIX / VIX3M di atas 1 (inverted)', on: ratio != null && ratio > 1, v: ratio != null ? fx(ratio, 2) : '–' },
      { k: 'MOVE di atas 130', on: s.move != null && s.move > 130, v: s.move != null ? fx(s.move, 0) : '–' },
      { k: 'HY OAS naik lebih dari 1,0 poin (20 hari)', on: hyd != null && hyd > 1, v: hyd != null ? sg(hyd, 2) : '–' },
    ];
    const triggerCount = triggers.filter((x) => x.on).length;
    const cs: number[] = [];
    if (s.vix != null) cs.push((s.vix - 18) / 10);
    if (ratio != null) cs.push((ratio - 0.9) / 0.15);
    if (s.move != null) cs.push((s.move - 90) / 40);
    if (hyd != null) cs.push(hyd / 0.5);
    const R = cs.length ? clamp(cs.map((c) => clamp(c, -0.5, 3)).reduce((a, b) => a + b, 0) / cs.length, 0, 3) : 0;
    const shockMode: 'NORMAL' | 'WASPADA' | 'KRISIS' = triggerCount >= 2 ? 'KRISIS' : triggerCount === 1 ? 'WASPADA' : 'NORMAL';

    const l = state.liq;
    const liqOk = ['w0', 't0', 'r0', 'w1', 't1', 'r1'].every((k) => (l as any)[k] != null);
    const nowLiq = liqOk ? l.w0! - l.t0! - l.r0! : null;
    const prevLiq = liqOk ? l.w1! - l.t1! - l.r1! : null;
    const diffLiq = nowLiq != null && prevLiq != null ? nowLiq - prevLiq : null;
    const L = diffLiq != null ? clamp(diffLiq / 150, -2, 2) : 0;

    const q: 'GOLD' | 'OVER' | 'STAG' | 'SLOW' = sG >= 0 ? (sI >= 0 ? 'OVER' : 'GOLD') : sI >= 0 ? 'STAG' : 'SLOW';
    const m = state.model.mult[q] || { ry: 1, usd: 1 };
    const h = state.model.hub;

    const RY = h.ry.P * P + h.ry.G * sG + h.ry.I * sI + h.ry.R * R + h.ry.L * L;
    const USD = h.usd.Pd * Pd + h.usd.RY * RY + h.usd.R * R + h.usd.L * L + h.usd.G * sG;

    const cotCalc = (key: string) => {
      const c = state.cot[key];
      if (!c || !c.rows.length) return { n: 0, pct: null, last: null };
      const validRows = c.rows
        .filter((r) => r.oi > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.d) && addDays(r.d, 3) <= state.asof)
        .sort((a, b) => (a.d < b.d ? -1 : 1));
      const ser = validRows.map((r) => (r.net / r.oi) * 100);
      if (!ser.length) return { n: 0, pct: null, last: null };
      const last = ser[ser.length - 1];
      let pct: number | null = null;
      if (c.min != null && c.max != null && c.max > c.min) {
        pct = clamp((last - c.min) / (c.max - c.min), 0, 1);
      } else if (ser.length >= 10) {
        pct = ser.filter((x) => x <= last).length / ser.length;
      }
      return { n: ser.length, last, pct, ser, pos: validRows[validRows.length - 1].d };
    };

    const crisis = shockMode === 'KRISIS';
    const scn = SCEN[state.shock.scn] || SCEN.none;
    const inten = state.shock.int ?? 1;

    const assetsOut = ASSETS.map((a) => {
      let parts: Record<string, number> = {};
      let score: number;

      if (crisis) {
        const v = PH[state.shock.ph || 1]?.[a.k] || 0;
        parts = { 'Tabel krisis': v };
      } else if (a.hub === 'ry') {
        parts = {
          'Fed (P)': h.ry.P * P,
          'Growth (G)': h.ry.G * sG,
          'Inflasi (I)': h.ry.I * sI,
          'Stres (R)': h.ry.R * R,
          'Likuiditas (L)': h.ry.L * L,
        };
        for (const k in parts) parts[k] *= m.ry;
      } else if (a.hub === 'usd') {
        parts = {
          'Selisih Fed': h.usd.Pd * Pd,
          'Real yield': h.usd.RY * RY,
          'Stres (R)': h.usd.R * R,
          'Likuiditas (L)': h.usd.L * L,
          'Growth (G)': h.usd.G * sG,
        };
        for (const k in parts) parts[k] *= m.usd;
      } else {
        const b = betasData?.assets[a.k]?.use && betasData.assets[a.k].est
          ? betasData.assets[a.k].est
          : state.model.beta[a.k] || BETA_PRIOR[a.k] || [0, 0, 0, 0, 0, 0, 0];
        parts = {
          'Growth (G)': b[0] * sG,
          'Inflasi (I)': b[1] * sI,
          'Fed (P)': b[2] * P,
          'Likuiditas (L)': b[3] * L,
          'Stres (R)': b[4] * R,
          'Real yield': b[5] * RY * m.ry,
          'USD': b[6] * USD * m.usd,
        };
      }

      const sv = (scn.v[a.k] || 0) * inten;
      if (sv) parts['Skenario'] = sv;

      score = Object.values(parts).reduce((x, y) => x + y, 0);

      let cot: any = null;
      let cr: number | null = null;
      let flag = '';
      if (a.cot) {
        cot = cotCalc(a.cot);
        if (cot.pct != null) {
          cr = (cot.pct - 0.5) * 2 * (a.inv ? -1 : 1);
          if (Math.abs(cr) > 0.8) {
            const same = Math.sign(cr) === Math.sign(score) && Math.abs(score) >= 0.4;
            flag = same ? 'ramai searah' : 'ramai berlawanan';
          }
        }
      }

      const cov = clamp((acc.G.c + acc.I.c) / 8, 0, 1);
      let conv = crisis ? 0.5 : cov * (cbs.FED?.has ? 1 : 0.75);
      if (flag === 'ramai searah') conv *= 0.7;

      const abs = Math.abs(score);
      const dir = score > 0 ? 'BUY' : 'SELL';
      const why: string[] = [];

      if (abs < 0.4) why.push(`skor ${sg(score)} lemah (di bawah 0.4)`);
      if (abs < 0.75) why.push(`skor ${sg(score)} di bawah ambang 0.75`);
      if (conv < 0.6) why.push(`keyakinan ${Math.round(conv * 100)}% di bawah 60%`);
      if (flag === 'ramai searah') why.push('posisi spekulan sudah ramai searah (risiko squeeze)');
      if (crisis) why.push('mode krisis: skor dari tabel fase');

      const act = why.length === 0 ? dir : 'HOLD';
      const lean = act === 'HOLD' && abs >= 0.4 ? dir : '';

      return {
        ...a,
        score,
        parts,
        cot,
        flag,
        conv,
        act,
        lean,
        why,
      };
    });

    return {
      sG,
      sI,
      nG: acc.G.c,
      nI: acc.I.c,
      P,
      Pd,
      R,
      L,
      q,
      RY,
      USD,
      shockMode,
      triggerCount,
      triggers,
      liqOk,
      nowLiq,
      prevLiq,
      diffLiq,
      assetsOut,
    };
  }, [state, betasData]);

  const parseRelCsv = () => {
    const lines = relCsv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let ok = 0;
    const newReleases = [...state.releases];
    lines.forEach((l) => {
      const [d, ind, ac, co] = l.split(/[,;\t]/).map((x) => x.trim());
      const actVal = num(ac);
      const consVal = num(co);
      if (d && IND_BY[ind] && actVal != null) {
        newReleases.push({
          id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          date: d,
          ind,
          act: actVal,
          cons: consVal,
          prev: null,
          note: '',
        });
        ok++;
      }
    });
    saveState({ ...state, releases: newReleases, example: false });
    setRelCsv('');
    setMsg(`${ok} baris rilis berhasil diimpor.`);
  };

  const parseCotCsv = () => {
    const lines = cotCsv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let ok = 0;
    const targetCot = { ...(state.cot[cotKey] || { rows: [], min: null, max: null }) };
    const rows = [...targetCot.rows];

    lines.forEach((l) => {
      const [d, n, o] = l.split(/[,;\t]/).map((x) => x.trim());
      const netVal = num(n);
      const oiVal = num(o);
      if (d && netVal != null && oiVal && oiVal > 0) {
        const idx = rows.findIndex((r) => r.d === d);
        if (idx >= 0) rows[idx] = { d, net: netVal, oi: oiVal };
        else rows.push({ d, net: netVal, oi: oiVal });
        ok++;
      }
    });

    targetCot.rows = rows;
    saveState({
      ...state,
      cot: { ...state.cot, [cotKey]: targetCot },
      example: false,
    });
    setCotCsv('');
    setMsg(`${ok} baris COT untuk ${cotKey} berhasil diimpor.`);
  };

  const cotChartSeries = useMemo(() => {
    const rows = state.cot[cotKey]?.rows || [];
    if (rows.length < 2) return [];
    const sorted = rows.slice().sort((a, b) => a.d.localeCompare(b.d));
    return [
      {
        name: 'Net / OI (%)',
        pts: sorted.map((r) => [r.d, Number(((r.net / r.oi) * 100).toFixed(2))] as [string, number]),
        color: 'var(--s1, #38bdf8)',
      },
    ];
  }, [state.cot, cotKey]);

  return (
    <div className="wrap" style={{ paddingTop: 16 }}>
      {/* Workbench Header */}
      <header
        style={{
          padding: '16px 20px',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 14,
          marginBottom: 16,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div>
          <button
            type="button"
            className="btn ghost"
            style={{ padding: 0, fontWeight: 600, marginBottom: 4 }}
            onClick={onBackToDesk}
          >
            ← Kembali ke Beranda Terminal
          </button>
          <h1 style={{ fontSize: 20, margin: 0, fontWeight: 700, fontFamily: 'var(--f-display)', letterSpacing: '-0.02em' }}>
            Workbench Sinyal & Pemodelan Makro
          </h1>
          <p className="mute" style={{ margin: '3px 0 0', fontSize: 13 }}>
            Layer inferensi fundamental: pergerakan bank sentral, rilis ekonomi, posisi spekulan COT, volatilitas sistemik, dan simulasi skenario.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div className="fld">
            <label>Tanggal Analisis</label>
            <input
              type="date"
              className="in"
              value={state.asof}
              onChange={(e) => saveState({ ...state, asof: e.target.value })}
            />
          </div>
          <span className="pill">tersimpan di browser</span>
        </div>
      </header>

      {/* Tabs */}
      <nav
        role="tablist"
        style={{
          display: 'flex',
          gap: 4,
          background: 'var(--panel2)',
          padding: 4,
          borderRadius: 8,
          marginBottom: 16,
          border: '1px solid var(--line)',
          overflowX: 'auto',
        }}
      >
        {[
          ['dash', 'Ringkasan & Sinyal'],
          ['rel', 'Rilis Data & Konsensus'],
          ['cb', 'Bank Sentral Dunia'],
          ['cot', 'Posisi Spekulan COT'],
          ['shock', 'Shock & Likuiditas'],
          ['model', 'Model & Parameter'],
        ].map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={activeTab === k}
            onClick={() => {
              setActiveTab(k as any);
              setMsg('');
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {state.example && (
        <div className="banner" style={{ marginBottom: 16 }}>
          <span>Semua angka di workbench ini saat ini adalah contoh simulasi interaktif untuk eksplorasi formula.</span>
          <button
            className="btn sm"
            onClick={() => {
              saveState({ ...state, example: false });
              setMsg('Contoh dinonaktifkan.');
            }}
          >
            Gunakan data murni
          </button>
        </div>
      )}

      {msg && (
        <div className="note" style={{ marginBottom: 14 }}>
          {msg}
        </div>
      )}

      {/* Tab 1: Ringkasan & Sinyal */}
      {activeTab === 'dash' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Mode Pasar Alert */}
          <section className={`card mode ${engineResult.shockMode.toLowerCase()}`} style={{ padding: 16 }}>
            <h2>Status Shock & Volatilitas Pasar</h2>
            <div className="row" style={{ alignItems: 'baseline', gap: '8px 20px' }}>
              <span className="big" style={{ fontSize: 24 }}>{engineResult.shockMode}</span>
              <span className="mute" style={{ fontSize: 13 }}>
                {engineResult.triggerCount} dari 4 trigger volatilitas/kredit aktif
                {engineResult.shockMode === 'KRISIS' && ` · ${PHN[state.shock.ph || 1]}`}
                {state.shock.scn !== 'none' && ` · Skenario aktif: ${SCEN[state.shock.scn]?.n}`}
              </span>
            </div>
          </section>

          {/* Rezim & Arah Modal */}
          <div className="g2">
            <section className="card" style={{ padding: 16 }}>
              <h2>Rezim Fundamental Global</h2>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--f-display)', color: 'var(--ink)' }}>
                {QUAD[engineResult.q]}
              </div>
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>Pertumbuhan / Growth (G)</dt>
                <dd>
                  <span className={engineResult.sG > 0.25 ? 'pos' : engineResult.sG < -0.25 ? 'neg' : 'mute'}>
                    {sg(engineResult.sG)}
                  </span>{' '}
                  <span className="mute">({engineResult.nG} rilis aktif)</span>
                </dd>
                <dt>Tekanan Inflasi (I)</dt>
                <dd>
                  <span className={engineResult.sI > 0.25 ? 'pos' : engineResult.sI < -0.25 ? 'neg' : 'mute'}>
                    {sg(engineResult.sI)}
                  </span>{' '}
                  <span className="mute">({engineResult.nI} rilis aktif)</span>
                </dd>
                <dt>Stance Federal Reserve (P)</dt>
                <dd>{sg(engineResult.P)}</dd>
                <dt>Likuiditas Bersih Fed (L)</dt>
                <dd>{sg(engineResult.L)}</dd>
                <dt>Indeks Stres Pasar (R)</dt>
                <dd>{fx(engineResult.R)}</dd>
              </dl>
              <p className="note" style={{ marginTop: 12 }}>
                G dan I adalah indeks surprise terstandarisasi waktu (paruh waktu {state.set.hl} hari). Skor di antara
                -0.25 hingga +0.25 diidentifikasi sebagai netral.
              </p>
            </section>

            <section className="card" style={{ padding: 16 }}>
              <h2>Arah Rotasi Modal Antar Aset</h2>
              <p style={{ margin: '0 0 10px', fontWeight: 600 }}>
                {engineResult.sG > 0.3
                  ? 'Kondisi makro mendukung aliran modal ke aset berisiko (equities, commodities).'
                  : 'Kondisi makro menuntut alokasi defensif (cash, sovereign bonds, safe haven).'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ background: 'var(--panel2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div className="lbl" style={{ color: 'var(--good)' }}>Aset Bertekanan Naik</div>
                  <ul className="clean" style={{ marginTop: 6 }}>
                    {engineResult.assetsOut
                      .slice()
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 3)
                      .map((x) => (
                        <li key={x.k} className="chk">
                          <span>{x.n}</span>
                          <b className="pos">{sg(x.score)}</b>
                        </li>
                      ))}
                  </ul>
                </div>
                <div style={{ background: 'var(--panel2)', padding: '10px 12px', borderRadius: 6 }}>
                  <div className="lbl" style={{ color: 'var(--bad)' }}>Aset Bertekanan Turun</div>
                  <ul className="clean" style={{ marginTop: 6 }}>
                    {engineResult.assetsOut
                      .slice()
                      .sort((a, b) => a.score - b.score)
                      .slice(0, 3)
                      .map((x) => (
                        <li key={x.k} className="chk">
                          <span>{x.n}</span>
                          <b className="neg">{sg(x.score)}</b>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>

          {/* Matriks Dampak Antar Aset & Sinyal */}
          <section className="card" style={{ padding: 16 }}>
            <h2>Matriks Alokasi & Rekomendasi Sinyal Fundamental</h2>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Instrumen Aset</th>
                    <th className="r">Skor Tekanan (σ)</th>
                    <th>Arah Sentimen</th>
                    <th>Posisi COT Spekulan</th>
                    <th className="r">Keyakinan Data</th>
                    <th>Sinyal Fundamental</th>
                  </tr>
                </thead>
                <tbody>
                  {engineResult.assetsOut.map((a) => {
                    const isOpen = selectedAssetKey === a.k;
                    const maxPart = Math.max(1, ...Object.values(a.parts).map(Math.abs));

                    return (
                      <React.Fragment key={a.k}>
                        <tr
                          className="clk"
                          onClick={() => setSelectedAssetKey(isOpen ? null : a.k)}
                          style={isOpen ? { background: 'var(--panel2)' } : {}}
                        >
                          <td style={{ fontWeight: 600 }}>{a.n}</td>
                          <td className="r num">
                            <b style={{ color: a.score >= 0 ? 'var(--good)' : 'var(--bad)' }}>{sg(a.score)}</b>
                          </td>
                          <td>
                            <span className={`tag ${a.score > 0.3 ? 'p' : a.score < -0.3 ? 'n' : 'z'}`}>
                              {a.score > 1
                                ? 'Naik kuat'
                                : a.score > 0.3
                                ? 'Naik'
                                : a.score < -1
                                ? 'Turun kuat'
                                : a.score < -0.3
                                ? 'Turun'
                                : 'Netral'}
                            </span>
                          </td>
                          <td>
                            {a.cot?.pct != null ? (
                              <span className={`tag ${a.flag === 'ramai searah' ? 'w' : 'z'}`}>
                                {a.flag || `persentil ${Math.round(a.cot.pct * 100)}%`}
                              </span>
                            ) : (
                              <span className="mute">–</span>
                            )}
                          </td>
                          <td className="r num">{Math.round(a.conv * 100)}%</td>
                          <td>
                            <span className={`tag ${a.act === 'BUY' ? 'p' : a.act === 'SELL' ? 'n' : 'z'}`} style={{ fontWeight: 700 }}>
                              {a.act} {a.lean && (a.lean === 'BUY' ? '↗' : '↘')}
                            </span>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={6} style={{ background: 'var(--bg)', padding: '14px 18px' }}>
                              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--ink)' }}>
                                Dekomposisi Faktor Makro untuk {a.n}:
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px 24px' }}>
                                {Object.entries(a.parts).map(([fact, val]) => (
                                  <div key={fact} className="bk">
                                    <span style={{ fontWeight: 500 }}>{fact}</span>
                                    <span className="bar-h">
                                      <i
                                        className={val >= 0 ? 'p' : 'n'}
                                        style={
                                          val >= 0
                                            ? { left: '50%', width: `${Math.min(50, (Math.abs(val) / maxPart) * 50)}%` }
                                            : { right: '50%', width: `${Math.min(50, (Math.abs(val) / maxPart) * 50)}%` }
                                        }
                                      />
                                    </span>
                                    <b className={`num ${val >= 0 ? 'pos' : 'neg'}`}>{sg(val, 2)}</b>
                                  </div>
                                ))}
                              </div>
                              <p className="note" style={{ marginTop: 10 }}>
                                <b>Status keputusan sinyal:</b>{' '}
                                {a.why.length ? a.why.join('; ') : 'Semua kriteria fundamental dan audit data terpenuhi.'}
                              </p>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              Ketuk baris instrumen untuk melihat kontribusi detail tiap faktor makro (Growth, Inflasi, Fed, Likuiditas, Real Yield, USD, Skenario).
            </p>
          </section>
        </div>
      )}

      {/* Tab 2: Rilis Data & Konsensus */}
      {activeTab === 'rel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card" style={{ padding: 16 }}>
            <h2>Tambah Rilis Data Ekonomi</h2>
            <div className="row">
              <div className="fld">
                <label>Tanggal Rilis</label>
                <input
                  type="date"
                  className="in"
                  value={relDraft.date}
                  onChange={(e) => setRelDraft({ ...relDraft, date: e.target.value })}
                />
              </div>

              <div className="fld" style={{ minWidth: 220 }}>
                <label>Indikator</label>
                <select
                  className="in"
                  value={relDraft.ind}
                  onChange={(e) => setRelDraft({ ...relDraft, ind: e.target.value })}
                >
                  {IND.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.n} ({x.c === 'I' ? 'inflasi' : 'growth'}, {x.u})
                    </option>
                  ))}
                </select>
              </div>

              <div className="fld" style={{ width: 110 }}>
                <label>Actual</label>
                <input
                  type="text"
                  className="in"
                  value={relDraft.act}
                  placeholder="e.g. 0.3"
                  onChange={(e) => setRelDraft({ ...relDraft, act: e.target.value })}
                />
              </div>

              <div className="fld" style={{ width: 110 }}>
                <label>Konsensus</label>
                <input
                  type="text"
                  className="in"
                  value={relDraft.cons}
                  placeholder="e.g. 0.2"
                  onChange={(e) => setRelDraft({ ...relDraft, cons: e.target.value })}
                />
              </div>

              <button
                className="btn primary"
                onClick={() => {
                  const actVal = num(relDraft.act);
                  const consVal = num(relDraft.cons);
                  if (actVal == null) {
                    setMsg('Isi nilai actual terlebih dahulu.');
                    return;
                  }
                  const newRel = {
                    id: 'r' + Date.now().toString(36),
                    date: relDraft.date,
                    ind: relDraft.ind,
                    act: actVal,
                    cons: consVal,
                    prev: null,
                    note: 'manual',
                  };
                  saveState({
                    ...state,
                    releases: [newRel, ...state.releases],
                    example: false,
                  });
                  setRelDraft({ ...relDraft, act: '', cons: '' });
                  setMsg('Rilis data berhasil ditambahkan ke histori aktif.');
                }}
              >
                + Tambah Rilis
              </button>
            </div>

            <details style={{ marginTop: 14 }}>
              <summary>Impor Rilis Massal (CSV)</summary>
              <p className="note" style={{ margin: '6px 0 8px' }}>
                Format CSV: tanggal,id_indikator,actual,konsensus (contoh: 2026-10-15,cpi_core,0.3,0.2)
              </p>
              <textarea
                className="in"
                rows={4}
                value={relCsv}
                onChange={(e) => setRelCsv(e.target.value)}
                placeholder="2026-10-15,cpi_core,0.3,0.2"
              />
              <div style={{ marginTop: 8 }}>
                <button className="btn sm" onClick={parseRelCsv}>
                  Eksekusi Impor CSV
                </button>
              </div>
            </details>
          </section>

          {/* Riwayat Rilis */}
          <section className="card" style={{ padding: 16 }}>
            <h2>Riwayat Rilis Aktif Dalam Jendela ({state.releases.length})</h2>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal Rilis</th>
                    <th>Nama Indikator</th>
                    <th>Klasifikasi</th>
                    <th className="r">Actual</th>
                    <th className="r">Konsensus</th>
                    <th className="r">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {state.releases.map((r) => {
                    const d = IND_BY[r.ind];
                    return (
                      <tr key={r.id}>
                        <td style={{ fontFamily: 'var(--f-num)' }}>{r.date}</td>
                        <td style={{ fontWeight: 500 }}>{d?.n || r.ind}</td>
                        <td>
                          <span className="tag z">{d?.c === 'I' ? 'inflasi' : 'growth'}</span>
                        </td>
                        <td className="r num">
                          <b>{fx(r.act, 2)}</b>
                        </td>
                        <td className="r num mute">{r.cons == null ? '–' : fx(r.cons, 2)}</td>
                        <td className="r">
                          <button
                            className="btn del sm"
                            onClick={() => {
                              saveState({
                                ...state,
                                releases: state.releases.filter((x) => x.id !== r.id),
                              });
                            }}
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Tab 3: Bank Sentral */}
      {activeTab === 'cb' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="g2">
            {CBS.map(([k, name]) => {
              const current = state.cb[k] || { rate: null, imp: null, infl: null, txt: 0, dec: 0 };
              const updateCB = (field: string, val: any) => {
                saveState({
                  ...state,
                  cb: {
                    ...state.cb,
                    [k]: { ...current, [field]: val },
                  },
                });
              };

              return (
                <section key={k} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h3 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>{name}</h3>
                    <span className="fq">{k}</span>
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    <div className="fld">
                      <label>Suku Bunga (%)</label>
                      <input
                        type="text"
                        className="in"
                        value={current.rate ?? ''}
                        onChange={(e) => updateCB('rate', num(e.target.value))}
                      />
                    </div>
                    <div className="fld">
                      <label>Implied 12 Bln (%)</label>
                      <input
                        type="text"
                        className="in"
                        value={current.imp ?? ''}
                        onChange={(e) => updateCB('imp', num(e.target.value))}
                      />
                    </div>
                    <div className="fld">
                      <label>Inflasi Inti (%)</label>
                      <input
                        type="text"
                        className="in"
                        value={current.infl ?? ''}
                        onChange={(e) => updateCB('infl', num(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <div className="fld" style={{ flex: 1 }}>
                      <label>Nada Pernyataan</label>
                      <select
                        className="in"
                        value={current.txt}
                        onChange={(e) => updateCB('txt', parseInt(e.target.value, 10))}
                      >
                        {TXT_OPTIONS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="fld" style={{ flex: 1 }}>
                      <label>Keputusan vs Ekspektasi</label>
                      <select
                        className="in"
                        value={current.dec}
                        onChange={(e) => updateCB('dec', parseInt(e.target.value, 10))}
                      >
                        {DEC_OPTIONS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 4: COT Spekulan */}
      {activeTab === 'cot' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card" style={{ padding: 16 }}>
            <h2>Tambah Laporan Posisi Spekulan COT</h2>
            <div className="row">
              <div className="fld" style={{ minWidth: 180 }}>
                <label>Instrumen Kontrak</label>
                <select className="in" value={cotKey} onChange={(e) => setCotKey(e.target.value)}>
                  {COTS.map(([k, n]) => (
                    <option key={k} value={k}>
                      {n} ({k})
                    </option>
                  ))}
                </select>
              </div>

              <div className="fld">
                <label>Tanggal Posisi (Selasa)</label>
                <input
                  type="date"
                  className="in"
                  value={cotDraft.d}
                  onChange={(e) => setCotDraft({ ...cotDraft, d: e.target.value })}
                />
              </div>

              <div className="fld">
                <label>Net Spekulan (Kontrak)</label>
                <input
                  type="text"
                  className="in"
                  value={cotDraft.net}
                  placeholder="e.g. 180000"
                  onChange={(e) => setCotDraft({ ...cotDraft, net: e.target.value })}
                />
              </div>

              <div className="fld">
                <label>Total Open Interest</label>
                <input
                  type="text"
                  className="in"
                  value={cotDraft.oi}
                  placeholder="e.g. 520000"
                  onChange={(e) => setCotDraft({ ...cotDraft, oi: e.target.value })}
                />
              </div>

              <button
                className="btn primary"
                onClick={() => {
                  const netVal = num(cotDraft.net);
                  const oiVal = num(cotDraft.oi);
                  if (!cotDraft.d || netVal == null || !oiVal) {
                    setMsg('Lengkapi tanggal, net spekulan, dan open interest.');
                    return;
                  }
                  if (dow(cotDraft.d) !== 2) {
                    setMsg('Catatan: tanggal observasi posisi COT CFTC biasanya hari Selasa.');
                  }
                  const cur = state.cot[cotKey] || { rows: [], min: null, max: null };
                  const rows = cur.rows.filter((r) => r.d !== cotDraft.d);
                  rows.push({ d: cotDraft.d, net: netVal, oi: oiVal });

                  saveState({
                    ...state,
                    cot: {
                      ...state.cot,
                      [cotKey]: { ...cur, rows },
                    },
                    example: false,
                  });
                  setCotDraft({ d: '', net: '', oi: '' });
                  setMsg(`Laporan COT ${cotKey} tersimpan.`);
                }}
              >
                + Tambah Laporan
              </button>
            </div>

            <details style={{ marginTop: 14 }}>
              <summary>Impor CSV Data COT</summary>
              <textarea
                className="in"
                rows={4}
                value={cotCsv}
                onChange={(e) => setCotCsv(e.target.value)}
                placeholder="2026-10-13,185000,520000"
              />
              <div style={{ marginTop: 8 }}>
                <button className="btn sm" onClick={parseCotCsv}>
                  Impor Baris COT
                </button>
              </div>
            </details>
          </section>

          {/* Table summary */}
          <section className="card" style={{ padding: 16 }}>
            <h2>Riwayat Observasi untuk {COTS.find((x) => x[0] === cotKey)?.[1]}</h2>
            {cotChartSeries.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <InteractiveChart
                  series={cotChartSeries}
                  height={190}
                  dec={1}
                  label={`Tren Posisi Net/OI ${COTS.find((x) => x[0] === cotKey)?.[1]}`}
                  showTable={false}
                />
              </div>
            )}
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal Posisi</th>
                    <th className="r">Net Spekulan</th>
                    <th className="r">Open Interest</th>
                    <th className="r">Net / OI Ratio</th>
                    <th className="r">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(state.cot[cotKey]?.rows || []).slice(-10).reverse().map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--f-num)' }}>{r.d}</td>
                      <td className="r num">{r.net.toLocaleString()}</td>
                      <td className="r num">{r.oi.toLocaleString()}</td>
                      <td className="r num">
                        <b>{((r.net / r.oi) * 100).toFixed(1)}%</b>
                      </td>
                      <td className="r">
                        <button
                          className="btn del sm"
                          onClick={() => {
                            const cur = state.cot[cotKey];
                            saveState({
                              ...state,
                              cot: {
                                ...state.cot,
                                [cotKey]: {
                                  ...cur,
                                  rows: cur.rows.filter((x) => x.d !== r.d),
                                },
                              },
                            });
                          }}
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Tab 5: Shock & Likuiditas */}
      {activeTab === 'shock' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card" style={{ padding: 16 }}>
            <h2>Input Parameter Volatilitas dan Kredit</h2>
            <div className="row">
              <div className="fld">
                <label>VIX Saham</label>
                <input
                  type="text"
                  className="in"
                  value={state.shock.vix ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      shock: { ...state.shock, vix: num(e.target.value) },
                    })
                  }
                />
              </div>

              <div className="fld">
                <label>VIX 3 Bulan (VIX3M)</label>
                <input
                  type="text"
                  className="in"
                  value={state.shock.vix3m ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      shock: { ...state.shock, vix3m: num(e.target.value) },
                    })
                  }
                />
              </div>

              <div className="fld">
                <label>MOVE Index</label>
                <input
                  type="text"
                  className="in"
                  value={state.shock.move ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      shock: { ...state.shock, move: num(e.target.value) },
                    })
                  }
                />
              </div>

              <div className="fld">
                <label>HY OAS Spread (%)</label>
                <input
                  type="text"
                  className="in"
                  value={state.shock.hy ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      shock: { ...state.shock, hy: num(e.target.value) },
                    })
                  }
                />
              </div>

              <div className="fld">
                <label>HY OAS 20 Hari Lalu (%)</label>
                <input
                  type="text"
                  className="in"
                  value={state.shock.hyp ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      shock: { ...state.shock, hyp: num(e.target.value) },
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <h2>Komponen Likuiditas Bersih Fed (Miliar USD)</h2>
            <div className="row">
              <div className="fld">
                <label>WALCL Sekarang</label>
                <input
                  type="text"
                  className="in"
                  value={state.liq.w0 ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      liq: { ...state.liq, w0: num(e.target.value) },
                    })
                  }
                />
              </div>

              <div className="fld">
                <label>TGA Sekarang</label>
                <input
                  type="text"
                  className="in"
                  value={state.liq.t0 ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      liq: { ...state.liq, t0: num(e.target.value) },
                    })
                  }
                />
              </div>

              <div className="fld">
                <label>RRP Sekarang</label>
                <input
                  type="text"
                  className="in"
                  value={state.liq.r0 ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      liq: { ...state.liq, r0: num(e.target.value) },
                    })
                  }
                />
              </div>
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <div className="fld">
                <label>WALCL 4 Minggu Lalu</label>
                <input
                  type="text"
                  className="in"
                  value={state.liq.w1 ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      liq: { ...state.liq, w1: num(e.target.value) },
                    })
                  }
                />
              </div>

              <div className="fld">
                <label>TGA 4 Minggu Lalu</label>
                <input
                  type="text"
                  className="in"
                  value={state.liq.t1 ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      liq: { ...state.liq, t1: num(e.target.value) },
                    })
                  }
                />
              </div>

              <div className="fld">
                <label>RRP 4 Minggu Lalu</label>
                <input
                  type="text"
                  className="in"
                  value={state.liq.r1 ?? ''}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      liq: { ...state.liq, r1: num(e.target.value) },
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <h2>Simulasi Skenario Geopolitik & Makro</h2>
            <div className="row">
              <div className="fld" style={{ minWidth: 260 }}>
                <label>Skenario Overlay</label>
                <select
                  className="in"
                  value={state.shock.scn}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      shock: { ...state.shock, scn: e.target.value },
                    })
                  }
                >
                  {Object.entries(SCEN).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.n}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fld" style={{ width: 120 }}>
                <label>Intensitas Faktor</label>
                <input
                  type="text"
                  className="in"
                  value={state.shock.int}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      shock: { ...state.shock, int: num(e.target.value) ?? 1 },
                    })
                  }
                />
              </div>

              <div className="fld" style={{ minWidth: 220 }}>
                <label>Fase Krisis</label>
                <select
                  className="in"
                  value={state.shock.ph}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      shock: { ...state.shock, ph: parseInt(e.target.value, 10) },
                    })
                  }
                >
                  <option value={1}>{PHN[1]}</option>
                  <option value={2}>{PHN[2]}</option>
                  <option value={3}>{PHN[3]}</option>
                </select>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Tab 6: Model & Parameter */}
      {activeTab === 'model' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card" style={{ padding: 16 }}>
            <h2>Konfigurasi Parameter Waktu & Shrinkage</h2>
            <div className="row">
              <div className="fld">
                <label>Paruh Waktu Half-Life (Hari)</label>
                <input
                  type="text"
                  className="in"
                  value={state.set.hl}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      set: { ...state.set, hl: num(e.target.value) ?? 30 },
                    })
                  }
                />
              </div>

              <div className="fld">
                <label>Jendela Rilis Lookback (Hari)</label>
                <input
                  type="text"
                  className="in"
                  value={state.set.win}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      set: { ...state.set, win: num(e.target.value) ?? 90 },
                    })
                  }
                />
              </div>

              <div className="fld">
                <label>Parameter Shrinkage (k)</label>
                <input
                  type="text"
                  className="in"
                  value={state.set.k}
                  onChange={(e) =>
                    saveState({
                      ...state,
                      set: { ...state.set, k: num(e.target.value) ?? 1 },
                    })
                  }
                />
              </div>
            </div>
          </section>

          {/* Backup & Restore */}
          <section className="card" style={{ padding: 16 }}>
            <h2>Cadangan & Pemulihan State Model</h2>
            <div className="row" style={{ marginBottom: 12 }}>
              <button
                className="btn primary"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `macro-engine-desk-${state.asof}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setMsg('File JSON state model berhasil diunduh.');
                }}
              >
                Unduh Cadangan JSON
              </button>

              <button
                className="btn ghost"
                onClick={() => {
                  const fresh = buildInitialState();
                  saveState(fresh);
                  setMsg('Model berhasil dikembalikan ke konfigurasi default.');
                }}
              >
                Reset ke Pengaturan Awal
              </button>
            </div>

            <div className="fld">
              <label>Impor File / String JSON</label>
              <textarea
                className="in"
                rows={3}
                value={impJson}
                onChange={(e) => setImpJson(e.target.value)}
                placeholder="Tempel string JSON state di sini"
              />
            </div>
            <div style={{ marginTop: 8 }}>
              <button
                className="btn sm"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(impJson);
                    saveState(parsed);
                    setImpJson('');
                    setMsg('Data JSON state berhasil diimpor.');
                  } catch (e) {
                    setMsg('Format JSON tidak valid.');
                  }
                }}
              >
                Impor Data JSON
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
