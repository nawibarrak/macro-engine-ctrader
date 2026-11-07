"""Lapisan jaringan cTrader (Twisted + ctrader-open-api). Hanya BACA: auth, daftar akun, daftar simbol, langganan harga.
Dipakai oleh ctrader_probe.py dan ctrader_relay.py. Pasang: pip install -r ctrader/requirements.txt"""
import ctrader_common  # noqa: F401  (mengatur mode protobuf sebelum pesan cTrader dimuat)
from twisted.internet import defer
from twisted.internet.task import LoopingCall
from ctrader_open_api import Client, Protobuf, TcpProtocol, EndPoints
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAApplicationAuthReq, ProtoOAGetAccountListByAccessTokenReq, ProtoOAAccountAuthReq,
    ProtoOASymbolsListReq, ProtoOASubscribeSpotsReq)
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoHeartbeatEvent
from ctrader_common import pick_account


def make_client(host):
    h = EndPoints.PROTOBUF_LIVE_HOST if host == "live" else EndPoints.PROTOBUF_DEMO_HOST
    return Client(h, EndPoints.PROTOBUF_PORT, TcpProtocol)


def unwrap(msg):
    try:
        return Protobuf.extract(msg)
    except Exception:
        return msg


def check(res, what):
    res = unwrap(res)
    if type(res).__name__.endswith("ErrorRes"):
        raise RuntimeError("%s ditolak cTrader: %s - %s" % (what, getattr(res, "errorCode", "?"), getattr(res, "description", "")))
    return res


@defer.inlineCallbacks
def authenticate(client, env):
    """Urutan resmi: auth aplikasi -> daftar akun dari token -> auth akun. Mengembalikan (ctid, semua_akun)."""
    r = ProtoOAApplicationAuthReq(); r.clientId = env["client_id"]; r.clientSecret = env["client_secret"]
    check((yield client.send(r)), "Auth aplikasi")
    r = ProtoOAGetAccountListByAccessTokenReq(); r.accessToken = env["access_token"]
    res = check((yield client.send(r)), "Daftar akun")
    accounts = [dict(ctid=a.ctidTraderAccountId, login=a.traderLogin, live=a.isLive) for a in res.ctidTraderAccount]
    chosen = pick_account(accounts, env["account_id"], env["host"])
    r = ProtoOAAccountAuthReq(); r.ctidTraderAccountId = chosen["ctid"]; r.accessToken = env["access_token"]
    check((yield client.send(r)), "Auth akun")
    return chosen, accounts


@defer.inlineCallbacks
def list_symbols(client, ctid):
    r = ProtoOASymbolsListReq(); r.ctidTraderAccountId = ctid
    res = check((yield client.send(r)), "Daftar simbol")
    return [dict(id=s.symbolId, name=s.symbolName, desc=getattr(s, "description", "")) for s in res.symbol]


@defer.inlineCallbacks
def subscribe(client, ctid, symbol_ids):
    r = ProtoOASubscribeSpotsReq(); r.ctidTraderAccountId = ctid
    r.symbolId.extend(symbol_ids); r.subscribeToSpotTimestamp = True
    check((yield client.send(r)), "Langganan harga")


def spot_event_to_dict(ev):
    d = dict(symbolId=ev.symbolId)
    for f in ("bid", "ask", "timestamp"):
        try:
            d[f] = getattr(ev, f) if ev.HasField(f) else None
        except ValueError:
            d[f] = getattr(ev, f, None)
    return d


def extract_spot(message):
    """Kembalikan dict kuotasi bila pesan adalah ProtoOASpotEvent, selain itu None."""
    m = unwrap(message)
    return spot_event_to_dict(m) if type(m).__name__ == "ProtoOASpotEvent" else None


def start_heartbeat(client, every=10):
    lc = LoopingCall(lambda: client.send(ProtoHeartbeatEvent()).addErrback(lambda f: None))
    lc.start(every, now=False)
    return lc
