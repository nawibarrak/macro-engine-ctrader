from __future__ import annotations

from typing import List, Optional

from .base_provider import BaseProvider, Point

try:
    import yfinance as yf
except Exception:  # pragma: no cover
    yf = None


class YFinanceProvider(BaseProvider):
    provider_name = "yfinance"

    def fetch_series(
        self,
        symbol: str,
        start_date: str,
        end_date: Optional[str] = None,
        *,
        interval: str = "1d",
    ) -> List[Point]:
        if yf is None:
            raise RuntimeError("yfinance is not installed.")

        start, end = self.build_date_window(start_date, end_date)
        hist = yf.Ticker(symbol).history(start=start, end=end, interval=interval, auto_adjust=False)
        if hist is None or hist.empty:
            return []

        rows: List[Point] = []
        for idx, row in hist.iterrows():
            close = row.get("Close")
            if close is None:
                continue
            rows.append((str(idx.date()), float(close)))
        return self.validate_points(rows)
