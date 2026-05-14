import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// ─── Column aliases for Amazon DSP export formats ────────────────────────────
// Covers: Weekly Overview Dashboard, At-Stop Safety, PPS Daily, generic scorecard exports
const COL: Record<string, string[]> = {
  daName:        ['associate name', 'da name', 'driver name', 'name', 'employee name', 'full name', 'driver'],
  transponderId: ['transporter id', 'transponder id', 'transponder', 'associate id', 'da id', 'employee id', 'associate #', 'driver id'],
  week:          ['week', 'reporting week', 'performance week', 'scorecard week', 'period'],
  standing:      ['overall standing', 'standing', 'tier', 'performance tier', 'performance standing', 'weekly standing', 'overall score tier'],
  deliveryScore: ['dcr %', 'dcr%', 'dcr', 'delivery completion rate', 'delivery score', 'overall score', 'delivery rate', 'overall dcr'],
  qualityScore:  ['quality score', 'quality %', 'quality', 'pod quality', 'photo on delivery', 'pod %', 'photo ondelivery'],
  safetyScore:   ['safety score', 'fico score', 'mentor score', 'driver safety', 'safety', 'fico', 'mentor', 'at-stop safety', 'at stop safety'],
  dnrRate:       ['dnr dpmo', 'dnr rate', 'dnr %', 'dnr', 'did not return dpmo', 'did not return rate', 'return to depot'],
  dsbRate:       ['dsb rate', 'dsb %', 'dsb', 'delivery success behavior', 'delivery success rate', 'delivered success'],
}

function findCol(headers: string[], aliases: string[]): number {
  return headers.findIndex(h => aliases.includes(h.toLowerCase().trim().replace(/\s+/g, ' ')))
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return { headers: [], rows: [] }

  const parseRow = (line: string): string[] => {
    const cells: string[] = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        cells.push(cell.trim())
        cell = ''
      } else {
        cell += ch
      }
    }
    cells.push(cell.trim())
    return cells
  }

  return {
    headers: parseRow(lines[0]),
    rows:    lines.slice(1).filter(l => l.trim()).map(parseRow),
  }
}

// ─── XLSX parser ──────────────────────────────────────────────────────────────
async function parseXLSX(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (raw.length < 2) return { headers: [], rows: [] }
  return {
    headers: raw[0].map(String),
    rows:    raw.slice(1).map(r => r.map(String)),
  }
}

// ─── Week format normalizer ───────────────────────────────────────────────────
// Handles: "2026-W19", "W19 2026", "19", "2026/19", "Week 19 2026"
function normalizeWeek(raw: string, fallback: string): string {
  if (!raw) return fallback
  const clean = raw.trim()

  // Already correct format
  if (/^\d{4}-W\d{2}$/.test(clean)) return clean

  // "W19 2026" or "W19-2026"
  const wFirst = clean.match(/^W(\d{1,2})[\s-](\d{4})$/i)
  if (wFirst) return `${wFirst[2]}-W${wFirst[1].padStart(2, '0')}`

  // "2026-19" or "2026/19"
  const yearWeek = clean.match(/^(\d{4})[-\/](\d{1,2})$/)
  if (yearWeek) return `${yearWeek[1]}-W${yearWeek[2].padStart(2, '0')}`

  // "19" — bare week number, use fallback year
  const bareNum = clean.match(/^(\d{1,2})$/)
  if (bareNum) {
    const year = fallback.split('-')[0] ?? new Date().getFullYear().toString()
    return `${year}-W${bareNum[1].padStart(2, '0')}`
  }

  return fallback
}

// ─── Standing normalizer ──────────────────────────────────────────────────────
function normalizeStanding(raw: string): string {
  const s = (raw ?? '').toLowerCase().trim().replace(/\s+/g, '_')
  if (s.includes('fantastic') && (s.includes('plus') || s.includes('+'))) return 'FANTASTIC_PLUS'
  if (s.includes('fantastic')) return 'FANTASTIC'
  if (s.includes('great'))     return 'GREAT'
  if (s.includes('good'))      return 'GOOD'
  if (s.includes('fair'))      return 'FAIR'
  if (s.includes('poor'))      return 'POOR'
  return 'GOOD'
}

// Extract week from filename e.g. "DSP_Overview_Dashboard_HAVL_DDF4_2026-W19.csv"
function weekFromFilename(filename: string): string {
  const m = filename.match(/(\d{4})-W(\d{2})/i)
  if (m) return `${m[1]}-W${m[2]}`
  const now = new Date()
  const week = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function parseNum(val: string): number {
  if (!val) return 0
  const n = parseFloat(val.replace(/[%,]/g, ''))
  return isNaN(n) ? 0 : n
}

// ─── Main POST handler ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const filename  = file.name
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''

  // Parse file into headers + rows
  let headers: string[] = []
  let rows: string[][]   = []

  try {
    if (extension === 'xlsx' || extension === 'xls') {
      const buffer = await file.arrayBuffer();
      ({ headers, rows } = await parseXLSX(buffer))
    } else {
      const text = await file.text();
      ({ headers, rows } = parseCSV(text))
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Could not parse file: ${err.message}` }, { status: 400 })
  }

  if (!headers.length || !rows.length) {
    return NextResponse.json({ error: 'File is empty or unreadable' }, { status: 400 })
  }

  // Detect column positions
  const col: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(COL)) {
    col[field] = findCol(headers, aliases)
  }

  // Must have at least a DA name or transponder ID
  if (col.daName === -1 && col.transponderId === -1) {
    return NextResponse.json({
      error: 'Could not find a DA name or Transporter ID column. Make sure you are uploading the Weekly Overview or scorecard CSV from Amazon DSP Portal.',
      detectedHeaders: headers,
    }, { status: 400 })
  }

  const weekFallback = weekFromFilename(filename)
  const get = (row: string[], field: string) => col[field] >= 0 ? (row[col[field]] ?? '').trim() : ''

  const imported: string[] = []
  const skipped:  string[] = []
  const errors:   { row: number; name: string; reason: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row     = rows[i]
    const rawName = get(row, 'daName').replace(/\s*\(.*?\)\s*$/, '').trim()
    const tid     = get(row, 'transponderId')

    if (!rawName && !tid) continue // blank row

    // Resolve week
    const weekRaw = get(row, 'week')
    const week    = normalizeWeek(weekRaw, weekFallback)

    // Match DA in database
    const da = await prisma.dA.findFirst({
      where: {
        OR: [
          ...(rawName ? [{ name: { equals: rawName, mode: 'insensitive' as const } }] : []),
          ...(tid     ? [{ transponderId: tid }] : []),
        ],
      },
    })

    if (!da) {
      skipped.push(rawName || tid)
      continue
    }

    const deliveryScore = parseNum(get(row, 'deliveryScore'))
    const qualityScore  = parseNum(get(row, 'qualityScore'))
    const safetyScore   = parseNum(get(row, 'safetyScore'))
    const dnrRate       = parseNum(get(row, 'dnrRate'))
    const dsbRate       = parseNum(get(row, 'dsbRate'))
    const standing      = normalizeStanding(get(row, 'standing'))

    try {
      await prisma.dAScorecard.upsert({
        where:  { daId_week: { daId: da.id, week } },
        update: { deliveryScore, qualityScore, safetyScore, dnrRate, dsbRate, standing, syncedAt: new Date() },
        create: { daId: da.id, week, deliveryScore, qualityScore, safetyScore, dnrRate, dsbRate, standing },
      })
      imported.push(da.name)
    } catch (err: any) {
      errors.push({ row: i + 2, name: da.name, reason: err.message ?? 'DB error' })
    }
  }

  return NextResponse.json({
    imported: imported.length,
    skipped:  skipped.length,
    errors,
    week:     weekFallback,
    detectedColumns: Object.entries(col)
      .filter(([, idx]) => idx >= 0)
      .map(([field, idx]) => ({ field, header: headers[idx] })),
  })
}
