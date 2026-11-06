# Progres (diperbarui tiap tahap; check_concept memeriksa angka seri)

Jumlah seri registry: 70

| Tahap | Status | Bukti | Belum terbukti |
|---|---|---|---|
| 1 Lapisan data v2 | Selesai, berjalan di GitHub | status.json run asli: 48 dari 50 seri ok (sebelum 17 seri baru) | 17 seri baru (barometer, COT, DefiLlama) belum diuji di data asli |
| 2 Beranda dan grafik | Dibangun, diuji dengan data uji | Render desktop/ponsel/gelap tanpa error JS | Belum dilihat dengan data asli di situs |
| 2b Audit data dan penjaga konsep | Selesai, berjalan di GitHub (2026-10-07): 68 seri segar, 39 uji lolos, 0 gagal, 1 peringatan, gerbang terbuka, sesuai konsep | Run asli; WTI diverifikasi manual terhadap Finviz/TradingView dan lewat konsistensi dengan Brent | Gerbang per aset (config/gates.json, scripts/gates.py) dan audit US02Y ke Treasury.gov serta batas target FED dibangun 2026-10-07, belum jalan di GitHub. Klaim pengangguran ke DOL ditunda (format berkas belum terlihat). XAUUSD, WTI, HYOAS belum punya sumber kedua |
| 3 Otak otomatis | Dibangun (2026-11-01): scripts/phase.py (fase pasar) dan scripts/otak.py (kejutan rilis, kondisi, reaksi Fed, faktor, aliran modal, COT, skor per aset); diuji dengan data buatan; tampil di beranda | Tes data buatan, check_concept bersih | Semua ambang config/thresholds.json berstatus KANDIDAT, belum dijalankan pada data asli. Konsensus rilis masih proksi. Bobot kejutan, pengali fase, dan beta prior belum dikalibrasi |
| 4 Probabilitas harian | Belum dimulai | | |
| 5 Keputusan dan jurnal | Belum dimulai | | |
| 6 Teknikal entry | Belum dimulai | | |

## Masalah terbuka
- Sinyal BUY/SELL/HOLD masih mesin lama di lanjutan.html (tidak sesuai K7, K8 sepenuhnya) sampai tahap 5.
- Probabilitas L2 lama (Kaggle) sudah dihapus dari repo; penggantinya dibangun di tahap 4 tanpa Kaggle.
- Bank Indonesia belum ada (sumber BIS belum diuji).
- Jendela rilis rapat (5-10 menit setelah jam rilis) belum ada.

## Langkah berikutnya
Jalankan workflow dengan skrip tahap 3, lalu kirim tangkapan layar kotak Fase pasar dan panel Otak makro. Periksa: distribusi fase di data/phase.json (bila Waspada > sekitar 35% hari, naikkan persentil 'naik' di config/thresholds.json), uji peristiwa (Covid, SVB, Tarif, Tenang), uji tautan, dan kewajaran skor per aset. Run asli 6 Nov: semua langkah ok, 41 uji lolos, semua gerbang terbuka, fase Stres. Perbaikan 6 Nov (riwayat penuh, aliran per aset, header jujur) menunggu run berikutnya; setelah itu periksa uji peristiwa dan sebaran fase. Lalu tahap 4.
