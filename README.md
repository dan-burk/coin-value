# US Coin Value

Face value vs. metallic value of US coins, from the last settled day's metal prices. Live at https://danielburkhalter.dev/coin-value/.

- `index.html`: the whole site (plain HTML/JS); coin specs live in `COINS` at the top of the script.
- `scripts/fetch-prices.mjs`: writes `prices.json`. Copper, silver, gold from COMEX (Yahoo Finance); nickel, zinc from LME cash settlement (westmetall.com); average wage from BLS via FRED. No API keys. A source that fails keeps its previous value.
- `.github/workflows/deploy.yml`: refreshes prices and deploys to GitHub Pages on push and each weekday evening.

Run locally: `node scripts/fetch-prices.mjs && python3 -m http.server`, then open http://localhost:8000.

Melting or exporting US pennies and nickels is illegal (31 CFR Part 82). Information purposes only.
