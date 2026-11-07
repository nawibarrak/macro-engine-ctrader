# Macro Engine cTrader: Panduan Windows (pemula)

Repo ini adalah salinan terpisah untuk eksperimen sumber data cTrader. **Belum ada trading order**: konektor yang disiapkan hanya menerima quote dan menulis ke staging; pipeline produksi `data/series` dan `scripts/data_layer.py` tidak diubah.

## Apa yang sudah disiapkan
- konektor quote dan candle historis harian cTrader menggunakan SDK OpenApiPy dari Spotware
- OAuth helper (langkah token dijelaskan di bawah; token dimasukkan lokal ke `.env`)
- file staging JSON Lines di `data/ctrader_cache/`
- backup ZIP dan restore ke folder lain agar tidak menimpa proyek aktif
- mapping provider awal untuk beberapa instrumen. Nama simbol bisa berbeda antar-broker.

## Penting sebelum mulai
- Jangan pernah menaruh `CTRADER_CLIENT_SECRET`, access token, atau refresh token di GitHub.
- Mulai dengan akun DEMO. Live diblokir kecuali Anda secara eksplisit menambahkan `--allow-live`.
- Quote streaming tetap masuk staging. Candle D1 historis dapat dipakai data layer setelah `CTRADER_ENABLED=1` dan audit lokal berhasil.
- `requirements.txt` mencakup dependensi Python, sedangkan aplikasi web juga membutuhkan Node/Bun seperti sebelumnya.

## Langkah pertama: backup
Dari PowerShell, di folder proyek:

```powershell
py scripts/backup_restore.py create
```

Backup tersimpan di `backups/`. File `.env`, dependency, dan cache streaming sengaja tidak disertakan.

Untuk restore secara aman ke folder baru (ganti nama arsip sesuai hasil backup):

```powershell
py scripts/backup_restore.py restore .\backups\macro-engine-ctrader-YYYYMMDDTHHMMSSZ.zip --destination ..\macro-engine-ctrader-restored
```

Restore tidak menimpa folder kerja; ia hanya mengekstrak salinan terpisah.

## Persiapan cTrader
1. Daftarkan aplikasi Open API di portal cTrader Spotware dan masukkan redirect URI yang sama dengan `.env.example`.
2. Salin `.env.example` menjadi `.env` di folder proyek lokal. Isi `CTRADER_CLIENT_ID`, `CTRADER_CLIENT_SECRET`, dan `CTRADER_REDIRECT_URI`; pertahankan `CTRADER_HOST=demo`.
3. Instal Python jika perintah `py --version` belum bekerja. Buat environment terisolasi dan instal dependency:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

4. Dapatkan OAuth access token menggunakan aplikasi/token flow resmi cTrader dan masukkan token hanya ke `.env`. Jangan kirim token ke chat atau commit ke repository.
5. Pastikan nama simbol persis sesuai daftar simbol di akun cTrader. Set `CTRADER_ACCOUNT_ID` bila token memberi lebih dari satu akun.

## Uji quote demo
Setelah `.env` lokal berisi token demo:

```powershell
py scripts/run_fetch.py --symbols EURUSD --seconds 60
```

Bila berhasil, output JSONL muncul di `data/ctrader_cache/`. Periksa bahwa timestamp, bid, ask, dan mid terisi. Jika broker memakai nama berbeda, gunakan nama simbol persis yang tersedia di akun.

## Uji riwayat dan hubungkan ke dashboard
1. Uji satu candle harian di akun demo:

```powershell
py scripts/run_fetch.py --history --symbols EURUSD --start 2025-01-01
```

2. Pastikan perintah mengembalikan titik tanggal-nilai dan tidak gagal autentikasi.
3. Ubah `CTRADER_ENABLED=1` di `.env`, lalu jalankan pipeline:

```powershell
py scripts/pipeline.py
```

Pipeline mencoba cTrader untuk EURUSD, USDJPY, XAUUSD, dan BTC, lalu memakai yfinance/FRED sebagai fallback. Periksa `data/status.json` untuk `prov: "ctrader"` dan `data/bundle.json` untuk seri yang akan ditampilkan web. Bila simbol broker berbeda, sesuaikan kandidat pada `scripts/provider_registry.py`. Host live tetap diblokir kecuali `CTRADER_HOST=live` dan `CTRADER_ALLOW_LIVE=1` diatur secara sengaja.

## Batasan dan langkah setelah uji
- Jalur demo perlu diuji di mesin lokal Anda; tidak bisa divalidasi dari GitHub saja.
- Jalur historis menggunakan candle D1 cTrader dan nilai close; data baris yang tersedia bergantung pada broker dan simbol akun.
- Rute cTrader dinonaktifkan secara default dan hanya menangani empat seri yang dipetakan; seri lain tetap menggunakan provider lama.
- Validasi koneksi dan kualitas data harus dilakukan pada akun demo sebelum mengaktifkan rute tersebut untuk penggunaan rutin.
- Jangan gunakan output untuk keputusan trading otomatis; ini adalah konektor data eksperimental.

## Referensi
- SDK Spotware OpenApiPy: https://github.com/spotware/OpenApiPy
- Dokumentasi SDK: https://spotware.github.io/OpenApiPy/
- Portal aplikasi cTrader Open API: https://connect.spotware.com/apps
