import React, { useCallback, useEffect, useState } from 'react';

type CompareResponse = {
  symbol: string;
  updatedAt: string;
  yfinance?: {
    symbol: string;
    source: string;
    lastPrice: number | null;
    previousClose: number | null;
    currency: string | null;
    exchangeName: string | null;
    timestamp: string;
    isLive: boolean;
  };
  ctrader?: {
    source: string;
    configured: boolean;
    host: string;
    mode: string;
    note: string;
  };
  error?: string;
  message?: string;
};

const INSTRUMENTS = [
  { id: 'EURUSD', label: 'EUR/USD', yf: 'EURUSD=X', priceKind: 'FX minute candle close' },
  { id: 'USDJPY', label: 'USD/JPY', yf: 'JPY=X', priceKind: 'FX minute candle close' },
  { id: 'XAUUSD', label: 'Gold / XAU/USD', yf: 'GC=F', priceKind: 'Gold futures minute candle close (not spot)' },
  { id: 'WTI', label: 'WTI crude', yf: 'CL=F', priceKind: 'Crude futures minute candle close' },
  { id: 'SPX', label: 'S&P 500', yf: '^GSPC', priceKind: 'Index minute candle close' },
];

const price = (value: number | null | undefined, currency: string | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}${currency ? ` ${currency}` : ''}`;
};

const timestamp = (value?: string) => value
  ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }) + ' UTC'
  : 'Waktu tidak tersedia';

export const SourceComparePanel: React.FC = () => {
  const [symbol, setSymbol] = useState('EURUSD');
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/source-compare?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Permintaan gagal (${response.status})`);
      setData(result);
    } catch (err: any) {
      setData(null);
      setError(err?.message || 'Tidak dapat menghubungi backend. Jalankan aplikasi melalui server npm, bukan buka file HTML langsung.');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const instrument = INSTRUMENTS.find((item) => item.id === symbol) || INSTRUMENTS[0];
  const yf = data?.yfinance;
  const ctrader = data?.ctrader;

  return (
    <section className="p" id="source-compare" aria-labelledby="source-compare-title">
      <div className="ph">
        <h2 id="source-compare-title">Perbandingan Sumber Harga</h2>
        <span className="tag t-m">UJI SUMBER</span>
        <span className="sub">Snapshot Yahoo Finance dan status koneksi cTrader untuk instrumen yang sama.</span>
      </div>

      <div className="source-compare-controls">
        <label htmlFor="compare-symbol">Instrumen</label>
        <select id="compare-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)}>
          {INSTRUMENTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <span className="small mute">Ref Yahoo: <code>{instrument.yf}</code></span>
        <button type="button" className="btn sm" onClick={refresh} disabled={loading}>
          {loading ? 'MEMUAT…' : 'PERBARUI'}
        </button>
      </div>

      {error && <div className="note source-compare-error" role="alert">{error}</div>}

      <div className="source-compare-grid">
        <article className="source-compare-card">
          <div className="source-compare-heading"><strong>Yahoo Finance</strong><span className="chip c-ok">SNAPSHOT</span></div>
          <div className="source-compare-price">{price(yf?.lastPrice, yf?.currency)}</div>
          <div className="small mute">Instrumen: {instrument.label} · {yf?.symbol || instrument.yf}</div>
          <div className="small mute">Jenis harga: {instrument.priceKind}</div>
          <div className="small mute">Timestamp data: {timestamp(yf?.timestamp)}</div>
          {yf?.exchangeName && <div className="small mute">Exchange: {yf.exchangeName}</div>}
        </article>

        <article className="source-compare-card">
          <div className="source-compare-heading"><strong>cTrader</strong><span className={`chip ${ctrader?.configured ? 'c-warn' : 'c-warn'}`}>{ctrader?.configured ? 'KONFIGURASI ADA' : 'BELUM TERHUBUNG'}</span></div>
          <div className="source-compare-price">{ctrader?.configured ? 'Menunggu quote' : '–'}</div>
          <div className="small mute">Instrumen yang diminta: {instrument.label} · simbol broker perlu diverifikasi</div>
          <div className="small mute">Jenis harga target: bid / ask cTrader</div>
          <div className="small mute">Timestamp quote: belum tersedia</div>
          <div className="small mute">Host: {ctrader?.host || 'demo'} · belum ada stream quote aktif</div>
        </article>
      </div>

      <div className="source-compare-note">
        <strong>Catatan perbandingan:</strong> Saat ini panel menampilkan snapshot Yahoo dan status cTrader saja. Endpoint belum menerima quote bid/ask cTrader, jadi belum ada delta harga yang valid. Quote baru dapat dibandingkan setelah stream cTrader backend aktif dan simbol broker dipastikan cocok.
        {data?.updatedAt && <span> Pemeriksaan backend: {timestamp(data.updatedAt)}.</span>}
      </div>
    </section>
  );
};
