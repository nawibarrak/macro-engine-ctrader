from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class ProviderRoute:
    series_id: str
    ctrader_symbols: tuple[str, ...]
    fallback: str


# 17 Core Cross-Asset Financial Instruments with multi-broker cTrader candidates & fallback
ROUTES: Dict[str, ProviderRoute] = {
    # FX Pairs
    "EURUSD": ProviderRoute("EURUSD", ("EURUSD",), "yfinance"),
    "USDJPY": ProviderRoute("USDJPY", ("USDJPY",), "yfinance"),
    "USDIDR": ProviderRoute("USDIDR", ("USDIDR", "USD/IDR"), "yfinance"),

    # Commodities & Precious Metals
    "XAUUSD": ProviderRoute("XAUUSD", ("XAUUSD", "GOLD"), "yfinance"),
    "WTI": ProviderRoute("WTI", ("WTI", "USOIL", "Crude Oil"), "yfinance"),
    "COPPER": ProviderRoute("COPPER", ("COPPER", "XCUUSD"), "yfinance"),

    # Equities & Indices
    "SPX": ProviderRoute("SPX", ("SPX500", "US500", "S&P 500"), "yfinance"),
    "NDX": ProviderRoute("NDX", ("NAS100", "US100", "Nasdaq 100"), "yfinance"),
    "IHSG": ProviderRoute("IHSG", ("IHSG", "JKSE"), "yfinance"),
    "N225": ProviderRoute("N225", ("Nikkei225", "JP225"), "yfinance"),

    # Macro, Rates & Yields
    "DXY": ProviderRoute("DXY", ("DXY", "USDOLLAR"), "yfinance"),
    "US2Y": ProviderRoute("US2Y", ("US2Y", "US02MY"), "yfinance"),
    "US10Y": ProviderRoute("US10Y", ("US10Y", "US10MY"), "yfinance"),
    "US30Y": ProviderRoute("US30Y", ("US30Y", "US30MY"), "yfinance"),
    "T10Y2Y": ProviderRoute("T10Y2Y", ("T10Y2Y",), "fred"),
    "USREAL10Y": ProviderRoute("USREAL10Y", ("DFII10",), "fred"),

    # Crypto & Volatility
    "BTC": ProviderRoute("BTC", ("BTCUSD", "BTC/USD"), "yfinance"),
    "VIX": ProviderRoute("VIX", ("VIX", "Volatility S&P 500"), "yfinance"),
}


def route_for(series_id: str) -> ProviderRoute | None:
    """Return the configured cTrader symbol candidates for a production series."""
    return ROUTES.get(series_id.upper())


def supported_series() -> List[str]:
    return sorted(ROUTES)


def build_provider_map() -> dict[str, str]:
    """Describe the active route; cTrader requests require CTRADER_ENABLED=1."""
    return {series_id: "cTrader D1 -> yfinance/FRED fallback (opt-in)" for series_id in ROUTES}
