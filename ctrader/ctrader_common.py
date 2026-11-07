"""Bagian MURNI integrasi cTrader (tanpa jaringan, tanpa Twisted) agar bisa diuji sendiri.
cTrader di sini HANYA dipakai membaca harga (bid/ask). Tidak ada kode order/transaksi sama sekali.
Isi: baca env, daftar 13 instrumen yang mungkin ada di broker, pencocokan nama simbol, penskalaan harga,
penyimpan kuotasi terakhir, dan server HTTP kecil (hanya 127.0.0.1) yang dibaca server.ts."""
import os, re, json, time, threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Protobuf versi baru sering bentrok dengan berkas pesan cTrader lama; mode 'python' menghindarinya.
os.environ.setdefault("PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION", "python")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAP_FILE = os.path.join(ROOT, "config", "ctrader_symbols.json")
CACHE_DIR = os.path.join(ROOT, "cache")      # di .gitignore: daftar simbol broker tidak ikut terpublikasi
PRICE_DIV = 100000.0                         # cTrader mengirim harga sebagai bilangan bulat = harga x 100000
STALE_SEC = 120                              # kuotasi lebih tua dari ini ditandai basi (pasar tutup / putus)

# id seri Macro Engine -> (nama simbol umum, kata kunci deskripsi). Yield (US02Y, US10Y, US30Y, REAL10Y, CURVE)
# sengaja tidak ada: itu angka yield, bukan produk yang dijual broker. Tetap dari FRED.
WANTED = {
    "SPX":    (["US500", "SPX500", "SP500", "USSPX500"], ["S&P 500", "SP 500", "US 500"]),
    "NDX":    (["USTEC", "NAS100", "US100", "USNAS100", "NDX100"], ["NASDAQ"]),
    "IHSG":   (["IHSG", "JCI", "IDX", "IDXCOMPOSITE"], ["INDONESIA", "JAKARTA"]),
    "NIKKEI": (["JP225", "JPN225", "NIKKEI225", "NIKKEI", "NK225"], ["NIKKEI", "JAPAN 225"]),
    "DXY":    (["USDX", "DXY", "DOLLARINDEX", "USDOLLARINDEX", "USIDX"], ["DOLLAR INDEX"]),
    "XAUUSD": (["XAUUSD", "GOLD"], ["GOLD"]),
    "WTI":    (["XTIUSD", "USOIL", "WTI", "USOUSD", "SPOTCRUDE"], ["WTI", "CRUDE OIL"]),
    "COPPER": (["XCUUSD", "COPPER", "COPPERUSD"], ["COPPER"]),
    "BTC":    (["BTCUSD", "BITCOIN"], ["BITCOIN"]),
    "VIX":    (["VIX", "VIXUSD", "VOLATILITY"], ["VIX", "VOLATILITY"]),
    "USDJPY": (["USDJPY"], []),
    "EURUSD": (["EURUSD"], []),
    "USDIDR": (["USDIDR"], []),
}


def norm(s):
    return re.sub(r"[^A-Z0-9]", "", str(s).upper())


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).isoformat(timespec="seconds")


def scale_price(raw):
    return raw / PRICE_DIV


# ---------------------------------------------------------------- env
def load_env():
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(ROOT, ".env"))
    except Exception:
        pass   # di Codespaces, secret sudah ada sebagai variabel lingkungan
    names = dict(client_id="CTRADER_CLIENT_ID", client_secret="CTRADER_CLIENT_SECRET",
                 access_token="CTRADER_ACCESS_TOKEN", account_id="CTRADER_ACCOUNT_ID")
    missing = [v for v in names.values() if not os.environ.get(v, "").strip()]
    if missing:
        raise ValueError("Variabel belum terisi: " + ", ".join(missing))
    env = {k: os.environ[v].strip() for k, v in names.items()}
    env["host"] = os.environ.get("CTRADER_HOST", "demo").strip().lower()
    if env["host"] not in ("demo", "live"):
        raise ValueError("CTRADER_HOST harus 'demo' atau 'live', bukan: " + env["host"])
    env["port"] = int(os.environ.get("CTRADER_RELAY_PORT", "8787"))
    return env


def pick_account(accounts, wanted, host):
    """accounts: [{ctid, login, live}]. CTRADER_ACCOUNT_ID boleh berisi nomor login ATAU ctid."""
    w = str(wanted).strip()
    hit = [a for a in accounts if str(a["ctid"]) == w or str(a["login"]) == w]
    if not hit:
        daftar = "; ".join("login=%s ctid=%s %s" % (a["login"], a["ctid"], "LIVE" if a["live"] else "DEMO") for a in accounts)
        raise ValueError("CTRADER_ACCOUNT_ID=%s tidak cocok dengan akun mana pun pada token ini. Akun pada token: %s" % (w, daftar or "(kosong)"))
    a = hit[0]
    if a["live"] and host != "live":
        raise ValueError("Akun ini LIVE. Set CTRADER_HOST=live bila memang itu yang dimaksud.")
    if not a["live"] and host == "live":
        raise ValueError("Akun ini DEMO. Set CTRADER_HOST=demo.")
    return a


# ---------------------------------------------------------------- peta simbol
def match_symbols(symbols):
    """symbols: [{id, name, desc}]. 'cocok' = nama persis sama dengan salah satu nama umum (aman dipakai otomatis).
    'kandidat' = mirip nama/deskripsi, harus Anda konfirmasi manual di config/ctrader_symbols.json."""
    by_norm = {}
    for s in symbols:
        by_norm.setdefault(norm(s["name"]), s["name"])
    out = {}
    for key, (aliases, words) in WANTED.items():
        exact = next((by_norm[norm(a)] for a in aliases if norm(a) in by_norm), None)
        if exact:
            out[key] = dict(status="cocok", symbol=exact, candidates=[])
            continue
        cands = []
        for s in symbols:
            n, d = norm(s["name"]), (s.get("desc") or "").upper()
            pref = any(len(norm(a)) >= 4 and n.startswith(norm(a)) and len(n) - len(norm(a)) <= 6 for a in aliases)
            if pref or any(w.upper() in d for w in words):
                cands.append(s["name"])
        out[key] = dict(status="kandidat" if cands else "tidak ada", symbol=None, candidates=cands[:5])
    return out


def load_mapping(path=MAP_FILE):
    try:
        raw = json.load(open(path, encoding="utf-8"))
    except FileNotFoundError:
        return {}
    return {k: v.strip() for k, v in raw.items() if not k.startswith("_") and isinstance(v, str) and v.strip()}


def save_mapping(found, path=MAP_FILE):
    """Gabungkan hasil pencocokan ke berkas. Isian manual Anda yang sudah ada TIDAK ditimpa."""
    try:
        raw = json.load(open(path, encoding="utf-8"))
    except FileNotFoundError:
        raw = {"_catatan": "id seri -> nama simbol di broker cTrader. Isi manual bila perlu; null = tidak dipakai."}
    for key in WANTED:
        if not raw.get(key):
            raw[key] = found.get(key) or None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(raw, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    return raw


# ---------------------------------------------------------------- kuotasi terakhir
def new_state(host, mapping):
    return dict(status="mulai", message="", host=host, account=None, missing=[], lock=threading.Lock(),
                quotes={k: dict(symbol=v, bid=None, ask=None, ts=None, recv=None) for k, v in mapping.items()})


def set_status(state, status, message=""):
    with state["lock"]:
        state["status"], state["message"] = status, message


def apply_spot(state, sym_to_id, ev):
    """ev: {symbolId, bid, ask, timestamp(ms)}; bid/ask bisa kosong karena cTrader hanya mengirim sisi yang berubah."""
    key = sym_to_id.get(ev.get("symbolId"))
    if key is None:
        return False
    with state["lock"]:
        q = state["quotes"][key]
        if ev.get("bid") is not None:
            q["bid"] = scale_price(ev["bid"])
        if ev.get("ask") is not None:
            q["ask"] = scale_price(ev["ask"])
        if ev.get("timestamp"):
            q["ts"] = ev["timestamp"]
        q["recv"] = time.time()
    return True


def build_snapshot(state, now=None):
    now = time.time() if now is None else now
    out = {}
    with state["lock"]:
        for key, q in state["quotes"].items():
            both = q["bid"] is not None and q["ask"] is not None
            obs = q["ts"] / 1000.0 if q["ts"] else q["recv"]
            age = None if obs is None else max(0.0, now - obs)
            out[key] = dict(symbol=q["symbol"], bid=q["bid"], ask=q["ask"],
                            mid=(q["bid"] + q["ask"]) / 2 if both else None,
                            observed_utc=iso(obs) if obs else None,
                            age_s=None if age is None else round(age, 1),
                            stale=age is None or age > STALE_SEC)
        return dict(status=state["status"], message=state["message"], host=state["host"], account=state["account"],
                    generated=iso(now), missing=list(state["missing"]), quotes=out)


# ---------------------------------------------------------------- HTTP kecil (hanya lokal)
def serve_http(state, port):
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.split("?")[0] == "/quotes":
                body, code = build_snapshot(state), 200
            elif self.path.split("?")[0] == "/health":
                body, code = dict(ok=True, status=state["status"]), 200
            else:
                body, code = dict(error="tidak ada"), 404
            data = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *a):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv
