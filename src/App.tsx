import React, { useState, useEffect, useCallback } from 'react';
import {
  BundleData,
  StatusData,
  AuditSeriesData,
  GatesData,
  PipelineData,
  ConceptCheckData,
  FeedData,
  ConsensusItem,
  BetasData,
} from './types/macro';
import {
  DEFAULT_BUNDLE,
  DEFAULT_STATUS,
  DEFAULT_AUDIT,
  DEFAULT_GATES,
  DEFAULT_PIPELINE,
  DEFAULT_CONCEPT_CHECK,
} from './data/defaultData';
import { DeskView } from './components/DeskView';
import { LanjutanView } from './components/LanjutanView';
import { MacroSearchModal } from './components/MacroSearchModal';

type CompareSnapshot = {
  symbol: string;
  label: string;
  updatedAt: string;
  yfinance?: {
    source: string;
    symbol: string;
    label: string;
    price: number | null;
    priceType: string;
    currency: string | null;
    exchangeName: string | null;
    timestamp: string | null;
    fetchedAt: string;
  };
  ctrader?: {
    source: string;
    configured: boolean;
    connected: boolean;
    host: string;
    mode: string;
    bid: number | null;
    ask: number | null;
    mid: number | null;
    timestamp: string | null;
    priceType: string;
    note: string;
  };
  comparison?: {
    difference: number | null;
    differencePercent: number | null;
    comparable: boolean;
    note: string;
  };
  message?: string;
  error?: string;
};

const COMPARE_SYMBOLS = [
  { key: 'EURUSD', label: 'EUR/USD' },
  { key: 'USDJPY', label: 'USD/JPY' },
  { key: 'XAUUSD', label: 'Gold (Yahoo GC=F)' },
  { key: 'WTI', label: 'WTI (Yahoo CL=F)' },
  { key: 'SPX', label: 'S&P 500' },
  { key: 'BTC', label: 'Bitcoin / USD' },
  { key: 'USDIDR', label: 'USD/IDR' },
];

const formatPrice = (value: number | null | undefined, digits = 5) => {
  if (value == null || !Number.isFinite(value)) return '–';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatTime = (value?: string | null) => {
  if (!value) return 'Timestamp tidak tersedia';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Timestamp tidak valid';
  return `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
};

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'desk' | 'lanjutan'>('desk');
  const [isMacroSearchOpen, setIsMacroSearchOpen] = useState(false);
  const [bundle, setBundle] = useState<BundleData>(DEFAULT_BUNDLE);
  const [status, setStatus] = useState<StatusData>(DEFAULT_STATUS);
  const [audit, setAudit] = useState<AuditSeriesData>(DEFAULT_AUDIT);
  const [gates, setGates] = useState<GatesData>(DEFAULT_GATES);
  const [pipeline, setPipeline] = useState<PipelineData>(DEFAULT_PIPELINE);
  const [conceptCheck, setConceptCheck] = useState<ConceptCheckData>(DEFAULT_CONCEPT_CHECK);
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [consensus, setConsensus] = useState<ConsensusItem[]>([]);
  const [betas, setBetas] = useState<BetasData | null>(null);
  const [phase, setPhase] = useState<any | null>(null);
  const [otak, setOtak] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [clock, setClock] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [compareSymbol, setCompareSymbol] = useState('EURUSD');
  const [compareSnapshot, setCompareSnapshot] = useState<CompareSnapshot | null>(null);
  const [compareError, setCompareError] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareUpdatedAt, setCompareUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const updateTime = () => setClock(new Date().toISOString().slice(11, 19) + ' UTC');
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const loadSourceCompare = useCallback(async (symbol: string, signal?: AbortSignal) => {
    setCompareLoading(true);
    setCompareError('');
    try {
      const response = await fetch(`/api/source-compare?symbol=${encodeURIComponent(symbol)}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Permintaan gagal (${response.status})`);
      setCompareSnapshot(data);
      setCompareUpdatedAt(new Date().toISOString());
    } catch (error: any) {
      if (error?.name !== 'AbortError') setCompareError(error?.message || 'Gagal memuat perbandingan sumber.');
    } finally {
      if (!signal?.aborted) setCompareLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadSourceCompare(compareSymbol, controller.signal);
    return () => controller.abort();
  }, [compareSymbol, loadSourceCompare]);

  useEffect(() => {
    const interval = setInterval(() => loadSourceCompare(compareSymbol), 60000);
    return () => clearInterval(interval);
  }, [compareSymbol, loadSourceCompare]);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    const now = Date.now();

    try {
      const r = await fetch(`data/bundle.json?t=${now}`);
      if (r.ok) {
        const data = await r.json();
        if (data && data.series && Object.keys(data.series).length > 0) {
          setBundle(data);
        }
      }
    } catch (e) {}

    try {
      const r = await fetch(`data/status.json?t=${now}`);
      if (r.ok) {
        const data = await r.json();
        if (data && data.counts) setStatus(data);
      }
    } catch (e) {}

    try {
      const r = await fetch(`data/audit_series.json?t=${now}`);
      if (r.ok) {
        const data = await r.json();
        if (data && data.checks) setAudit(data);
      }
    } catch (e) {}

    try {
      const r = await fetch(`data/gates.json?t=${now}`);
      if (r.ok) {
        const data = await r.json();
        if (data && data.umum) setGates(data);
      }
    } catch (e) {}

    try {
      const r = await fetch(`data/pipeline.json?t=${now}`);
      if (r.ok) {
        const data = await r.json();
        if (data && data.steps) setPipeline(data);
      }
    } catch (e) {}

    try {
      const r = await fetch(`data/concept_check.json?t=${now}`);
      if (r.ok) {
        const data = await r.json();
        if (data && data.violations) setConceptCheck(data);
      }
    } catch (e) {}

    try {
      const r = await fetch(`data/feed.json?t=${now}`);
      if (r.ok) {
        const data = await r.json();
        if (data && data.generated) setFeed(data);
      }
    } catch (e) {}

    try {
      const r = await fetch(`data/consensus.csv?t=${now}`);
      if (r.ok) {
        const text = await r.text();
        const items: ConsensusItem[] = text
          .split('\n')
          .map((line) => line.split(',').map((x) => x.trim()))
          .filter((parts) => /^20\d\d-\d\d-\d\d$/.test(parts[0]) && parts.length >= 3)
          .map((parts) => ({
            date: parts[0],
            ind: parts[1],
            cons: parseFloat(parts[2]),
          }))
          .filter((item) => !isNaN(item.cons));
        if (items.length) setConsensus(items);
      }
    } catch (e) {}

    try {
      const r = await fetch(`data/betas.json?t=${now}`);
      if (r.ok) {
        const data = await r.json();
        if (data && data.assets) setBetas(data);
      }
    } catch (e) {}

    try {
      const r = await fetch(`data/phase.json?t=${now}`);
      if (r.ok) setPhase(await r.json());
    } catch (e) {}

    try {
      const r = await fetch(`data/otak.json?t=${now}`);
      if (r.ok) setOtak(await r.json());
    } catch (e) {}

    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  const yfinance = compareSnapshot?.yfinance;
  const ctrader = compareSnapshot?.ctrader;
  const comparison = compareSnapshot?.comparison;
  const priceDigits = compareSymbol === 'EURUSD' ? 5 : compareSymbol === 'USDJPY' ? 3 : 2;
  const yahooAgeMs = yfinance?.timestamp ? Math.max(0, Date.now() - Date.parse(yfinance.timestamp)) : null;
  const yahooStatus = yahooAgeMs == null ? 'Timestamp unavailable' : yahooAgeMs > 5 * 60 * 1000 ? 'Stale (>5 min)' : 'Recent (≤5 min)';
  const deltaAvailable = Boolean(comparison?.comparable && comparison.difference != null);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="top">
        <div className="wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="terminal-brand"><span className="terminal-logo-box">QT</span><span>MACRO ENGINE // QUANT DESK</span></div>
            <span className="ping-indicator"><span className="ping-dot" />{status?.generated ? `DATA ${Math.max(0, Math.round((Date.now() - Date.parse(status.generated)) / 60000))} MNT` : 'DATA –'}</span>
          </div>
          <nav aria-label="Navigasi Terminal">
            {currentView === 'desk' ? (
              <>
                <a href="#pasar" className="active">Pasar</a><a href="#aliran">Aliran Modal</a><a href="#makro">Makro</a><a href="#kebijakan">Kebijakan</a><a href="#stres">Stres & Likuiditas</a><a href="#otak">Otak Makro</a><a href="#posisi">COT</a><a href="#kalender">Kalender</a><a href="#data">Kesehatan</a>
                <button type="button" onClick={() => { setCurrentView('lanjutan'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Workbench Sinyal →</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { setCurrentView('desk'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>← Beranda Terminal</button>
                <span className="small mute" style={{ fontFamily: 'var(--f-mono)', padding: '4px 8px' }}>[MODULE: QUANTITATIVE WORKBENCH & SIGNAL MODEL]</span>
              </>
            )}
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="terminal-time">{clock}</span>
            <button type="button" className="btn sm" onClick={() => setIsMacroSearchOpen(true)}>⚡ INTEL SEARCH</button>
            <button type="button" className="btn sm" onClick={loadData} disabled={isRefreshing}>{isRefreshing ? 'SYNCING…' : 'SYNC'}</button>
            <button type="button" className="btn sm" onClick={() => setTheme((prev) => prev === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? '☀' : '🌙'}</button>
          </div>
        </div>
      </header>

      <section aria-labelledby="compare-title" style={{ margin: '16px 20px 0', border: '1px solid var(--line-strong)', background: 'var(--panel2)', borderRadius: 14, padding: 16, boxShadow: '0 10px 22px rgba(16, 24, 40, 0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--muted)' }}>Multi-source market data</div>
            <h2 id="compare-title" style={{ margin: '3px 0 0', fontSize: 20 }}>Source Compare · {compareSnapshot?.label || COMPARE_SYMBOLS.find((s) => s.key === compareSymbol)?.label}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label htmlFor="compare-symbol" className="small">Instrumen</label>
            <select id="compare-symbol" value={compareSymbol} onChange={(event) => setCompareSymbol(event.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--panel)', color: 'var(--ink)' }}>
              {COMPARE_SYMBOLS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            <button type="button" className="btn sm" onClick={() => loadSourceCompare(compareSymbol)} disabled={compareLoading}>{compareLoading ? 'LOADING…' : 'REFRESH COMPARE'}</button>
          </div>
        </div>

        {compareError ? <div role="alert" className="note" style={{ borderColor: 'var(--bad)', marginBottom: 12 }}>Gagal memuat sumber: {compareError}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <article style={{ border: '1px solid var(--line-strong)', borderRadius: 12, padding: 14, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><b>Yahoo Finance</b><span className="chip">{yahooStatus}</span></div>
            <div style={{ fontSize: 25, fontWeight: 700, marginTop: 12 }}>{formatPrice(yfinance?.price, priceDigits)}{yfinance?.currency ? ` ${yfinance.currency}` : ''}</div>
            <div className="small mute" style={{ marginTop: 6 }}>Ticker: {yfinance?.symbol || '–'} · {yfinance?.priceType || 'menunggu data'}</div>
            <div className="small mute">Exchange: {yfinance?.exchangeName || '–'}</div>
            <div className="small mute" style={{ marginTop: 6 }}>Observasi: {formatTime(yfinance?.timestamp)}</div>
            <div className="small mute">Diambil: {formatTime(yfinance?.fetchedAt)}</div>
          </article>

          <article style={{ border: '1px solid var(--line-strong)', borderRadius: 12, padding: 14, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><b>cTrader</b><span className="chip">{ctrader?.connected ? 'CONNECTED' : 'NOT CONNECTED'}</span></div>
            <div style={{ fontSize: 25, fontWeight: 700, marginTop: 12 }}>{ctrader?.connected ? `Bid ${formatPrice(ctrader.bid, priceDigits)} / Ask ${formatPrice(ctrader.ask, priceDigits)}` : 'Quote belum tersedia'}</div>
            <div className="small mute" style={{ marginTop: 6 }}>Symbol: {compareSymbol} · jenis: {ctrader?.priceType || 'bid/ask spot quote'}</div>
            <div className="small mute">Mode: {ctrader?.mode || 'belum diketahui'} · host: {ctrader?.host || '–'}</div>
            <div className="small mute" style={{ marginTop: 6 }}>Observasi: {formatTime(ctrader?.timestamp)}</div>
            <div className="small mute">{ctrader?.note || 'Stream cTrader belum tersambung.'}</div>
          </article>

          <article style={{ border: '1px solid var(--line-strong)', borderRadius: 12, padding: 14, minWidth: 0 }}>
            <b>Selisih (cTrader mid − Yahoo)</b>
            <div style={{ fontSize: 25, fontWeight: 700, marginTop: 12, color: deltaAvailable ? 'var(--ink)' : 'var(--muted)' }}>{deltaAvailable ? formatPrice(comparison?.difference, priceDigits) : 'Belum dapat dibandingkan'}</div>
            <div className="small mute" style={{ marginTop: 6 }}>Selisih %: {deltaAvailable && comparison?.differencePercent != null ? `${comparison.differencePercent >= 0 ? '+' : ''}${comparison.differencePercent.toFixed(5)}%` : '–'}</div>
            <div className="small mute" style={{ marginTop: 6 }}>{comparison?.note || 'Nilai selisih hanya dihitung jika quote aktual dari kedua sumber tersedia.'}</div>
          </article>
        </div>
        <div className="small mute" style={{ marginTop: 12 }}>
          Pembaruan panel: {formatTime(compareUpdatedAt)} · refresh otomatis tiap 60 detik. Yahoo Finance dapat tertunda; selisih tidak ditampilkan tanpa quote cTrader aktual. Harga GC=F/CL=F adalah futures, bukan spot XAUUSD/WTI.
        </div>
      </section>

      <div style={{ flex: 1 }}>
        {currentView === 'desk' ? (
          <DeskView bundle={bundle} status={status} audit={audit} gates={gates} pipeline={pipeline} conceptCheck={conceptCheck} feed={feed} consensus={consensus} phase={phase} otak={otak} onNavigateToLanjutan={() => { setCurrentView('lanjutan'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        ) : (
          <LanjutanView betasData={betas} onBackToDesk={() => { setCurrentView('desk'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        )}
      </div>
      <MacroSearchModal isOpen={isMacroSearchOpen} onClose={() => setIsMacroSearchOpen(false)} />
    </div>
  );
};
























































































































































































































































































































































































































