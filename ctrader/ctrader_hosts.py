"""Tes diagnosis: apakah server cTrader mau menerima aplikasi Anda di host DEMO dan host LIVE?
Hanya mengirim Client ID + Secret (auth aplikasi). TIDAK mengirim token akun, tidak menyentuh akun, tidak ada order.
Jalankan:  python3 ctrader/ctrader_hosts.py"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import ctrader_common as C
try:
    import ctrader_net as N
except ImportError as e:
    sys.exit("Pustaka belum terpasang (%s). Jalankan: python3 -m pip install -r ctrader/requirements.txt" % e)
from twisted.internet import reactor, defer
from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAApplicationAuthReq

TIMEOUT = 15


@defer.inlineCallbacks
def try_host(host, env):
    done = defer.Deferred()

    def finish(text):
        if not done.called:
            done.callback(text)

    client = N.make_client(host)

    def on_connected(c):
        r = ProtoOAApplicationAuthReq()
        r.clientId = env["client_id"]
        r.clientSecret = env["client_secret"]
        d = c.send(r)
        d.addCallback(lambda res: N.check(res, "Auth aplikasi"))
        d.addCallbacks(lambda _: finish("DITERIMA  (aplikasi dikenali server)"),
                       lambda f: finish("DITOLAK   " + f.getErrorMessage()))

    client.setConnectedCallback(on_connected)
    client.setDisconnectedCallback(lambda c, reason: None)
    client.setMessageReceivedCallback(lambda c, m: None)
    timer = reactor.callLater(TIMEOUT, finish, "WAKTU HABIS (%d dtk): tidak ada jawaban dari server" % TIMEOUT)
    client.startService()
    result = yield done
    if timer.active():
        timer.cancel()
    try:
        yield client.stopService()
    except Exception:
        pass
    return result


@defer.inlineCallbacks
def main_flow(env):
    for host in ("demo", "live"):
        res = yield try_host(host, env)
        print("host %-5s -> %s" % (host, res))
    print("\nArti: kalau keduanya DITOLAK dengan CANT_ROUTE_REQUEST, masalahnya di sisi server cTrader (pemeliharaan/routing): coba lagi hari kerja.")
    print("Kalau salah satu DITERIMA dan yang lain tidak, kirim hasilnya ke saya.")


def main():
    try:
        env = C.load_env()
    except ValueError as e:
        sys.exit(str(e))
    main_flow(env).addErrback(lambda f: print("GAGAL:", f.getErrorMessage())).addBoth(lambda _: reactor.stop())
    reactor.run()


if __name__ == "__main__":
    main()
