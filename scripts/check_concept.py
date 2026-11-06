"""Pemeriksa kepatuhan terhadap docs/KONSEP.md. Menegakkan invarian yang bisa diperiksa mesin (bertanda [uji]).
Pakai: python scripts/check_concept.py [--strict]   (--strict: keluar dengan kode 1 bila ada pelanggaran)
Hasil juga ditulis ke data/concept_check.json dan ditampilkan di beranda. Sesi pengembangan WAJIB menjalankannya
dengan --strict sebelum menyerahkan pekerjaan."""
import os, re, sys, json, datetime as dt
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from registry import REGISTRY, FREQ, BY_ID

viol, notes = [], []
def V(rule, msg): viol.append(dict(rule=rule, msg=msg))
def N(rule, msg): notes.append(dict(rule=rule, msg=msg))
def rd(p):
    try: return open(os.path.join(ROOT, p), encoding="utf-8").read()
    except Exception: return None

SKIP = {".git", "__pycache__", "series", "site"}
VIEW = ["src/App.tsx", "src/components/DeskView.tsx", "src/components/OtakPanel.tsx"]
INDEX = "\n".join(rd(f) or "" for f in VIEW)           # tampilan beranda (React)
LANJ = "src/components/LanjutanView.tsx"
LEGACY = {"docs/KONSEP.md", "docs/PROGRESS.md", "scripts/check_concept.py"}   # menyebut Kaggle/Colab hanya sebagai catatan keputusan atau pola pemeriksa

# K1: tiap panel berlabel tiga lapis
for m in re.finditer(r'<section className="p" id="([^"]+)">(.*?)</section>', INDEX, re.S):
    sid, body = m.group(1), m.group(2)
    if sid == "status": continue
    if not re.search(r'className="tag t-[mid]">(TERUKUR|DISIMPULKAN|DIPUTUSKAN)<', body): V("K1", f"panel #{sid} tidak punya label TERUKUR/DISIMPULKAN/DIPUTUSKAN")

# K2: beranda hanya-baca
for t in re.findall(r'<(input|textarea|select)\b', INDEX): V("K2", f"index.html memuat elemen input <{t}>; input manual hanya boleh di lanjutan.html")

# K3: setiap id yang dipakai beranda ada di registry dan registry lengkap
used = set()
for const in ("CARDS", "HEAT", "MAC", "POL"):
    m = re.search(r"const " + const + r"\b[^=]*=\s*\[(.*?)\n\];", INDEX, re.S)
    ids_ = set(re.findall(r"\[\s*'([A-Z][A-Z0-9_]+)'\s*,\s*'", m.group(1))) | set(re.findall(r"\bid:\s*'([A-Z][A-Z0-9_]+)'", m.group(1))) if m else set()
    if len(ids_) < 4: V("K3", f"daftar {const} di index.html tidak terbaca ({len(ids_)} id): pola kode berubah? perbarui check_concept.py")
    used |= ids_
for blk in re.findall(r"const PAIRS=\[(.*?)\];", INDEX, re.S): used |= set(re.findall(r"'([A-Z][A-Z0-9_]+)'", blk))
used |= set(re.findall(r"\b(COT_[A-Z]+):", INDEX))
used |= set(re.findall(r"\b(?:S|last|derive|at|chgOver|ser)\('([A-Z][A-Z0-9_]+)'", INDEX))
for i in sorted(used):
    if i not in BY_ID: V("K3", f"beranda memakai seri '{i}' yang tidak ada di registry.py")
if len(used) < 20: V("K3", f"hanya {len(used)} id seri terdeteksi di index.html: pola kode berubah? perbarui check_concept.py")
for s in REGISTRY:
    p = s["id"]
    if not s["label"]: V("K3", f"{p}: label kosong")
    if s["freq"] not in FREQ: V("K3", f"{p}: frekuensi '{s['freq']}' tidak dikenal")
    if not s["prov"]: V("K3", f"{p}: tidak punya sumber")
    if s["group"] != "Posisi" and (s["lo"] is None or s["hi"] is None): V("K3", f"{p}: batas wajar belum diisi")
ids = [s["id"] for s in REGISTRY]
if len(ids) != len(set(ids)): V("K3", "ada id ganda di registry")

# K4: tanpa Kaggle/Colab di jalur utama
for root, _, files in os.walk(ROOT):
    if SKIP & set(os.path.relpath(root, ROOT).split(os.sep)): continue
    for f in files:
        rel = os.path.relpath(os.path.join(root, f), ROOT)
        if not rel.endswith((".py", ".yml", ".html", ".txt", ".md")): continue
        t = rd(rel) or ""
        if re.search(r"kaggle|colab", t, re.I):
            (N if rel in LEGACY else V)("K4", f"{rel} menyebut Kaggle/Colab" + (" (catatan dokumentasi, bukan kode)" if rel in LEGACY else ""))

# K5: tanpa singkatan sebagai label metrik makro
for pat in (r">\s*[GIPLR]\s*<", r"\bG\s*[×x]\s*I\b", r"['\"]\s*[GI]\s*['\"]\s*,\s*['\"](?:Pertumbuhan|Inflasi)"):
    for m in re.finditer(pat, INDEX): V("K5", f"singkatan sebagai label di index.html: '{m.group(0).strip()[:30]}'")

# K9: proksi harus berlabel
for pid in ("BOE", "BOJ", "BOC", "RBA", "SNB", "STABLE"):
    if pid in BY_ID and "proksi" not in BY_ID[pid]["label"].lower(): V("K9", f"{pid}: label tidak memuat kata 'proksi'")

# K11: tidak ada kunci di repo
for rel in [os.path.relpath(os.path.join(r, f), ROOT) for r, _, fs in os.walk(ROOT) for f in fs
            if f.endswith((".py", ".html", ".yml", ".md", ".txt", ".json", ".csv")) and not (SKIP & set(os.path.relpath(r, ROOT).split(os.sep)))]:
    t = rd(rel) or ""
    if rel.startswith("data/") and rel not in ("data/consensus.csv",): continue
    for m in re.finditer(r"(?i)(api[_-]?key|token|secret)\s*[=:]\s*['\"]?([0-9a-zA-Z]{24,})", t):
        if "secrets." not in t[max(0, m.start() - 12):m.end()]: V("K11", f"{rel}: kemungkinan kunci tertanam ({m.group(1)})")

# K12: dokumen sinkron dengan kode
prog = rd("docs/PROGRESS.md"); kon = rd("docs/KONSEP.md")
if not kon: V("K12", "docs/KONSEP.md hilang")
elif "## Log keputusan" not in kon or len(re.findall(r"^- 20\d\d-\d\d-\d\d", kon, re.M)) < 1: V("K12", "Log keputusan di KONSEP.md kosong")
if not prog: V("K12", "docs/PROGRESS.md hilang")
else:
    m = re.search(r"Jumlah seri registry:\s*(\d+)", prog)
    if not m: V("K12", "PROGRESS.md tidak memuat baris 'Jumlah seri registry: N'")
    elif int(m.group(1)) != len(REGISTRY): V("K12", f"PROGRESS.md menulis {m.group(1)} seri, registry punya {len(REGISTRY)}: perbarui dokumen")
    # K7: tahap 3 dimulai -> config/thresholds.json wajib ada
    r3 = re.search(r"\|\s*3 Otak[^|]*\|\s*([^|]+)\|", prog)
    if r3 and "belum dimulai" not in r3.group(1).lower() and not os.path.exists(os.path.join(ROOT, "config", "thresholds.json")):
        V("K7", "tahap 3 sudah dimulai tetapi config/thresholds.json belum ada (semua ambang harus di sana)")

# alur kerja: memanggil pipeline dan menyalin semua halaman
wf = rd(".github/workflows/feed.yml") or ""
if "scripts/pipeline.py" not in wf: V("PIPE", "feed.yml tidak memanggil scripts/pipeline.py")
if "vite build" not in wf or "dist" not in wf: V("PIPE", "feed.yml tidak membangun tampilan (vite build) dan menyalin dist ke situs")
for need in ("index.html", LANJ, "src/main.tsx"):
    if not os.path.exists(os.path.join(ROOT, need)): V("PIPE", f"{need} hilang")

# UNUSED (K16): tidak ada berkas skrip yang tidak dipakai
import glob
pipe_src = rd("scripts/pipeline.py") or ""
all_py = {os.path.basename(f)[:-3]: rd(os.path.relpath(f, ROOT)) or "" for f in glob.glob(os.path.join(ROOT, "scripts", "*.py"))}
for name in sorted(all_py):
    if name == "pipeline": continue
    used_by_pipe = f"scripts/{name}.py" in pipe_src
    imported = any(re.search(rf"^\s*(import|from)\s+[^\n]*\b{name}\b", src, re.M) for n2, src in all_py.items() if n2 != name)
    if not (used_by_pipe or imported): V("UNUSED", f"scripts/{name}.py tidak dipanggil pipeline.py dan tidak diimpor skrip lain: hapus")
for f in glob.glob(os.path.join(ROOT, "requirements*.txt")):
    if os.path.basename(f) != "requirements.txt": V("UNUSED", f"{os.path.basename(f)} tidak dipakai workflow: hapus")

# GATE (K8): gerbang per aset terdaftar lengkap dan dipakai
try: gcfg = json.loads(rd("config/gates.json") or "")
except Exception: gcfg = None
if not gcfg: V("GATE", "config/gates.json hilang atau rusak")
else:
    listed = set(gcfg.get("umum", [])) | {i for v in gcfg.get("aset", {}).values() for i in v}
    for i in sorted(listed):
        if i not in BY_ID: V("GATE", f"config/gates.json memuat seri '{i}' yang tidak ada di registry")
    for s in REGISTRY:
        if s["crit"] and s["id"] not in listed: V("GATE", f"seri kunci {s['id']} tidak terdaftar di config/gates.json (umum atau aset)")
    for a in ("XAUUSD", "WTI", "SPX", "USDJPY", "EURUSD"):
        if a not in gcfg.get("aset", {}): V("GATE", f"aset prioritas {a} tidak punya gerbang di config/gates.json")
    if "scripts/gates.py" not in (rd("scripts/pipeline.py") or ""): V("GATE", "pipeline.py tidak menjalankan scripts/gates.py")
    if "data/gates.json" not in INDEX: V("GATE", "index.html tidak membaca data/gates.json")

# PHASE dan OTAK (tahap 3): ambang di config, masukan ada di registry, dipakai pipeline dan beranda
try: tcfg = json.loads(rd("config/thresholds.json") or "")
except Exception: tcfg = None
def strip_doc(src): return re.sub(r'"""(.*?)"""', "", src, flags=re.S)
if not tcfg: V("PHASE", "config/thresholds.json hilang atau rusak")
else:
    f = tcfg.get("fase", {}); q = f.get("persentil", {})
    for k, v in f.get("masukan", {}).items():
        if v.get("seri") not in BY_ID: V("PHASE", f"masukan fase '{k}' memakai seri {v.get('seri')} yang tidak ada di registry")
    try:
        if not (0 < q["naik"] < q["ekstrem"] < q["sangat_ekstrem"] < 100): V("PHASE", "persentil harus naik < ekstrem < sangat_ekstrem di dalam (0,100)")
        if f["min_obs"] < 100 or f["jendela_obs"] < f["min_obs"]: V("PHASE", "min_obs minimal 100 dan jendela_obs >= min_obs")
    except KeyError as e: V("PHASE", f"config fase tidak lengkap: {e}")
    if "scripts/phase.py" not in pipe_src: V("PHASE", "pipeline.py tidak menjalankan scripts/phase.py")
    if "data/phase.json" not in INDEX: V("PHASE", "index.html tidak membaca data/phase.json")
    ph = strip_doc(rd("scripts/phase.py") or "")
    if "thresholds.json" not in ph: V("PHASE", "phase.py tidak membaca config/thresholds.json")
    if re.search(r"\b(75|90|97)\b", ph): V("PHASE", "phase.py memuat angka persentil 75/90/97: harus dari config (K7)")
    o = tcfg.get("otak", {})
    for b in ("kejutan", "kondisi", "fed", "faktor", "aset", "skor", "keyakinan", "aliran", "cot", "tautan"):
        if b not in o: V("OTAK", f"blok otak.{b} tidak ada di config/thresholds.json")
    ids = set(o.get("aliran", {}).get("kelas", {}).values()) | {a.get("cot") for a in o.get("aset", {}).values()} | {a.get("aliran", {}).get("seri") for a in o.get("aset", {}).values()} \
        | {x for t in o.get("tautan", {}).get("daftar", []) for x in (t["dari"], t["ke"])}
    for i in sorted(ids):
        if i not in BY_ID: V("OTAK", f"otak memakai seri {i} yang tidak ada di registry")
    if "scripts/otak.py" not in pipe_src: V("OTAK", "pipeline.py tidak menjalankan scripts/otak.py")
    if "data/otak.json" not in INDEX: V("OTAK", "index.html tidak membaca data/otak.json")
    if "thresholds.json" not in (rd("scripts/otak.py") or ""): V("OTAK", "otak.py tidak membaca config/thresholds.json")

out = dict(generated=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), violations=viol, notes=notes, series=len(REGISTRY))
os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, "data", "concept_check.json"), "w"), indent=1, ensure_ascii=False)
print(f"check_concept: {len(viol)} pelanggaran, {len(notes)} catatan")
for v in viol: print("  PELANGGARAN", v["rule"], v["msg"])
for n in notes: print("  catatan    ", n["rule"], n["msg"])
if "--strict" in sys.argv and viol: sys.exit(1)
