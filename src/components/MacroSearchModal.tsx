import React, { useState } from 'react';

interface MacroSearchResult {
  query: string;
  analysis: string;
  searchQueries: string[];
  sources: { title: string; uri: string }[];
  timestamp: string;
}

interface MacroSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_TOPICS = [
  { label: 'Inflasi US CPI & Core CPI', query: 'Latest US CPI inflation report data numbers market consensus impact' },
  { label: 'Kebijakan Fed FOMC & Suku Bunga', query: 'Federal Reserve latest FOMC policy rate decision dot plot expectations' },
  { label: 'Tenaga Kerja US NFP & Pengangguran', query: 'US Nonfarm Payrolls NFP and unemployment rate latest release actual consensus' },
  { label: 'Likuiditas Global & Emas vs DXY', query: 'Global central bank liquidity gold price trends and US Dollar DXY impact' },
  { label: 'BoJ & Suku Bunga Yen Jepang', query: 'Bank of Japan interest rate policy Yen carry trade latest development' },
];

export const MacroSearchModal: React.FC<MacroSearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MacroSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setError(null);
    setQuery(searchQuery);

    try {
      const res = await fetch('/api/macro-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memuat riset intel makro.');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan jaringan saat menghubungi API.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(5, 7, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 780,
          maxHeight: '90vh',
          backgroundColor: '#0e1117',
          border: '1px solid var(--line-strong)',
          borderRadius: 8,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(56, 189, 248, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#121620',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 3,
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                color: 'var(--accent)',
                border: '1px solid var(--accent-border)',
                fontWeight: 700,
              }}
            >
              GOOGLE SEARCH GROUNDED
            </span>
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontFamily: 'var(--f-mono)',
                fontWeight: 700,
                color: 'var(--ink)',
                letterSpacing: '0.04em',
              }}
            >
              LIVE MACRO INTELLIGENCE // GEMINI 3.8 FLASH
            </h3>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={onClose}
            style={{ fontSize: 16, padding: '2px 8px', color: 'var(--mute)' }}
          >
            ✕
          </button>
        </div>

        {/* Search Bar & Preset Chips */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(query);
            }}
            style={{ display: 'flex', gap: 8 }}
          >
            <input
              type="text"
              className="in"
              placeholder="Cari rilis data ekonomi terkini, FOMC, atau sentimen pasar global..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1,
                fontSize: 13,
                padding: '8px 12px',
                backgroundColor: '#0a0d13',
                borderColor: 'var(--line-strong)',
              }}
            />
            <button
              type="submit"
              className="btn primary"
              disabled={isLoading || !query.trim()}
              style={{ padding: '8px 16px', fontSize: 12 }}
            >
              {isLoading ? 'Mencari...' : 'Riset Live'}
            </button>
          </form>

          {/* Quick Presets */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--f-mono)', color: 'var(--mute)', alignSelf: 'center' }}>
              Topik Cepat:
            </span>
            {PRESET_TOPICS.map((t) => (
              <button
                key={t.label}
                type="button"
                className="btn sm"
                disabled={isLoading}
                style={{
                  fontSize: 10.5,
                  padding: '3px 8px',
                  backgroundColor: '#131824',
                  borderColor: 'var(--line)',
                  color: 'var(--ink-secondary)',
                }}
                onClick={() => handleSearch(t.query)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isLoading && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-block',
                  width: 24,
                  height: 24,
                  border: '2px solid rgba(56, 189, 248, 0.2)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--mute)', marginTop: 12 }}>
                Menghubungi Google Search Grounding via Gemini 3.8 Flash...
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 6,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--bad)',
                fontFamily: 'var(--f-mono)',
                fontSize: 12,
              }}
            >
              <b>Terjadi Kendala:</b> {error}
            </div>
          )}

          {!isLoading && !error && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Query & Timestamp Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  gap: 6,
                  paddingBottom: 8,
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div style={{ fontSize: 12, fontFamily: 'var(--f-mono)', color: 'var(--accent)', fontWeight: 600 }}>
                  Topik Riset: "{result.query}"
                </div>
                <div style={{ fontSize: 11, fontFamily: 'var(--f-mono)', color: 'var(--mute)' }}>
                  Diperbarui: {new Date(result.timestamp).toLocaleTimeString('id-ID')} WIB
                </div>
              </div>

              {/* Analysis Text */}
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--ink)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--f-ui)',
                  backgroundColor: '#0a0d13',
                  padding: 14,
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                }}
              >
                {result.analysis}
              </div>

              {/* Search Queries & Sources */}
              {result.sources && result.sources.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div
                    style={{
                      fontFamily: 'var(--f-mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--mute)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 6,
                    }}
                  >
                    Sumber Verifikasi Google Search ({result.sources.length}):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--f-mono)',
                          padding: '3px 8px',
                          borderRadius: 4,
                          backgroundColor: '#121622',
                          border: '1px solid var(--line)',
                          color: 'var(--accent)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        ↗ {s.title || 'Sumber Web'}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isLoading && !error && !result && (
            <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--mute)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--ink)' }}>
                Riset Makro Real-Time Berbasis Data Google Search
              </div>
              <p style={{ maxWidth: 520, margin: '0 auto', fontSize: 12, lineHeight: 1.5 }}>
                Gunakan Gemini 3.8 Flash dengan Google Search Grounding untuk memverifikasi angka inflasi resmi terbaru,
                pernyataan pejabat Fed FOMC, data tenaga kerja, atau pergeseran posisi pasar global secara instan.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
