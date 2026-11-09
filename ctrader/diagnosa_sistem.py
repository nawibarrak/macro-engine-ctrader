#!/usr/bin/env python3
"""Telusuri + perbaiki sistem di Codespaces. Tidak pernah mencetak nilai rahasia (hanya nama variabel dan panjang nilai).
  python3 ctrader/diagnosa_sistem.py               -> telusuri (hanya membaca); laporan juga ditulis ke cache/diagnosa.txt
  python3 ctrader/diagnosa_sistem.py --perbaiki    -> terapkan perbaikan aman dulu (cadangan di cache/backup/), lalu telusuri
  python3 ctrader/diagnosa_sistem.py --pantau 10   -> uji sambungan cTrader tiap 30 dtk selama 10 menit; catatan di cache/pantau.log"""
import os, re, sys, json, time, shutil, subprocess, urllib.request
from collections import Counter
from datetime import datetime, timezone
from importlib import metadata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
CACHE = os.path.join(ROOT, "cache")
BACKUP = os.path.join(CACHE, "backup")
SAFE_VALUE = {"CTRADER_HOST", "CTRADER_RELAY_PORT", "CTRADER_VIX_SYMBOL", "PORT"}   # nilai non-rahasia: boleh dicetak
SKIP_DIRS = {".git", ".venv", "venv", "node_modules", "cache", "dist", "__pycache__"}
EXTS = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".yml", ".yaml", ".example", ".sh", ".toml", ".txt", ".html"}
GLUE = re.compile(r"CTRADER_(?:HOST|RELAY_PORT|CLIENT_ID|CLIENT_SECRET|ACCESS_TOKEN|ACCOUNT_ID)=")
KEYRE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=")
ROUTE = """
// API Route: harga cTrader dari relay lokal (ctrader/ctrader_relay.py). Token tidak pernah sampai ke browser.
app.get('/api/ctrader/quotes', async (_req, res) => {
  try {
    const port = process.env.CTRADER_RELAY_PORT || '8787';
    const r = await fetch(`http://127.0.0.1:${port}/quotes`, { signal: AbortSignal.timeout(3000) });
    res.status(r.status).json(await r.json());
  } catch {
    res.status(503).json({ status: 'relay_mati', message: 'Relay cTrader tidak berjalan. Jalankan: python3 ctrader/ctrader_relay.py' });
  }
});
"""
OUT = []


def say(s=""):
    OUT.append(str(s))
    print(s)


def redact(s):
    return re.sub(r"[A-Za-z0-9_\-\.]{32,}", "<disembunyikan>", s)


def sh(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=10, cwd=ROOT).stdout
    except Exception:
        return ""


def rd(path):
    try:
        return open(os.path.join(ROOT, path), encoding="utf-8", errors="replace").read()
    except OSError:
        return None


def backup(path):
    os.makedirs(BACKUP, exist_ok=True)
    dst = os.path.join(BACKUP, os.path.basename(path).lstrip(".") + "." + datetime.now().strftime("%Y%m%d-%H%M%S") + ".bak")
    shutil.copy2(os.path.join(ROOT, path), dst)
    return os.path.relpath(dst, ROOT)


def utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ------------------------------------------------------------------ .env
def split_glued(line):
    if line.lstrip().startswith("#"):
        return [line]
    cuts = [m.start() for m in GLUE.finditer(line) if m.start() > 0]
    if not cuts:
        return [line]
    pts = [0] + cuts + [len(line)]
    return [line[pts[i]:pts[i + 1]] for i in range(len(pts) - 1)]


def env_lines():
    raw = rd(".env")
    return None if raw is None else raw


def fix_env():
    raw = env_lines()
    if raw is None:
        say("  .env: tidak ada, tidak ada yang diperbaiki")
        return
    parts = []
    for ln in raw.replace("\r\n", "\n").split("\n"):
        parts += split_glued(ln)
    last = {}
    for i, ln in enumerate(parts):
        m = KEYRE.match(ln)
        if m:
            last[m.group(1)] = i
    new, dropped = [], []
    for i, ln in enumerate(parts):
        m = KEYRE.match(ln)
        if m and last[m.group(1)] != i:
            dropped.append(m.group(1))
            continue
        new.append(ln)
    while new and new[-1] == "":
        new.pop()
    text = "\n".join(new) + "\n"
    if text == raw:
        say("  .env: sudah bersih, tidak ada perubahan")
        return
    say("  .env: cadangan -> " + backup(".env"))
    open(os.path.join(ROOT, ".env"), "w", encoding="utf-8").write(text)
    glued = sum(1 for ln in raw.split("\n") if len(split_glued(ln)) > 1)
    say("  .env: diperbaiki (baris tertempel dipisah: %d; duplikat lama dibuang: %s%s)" % (glued, ", ".join(dropped) or "tidak ada", "; baris baru ditambahkan di akhir" if not raw.endswith("\n") else ""))


def scan_env():
    say("-- .env dan variabel lingkungan")
    raw = env_lines()
    if raw is None:
        say("  .env: tidak ada")
    else:
        keys = Counter()
        for ln in raw.replace("\r\n", "\n").split("\n"):
            if ln.strip() and not ln.lstrip().startswith("#"):
                for p in split_glued(ln):
                    m = KEYRE.match(p)
                    if m:
                        keys[m.group(1)] += 1
                if len(split_glued(ln)) > 1:
                    say("  ! baris tertempel: %s" % " + ".join((KEYRE.match(p).group(1) if KEYRE.match(p) else "?") for p in split_glued(ln)))
        if raw and not raw.endswith("\n"):
            say("  ! akhir berkas tanpa baris baru (penyebab baris berikutnya menempel)")
        if "\r\n" in raw:
            say("  ! berkas memakai CRLF")
        say("  nama di .env: " + ", ".join("%s%s" % (k, " (x%d DUPLIKAT)" % v if v > 1 else "") for k, v in sorted(keys.items())))
        vals = {}
        for ln in raw.replace("\r\n", "\n").split("\n"):
            for p in split_glued(ln):
                m = KEYRE.match(p)
                if m and m.group(1) in SAFE_VALUE:
                    vals[m.group(1)] = p.split("=", 1)[1]
        for k in sorted(vals):
            say("  %s (di .env, entri terakhir) = %s" % (k, vals[k]))
    names = ["CTRADER_CLIENT_ID", "CTRADER_CLIENT_SECRET", "CTRADER_ACCESS_TOKEN", "CTRADER_ACCOUNT_ID", "CTRADER_HOST", "CTRADER_RELAY_PORT"]
    say("  variabel lingkungan: " + "; ".join("%s=%s" % (n, ("terisi, %d karakter" % len(os.environ[n])) if n not in SAFE_VALUE and os.environ.get(n) else (os.environ[n] if os.environ.get(n) else "KOSONG")) for n in names))
    say("  catatan: variabel lingkungan MENGALAHKAN .env (dotenv tidak menimpa)")


# ------------------------------------------------------------------ server.ts
def fix_server():
    t = rd("server.ts")
    if t is None:
        say("  server.ts: tidak ada")
        return
    if "/api/ctrader/quotes" in t:
        say("  server.ts: route /api/ctrader/quotes sudah ada")
        return
    anchor = "// Mount Vite"
    if t.count(anchor) != 1 or not re.search(r"\bconst app\s*=\s*express\(\)", t):
        say("  server.ts: route belum ada, tetapi bentuk berkas berbeda; TIDAK diubah otomatis (kirim server.ts ke saya)")
        return
    say("  server.ts: cadangan -> " + backup("server.ts"))
    i = t.index(anchor)
    i = t.rfind("\n", 0, i) + 1
    open(os.path.join(ROOT, "server.ts"), "w", encoding="utf-8").write(t[:i] + ROUTE.lstrip("\n") + "\n" + t[i:])
    say("  server.ts: route /api/ctrader/quotes ditambahkan sebelum '// Mount Vite'")


def apply_fixes():
    say("== PERBAIKAN ==")
    fix_env()
    fix_server()
    gi = rd(".gitignore") or ""
    for need in ("cache/", ".env"):
        if need not in gi:
            say("  ! .gitignore tidak memuat '%s' (rahasia/cache bisa ikut ter-commit): tambahkan manual" % need)
    say()


# ------------------------------------------------------------------ telusur
def scan_repo():
    say("-- repo, git, berkas")
    say("  folder: " + ROOT)
    say("  git cabang: %s, commit: %s" % (sh(["git", "rev-parse", "--abbrev-ref", "HEAD"]).strip() or "?", sh(["git", "rev-parse", "--short", "HEAD"]).strip() or "?"))
    st = [redact(x) for x in sh(["git", "status", "--short"]).splitlines()]
    say("  berkas berubah (belum commit): %d%s" % (len(st), "" if not st else " -> " + "; ".join(st[:12])))
    for f in ("ctrader/ctrader_common.py", "ctrader/ctrader_net.py", "ctrader/ctrader_probe.py", "ctrader/ctrader_relay.py", "ctrader/ctrader_hosts.py", "config/ctrader_symbols.json", "server.ts", "vite.config.ts"):
        say("  %-30s %s" % (f, "ada" if rd(f) is not None else "TIDAK ADA"))
    r = rd("ctrader/ctrader_relay.py")
    if r:
        say("  relay: " + ("versi dengan coba-ulang otomatis" if "MAX_WAIT" in r else "versi LAMA (tanpa coba-ulang)"))
    s = rd("server.ts") or ""
    m = re.search(r"const PORT\s*=\s*([^;]+);", s)
    say("  server.ts: PORT=%s; route cTrader: %s" % (m.group(1).strip() if m else "?", "ada" if "/api/ctrader/quotes" in s else "BELUM ADA"))
    v = re.search(r"port:\s*(\d+)", rd("vite.config.ts") or "")
    say("  vite.config.ts: port=%s" % (v.group(1) if v else "?"))
    mp = rd("config/ctrader_symbols.json")
    if mp:
        d = {k: v for k, v in json.loads(mp).items() if not k.startswith("_")}
        say("  peta simbol: terisi %d dari %d; kosong: %s" % (sum(1 for x in d.values() if x), len(d), ", ".join(k for k, x in d.items() if not x) or "-"))
        say("  isi: " + ", ".join("%s=%s" % (k, x) for k, x in d.items() if x))


def scan_code():
    say("-- rujukan cTrader di seluruh kode (nama variabel saja)")
    files, panel = {}, []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            p = os.path.join(dp, f)
            if f == "diagnosa_sistem.py" or (os.path.splitext(f)[1] not in EXTS and f != ".env.example"):
                continue
            try:
                if os.path.getsize(p) > 1_000_000:
                    continue
                t = open(p, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            rel = os.path.relpath(p, ROOT)
            vars_ = sorted(set(re.findall(r"CTRADER_[A-Z0-9_]+", t)))
            n = len(re.findall(r"ctrader", t, re.I))
            if n:
                files[rel] = (n, vars_)
            if "Source Compare" in t or "Selisih (cTrader" in t or "SourceCompare" in t:
                panel.append(rel)
    for rel, (n, v) in sorted(files.items())[:60]:
        say("  %-45s %3d sebutan  %s" % (rel, n, ", ".join(v)))
    say("  file panel Source Compare: " + (", ".join(panel) if panel else "TIDAK DITEMUKAN di repo ini"))


def scan_runtime():
    say("-- port, proses, pustaka, relay")
    out = sh(["ss", "-ltnp"]) or sh(["lsof", "-i", "-P", "-n", "-sTCP:LISTEN"])
    rows = [redact(x.strip()) for x in out.splitlines() if re.search(r":(3000|3001|3002|4173|8787)\b", x)]
    say("  port 3000-3002/4173/8787 yang dipakai: " + ("tidak ada" if not rows else ""))
    for x in rows:
        say("    " + x[:150])
    ps = [redact(x.strip()) for x in sh(["ps", "-eo", "pid,etimes,args"]).splitlines() if re.search(r"ctrader|tsx|vite|server\.ts", x) and "diagnosa_sistem" not in x and " grep " not in x]
    say("  proses terkait: " + ("tidak ada" if not ps else ""))
    for x in ps:
        say("    " + x[:150])
    say("  python %s (%s)" % (sys.version.split()[0], "venv aktif" if sys.prefix != getattr(sys, "base_prefix", sys.prefix) else "TANPA venv"))
    for pkg in ("ctrader-open-api", "twisted", "protobuf", "python-dotenv"):
        try:
            say("  %-16s %s" % (pkg, metadata.version(pkg)))
        except Exception:
            say("  %-16s TIDAK TERPASANG" % pkg)
    port = os.environ.get("CTRADER_RELAY_PORT", "8787")
    try:
        q = json.load(urllib.request.urlopen("http://127.0.0.1:%s/quotes" % port, timeout=3))
        qs = q.get("quotes", {})
        say("  relay HIDUP: status=%s host=%s pesan=%s; kuotasi %d, ber-bid %d, segar %d" % (q.get("status"), q.get("host"), redact(str(q.get("message") or "-")), len(qs), sum(1 for x in qs.values() if x.get("bid") is not None), sum(1 for x in qs.values() if not x.get("stale"))))
    except Exception:
        say("  relay: tidak menjawab di 127.0.0.1:%s (belum dijalankan atau sudah berhenti)" % port)


def report():
    say("== TELUSUR %s ==" % utc())
    scan_repo()
    scan_env()
    scan_code()
    scan_runtime()
    os.makedirs(CACHE, exist_ok=True)
    open(os.path.join(CACHE, "diagnosa.txt"), "w", encoding="utf-8").write("\n".join(OUT) + "\n")
    say("\nLaporan juga tersimpan di cache/diagnosa.txt (tanpa nilai rahasia). Tempel seluruh keluaran ini ke chat.")


# ------------------------------------------------------------------ pantau cTrader
def pantau(minutes, jeda=30):
    sys.path.insert(0, HERE)
    try:
        import ctrader_common as C
        import ctrader_net as N
        from twisted.internet import reactor, defer
    except ImportError as e:
        sys.exit("Pustaka belum terpasang (%s). Aktifkan venv lalu: python3 -m pip install -r ctrader/requirements.txt" % e)
    try:
        env = C.load_env()
    except ValueError as e:
        sys.exit(str(e))
    os.makedirs(CACHE, exist_ok=True)
    logp = os.path.join(CACHE, "pantau.log")
    hasil = []

    @defer.inlineCallbacks
    def satu():
        done = defer.Deferred()

        def finish(t):
            if not done.called:
                done.callback(t)
        client = N.make_client(env["host"])

        def on_conn(c):
            N.authenticate(c, env).addCallbacks(lambda r: finish("OK  masuk akun berhasil"), lambda f: finish("GAGAL " + redact(f.getErrorMessage())))
        client.setConnectedCallback(on_conn)
        client.setDisconnectedCallback(lambda c, r: None)
        client.setMessageReceivedCallback(lambda c, m: None)
        timer = reactor.callLater(25, finish, "GAGAL waktu habis (25 dtk)")
        t0 = time.time()
        client.startService()
        res = yield done
        if timer.active():
            timer.cancel()
        try:
            d = client.stopService()
            if d is not None:
                d.addErrback(lambda f: None)
        except Exception:
            pass
        return res, time.time() - t0

    @defer.inlineCallbacks
    def loop():
        end, n = time.time() + minutes * 60, 0
        print("Memantau host=%s selama %s menit, jeda %d dtk. Log: cache/pantau.log\n" % (env["host"], minutes, jeda))
        while time.time() < end:
            n += 1
            res, dt = yield satu()
            line = "%s | #%d | %4.1fs | %s" % (utc(), n, dt, res)
            print(line)
            open(logp, "a", encoding="utf-8").write(line + "\n")
            hasil.append(res)
            if time.time() + jeda >= end:
                break
            d = defer.Deferred()
            reactor.callLater(jeda, d.callback, None)
            yield d
        ok = sum(1 for x in hasil if x.startswith("OK"))
        print("\nRINGKASAN: %d percobaan, berhasil %d, gagal %d" % (len(hasil), ok, len(hasil) - ok))
        print("Pola (. = berhasil, x = gagal): " + "".join("." if x.startswith("OK") else "x" for x in hasil))
        for msg, c in Counter(x for x in hasil if not x.startswith("OK")).most_common():
            print("  %3dx  %s" % (c, msg))

    loop().addErrback(lambda f: print("GAGAL:", f.getErrorMessage())).addBoth(lambda _: reactor.stop() if reactor.running else None)
    reactor.run()


def main():
    a = sys.argv[1:]
    if "--pantau" in a:
        i = a.index("--pantau")
        try:
            mnt = float(a[i + 1])
        except (IndexError, ValueError):
            sys.exit("Pakai: python3 ctrader/diagnosa_sistem.py --pantau 10   (angka = menit)")
        jd = 30
        if "--jeda" in a:
            jd = int(a[a.index("--jeda") + 1])
        return pantau(mnt, jd)
    if "--perbaiki" in a:
        apply_fixes()
    report()


if __name__ == "__main__":
    main()
