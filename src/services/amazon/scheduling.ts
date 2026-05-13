/**
 * Havilon Fleet — Amazon Scheduling & Route Data Service
 * 
 * Pulls route assignments, daily schedule, and manifest data
 * from the Scheduling section of logistics.amazon.com
 * 
 * Endpoints to probe (based on portal structure):
 * /scheduling/api/v1/getWeeklySchedule
 * /scheduling/api/v1/getDailyManifest
 * /scheduling/api/v1/getRouteAssignments
 */

import { callAmazonAPI } from './auth'
import { format, startOfWeek, addDays } from 'date-fns'

import prisma from '@/lib/prisma'
const DSP_CODE = process.env.AMAZON_DSP_CODE ?? 'HAVL'
const STATION_CODE = process.env.AMAZON_STATION_CODE ?? 'DDF4'

// ─── Route Assignment Types ───────────────────────────────────────────────────

export interface RouteAssignment {
  date: string
  routeCode: string
  routeType: string       // 'BASE' | 'SURGE' | 'RESCUE'
  daId?: string
  daName?: string
  vanId?: string
  stopCount?: number
  packageVolume?: number
  destination?: string
  stageLocation?: string
  departureTime?: string
  status: string
}

// ─── Fetch today's route assignments ─────────────────────────────────────────

export async function fetchDailyRoutes(date?: Date): Promise<RouteAssignment[]> {
  const targetDate = date ?? new Date()
  const dateStr = format(targetDate, 'yyyy-MM-dd')
  
  console.log(`🗺️ Fetching route assignments for ${dateStr}...`)

  try {
    // Try the scheduling API endpoints
    const [weeklySchedule, routeData] = await Promise.allSettled([
      callAmazonAPI('/scheduling/api/v1/getWeeklySchedule', {
        dsp: DSP_CODE,
        station: STATION_CODE,
        date: dateStr,
      }),
      callAmazonAPI('/scheduling/api/v1/getDailyManifest', {
        dsp: DSP_CODE,
        station: STATION_CODE,
        date: dateStr,
      }),
    ])

    const routes: RouteAssignment[] = []

    if (weeklySchedule.status === 'fulfilled' && weeklySchedule.value) {
      routes.push(...normalizeScheduleData(weeklySchedule.value, dateStr))
    }

    if (routeData.status === 'fulfilled' && routeData.value) {
      routes.push(...normalizeManifestData(routeData.value, dateStr))
    }

    // Deduplicate by route code
    const seen = new Set<string>()
    return routes.filter(r => {
      if (seen.has(r.routeCode)) return false
      seen.add(r.routeCode)
      return true
    })

  } catch (err) {
    console.error('Failed to fetch route data:', err)
    return []
  }
}

// ─── Normalize schedule API responses ────────────────────────────────────────

function normalizeScheduleData(data: any, date: string): RouteAssignment[] {
  const rows = data?.schedules ?? data?.assignments ?? data?.routes ?? data?.data?.rows ?? []
  
  return rows.map((row: any) => ({
    date,
    routeCode: row.routeCode ?? row.route ?? row.routeId ?? '',
    routeType: row.routeType ?? row.type ?? 'BASE',
    daId: row.associateId ?? row.daId ?? row.transporterId,
    daName: row.associateName ?? row.daName ?? row.name,
    vanId: row.vehicleId ?? row.vanId ?? row.vehicle,
    stopCount: parseInt(row.stopCount ?? row.stops ?? 0),
    packageVolume: parseInt(row.packageCount ?? row.packages ?? row.volume ?? 0),
    destination: row.destination ?? row.area ?? row.zone,
    stageLocation: row.stageLocation ?? row.stagingArea ?? row.stl,
    departureTime: row.departureTime ?? row.startTime ?? row.dispatchTime,
    status: row.status ?? 'SCHEDULED',
  })).filter((r: RouteAssignment) => r.routeCode)
}

function normalizeManifestData(data: any, date: string): RouteAssignment[] {
  const rows = data?.manifest ?? data?.routes ?? data?.data ?? []
  return normalizeScheduleData({ routes: rows }, date)
}

// ─── Sync today's routes to database ─────────────────────────────────────────

export async function syncDailyRoutesToDatabase(date?: Date): Promise<{
  synced: number
  prePopulated: number
}> {
  const targetDate = date ?? new Date()
  const dateStr = format(targetDate, 'yyyy-MM-dd')
  const routes = await fetchDailyRoutes(targetDate)

  let prePopulated = 0

  for (const route of routes) {
    // Find matching DA by Amazon ID or name
    const da = route.daId ? await prisma.dA.findFirst({
      where: {
        OR: [
          { transponderId: route.daId },
          { name: { equals: route.daName, mode: 'insensitive' } },
        ],
      },
    }) : null

    // Find matching vehicle by Amazon vehicle ID or van number
    const vehicle = route.vanId ? await prisma.vehicle.findFirst({
      where: {
        OR: [
          { vehicleNumber: { contains: route.vanId, mode: 'insensitive' } },
          { vin: { contains: route.vanId, mode: 'insensitive' } },
        ],
      },
    }) : null

    // Upsert route record
    await prisma.routeAssignment.upsert({
      where: { date_routeCode: { date: dateStr, routeCode: route.routeCode } },
      update: {
        routeType: route.routeType,
        daId: da?.id,
        vehicleId: vehicle?.id,
        stopCount: route.stopCount,
        packageVolume: route.packageVolume,
        destination: route.destination,
        stageLocation: route.stageLocation,
        departureTime: route.departureTime,
        status: route.status,
        amazonDaId: route.daId,
        syncedAt: new Date(),
      },
      create: {
        date: dateStr,
        routeCode: route.routeCode,
        routeType: route.routeType,
        daId: da?.id,
        vehicleId: vehicle?.id,
        stopCount: route.stopCount,
        packageVolume: route.packageVolume,
        destination: route.destination,
        stageLocation: route.stageLocation,
        departureTime: route.departureTime,
        status: route.status,
        amazonDaId: route.daId,
        syncedAt: new Date(),
      },
    })

    if (da || vehicle) prePopulated++
  }

  console.log(`✅ Synced ${routes.length} routes for ${dateStr}. ${prePopulated} pre-populated with DA/Van data.`)
  return { synced: routes.length, prePopulated }
}

// ─── Fetch associates from Amazon ─────────────────────────────────────────────
// Cross-reference with our DA roster to catch new hires and terminations

export async function fetchAmazonAssociates(): Promise<any[]> {
  try {
    const data = await callAmazonAPI('/associates/api/v1/getAssociates', {
      dsp: DSP_CODE,
      station: STATION_CODE,
    })

    const associates = data?.associates ?? data?.data ?? data?.rows ?? []
    return associates.map((a: any) => ({
      amazonId: a.associateId ?? a.id ?? a.transporterId,
      name: a.name ?? a.associateName ?? a.fullName,
      status: a.status ?? a.employmentStatus ?? 'ACTIVE',
      role: a.role ?? a.position ?? 'DA',
      startDate: a.startDate ?? a.hireDate,
      transponderId: a.transponderId ?? a.badgeId,
    }))
  } catch (err) {
    console.error('Failed to fetch associates from Amazon:', err)
    return []
  }
}

// ─── Check for roster discrepancies ───────────────────────────────────────────

export async function auditRosterAgainstAmazon(): Promise<{
  newInAmazon: any[]      // In Amazon but not in our system
  missingFromAmazon: any[] // In our system but not in Amazon (possible terminations)
}> {
  const [amazonAssociates, ourDAs] = await Promise.all([
    fetchAmazonAssociates(),
    prisma.dA.findMany({ where: { status: 'ACTIVE' } }),
  ])

  const amazonIds = new Set(amazonAssociates.map(a => a.transponderId).filter(Boolean))
  const ourTransponderIds = new Set(ourDAs.map(d => d.transponderId).filter(Boolean))

  const newInAmazon = amazonAssociates.filter(
    a => a.transponderId && !ourTransponderIds.has(a.transponderId)
  )

  const missingFromAmazon = ourDAs.filter(
    d => d.transponderId && !amazonIds.has(d.transponderId)
  )

  if (newInAmazon.length > 0) {
    console.log(`⚠️  ${newInAmazon.length} DAs found in Amazon not in our system:`, newInAmazon.map(a => a.name))
  }

  if (missingFromAmazon.length > 0) {
    console.log(`⚠️  ${missingFromAmazon.length} active DAs in our system missing from Amazon:`, missingFromAmazon.map(d => d.name))
  }

  return { newInAmazon, missingFromAmazon }
}
