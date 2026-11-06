# cTrader read-only quote polling

The web comparison endpoint can request a short, read-only cTrader quote capture. It does not submit or modify orders.

1. Install Python requirements in the Codespace, or set `CTRADER_PYTHON` to the Python executable that has `ctrader-open-api` and `twisted` installed.
2. Put the app credentials, valid OAuth access token, and authorized trading account ID into Codespaces Secrets (or a local, ignored `.env`). Never commit or paste their values into chat.
3. Start with `CTRADER_HOST=demo` and `CTRADER_ENABLED=1`. For a live account, use `CTRADER_HOST=live` and explicitly set `CTRADER_ALLOW_LIVE=1` only after demo succeeds.
4. Restart the backend after changing environment variables. Select an instrument and refresh the comparison panel. The endpoint asks the cTrader feed for a short quote window; the first response can take several seconds.
5. Set the exact broker instrument names using the per-symbol `CTRADER_*_SYMBOL` overrides if the defaults are absent from your account.

The API checks app authentication, obtains the accounts authorized by the access token, authenticates the selected account, resolves broker symbols, subscribes to spot updates, and returns the newest bid/ask observation. Credentials are only passed to the backend Python process. The endpoint never exposes them in its response.

Yahoo Finance is a comparison reference, not necessarily a real-time institutional feed. EUR/USD and USD/JPY quotes can be compared only when their timestamps are within five minutes. Gold/WTI Yahoo tickers (`GC=F`, `CL=F`) are futures, not the same spot instrument as cTrader, so the endpoint deliberately suppresses a numerical delta for those mappings.
