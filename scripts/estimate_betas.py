"""Estimasi beta aset terhadap faktor (mingguan) -> data/betas.json.
Beta = sensitivitas terstandar (per 1 sigma faktor -> sigma return aset), SATUAN SAMA dengan tabel prior di web.
Metode: ridge yang ditarik ke arah prior (Bayesian shrinkage). Dipakai HANYA jika lolos uji walk-forward
melawan prior. Faktor G tidak diestimasi (belum ada proksi gratis yang tidak sirkular) -> tetap prior.
Ini sensitivitas ko-gerak mingguan, bukan bukti sebab-akibat."""
import os, sys, json, datetime as dt
import numpy as np, pandas as pd

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "betas.json")
KEY = os.environ.get("FRED_API_KEY")
FACT = ["G", "I", "P", "L", "R", "RY", "USD"]
PRIOR = {
 "XAU": [0,.3,0,.3,.4,-.7,-.5], "WTI": [.5,.4,0,.1,-.4,0,-.3], "CU": [.7,0,0,.2,-.5,0,-.4],
 "SPX": [.4,-.1,-.1,.4,-.7,-.4,-.2], "NDX": [.3,-.1,-.1,.5,-.8,-.6,-.2], "BTC": [.1,0,0,.7,-.7,-.4,-.4],
 "EEM": [.3,0,0,.4,-.6,-.3,-.5], "IHSG": [.3,0,0,.3,-.6,-.3,-.4], "EURUSD": [0,0,0,0,-.2,0,-.9],
 "GBPUSD": [.1,0,0,0,-.3,0,-.8], "USDJPY": [.1,0,0,0,-.5,.6,.4], "AUDUSD": [.4,0,0,0,-.5,-.1,-.6],
 "USDIDR": [-.1,0,0,-.2,.6,.2,.7]}   # US02Y tidak diestimasi (sirkular dengan faktor P)
TICK = {"XAU": "GC=F", "WTI": "CL=F", "CU": "HG=F", "SPX": "^GSPC", "NDX": "^NDX", "BTC": "BTC-USD", "EEM": "EEM",
        "IHSG": "^JKSE", "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "JPY=X", "AUDUSD": "AUDUSD=X", "USDIDR": "IDR=X"}
LAMS = [30, 100, 300, 1000]

def fred(sid):
    import requests
    r = requests.get("https://api.stlouisfed.org/fred/series/observations", timeout=60,
        params=dict(series_id=sid, api_key=KEY, file_type="json", observation_start="2008-01-01"))
    r.raise_for_status()
    s = {o["date"]: float(o["value"]) for o in r.json()["observations"] if o["value"] != "."}
    return pd.Series(s, dtype=float).rename(sid).pipe(lambda x: x.set_axis(pd.to_datetime(x.index)))

def load():
    """-> (faktor mingguan DataFrame[I,P,L,R,RY,USD], return aset mingguan DataFrame)"""
    import yfinance as yf
    wk = lambda s: s.resample("W-FRI").last().ffill()
    ry, be, y2, vix = (wk(fred(x)) for x in ("DFII10", "T10YIE", "DGS2", "VIXCLS"))
    nl = wk(fred("WALCL") / 1e3).sub(wk(fred("WTREGEN") / 1e3), fill_value=0).sub(wk(fred("RRPONTSYD")), fill_value=0)
    px = yf.download(list(TICK.values()) + ["DX-Y.NYB"], start="2008-01-01", progress=False, auto_adjust=True)["Close"]
    px = px.resample("W-FRI").last()
    fac = pd.DataFrame({"I": be.diff(), "P": y2.diff(), "L": nl.diff(), "R": vix.diff(), "RY": ry.diff(),
                        "USD": np.log(px["DX-Y.NYB"]).diff()})
    ret = pd.DataFrame({k: np.log(px[t]).diff() for k, t in TICK.items()})
    return fac, ret

def fit(X, y, b0, lam):
    """ridge menuju prior: b = (X'X + lam I)^-1 (X'y + lam b0)"""
    return np.linalg.solve(X.T @ X + lam * np.eye(X.shape[1]), X.T @ y + lam * b0)

def run(fac, ret):
    out = {}; fac = fac.dropna(how="all")
    cols = ["I", "P", "L", "R", "RY", "USD"]; idx = [FACT.index(c) for c in cols]
    for k, pri in PRIOR.items():
        if k not in ret: continue
        d = pd.concat([ret[k].rename("y"), fac[cols]], axis=1).dropna()
        if len(d) < 200: out[k] = dict(use=False, reason=f"data kurang ({len(d)} minggu)", prior=pri); continue
        Z = (d - d.mean()) / d.std()
        X, y = Z[cols].values, Z["y"].values
        # faktor G tidak diestimasi: kontribusi prior-nya dikurangkan bersama sisa prior hanya lewat 6 kolom ini
        b0 = np.array([pri[i] for i in idx]); n = len(d); s0 = int(n * .55)
        res = {}
        for lam in LAMS:                              # walk-forward, refit tiap 13 minggu
            se = sp = sz = 0.0; cnt = 0
            for t in range(s0, n - 1, 13):
                b = fit(X[:t], y[:t], b0, lam)
                e = slice(t, min(t + 13, n))
                se += ((y[e] - X[e] @ b) ** 2).sum(); sp += ((y[e] - X[e] @ b0) ** 2).sum(); sz += (y[e] ** 2).sum(); cnt += len(y[e])
            res[lam] = (se, sp, sz, cnt)
        lam = min(res, key=lambda l: res[l][0]); se, sp, sz, cnt = res[lam]
        r2e, r2p = 1 - se / sz, 1 - sp / sz
        use = bool(se < sp * 0.98 and r2e > 0.01)       # harus mengalahkan prior (>=2%) DAN punya R2 uji positif
        b = fit(X, y, b0, lam); est = list(pri)
        for j, i in enumerate(idx): est[i] = round(float(b[j]), 2)
        out[k] = dict(use=use, prior=pri, est=est, lam=lam, n_weeks=n, n_oos=cnt, r2_est=round(r2e, 4), r2_prior=round(r2p, 4),
                      reason="est mengalahkan prior dan R2 uji>0" if use else "tidak lolos (tidak mengalahkan prior atau R2 uji<=0) -> tetap prior")
    return out

if __name__ == "__main__":
    if os.path.exists(OUT):
        try:
            g = json.load(open(OUT)).get("generated")
            if g and (dt.datetime.utcnow() - dt.datetime.fromisoformat(g.rstrip("Z"))).days < 7 and "--force" not in sys.argv:
                print("betas.json masih baru (<7 hari), dilewati"); sys.exit(0)
        except Exception: pass
    try:
        if not KEY: raise RuntimeError("FRED_API_KEY belum diset")
        fac, ret = load(); res = run(fac, ret)
    except Exception as e:
        print(f"estimasi beta dilewati: {e}"); sys.exit(0)        # jangan menggagalkan workflow
    json.dump(dict(generated=dt.datetime.utcnow().isoformat(timespec="seconds") + "Z", factors=FACT,
                   note="Beta terstandar mingguan, ridge ke prior, G tidak diestimasi. use=true hanya jika menang walk-forward atas prior.",
                   assets=res), open(OUT, "w"), indent=1)
    print({k: (v["use"], v.get("r2_est"), v.get("r2_prior")) for k, v in res.items()})
