import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const SYMBOL_MAP: Record<string, string> = {
  EURUSD: 'EURUSD=X',
  USDJPY: 'JPY=X',
  XAUUSD: 'GC=F',
  GOLD: 'GC=F',
  WTI: 'CL=F',
  CRUDE: 'CL=F',
  SPX500: '^GSPC',
  SPX: '^GSPC',
  BTC: 'BTC-USD',
  BITCOIN: 'BTC-USD',
  USDIDR: 'IDR=X',
};

async function fetchYahooSnapshot(symbol: string) {
  const ticker = SYMBOL_MAP[symbol.toUpperCase()] || symbol.toUpperCase();
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance request failed for ${ticker}: ${response.status}`);
  }

  const data = (await response.json()) as any;
  const result = data?.chart?.result?.[0];
  if (!result) {
    throw new Error(`No Yahoo Finance data returned for ${ticker}.`);
  }

  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const close = result.indicators?.quote?.[0]?.close || [];
  const latestIndex = timestamps.length - 1;
  const lastTs = timestamps[latestIndex];
  const lastClose = close[latestIndex];

  return {
    symbol: ticker,
    source: 'Yahoo Finance',
    lastPrice: typeof lastClose === 'number' ? lastClose : meta.regularMarketPrice ?? null,
    previousClose: meta.previousClose ?? null,
    regularMarketPrice: meta.regularMarketPrice ?? null,
    currency: meta.currency ?? null,
    exchangeName: meta.exchangeName ?? null,
    timestamp: lastTs ? new Date(lastTs * 1000).toISOString() : new Date().toISOString(),
    isLive: true,
  };
}

function getCTraderConfigStatus() {
  const hasClientId = Boolean(process.env.CTRADER_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.CTRADER_CLIENT_SECRET);
  const hasAccessToken = Boolean(process.env.CTRADER_ACCESS_TOKEN);
  const hasAccountId = Boolean(process.env.CTRADER_ACCOUNT_ID);
  const host = process.env.CTRADER_HOST || 'demo';

  const configured = hasClientId && hasClientSecret && hasAccessToken && hasAccountId;

  return {
    source: 'cTrader',
    configured,
    host,
    mode: host === 'live' ? 'live' : 'demo',
    requiresBackendSecret: true,
    note: configured
      ? 'Configured in backend env; market snapshot still requires active OAuth stream and account access.'
      : 'Not configured in backend env. Set CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_ACCESS_TOKEN, and CTRADER_ACCOUNT_ID to enable cTrader comparison.',
  };
}

// Initialize GoogleGenAI
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

app.get('/api/source-compare', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || 'EURUSD').toUpperCase();

    const yfinance = await fetchYahooSnapshot(symbol);
    const ctrader = getCTraderConfigStatus();

    const delta = ctrader.configured && typeof yfinance.lastPrice === 'number'
      ? Number((yfinance.lastPrice - yfinance.lastPrice).toFixed(6))
      : null;

    res.json({
      symbol,
      updatedAt: new Date().toISOString(),
      yfinance,
      ctrader,
      delta,
      sources: [
        { ...yfinance, comparison: 'reference' },
        { ...ctrader, comparison: 'counterparty' },
      ],
      message: ctrader.configured
        ? 'Both sources are configured; active quote stream still needs to be started from the backend when you want live cTrader bid/ask updates.'
        : 'Yahoo Finance is available. cTrader is not configured yet; add backend credentials before enabling real cTrader comparison.',
    });
  } catch (error: any) {
    console.error('source-compare error:', error);
    res.status(500).json({
      error: error?.message || 'Unable to fetch comparison data',
      symbol: String(req.query.symbol || 'EURUSD').toUpperCase(),
    });
  }
});

// API Route: Real-time Macro Intelligence with Google Search Grounding
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
      contents: `You are an institutional macro research desk analyst at a quantitative hedge fund.
The user is requesting live, real-time macroeconomic intelligence and verified market context for: "${query}".

Analyze the latest verified updates using Google Search data. Structure your response professionally:
1. Executive Snapshot & Latest Official Data (actual numbers, dates, revisions)
2. Central Bank Stance / Market Consensus Impact
3. Cross-Asset Implications (Equities, US Yields, DXY, Commodities, Gold)
4. Quantitative Desk Takeaway (Bullish / Neutral / Bearish bias)

Keep the analysis authoritative, dense, precise, and free of fluff.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
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

    res.status(500).json({
      error: friendlyMessage,
    });
  }
});

// Mount Vite middleware for dev or serve static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Macro Engine Desk Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
