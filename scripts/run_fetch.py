from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.providers.ctrader_provider import CTraderProvider


def main() -> None:
    parser = argparse.ArgumentParser(description="Receive cTrader demo quotes into a staging JSONL file; never changes production data.")
    parser.add_argument("--symbols", default=None, help="Comma-separated exact cTrader symbol names; defaults to CTRADER_SYMBOLS or EURUSD")
    parser.add_argument("--seconds", type=int, default=60, help="How long to collect quotes (default: 60 seconds)")
    parser.add_argument("--output-dir", default=None, help="Staging directory (default: data/ctrader_cache)")
    parser.add_argument("--allow-live", action="store_true", help="Explicitly allow the live market-data host; demo is the default")
    args = parser.parse_args()

    import os
    symbols = [s.strip() for s in (args.symbols or os.getenv("CTRADER_SYMBOLS", "EURUSD")).split(",") if s.strip()]
    output = Path(args.output_dir).resolve() if args.output_dir else None
    provider = CTraderProvider()
    provider.stream_quotes(symbols, seconds=args.seconds, output=output, allow_live=args.allow_live)


if __name__ == "__main__":
    main()
