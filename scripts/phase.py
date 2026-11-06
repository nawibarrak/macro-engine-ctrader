"""Mesin fase pasar (tahap 3, label DISIMPULKAN). Semua ambang dan aturan dari config/thresholds.json (K7).
Membaca data/series/*.json, data/status.json, data/audit_series.json. Hasil: data/phase.json.
Persentil point-in-time: ambang hari t hanya dari data sebelum t. Histeresis dihitung ulang dari riwayat (tanpa berkas keadaan)."""
import os, json, bisect, datetime as dt
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
import sys; sys.path.insert(0, os.path.dirname(__file__))
from gates import closed_reason
RIWAYAT_TAMPIL = 260

def rj(p):
    try: return json.load(open(os.path.join(ROOT, p), encoding="utf-8"))
    except Exception: return None

def pts(sid):
    d = rj(f"data/series/{sid}.json")
    return [(p[0], float(p[1])) for p in (d or {}).get("points", []) if p[1] is not None]

def pct(sorted_vals, q):
    i = (len(sorted_vals) - 1) * q / 100.0; lo = int(i); hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (i - lo)

def levels(series, cfg):
    """Tingkat 0..3 per tanggal dengan persentil point-in-time. Kembali {tanggal: (nilai, tingkat atau None, ambang atau None)}."""
    q = cfg["persentil"]; win = cfg["jendela_obs"]; mn = cfg["min_obs"]
    hist = []; out = {}
    for d, v in series:
        w = hist[-win:] if len(hist) > win else hist
        if len(w) >= mn:
            sv = sorted(w); th = [pct(sv, q["naik"]), pct(sv, q["ekstrem"]), pct(sv, q["sangat_ekstrem"])]
            out[d] = (v, sum(v >= t for t in th), th)
        else: out[d] = (v, None, None)
        hist.append(v)
    return out

def prep(series): return ([x[0] for x in series], dict(series))

def asof(pp, d, maxage):
    """(tanggal, nilai) terakhir dengan tanggal <= d dan umur <= maxage hari, atau None."""
    dates, dv = pp; i = bisect.bisect_right(dates, d) - 1
    if i < 0: return None
    age = (dt.date.fromisoformat(d) - dt.date.fromisoformat(dates[i])).days
    return (dates[i], dv[dates[i]]) if age <= maxage else None

def klasifikasi(vol, kredit, term, cfg):
    """vol/kredit: tingkat 0..3 atau None; term: rasio VIX/VIX3M atau None. Kembali (fase, catatan)."""
    urut = cfg["urutan"]; tb = cfg["term_terbalik"]; cat = []
    if vol is None or kredit is None: return None, ["vol atau kredit tidak tersedia"]
    if term is not None and term > tb: vol = max(vol, 1)
    if vol == 0 and kredit == 0: f = "Normal"
    elif vol >= 1 and kredit >= 1: f = "Stres"
    else: f = "Waspada"
    if vol >= 2 and kredit >= 2:
        if term is None: cat.append("Krisis tidak bisa dikonfirmasi (VIX3M tidak tersedia)")
        elif term > tb: f = "Krisis"
        else: cat.append("ekstrem tetapi kurva VIX belum terbalik: tetap Stres")
    return f, cat

def histeresis(raws, cfg):
    """raws: [(tanggal, fase mentah atau None)]. Naik langsung; turun satu tingkat setelah N hari mentah lebih rendah."""
    urut = cfg["urutan"]; n = cfg["histeresis_turun_hari"]; cur = None; low = 0; out = []
    for d, r in raws:
        if r is None: out.append((d, None)); continue
        if cur is None: cur = r; low = 0
        elif urut.index(r) > urut.index(cur): cur = r; low = 0
        elif urut.index(r) < urut.index(cur):
            low += 1
            if low >= n: cur = urut[urut.index(cur) - 1]; low = 0
        else: low = 0
        out.append((d, cur))
    return out

def hitung(cfg, S):
    """S: {kunci: series}. Riwayat penuh (point-in-time) -> fase mentah, fase dengan histeresis, rincian per hari."""
    m = cfg["masukan"]
    lv = {k: levels(S[k], cfg) for k in ("vol", "kredit", "kondisi") if S.get(k)}
    P = {k: prep(S[k]) for k in S if S.get(k)}
    raws = []; detail = {}
    for d, v in S["vol"]:
        g = {}
        for k in ("vol", "kredit", "kondisi"):
            a = asof(P[k], d, m[k]["umur_maks_hari"]) if k in P else None
            g[k] = lv[k][a[0]] if a else None
        term = None
        if "term" in P:
            a = asof(P["term"], d, m["term"]["umur_maks_hari"])
            if a and a[1]: term = v / a[1]
        volT = g["vol"][1] if g["vol"] else None; kreT = g["kredit"][1] if g["kredit"] else None
        f, cat = klasifikasi(volT, kreT, term, cfg)
        raws.append((d, f)); detail[d] = dict(vol=g["vol"], kredit=g["kredit"], kondisi=g["kondisi"], term=term, cat=cat)
    return raws, histeresis(raws, cfg), detail

def uji_peristiwa(cfg, fase):
    urut = cfg["urutan"]; fm = dict(fase); res = []
    for e in cfg.get("peristiwa_uji", []):
        ds = [d for d in fm if e["dari"] <= d <= e["sampai"] and fm[d]]
        if not ds: res.append(dict(nama=e["nama"], hasil="tidak tercakup data")); continue
        hi = max(urut.index(fm[d]) for d in ds); ok = True
        if "min_fase" in e: ok = hi >= urut.index(e["min_fase"])
        if "maks_fase" in e: ok = ok and hi <= urut.index(e["maks_fase"])
        res.append(dict(nama=e["nama"], tertinggi=urut[hi], diharapkan=e.get("min_fase") or ("maks " + e["maks_fase"]), hasil="sesuai" if ok else "tidak sesuai"))
    return res

def main():
    tj = rj("config/thresholds.json")
    if not tj: raise SystemExit("config/thresholds.json tidak ada")
    cfg = tj["fase"]; st = rj("data/status.json"); au = rj("data/audit_series.json")
    rows = {r["id"]: r for r in (st or {}).get("series", [])}; trust = (au or {}).get("trust", {})
    valid = {k: closed_reason(v["seri"], st, au, rows, trust) for k, v in cfg["masukan"].items()}
    S = {k: pts(v["seri"]) for k, v in cfg["masukan"].items()}
    out = dict(generated=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), versi=tj["versi"], status_ambang=tj["status"],
               masukan={k: dict(seri=v["seri"], tertutup=valid[k], obs=len(S[k])) for k, v in cfg["masukan"].items()})
    if not S["vol"] or not S["kredit"]:
        out.update(fase=None, alasan="riwayat VIX atau HYOAS belum ada")
    else:
        raws, fase, detail = hitung(cfg, S)
        last = fase[-1][0]; d = detail[last]; fl = fase[-1][1]
        tutup = [k for k in ("vol", "kredit") if valid[k]]
        alasan = None
        if tutup: fl = None; alasan = "masukan inti tertutup: " + ", ".join(cfg["masukan"][k]["seri"] + " (" + valid[k] + ")" for k in tutup)
        elif fl is None: alasan = "riwayat kurang dari min_obs atau data kedaluwarsa"
        cat = list(d["cat"])
        if valid["term"] and fl and d["term"] is not None: cat.append("VIX3M tertutup (" + valid["term"] + "): Krisis tidak bisa dikonfirmasi")
        if valid["kondisi"]: cat.append("NFCI tertutup (" + valid["kondisi"] + "): hanya konteks, fase tetap dihitung")
        def ring(x): return None if not x else dict(nilai=round(x[0], 3), tingkat=x[1], ambang=[round(t, 3) for t in x[2]] if x[2] else None)
        dist = {}
        for _, f in fase:
            if f: dist[f] = dist.get(f, 0) + 1
        out.update(fase=fl, mentah=raws[-1][1], tanggal=last, alasan=alasan, catatan=cat,
                   masukan_nilai=dict(vol=ring(d["vol"]), kredit=ring(d["kredit"]), kondisi=ring(d["kondisi"]),
                                      term=None if d["term"] is None else round(d["term"], 3)),
                   distribusi=dist, uji_peristiwa=uji_peristiwa(cfg, fase),
                   riwayat=[[a, b] for a, b in fase[-RIWAYAT_TAMPIL:]])
    json.dump(out, open(os.path.join(ROOT, "data", "phase.json"), "w"), indent=1, ensure_ascii=False)
    print("fase:", out.get("fase") or ("tidak dihitung: " + str(out.get("alasan"))), "| ambang", tj["versi"])

if __name__ == "__main__":
    main()
