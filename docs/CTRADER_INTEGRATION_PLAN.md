# cTrader Integration Prep Plan

This repository is preparing a safe integration with cTrader as an alternative data source, without breaking the current macro engine.

## Goals
- keep the existing yfinance + FRED stack stable
- add cTrader as a backup provider for FX and market instruments
- isolate all cTrader logic behind a provider/normalizer layer
- enable easy rollback through backups and safe staging

## Current architecture
The current data pipeline is centered on `scripts/data_layer.py`, which consumes normalized series data in the form of lists of `(date, value)` pairs or JSON objects with `date` and `value` fields. This is the correct insertion point for a cTrader adapter.

## Safety workflow
1. create a repo snapshot before any modification
2. keep the main engine unchanged during validation
3. run cTrader in demo mode first
4. validate output on a narrow set of symbols only
5. enable fallback support only after validation succeeds

## Suggested file layout
- `scripts/providers/` — provider classes
- `scripts/provider_registry.py` — selects source order per series
- `scripts/run_fetch.py` — manual fetch for a single series
- `scripts/backup_restore.py` — backup and restore helpers

## Backup commands
Create snapshot:

```bash
python scripts/backup_restore.py --create --tag pre-ctrader
```

Restore snapshot:

```bash
python scripts/backup_restore.py --restore backups/pre-ctrader.zip
```

## Demo validation flow
1. install dependencies
2. configure `.env` with cTrader app credentials
3. test one instrument such as `EURUSD`
4. confirm OAuth2 authentication works in demo mode
5. ensure normalized output is valid before activating provider selection

## Important rule
Do not write cTrader data directly into the main `data/series/` directory before a validation pass. Always stage data first, then normalize and promote only after quality checks succeed.

## Required env vars
- `CTRTADER_CLIENT_ID`
- `CTRTADER_CLIENT_SECRET`
- `CTRTADER_REDIRECT_URI`
- `CTRTADER_HOST=demo`
- `CTRTADER_ACCOUNT_ID`
- `CTRTADER_ACCESS_TOKEN`
- `CTRTADER_REFRESH_TOKEN`

## Recommended next steps
1. install dependencies from `requirements.txt`
2. verify the repo snapshot is intact
3. create a demo cTrader app and gather OAuth2 credentials
4. run a single-symbol fetch for `EURUSD`
5. validate output and keep the fallback path active

## Risk management
- never activate live trading mode before demo validation
- never remove the legacy provider path before cTrader output is proven reliable
- keep a clean backup archive with timestamp on every significant change
