export type Frequency = 'harian' | 'mingguan' | 'bulanan' | 'kuartalan';
export type StateType = 'ok' | 'basi' | 'ditahan' | 'gagal' | 'mati';
export type TrustType = 'terverifikasi' | 'konsisten' | 'sumber tunggal' | 'bermasalah';

export interface SeriesPoint {
  0: string; // date YYYY-MM-DD
  1: number; // value
}

export interface SeriesMeta {
  l: string; // label
  g: string; // group
  f: Frequency; // frequency
  u: string; // unit
  st: StateType; // state
  a: string; // as of date
  ag: number | null; // age in days
  v: number | null; // last value
  fe?: string; // fetched timestamp
  pv: string; // provider
  r: string; // ref ticker/code
  fb?: boolean; // fallback used
  c?: boolean; // is critical
  un?: boolean; // unverified
  n?: string; // note
  p: [string, number][]; // points
}

export interface BundleData {
  generated: string;
  series: Record<string, SeriesMeta>;
}

export interface GateInfo {
  open: boolean;
  blocked_by: { id: string; alasan: string }[];
}

export interface StatusSeriesRow {
  id: string;
  label: string;
  group: string;
  freq: Frequency;
  tier: string;
  prov: string;
  ref: string;
  fallback: boolean;
  asof: string;
  age: number | null;
  last: number | null;
  fetched: string;
  state: StateType;
  crit: boolean;
  unverified: boolean;
  act: string;
  note: string;
}

export interface StatusData {
  generated: string;
  n: number;
  counts: {
    ok: number;
    basi: number;
    ditahan: number;
    gagal: number;
    mati: number;
  };
  gate: {
    open: boolean;
    blocked_by: string[];
  };
  series: StatusSeriesRow[];
}

export interface AuditCheck {
  name: string;
  kind: string;
  status: 'pass' | 'fail' | 'warn' | 'na';
  detail: string;
  series: string[];
}

export interface AuditSeriesData {
  generated: string;
  counts: {
    pass: number;
    fail: number;
    warn: number;
  };
  trust: Record<string, TrustType>;
  checks: AuditCheck[];
  gate?: {
    open: boolean;
    blocked_by: string[];
    unverified_crit: string[];
  };
}

export interface GatesData {
  generated: string;
  umum: {
    open: boolean;
    blocked_by: { id: string; alasan: string }[];
  };
  aset: Record<
    string,
    {
      open: boolean;
      blocked_by: { id: string; alasan: string }[];
    }
  >;
}

export interface PipelineStep {
  step: string;
  status: 'ok' | 'gagal' | 'dilewati';
  detail: string;
  sec: number;
}

export interface PipelineData {
  generated: string;
  steps: PipelineStep[];
}

export interface ConceptCheckData {
  generated: string;
  violations: { rule: string; msg: string }[];
  notes: { rule: string; msg: string }[];
  series: number;
}

export interface ReleaseItem {
  id: string;
  date: string;
  ind: string;
  act: number | null;
  cons: number | null;
  prev?: number | null;
  note?: string;
  src?: string;
}

export interface FeedData {
  generated: string | null;
  releases?: ReleaseItem[];
  actual?: Record<string, any>;
  shock?: Record<string, any>;
  liq?: Record<string, any>;
  cb?: Record<string, any>;
  cot?: Record<string, any>;
}

export interface ConsensusItem {
  date: string;
  ind: string;
  cons: number;
}

export interface BetasAssetInfo {
  use: boolean;
  prior: number[];
  est: number[];
  lam?: number;
  n_weeks?: number;
  n_oos?: number;
  r2_est?: number;
  r2_prior?: number;
  reason?: string;
}

export interface BetasData {
  generated: string;
  factors: string[];
  note: string;
  assets: Record<string, BetasAssetInfo>;
}
