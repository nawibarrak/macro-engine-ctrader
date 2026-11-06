from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class ProviderRoute:
    series_id: str
    ctrader_symbols: tuple[str, ...]
    fallback: str


# Exact names vary between cTrader brokers. Verify the available symbol list in your account.
ROUTES: Dict[str, ProviderRoute] = {
    "EURUSD": ProviderRoute("EURUSD", ("EURUSD",), "yfinance"),
    "USDJPY": ProviderRoute("USDJPY", ("USDJPY",), "yfinance"),
    "XAUUSD": ProviderRoute("XAUUSD", ("XAUUSD", "GOLD"), "yfinance"),
    "BTC": ProviderRoute("BTC", ("BTCUSD", "BTC/USD"), "yfinance"),
}


def route_for(series_id: str) -> ProviderRoute | None:
    """Describe a cTrader-first route; this does not change the existing production pipeline."""
    return ROUTES.get(series_id.upper())


def supported_series() -> List[str]:
    return sorted(ROUTES)


def build_provider_map() -> dict[str, str]:
    """Return provider names only; the engine's existing data_layer is not rewired yet."""
    return {series_id: "ctrader -> yfinance fallback (planned; staging validation required)" for series_id in ROUTES}
