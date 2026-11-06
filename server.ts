import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

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
