import { PrismaClient, UserRole, VehicleStatus, RepairStatus, RepairCategory, FraudSeverity, ApprovalTier } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Havilon Fleet database...')

  // ── Users ────────────────────────────────────────────────────────────────
  const owner = await prisma.user.upsert({
    where: { email: 'owner@havilon.com' },
    update: {},
    create: {
      email: 'owner@havilon.com',
      name: 'J. Havilon',
      role: UserRole.OWNER,
    },
  })

  const opsManager = await prisma.user.upsert({
    where: { email: 'ops@havilon.com' },
    update: {},
    create: {
      email: 'ops@havilon.com',
      name: 'Mike Santos',
      role: UserRole.OPS_MANAGER,
    },
  })

  const driver1 = await prisma.user.upsert({
    where: { email: 'marcus@havilon.com' },
    update: {},
    create: { email: 'marcus@havilon.com', name: 'Marcus Williams', role: UserRole.MECHANIC },
  })

  const driver2 = await prisma.user.upsert({
    where: { email: 'dana@havilon.com' },
    update: {},
    create: { email: 'dana@havilon.com', name: 'Dana Cruz', role: UserRole.MECHANIC },
  })

  const accounting = await prisma.user.upsert({
    where: { email: 'accounting@havilon.com' },
    update: {},
    create: { email: 'accounting@havilon.com', name: 'Taylor Park', role: UserRole.ACCOUNTING },
  })

  // ── Repair Shops ─────────────────────────────────────────────────────────
  const premierAuto = await prisma.repairShop.upsert({
    where: { id: 'shop-premier' },
    update: {},
    create: {
      id: 'shop-premier',
      name: 'Premier Auto',
      address: '4821 Industrial Blvd, Grand Prairie, TX 75050',
      phone: '(972) 555-0182',
      contactPerson: 'Ray Deluca',
      email: 'ray@premierauto.com',
      categories: ['COLLISION', 'BODY', 'TIRES'],
      totalRepairs: 18,
      avgRepairCost: 1840,
      avgCompletionHours: 6.2,
      repeatRepairRate: 0.38,
      lifetimeSpend: 33120,
      fraudScore: 91,
      fraudFlags: ['DUPLICATE_INVOICE', 'REPEAT_REPAIR_PATTERN', 'HIGH_AVG_INVOICE'],
    },
  })

  const quickFix = await prisma.repairShop.upsert({
    where: { id: 'shop-quickfix' },
    update: {},
    create: {
      id: 'shop-quickfix',
      name: 'Quick Fix LLC',
      address: '201 Commerce St, Arlington, TX 76010',
      phone: '(817) 555-0244',
      contactPerson: 'Jimmy Torres',
      email: 'jimmy@quickfixllc.com',
      categories: ['BRAKES', 'TIRES', 'ENGINE'],
      totalRepairs: 11,
      avgRepairCost: 1240,
      avgCompletionHours: 7.1,
      repeatRepairRate: 0.22,
      lifetimeSpend: 13640,
      fraudScore: 72,
      fraudFlags: ['EXCESSIVE_LABOR_HOURS'],
    },
  })

  const cityFleet = await prisma.repairShop.upsert({
    where: { id: 'shop-cityfleet' },
    update: {},
    create: {
      id: 'shop-cityfleet',
      name: 'City Fleet Services',
      address: '889 Main St, Dallas, TX 75201',
      phone: '(214) 555-0399',
      contactPerson: 'Sandra Lee',
      email: 'sandra@cityfleet.com',
      categories: ['ENGINE', 'ELECTRICAL', 'HVAC'],
      totalRepairs: 14,
      avgRepairCost: 680,
      repeatRepairRate: 0.08,
      lifetimeSpend: 9520,
      fraudScore: 28,
      fraudFlags: [],
    },
  })

  const apexTire = await prisma.repairShop.upsert({
    where: { id: 'shop-apex' },
    update: {},
    create: {
      id: 'shop-apex',
      name: 'Apex Tire & Auto',
      address: '3301 Pioneer Pkwy, Arlington, TX 76013',
      phone: '(817) 555-0511',
      contactPerson: 'Deb Nguyen',
      email: 'deb@apextire.com',
      categories: ['TIRES', 'BRAKES', 'SUSPENSION'],
      totalRepairs: 9,
      avgRepairCost: 490,
      repeatRepairRate: 0.11,
      lifetimeSpend: 4410,
      fraudScore: 34,
      fraudFlags: [],
    },
  })

  // ── Vehicles ─────────────────────────────────────────────────────────────
  const vehicles = [
    { vin: '4T1BF3EK9HU123456', vehicleNumber: 'VAN-014', make: 'Ford', model: 'Transit 250', year: 2022, odometerCurrent: 88420, estimatedValue: 28000, status: VehicleStatus.ACTIVE, totalLifetimeRepairCost: 12840, driverId: driver1.id },
    { vin: '1FTFW1ET3BKD12345', vehicleNumber: 'VAN-007', make: 'Ford', model: 'Transit 250', year: 2021, odometerCurrent: 72100, estimatedValue: 25000, status: VehicleStatus.IN_REPAIR, totalLifetimeRepairCost: 6420, driverId: driver2.id },
    { vin: '3GNBABFW8EL234567', vehicleNumber: 'VAN-022', make: 'Ford', model: 'Transit 350', year: 2022, odometerCurrent: 65300, estimatedValue: 30000, status: VehicleStatus.ACTIVE, totalLifetimeRepairCost: 2140, driverId: null },
    { vin: '5TDJKRFH3BS678901', vehicleNumber: 'VAN-031', make: 'Ford', model: 'Transit 250', year: 2020, odometerCurrent: 104800, estimatedValue: 18000, status: VehicleStatus.IN_REPAIR, totalLifetimeRepairCost: 18200, driverId: null },
    { vin: '2HGFC2F62LH234890', vehicleNumber: 'VAN-003', make: 'Ford', model: 'Transit 350', year: 2023, odometerCurrent: 41200, estimatedValue: 34000, status: VehicleStatus.ACTIVE, totalLifetimeRepairCost: 1200, driverId: null },
    { vin: 'JTEBU5JR9G5406123', vehicleNumber: 'VAN-019', make: 'Ford', model: 'Transit 150', year: 2021, odometerCurrent: 78900, estimatedValue: 22000, status: VehicleStatus.GROUNDED, isGrounded: true, groundedReason: 'Pending engine repair authorization', totalLifetimeRepairCost: 8900, driverId: null },
  ]

  const createdVehicles: Record<string, any> = {}
  for (const v of vehicles) {
    const created = await prisma.vehicle.upsert({
      where: { vin: v.vin },
      update: {},
      create: v,
    })
    createdVehicles[v.vehicleNumber] = created
  }

  // ── Repairs ──────────────────────────────────────────────────────────────
  const van14 = createdVehicles['VAN-014']
  const van07 = createdVehicles['VAN-007']
  const van22 = createdVehicles['VAN-022']
  const van31 = createdVehicles['VAN-031']
  const van03 = createdVehicles['VAN-003']

  const repair2041 = await prisma.repair.upsert({
    where: { repairNumber: 'R-2041' },
    update: {},
    create: {
      repairNumber: 'R-2041',
      vehicleId: van14.id,
      shopId: premierAuto.id,
      requestedById: opsManager.id,
      category: RepairCategory.COLLISION,
      status: RepairStatus.DISPUTED,
      approvalTier: ApprovalTier.TIER_4_EXECUTIVE,
      damageType: 'Front-right panel, bumper',
      description: 'Collision damage to front-right panel and bumper. Third collision repair on this vehicle in 90 days.',
      requestDate: new Date('2025-05-01'),
      laborHours: 12.0,
      laborRate: 120,
      laborCost: 1440,
      partsCost: 840,
      estimatedCost: 2600,
      totalCost: 2840,
      fraudScore: 94,
      fraudFlags: ['DUPLICATE_INVOICE', 'REPEAT_REPAIR_SAME_AREA', 'MISSING_PHOTO_AFTER', 'HIGH_RISK_VENDOR'],
      requiresOwnerApproval: true,
      invoiceHash: 'hash_inv8821_duplicate',
      isRepeatRepair: true,
      driverId: driver1.id,
    },
  })

  const repair2038 = await prisma.repair.upsert({
    where: { repairNumber: 'R-2038' },
    update: {},
    create: {
      repairNumber: 'R-2038',
      vehicleId: van07.id,
      shopId: quickFix.id,
      requestedById: driver2.id,
      category: RepairCategory.BRAKES,
      status: RepairStatus.PENDING_REVIEW,
      approvalTier: ApprovalTier.TIER_3_OWNER,
      description: 'Front and rear brake replacement. Pads, rotors, calipers.',
      requestDate: new Date('2025-05-04'),
      laborHours: 8.5,
      laborRate: 110,
      laborCost: 935,
      partsCost: 180,
      estimatedCost: 1100,
      totalCost: 1180,
      fraudScore: 71,
      fraudFlags: ['EXCESSIVE_LABOR_HOURS', 'HIGH_RISK_VENDOR'],
      requiresOwnerApproval: true,
      driverId: driver2.id,
      photosBefore: ['https://drive.google.com/file/d/mock-before-1'],
      photosDuring: ['https://drive.google.com/file/d/mock-during-1'],
    },
  })

  const repair2035 = await prisma.repair.upsert({
    where: { repairNumber: 'R-2035' },
    update: {},
    create: {
      repairNumber: 'R-2035',
      vehicleId: van22.id,
      shopId: apexTire.id,
      requestedById: opsManager.id,
      approvedById: opsManager.id,
      category: RepairCategory.TIRES,
      status: RepairStatus.APPROVED,
      approvalTier: ApprovalTier.TIER_2_SECONDARY,
      description: 'Replace all four tires. Wear beyond safe threshold.',
      requestDate: new Date('2025-05-03'),
      laborHours: 1.5,
      laborRate: 95,
      laborCost: 142.50,
      partsCost: 480,
      totalCost: 622.50,
      fraudScore: 5,
      fraudFlags: [],
      photosBefore: ['https://drive.google.com/file/d/mock-before-2'],
      photosDuring: ['https://drive.google.com/file/d/mock-during-2'],
      photosAfter: ['https://drive.google.com/file/d/mock-after-2'],
      photosWideAngle: ['https://drive.google.com/file/d/mock-wide-2'],
      photosCloseUp: ['https://drive.google.com/file/d/mock-close-2'],
    },
  })

  const repair2029 = await prisma.repair.upsert({
    where: { repairNumber: 'R-2029' },
    update: {},
    create: {
      repairNumber: 'R-2029',
      vehicleId: van31.id,
      shopId: cityFleet.id,
      requestedById: opsManager.id,
      approvedById: owner.id,
      category: RepairCategory.ENGINE,
      status: RepairStatus.IN_PROGRESS,
      approvalTier: ApprovalTier.TIER_4_EXECUTIVE,
      description: 'Engine rebuild. Rod knock detected. High mileage vehicle.',
      requestDate: new Date('2025-04-25'),
      laborHours: 18.0,
      laborRate: 135,
      laborCost: 2430,
      partsCost: 1200,
      estimatedCost: 3100,
      totalCost: 3200,
      fraudScore: 12,
      fraudFlags: [],
      requiresOwnerApproval: true,
      ownerApproved: true,
    },
  })

  const repair2044 = await prisma.repair.upsert({
    where: { repairNumber: 'R-2044' },
    update: {},
    create: {
      repairNumber: 'R-2044',
      vehicleId: van03.id,
      shopId: apexTire.id,
      requestedById: opsManager.id,
      category: RepairCategory.TIRES,
      status: RepairStatus.PENDING_REVIEW,
      approvalTier: ApprovalTier.TIER_2_SECONDARY,
      description: 'Replace 4 tires — 265/70R17. Parts pre-ordered via Amazon.',
      requestDate: new Date('2025-05-06'),
      laborHours: 1.5,
      laborRate: 95,
      laborCost: 142.50,
      partsCost: 480,
      totalCost: 622.50,
      fraudScore: 65,
      fraudFlags: ['PARTS_DOUBLE_BILLING_RISK'],
      photosBefore: ['https://drive.google.com/file/d/mock-before-3'],
    },
  })

  // ── Parts Orders ─────────────────────────────────────────────────────────
  await prisma.partsOrder.upsert({
    where: { orderNumber: 'PO-441' },
    update: {},
    create: {
      orderNumber: 'PO-441',
      vehicleId: van03.id,
      repairId: repair2044.id,
      orderedById: opsManager.id,
      partName: 'Tire 265/70R17 — Michelin Defender LTX',
      partNumber: '265-70R17-MDL',
      quantity: 4,
      unitCost: 120,
      totalCost: 480,
      vendor: 'Amazon',
      amazonOrderNumber: '114-9921-8821044',
      dateOrdered: new Date('2025-05-03'),
      dateDelivered: new Date('2025-05-05'),
      isDuplicateFlag: true,
      notes: 'Shop Apex Tire also billing for tires on R-2044 — verify double billing',
    },
  })

  await prisma.partsOrder.upsert({
    where: { orderNumber: 'PO-438' },
    update: {},
    create: {
      orderNumber: 'PO-438',
      vehicleId: van14.id,
      repairId: repair2041.id,
      orderedById: opsManager.id,
      partName: 'Front Bumper Assembly — Ford Transit',
      partNumber: 'FT-BUMPER-2022-FR',
      quantity: 1,
      unitCost: 320,
      totalCost: 320,
      vendor: 'Amazon',
      amazonOrderNumber: '112-4481-2239012',
      dateOrdered: new Date('2025-04-29'),
      dateDelivered: new Date('2025-05-01'),
      isDuplicateFlag: true,
      notes: 'Premier Auto invoice R-2041 also charges $340 for bumper assembly',
    },
  })

  await prisma.partsOrder.upsert({
    where: { orderNumber: 'PO-435' },
    update: {},
    create: {
      orderNumber: 'PO-435',
      vehicleId: van07.id,
      repairId: repair2038.id,
      orderedById: driver2.id,
      partName: 'Brake Pads — Front — OEM',
      partNumber: 'BP-FORD-TRANSIT-F',
      quantity: 1,
      unitCost: 68,
      totalCost: 68,
      vendor: 'RockAuto',
      dateOrdered: new Date('2025-04-30'),
      dateDelivered: new Date('2025-05-02'),
    },
  })

  await prisma.partsOrder.upsert({
    where: { orderNumber: 'PO-431' },
    update: {},
    create: {
      orderNumber: 'PO-431',
      vehicleId: van22.id,
      orderedById: opsManager.id,
      partName: 'Alternator — 150A — Reman',
      partNumber: 'ALT-FT-150A-22',
      quantity: 1,
      unitCost: 210,
      totalCost: 210,
      vendor: 'Amazon',
      amazonOrderNumber: '111-7732-4490221',
      dateOrdered: new Date('2025-04-20'),
      dateDelivered: new Date('2025-04-22'),
      isDuplicateFlag: false,
      notes: 'Not linked to any repair — whereabouts unknown. Follow up.',
    },
  })

  // ── Fraud Events ─────────────────────────────────────────────────────────
  await prisma.fraudEvent.createMany({
    skipDuplicates: true,
    data: [
      {
        entityType: 'repair',
        entityId: repair2041.id,
        repairId: repair2041.id,
        flagType: 'DUPLICATE_INVOICE',
        severity: FraudSeverity.CRITICAL,
        riskScore: 94,
        description: 'Invoice #INV-8821 from Premier Auto matches invoice #INV-8756 submitted 18 days ago for the same VIN and repair category. Amounts differ by $40. System detected matching hash fingerprint.',
      },
      {
        entityType: 'repair',
        entityId: repair2041.id,
        repairId: repair2041.id,
        flagType: 'REPEAT_REPAIR_SAME_AREA',
        severity: FraudSeverity.CRITICAL,
        riskScore: 88,
        description: 'VAN-014 has had 4 collision repairs to the front-right panel area in 90 days. Three were performed by Premier Auto. Repair descriptions are nearly identical across all four records.',
      },
      {
        entityType: 'repair',
        entityId: repair2038.id,
        repairId: repair2038.id,
        flagType: 'EXCESSIVE_LABOR_HOURS',
        severity: FraudSeverity.WARNING,
        riskScore: 71,
        description: 'Quick Fix LLC billed 8.5 labor hours for a standard front/rear brake replacement. Industry benchmark for this repair category is 2.5–3.5 hours. Estimated excess charge: $550–$660.',
      },
      {
        entityType: 'parts',
        entityId: 'PO-441',
        flagType: 'PARTS_DOUBLE_BILLING_RISK',
        severity: FraudSeverity.WARNING,
        riskScore: 65,
        description: 'Tires (265/70R17) were purchased internally via Amazon Order #114-9921 and delivered to Apex Tire on May 5. Apex Tire invoice for R-2044 also includes $480 charge for the same tire set. Potential double billing of $480.',
      },
    ],
  })

  // ── Approval Events ───────────────────────────────────────────────────────
  await prisma.approvalEvent.createMany({
    skipDuplicates: false,
    data: [
      {
        repairId: repair2029.id,
        actorId: opsManager.id,
        action: 'escalated',
        approvalTier: ApprovalTier.TIER_4_EXECUTIVE,
        reason: 'Cost exceeds $2500 threshold. Engine rebuild on high-mileage vehicle.',
      },
      {
        repairId: repair2029.id,
        actorId: owner.id,
        action: 'approved',
        approvalTier: ApprovalTier.TIER_4_EXECUTIVE,
        reason: 'Approved. Vehicle still operable and cost-effective to repair vs replacement.',
      },
      {
        repairId: repair2035.id,
        actorId: opsManager.id,
        action: 'approved',
        approvalTier: ApprovalTier.TIER_2_SECONDARY,
        reason: 'Standard tire replacement. Photos submitted. Estimate reviewed.',
      },
      {
        repairId: repair2041.id,
        actorId: opsManager.id,
        action: 'escalated',
        approvalTier: ApprovalTier.TIER_4_EXECUTIVE,
        reason: 'Cost $2840 — requires owner approval. Flagged for duplicate invoice.',
      },
    ],
  })

  console.log('✅ Seed complete. Database ready for Havilon Fleet Portal.')
  console.log('\nTest users:')
  console.log('  owner@havilon.com — Owner (full access)')
  console.log('  ops@havilon.com — Ops Manager')
  console.log('  accounting@havilon.com — Accounting')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
