import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const SYMBOLS: Record<string, { yahoo: string; label: string; decimals: number }> = {
  EURUSD: { yahoo: 'EURUSD=X', label: 'EUR/USD', decimals: 5 },
  USDJPY: { yahoo: 'JPY=X', label: 'USD/JPY', decimals: 3 },
  XAUUSD: { yahoo: 'GC=F', label: 'Gold futures (GC=F)', decimals: 2 },
  WTI: { yahoo: 'CL=F', label: 'WTI futures (CL=F)', decimals: 2 },
  SPX: { yahoo: '^GSPC', label: 'S&P 500 index', decimals: 2 },
  BTC: { yahoo: 'BTC-USD', label: 'Bitcoin / USD', decimals: 2 },
  USDIDR: { yahoo: 'IDR=X', label: 'USD/IDR', decimals: 2 },
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
    if (typeof closes[i] === 'number' && Number.isFinite(closes[i])) {
      latestIndex = i;
      break;
    }
  }
  const chartPrice = latestIndex >= 0 ? closes[latestIndex] : null;
  const price = typeof chartPrice === 'number' ? chartPrice : (meta.regularMarketPrice ?? null);
  const timestamp = latestIndex >= 0 && timestamps[latestIndex]
    ? new Date(timestamps[latestIndex] * 1000).toISOString()
    : meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : null;

  return {
    source: 'Yahoo Finance',
    symbol: instrument.yahoo,
    label: instrument.label,
    price,
    priceType: chartPrice == null ? 'regularMarketPrice (provider snapshot)' : '1-minute candle close',
    currency: meta.currency ?? null,
    exchangeName: meta.exchangeName ?? null,
    timestamp,
    fetchedAt: new Date().toISOString(),
  };
}

function getCTraderConfigStatus() {
  const configured = Boolean(
    process.env.CTRADER_CLIENT_ID &&
    process.env.CTRADER_CLIENT_SECRET &&
    process.env.CTRADER_ACCESS_TOKEN &&
    process.env.CTRADER_ACCOUNT_ID
  );
  const host = (process.env.CTRADER_HOST || 'demo').trim().toLowerCase();
  return {
    source: 'cTrader',
    configured,
    connected: false,
    host,
    mode: host === 'live' ? 'live' : 'demo',
    bid: null,
    ask: null,
    mid: null,
    timestamp: null,
    priceType: 'bid/ask spot quote',
    note: configured
      ? 'Credentials are present, but this app has not connected the cTrader quote stream yet.'
      : 'Not configured. cTrader quote stream is not connected.',
  };
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
    const [yfinance, ctrader] = await Promise.all([
      fetchYahooSnapshot(requested),
      Promise.resolve(getCTraderConfigStatus()),
    ]);
    const comparable = ctrader.connected && typeof ctrader.mid === 'number' && typeof yfinance.price === 'number';
    const difference = comparable ? ctrader.mid! - yfinance.price! : null;

    res.json({
      symbol: requested,
      label: SYMBOLS[requested].label,
      updatedAt: new Date().toISOString(),
      yfinance,
      ctrader,
      comparison: {
        difference,
        differencePercent: comparable && yfinance.price !== 0 ? (difference! / yfinance.price!) * 100 : null,
        comparable,
        note: comparable
          ? 'Mid-price difference; source timestamps must be checked before interpreting.'
          : 'Difference unavailable until both sources return actual price observations.',
      },
      message: ctrader.note,
    });
  } catch (error: any) {
    console.error('source-compare error:', error);
    res.status(502).json({ error: error?.message || 'Unable to fetch Yahoo Finance comparison data', symbol: requested });
  }
});

app.post('/api/macro-search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query parameter is required' });
      return;
    }

    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Please check the Secrets panel in Settings.',
      });
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
      query,
      analysis: response.text || 'Tidak ada analisis yang dihasilkan.',
      searchQueries: groundingMetadata?.webSearchQueries || [],
      sources: groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Web Source',
        uri: chunk.web?.uri || '',
      })).filter((s: any) => s.uri) || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error generating macro search intel:', error);
    const errStr = error?.message || String(error);
    let friendlyMessage = 'Gagal memuat data pencarian makro terkini.';
    if (errStr.includes('API_KEY_INVALID') || errStr.includes('API key not valid') || errStr.includes('400')) {
      friendlyMessage = 'Kunci API Gemini tidak valid atau belum diatur. Silakan periksa atau atur GEMINI_API_KEY di panel Settings > Secrets.';
    } else if (errStr.includes('PERMISSION_DENIED') || errStr.includes('403')) {
      friendlyMessage = 'Akses ditolak (403). Silakan periksa izin API key Anda di panel Settings > Secrets.';
    } else if (errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('429')) {
      friendlyMessage = 'Kuota API telah tercapai (429). Silakan coba beberapa saat lagi atau periksa kuota akun di Google AI Studio.';
    } else {
      friendlyMessage = errStr;
    }
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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Macro Engine Desk Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
