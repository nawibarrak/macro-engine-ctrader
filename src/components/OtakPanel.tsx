import React from 'react';

const NAMA_ASET: Record<string, string> = { XAUUSD: 'Emas', WTI: 'Minyak WTI', SPX: 'S&P 500', USDJPY: 'USD/JPY', EURUSD: 'EUR/USD' };
const NAMA_FAKTOR: Record<string, string> = {
  G: 'Pertumbuhan', I: 'Inflasi tersirat', P: 'Yield 2 tahun', L: 'Likuiditas bersih', R: 'Volatilitas (VIX)', RY: 'Yield riil', USD: 'Dolar',
};
const ARAH: Record<string, string> = { naik: 'c-ok', turun: 'c-bad', netral: 'c-warn', hawkish: 'c-bad', dovish: 'c-ok' };
const FASE: Record<string, string> = { Normal: 'c-ok', Waspada: 'c-warn', Stres: 'c-bad', Krisis: 'c-bad' };
const n1 = (v: any) => (v == null ? '–' : (+v).toFixed(1));
const n2 = (v: any) => (v == null ? '–' : (+v).toFixed(2));

interface Props { phase: any | null; otak: any | null }

export const OtakPanel: React.FC<Props> = ({ phase, otak }) => {
  const ph = phase;
  const phaseBox = !ph ? (
    <div className="note">Fase pasar belum dihitung (data/phase.json belum ada).</div>
  ) : (
    <div className="bar" style={{ flexWrap: 'wrap' }}>
      <div className="it">
        <b>Fase pasar</b>
        <span>
          {ph.fase ? <span className={`chip ${FASE[ph.fase] || 'c-warn'}`}>{ph.fase}</span> : <span className="chip c-warn">Tidak dihitung</span>}{' '}
          <span className="small mute">{ph.tanggal || ''}</span>
          {ph.alasan && <div className="small s-basi">{ph.alasan}</div>}
          {(ph.catatan || []).map((c: string, i: number) => <div key={i} className="small s-basi">{c}</div>)}
          <div className="small mute">
            Ambang {ph.status_ambang}
            {(ph.uji_peristiwa || []).filter((x: any) => x.hasil === 'tidak sesuai').length > 0 &&
              ` · uji peristiwa tidak sesuai: ${(ph.uji_peristiwa || []).filter((x: any) => x.hasil === 'tidak sesuai').map((x: any) => x.nama).join(', ')}`}
          </div>
        </span>
      </div>
      {ph.distribusi && (
        <div className="it">
          <b>Sebaran fase (riwayat)</b>
          <span className="small">{Object.entries(ph.distribusi).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
        </div>
      )}
    </div>
  );

  if (!otak) {
    return (
      <section className="p" id="otak">
        <div className="ph"><h2>Otak makro</h2><span className="tag t-i">DISIMPULKAN</span></div>
        {phaseBox}
        <div className="note">data/otak.json belum ada: jalankan workflow setelah skrip tahap 3 terpasang.</div>
      </section>
    );
  }
  const k = otak.kejutan, kd = otak.kondisi, fd = otak.fed, al = otak.aliran;
  const conf = fd.terkonfirmasi === true ? <span className="chip c-ok">✓ dibenarkan pasar</span>
    : fd.terkonfirmasi === false ? <span className="chip c-bad">✕ dilawan pasar</span>
    : <span className="chip c-warn">belum terkonfirmasi</span>;
  const faktor = Object.entries(otak.faktor || {}).map(([f, v]: any) => `${NAMA_FAKTOR[f] || f} ${v > 0 ? '+' : ''}${v}σ`).join(' · ');
  const tl: any[] = otak.tautan || [];

  return (
    <section className="p" id="otak">
      <div className="ph">
        <h2>Otak makro</h2><span className="tag t-i">DISIMPULKAN</span>
        <span className="sub">Rantai dari data ekonomi ke arah aliran modal. Ambang masih kandidat; ini bukti untuk keputusan, bukan sinyal.</span>
      </div>
      {phaseBox}
      <div className="bar" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        <div className="it"><b>Kejutan rilis</b><span>
          {!k.tersedia ? <span className="mute">{k.alasan || 'tidak tersedia'}</span> : (<>
            Skor <b className="num">{n1(k.skor)}</b> (positif = condong hawkish) · hawkish {k.suara.hawkish}, dovish {k.suara.dovish}, netral {k.suara.netral} dari {k.suara.total}
            {k.proksi > 0 && <div className="small s-basi">{k.proksi} dari {k.suara.total} memakai konsensus proksi (rata-rata riwayat), bukan survei.</div>}
            <div className="small mute">{k.komponen.slice(0, 6).map((x: any) => `${x.ind} ${x.z > 0 ? '+' : ''}${x.z}σ`).join(' · ')}</div>
          </>)}
        </span></div>
        <div className="it"><b>Kondisi ekonomi</b><span>
          {kd.kuadran ? <><b>{kd.kuadran}</b> · pertumbuhan {n2(kd.G)}σ, inflasi {n2(kd.I)}σ <span className="small mute">({kd.asof})</span></> : <span className="mute">{kd.alasan || 'tidak tersedia'}</span>}
        </span></div>
        <div className="it"><b>Reaksi Fed</b><span>
          {fd.stance ? (<>
            <span className={`chip ${ARAH[fd.stance]}`}>{fd.stance}</span> {conf}
            <div className="small">Data {n1(fd.sisi_data)} (kejutan {n1(fd.skor_kejutan)}, celah Taylor {n1(fd.skor_taylor)}) · harga 2 tahun vs efektif {fd.pasar ? n2(fd.pasar.harga_2y) : '–'} poin</div>
            <div className="small mute">{fd.catatan}</div>
          </>) : <span className="mute">{fd.catatan || 'tidak tersedia'}</span>}
        </span></div>
        <div className="it"><b>Aliran modal (20 hari)</b><span>
          {(al.peringkat || []).length ? (<>
            {al.label && <b>{al.label} </b>}(nada {n2(al.nada_risiko)})
            <div className="small">Mengalir ke: {(al.mengalir_ke || []).join(', ') || '–'}<br />Keluar dari: {(al.keluar_dari || []).join(', ') || '–'}</div>
            <div className="small mute">{al.peringkat.map((r: any) => `${r.kelas} ${r.z > 0 ? '+' : ''}${r.z}σ`).join(' · ')}</div>
          </>) : <span className="mute">tidak tersedia</span>}
        </span></div>
      </div>
      <div className="small mute" style={{ margin: '6px 0' }}>Faktor pasar 5 hari: {faktor || '–'}. Fase pasar: {otak.fase_pasar || 'tidak dihitung'}.</div>
      <div className="tw">
        <table>
          <thead><tr><th>Aset</th><th>Dukungan makro</th><th className="r">Keyakinan</th><th>Kontribusi faktor</th><th>Skenario alternatif</th></tr></thead>
          <tbody>
            {Object.entries(otak.aset || {}).map(([a, v]: any) => !v.dihitung ? (
              <tr key={a}><td>{NAMA_ASET[a] || a}</td><td colSpan={4} className="s-gagal small">{v.alasan}</td></tr>
            ) : (
              <tr key={a}>
                <td>{NAMA_ASET[a] || a}</td>
                <td><span className={`chip ${ARAH[v.arah]}`}>{v.arah}</span> <span className="num">{n1(v.skor)}</span></td>
                <td className="num">{v.keyakinan}%</td>
                <td className="small">
                  {Object.entries(v.kontribusi).sort((x: any, y: any) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 4).map(([f, c]: any) => `${NAMA_FAKTOR[f] || f} ${c > 0 ? '+' : ''}${c}`).join(' · ')}
                  <div className="mute">
                    beta: {v.beta_sumber}
                    {v.faktor_hilang.length > 0 && ` · faktor hilang: ${v.faktor_hilang.map((f: string) => NAMA_FAKTOR[f] || f).join(', ')}`}
                    {v.cot && ` · posisi spekulan persentil ${v.cot.persentil}`}
                  </div>
                </td>
                <td className="small">{v.alternatif.length ? v.alternatif.map((x: string, i: number) => <div key={i}>{x}</div>) : <span className="mute">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="small">Uji tautan sebab-akibat ({tl.filter((t) => t.lulus).length}/{tl.length} lulus)</summary>
        <ul className="small">
          {tl.map((t, i) => (
            <li key={i}>{t.dari} → {t.ke} ({t.tanda > 0 ? '+' : '−'}): {t.lulus ? <span className="s-ok">lulus</span> : <span className="s-gagal">tidak lulus</span>}{' '}
              <span className="mute">{t.alasan}{t.korelasi != null ? `, korelasi ${t.korelasi}, subjendela ${t.subjendela_searah}` : ''}</span></li>
          ))}
        </ul>
      </details>
      <div className="small mute" style={{ marginTop: 6 }}>{otak.catatan} Ambang: {otak.versi} ({otak.status}).</div>
    </section>
  );
};
