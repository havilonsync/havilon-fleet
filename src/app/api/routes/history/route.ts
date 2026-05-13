import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'


export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from      = searchParams.get('from') ?? '2020-01-01'
  const to        = searchParams.get('to')   ?? new Date().toISOString().slice(0, 10)
  const da        = searchParams.get('da')   ?? ''
  const van       = searchParams.get('van')  ?? ''
  const route     = searchParams.get('route') ?? ''
  const sortField = searchParams.get('sort') ?? 'date'
  const sortDir   = (searchParams.get('dir') ?? 'desc') as 'asc' | 'desc'
  const page      = parseInt(searchParams.get('page')  ?? '1')
  const limit     = parseInt(searchParams.get('limit') ?? '50')
  const isExport  = searchParams.get('export') === 'csv'

  // Build where clause
  const where: any = {
    date: { gte: from, lte: to },
  }

  if (da) {
    where.da = { name: { contains: da, mode: 'insensitive' } }
  }

  if (van) {
    where.vehicle = { vehicleNumber: { contains: van, mode: 'insensitive' } }
  }

  if (route) {
    where.routeCode = { contains: route, mode: 'insensitive' }
  }

  // Build orderBy
  const orderByMap: Record<string, any> = {
    date:          { date: sortDir },
    routeCode:     { routeCode: sortDir },
    routeType:     { routeType: sortDir },
    daName:        { da: { name: sortDir } },
    vehicleNumber: { vehicle: { vehicleNumber: sortDir } },
    stopCount:     { stopCount: sortDir },
    packageVolume: { packageVolume: sortDir },
    departureTime: { departureTime: sortDir },
    status:        { status: sortDir },
  }

  const orderBy = orderByMap[sortField] ?? { date: 'desc' }

  // CSV export — no pagination, all results
  if (isExport) {
    const all = await prisma.routeAssignment.findMany({
      where,
      orderBy,
      include: {
        da:      { select: { name: true } },
        vehicle: { select: { vehicleNumber: true } },
      },
    })

    const headers = [
      'Date', 'Day', 'Route Code', 'Route Type', 'DA Name',
      'Van Number', 'Stop Count', 'Package Volume',
      'Stage Location', 'Departure Time', 'Phone IMEI', 'Status'
    ]

    const csvRows = all.map(r => {
      const d = new Date(r.date + 'T12:00:00')
      return [
        r.date,
        d.toLocaleDateString('en-US', { weekday: 'long' }),
        r.routeCode,
        r.routeType,
        r.da?.name ?? '',
        r.vehicle?.vehicleNumber ?? '',
        r.stopCount ?? '',
        r.packageVolume ?? '',
        r.stageLocation ?? '',
        r.departureTime ?? '',
        r.phoneImei ?? '',
        r.status,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })

    const csv = [headers.join(','), ...csvRows].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="dispatch-history-${from}-to-${to}.csv"`,
      },
    })
  }

  // Normal paginated response
  const [assignments, total] = await Promise.all([
    prisma.routeAssignment.findMany({
      where,
      orderBy,
      skip:  (page - 1) * limit,
      take:  limit,
      include: {
        da:      { select: { name: true } },
        vehicle: { select: { vehicleNumber: true } },
      },
    }),
    prisma.routeAssignment.count({ where }),
  ])

  // Summary stats for the filtered period
  const allForSummary = await prisma.routeAssignment.findMany({
    where,
    select: {
      daId: true, vehicleId: true,
      stopCount: true, packageVolume: true,
    },
  })

  const uniqueDAs   = new Set(allForSummary.map(r => r.daId).filter(Boolean)).size
  const uniqueVans  = new Set(allForSummary.map(r => r.vehicleId).filter(Boolean)).size
  const totalStops  = allForSummary.reduce((s, r) => s + (r.stopCount ?? 0), 0)
  const totalPkgs   = allForSummary.reduce((s, r) => s + (r.packageVolume ?? 0), 0)

  const rows = assignments.map(r => ({
    id:            r.id,
    date:          r.date,
    routeCode:     r.routeCode,
    routeType:     r.routeType,
    daName:        r.da?.name,
    vehicleNumber: r.vehicle?.vehicleNumber,
    stopCount:     r.stopCount,
    packageVolume: r.packageVolume,
    stageLocation: r.stageLocation,
    departureTime: r.departureTime,
    phoneImei:     r.phoneImei,
    status:        r.status,
  }))

  return NextResponse.json({
    rows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    summary: {
      totalRoutes:     total,
      uniqueDAs,
      uniqueVans,
      totalStops,
      totalPackages:   totalPkgs,
      avgStopsPerRoute: total > 0 ? Math.round(totalStops / total) : 0,
    },
  })
}
