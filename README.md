# Macro Engine Desk (React + TypeScript + Vite)

A modern, high-precision macroeconomic terminal and fundamental asset allocation desk rewritten from the original Dynamic setup into a full-featured React 18 + TypeScript SPA on Vite.

## Core Features & Architecture

### 1. Desk Utama (Executive Terminal)
- **Status & Signal Gates:** Real-time general and per-asset gates (`gates.json`), data freshness metrics, data validation audit passes/warnings/failures (`audit_series.json`), and conceptual invariant compliance checks.
- **Pasar (Market Overview):** 17 core cross-asset financial instruments (S&P 500, Nasdaq 100, IHSG, Nikkei 225, US Dollar Index, 2Y/10Y/30Y Treasury yields, 10Y-2Y yield curve slope, 10Y Real yield, Gold, WTI Crude Oil, Copper, Bitcoin, VIX, USD/JPY, EUR/USD, USD/IDR) with 1-day, 1-week, and 1-month changes, 90-day interactive sparklines, data age, and detail zoom views (3 months, 1 year, 2 years, all time).
- **Aliran Modal (Capital Flows):** Relative asset class performance heatmap across multiple horizons (1 day, 1 week, 1 month, 3 months) and risk-on / risk-off pair divergence tracking (SPY vs TLT, HYG vs IEF, EEM vs SPY, AUD/JPY, Copper vs Gold, VIX / VIX 3M term ratio).
- **Makro Aktual (Macro Fundamentals):** Official releases grouped into Inflation (CPI, Core CPI, Core PCE, PPI, Average Hourly Earnings), Labor (Nonfarm Payrolls, Unemployment Rate, Initial Jobless Claims 4-week average), and Real Activity (Retail Sales, Industrial Production, Empire State Manufacturing, Philly Fed, Real GDP).
- **Kebijakan & Suku Bunga (Central Banks & Yield Curve):** Comparative US yield curves across multiple vintages (Now, 1 month ago, 1 year ago) with inversion detection, plus major global central bank benchmark interest rates (Federal Reserve, ECB, Bank of England, Bank of Japan, Bank of Canada, RBA, Swiss National Bank).
- **Stres & Likuiditas (Systemic Stress & Net Liquidity):** Real-time monitoring of equity implied volatility (VIX), VIX term structure contango/backwardation, bond market volatility (MOVE), High-Yield Credit Spreads (HY OAS), Chicago Fed Financial Conditions Index (NFCI), Reverse Repo (RRP), and Fed Net Liquidity (`WALCL - TGA - RRP`).
- **Posisi Spekulan COT (Commitment of Traders):** Speculative non-commercial net positioning across 10 CFTC contracts normalized into percentile ranges (Extreme Short, Leaning Short, Balanced, Leaning Long, Extreme Long) with week-over-week changes.
- **Kalender Rilis:** Upcoming scheduled economic data releases with market consensus, alongside recent releases highlighting actual vs consensus deviations.
- **Kesehatan Data & Audit Silang:** Transparent data provenance, observation timestamps, update frequency, confidence status, and multi-source cross-audit test results.

### 2. Workbench Lanjutan (Advanced Model & Signals Engine)
- **Rezim Fundamental & Mode Pasar:** Automated classification of market regimes (Goldilocks, Overheating, Stagflation, Slowdown) and systemic shock states (Normal, Waspada, Krisis with 3-phase crisis playbook).
- **Decision Engine (BUY / SELL / HOLD):** Multi-factor decision matrix incorporating factor shocks: Growth ($G$), Inflation ($I$), Central Bank Stance ($P$), Net Liquidity ($L$), Financial Stress ($R$), Real Yields ($RY$), and US Dollar ($USD$), coupled with empirical walk-forward asset betas and scenario overlays.
- **Factor Attribution Decomposition:** Interactive breakdown of each asset's fundamental score showing contributions from each macro driver.
- **Data Release CRUD & Batch CSV Import:** Add individual releases or paste tabular historical releases with z-score standardization and half-life exponential time decay.
- **Central Bank Stance Lab:** Parameterize rate expectations, implied 12-month policy paths, statement rhetoric tones, and decision surprises for global central banks.
- **COT Speculative Tracker:** Record weekly CFTC Tuesday position figures, manage custom range benchmarks, and inspect historical net-to-open-interest trajectories.
- **Shock & Liquidity Simulator:** Adjust systemic shock thresholds, Fed balance sheet components, and geopolitical scenario overlays (Energy supply disruptions, banking crises, tariff escalations, JPY carry trade unwinds, Middle East tensions, pandemic demand shocks).
- **Model Calibration & State Backups:** Adjust decay half-lives, lookback windows, shrinkage parameters, factor weights, and export/import complete state JSON configurations.

## Running Locally

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Production build
npm run build
```
