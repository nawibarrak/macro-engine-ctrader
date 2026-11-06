from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

try:
    from ctrader_open_api import Auth, Client, EndPoints, Protobuf, TcpProtocol
    from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoMessage
    from ctrader_open_api.messages.OpenApiMessages_pb2 import (
        ProtoOAAccountAuthReq,
        ProtoOAAccountAuthRes,
        ProtoOAApplicationAuthReq,
        ProtoOAApplicationAuthRes,
        ProtoOAGetAccountListByAccessTokenReq,
        ProtoOAGetAccountListByAccessTokenRes,
        ProtoOASpotEvent,
        ProtoOASpotsSubscribeReq,
        ProtoOASubscribeSpotsReq,
        ProtoOASymbolsListReq,
        ProtoOASymbolsListRes,
    )
except (ImportError, AttributeError):
    Auth = Client = EndPoints = Protobuf = TcpProtocol = None  # type: ignore[assignment]


class CTraderProvider:
    """Demo-first cTrader spot stream writer.

    This class only receives market data. It does not place or modify orders, and it writes
    JSON Lines to a staging directory; it never changes data/series or the production bundle.
    """

    provider_name = "ctrader"

    def __init__(self) -> None:
        self.client_id = os.getenv("CTRADER_CLIENT_ID", "").strip()
        self.client_secret = os.getenv("CTRADER_CLIENT_SECRET", "").strip()
        self.access_token = os.getenv("CTRADER_ACCESS_TOKEN", "").strip()
        self.account_id = os.getenv("CTRADER_ACCOUNT_ID", "").strip()
        self.host_name = os.getenv("CTRADER_HOST", "demo").strip().lower()
        self._client = None
        self._account_id: Optional[int] = None
        self._symbols: Dict[int, Dict[str, Any]] = {}
        self._wanted: list[str] = []
        self._out = None
        self._received = 0
        self._failed = False

    @staticmethod
    def _need_sdk() -> None:
        if Client is None:
            raise RuntimeError("cTrader Open API SDK is unavailable. Install requirements.txt in a Python environment first.")

    def _host(self, allow_live: bool) -> str:
        self._need_sdk()
        if self.host_name == "demo":
            return EndPoints.PROTOBUF_DEMO_HOST
        if self.host_name == "live" and allow_live:
            return EndPoints.PROTOBUF_LIVE_HOST
        if self.host_name == "live":
            raise RuntimeError("Live host is blocked by default. This feed-only tool requires --allow-live to opt in.")
        raise RuntimeError("CTRADER_HOST must be demo or live.")

    def stream_quotes(self, symbols: Iterable[str], seconds: int = 60, output: Optional[Path] = None,
                      allow_live: bool = False) -> int:
        self._need_sdk()
        if not self.client_id or not self.client_secret or not self.access_token:
            raise RuntimeError("Set CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET and CTRADER_ACCESS_TOKEN in local .env first.")
        self._wanted = [s.strip() for s in symbols if s.strip()]
        if not self._wanted:
            raise RuntimeError("Provide at least one cTrader symbol, e.g. EURUSD.")
        if seconds < 1:
            raise ValueError("seconds must be at least 1")

        from twisted.internet import reactor

        stage = output or ROOT / "data" / "ctrader_cache"
        stage.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        filename = "-".join(s.lower().replace("/", "-") for s in self._wanted)
        path = stage / f"{filename}-{stamp}.jsonl"
        self._out = path.open("a", encoding="utf-8")
        self._client = Client(self._host(allow_live), EndPoints.PROTOBUF_PORT, TcpProtocol)
        self._client.setConnectedCallback(self._on_connected)
        self._client.setDisconnectedCallback(self._on_disconnected)
        self._client.setMessageReceivedCallback(self._on_message)
        self._client.startService()
        reactor.callLater(seconds, self._stop)
        print(f"Connecting to cTrader {self.host_name} (market-data only). Staging file: {path}")
        try:
            reactor.run()
        finally:
            if self._out and not self._out.closed:
                self._out.close()
        if self._failed:
            raise RuntimeError("cTrader stream did not complete successfully; inspect the error printed above.")
        print(f"Finished: received {self._received} quote event(s). Output remains in staging; no engine data was changed.")
        return self._received

    def _send(self, request: Any) -> None:
        deferred = self._client.send(request)
        deferred.addErrback(self._on_error)

    def _on_connected(self, client: Any) -> None:
        print("Connected to cTrader Open API.")
        req = ProtoOAApplicationAuthReq()
        req.clientId = self.client_id
        req.clientSecret = self.client_secret
        self._send(req)

    def _on_disconnected(self, _client: Any, reason: Any) -> None:
        if reason:
            print(f"cTrader disconnected: {reason}")

    def _on_error(self, failure: Any) -> Any:
        self._failed = True
        print(f"cTrader API error: {failure}")
        self._stop()
        return failure

    @staticmethod
    def _get_items(obj: Any, *field_names: str) -> list[Any]:
        for name in field_names:
            if hasattr(obj, name):
                return list(getattr(obj, name))
        return []

    def _on_message(self, _client: Any, message: Any) -> None:
        try:
            payload = Protobuf.extract(message)
            if message.payloadType == ProtoOAApplicationAuthRes().payloadType:
                req = ProtoOAGetAccountListByAccessTokenReq()
                req.accessToken = self.access_token
                self._send(req)
            elif message.payloadType == ProtoOAGetAccountListByAccessTokenRes().payloadType:
                accounts = self._get_items(payload, "ctidTraderAccount", "accounts")
                if not accounts:
                    raise RuntimeError("No cTrader accounts were returned for this access token.")
                selected = int(self.account_id) if self.account_id else int(accounts[0].ctidTraderAccountId)
                valid_ids = {int(a.ctidTraderAccountId) for a in accounts}
                if selected not in valid_ids:
                    raise RuntimeError("CTRADER_ACCOUNT_ID is not among accounts authorized by this token.")
                self._account_id = selected
                req = ProtoOAAccountAuthReq()
                req.ctidTraderAccountId = selected
                req.accessToken = self.access_token
                self._send(req)
            elif message.payloadType == ProtoOAAccountAuthRes().payloadType:
                req = ProtoOASymbolsListReq()
                req.ctidTraderAccountId = self._account_id
                req.includeArchivedSymbols = False
                self._send(req)
            elif message.payloadType == ProtoOASymbolsListRes().payloadType:
                items = self._get_items(payload, "symbol", "symbols")
                by_name = {str(s.symbolName): s for s in items if hasattr(s, "symbolName")}
                missing = [name for name in self._wanted if name not in by_name]
                if missing:
                    available = ", ".join(sorted(by_name)[:30])
                    raise RuntimeError(f"Symbols not found in this cTrader account: {missing}. Check exact broker symbol names. Sample available names: {available}")
                for name in self._wanted:
                    symbol = by_name[name]
                    sid = int(symbol.symbolId)
                    self._symbols[sid] = {"name": name, "digits": int(getattr(symbol, "digits", 5))}
                req = ProtoOASubscribeSpotsReq()
                req.ctidTraderAccountId = self._account_id
                req.symbolId.extend(self._symbols.keys())
                req.subscribeToSpotTimestamp = True
                self._send(req)
                print(f"Subscribed to {', '.join(self._wanted)}.")
            elif message.payloadType == ProtoOASpotEvent().payloadType:
                self._write_spot(payload)
        except Exception as exc:
            self._failed = True
            print(f"Could not process cTrader message: {exc}")
            self._stop()

    def _write_spot(self, event: Any) -> None:
        sid = int(event.symbolId)
        meta = self._symbols.get(sid)
        if not meta:
            return
        scale = 10 ** meta["digits"]
        bid_raw = getattr(event, "bid", None)
        ask_raw = getattr(event, "ask", None)
        bid = float(bid_raw) / scale if bid_raw not in (None, 0) else None
        ask = float(ask_raw) / scale if ask_raw not in (None, 0) else None
        if bid is None and ask is None:
            return
        mid = (bid + ask) / 2 if bid is not None and ask is not None else (bid if bid is not None else ask)
        ts_ms = int(getattr(event, "timestamp", 0) or 0)
        observed = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc) if ts_ms else datetime.now(timezone.utc)
        record = {
            "source": "ctrader",
            "symbol": meta["name"],
            "symbol_id": sid,
            "timestamp": observed.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "received_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "bid": bid,
            "ask": ask,
            "mid": mid,
        }
        self._out.write(json.dumps(record, separators=(",", ":")) + "\n")
        self._out.flush()
        self._received += 1

    @staticmethod
    def _stop() -> None:
        from twisted.internet import reactor
        if reactor.running:
            reactor.stop()
