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
  const [sourceCompare, setSourceCompare] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Live ticking clock for quantitative terminal
  const [clock, setClock] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const utc = now.toISOString().slice(11, 19) + ' UTC';
      setClock(utc);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Theme management with dark mode default
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    let active = true;
    const loadSourceCompare = async () => {
      try {
        const r = await fetch('/api/source-compare?symbol=EURUSD');
        if (!r.ok) return;
        const data = await r.json();
        if (active) setSourceCompare(data);
      } catch (e) {
        // Intentionally ignored; frontend continues to render existing data.
      }
    };

    loadSourceCompare();
    const interval = setInterval(loadSourceCompare, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

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

  const yfinance = sourceCompare?.yfinance;
  const ctrader = sourceCompare?.ctrader;
  const updatedAt = sourceCompare?.updatedAt ? new Date(sourceCompare.updatedAt) : null;

  const fmt = (value: number | null | undefined, digits = 5) => {
    if (value == null || Number.isNaN(value)) return '–';
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Institutional Quantitative Terminal Top Bar */}
      <header className="top">
        <div className="wrap">
          {/* Left Zone: Terminal Brand & Live Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="terminal-brand">
              <span className="terminal-logo-box">QT</span>
              <span>MACRO ENGINE // QUANT DESK</span>
            </div>

            <span className="ping-indicator">
              <span className="ping-dot" />
              {status?.generated ? `DATA ${Math.max(0, Math.round((Date.now() - Date.parse(status.generated)) / 60000))} MNT` : 'DATA –'}
            </span>
          </div>

          {/* Center Zone: Quick-Toggle Module Controls */}
          <nav aria-label="Navigasi Terminal">
            {currentView === 'desk' ? (
              <>
                <a href="#pasar" className="active">Pasar</a>
                <a href="#aliran">Aliran Modal</a>
                <a href="#makro">Makro</a>
                <a href="#kebijakan">Kebijakan</a>
                <a href="#stres">Stres & Likuiditas</a>
                <a href="#otak">Otak Makro</a>
                <a href="#posisi">COT</a>
                <a href="#kalender">Kalender</a>
                <a href="#data">Kesehatan</a>
                <button
                  type="button"
                  style={{
                    fontFamily: 'var(--f-mono)',
                    fontSize: 11,
                    background: 'var(--accent-soft)',
                    borderColor: 'var(--accent-border)',
                    color: 'var(--accent)',
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    setCurrentView('lanjutan');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Workbench Sinyal →
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  style={{
                    fontFamily: 'var(--f-mono)',
                    fontSize: 11,
                    background: 'var(--panel2)',
                    borderColor: 'var(--line-strong)',
                  }}
                  onClick={() => {
                    setCurrentView('desk');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  ← Beranda Terminal
                </button>
                <span className="small mute" style={{ fontFamily: 'var(--f-mono)', padding: '4px 8px' }}>
                  [MODULE: QUANTITATIVE WORKBENCH & SIGNAL MODEL]
                </span>
              </>
            )}
          </nav>

          {/* Right Zone: System Clock & Action Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="terminal-time">{clock}</span>

            <button
              type="button"
              className="btn sm"
              style={{
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                borderColor: 'var(--accent-border)',
                color: 'var(--accent)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
              onClick={() => setIsMacroSearchOpen(true)}
              title="Riset Intel Makro Real-Time dengan Google Search Grounding"
            >
              <span>⚡</span> INTEL SEARCH
            </button>

            <button
              type="button"
              className="btn sm"
              onClick={loadData}
              disabled={isRefreshing}
              title="Refresh live feeds"
            >
              {isRefreshing ? 'SYNCING…' : 'SYNC'}
            </button>

            <button
              type="button"
              className="btn sm"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title="Toggle Dark / Light Theme"
            >
              {theme === 'dark' ? '☀' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      <div style={{ padding: '16px 20px 0' }}>
        <div
          style={{
            border: '1px solid var(--line-strong)',
            background: 'var(--panel2)',
            borderRadius: 14,
            padding: 16,
            boxShadow: '0 10px 22px rgba(16, 24, 40, 0.12)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--muted)' }}>
                Source Compare
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>EURUSD</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {updatedAt ? `Updated ${updatedAt.toISOString().slice(11, 19)} UTC` : 'Waiting for snapshot'}
            </div>
          </div>

          {sourceCompare ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <div style={{ border: '1px solid var(--line-strong)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.1 }}>
                  Yahoo Finance
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{fmt(yfinance?.lastPrice, 5)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {yfinance?.timestamp ? new Date(yfinance.timestamp).toISOString().slice(11, 19) + ' UTC' : '–'}
                </div>
              </div>

              <div style={{ border: '1px solid var(--line-strong)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.1 }}>
                  cTrader
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>
                  {ctrader?.configured ? 'Live config ready' : 'Not configured'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {ctrader?.host ? `Host: ${ctrader.host}` : 'Host: demo'}
                </div>
              </div>

              <div style={{ border: '1px solid var(--line-strong)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.1 }}>
                  Status
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8, color: ctrader?.configured ? 'var(--good)' : 'var(--warn)' }}>
                  {ctrader?.configured ? 'Ready' : 'Pending credentials'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {sourceCompare.message}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading source comparison…</div>
          )}
        </div>
      </div>

      {/* Main View Area */}
      <div style={{ flex: 1 }}>
        {currentView === 'desk' ? (
          <DeskView
            bundle={bundle}
            status={status}
            audit={audit}
            gates={gates}
            pipeline={pipeline}
            conceptCheck={conceptCheck}
            feed={feed}
            consensus={consensus}
            phase={phase}
            otak={otak}
            onNavigateToLanjutan={() => {
              setCurrentView('lanjutan');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : (
          <LanjutanView
            betasData={betas}
            onBackToDesk={() => {
              setCurrentView('desk');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </div>

      {/* Google Search Grounded Macro Intel Modal */}
      <MacroSearchModal
        isOpen={isMacroSearchOpen}
        onClose={() => setIsMacroSearchOpen(false)}
      />
    </div>
  );
};
