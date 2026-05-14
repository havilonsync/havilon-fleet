import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Flexible column aliases — covers Amazon DSP portal and common fleet CSV exports
const COLUMN_MAP: Record<string, string[]> = {
  vehicleNumber: ['unit #', 'unit#', 'unit number', 'vehicle number', 'vehicle id', 'fleet number', 'asset id', 'asset number', 'van #', 'van number', 'id'],
  vin:           ['vin', 'vehicle identification number', 'vin number', 'vin #'],
  make:          ['make', 'vehicle make', 'manufacturer', 'brand'],
  model:         ['model', 'vehicle model', 'model name'],
  year:          ['year', 'model year', 'vehicle year', 'yr', 'my'],
  licensePlate:  ['license plate', 'license #', 'license plate number', 'tag', 'tag number', 'plate', 'plate number', 'license'],
  status:        ['status', 'vehicle status', 'fleet status', 'condition'],
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
  if (['active', 'in service', 'operational', 'available', 'in use'].includes(s)) return 'ACTIVE'
  if (['grounded', 'out of service', 'oos', 'inactive', 'unavailable'].includes(s)) return 'GROUNDED'
  if (['in repair', 'in maintenance', 'maintenance', 'repair', 'shop'].includes(s)) return 'IN_REPAIR'
  if (['decommissioned', 'retired', 'sold', 'disposed'].includes(s)) return 'DECOMMISSIONED'
  return 'ACTIVE'
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

  // Resolve columns
  const col: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    col[field] = findColumn(headers, aliases)
  }

  if (col.vin === -1) {
    return NextResponse.json({
      error: 'Could not find a VIN column. Expected a column named "VIN" or "Vehicle Identification Number".',
      detectedHeaders: headers,
    }, { status: 400 })
  }
  if (col.vehicleNumber === -1) {
    return NextResponse.json({
      error: 'Could not find a vehicle number column. Expected "Unit #", "Vehicle Number", "Asset ID", or similar.',
      detectedHeaders: headers,
    }, { status: 400 })
  }

  const get = (row: string[], field: string) => {
    const idx = col[field]
    return idx >= 0 ? (row[idx] ?? '').trim() : ''
  }

  const imported: string[] = []
  const skipped:  string[] = []
  const errors:   { row: number; vin: string; reason: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row           = rows[i]
    const vin           = get(row, 'vin').toUpperCase()
    const vehicleNumber = get(row, 'vehicleNumber')

    if (!vin || !vehicleNumber) {
      errors.push({ row: i + 2, vin: vin || '(empty)', reason: 'Missing VIN or vehicle number — row skipped' })
      continue
    }
    if (vin.length < 10) {
      errors.push({ row: i + 2, vin, reason: `VIN "${vin}" is too short (minimum 10 characters)` })
      continue
    }

    const yearRaw = get(row, 'year')
    const year    = yearRaw ? parseInt(yearRaw) : new Date().getFullYear()
    if (isNaN(year) || year < 1990 || year > 2035) {
      errors.push({ row: i + 2, vin, reason: `Invalid year "${yearRaw}"` })
      continue
    }

    const exists = await prisma.vehicle.findFirst({ where: { OR: [{ vin }, { vehicleNumber }] } })
    if (exists) {
      skipped.push(vin)
      continue
    }

    try {
      await prisma.vehicle.create({
        data: {
          vin,
          vehicleNumber,
          licensePlate:  get(row, 'licensePlate') || undefined,
          make:          get(row, 'make')  || 'Unknown',
          model:         get(row, 'model') || 'Unknown',
          year,
          status:        normalizeStatus(get(row, 'status')) as any,
          odometerCurrent: 0,
        },
      })
      imported.push(vin)
    } catch (err: any) {
      const reason = err?.code === 'P2002'
        ? 'Duplicate VIN or vehicle number'
        : `Database error: ${err?.message ?? 'unknown'}`
      errors.push({ row: i + 2, vin, reason })
    }
  }

  return NextResponse.json({ imported: imported.length, skipped: skipped.length, errors })
}
