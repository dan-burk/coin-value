// Builds history.json for the Wages Over Time page: one row per month since
// Jan 1964 of [month, average wage, minimum wage, silver $/oz, gold $/oz, CPI].
// Runs daily in the deploy workflow after fetch-prices.mjs; if a source fails,
// the previous history.json is kept as is.
//
//   silver, gold   data/metals-worldbank.json: World Bank Pink Sheet monthly
//                  averages, Jan 1964 – Dec 2025 (fixed; CC BY 4.0). Later
//                  months: COMEX daily closes (Yahoo Finance) averaged by
//                  month, complete months only. The page adds today's close
//                  from prices.json as the final point.
//   average wage   FRED AHETPI, production & nonsupervisory
//   minimum wage   FRED FEDMINNFRWG, federal minimum
//   CPI            FRED CPIAUCNS, CPI-U; carried forward until the month is published
//
// No API keys needed. Usage: node scripts/build-history.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../history.json', import.meta.url)
const WORLD_BANK = JSON.parse(readFileSync(new URL('../data/metals-worldbank.json', import.meta.url), 'utf8'))

async function fred(id) {
  const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`)
  return Object.fromEntries((await res.text()).trim().split('\n').slice(1)
    .map(line => line.split(','))
    .filter(([, v]) => v && v !== '.')
    .map(([date, v]) => [date.slice(0, 7), Number(v)]))
}

// monthly averages of daily closes from `from` (YYYY-MM-DD) through last month
async function yahooMonthly(symbol, from) {
  const p1 = Date.parse(from + 'T00:00:00Z') / 1000, p2 = Math.floor(Date.now() / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`)
  const r = (await res.json()).chart.result[0]
  const thisMonth = new Date().toISOString().slice(0, 7), months = {}
  r.timestamp.forEach((t, i) => {
    const close = r.indicators.quote[0].close[i]
    const m = new Date((t + r.meta.gmtoffset) * 1000).toISOString().slice(0, 7)
    if (close != null && m < thisMonth) (months[m] ??= []).push(close)
  })
  return Object.fromEntries(Object.entries(months).map(([m, c]) => [m, c.reduce((a, b) => a + b, 0) / c.length]))
}

try {
  const metal = Object.fromEntries(WORLD_BANK.map(([m, ag, au]) => [m, { ag, au }]))
  const after = WORLD_BANK[WORLD_BANK.length - 1][0]
  const [y, mo] = after.split('-').map(Number)
  const from = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10)
  const [ag, au] = await Promise.all([yahooMonthly('SI=F', from), yahooMonthly('GC=F', from)])
  for (const m of Object.keys(ag)) if (au[m]) metal[m] = { ag: ag[m], au: au[m] }

  const [avg, min, cpi] = await Promise.all([fred('AHETPI'), fred('FEDMINNFRWG'), fred('CPIAUCNS')])
  const minDates = Object.keys(min).sort()
  let lastCpi
  const rows = []
  for (const m of Object.keys(avg).sort()) {
    if (m < '1964-01' || !metal[m]) continue
    let minWage = 0
    for (const d of minDates) if (d <= m) minWage = min[d]
    lastCpi = cpi[m] ?? lastCpi
    rows.push([m, avg[m], minWage, +metal[m].ag.toFixed(3), +metal[m].au.toFixed(2), lastCpi])
  }
  if (rows.length < 700) throw new Error(`only ${rows.length} months`)
  writeFileSync(FILE, '[' + rows.map(r => JSON.stringify(r)).join(',\n') + ']\n')
  console.log(`history.json: ${rows.length} months, ${rows[0][0]} – ${rows[rows.length - 1][0]}`)
} catch (err) {
  console.warn(`kept previous history.json: ${err.message}`)
}
