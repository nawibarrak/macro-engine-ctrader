"""Gerbang data per aset (keputusan 2026-10-07, KONSEP.md). Membaca data/status.json, data/audit_series.json, config/gates.json.
Satu seri 'tertutup' bila sumbernya gagal/mati/ditahan (status.json) atau auditnya bermasalah (audit_series.json).
Aset terbuka bila SEMUA masukan umum dan masukan asetnya terbuka. Hasil: data/gates.json (tampil di beranda)."""
import os, json, datetime as dt
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
def rj(p):
    try: return json.load(open(os.path.join(ROOT, p), encoding="utf-8"))
    except Exception: return None

def closed_reason(sid, st, au, rows, trust):
    """None bila seri terbuka; selain itu alasan penutupan (dipakai gerbang dan mesin fase)."""
    r = rows.get(sid)
    if st is None: return "status data belum tersedia"
    if r is None: return "seri tidak ada di status data"
    if r["state"] in ("gagal", "mati", "ditahan"): return f"sumber {r['state']}"
    if au is None: return "audit belum tersedia"
    if trust.get(sid) == "bermasalah": return "audit bermasalah"
    if sid not in trust: return "audit tidak mencakup seri ini"
    return None

def main():
    cfg = rj("config/gates.json"); st = rj("data/status.json"); au = rj("data/audit_series.json")
    if not cfg: raise SystemExit("config/gates.json tidak ada")
    rows = {r["id"]: r for r in (st or {}).get("series", [])}; trust = (au or {}).get("trust", {})
    why = lambda sid: closed_reason(sid, st, au, rows, trust)
    def block(ids): return [dict(id=i, alasan=w) for i in ids for w in [why(i)] if w]
    umum = block(cfg["umum"]); out = dict(generated=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        umum=dict(open=not umum, blocked_by=umum), aset={})
    for a, ids in cfg["aset"].items():
        own = block(ids); out["aset"][a] = dict(open=not umum and not own, blocked_by=umum + own)
    json.dump(out, open(os.path.join(ROOT, "data", "gates.json"), "w"), indent=1, ensure_ascii=False)
    print("gerbang umum", "TERBUKA" if not umum else "TERTUTUP " + ",".join(b["id"] for b in umum), "|",
          " ".join(f"{a}={'buka' if g['open'] else 'tutup'}" for a, g in out["aset"].items()))

if __name__ == "__main__":
    main()
