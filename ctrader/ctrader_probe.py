"""TAHAP 1 - uji sambungan cTrader. Jalankan SEKALI di Codespaces:   python ctrader/ctrader_probe.py
Yang dibuktikan: kunci + token benar, akun cocok, daftar simbol broker, mana dari 13 instrumen yang tersedia,
dan bid/ask nyata beberapa detik. Hasil: config/ctrader_symbols.json (peta) + cache/ctrader_all_symbols.json."""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import ctrader_common as C
try:
    import ctrader_net as N
except ImportError as e:
    sys.exit("Pustaka belum terpasang (%s). Jalankan: pip install -r ctrader/requirements.txt" % e)
from twisted.internet import reactor, defer

SAMPLE_SEC = 10
LIVENESS_NAMES = ("BTCUSD", "ETHUSD")   # kripto 24/7: bukti hidup yang tidak bergantung jam pasar forex
TICKS = {}
ENV = None
STATE = None
SYM2ID = {}


def on_message(client, message):
    ev = N.extract_spot(message)
    if ev and STATE and C.apply_spot(STATE, SYM2ID, ev):
        k = SYM2ID[ev["symbolId"]]
        TICKS[k] = TICKS.get(k, 0) + 1


@defer.inlineCallbacks
def flow(client):
    global STATE
    chosen, accounts = yield N.authenticate(client, ENV)
    print("OK  tersambung. Akun: login=%s ctid=%s (%s)" % (chosen["login"], chosen["ctid"], "LIVE" if chosen["live"] else "DEMO"))
    symbols = yield N.list_symbols(client, chosen["ctid"])
    print("OK  broker mengirim %d simbol" % len(symbols))
    os.makedirs(C.CACHE_DIR, exist_ok=True)
    json.dump(symbols, open(os.path.join(C.CACHE_DIR, "ctrader_all_symbols.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    m = C.match_symbols(symbols)
    print("\n%-8s %-9s %s" % ("ID", "STATUS", "SIMBOL BROKER / KANDIDAT"))
    for k, v in m.items():
        print("%-8s %-9s %s" % (k, v["status"], v["symbol"] or ", ".join(v["candidates"]) or "-"))
    raw = C.save_mapping({k: v["symbol"] for k, v in m.items()})
    mapping = C.load_mapping()
    print("\nPeta tersimpan di config/ctrader_symbols.json (%d instrumen terisi)." % len(mapping))
    ids = {s["name"]: s["id"] for s in symbols}
    use = {k: n for k, n in mapping.items() if n in ids}
    for n in LIVENESS_NAMES:   # hanya untuk uji ini; tidak disimpan ke peta
        if n in ids and n not in use.values():
            use["UJI_" + n] = n
    if not use:
        return
    STATE = C.new_state(ENV["host"], use)
    SYM2ID.update({ids[n]: k for k, n in use.items()})
    yield N.subscribe(client, chosen["ctid"], list(SYM2ID))
    print("\nMengambil harga %d detik..." % SAMPLE_SEC)
    d = defer.Deferred(); reactor.callLater(SAMPLE_SEC, d.callback, None); yield d
    snap = C.build_snapshot(STATE)
    print("%-12s %-10s %-14s %-14s %-6s %s" % ("ID", "SIMBOL", "BID", "ASK", "TICK", "WAKTU UTC"))
    for k, q in snap["quotes"].items():
        print("%-12s %-10s %-14s %-14s %-6s %s" % (k, q["symbol"], q["bid"], q["ask"], TICKS.get(k, 0), q["observed_utc"] or "(belum ada tick)"))
    live = C.liveness_verdict(snap, TICKS)
    if live:
        print("\nLULUS: harga mengalir nyata (%s). Sambungan cTrader terbukti hidup." % ", ".join(live))
    else:
        print("\nBELUM TERBUKTI: tidak ada simbol dengan lebih dari 1 tick segar dalam %d detik." % SAMPLE_SEC)
        print("Jika BTCUSD/ETHUSD tidak ada di tabel, atau 'belum ada tick', kirim seluruh output ini ke saya.")
    print("Catatan: forex/indeks/emas di akhir pekan hanya mengirim harga penutupan (1 tick); itu wajar.")


def fail(f):
    print("GAGAL:", f.getErrorMessage())


def main():
    global ENV
    try:
        ENV = C.load_env()
    except ValueError as e:
        sys.exit(str(e))
    client = N.make_client(ENV["host"])
    client.setMessageReceivedCallback(on_message)
    client.setConnectedCallback(lambda c: flow(c).addErrback(fail).addBoth(lambda _: reactor.stop()))
    client.setDisconnectedCallback(lambda c, reason: None)
    reactor.callLater(60, lambda: (print("GAGAL: waktu habis (60 dtk), tidak ada respons dari cTrader"), reactor.stop()))
    client.startService()
    reactor.run()


if __name__ == "__main__":
    main()
