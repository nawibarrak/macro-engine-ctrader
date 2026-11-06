"""Otak makro otomatis (tahap 3, label DISIMPULKAN). Rantai: kejutan rilis -> kondisi dan kuadran -> reaksi Fed (data dan harga pasar)
-> faktor pasar -> skor dukungan makro per aset (kontribusi tiap faktor) -> aliran modal terukur -> posisi spekulan (COT).
Semua ambang dan bobot di config/thresholds.json blok "otak" (K7), berstatus kandidat. Hasil: data/otak.json.
Bukan sinyal: bukti untuk tahap 4 dan 5. Gerbang tertutup -> aset tidak dihitung."""
import os, sys, json, math, datetime as dt
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
FACT = ["G", "I", "P", "L", "R", "RY", "USD"]

def rj(p):
    try: return json.load(open(os.path.join(ROOT, p), encoding="utf-8"))
    except Exception: return None

def pts(sid):
    d = rj(f"data/series/{sid}.json")
    return [(p[0], float(p[1])) for p in (d or {}).get("points", []) if p[1] is not None]

def mean(x): return sum(x) / len(x)
def sd(x):
    if len(x) < 3: return None
    m = mean(x); return (sum((v - m) ** 2 for v in x) / (len(x) - 1)) ** 0.5
def clip(v, a, b): return max(a, min(b, v))
def age_days(d, today): return (today - dt.date.fromisoformat(d)).days

def changes(s, n, log=False):
    """Perubahan n pengamatan: [(tanggal, nilai)]."""
    out = []
    for i in range(n, len(s)):
        a, b = s[i - n][1], s[i][1]
        if log:
            if a <= 0 or b <= 0: continue
            out.append((s[i][0], math.log(b / a)))
        else: out.append((s[i][0], b - a))
    return out

def zlast(s, n, obs, minobs, log=False):
    """z perubahan terakhir n pengamatan terhadap simpangan baku perubahan n pengamatan di jendela obs terakhir."""
    c = changes(s, n, log)
    if len(c) < minobs: return None
    base = [v for _, v in c[-obs:]]; k = sd(base)
    return None if not k else (c[-1][1] / k, c[-1][0])

def corr(a, b):
    if len(a) < 5: return None
    ma, mb = mean(a), mean(b); sa, sb = sd(a), sd(b)
    if not sa or not sb: return None
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / ((len(a) - 1) * sa * sb)

# ---------- B. kejutan rilis ----------
def kejutan(feed, c, today):
    if not feed: return dict(tersedia=False, alasan="feed.json belum ada")
    ssd = feed.get("surprise_sd") or {}; rel = feed.get("releases") or []
    half = c["paruh_umur_hari"]; comp = []
    latest = {}
    for r in rel:                                         # rilis terbaru tiap indikator di dalam jendela
        if r.get("cons") is None or r["ind"] not in c["bobot"]: continue
        a = age_days(r["date"], today)
        if a < 0 or a > c["jendela_hari"]: continue
        if r["ind"] not in latest or r["date"] > latest[r["ind"]]["date"]: latest[r["ind"]] = r
    for ind, r in latest.items():
        s = ssd.get(ind)
        if not s or s["n"] < c["min_sd_obs"] or not s["sd"]: continue
        z = clip((r["act"] - r["cons"]) / s["sd"] * c["arah"][ind], -c["klip_z"], c["klip_z"])   # + = hawkish
        w = c["bobot"][ind] * 0.5 ** (age_days(r["date"], today) / half)
        comp.append(dict(ind=ind, tanggal=r["date"], aktual=r["act"], konsensus=r["cons"], sumber=r.get("src"), z=round(z, 2), bobot=round(w, 2),
                         arah="hawkish" if z > c["netral_z"] else "dovish" if z < -c["netral_z"] else "netral"))
    if not comp: return dict(tersedia=False, alasan="tidak ada rilis berkonsensus di jendela atau riwayat kejutan kurang")
    tw = sum(x["bobot"] for x in comp); skor = sum(x["z"] * x["bobot"] for x in comp) / tw
    cnt = {k: sum(x["arah"] == k for x in comp) for k in ("dovish", "hawkish", "netral")}
    return dict(tersedia=True, skor=round(skor / c["klip_z"] * 100, 1), suara=dict(cnt, total=len(comp)),
                proksi=sum(x["sumber"] != "file" for x in comp), komponen=sorted(comp, key=lambda x: -x["bobot"]))

# ---------- A. kondisi dan kuadran ----------
def kondisi(feed, c):
    a = (feed or {}).get("actual") or {}
    G = (a.get("G") or {}).get("v"); I = (a.get("I") or {}).get("v")
    if G is None or I is None: return dict(G=G, I=I, kuadran=None, asof=a.get("asof"), alasan="kondisi aktual belum tersedia")
    n = c["netral"]
    if abs(G) < n or abs(I) < n: q = "campuran"
    else: q = {(1, -1): "Goldilocks", (1, 1): "Reflasi", (-1, 1): "Stagflasi", (-1, -1): "Deflasi"}[(1 if G > 0 else -1, 1 if I > 0 else -1)]
    return dict(G=G, I=I, kuadran=q, asof=a.get("asof"))

# ---------- C. reaksi Fed ----------
def reaksi_fed(ks, S, c, P):
    out = dict(taylor=None, pasar=None)
    core = S["CPICORE"]; un = S["UNEMP"]; nr = S["NROU"]; fed = S["FED"]
    if len(core) > 12 and un and nr and fed:
        pi = (core[-1][1] / core[-13][1] - 1) * 100; u = un[-1][1]; nrou = nr[-1][1]; mid = fed[-1][1] - c["lebar_target"] / 2
        rate = c["r_star"] + pi + c["phi_inflasi"] * (pi - c["target_inflasi"]) + c["phi_pengangguran"] * (nrou - u)
        out["taylor"] = dict(inflasi_inti=round(pi, 2), pengangguran=u, nrou=nrou, tingkat_aturan=round(rate, 2), target_tengah=round(mid, 3), celah=round(rate - mid, 2))
    eff = S["EFFR"] or S["FED"]; y2 = S["US02Y"]; b3 = S["DTB3"]
    if eff and y2:
        e = eff[-1][1] if S["EFFR"] else eff[-1][1] - c["lebar_target"] / 2
        out["pasar"] = dict(us02y=y2[-1][1], efektif=round(e, 3), harga_2y=round(y2[-1][1] - e, 2),
                            harga_3m=None if not b3 else round(b3[-1][1] - e, 2), efektif_dari="EFFR" if S["EFFR"] else "FED (proksi: tengah target)")
    sk = ks.get("skor") if ks.get("tersedia") else None
    st = None if not out["taylor"] else clip(out["taylor"]["celah"] / c["skala_celah_taylor"], -1, 1) * 100
    parts = [(v, w) for v, w in ((sk, c["bobot_kejutan"]), (st, c["bobot_taylor"])) if v is not None]
    data = None if not parts else sum(v * w for v, w in parts) / sum(w for _, w in parts)
    mkt = None if not out["pasar"] else clip(out["pasar"]["harga_2y"] / c["skala_harga_2y"], -1, 1) * 100
    out.update(skor_kejutan=sk, skor_taylor=None if st is None else round(st, 1), sisi_data=None if data is None else round(data, 1),
               sisi_pasar=None if mkt is None else round(mkt, 1))
    if data is None: out.update(stance=None, terkonfirmasi=None, catatan="data kebijakan tidak cukup"); return out
    out["stance"] = "hawkish" if data > c["ambang_stance"] else "dovish" if data < -c["ambang_stance"] else "netral"
    conf = None                                           # konfirmasi = gerak yield 2 tahun 5 hari terakhir (faktor P), bukan levelnya
    if out["stance"] != "netral" and P is not None and abs(P) >= c["ambang_p_z"]:
        conf = (P > 0) == (data > 0)
    out["gerak_2y_z"] = P
    out["terkonfirmasi"] = conf
    out["catatan"] = (("stance netral: rantai tidak dijalankan" + ("; harga pasar condong " + ("hawkish" if mkt > 0 else "dovish") + " sementara data belum searah" if mkt is not None and abs(mkt) >= c["ambang_selisih_pasar"] else "")) if out["stance"] == "netral" else
                      "gerak yield 2 tahun belum jelas" if conf is None else
                      "yield 2 tahun membenarkan data" if conf else "yield 2 tahun BERLAWANAN dengan data: rantai tidak terbukti, lihat skenario alternatif")
    return out

# ---------- E. faktor dan skor aset ----------
def faktor(S, kond, c):
    n, ob, mn = c["jendela_hari"], c["jendela_sd_obs"], c["min_obs"]; F = {}; src = {}
    def put(k, v, s):
        if v is not None: F[k] = round(clip(v[0], -c["klip_z"], c["klip_z"]), 2); src[k] = f"{s} ({v[1]})"
    put("I", zlast(S["BE10Y"], n, ob, mn), "perubahan breakeven 10 tahun")
    put("P", zlast(S["US02Y"], n, ob, mn), "perubahan yield 2 tahun")
    put("R", zlast(S["VIX"], n, ob, mn), "perubahan VIX")
    put("RY", zlast(S["REAL10Y"], n, ob, mn), "perubahan yield riil 10 tahun")
    put("USD", zlast(S["DXY"], n, ob, mn, log=True), "perubahan log DXY")
    w, t = dict(S["WALCL"]), dict(S["TGA"]); nl = []
    for d in sorted(set(w) & set(t)):
        rr = [v for dd, v in S["RRP"] if dd <= d]
        if rr: nl.append((d, w[d] / 1e3 - t[d] / 1e3 - rr[-1]))
    put("L", zlast(nl, max(1, n // 5), ob // 5, mn // 5), "perubahan likuiditas bersih (mingguan)")
    if kond.get("G") is not None: F["G"] = round(clip(kond["G"], -c["klip_z"], c["klip_z"]), 2); src["G"] = f"kondisi aktual ({kond.get('asof')})"
    return F, src

def beta_aset(key, betas):
    from estimate_betas import PRIOR
    b = (betas or {}).get("assets", {}).get(key)
    if b and b.get("use") and b.get("est"): return b["est"], "estimasi (menang walk-forward atas prior)"
    return PRIOR[key], "prior ekonomi awal"

# ---------- F. aliran modal ----------
def aliran(S, c):
    n, ob = c["jendela_hari"], c["jendela_sd_obs"]; rows = []
    for nama, sid in c["kelas"].items():
        v = zlast(S[sid], n, ob, 120, log=True)
        if v: rows.append(dict(kelas=nama, seri=sid, z=round(v[0], 2), tanggal=v[1]))
    rows.sort(key=lambda x: -x["z"])
    byz = {r["seri"]: r["z"] for r in rows}
    rk = [byz[s] for s in c["berisiko"] if s in byz]; am = [byz[s] for s in c["aman"] if s in byz]
    tone = None if not rk or not am else round(mean(rk) - mean(am), 2)
    label = None if tone is None else "selera risiko naik" if tone > c["ekstrem_z"] else "menghindari risiko" if tone < -c["ekstrem_z"] else "campuran"
    return dict(peringkat=rows, nada_risiko=tone, label=label, mengalir_ke=[r["kelas"] for r in rows if r["z"] > c["ekstrem_z"]],
                keluar_dari=[r["kelas"] for r in rows if r["z"] < -c["ekstrem_z"]])

# ---------- COT ----------
def cot_aset(sid, S, c):
    s = S.get(sid)
    if not s or len(s) < c["min_obs"]: return None
    h = [v for _, v in s[-c["jendela_minggu"]:]]; x = h[-1]
    p = 100.0 * sum(v <= x for v in h) / len(h)
    return dict(persentil=round(p, 1), posisi=x, tanggal=s[-1][0],
                tanda="padat panjang: risiko pembalikan turun" if p >= c["ekstrem_atas"] else "padat pendek: risiko pembalikan naik" if p <= c["ekstrem_bawah"] else "tidak ekstrem")

# ---------- uji tautan ----------
def uji_tautan(S, c):
    n, ob = c["jendela_hari"], c["jendela_obs"]; res = []
    for t in c["daftar"]:
        a, b = changes(S[t["dari"]], n), changes(S[t["ke"]], n)
        ia = dict(a); pairs = [(ia[d], v) for d, v in b if d in ia][-ob:]
        r = dict(dari=t["dari"], ke=t["ke"], tanda=t["tanda"], aset=t["aset"])
        if len(pairs) < c["min_obs"]: res.append(dict(r, lulus=False, alasan=f"data kurang ({len(pairs)})")); continue
        cr = corr([p[0] for p in pairs], [p[1] for p in pairs]); k = c["subjendela"]; m = len(pairs) // k; ok = 0
        for i in range(k):
            cc = corr([p[0] for p in pairs[i * m:(i + 1) * m]], [p[1] for p in pairs[i * m:(i + 1) * m]])
            if cc is not None and cc * t["tanda"] > 0: ok += 1
        lulus = cr is not None and cr * t["tanda"] >= c["min_korelasi"] and ok >= c["min_subjendela_searah"]
        res.append(dict(r, lulus=bool(lulus), korelasi=None if cr is None else round(cr, 2), subjendela_searah=f"{ok}/{k}",
                        alasan="lulus" if lulus else "tanda atau kestabilan tidak terpenuhi"))
    return res

def main():
    cfgf = rj("config/thresholds.json")
    if not cfgf or "otak" not in cfgf: raise SystemExit("config/thresholds.json blok 'otak' tidak ada")
    cfg = cfgf["otak"]; today = dt.datetime.now(dt.timezone.utc).date()
    feed = rj("data/feed.json"); gates = rj("data/gates.json"); phase = rj("data/phase.json"); betas = rj("data/betas.json")
    need = ["CPICORE", "UNEMP", "NROU", "FED", "EFFR", "US02Y", "DTB3", "BE10Y", "VIX", "REAL10Y", "DXY", "WALCL", "TGA", "RRP", "US10Y", "COPPER", "HYOAS",
            "XAUUSD", "WTI", "SPX", "USDJPY", "EURUSD"] + list(cfg["aliran"]["kelas"].values()) + [a["cot"] for a in cfg["aset"].values()]
    S = {k: pts(k) for k in set(need)}
    ks = kejutan(feed, cfg["kejutan"], today); kd = kondisi(feed, cfg["kondisi"])
    F, fsrc = faktor(S, kd, cfg["faktor"]); fed = reaksi_fed(ks, S, cfg["fed"], F.get("P")); al = aliran(S, cfg["aliran"]); tl = uji_tautan(S, cfg["tautan"])
    byz = {r["seri"]: r["z"] for r in al["peringkat"]}
    fase = (phase or {}).get("fase"); ky = cfg["keyakinan"]; out_aset = {}
    for a, m in cfg["aset"].items():
        g = ((gates or {}).get("aset") or {}).get(m["gerbang"])
        if gates is None or g is None or not g.get("open"):
            out_aset[a] = dict(dihitung=False, alasan="gerbang tertutup: " + ("; ".join(f"{b['id']} ({b['alasan']})" for b in g["blocked_by"]) if g else "data gerbang tidak ada")); continue
        b, bsrc = beta_aset(m["beta"], betas)
        kontr = {f: round(b[FACT.index(f)] * F[f], 3) for f in FACT if f in F}
        skor = sum(kontr.values()); arah = "naik" if skor > cfg["skor"]["ambang_arah"] else "turun" if skor < -cfg["skor"]["ambang_arah"] else "netral"
        miss = [f for f in FACT if f not in F]
        # keyakinan (heuristik, bukan probabilitas)
        k_len = len(F) / len(FACT)
        k_fed = 0.5 if fed.get("terkonfirmasi") is None else 1.0 if fed["terkonfirmasi"] else 0.0
        zz = byz.get(m["aliran"]["seri"]); z = None if zz is None else round(zz * m["aliran"]["tanda"], 2)
        k_al = 0.5 if z is None or arah == "netral" else 1.0 if (z > 0) == (arah == "naik") else 0.0
        rel = [t for t in tl if a in t["aset"]]; k_tl = 0.5 if not rel else sum(t["lulus"] for t in rel) / len(rel)
        w = ky["bobot"]; kon = w["kelengkapan"] * k_len + w["kesepakatan_fed"] * k_fed + w["aliran_searah"] * k_al + w["bukti_tautan"] * k_tl
        if bsrc.startswith("prior"): kon *= ky["beta_prior"]
        kon *= ky["pengali_fase"].get(fase, 0.5)
        cs = cot_aset(m["cot"], S, cfg["cot"])
        alt = []
        if fed.get("terkonfirmasi") is False: alt.append("Yield 2 tahun berlawanan dengan data: arah rantai tidak dibenarkan pasar")
        if fase in ("Stres", "Krisis"): alt.append(f"Fase pasar {fase}: aset aman (dolar, obligasi, emas) cenderung menimpa rantai normal")
        if z is not None and arah != "netral" and (z > 0) != (arah == "naik"): alt.append("Aliran modal 20 hari berlawanan dengan skor makro")
        if cs and cs["tanda"] != "tidak ekstrem": alt.append("Posisi spekulan " + cs["tanda"])
        out_aset[a] = dict(dihitung=True, skor_sigma=round(skor, 2), skor=round(clip(skor * cfg["skor"]["skala"], -100, 100), 1), arah=arah,
                           keyakinan=round(kon * 100), kontribusi=kontr, beta_sumber=bsrc, faktor_hilang=miss,
                           aliran_z=z, cot=cs, tautan=[dict(dari=t["dari"], ke=t["ke"], lulus=t["lulus"]) for t in rel], alternatif=alt)
    out = dict(generated=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), versi=cfgf["versi"], status=cfg["status"],
               fase_pasar=fase, kejutan=ks, kondisi=kd, fed=fed, faktor=F, faktor_sumber=fsrc, aliran=al, tautan=tl, aset=out_aset,
               catatan="Skor dalam satuan sigma (tekanan arah relatif), bukan target harga. Keyakinan = heuristik kelengkapan dan kesepakatan, bukan probabilitas. Konsensus rilis berupa proksi kecuali tertulis 'file'.")
    json.dump(out, open(os.path.join(ROOT, "data", "otak.json"), "w"), indent=1, ensure_ascii=False)
    print("otak: stance", fed.get("stance"), "| kuadran", kd.get("kuadran"), "| aset", {a: (v.get("arah"), v.get("keyakinan")) if v["dihitung"] else "tertutup" for a, v in out_aset.items()})

if __name__ == "__main__":
    main()
