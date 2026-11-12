// Loads a training workbook and sample Strava data into a running RepRun.
//   npm run dev            (in another terminal)
//   npm run seed -- path/to/workbook.xlsx [--url http://localhost:5173]
// Just want something to look at? Use demo mode instead (README → Try it locally).
// Safe to re-run: days already imported are skipped, sample Strava data is upserted.
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { parseWorkbook } from '../shared/sheet.ts'

const args = process.argv.slice(2)
const urlFlag = args.indexOf('--url')
const base = urlFlag >= 0 ? args[urlFlag + 1] : 'http://localhost:5173'
const file = args.find((a, i) => !a.startsWith('--') && i !== urlFlag + 1)
if (!file) throw new Error('Usage: npm run seed -- path/to/workbook.xlsx')

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const out = await res.json()
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(out)}`)
  return out
}

const payload = parseWorkbook(XLSX.read(readFileSync(file)))
console.log('import', await call('POST', '/api/import', payload))
console.log('sample strava', await call('POST', '/api/strava/sample'))
