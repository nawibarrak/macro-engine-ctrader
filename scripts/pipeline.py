"""Satu pintu untuk seluruh pipeline. Workflow cukup memanggil skrip ini; langkah baru ditambah di STEPS
(tanpa mengubah feed.yml). Tiap langkah terisolasi: satu gagal tidak menghentikan yang lain, dan hasilnya
dicatat di data/pipeline.json (tampil di beranda). Urutan penting: data -> audit -> analisis -> pemeriksa konsep."""
import os, sys, json, time, subprocess, datetime as dt
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PY = sys.executable
# (nama, skrip, butuh kunci FRED)
STEPS = [
    ("konsensus", "scripts/fetch_consensus.py", False),
    ("feed lama (rilis, COT, shock)", "scripts/fetch_feed.py", True),
    ("lapisan data", "scripts/data_layer.py", True),
    ("audit seri", "scripts/audit_series.py", True),
    ("gerbang per aset", "scripts/gates.py", False),
    ("fase pasar", "scripts/phase.py", False),
    ("otak makro", "scripts/otak.py", False),
    ("audit feed lama", "scripts/audit_feed.py", False),
    ("estimasi beta", "scripts/estimate_betas.py", True),
    ("pemeriksa konsep", "scripts/check_concept.py", False),
]

def main():
    res = []
    for name, script, needs_key in STEPS:
        if needs_key and not os.environ.get("FRED_API_KEY"):
            res.append(dict(step=name, status="dilewati", detail="FRED_API_KEY tidak diset", sec=0)); continue
        t = time.time()
        p = subprocess.run([PY, os.path.join(ROOT, script)], cwd=ROOT, capture_output=True, text=True, timeout=900,
                           env={**os.environ, "PYTHONWARNINGS": "ignore"})
        out = (p.stdout + p.stderr).strip()
        print(f"::group::{name}\n{out[-3000:]}\n::endgroup::")
        res.append(dict(step=name, status="ok" if p.returncode == 0 else "gagal", detail=out.splitlines()[-1][:200] if out else "", sec=round(time.time() - t, 1)))
    json.dump(dict(generated=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), steps=res),
              open(os.path.join(ROOT, "data", "pipeline.json"), "w"), indent=1, ensure_ascii=False)
    bad = [r["step"] for r in res if r["status"] == "gagal"]
    print("PIPELINE:", "semua langkah selesai" if not bad else "langkah gagal: " + ", ".join(bad))
    # sengaja selalu 0: beranda tetap dipublikasikan dan menampilkan langkah yang gagal (K14: gagal harus terlihat, bukan diam)

if __name__ == "__main__":
    main()
