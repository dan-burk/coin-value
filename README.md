# US Coin Value

Face value vs. metallic value of US coins, and what 1964 wages would be worth today, from the last settled day's metal prices. Live at https://danielburkhalter.dev/coin-value/.

- `index.html`: the coin page (plain HTML/JS); coin specs live in `COINS` at the top of the script.
- `wages/index.html`: Wages Over Time, 1964 pay carried forward in silver, gold and CPI (Plotly).
- `scripts/build-history.mjs`: writes `history.json`, one row per month since 1964. Silver and gold through Dec 2025 are World Bank monthly averages (`data/metals-worldbank.json`, fixed); later months average COMEX daily closes; wages and CPI come from FRED.
- `scripts/fetch-prices.mjs`: writes `prices.json`. Copper, silver, gold from COMEX (Yahoo Finance); nickel, zinc from LME cash settlement (westmetall.com); average wage from BLS via FRED. No API keys. A source that fails keeps its previous value.
- `.github/workflows/deploy.yml`: refreshes prices and history and deploys to GitHub Pages on push and each weekday evening.

Run locally: `node scripts/fetch-prices.mjs && node scripts/build-history.mjs && python3 -m http.server`, then open http://localhost:8000.

Melting or exporting US pennies and nickels is illegal (31 CFR Part 82). Information purposes only.
