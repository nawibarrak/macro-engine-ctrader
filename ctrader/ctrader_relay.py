"""TAHAP 2 - penghubung (relay). Menjaga sambungan ke cTrader dan menyajikan harga terakhir di http://127.0.0.1:8787/quotes
(dibaca server.ts lewat /api/ctrader/quotes; browser tidak pernah memegang token).
Jalankan di terminal kedua Codespaces:   CTRADER_HOST=live python3 ctrader/ctrader_relay.py
Butuh config/ctrader_symbols.json dari probe. Bila cTrader menolak sementara (CANT_ROUTE_REQUEST dsb), relay mencoba lagi
sendiri dengan sambungan BARU (jeda 10, 20, 30 ... maksimal 120 detik). Salah pengaturan (akun/host) tidak diulang."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import ctrader_common as C
try:
    import ctrader_net as N
except ImportError as e:
    sys.exit("Pustaka belum terpasang (%s). Jalankan: python3 -m pip install -r ctrader/requirements.txt" % e)
from twisted.internet import reactor, defer
from twisted.internet.task import LoopingCall

ENV = None
STATE = None
SYM2ID = {}
MAPPING = {}
GEN = {"id": 0, "tries": 0}   # id = nomor sambungan aktif; sambungan lama otomatis diabaikan
MAX_WAIT = 120


@defer.inlineCallbacks
def on_connected(client):
    C.set_status(STATE, "menyambung", "autentikasi")
    chosen, _ = yield N.authenticate(client, ENV)
    STATE["account"] = chosen["login"]
    symbols = yield N.list_symbols(client, chosen["ctid"])
    ids = {s["name"]: s["id"] for s in symbols}
    SYM2ID.clear()
    SYM2ID.update({ids[n]: k for k, n in MAPPING.items() if n in ids})
    STATE["missing"] = sorted(k for k, n in MAPPING.items() if n not in ids)
    if not SYM2ID:
        raise RuntimeError("Tidak ada simbol di peta yang ditemukan di broker. Jalankan ctrader_probe.py lagi.")
    yield N.subscribe(client, chosen["ctid"], list(SYM2ID))
    C.set_status(STATE, "mengalir", "")
    print("Relay aktif: %d simbol berlangganan%s" % (len(SYM2ID), "; tidak ditemukan: " + ", ".join(STATE["missing"]) if STATE["missing"] else ""))


def start_heartbeat(client):
    def beat():
        try:
            client.send(N.ProtoHeartbeatEvent()).addErrback(lambda f: None)
        except Exception:
            pass   # saat terputus, jangan sampai pengulang detak berhenti
    lc = LoopingCall(beat)
    lc.start(10, now=False)
    return lc


def stop_quietly(client, hb):
    try:
        if hb.running:
            hb.stop()
    except Exception:
        pass
    try:
        d = client.stopService()
        if d is not None:
            d.addErrback(lambda f: None)
    except Exception:
        pass


def start_client():
    GEN["id"] += 1
    me = GEN["id"]
    client = N.make_client(ENV["host"])
    hb = start_heartbeat(client)

    def alive():
        return GEN["id"] == me

    def on_message(c, m):
        if alive():
            ev = N.extract_spot(m)
            if ev:
                C.apply_spot(STATE, SYM2ID, ev)

    def ok(_):
        if alive():
            GEN["tries"] = 0

    def bad(f):
        if not alive():
            return
        msg = f.getErrorMessage()
        C.set_status(STATE, "galat", msg)
        print("GALAT:", msg)
        stop_quietly(client, hb)
        if f.check(ValueError):
            print("Ini salah pengaturan, bukan gangguan sementara. Tidak diulang; perbaiki lalu jalankan ulang.")
            reactor.callLater(0.5, reactor.stop)
            return
        GEN["tries"] += 1
        wait = min(10 * GEN["tries"], MAX_WAIT)
        print("Mencoba sambungan baru dalam %d detik (percobaan ke-%d)" % (wait, GEN["tries"]))
        reactor.callLater(wait, start_client)

    client.setMessageReceivedCallback(on_message)
    client.setConnectedCallback(lambda c: on_connected(c).addCallbacks(ok, bad) if alive() else None)
    client.setDisconnectedCallback(lambda c, reason: C.set_status(STATE, "terputus", "mencoba menyambung ulang") if alive() else None)
    client.startService()


def main():
    global ENV, STATE, MAPPING
    try:
        ENV = C.load_env()
    except ValueError as e:
        sys.exit(str(e))
    MAPPING = C.load_mapping()
    if not MAPPING:
        sys.exit("config/ctrader_symbols.json kosong. Jalankan dulu: python3 ctrader/ctrader_probe.py")
    STATE = C.new_state(ENV["host"], MAPPING)
    C.serve_http(STATE, ENV["port"])
    start_client()
    print("Relay mendengarkan di 127.0.0.1:%d  (host cTrader: %s)" % (ENV["port"], ENV["host"]))
    reactor.run()


if __name__ == "__main__":
    main()
