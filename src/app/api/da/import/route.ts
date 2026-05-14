import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Column aliases — Amazon DSP portal exact names listed first, then fallbacks
const COLUMN_MAP: Record<string, string[]> = {
  name:          ['name and id', 'name', 'full name', 'driver name', 'da name', 'employee name', 'associate name'],
  transponderId: ['transponderid', 'transponder id', 'transponder #', 'transponder number', 'transponder'],
  dlExpiry:      ['id expiration', 'dl expiry', 'dl expiration', 'license expiry', 'license expiration', 'expiration date'],
  phone:         ['personal phone number', 'phone', 'phone number', 'mobile', 'cell', 'cell phone', 'mobile number'],
  workPhone:     ['work phone number', 'work phone', 'office phone'],
  email:         ['email', 'email address', 'work email', 'e-mail'],
  status:        ['status', 'employment status', 'da status'],
  // kept for non-Amazon CSV fallback
  adpId:         ['adp id', 'adp#', 'adp number', 'employee id', 'ee id', 'employee #'],
  badgeId:       ['badge id', 'badge #', 'badge number', 'badge'],
  hireDate:      ['hire date', 'start date', 'employment date', 'date of hire', 'hired'],
  zipCode:       ['zip code', 'zip', 'postal code'],
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex(h => aliases.includes(h.toLowerCase().trim()))
}

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

  const headers = parseRow(lines[0])
  const rows    = lines.slice(1).filter(l => l.trim()).map(parseRow)
  return { headers, rows }
}

function normalizeStatus(raw: string): string {
  const s = (raw ?? '').toLowerCase().trim()
  if (['active', 'employed', 'current', 'working'].includes(s)) return 'ACTIVE'
  if (['inactive', 'onboarding', 'pending', 'new hire'].includes(s)) return 'INACTIVE'
  if (['on leave', 'leave', 'loa', 'fmla'].includes(s)) return 'ON_LEAVE'
  if (['terminated', 'term', 'separated', 'resigned', 'fired'].includes(s)) return 'TERMINATED'
  return 'ACTIVE'
}

function parseDate(raw: string): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return isNaN(d.getTime()) ? undefined : d
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['OWNER', 'OPS_MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const { headers, rows } = parseCSV(text)

  if (!headers.length || !rows.length) {
    return NextResponse.json({ error: 'File is empty or not a valid CSV' }, { status: 400 })
  }

  const col: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    col[field] = findColumn(headers, aliases)
  }

  if (col.name === -1) {
    return NextResponse.json({
      error: 'Could not find a Name column. Expected "Name", "Full Name", "Driver Name", or similar.',
      detectedHeaders: headers,
    }, { status: 400 })
  }

  const get = (row: string[], field: string) => {
    const idx = col[field]
    return idx >= 0 ? (row[idx] ?? '').trim() : ''
  }

  const imported: string[] = []
  const skipped:  string[] = []
  const errors:   { row: number; name: string; reason: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row  = rows[i]
    // Amazon exports "Name and ID" as "John Smith (DA-12345)" — strip the ID suffix
    const rawName = get(row, 'name')
    const name = rawName.replace(/\s*\(.*?\)\s*$/, '').trim()

    if (!name) {
      errors.push({ row: i + 2, name: '(empty)', reason: 'Missing name — row skipped' })
      continue
    }

    const email         = get(row, 'email')         || undefined
    const transponderId = get(row, 'transponderId') || undefined
    const adpId         = get(row, 'adpId')         || undefined

    // Skip duplicates by email or TransporterID
    const existing = await prisma.dA.findFirst({
      where: {
        OR: [
          ...(email         ? [{ email }]         : []),
          ...(transponderId ? [{ transponderId }] : []),
          ...(adpId         ? [{ adpId }]         : []),
        ],
      },
    })
    if (existing) {
      skipped.push(name)
      continue
    }

    const dlExpiry  = parseDate(get(row, 'dlExpiry'))
    const hireDate  = parseDate(get(row, 'hireDate'))
    const status    = normalizeStatus(get(row, 'status'))

    try {
      await prisma.dA.create({
        data: {
          name,
          email,
          phone:         get(row, 'phone')    || undefined,
          adpId,
          badgeId:       get(row, 'badgeId')  || undefined,
          transponderId,
          zipCode:       get(row, 'zipCode')  || undefined,
          dlExpiry,
          hireDate,
          status:        status as any,
          offDays:       [],
        },
      })
      imported.push(name)
    } catch (err: any) {
      const reason = err?.code === 'P2002'
        ? 'Duplicate record (email or ADP ID already exists)'
        : `Database error: ${err?.message ?? 'unknown'}`
      errors.push({ row: i + 2, name, reason })
    }
  }

  return NextResponse.json({ imported: imported.length, skipped: skipped.length, errors })
}
