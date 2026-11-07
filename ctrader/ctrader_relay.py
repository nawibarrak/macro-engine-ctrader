"""TAHAP 2 - penghubung (relay). Menjaga sambungan ke cTrader dan menyajikan harga terakhir di http://127.0.0.1:8787/quotes
(dibaca server.ts lewat /api/ctrader/quotes; browser tidak pernah memegang token).
Jalankan di terminal kedua Codespaces:   python ctrader/ctrader_relay.py     (butuh config/ctrader_symbols.json dari probe)"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import ctrader_common as C
try:
    import ctrader_net as N
except ImportError as e:
    sys.exit("Pustaka belum terpasang (%s). Jalankan: pip install -r ctrader/requirements.txt" % e)
from twisted.internet import reactor, defer

ENV = None
STATE = None
SYM2ID = {}
MAPPING = {}


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


def on_error(f):
    msg = f.getErrorMessage()
    C.set_status(STATE, "galat", msg)
    print("GALAT:", msg)


def main():
    global ENV, STATE, MAPPING
    try:
        ENV = C.load_env()
    except ValueError as e:
        sys.exit(str(e))
    MAPPING = C.load_mapping()
    if not MAPPING:
        sys.exit("config/ctrader_symbols.json kosong. Jalankan dulu: python ctrader/ctrader_probe.py")
    STATE = C.new_state(ENV["host"], MAPPING)
    C.serve_http(STATE, ENV["port"])
    client = N.make_client(ENV["host"])
    client.setMessageReceivedCallback(lambda c, m: (lambda ev: ev and C.apply_spot(STATE, SYM2ID, ev))(N.extract_spot(m)))
    client.setConnectedCallback(lambda c: on_connected(c).addErrback(on_error))
    client.setDisconnectedCallback(lambda c, reason: C.set_status(STATE, "terputus", "mencoba menyambung ulang"))
    N.start_heartbeat(client)
    client.startService()
    print("Relay mendengarkan di 127.0.0.1:%d  (host cTrader: %s)" % (ENV["port"], ENV["host"]))
    reactor.run()


if __name__ == "__main__":
    main()
