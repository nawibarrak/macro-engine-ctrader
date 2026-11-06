import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const execFileAsync = promisify(execFile);

app.use(cors());
app.use(express.json());

const SYMBOLS: Record<string, { yahoo: string; label: string; brokerEnv: string; defaultBroker: string; comparable: boolean }> = {
  EURUSD: { yahoo: 'EURUSD=X', label: 'EUR/USD', brokerEnv: 'CTRADER_EURUSD_SYMBOL', defaultBroker: 'EURUSD', comparable: true },
  USDJPY: { yahoo: 'JPY=X', label: 'USD/JPY', brokerEnv: 'CTRADER_USDJPY_SYMBOL', defaultBroker: 'USDJPY', comparable: true },
  XAUUSD: { yahoo: 'GC=F', label: 'Gold (Yahoo GC=F futures)', brokerEnv: 'CTRADER_XAUUSD_SYMBOL', defaultBroker: 'XAUUSD', comparable: false },
  WTI: { yahoo: 'CL=F', label: 'WTI (Yahoo CL=F futures)', brokerEnv: 'CTRADER_WTI_SYMBOL', defaultBroker: 'XTIUSD', comparable: false },
  SPX: { yahoo: '^GSPC', label: 'S&P 500 index', brokerEnv: 'CTRADER_SPX_SYMBOL', defaultBroker: 'US500', comparable: false },
  BTC: { yahoo: 'BTC-USD', label: 'Bitcoin / USD', brokerEnv: 'CTRADER_BTC_SYMBOL', defaultBroker: 'BTCUSD', comparable: true },
  USDIDR: { yahoo: 'IDR=X', label: 'USD/IDR', brokerEnv: 'CTRADER_USDIDR_SYMBOL', defaultBroker: 'USDIDR', comparable: true },
};

async function fetchYahooSnapshot(key: string) {
  const instrument = SYMBOLS[key];
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument.yahoo)}`);
  url.searchParams.set('interval', '1m');
  url.searchParams.set('range', '1d');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Yahoo Finance request failed: ${response.status}`);
  const data = (await response.json()) as any;
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No Yahoo Finance data returned for ${instrument.yahoo}.`);

  const meta = result.meta || {};
  const timestamps: number[] = result.timestamp || [];
  const closes: Array<number | null> = result.indicators?.quote?.[0]?.close || [];
  let latestIndex = -1;
  for (let i = closes.length - 1; i >= 0; i--) {
    if (typeof closes[i] === 'number' && Number.isFinite(closes[i])) { latestIndex = i; break; }
  }
  const chartPrice = latestIndex >= 0 ? closes[latestIndex] : null;
  const price = typeof chartPrice === 'number' ? chartPrice : meta.regularMarketPrice ?? null;
  const timestamp = latestIndex >= 0 && timestamps[latestIndex]
    ? new Date(timestamps[latestIndex] * 1000).toISOString()
    : meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null;
  return {
    source: 'Yahoo Finance', symbol: instrument.yahoo, label: instrument.label, price,
    priceType: chartPrice == null ? 'regularMarketPrice (provider snapshot)' : '1-minute candle close',
    currency: meta.currency ?? null, exchangeName: meta.exchangeName ?? null, timestamp,
    fetchedAt: new Date().toISOString(),
  };
}

function ctraderConfig() {
  const configured = Boolean(process.env.CTRADER_CLIENT_ID && process.env.CTRADER_CLIENT_SECRET && process.env.CTRADER_ACCESS_TOKEN && process.env.CTRADER_ACCOUNT_ID);
  const host = (process.env.CTRADER_HOST || 'demo').trim().toLowerCase();
  const enabled = process.env.CTRADER_ENABLED === '1';
  const liveAllowed = process.env.CTRADER_ALLOW_LIVE === '1';
  return { configured, host, enabled, liveAllowed };
}

async function fetchCTraderQuote(key: string) {
  const cfg = ctraderConfig();
  const base = {
    source: 'cTrader', configured: cfg.configured, connected: false, host: cfg.host,
    mode: cfg.host === 'live' ? 'live' : 'demo', bid: null as number | null, ask: null as number | null,
    mid: null as number | null, timestamp: null as string | null, priceType: 'bid/ask spot quote',
  };
  if (!cfg.enabled) return { ...base, note: 'cTrader connector is disabled. Set CTRADER_ENABLED=1 in the backend environment to enable read-only quote polling.' };
  if (!cfg.configured) return { ...base, note: 'Missing backend configuration: client ID, client secret, access token, and trading account ID are required.' };
  if (cfg.host !== 'demo' && cfg.host !== 'live') return { ...base, note: 'CTRADER_HOST must be demo or live.' };
  if (cfg.host === 'live' && !cfg.liveAllowed) return { ...base, note: 'Live host blocked. Set CTRADER_ALLOW_LIVE=1 explicitly after testing demo.' };

  const brokerSymbol = (process.env[SYMBOLS[key].brokerEnv] || SYMBOLS[key].defaultBroker).trim();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ctrader-quote-'));
  try {
    const args = [
      'scripts/run_fetch.py', '--symbols', brokerSymbol, '--seconds', '4', '--output-dir', tempDir,
    ];
    if (cfg.host === 'live' && cfg.liveAllowed) args.push('--allow-live');
    const python = process.env.CTRADER_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    await execFileAsync(python, args, { cwd: process.cwd(), timeout: 20000, maxBuffer: 1024 * 1024 });
    const files = (await readdir(tempDir)).filter((file) => file.endsWith('.jsonl')).sort();
    if (!files.length) return { ...base, note: `cTrader connected but no quote file was produced for broker symbol ${brokerSymbol}.` };
    const text = await readFile(path.join(tempDir, files[files.length - 1]), 'utf8');
    const records = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const quote = records.at(-1);
    if (!quote || typeof quote.mid !== 'number') return { ...base, note: `No bid/ask quote received for ${brokerSymbol}; check broker symbol and market session.` };
    return {
      ...base, connected: true, bid: quote.bid, ask: quote.ask, mid: quote.mid,
      timestamp: quote.timestamp, brokerSymbol, note: `Read-only quote received for ${brokerSymbol}.`,
    };
  } catch (error: any) {
    const detail = error?.stderr || error?.message || 'Unknown connector error';
    // Avoid returning command output that could contain local environment details.
    return { ...base, note: `cTrader quote request failed. Check backend setup, token validity, network, and broker symbol (${brokerSymbol}). ${String(detail).slice(0, 180)}` };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

app.get('/api/source-compare', async (req, res) => {
  const requested = String(req.query.symbol || 'EURUSD').toUpperCase();
  if (!Object.hasOwn(SYMBOLS, requested)) {
    res.status(400).json({ error: 'Unsupported symbol. Choose EURUSD, USDJPY, XAUUSD, WTI, SPX, BTC, or USDIDR.' });
    return;
  }
  try {
    const [yfinance, ctrader] = await Promise.all([fetchYahooSnapshot(requested), fetchCTraderQuote(requested)]);
    const timestampsClose = yfinance.timestamp && ctrader.timestamp
      && Math.abs(Date.parse(yfinance.timestamp) - Date.parse(ctrader.timestamp)) <= 5 * 60 * 1000;
    const comparable = SYMBOLS[requested].comparable && ctrader.connected
      && typeof ctrader.mid === 'number' && typeof yfinance.price === 'number' && timestampsClose;
    const difference = comparable ? ctrader.mid! - yfinance.price! : null;
    res.json({
      symbol: requested, label: SYMBOLS[requested].label, updatedAt: new Date().toISOString(), yfinance, ctrader,
      comparison: {
        difference,
        differencePercent: comparable && yfinance.price !== 0 ? (difference! / yfinance.price!) * 100 : null,
        comparable,
        note: comparable
          ? 'Difference is cTrader mid minus Yahoo snapshot; timestamps are within five minutes.'
          : !SYMBOLS[requested].comparable
            ? 'Not directly comparable: Yahoo ticker is a futures/index proxy, not the same cTrader spot instrument.'
            : !timestampsClose
              ? 'Not comparable: source observations are missing or more than five minutes apart.'
              : 'Difference unavailable until both sources return actual price observations.',
      },
      message: ctrader.note,
    });
  } catch (error: any) {
    console.error('source-compare error:', error);
    res.status(502).json({ error: error?.message || 'Unable to fetch source comparison data', symbol: requested });
  }
});

app.post('/api/macro-search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') { res.status(400).json({ error: 'Query parameter is required' }); return; }
    if (!ai) {
      res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server. Please check the Secrets panel in Settings.' });
      return;
    }
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `You are an institutional macro research desk analyst at a quantitative hedge fund.\nThe user is requesting live, real-time macroeconomic intelligence and verified market context for: "${query}".\n\nAnalyze the latest verified updates using Google Search data. Structure your response professionally:\n1. Executive Snapshot & Latest Official Data (actual numbers, dates, revisions)\n2. Central Bank Stance / Market Consensus Impact\n3. Cross-Asset Implications (Equities, US Yields, DXY, Commodities, Gold)\n4. Quantitative Desk Takeaway (Bullish / Neutral / Bearish bias)\n\nKeep the analysis authoritative, dense, precise, and free of fluff.`,
      config: { tools: [{ googleSearch: {} }] },
    });
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    res.json({
      query, analysis: response.text || 'Tidak ada analisis yang dihasilkan.',
      searchQueries: groundingMetadata?.webSearchQueries || [],
      sources: groundingMetadata?.groundingChunks?.map((chunk: any) => ({ title: chunk.web?.title || 'Web Source', uri: chunk.web?.uri || '' })).filter((s: any) => s.uri) || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error generating macro search intel:', error);
    const errStr = error?.message || String(error);
    let friendlyMessage = 'Gagal memuat data pencarian makro terkini.';
    if (errStr.includes('API_KEY_INVALID') || errStr.includes('API key not valid') || errStr.includes('400')) friendlyMessage = 'Kunci API Gemini tidak valid atau belum diatur. Silakan periksa atau atur GEMINI_API_KEY di panel Settings > Secrets.';
    else if (errStr.includes('PERMISSION_DENIED') || errStr.includes('403')) friendlyMessage = 'Akses ditolak (403). Silakan periksa izin API key Anda di panel Settings > Secrets.';
    else if (errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('429')) friendlyMessage = 'Kuota API telah tercapai (429). Silakan coba beberapa saat lagi atau periksa kuota akun di Google AI Studio.';
    else friendlyMessage = errStr;
    res.status(500).json({ error: friendlyMessage });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => res.sendFile('dist/index.html', { root: '.' }));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`Macro Engine Desk Server running at http://0.0.0.0:${PORT}`));
}

startServer();
