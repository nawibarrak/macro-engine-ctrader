from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Iterable, List, Optional, Sequence, Tuple


Point = Tuple[str, float]


class BaseProvider(ABC):
    provider_name = "base"

    @abstractmethod
    def fetch_series(
        self,
        symbol: str,
        start_date: str,
        end_date: Optional[str] = None,
        *,
        interval: str = "1d",
    ) -> List[Point]:
        """Return a list of (date_string, value) tuples."""

    def normalize_points(self, raw_points: Iterable[Tuple[str, float]], *, value_key: str = "value") -> List[Point]:
        items: List[Point] = []
        for item in raw_points:
            if isinstance(item, dict):
                if value_key not in item:
                    raise ValueError(f"Missing key '{value_key}' in raw point: {item!r}")
                date = str(item.get("date") or item.get("timestamp") or item.get("dt"))
                value = float(item[value_key])
            else:
                if len(item) != 2:
                    raise ValueError(f"Unsupported raw point shape: {item!r}")
                date, value = item
                value = float(value)
            date_str = str(date).strip()
            if not date_str:
                continue
            items.append((date_str[:10], float(value)))
        return sorted(items, key=lambda x: x[0])

    def validate_points(self, points: Sequence[Point]) -> List[Point]:
        valid: List[Point] = []
        for date_str, value in points:
            try:
                datetime.strptime(date_str[:10], "%Y-%m-%d")
            except ValueError:
                continue
            if value is None or value == float("nan"):
                continue
            valid.append((date_str[:10], float(value)))
        return valid

    def build_date_window(self, start_date: str, end_date: Optional[str] = None) -> tuple[str, str]:
        if end_date is None:
            end_date = datetime.utcnow().strftime("%Y-%m-%d")
        return start_date[:10], end_date[:10]

    def needs_refresh(self, last_fetched: Optional[str], *, min_minutes: int = 30) -> bool:
        if last_fetched is None:
            return True
        try:
            last_dt = datetime.fromisoformat(last_fetched)
        except ValueError:
            return True
        age = datetime.utcnow() - last_dt
        return age.total_seconds() / 60 >= min_minutes
