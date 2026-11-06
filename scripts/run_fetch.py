from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.providers.ctrader_provider import CTraderProvider


def main() -> None:
    parser = argparse.ArgumentParser(description="Receive cTrader quotes or fetch historical daily bars; never places orders.")
    parser.add_argument("--symbols", default=None, help="Comma-separated exact cTrader symbol names; defaults to CTRADER_SYMBOLS or EURUSD")
    parser.add_argument("--seconds", type=int, default=60, help="How long to collect quotes (default: 60 seconds)")
    parser.add_argument("--output-dir", default=None, help="Staging directory (default: data/ctrader_cache)")
    parser.add_argument("--allow-live", action="store_true", help="Explicitly allow the live market-data host; demo is the default")
    parser.add_argument("--history", action="store_true", help="Fetch daily historical bars instead of streaming quotes")
    parser.add_argument("--start", default=None, help="UTC start date for --history (YYYY-MM-DD)")
    parser.add_argument("--end", default=None, help="UTC end date for --history (YYYY-MM-DD; defaults to today)")
    args = parser.parse_args()

    import os
    symbols = [s.strip() for s in (args.symbols or os.getenv("CTRADER_SYMBOLS", "EURUSD")).split(",") if s.strip()]
    output = Path(args.output_dir).resolve() if args.output_dir else None
    provider = CTraderProvider()
    if args.history:
        if not args.start:
            parser.error("--history requires --start")
        if len(symbols) != 1:
            parser.error("--history currently accepts exactly one symbol")
        points = provider.fetch_daily_series(symbols[0], args.start, args.end, allow_live=args.allow_live)
        print("CTRADER_HISTORY_JSON=" + json.dumps(points, separators=(",", ":")))
    else:
        provider.stream_quotes(symbols, seconds=args.seconds, output=output, allow_live=args.allow_live)


if __name__ == "__main__":
    main()
