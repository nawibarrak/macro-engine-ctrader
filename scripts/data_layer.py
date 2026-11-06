"""Lapisan data v2: ambil semua seri di registry -> data/series/<ID>.json + data/status.json.
- Penyedia berlapis: coba sumber pertama, jatuh ke cadangan bila gagal/kosong.
- Jadwal bertingkat: tiap seri punya jarak minimum antar-fetch sesuai frekuensinya.
- Circuit breaker: nilai di luar batas wajar dibuang; lompatan ekstrem ditahan (state 'ditahan')
  sampai terkonfirmasi di run berikutnya; sumber gagal -> pakai data lama dan tandai basi.
- Provenance: tiap seri mencatat penyedia, ticker/id, waktu fetch, tanggal observasi terakhir.
Pakai: python scripts/data_layer.py [--tier cepat|lambat|semua] [--force]"""
import os, sys, json, math, argparse, datetime as dt
import subprocess
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from registry import REGISTRY, FREQ, LONG_YEARS
from provider_registry import route_for

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(REPO, ".env"))
except ImportError:
    pass

ROOT = os.path.join(REPO, "data")
SER = os.path.join(ROOT, "series")
KEEP = {"harian": 1300, "mingguan": 700, "bulanan": 240, "kuartalan": 100}
JUMP_SIGMA = 8.0      # lompatan sehari > 8 simpangan baku perubahan historis -> ditahan dulu
NOW = lambda: dt.datetime.now(dt.timezone.utc)

# ---------- penyedia (bisa diganti saat uji) ----------
def p_fred(sid, start):
    import requests
    key = os.environ.get("FRED_API_KEY")
    if not key: raise RuntimeError("FRED_API_KEY kosong")
    r = requests.get("https://api.stlouisfed.org/fred/series/observations", timeout=40,
                     params=dict(series_id=sid, api_key=key, file_type="json", observation_start=start))
    r.raise_for_status()
    out = []
    for o in r.json()["observations"]:
        try: out.append([o["date"], float(o["value"])])
        except ValueError: pass
    return out

def p_yf(tk, start):
    import yfinance as yf
    h = yf.Ticker(tk).history(start=start, auto_adjust=False)["Close"].dropna()
    return [[i.strftime("%Y-%m-%d"), round(float(v), 6)] for i, v in h.items()]

def p_ctrader(series_id, start):
    route = route_for(series_id)
    if route is None:
        raise RuntimeError(f"No cTrader route is configured for {series_id}")
    errors = []
    for symbol in route.ctrader_symbols:
        command = [sys.executable, os.path.join(REPO, "scripts", "run_fetch.py"),
                   "--history", "--symbols", symbol, "--start", start]
        if os.environ.get("CTRADER_ALLOW_LIVE", "0").strip().lower() in ("1", "true", "yes", "on"):
            command.append("--allow-live")
        try:
            result = subprocess.run(command, cwd=REPO, capture_output=True, text=True, timeout=100)
        except (OSError, subprocess.TimeoutExpired) as exc:
            errors.append(f"{symbol}: {type(exc).__name__}")
            continue
        if result.returncode:
            detail = (result.stderr or result.stdout).strip().splitlines()
            errors.append(f"{symbol}: {(detail[-1] if detail else 'request failed')[:120]}")
            continue
        marker = next((line[len("CTRADER_HISTORY_JSON="):] for line in result.stdout.splitlines()
                       if line.startswith("CTRADER_HISTORY_JSON=")), None)
        if marker is None:
            errors.append(f"{symbol}: history response missing")
            continue
        points = json.loads(marker)
        if len(points) >= 2:
            return points
        errors.append(f"{symbol}: fewer than two daily bars")
    raise RuntimeError("; ".join(errors) or "No cTrader daily bars returned")

def p_cftc(code, start):
    """Posisi bersih non-komersial (long - short), mingguan, laporan hari Selasa."""
    import requests
    r = requests.get("https://publicreporting.cftc.gov/resource/6dca-aqww.json", timeout=40,
        params={"cftc_contract_market_code": code, "$order": "report_date_as_yyyy_mm_dd DESC", "$limit": 400})
    r.raise_for_status()
    return sorted([x["report_date_as_yyyy_mm_dd"][:10],
                   int(float(x["noncomm_positions_long_all"])) - int(float(x["noncomm_positions_short_all"]))]
                  for x in r.json() if x["report_date_as_yyyy_mm_dd"][:10] >= start)

def p_llama(_ref, start):
    """Total pasokan stablecoin (miliar USD): proksi likuiditas kripto."""
    import requests
    r = requests.get("https://stablecoins.llama.fi/stablecoincharts/all", timeout=40)
    r.raise_for_status()
    out = []
    for x in r.json():
        day = dt.datetime.fromtimestamp(int(x["date"]), dt.timezone.utc).strftime("%Y-%m-%d")
        if day >= start: out.append([day, round(x["totalCirculatingUSD"]["peggedUSD"] / 1e9, 3)])
    return out

PROVIDERS = {"fred": p_fred, "yf": p_yf, "ctrader": p_ctrader, "cftc": p_cftc, "llama": p_llama}

def provider_routes(s):
    routes = s["prov"]
    enabled = os.environ.get("CTRADER_ENABLED", "0").strip().lower() in ("1", "true", "yes", "on")
    if not enabled:
        routes = [route for route in routes if route[0] != "ctrader"]
    return routes

# ---------- util ----------
def load(sid):
    f = os.path.join(SER, sid + ".json")
    try: return json.load(open(f))
    except Exception: return None

def save(sid, d):
    os.makedirs(SER, exist_ok=True)
    json.dump(d, open(os.path.join(SER, sid + ".json"), "w"), separators=(",", ":"))

def clean(pts, s):
    """Buang nilai di luar batas wajar & duplikat tanggal. Kembalikan (titik, jumlah_dibuang)."""
    seen = {}; bad = 0; today = NOW().date().isoformat()
    for d, v in pts:
        if d > today: continue            # proyeksi / tanggal masa depan bukan data teramati
        if v is None or (isinstance(v, float) and math.isnan(v)): continue
        if (s["lo"] is not None and v < s["lo"]) or (s["hi"] is not None and v > s["hi"]): bad += 1; continue
        seen[d] = v
    return [[d, seen[d]] for d in sorted(seen)], bad

def jump_check(old_pts, new_pts):
    """Apakah observasi terbaru baru melompat ekstrem dibanding sebaran perubahan historis?"""
    if len(new_pts) < 60: return None
    v = [p[1] for p in new_pts]
    ch = [v[i] - v[i - 1] for i in range(1, len(v) - 1)]    # tanpa perubahan terakhir
    mu = sum(ch) / len(ch); sd = (sum((c - mu) ** 2 for c in ch) / len(ch)) ** .5
    if not sd: return None
    z = (v[-1] - v[-2] - mu) / sd
    if abs(z) < JUMP_SIGMA: return None
    # hanya anomali bila observasi terakhir ini belum pernah kita lihat sebelumnya
    if old_pts and old_pts[-1][0] == new_pts[-1][0] and old_pts[-1][1] == new_pts[-1][1]: return None
    return round(z, 1)

def age_days(date_str):
    return (NOW().date() - dt.date.fromisoformat(date_str)).days

def due(s, old, force):
    if force or not old: return True
    routes = provider_routes(s)
    refs = [r for _, r in routes]
    primary = routes[0]
    if any(name == "ctrader" for name, _ in s["prov"]) and old.get("primary") != list(primary): return True
    if old.get("hist_years") != LONG_YEARS.get(s["id"]): return True            # kebutuhan riwayat berubah -> ambil ulang sekali
    if old.get("ref") not in refs: return True                       # definisi seri berubah -> ambil ulang
    today = NOW().date().isoformat()
    if any(p[0] > today for p in old.get("points", [])[-5:]): return True   # cache lama berisi tanggal masa depan
    if old.get("state") in ("gagal", "ditahan") and (NOW() - dt.datetime.fromisoformat(old.get("tried", old["fetched"]))).total_seconds() > 600: return True
    mins = FREQ[s["freq"]][1]
    try: last = dt.datetime.fromisoformat(old["fetched"])
    except Exception: return True
    return (NOW() - last).total_seconds() / 60 >= mins

def process(s, force=False):
    old = load(s["id"])
    if not due(s, old, force):
        return old, "lewati"
    start = (NOW().date() - dt.timedelta(days=365 * LONG_YEARS.get(s["id"], 4 if s["freq"] in ("harian", "mingguan") else 15))).isoformat()
    routes = provider_routes(s)
    primary = routes[0]
    errs = []; got = None; used = None; maxage = FREQ[s["freq"]][0]
    for name, ref in routes:
        try:
            pts = PROVIDERS[name](ref, start)
            pts, bad = clean(pts, s)
            if len(pts) < 2: errs.append(f"{name}:{ref} kosong"); continue
            if got is None or pts[-1][0] > got[-1][0]:      # simpan yang observasinya paling baru
                got, used = pts, (name, ref, bad)
            if age_days(got[-1][0]) <= maxage: break         # cukup segar -> tidak perlu cadangan
            errs.append(f"{name}:{ref} basi ({got[-1][0]}), coba cadangan")
        except Exception as e:
            errs.append(f"{name}:{ref} {type(e).__name__}: {str(e)[:80]}")
    now = NOW().isoformat(timespec="seconds")
    if got is None:                       # semua sumber gagal -> data lama dipertahankan
        if not old: return dict(id=s["id"], state="gagal", err=errs, points=[]), "gagal"
        old["state"] = "gagal"; old["err"] = errs; old["tried"] = now
        return old, "gagal"
    state, note = "ok", None
    z = jump_check(old["points"] if old else None, got)
    if z is not None:
        held = (old or {}).get("held", {})
        if held.get("date") == got[-1][0] and held.get("v") == got[-1][1]:
            note = f"lompatan {z}σ terkonfirmasi di fetch ulang, diterima"   # dua kali sama -> diterima
        else:
            if old:
                old["state"] = "ditahan"; old["held"] = dict(date=got[-1][0], v=got[-1][1], z=z, at=now)
                old["tried"] = now
                return old, "ditahan"
            note = f"lompatan {z}σ pada data pertama, diterima dengan catatan"
    d = dict(id=s["id"], label=s["label"], group=s["group"], freq=s["freq"], unit=s["unit"],
             prov=used[0], ref=used[1], fallback=(used[:2] != primary), dropped=used[2],
             fetched=now, asof=got[-1][0], last=got[-1][1], state=state, note=note, err=errs or None,
             hist_years=LONG_YEARS.get(s["id"]), points=got[-keep_n(s):])
    if any(name == "ctrader" for name, _ in s["prov"]):
        d["primary"] = list(primary)
    return d, "ok"

def keep_n(s):
    """Jumlah titik disimpan: seri riwayat panjang (persentil mesin fase) tidak boleh terpotong KEEP."""
    y = LONG_YEARS.get(s["id"])
    return KEEP[s["freq"]] if not y else int(y * (252 if s["freq"] == "harian" else 52) * 1.1)

def status_row(s, d, act):
    maxage = FREQ[s["freq"]][0]
    st = d.get("state", "gagal"); a = None
    if d.get("asof"):
        a = age_days(d["asof"])
        if st == "ok" and a > maxage: st = "basi"
        if st in ("ok", "basi", "gagal") and a > maxage * 2: st = "mati"
    return dict(id=s["id"], label=s["label"], group=s["group"], freq=s["freq"], tier=FREQ[s["freq"]][2],
                prov=d.get("prov"), ref=d.get("ref"), fallback=d.get("fallback", False),
                asof=d.get("asof"), age=a, last=d.get("last"), fetched=d.get("fetched"),
                state=st, crit=s["crit"], unverified=s["v"], act=act,
                note=d.get("note") or (d.get("held") and f"ditahan {d['held']['z']}σ") or (d.get("err") and "; ".join(d["err"])[:160]))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--tier", default="semua"); ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    rows = []
    for s in REGISTRY:
        if a.tier != "semua" and FREQ[s["freq"]][2] != a.tier:
            d = load(s["id"]); act = "tier-lain"
            d = d or dict(state="gagal")
        else:
            d, act = process(s, a.force)
            if act != "lewati" and d.get("points"): save(s["id"], d)
        rows.append(status_row(s, d, act))
    bad = [r for r in rows if r["state"] in ("gagal", "mati", "ditahan", "basi")]
    crit_bad = [r["id"] for r in bad if r["crit"] and r["state"] in ("gagal", "mati", "ditahan")]
    st = dict(generated=NOW().isoformat(timespec="seconds"), n=len(rows),
              counts={k: sum(r["state"] == k for r in rows) for k in ("ok", "basi", "ditahan", "gagal", "mati")},
              gate=dict(open=not crit_bad, blocked_by=crit_bad), series=rows)
    json.dump(st, open(os.path.join(ROOT, "status.json"), "w"), indent=1)
    # bundle ringkas untuk beranda: satu berkas, riwayat dipangkas sesuai frekuensi
    keepb = {"harian": 520, "mingguan": 200, "bulanan": 72, "kuartalan": 40}
    bundle = {}
    for s, r in zip(REGISTRY, rows):
        d_ = load(s["id"])
        if d_ and d_.get("points"):
            bundle[s["id"]] = dict(l=s["label"], g=s["group"], f=s["freq"], u=s["unit"], st=r["state"], a=r["asof"],
                                   ag=r["age"], v=d_.get("last"), fe=d_.get("fetched"), pv=d_.get("prov"), r=d_.get("ref"),
                                   fb=bool(d_.get("fallback")), c=bool(s["crit"]), un=bool(s["v"]), n=r["note"],
                                   p=d_["points"][-keepb[s["freq"]]:])
    json.dump(dict(generated=st["generated"], series=bundle), open(os.path.join(ROOT, "bundle.json"), "w"), separators=(",", ":"))
    print(f"seri={len(rows)} {st['counts']} gerbang={'TERBUKA' if st['gate']['open'] else 'TERTUTUP ' + ','.join(crit_bad)}")
    for r in bad: print(f"  {r['state']:8} {r['id']:8} {r['note'] or ''}")

if __name__ == "__main__":
    main()
