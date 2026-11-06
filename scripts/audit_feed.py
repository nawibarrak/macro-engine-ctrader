"""Audit otomatis data/feed.json -> data/audit.json (dibaca web tool).
Tiga lapis: (1) aturan kewajaran, (2) konsistensi internal, (3) silang-sumber (BLS, Yahoo).
Tidak mengubah data; hanya melaporkan ok / warn / fail beserta tautan verifikasi."""
import os, json, datetime as dt, requests

D = os.path.join(os.path.dirname(__file__), "..", "data")
feed = json.load(open(os.path.join(D, "feed.json")))
T = dt.datetime.utcnow(); TODAY = T.date()
checks = []
def add(level, grp, msg, link=None): checks.append(dict(level=level, grp=grp, msg=msg, link=link))
FRED = "https://fred.stlouisfed.org/series/"
SER = {"cpi_core": "CPILFESL", "cpi": "CPIAUCSL", "pce_core": "PCEPILFE", "ppi": "PPIFIS", "ahe": "CES0500000003",
       "nfp": "PAYEMS", "unemp": "UNRATE", "claims": "ICSA", "jolts": "JTSJOL", "retail": "RSAFS", "ip": "INDPRO", "empire": "GACDISA066MSFRBNY", "philly": "GACDFSA066MSFRBPHI", "gdp": "A191RL1Q225SBEA"}
SD = {"cpi_core": .10, "cpi": .12, "pce_core": .08, "ppi": .25, "ahe": .12, "nfp": 75, "unemp": .12, "claims": 15,
      "jolts": .35, "retail": .5, "ip": .3, "empire": 8, "philly": 9, "gdp": .7}
MAXAGE = {"claims": 12, "gdp": 130}   # hari; lainnya bulanan
days = lambda s: (TODAY - dt.date.fromisoformat(s[:10])).days

# --- 1. kesegaran feed
if not feed.get("generated"): add("fail", "Feed", "feed.json kosong")
else:
    age = (T - dt.datetime.fromisoformat(feed["generated"].rstrip("Z"))).total_seconds() / 3600
    add("ok" if age < 3 else "warn", "Feed", f"Umur feed {age:.1f} jam")
for ln in feed.get("log", []):
    if ln.startswith("GAGAL"): add("fail", "Sumber", ln)
    elif "tidak tersedia" in ln: add("warn", "Sumber", ln)
    elif "buang" in ln: add("warn", "Sumber", ln + " (nilai di luar batas wajar dibuang)")

# --- 2. rilis data
rel = feed.get("releases", []); proxy = []
for ind, sid in SER.items():
    rows = sorted([r for r in rel if r["ind"] == ind], key=lambda r: r["date"])
    link = FRED + sid
    if not rows: add("warn", "Rilis", f"{ind}: tidak ada rilis dalam 150 hari", link); continue
    r = rows[-1]; lim = MAXAGE.get(ind, 50)
    add("ok" if days(r["date"]) <= lim else "warn", "Rilis", f"{ind}: rilis terakhir {r['date']} (umur {days(r['date'])} hari)", link)
    if r.get("cons") is not None:
        z = (r["act"] - r["cons"]) / SD[ind]
        if abs(z) > 4: add("warn", "Rilis", f"{ind}: z={z:+.1f} ekstrem (act {r['act']} vs cons {r['cons']}, {r.get('src')}). Cek konsensus", link)
    if r.get("src") == "proxy": proxy.append(f"{ind} ({r['date']})")

if proxy: add("warn", "Konsensus", "Konsensus = proxy (rata-rata rilis lalu), BUKAN konsensus pasar, sehingga z-surprise belum akurat. Isi data/consensus.csv (tanggal,indikator,angka) untuk: " + ", ".join(proxy))

# --- 2b. indeks kondisi aktual
ac = feed.get("actual")
if not ac: add("fail", "Aktual", "indeks kondisi aktual (G/I) tidak ada di feed")
else:
    for g in ("G", "I"):
        a = ac.get(g) or {}
        if a.get("v") is None or a.get("n", 0) < 3: add("fail", "Aktual", f"{g}: komponen kurang ({a.get('n', 0)}), butuh >=3", FRED + "PAYEMS")
        else: add("ok" if abs(a["v"]) <= 3 else "fail", "Aktual", f"{g}={a['v']:+.2f} dari {a['n']} komponen: " + ", ".join(f"{k} {v:+.1f}" for k, v in a["parts"].items()), FRED + "PAYEMS")

# --- 3. shock, likuiditas, bank sentral
sh = feed.get("shock", {})
rng = {"vix": (8, 90), "vix3m": (10, 80), "move": (40, 250), "hy": (1.5, 25), "hyp": (1.5, 25)}
for k, (a, b) in rng.items():
    v = sh.get(k)
    if v is None: add("warn", "Shock", f"{k} kosong (isi manual)")
    else: add("ok" if a <= v <= b else "fail", "Shock", f"{k}={v} {'wajar' if a <= v <= b else 'DI LUAR rentang '+str((a,b))}")
if sh.get("vix") and sh.get("vix3m"):
    q = sh["vix"] / sh["vix3m"]; add("ok" if .5 < q < 1.8 else "fail", "Shock", f"VIX/VIX3M={q:.2f}")
lq = feed.get("liq", {})
if all(lq.get(k) is not None for k in ("w0", "t0", "r0", "w1", "t1", "r1")):
    now = lq["w0"] - lq["t0"] - lq["r0"]; prev = lq["w1"] - lq["t1"] - lq["r1"]
    add("ok" if 3000 < now < 9000 else "fail", "Likuiditas", f"Net liquidity {now:,.0f} mlr (rentang wajar 3.000-9.000)", FRED + "WALCL")
    add("ok" if abs(now - prev) < 400 else "warn", "Likuiditas", f"Perubahan 4 minggu {now-prev:+,.0f} mlr", FRED + "WTREGEN")
else: add("warn", "Likuiditas", "data likuiditas tidak lengkap")
for k, v in feed.get("cb", {}).items():
    r = v.get("rate")
    add("ok" if r is not None and 0 <= r <= 15 else "fail", "Bank sentral", f"{k} suku bunga {r}", FRED + ("DFEDTARU" if k == "FED" else "ECBDFR"))
    if v.get("imp") is not None: add("warn", "Bank sentral", f"{k}: ekspektasi pasar = proksi yield 2Y ({v['imp']}), bukan futures; indikatif saja", FRED + "DGS2")

# --- 4. COT
for k, rows in feed.get("cot", {}).items():
    link = "https://publicreporting.cftc.gov/"
    if len(rows) < 10: add("warn", "COT", f"{k}: hanya {len(rows)} minggu riwayat (butuh >=10)", link); continue
    rows = sorted(rows, key=lambda r: r["d"]); l = rows[-1]
    bad = [r for r in rows if r["oi"] <= 0 or abs(r["net"]) > r["oi"]]
    add("fail" if bad else "ok", "COT", f"{k}: {'ada baris net>OI / OI<=0' if bad else 'net<=OI semua baris'}", link)
    add("ok" if days(l["d"]) <= 14 else "warn", "COT", f"{k}: laporan terakhir {l['d']} (umur {days(l['d'])} hari)", link)

# --- 5. silang-sumber
# 5a. VIX: FRED vs Yahoo
try:
    import yfinance as yf
    h = yf.Ticker("^VIX").history(period="7d")["Close"].dropna()
    y = float(h.iloc[-1]); f = sh.get("vix")
    if f is not None:
        d = abs(y - f)
        add("ok" if d < 2.5 else "warn", "Silang-sumber", f"VIX FRED {f:.2f} vs Yahoo {y:.2f} (selisih {d:.2f}; FRED = penutupan kemarin, Yahoo bisa lebih baru)", "https://finance.yahoo.com/quote/%5EVIX")
except Exception as e: add("warn", "Silang-sumber", f"VIX Yahoo tidak terjangkau: {e}")
# 5b. BLS: nilai periode yang sama untuk 5 seri
BLS = {"cpi": ("CUSR0000SA0", "pct"), "cpi_core": ("CUSR0000SA0L1E", "pct"), "nfp": ("CES0000000001", "diff"),
       "unemp": ("LNS14000000", "lvl"), "ahe": ("CES0500000003", "pct")}
TOL = {"pct": 0.12, "diff": 60, "lvl": 0.11}
try:
    r = requests.post("https://api.bls.gov/publicAPI/v1/timeseries/data/", timeout=40,
        json={"seriesid": [v[0] for v in BLS.values()], "startyear": str(TODAY.year - 1), "endyear": str(TODAY.year)})
    r.raise_for_status(); js = r.json()
    if js.get("status") != "REQUEST_SUCCEEDED": raise RuntimeError(js.get("message"))
    data = {s["seriesID"]: {(x["year"], x["period"]): float(x["value"]) for x in s["data"] if x["period"].startswith("M")} for s in js["Results"]["series"]}
    for ind, (sid, mode) in BLS.items():
        rows = sorted([x for x in rel if x["ind"] == ind and x.get("obs")], key=lambda x: x["date"])
        if not rows: continue
        x = rows[-1]; y, m = int(x["obs"][:4]), int(x["obs"][5:7]); py, pm = (y, m - 1) if m > 1 else (y - 1, 12)
        cur = data[sid].get((str(y), f"M{m:02d}")); prv = data[sid].get((str(py), f"M{pm:02d}"))
        if cur is None or (mode != "lvl" and prv is None): add("warn", "Silang-sumber", f"{ind}: periode {x['obs'][:7]} belum ada di BLS", "https://data.bls.gov/"); continue
        b = (cur / prv - 1) * 100 if mode == "pct" else (cur - prv if mode == "diff" else cur)
        d = abs(b - x["act"])
        add("ok" if d <= TOL[mode] else "fail", "Silang-sumber",
            f"{ind} {x['obs'][:7]}: feed {x['act']} vs BLS {b:.3f} (selisih {d:.3f}, toleransi {TOL[mode]}; BLS sudah memuat revisi)", "https://data.bls.gov/timeseries/" + sid)
except Exception as e: add("warn", "Silang-sumber", f"BLS tidak terjangkau: {e}")

n = {k: sum(c["level"] == k for c in checks) for k in ("ok", "warn", "fail")}
json.dump(dict(generated=T.isoformat(timespec="seconds") + "Z", counts=n, checks=checks), open(os.path.join(D, "audit.json"), "w"), indent=1, ensure_ascii=False)
for c in checks:
    if c["level"] != "ok": print(c["level"].upper(), c["grp"], c["msg"])
print("AUDIT", n)
