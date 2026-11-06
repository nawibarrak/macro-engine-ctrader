# Macro Engine Desk v2: kanon konsep

Berkas ini adalah acuan tunggal. Sesi mana pun (manusia atau AI) yang akan mengubah sistem WAJIB membacanya
bersama docs/PROGRESS.md sebelum menulis kode. Bila kode dan berkas ini bertentangan, yang salah adalah kode,
kecuali perubahan konsep sudah dicatat di "Log keputusan" di bawah SEBELUM kode diubah.

## Tujuan
Sistem analisis fundamental otomatis untuk satu trader: mengumpulkan data gratis, membersihkan, menganalisis,
lalu memberi bias BUY / SELL / HOLD per aset. Teknikal untuk titik entry baru ditambah SETELAH ada rekomendasi aksi (tahap 6).
Horizon: harian sampai mingguan. Aset prioritas sinyal: XAUUSD, WTI, S&P 500, USDJPY, EURUSD.
Berjalan di GitHub Pages + GitHub Actions (tanpa server): pembaruan near-real-time (menit), bukan tick.

## Tiga lapis (inti desain)
- TERUKUR: angka dari sumber. Selalu punya satuan, frekuensi, tanggal data, sumber, status.
- DISIMPULKAN: hasil hitungan sistem (fase, rezim, tekanan kebijakan, risiko pembalikan). Selalu menampilkan bukti dan ambang.
- DIPUTUSKAN: tindakan (BUY / SELL / HOLD) beserta gerbang yang lolos atau gagal dan jejak keputusan.
Tidak boleh ada kotak di layar yang mencampur ketiganya tanpa label.

## Invarian (aturan yang tidak boleh dilanggar)
Baris bertanda [uji] diperiksa otomatis oleh scripts/check_concept.py pada setiap run.
- K1 [uji] Setiap panel di index.html membawa satu label: TERUKUR, DISIMPULKAN, atau DIPUTUSKAN.
- K2 [uji] Beranda hanya-baca: tidak ada kolom input, textarea, atau select di index.html. Override manual hanya di lanjutan.html.
- K3 [uji] Setiap seri yang ditampilkan ada di scripts/registry.py dengan label, frekuensi, sumber berlapis, dan batas wajar (kecuali COT).
- K4 [uji] Pipeline utama tidak memakai Kaggle atau Colab. (Sisa lama: prob.yml dan l2_probability.py, diganti di tahap 4.)
- K5 [uji] Tidak ada singkatan sebagai label metrik makro: tulis "Pertumbuhan" dan "Inflasi", bukan G atau I.
- K6 Setiap kesimpulan menampilkan bukti pendukung dan ambang yang dipakai (berlaku dari tahap 3).
- K7 Semua ambang keputusan hidup di config/thresholds.json beserta alasan dan status pengujiannya. Tidak ada ambang tersembunyi di kode.
- K8 [uji: GATE] Bawaan adalah HOLD. Sinyal keluar hanya bila SEMUA gerbang lolos: gerbang data, audit silang-sumber, skor, keyakinan, kepastian rezim.
- K9 [uji] Proksi selalu berlabel "proksi". Angka yang tidak bisa diverifikasi tidak ditampilkan sebagai fakta.
- K10 Kata "terverifikasi" hanya boleh muncul bila ada bukti di data/audit_series.json.
- K11 [uji] Kunci API hanya di GitHub Secrets. Tidak ada kunci di berkas repo.
- K12 [uji] Perubahan konsep dicatat di Log keputusan sebelum kode berubah. docs/PROGRESS.md diperbarui tiap tahap dan jumlah seri-nya cocok dengan registry.
- K13 Keputusan berbasis aturan yang bisa diuji (backtest, jurnal, evaluasi 1/4/12 minggu), bukan penilaian LLM.
- K14 Kegagalan sumber tidak boleh diam-diam menghasilkan angka: data lama dipakai dan ditandai, atau seri ditahan.
- K15 Auto-pilot bisa dimatikan: ada tombol yang mengembalikan sistem menjadi agregator data murni (dibangun di tahap 5).
- K16 [uji: UNUSED] Tidak ada berkas yang tidak dipakai: skrip harus dipanggil pipeline.py atau diimpor skrip lain; berkas yang tidak lagi dipakai dihapus saat itu juga (hemat token dan mudah diaudit).

## Pipeline
sumber -> kumpulkan (penyedia berlapis, cache, asal data) -> bersihkan (satuan, vintage, batas wajar, lompatan) ->
audit (silang-sumber, konsistensi internal) -> fitur -> simpulkan -> putuskan -> beranda.
Semua langkah dijalankan scripts/pipeline.py (workflow cukup memanggil satu skrip itu; langkah baru ditambah di sana).
Aliran cepat (harga, yield, volatilitas, likuiditas harian) dan aliran lambat (makro, COT) dipisah: keputusan boleh
memakai nilai terakhir aliran lambat tanpa menunggu rilis berikutnya.

## Tahap dan kriteria selesai
1. Lapisan data v2: semua seri hijau, tiap angka punya sumber dan frekuensi.
2. Beranda dan grafik: kondisi pasar terbaca dari satu layar.
2b. Audit data: silang-sumber dan konsistensi internal, hasil tampil di beranda, gerbang menutup bila seri kunci gagal diaudit.
3. Otak otomatis: Fed reaction function, mesin fase dan skenario (Normal / Waspada / Stres / Krisis dengan histeresis), aliran modal terukur, skor risiko COT. Tidak ada input manual untuk analisis.
4. Probabilitas harian: L2 horizon harian dari yfinance dan FRED, tanpa Kaggle atau Colab. Hasil lulus atau gagal tampil.
5. Keputusan dan jurnal: gerbang baru, kepastian rezim, panel kontribusi tiap faktor, jurnal append-only, evaluasi 1/4/12 minggu, backtest bagian berbasis pasar, tombol auto-pilot off.
6. Teknikal untuk entry: hanya untuk aset yang sinyalnya BUY atau SELL.
Urutan wajib. Tahap berikutnya tidak dimulai sebelum tahap sebelumnya lulus audit dan check_concept bersih.

## Protokol setiap sesi
1. Baca berkas ini dan docs/PROGRESS.md. 2. Jalankan `python scripts/check_concept.py`. 3. Kerjakan SATU tahap.
4. Sebelum menyerahkan: jalankan uji, check_concept, dan perbarui PROGRESS.md (termasuk apa yang BELUM terbukti).
5. Bila perlu menyimpang dari konsep: tulis dulu di Log keputusan, minta persetujuan pemilik, baru ubah kode.

## Istilah
Seri = satu deret waktu di registry. Gerbang data = untuk satu aset: semua masukan umum DAN masukan aset itu segar dan lolos audit (config/gates.json). Proksi = pengganti terdekat bila angka resmi tidak gratis.
Basi = lewat batas umur. Ditahan = lompatan ekstrem menunggu konfirmasi. Silang-sumber = membandingkan dua sumber independen untuk besaran yang sama.

## Rancangan analisis tahap 3
Rantai (semua DISIMPULKAN, ambang di config/thresholds.json, status kandidat). Hasil adalah bukti, bukan sinyal.
- A. Kondisi: kuadran Goldilocks / Reflasi / Stagflasi / Deflasi dari z-score pertumbuhan dan inflasi aktual (zona netral = campuran).
- B. Kejutan rilis: skor berbobot (aktual - konsensus) / sd kejutan historis, paruh umur 10 hari, menggantikan voting 6 dari 10. Positif = hawkish.
- C. Reaksi Fed: sisi data (kejutan + celah aturan Taylor) lalu konfirmasi pasar: gerak 5 hari yield 2 tahun harus searah (z minimal ambang). Yield 2 tahun vs suku efektif dipakai sebagai konteks harga pasar.
- D. Tautan sebab-akibat diuji, bukan diasumsikan: korelasi perubahan 5 hari (750 pengamatan), tanda benar, dan searah di minimal 3 dari 4 subjendela. Tidak lulus = kurang keyakinan.
- E. Pengubah: fase pasar (Normal/Waspada/Stres/Krisis dari VIX dan HYOAS, persentil point-in-time, histeresis) mengalikan keyakinan.
- F. Aliran modal terukur: z 20 hari tiap kelas aset, nada risiko = rata-rata kelas berisiko dikurangi kelas aman. Posisi spekulan (COT) lewat persentil 156 minggu.
- G. Skor dukungan makro per aset = jumlah beta x faktor (pertumbuhan, inflasi, yield 2 tahun, likuiditas, VIX, yield riil, dolar). Beta dari estimasi bila menang walk-forward, selain itu prior. Keyakinan = heuristik 4 komponen x pengali fase, bukan probabilitas. Skenario alternatif ditampilkan.

## Log keputusan
- 2026-10-05 Pemilik menyetujui: L2 harian (menit-an hanya riset), aset prioritas XAUUSD/WTI/SPX/USDJPY/EURUSD, jeda 5-30 menit dari GitHub Actions diterima.
- 2026-10-05 Kaggle dan Colab dikeluarkan dari pipeline utama (K4).
- 2026-10-05 Masukan eksternal diadopsi: circuit breaker data, panel kontribusi faktor, label penuh tanpa singkatan, dua aliran cepat/lambat, tombol auto-pilot off.
- 2026-10-05 Audit data (tahap 2b) dikerjakan SEBELUM tahap 3 karena kesimpulan dan sinyal bergantung pada data. Kanon konsep dan pemeriksa otomatis ditambahkan atas permintaan pemilik agar konsisten antar sesi.
- 2026-10-07 WTI: pemilik memeriksa manual (Finviz futures per jam dan TradingView SPOTCRUDE): CL=F selaras dengan pasar; FRED DCOILWTICO (spot EIA) terlambat sekitar seminggu dan melompat pada pekan pergantian kontrak, jadi tidak layak menjadi hakim harian. Keputusan: selisih FRED-spot vs futures hanya PERINGATAN (basis struktural), tidak menutup gerbang. Verifikasi WTI beralih ke konsistensi dengan Brent (korelasi dan rasio). Seri BRENT ditambah (tidak kunci).
- 2026-10-07 Diusulkan, menunggu persetujuan pemilik: gerbang per aset (data pasar umum menutup semua aset; data khusus aset hanya menutup aset itu). Belum berlaku.
- 2026-10-07 Koreksi uji WTI/Brent: uji 'rasio stabil' (dari pasangan emas/GLD) salah untuk dua patokan minyak berbeda karena selisihnya bergerak dengan fundamental (data asli: rasio 0,888 vs median 0,936 menjadi gagal). Diganti batas kewajaran struktural: pass bila rasio WTI/Brent 0,78 sampai 1,00; peringatan 0,70 sampai 0,78 atau 1,00 sampai 1,05; gagal di luar itu. Batas ditetapkan dari struktur pasar (WTI umumnya di bawah Brent), bukan dari satu pembacaan. Uji korelasi tetap menjadi penjaga utama.
- 2026-10-07 DISETUJUI pemilik: gerbang data PER ASET. Gerbang umum (masukan pasar-luas: US02Y, US10Y, FED, VIX, HYOAS) menutup semua aset; masukan khusus aset hanya menutup aset itu. Daftar ada di config/gates.json; setiap seri kunci wajib terdaftar di sana (diperiksa check_concept, aturan GATE). Audit tambahan dikerjakan SEBELUM tahap 3: US02Y dibanding Treasury.gov, FED diperiksa terhadap batas target (suku bunga efektif harus di dalam kisaran). Audit klaim pengangguran ke DOL ditunda sampai format berkas DOL terlihat (tidak bisa diuji dari sandbox).
- 2026-10-07 Saran sumber audit dari pihak luar ditinjau. Diterima: NY Fed Markets API (EFFR harian, tanpa kunci) sebagai pembanding independen target Fed. Ditolak: FRED sebagai 'cadangan' untuk seri yang memang bersumber dari FRED (sirkular, bukan verifikasi); Treasury fiscaldata avg_interest_rates (itu bunga rata-rata utang bulanan, bukan yield 2 tahun); Alpha Vantage WTI (turunan EIA, sama dengan FRED); rumus HYG/IEF sebagai skor stres (bukan spread kredit; HYG vs HYOAS sudah diuji korelasinya). Ditunda: emas dari Alpha Vantage atau sejenisnya (butuh kunci di GitHub Secrets dan pembatasan frekuensi pemanggilan). Kegagalan audit menutup gerbang, bukan diam-diam beralih ke sumber cadangan (K14).
- 2026-10-08 Pemilik menetapkan: berkas yang tidak dipakai dihapus dan tidak boleh dibuat (K16). Dihapus: scripts/l2_probability.py, requirements-l2.txt, .github/workflows/prob.yml, data/prob_export.json, serta kartu dan kode probabilitas Kaggle di lanjutan.html. Probabilitas harian dibangun ulang di tahap 4 tanpa Kaggle.
- 2026-10-09 Pemilik menyetujui blok fase pasar: dimensi volatilitas (VIX) dan kredit (HYOAS), NFCI hanya konteks, persentil point-in-time 75/90/97, Krisis wajib kurva VIX terbalik, histeresis turun satu tingkat setelah 3 hari. Ambang berstatus kandidat; bila data asli menunjukkan Waspada lebih dari sekitar 35% hari, persentil 'naik' dinaikkan.
- 2026-10-31 Pemilik menyerahkan perancangan rantai analisis (data ekonomi sampai arah aliran modal) kepada Claude: dirancang setara praktik institusi dan hal yang luput dimasukkan. Hasil: bagian "Rancangan analisis tahap 3" di atas.
- 2026-11-01 Otak makro dibangun (phase.py, otak.py). Keputusan teknis: konfirmasi Fed memakai gerak 5 hari yield 2 tahun (bukan levelnya); seri EFFR dan DTB3 ditambah (registry 70); riwayat VIX, VIX3M, HYOAS, NFCI diperpanjang untuk persentil; audit silang-sumber: selisih hari terakhir yang melenceng jauh (>3x toleransi) padahal median 10 hari cocok kini GAGAL, bukan peringatan.
- 2026-11-06 Tampilan dipindah ke React/Vite (commit 1 Nov, atas inisiatif pemilik) tetapi commit itu menghapus scripts/*.py dan requirements.txt sehingga pipeline berhenti dan data membeku sejak 31 Okt. Keputusan: GABUNG. Pipeline Python dikembalikan, tampilan React dipertahankan, panel Otak makro dan fase ditulis ulang di React (src/components/OtakPanel.tsx), feed.yml membangun dengan `vite build` (tanpa tsc agar galat tipe tidak menghentikan data) dan menyalin dist beserta data ke situs. check_concept memeriksa berkas React. Pencarian Gemini (server.ts) tidak berjalan di GitHub Pages.
- 2026-11-06 Run asli pertama tahap 3 dibaca. Temuan dan perbaikan: (1) riwayat VIX/HYOAS terpotong KEEP=1300 titik sehingga fase baru terhitung dari 16 Sep dan uji peristiwa 'tidak tercakup data': seri riwayat panjang kini disimpan penuh dan diambil ulang sekali; min_obs fase turun 750 ke 250 karena HYOAS dari FRED tampaknya hanya sekitar 3 tahun (786 titik), jadi hanya uji Tarif 2025 yang mungkin tercakup, Covid dan SVB tidak; (2) keyakinan aliran modal memakai kunci yang salah (XAUUSD vs GLD): kini tiap aset punya seri aliran di config (USDJPY dan EURUSD lewat DXY); (3) tulisan 'LIVE 14MS' di header React adalah angka palsu: diganti umur data sebenarnya; (4) peringatan deprecation Python menutupi baris hasil di pipeline.json: disembunyikan; (5) catatan Fed bila data netral tetapi harga pasar condong satu arah.
