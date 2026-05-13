/**
 * Havilon Fleet — Fraud Detection Engine
 * Runs on every repair save, invoice upload, and parts order.
 * All rules are configurable via FRAUD_RULES constants.
 */

import { Repair, FraudSeverity, RepairCategory  } from '@prisma/client'
import { subDays, differenceInHours } from 'date-fns'
import crypto from 'crypto'

import prisma from '@/lib/prisma'

// ─── Configurable Thresholds ──────────────────────────────────────────────────
export const FRAUD_RULES = {
  // How many same-category repairs on same VIN within N days triggers flag
  REPEAT_REPAIR_WINDOW_DAYS: 60,
  REPEAT_REPAIR_COUNT_THRESHOLD: 2,

  // Labor hour benchmarks per category (industry standard for fleet vehicles)
  LABOR_HOUR_BENCHMARKS: {
    TIRES: 2.0,
    BRAKES: 3.5,
    COLLISION: 8.0,
    ENGINE: 14.0,
    ELECTRICAL: 4.0,
    BODY: 6.0,
    SUSPENSION: 3.0,
    HVAC: 3.0,
    GLASS: 1.5,
    OTHER: 4.0,
  } as Record<string, number>,

  LABOR_EXCESS_MULTIPLIER: 1.5,      // flag if labor > benchmark * 1.5
  COST_VS_VALUE_THRESHOLD: 0.30,     // flag if repair > 30% of vehicle value
  HIGH_SHOP_RISK_SCORE: 70,          // shops above this score add to repair risk
  REPAIR_COMPLETED_TOO_FAST_HOURS: 2, // suspicious if complex repair done in < 2hrs
  DUPLICATE_INVOICE_WINDOW_DAYS: 90,  // check for invoice duplication within this window
} as const

// ─── Flag Type Constants ──────────────────────────────────────────────────────
export const FLAG = {
  DUPLICATE_INVOICE:           'DUPLICATE_INVOICE',
  REPEAT_REPAIR_SAME_AREA:     'REPEAT_REPAIR_SAME_AREA',
  EXCESSIVE_LABOR_HOURS:       'EXCESSIVE_LABOR_HOURS',
  PARTS_DOUBLE_BILLING_RISK:   'PARTS_DOUBLE_BILLING_RISK',
  MISSING_REQUIRED_PHOTOS:     'MISSING_REQUIRED_PHOTOS',
  HIGH_RISK_VENDOR:            'HIGH_RISK_VENDOR',
  COST_EXCEEDS_VALUE_THRESHOLD:'COST_EXCEEDS_VALUE_THRESHOLD',
  REPAIR_COMPLETED_TOO_FAST:   'REPAIR_COMPLETED_TOO_FAST',
  MISSING_INVOICE:             'MISSING_INVOICE',
  REPEAT_SAME_DRIVER:          'REPEAT_SAME_DRIVER',
  MULTIPLE_VENDORS_SAME_VIN:   'MULTIPLE_VENDORS_SAME_VIN',
  UNLINKED_PARTS_ORDER:        'UNLINKED_PARTS_ORDER',
  NO_ESTIMATE_PROVIDED:        'NO_ESTIMATE_PROVIDED',
} as const

type FlagType = typeof FLAG[keyof typeof FLAG]

interface FraudResult {
  score: number
  flags: FlagType[]
  details: Array<{ flag: FlagType; score: number; description: string; severity: FraudSeverity }>
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

export async function evaluateRepairFraud(repairId: string): Promise<FraudResult> {
  const repair = await prisma.repair.findUnique({
    where: { id: repairId },
    include: {
      vehicle: true,
      shop: true,
      requestedBy: true,
    },
  })

  if (!repair) throw new Error(`Repair ${repairId} not found`)

  const result: FraudResult = { score: 0, flags: [], details: [] }

  const addFlag = (flag: FlagType, score: number, description: string, severity: FraudSeverity) => {
    result.score += score
    result.flags.push(flag)
    result.details.push({ flag, score, description, severity })
  }

  // ── Rule 1: Duplicate Invoice Detection ─────────────────────────────────
  if (repair.invoiceHash) {
    const dupInvoice = await prisma.repair.findFirst({
      where: {
        invoiceHash: repair.invoiceHash,
        id: { not: repair.id },
        requestDate: { gte: subDays(new Date(), FRAUD_RULES.DUPLICATE_INVOICE_WINDOW_DAYS) },
      },
    })
    if (dupInvoice) {
      addFlag(
        FLAG.DUPLICATE_INVOICE,
        40,
        `Invoice hash matches repair ${dupInvoice.repairNumber} submitted on ${dupInvoice.requestDate.toDateString()}. Possible duplicate billing.`,
        FraudSeverity.CRITICAL
      )
    }
  }

  // ── Rule 2: Repeat Repair — Same VIN, Same Category ─────────────────────
  const recentSameCategory = await prisma.repair.findMany({
    where: {
      vehicleId: repair.vehicleId,
      category: repair.category,
      id: { not: repair.id },
      requestDate: { gte: subDays(repair.requestDate, FRAUD_RULES.REPEAT_REPAIR_WINDOW_DAYS) },
    },
  })

  if (recentSameCategory.length >= FRAUD_RULES.REPEAT_REPAIR_COUNT_THRESHOLD) {
    addFlag(
      FLAG.REPEAT_REPAIR_SAME_AREA,
      30,
      `Vehicle ${repair.vehicle.vehicleNumber} has had ${recentSameCategory.length + 1} ${repair.category} repairs in the last ${FRAUD_RULES.REPEAT_REPAIR_WINDOW_DAYS} days. This is repair #${recentSameCategory.length + 1} for this category.`,
      recentSameCategory.length >= 3 ? FraudSeverity.CRITICAL : FraudSeverity.WARNING
    )
  }

  // ── Rule 3: Excessive Labor Hours ────────────────────────────────────────
  if (repair.laborHours) {
    const benchmark = FRAUD_RULES.LABOR_HOUR_BENCHMARKS[repair.category] ?? 4.0
    const threshold = benchmark * FRAUD_RULES.LABOR_EXCESS_MULTIPLIER

    if (repair.laborHours > threshold) {
      const excessHours = repair.laborHours - benchmark
      const excessCost = excessHours * (repair.laborRate ?? 100)

      addFlag(
        FLAG.EXCESSIVE_LABOR_HOURS,
        25,
        `${repair.shop?.name ?? 'Shop'} billed ${repair.laborHours} hours. Industry benchmark for ${repair.category} is ${benchmark} hrs. Excess: ${excessHours.toFixed(1)} hrs (~$${excessCost.toFixed(0)} overcharge).`,
        FraudSeverity.WARNING
      )
    }
  }

  // ── Rule 4: Parts Already Purchased Internally ───────────────────────────
  const internalParts = await prisma.partsOrder.findMany({
    where: {
      vehicleId: repair.vehicleId,
      dateOrdered: { gte: subDays(repair.requestDate, 21) },
    },
  })

  if (internalParts.length > 0 && repair.partsCost && repair.partsCost > 0) {
    addFlag(
      FLAG.PARTS_DOUBLE_BILLING_RISK,
      20,
      `${internalParts.length} internal parts order(s) exist for this vehicle within 21 days of repair request. Cross-reference shop invoice line items against: ${internalParts.map(p => p.orderNumber).join(', ')}.`,
      FraudSeverity.WARNING
    )
  }

  // ── Rule 5: Missing Required Photos ─────────────────────────────────────
  const hasBeforePhotos = repair.photosBefore.length > 0
  const hasAfterPhotos = repair.photosAfter.length > 0
  const hasInvoice = !!repair.invoiceUrl

  if (!hasBeforePhotos || !hasAfterPhotos) {
    const missing = []
    if (!hasBeforePhotos) missing.push('before photos')
    if (!hasAfterPhotos) missing.push('after photos')

    addFlag(
      FLAG.MISSING_REQUIRED_PHOTOS,
      15,
      `Missing required documentation: ${missing.join(', ')}. Repairs should not be approved or paid without complete photo evidence.`,
      FraudSeverity.WARNING
    )
  }

  // ── Rule 6: High-Risk Vendor ─────────────────────────────────────────────
  if (repair.shop && repair.shop.fraudScore >= FRAUD_RULES.HIGH_SHOP_RISK_SCORE) {
    addFlag(
      FLAG.HIGH_RISK_VENDOR,
      15,
      `${repair.shop.name} has a fraud risk score of ${repair.shop.fraudScore}/100. Previous flags: ${(repair.shop.fraudFlags as string[]).join(', ')}.`,
      FraudSeverity.WARNING
    )
  }

  // ── Rule 7: Cost Exceeds Vehicle Value Threshold ─────────────────────────
  if (repair.totalCost && repair.vehicle.estimatedValue) {
    const costRatio = repair.totalCost / repair.vehicle.estimatedValue
    if (costRatio > FRAUD_RULES.COST_VS_VALUE_THRESHOLD) {
      addFlag(
        FLAG.COST_EXCEEDS_VALUE_THRESHOLD,
        25,
        `Repair cost $${repair.totalCost.toFixed(0)} is ${(costRatio * 100).toFixed(0)}% of vehicle estimated value ($${repair.vehicle.estimatedValue.toFixed(0)}). Consider whether repair is cost-effective.`,
        FraudSeverity.WARNING
      )
    }
  }

  // ── Rule 8: Repair Completed Suspiciously Fast ───────────────────────────
  if (repair.requestDate && repair.completionDate && repair.laborHours) {
    const elapsedHours = differenceInHours(repair.completionDate, repair.requestDate)
    const expectedMinHours = (repair.laborHours ?? 0) * 0.8

    if (elapsedHours < FRAUD_RULES.REPAIR_COMPLETED_TOO_FAST_HOURS && repair.laborHours > 4) {
      addFlag(
        FLAG.REPAIR_COMPLETED_TOO_FAST,
        15,
        `Repair marked complete in ${elapsedHours} hours but billed ${repair.laborHours} labor hours. Minimum expected elapsed time would be ${expectedMinHours.toFixed(1)} hours.`,
        FraudSeverity.WARNING
      )
    }
  }

  // ── Rule 9: Missing Invoice ───────────────────────────────────────────────
  if (!hasInvoice && repair.totalCost && repair.totalCost > 0) {
    addFlag(
      FLAG.MISSING_INVOICE,
      10,
      `No invoice uploaded for repair totaling $${repair.totalCost.toFixed(0)}. Payment should be blocked until invoice is received.`,
      FraudSeverity.WARNING
    )
  }

  // ── Rule 10: Multiple Vendors Same VIN Simultaneously ────────────────────
  const overlappingRepairs = await prisma.repair.findMany({
    where: {
      vehicleId: repair.vehicleId,
      id: { not: repair.id },
      status: { in: ['IN_PROGRESS', 'APPROVED'] },
      shopId: { not: repair.shopId ?? undefined },
    },
    include: { shop: true },
  })

  if (overlappingRepairs.length > 0) {
    const shopNames = overlappingRepairs.map(r => r.shop?.name).filter(Boolean).join(', ')
    addFlag(
      FLAG.MULTIPLE_VENDORS_SAME_VIN,
      20,
      `Vehicle ${repair.vehicle.vehicleNumber} currently has active repairs at multiple vendors simultaneously: ${shopNames}. Verify there is no overlap in work scope.`,
      FraudSeverity.WARNING
    )
  }

  // ── Cap score at 100 ─────────────────────────────────────────────────────
  result.score = Math.min(result.score, 100)

  // ── Persist flags to database ────────────────────────────────────────────
  await prisma.repair.update({
    where: { id: repairId },
    data: {
      fraudScore: result.score,
      fraudFlags: result.flags,
    },
  })

  // ── Create FraudEvent records for new flags ───────────────────────────────
  for (const detail of result.details) {
    const exists = await prisma.fraudEvent.findFirst({
      where: {
        repairId,
        flagType: detail.flag,
        isActive: true,
      },
    })

    if (!exists) {
      await prisma.fraudEvent.create({
        data: {
          entityType: 'repair',
          entityId: repairId,
          repairId,
          flagType: detail.flag,
          severity: detail.severity,
          riskScore: detail.score,
          description: detail.description,
        },
      })
    }
  }

  // ── Notify owner if score is critical ────────────────────────────────────
  if (result.score >= 60) {
    await createOwnerFraudAlert(repair, result)
  }

  return result
}

// ─── Parts Fraud Scanner ─────────────────────────────────────────────────────

export async function evaluatePartsFraud(partsOrderId: string) {
  const order = await prisma.partsOrder.findUnique({
    where: { id: partsOrderId },
    include: { vehicle: true, repair: true },
  })

  if (!order) return

  let isDuplicate = false

  // Check for same part number ordered for same vehicle recently
  const duplicatePart = await prisma.partsOrder.findFirst({
    where: {
      vehicleId: order.vehicleId,
      partNumber: order.partNumber,
      id: { not: order.id },
      dateOrdered: { gte: subDays(order.dateOrdered, 60) },
    },
  })

  if (duplicatePart) {
    isDuplicate = true
    await prisma.fraudEvent.create({
      data: {
        entityType: 'parts',
        entityId: order.id,
        flagType: FLAG.PARTS_DOUBLE_BILLING_RISK,
        severity: FraudSeverity.WARNING,
        riskScore: 55,
        description: `Duplicate part order detected: ${order.partName} (${order.partNumber}) was previously ordered for ${order.vehicle.vehicleNumber} (${duplicatePart.orderNumber}) within 60 days.`,
      },
    })
  }

  await prisma.partsOrder.update({
    where: { id: partsOrderId },
    data: { isDuplicateFlag: isDuplicate },
  })
}

// ─── Invoice Hash Generator ───────────────────────────────────────────────────
// Used to detect duplicate invoice files even if re-named

export function generateInvoiceHash(fileBuffer: Buffer): string {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex')
}

// ─── Vendor Risk Score Recalculator ──────────────────────────────────────────

export async function recalculateShopRiskScore(shopId: string) {
  const shop = await prisma.repairShop.findUnique({ where: { id: shopId } })
  if (!shop) return

  const repairs = await prisma.repair.findMany({
    where: { shopId, requestDate: { gte: subDays(new Date(), 90) } },
  })

  if (repairs.length === 0) return

  let score = 0
  const flags: string[] = []

  // High average invoice
  const avgCost = repairs.reduce((s, r) => s + (r.totalCost ?? 0), 0) / repairs.length
  if (avgCost > 1500) { score += 20; flags.push('HIGH_AVG_INVOICE') }

  // High repeat rate
  const repeats = repairs.filter(r => r.isRepeatRepair).length
  const repeatRate = repeats / repairs.length
  if (repeatRate > 0.25) { score += 25; flags.push('HIGH_REPEAT_RATE') }

  // Fraud-scored repairs
  const highFraudRepairs = repairs.filter(r => r.fraudScore >= 60).length
  if (highFraudRepairs > 2) { score += 30; flags.push('MULTIPLE_HIGH_FRAUD_REPAIRS') }

  // Missing photos across repairs
  const noPhotoRepairs = repairs.filter(r => r.photosBefore.length === 0 || r.photosAfter.length === 0).length
  if (noPhotoRepairs > repairs.length * 0.3) { score += 15; flags.push('FREQUENT_MISSING_PHOTOS') }

  await prisma.repairShop.update({
    where: { id: shopId },
    data: {
      fraudScore: Math.min(score, 100),
      fraudFlags: flags,
      totalRepairs: repairs.length,
      avgRepairCost: avgCost,
      repeatRepairRate: repeatRate,
      lifetimeSpend: repairs.reduce((s, r) => s + (r.totalCost ?? 0), 0),
    },
  })
}

// ─── Owner Notification ───────────────────────────────────────────────────────

async function createOwnerFraudAlert(repair: any, result: FraudResult) {
  const owners = await prisma.user.findMany({ where: { role: 'OWNER', isActive: true } })

  for (const owner of owners) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: owner.id,
        repairId: repair.id,
        type: 'FRAUD_ALERT',
        isResolved: false,
      },
    })

    if (!existing) {
      await prisma.notification.create({
        data: {
          userId: owner.id,
          type: 'FRAUD_ALERT',
          title: `🚨 Fraud Alert — ${repair.repairNumber} — Risk Score: ${result.score}/100`,
          body: `${result.flags.length} fraud flag(s) detected on repair ${repair.repairNumber}. Flags: ${result.flags.join(', ')}. Immediate review recommended before any payment is authorized.`,
          entityId: repair.id,
          entityType: 'repair',
          repairId: repair.id,
          channel: 'both',
        },
      })
    }
  }
}

// ─── Batch Scanner (nightly job) ──────────────────────────────────────────────

export async function runNightlyFraudScan() {
  console.log('🔍 Running nightly fraud scan...')

  const openRepairs = await prisma.repair.findMany({
    where: {
      status: { in: ['PENDING_REVIEW', 'AWAITING_ESTIMATE', 'APPROVED', 'IN_PROGRESS'] },
    },
    select: { id: true, repairNumber: true },
  })

  let flagged = 0
  for (const repair of openRepairs) {
    const result = await evaluateRepairFraud(repair.id)
    if (result.flags.length > 0) {
      flagged++
      console.log(`  ⚠️  ${repair.repairNumber} — Score: ${result.score} — Flags: ${result.flags.join(', ')}`)
    }
  }

  // Recalculate all shop scores
  const shops = await prisma.repairShop.findMany({ select: { id: true } })
  for (const shop of shops) {
    await recalculateShopRiskScore(shop.id)
  }

  console.log(`✅ Scan complete. ${flagged}/${openRepairs.length} repairs flagged.`)
}
