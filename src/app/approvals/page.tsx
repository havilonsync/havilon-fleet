import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckSquare, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

const prisma = new PrismaClient()

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const TIER_COLORS: Record<string, string> = {
  TIER_1_STANDARD:  'badge-green',
  TIER_2_SECONDARY: 'badge-blue',
  TIER_3_OWNER:     'badge-amber',
  TIER_4_EXECUTIVE: 'badge-red',
}

const TIER_LABELS: Record<string, string> = {
  TIER_1_STANDARD:  'Tier 1 — Standard',
  TIER_2_SECONDARY: 'Tier 2 — Secondary',
  TIER_3_OWNER:     'Tier 3 — Owner',
  TIER_4_EXECUTIVE: 'Tier 4 — Executive',
}

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const pending = await prisma.repair.findMany({
    where: { status: { in: ['PENDING_REVIEW', 'AWAITING_ESTIMATE'] } },
    orderBy: [{ requiresOwnerApproval: 'desc' }, { fraudScore: 'desc' }, { requestDate: 'asc' }],
    include: {
      vehicle:     { select: { vehicleNumber: true, vin: true } },
      shop:        { select: { name: true } },
      requestedBy: { select: { name: true } },
    },
  })

  const totalValue   = pending.reduce((t, r) => t + (r.estimatedCost ?? r.totalCost ?? 0), 0)
  const ownerRequired = pending.filter(r => r.requiresOwnerApproval).length
  const flagged       = pending.filter(r => r.fraudScore >= 50).length

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <CheckSquare size={20} className="text-blue-600" />
          Approval Queue
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{pending.length} repairs awaiting action</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card border-amber-200 bg-amber-50">
          <p className="text-xs text-gray-500 mb-1">Awaiting Approval</p>
          <p className="text-2xl font-semibold text-amber-600">{pending.length}</p>
        </div>
        <div className="stat-card border-red-200 bg-red-50">
          <p className="text-xs text-gray-500 mb-1">Owner Required</p>
          <p className="text-2xl font-semibold text-red-600">{ownerRequired}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Total Pending Value</p>
          <p className="text-2xl font-semibold">{formatMoney(totalValue)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {pending.map(r => (
          <div key={r.id} className={`card p-5 border-l-4 ${r.requiresOwnerApproval ? 'border-l-red-500' : 'border-l-amber-400'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <Link href={`/repairs/${r.id}`} className="font-semibold text-blue-600 hover:underline">
                    {r.repairNumber}
                  </Link>
                  <span className="font-medium text-gray-900">{r.vehicle?.vehicleNumber}</span>
                  <span className="text-gray-500">·</span>
                  <span className="text-gray-700">{r.shop?.name ?? 'No shop assigned'}</span>
                  <span className="font-semibold ml-auto">{formatMoney(r.estimatedCost ?? r.totalCost ?? 0)}</span>
                </div>

                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{r.description}</p>

                <div className="flex flex-wrap gap-2">
                  {r.approvalTier && (
                    <span className={`badge ${TIER_COLORS[r.approvalTier] ?? 'badge-gray'}`}>
                      {TIER_LABELS[r.approvalTier]}
                    </span>
                  )}
                  {r.requiresOwnerApproval && (
                    <span className="badge badge-red">Owner Required</span>
                  )}
                  {r.fraudFlags && r.fraudFlags.length > 0 && r.fraudFlags.map((f: string) => (
                    <span key={f} className="badge badge-red">{f.replace(/_/g, ' ')}</span>
                  ))}
                  {r.photosBefore?.length > 0
                    ? <span className="badge badge-green">Photos ✓</span>
                    : <span className="badge badge-amber">No Photos</span>
                  }
                  {r.requestedBy && (
                    <span className="badge badge-gray">By: {r.requestedBy.name}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <Link href={`/repairs/${r.id}`} className="btn-secondary text-xs">
                  Review
                </Link>
              </div>
            </div>
          </div>
        ))}

        {pending.length === 0 && (
          <div className="card p-12 text-center">
            <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
            <p className="font-medium text-gray-900">All caught up</p>
            <p className="text-sm text-gray-500 mt-1">No repairs waiting for approval</p>
          </div>
        )}
      </div>
    </div>
  )
}
