"""Registry seri data v2: SATU tempat yang mendefinisikan setiap angka di sistem.
Tiap seri: label penuh, grup, frekuensi, penyedia berlapis (urutan = cadangan), batas wajar,
umur maksimum sebelum dianggap basi. Penyedia: ("fred", id) | ("yf", ticker).
Baris dengan flag v=True BELUM diuji dari sandbox: lihat status.json setelah run pertama."""

# freq -> (umur maks hari sebelum 'basi', menit minimum antar-fetch, tier)
# Umur dihitung dari TANGGAL OBSERVASI. Seri bulanan bertanggal awal bulan dan baru dirilis
# 2-6 minggu kemudian, jadi batasnya harus memuat jeda rilis itu (bukan sekadar 31 hari).
FREQ = {"harian": (5, 25, "cepat"), "mingguan": (12, 180, "lambat"),
        "bulanan": (80, 180, "lambat"), "kuartalan": (220, 360, "lambat")}

def S(id, label, group, freq, prov, unit="", lo=None, hi=None, crit=False, v=False, note=""):
    return dict(id=id, label=label, group=group, freq=freq, prov=prov, unit=unit,
                lo=lo, hi=hi, crit=crit, v=v, note=note)

REGISTRY = [
 # --- Harga aset prioritas (tier cepat; yfinance, cadangan FRED bila ada)
 S("XAUUSD", "Emas (XAU/USD, futures GC)", "Harga", "harian", [("yf", "GC=F")], "USD/oz", 500, 6000, True),
 S("WTI", "Minyak mentah WTI", "Harga", "harian", [("yf", "CL=F"), ("fred", "DCOILWTICO")], "USD/bbl", -50, 250, True),
 S("SPX", "S&P 500", "Harga", "harian", [("yf", "^GSPC"), ("fred", "SP500")], "indeks", 500, 20000, True),
 S("USDJPY", "USD/JPY", "Harga", "harian", [("yf", "JPY=X"), ("fred", "DEXJPUS")], "JPY", 50, 250, True),
 S("EURUSD", "EUR/USD", "Harga", "harian", [("yf", "EURUSD=X"), ("fred", "DEXUSEU")], "USD", 0.6, 1.6, True),
 S("DXY", "Indeks Dolar AS (DXY)", "Harga", "harian", [("yf", "DX-Y.NYB"), ("fred", "DTWEXBGS")], "indeks", 70, 140),
 S("BRENT", "Minyak mentah Brent (futures BZ)", "Harga", "harian", [("yf", "BZ=F"), ("fred", "DCOILBRENTEU")], "USD/bbl", 20, 250),
 S("COPPER", "Tembaga (futures HG)", "Harga", "harian", [("yf", "HG=F")], "USD/lb", 1, 10),
 S("NDX", "Nasdaq 100", "Harga", "harian", [("yf", "^NDX"), ("fred", "NASDAQ100")], "indeks", 2000, 60000),
 S("BTC", "Bitcoin", "Harga", "harian", [("yf", "BTC-USD"), ("fred", "CBBTCUSD")], "USD", 1000, 1000000),
 S("EEM", "Pasar berkembang (ETF EEM)", "Harga", "harian", [("yf", "EEM")], "USD", 10, 100),
 S("TLT", "Obligasi AS 20+ tahun (ETF TLT)", "Harga", "harian", [("yf", "TLT")], "USD", 30, 200),
 S("HYG", "Obligasi korporasi high-yield (ETF HYG)", "Harga", "harian", [("yf", "HYG")], "USD", 40, 120),
 S("NIKKEI", "Nikkei 225", "Harga", "harian", [("yf", "^N225")], "indeks", 5000, 100000),
 # --- Suku bunga, yield, ekspektasi
 S("US02Y", "Yield obligasi AS 2 tahun", "Yield", "harian", [("fred", "DGS2")], "%", -1, 12, True),
 S("US10Y", "Yield obligasi AS 10 tahun", "Yield", "harian", [("yf", "^TNX"), ("fred", "DGS10")], "%", -1, 12, True),
 S("US30Y", "Yield obligasi AS 30 tahun", "Yield", "harian", [("fred", "DGS30")], "%", -1, 12),
 S("REAL10Y", "Yield riil 10 tahun (TIPS)", "Yield", "harian", [("fred", "DFII10")], "%", -3, 6),
 S("BE10Y", "Ekspektasi inflasi 10 tahun (breakeven)", "Yield", "harian", [("fred", "T10YIE")], "%", -1, 6),
 S("CURVE", "Kurva 10 tahun minus 2 tahun", "Yield", "harian", [("fred", "T10Y2Y")], "poin %", -4, 4),
 S("DE10Y", "Yield obligasi Jerman 10 tahun", "Yield", "bulanan", [("fred", "IRLTLT01DEM156N")], "%", -2, 15, v=True),
 S("JP10Y", "Yield obligasi Jepang 10 tahun", "Yield", "bulanan", [("fred", "IRLTLT01JPM156N")], "%", -1, 10, v=True),
 # --- Suku bunga kebijakan bank sentral (yfinance tidak punya ini; FRED punya)
 S("FED", "Suku bunga kebijakan Fed (batas atas)", "Kebijakan", "harian", [("fred", "DFEDTARU")], "%", 0, 12, True),
 S("EFFR", "Suku bunga efektif Fed (harian)", "Kebijakan", "harian", [("fred", "DFF")], "%", 0, 12),
 S("DTB3", "Yield T-bill 3 bulan", "Yield", "harian", [("fred", "DTB3")], "%", 0, 12),
 S("ECB", "Suku bunga deposito ECB", "Kebijakan", "harian", [("fred", "ECBDFR")], "%", -1, 10),
 S("BOE", "Suku bunga semalam Inggris (SONIA, proksi BoE)", "Kebijakan", "harian", [("fred", "IUDSOIA")], "%", 0, 12, v=True),
 S("BOJ", "Suku bunga antarbank Jepang (proksi BoJ)", "Kebijakan", "bulanan", [("fred", "IRSTCI01JPM156N")], "%", -1, 5, v=True),
 S("BOC", "Suku bunga antarbank 3 bulan Kanada (proksi BoC)", "Kebijakan", "bulanan", [("fred", "IR3TIB01CAM156N")], "%", 0, 12),
 S("RBA", "Suku bunga antarbank 3 bulan Australia (proksi RBA)", "Kebijakan", "bulanan", [("fred", "IR3TIB01AUM156N")], "%", 0, 12),
 S("SNB", "Suku bunga antarbank 3 bulan Swiss (proksi SNB)", "Kebijakan", "bulanan", [("fred", "IR3TIB01CHM156N")], "%", -2, 8),
 # --- Stres dan likuiditas
 S("VIX", "VIX (volatilitas saham AS)", "Stres", "harian", [("yf", "^VIX"), ("fred", "VIXCLS")], "poin", 5, 150, True),
 S("VIX3M", "VIX 3 bulan", "Stres", "harian", [("yf", "^VIX3M"), ("fred", "VXVCLS")], "poin", 5, 100),
 S("MOVE", "MOVE (volatilitas obligasi AS)", "Stres", "harian", [("yf", "^MOVE")], "poin", 20, 300, v=True),
 S("HYOAS", "Selisih kredit high-yield (OAS)", "Stres", "harian", [("fred", "BAMLH0A0HYM2")], "%", 1, 25, True),
 S("NFCI", "Kondisi keuangan Chicago (NFCI)", "Stres", "mingguan", [("fred", "NFCI")], "indeks", -2, 6),
 S("WALCL", "Total aset neraca Fed", "Likuiditas", "mingguan", [("fred", "WALCL")], "juta USD", 1e6, 2e7),
 S("TGA", "Kas Treasury di Fed (TGA)", "Likuiditas", "mingguan", [("fred", "WTREGEN")], "juta USD", 0, 3e6),
 S("RRP", "Reverse repo Fed", "Likuiditas", "harian", [("fred", "RRPONTSYD")], "miliar USD", 0, 3e3),
 # --- Pertumbuhan
 S("NFP", "Penggajian nonpertanian (level)", "Pertumbuhan", "bulanan", [("fred", "PAYEMS")], "ribu", 1e5, 2e5),
 S("UNEMP", "Tingkat pengangguran", "Pertumbuhan", "bulanan", [("fred", "UNRATE")], "%", 1, 20),
 S("CLAIMS", "Klaim pengangguran awal", "Pertumbuhan", "mingguan", [("fred", "ICSA")], "orang", 1e5, 7e6),
 S("RETAIL", "Penjualan ritel", "Pertumbuhan", "bulanan", [("fred", "RSAFS")], "juta USD", 1e5, 2e6),
 S("INDPRO", "Produksi industri", "Pertumbuhan", "bulanan", [("fred", "INDPRO")], "indeks", 50, 200),
 S("EMPIRE", "Survei manufaktur New York (Empire)", "Pertumbuhan", "bulanan", [("fred", "GACDISA066MSFRBNY")], "indeks", -80, 80),
 S("PHILLY", "Survei manufaktur Philadelphia", "Pertumbuhan", "bulanan", [("fred", "GACDFSA066MSFRBPHI")], "indeks", -80, 80),
 S("GDP", "PDB riil AS (pertumbuhan tahunan berantai)", "Pertumbuhan", "kuartalan", [("fred", "A191RL1Q225SBEA")], "%", -40, 40),
 # --- Inflasi
 S("CPI", "Indeks harga konsumen (CPI)", "Inflasi", "bulanan", [("fred", "CPIAUCSL")], "indeks", 100, 500),
 S("CPICORE", "CPI inti", "Inflasi", "bulanan", [("fred", "CPILFESL")], "indeks", 100, 500),
 S("PCECORE", "PCE inti", "Inflasi", "bulanan", [("fred", "PCEPILFE")], "indeks", 80, 400),
 S("PPI", "Indeks harga produsen (PPI)", "Inflasi", "bulanan", [("fred", "PPIFIS")], "indeks", 80, 400),
 S("AHE", "Upah per jam rata-rata", "Inflasi", "bulanan", [("fred", "CES0500000003")], "USD", 15, 80),
 S("NROU", "Pengangguran alami (NAIRU, CBO)", "Inflasi", "kuartalan", [("fred", "NROU")], "%", 2, 8),
]
REGISTRY += [
 # --- Pelengkap barometer aliran modal (tier cepat)
 S("IHSG", "IHSG (Indeks Harga Saham Gabungan)", "Harga", "harian", [("yf", "^JKSE")], "indeks", 2000, 20000),
 S("USDIDR", "USD/IDR (rupiah)", "Harga", "harian", [("yf", "IDR=X")], "IDR", 8000, 30000),
 S("AUDJPY", "AUD/JPY (barometer risk-on)", "Harga", "harian", [("yf", "AUDJPY=X")], "JPY", 40, 150),
 S("IEF", "Obligasi AS 7-10 tahun (ETF IEF)", "Harga", "harian", [("yf", "IEF")], "USD", 60, 150),
 S("SPY", "S&P 500 (ETF SPY)", "Harga", "harian", [("yf", "SPY")], "USD", 200, 2000),
 S("GLD", "Emas (ETF GLD)", "Harga", "harian", [("yf", "GLD")], "USD", 100, 1000),
 S("STABLE", "Pasokan stablecoin (proksi likuiditas kripto)", "Likuiditas", "harian", [("llama", "all")], "miliar USD", 50, 3000, v=True),
 # --- Posisi spekulan (COT, net long non-komersial), mingguan
 S("COT_GOLD", "COT emas: posisi bersih spekulan", "Posisi", "mingguan", [("cftc", "088691")], "kontrak"),
 S("COT_CRUDE", "COT minyak mentah: posisi bersih spekulan", "Posisi", "mingguan", [("cftc", "067651")], "kontrak"),
 S("COT_COPPER", "COT tembaga: posisi bersih spekulan", "Posisi", "mingguan", [("cftc", "085692")], "kontrak"),
 S("COT_SPX", "COT S&P 500 e-mini: posisi bersih spekulan", "Posisi", "mingguan", [("cftc", "13874A")], "kontrak"),
 S("COT_NDX", "COT Nasdaq e-mini: posisi bersih spekulan", "Posisi", "mingguan", [("cftc", "209742")], "kontrak"),
 S("COT_EUR", "COT euro: posisi bersih spekulan", "Posisi", "mingguan", [("cftc", "099741")], "kontrak"),
 S("COT_JPY", "COT yen: posisi bersih spekulan", "Posisi", "mingguan", [("cftc", "097741")], "kontrak"),
 S("COT_GBP", "COT poundsterling: posisi bersih spekulan", "Posisi", "mingguan", [("cftc", "096742")], "kontrak"),
 S("COT_AUD", "COT dolar Australia: posisi bersih spekulan", "Posisi", "mingguan", [("cftc", "232741")], "kontrak"),
 S("COT_BTC", "COT Bitcoin CME: posisi bersih spekulan", "Posisi", "mingguan", [("cftc", "133741")], "kontrak"),
]
BY_ID = {s["id"]: s for s in REGISTRY}
# riwayat panjang (tahun) untuk seri yang dihitung persentilnya (mesin fase)
LONG_YEARS = {"VIX": 20, "VIX3M": 20, "HYOAS": 25, "NFCI": 25}
