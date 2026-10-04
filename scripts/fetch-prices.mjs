// Refreshes prices.json with the latest metal prices and wages. Runs daily
// in the deploy workflow; any source that fails keeps its previous value, so
// the site always has a complete (if slightly stale) prices.json.
//
//   gold, silver, copper  Yahoo Finance COMEX futures (GC=F, SI=F, HG=F), last settled day
//   nickel, zinc          LME cash settlement via westmetall.com, $/metric ton, last close
//   average wage          FRED AHETPI, average hourly earnings, production & nonsupervisory
//
// No API keys needed. Usage: node scripts/fetch-prices.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../prices.json', import.meta.url)
const LB_PER_TON = 2204.62

const prev = (() => {
  try { return JSON.parse(readFileSync(FILE, 'utf8')) } catch { return { metals: {}, wages: {} } }
})()

async function yahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`)
  // finished sessions are stamped at exchange midnight; the live session isn't
  const r = (await res.json()).chart.result[0]
  const off = r.meta.gmtoffset
  const bars = r.timestamp
    .map((t, i) => ({ t, close: r.indicators.quote[0].close[i] }))
    .filter(b => b.close != null && (b.t + off) % 86400 === 0)
  const last = bars[bars.length - 1]
  if (!last) throw new Error(`${symbol}: no completed daily bar`)
  return { price: last.close, asOf: new Date((last.t + off) * 1000).toISOString().slice(0, 10) }
}

// westmetall's table rows: date, cash settlement, 3-month, stock; newest first
async function lme(field) {
  const res = await fetch(`https://www.westmetall.com/en/markdaten.php?action=table&field=${field}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${field}: HTTP ${res.status}`)
  const [date, cash] = [...(await res.text()).matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1].trim())
  const price = Number(cash.replace(/,/g, ''))
  const asOf = new Date(date.replace('.', '') + ' UTC')
  if (!price || isNaN(asOf)) throw new Error(`${field}: could not parse "${date}" / "${cash}"`)
  return { price, asOf: asOf.toISOString().slice(0, 10) }
}

async function fred(id) {
  const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`)
  return (await res.text()).trim().split('\n').slice(1)
    .map(line => line.split(','))
    .filter(([, v]) => v && v !== '.')
    .map(([date, v]) => ({ date, value: Number(v) }))
}

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d

const jobs = {
  gold:   async () => { const q = await yahoo('GC=F'); return { price: round(q.price, 2), unit: 'oz', asOf: q.asOf, source: 'COMEX' } },
  silver: async () => { const q = await yahoo('SI=F'); return { price: round(q.price, 3), unit: 'oz', asOf: q.asOf, source: 'COMEX' } },
  copper: async () => { const q = await yahoo('HG=F'); return { price: round(q.price, 4), unit: 'lb', asOf: q.asOf, source: 'COMEX' } },
  nickel: async () => { const q = await lme('LME_Ni_cash'); return { price: round(q.price / LB_PER_TON, 4), unit: 'lb', asOf: q.asOf, source: 'LME' } },
  zinc:   async () => { const q = await lme('LME_Zn_cash'); return { price: round(q.price / LB_PER_TON, 4), unit: 'lb', asOf: q.asOf, source: 'LME' } },
}

const metals = {}
for (const [name, job] of Object.entries(jobs)) {
  try {
    metals[name] = await job()
  } catch (err) {
    console.warn(`kept previous ${name}: ${err.message}`)
    metals[name] = prev.metals[name]
  }
}

let wages = prev.wages
try {
  const rows = await fred('AHETPI')
  const y1964 = rows.filter(r => r.date.startsWith('1964'))
  const last = rows[rows.length - 1]
  wages = {
    min1964: 1.25,
    minNow: 7.25,
    avg1964: round(y1964.reduce((s, r) => s + r.value, 0) / y1964.length, 2),
    avgNow: last.value,
    avgNowAsOf: last.date,
  }
} catch (err) {
  console.warn(`kept previous wages: ${err.message}`)
}

const out = { updated: new Date().toISOString(), metals, wages }
writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(out, null, 2))
