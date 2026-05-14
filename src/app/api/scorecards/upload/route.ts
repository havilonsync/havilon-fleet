import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// ─── Column aliases for Amazon DSP export formats ────────────────────────────
const COL: Record<string, string[]> = {
  daName:        ['associate name', 'da name', 'driver name', 'name', 'employee name', 'full name', 'driver'],
  transponderId: ['transporter id', 'transponder id', 'transponder', 'associate id', 'da id', 'employee id', 'driver id'],
  week:          ['week', 'reporting week', 'performance week', 'scorecard week', 'period'],
  standing:      ['overall standing', 'standing', 'tier', 'performance tier', 'performance standing', 'weekly standing'],
  deliveryScore: ['dcr %', 'dcr%', 'dcr', 'delivery completion rate', 'delivery score', 'overall score', 'overall dcr'],
  qualityScore:  ['quality score', 'quality %', 'quality', 'pod quality', 'photo on delivery', 'pod %'],
  safetyScore:   ['safety score', 'fico score', 'mentor score', 'driver safety', 'safety', 'fico', 'mentor', 'at-stop safety', 'at stop safety'],
  dnrRate:       ['dnr dpmo', 'dnr rate', 'dnr %', 'dnr', 'did not return dpmo', 'did not return rate'],
  dsbRate:       ['dsb rate', 'dsb %', 'dsb', 'delivery success behavior', 'delivery success rate'],
}

function findCol(headers: string[], aliases: string[]): number {
  return headers.findIndex(h => aliases.includes(h.toLowerCase().trim().replace(/\s+/g, ' ')))
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return { headers: [], rows: [] }
  const parseRow = (line: string): string[] => {
    const cells: string[] = []
    let cell = '', inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) { cells.push(cell.trim()); cell = '' }
      else cell += ch
    }
    cells.push(cell.trim())
    return cells
  }
  return { headers: parseRow(lines[0]), rows: lines.slice(1).filter(l => l.trim()).map(parseRow) }
}

async function parseXLSX(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (raw.length < 2) return { headers: [], rows: [] }
  return { headers: raw[0].map(String), rows: raw.slice(1).map(r => r.map(String)) }
}

function normalizeWeek(raw: string, fallback: string): string {
  if (!raw) return fallback
  const c = raw.trim()
  if (/^\d{4}-W\d{2}$/.test(c)) return c
  const m1 = c.match(/^W(\d{1,2})[\s-](\d{4})$/i)
  if (m1) return `${m1[2]}-W${m1[1].padStart(2, '0')}`
  const m2 = c.match(/^(\d{4})[-\/](\d{1,2})$/)
  if (m2) return `${m2[1]}-W${m2[2].padStart(2, '0')}`
  const m3 = c.match(/^(\d{1,2})$/)
  if (m3) return `${fallback.split('-')[0]}-W${m3[1].padStart(2, '0')}`
  return fallback
}

function normalizeStanding(raw: string): string {
  const s = (raw ?? '').toLowerCase().trim()
  if (s.includes('fantastic') && (s.includes('plus') || s.includes('+'))) return 'FANTASTIC_PLUS'
  if (s.includes('fantastic')) return 'FANTASTIC'
  if (s.includes('great'))     return 'GREAT'
  if (s.includes('good'))      return 'GOOD'
  if (s.includes('fair'))      return 'FAIR'
  if (s.includes('poor'))      return 'POOR'
  return 'GOOD'
}

function weekFromFilename(filename: string): string {
  const m = filename.match(/(\d{4})-W(\d{2})/i)
  if (m) return `${m[1]}-W${m[2]}`
  const d = new Date()
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function detectFileType(filename: string): string {
  const f = filename.toLowerCase()
  if (f.includes('dvic'))                                            return 'dvic'
  if (f.includes('safety') || f.includes('at_stop') || f.includes('at-stop')) return 'at_stop_safety'
  if (f.includes('pps') || f.includes('daily_performance') || f.includes('pps_daily')) return 'pps_daily'
  if (f.includes('6week') || f.includes('6_week') || f.includes('trailing') || f.includes('6-week')) return 'weekly_trailing'
  if (f.endsWith('.pdf') && (f.includes('pod') || f.includes('quality'))) return 'pod_quality'
  if (f.endsWith('.pdf') && f.includes('scorecard'))                return 'scorecard_pdf'
  if (f.endsWith('.pdf'))                                            return 'scorecard_pdf'
  return 'weekly_overview'  // default: weekly overview CSV
}

function parseNum(val: string): number {
  const n = parseFloat((val ?? '').replace(/[%,]/g, ''))
  return isNaN(n) ? 0 : n
}

// ─── GET — return upload status for a week ────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const week = req.nextUrl.searchParams.get('week') ?? weekFromFilename('')
  const uploads = await prisma.scorecardFile.findMany({
    where: { week },
    select: { id: true, fileType: true, filename: true, rowsImported: true, rowsSkipped: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ week, uploads })
}

// ─── POST — parse and import uploaded file ────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData  = await req.formData()
  const file      = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const filename  = file.name
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  const fileType  = detectFileType(filename)
  const weekFallback = weekFromFilename(filename)

  let headers: string[] = []
  let rows: string[][]   = []
  let rawContent: string | null = null

  try {
    if (extension === 'xlsx' || extension === 'xls') {
      const buffer = await file.arrayBuffer()
      ;({ headers, rows } = await parseXLSX(buffer))
      // Store as base64 for XLSX
      rawContent = Buffer.from(buffer).toString('base64')
    } else if (extension === 'pdf') {
      // PDFs: store metadata only, no parsing
      headers = []
      rows    = []
      rawContent = null
    } else {
      rawContent = await file.text()
      ;({ headers, rows } = parseCSV(rawContent))
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Could not parse file: ${err.message}` }, { status: 400 })
  }

  // PDFs — log upload for reference only
  if (extension === 'pdf') {
    await prisma.scorecardFile.create({
      data: {
        filename, fileType, week: weekFallback,
        sizeBytes: file.size, rowsTotal: 0, rowsImported: 0, rowsSkipped: 0,
        content: null, uploadedById: session.user.id,
      },
    })
    return NextResponse.json({ imported: 0, skipped: 0, errors: [], week: weekFallback, isPdf: true, detectedColumns: [] })
  }

  if (!headers.length) {
    return NextResponse.json({ error: 'File is empty or unreadable' }, { status: 400 })
  }

  // Detect columns
  const col: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(COL)) {
    col[field] = findCol(headers, aliases)
  }

  if (col.daName === -1 && col.transponderId === -1) {
    return NextResponse.json({
      error: 'Could not find a DA name or Transporter ID column. Make sure you are uploading a Weekly Overview or scorecard CSV from Amazon DSP Portal.',
      detectedHeaders: headers,
    }, { status: 400 })
  }

  const get = (row: string[], field: string) => col[field] >= 0 ? (row[col[field]] ?? '').trim() : ''

  const imported: string[] = []
  const skipped:  string[] = []
  const errors:   { row: number; name: string; reason: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row     = rows[i]
    const rawName = get(row, 'daName').replace(/\s*\(.*?\)\s*$/, '').trim()
    const tid     = get(row, 'transponderId')
    if (!rawName && !tid) continue

    const week = normalizeWeek(get(row, 'week'), weekFallback)

    const da = await prisma.dA.findFirst({
      where: {
        OR: [
          ...(rawName ? [{ name: { equals: rawName, mode: 'insensitive' as const } }] : []),
          ...(tid     ? [{ transponderId: tid }] : []),
        ],
      },
    })

    if (!da) { skipped.push(rawName || tid); continue }

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

  // Save file record
  await prisma.scorecardFile.create({
    data: {
      filename, fileType, week: weekFallback,
      sizeBytes:    file.size,
      rowsTotal:    rows.length,
      rowsImported: imported.length,
      rowsSkipped:  skipped.length,
      content:      rawContent,
      uploadedById: session.user.id,
    },
  })

  return NextResponse.json({
    imported: imported.length,
    skipped:  skipped.length,
    errors,
    week: weekFallback,
    detectedColumns: Object.entries(col)
      .filter(([, idx]) => idx >= 0)
      .map(([field, idx]) => ({ field, header: headers[idx] })),
  })
}
