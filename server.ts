import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// Initialize GoogleGenAI
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

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

// API Route: harga cTrader dari relay lokal (ctrader/ctrader_relay.py)
app.get('/api/ctrader/quotes', async (_req, res) => {
  try {
    const port = process.env.CTRADER_RELAY_PORT || '8787';
    const r = await fetch(`http://127.0.0.1:${port}/quotes`, { signal: AbortSignal.timeout(3000) });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(503).json({ status: 'relay_mati', message: 'Relay cTrader tidak berjalan. Jalankan: python ctrader/ctrader_relay.py' });
  }
});

// API Route: perbandingan Yahoo vs cTrader (dipakai kotak Source Compare)
const COMPARE_MAP: Record<string, { label: string; yf: string; priceType: string; spot: boolean }> = {
  EURUSD: { label: 'EUR/USD', yf: 'EURUSD=X', priceType: 'FX minute candle close', spot: true },
  USDJPY: { label: 'USD/JPY', yf: 'JPY=X', priceType: 'FX minute candle close', spot: true },
  XAUUSD: { label: 'Gold (Yahoo GC=F)', yf: 'GC=F', priceType: 'Gold futures minute close (bukan spot)', spot: false },
  WTI: { label: 'WTI (Yahoo CL=F)', yf: 'CL=F', priceType: 'Crude futures minute close', spot: false },
  SPX: { label: 'S&P 500', yf: '^GSPC', priceType: 'Index minute close', spot: false },
  BTC: { label: 'Bitcoin / USD', yf: 'BTC-USD', priceType: 'Crypto minute close', spot: true },
  USDIDR: { label: 'USD/IDR', yf: 'IDR=X', priceType: 'FX minute candle close', spot: true },
};

app.get('/api/source-compare', async (req, res) => {
  const key = String(req.query.symbol || 'EURUSD');
  const item = COMPARE_MAP[key];
  if (!item) {
    res.status(400).json({ error: `Simbol tidak dikenal: ${key}` });
    return;
  }
  const fetchedAt = new Date().toISOString();
  const out: any = { symbol: key, label: item.label, updatedAt: fetchedAt };

  // --- Yahoo Finance ---
  const yfBase = { source: 'Yahoo Finance', symbol: item.yf, label: item.label, priceType: item.priceType, fetchedAt };
  try {
    const yr = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.yf)}?interval=1m&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) },
    );
    const yj: any = await yr.json();
    const result = yj?.chart?.result?.[0];
    const meta = result?.meta || {};
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
    const times: number[] = result?.timestamp || [];
    let i = closes.length - 1;
    while (i >= 0 && closes[i] == null) i--;
    const price = i >= 0 ? closes[i] : (meta.regularMarketPrice ?? null);
    const unix = i >= 0 ? times[i] : meta.regularMarketTime;
    out.yfinance = {
      ...yfBase,
      price,
      currency: meta.currency ?? null,
      exchangeName: meta.exchangeName ?? null,
      timestamp: unix ? new Date(unix * 1000).toISOString() : null,
    };
  } catch {
    out.yfinance = { ...yfBase, price: null, currency: null, exchangeName: null, timestamp: null };
  }

  // --- cTrader (dari relay lokal) ---
  const ctBase = { source: 'cTrader', priceType: 'bid/ask spot quote' };
  try {
    const port = process.env.CTRADER_RELAY_PORT || '8787';
    const rr = await fetch(`http://127.0.0.1:${port}/quotes`, { signal: AbortSignal.timeout(3000) });
    const rj: any = await rr.json();
    const q = rj?.quotes?.[key];
    const live = Boolean(q) && q.mid != null && !q.stale;
    out.ctrader = {
      ...ctBase,
      configured: true,
      connected: live,
      host: rj?.host || '–',
      mode: rj?.status || 'belum diketahui',
      bid: q?.bid ?? null,
      ask: q?.ask ?? null,
      mid: q?.mid ?? null,
      timestamp: q?.observed_utc ?? null,
      note: live
        ? `Simbol broker ${q.symbol}, umur quote ${q.age_s}s`
        : q?.stale ? 'Quote basi (stale), belum ada harga baru.' : (rj?.message || 'Quote belum tersedia dari relay.'),
    };
  } catch {
    out.ctrader = {
      ...ctBase,
      configured: false,
      connected: false,
      host: '–',
      mode: 'relay_mati',
      bid: null,
      ask: null,
      mid: null,
      timestamp: null,
      note: 'Relay cTrader tidak berjalan. Jalankan: python ctrader/ctrader_relay.py',
    };
  }

  // --- Selisih (hanya bermakna untuk harga spot) ---
  const yp = out.yfinance.price;
  const cm = out.ctrader.mid;
  if (yp != null && cm != null && out.ctrader.connected && item.spot) {
    const diff = cm - yp;
    out.comparison = { difference: diff, differencePercent: (diff / yp) * 100, comparable: true, note: 'cTrader mid dikurangi harga Yahoo.' };
  } else {
    out.comparison = {
      difference: null,
      differencePercent: null,
      comparable: false,
      note: !item.spot
        ? 'Yahoo memberi harga futures/indeks, cTrader harga CFD spot. Selisihnya tidak setara, jadi tidak dihitung.'
        : 'Selisih dihitung hanya jika kedua sumber punya harga aktual.',
    };
  }

  res.json(out);
});

// Serve frontend static files if 'dist' exists, or fallback gracefully with JSON error for unhandled API routes
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint tidak ditemukan' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Catch-all for unhandled API routes when running in dev mode without static dist
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint tidak ditemukan' });
  });
}

app.listen(PORT, '0.0.0.0', (err?: Error) => {
  if (err) {
    console.error('GAGAL MENYALA (port 3000 kemungkinan masih dipakai server lama):', err.message);
    process.exit(1);
  }
  console.log(`Macro Engine Desk Server running at http://0.0.0.0:${PORT}`);
});