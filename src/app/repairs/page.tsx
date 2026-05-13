import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Wrench, Plus } from 'lucide-react'

import prisma from '@/lib/prisma'

const STATUS_STYLES: Record<string, string> = {
  PENDING_REVIEW:    'status-pending',
  AWAITING_ESTIMATE: 'status-pending',
  APPROVED:          'status-approved',
  IN_PROGRESS:       'status-progress',
  COMPLETED:         'status-completed',
  REJECTED:          'status-rejected',
  DISPUTED:          'status-disputed',
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default async function RepairsPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const repairs = await prisma.repair.findMany({
    orderBy: [{ fraudScore: 'desc' }, { requestDate: 'desc' }],
    include: {
      vehicle: { select: { vehicleNumber: true, vin: true } },
      shop:    { select: { name: true } },
      requestedBy: { select: { name: true } },
    },
    take: 100,
  })

  const open      = repairs.filter(r => ['PENDING_REVIEW','AWAITING_ESTIMATE','APPROVED','IN_PROGRESS'].includes(r.status)).length
  const flagged   = repairs.filter(r => r.fraudScore >= 50).length
  const disputed  = repairs.filter(r => r.status === 'DISPUTED').length
  const totalSpend = repairs.filter(r => r.status !== 'REJECTED').reduce((t, r) => t + (r.totalCost ?? 0), 0)

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Wrench size={20} className="text-blue-600" />
            Repair Records
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{repairs.length} total repairs tracked</p>
        </div>
        <Link href="/repairs/new" className="btn-primary">
          <Plus size={15} /> New Repair
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card border-amber-200 bg-amber-50">
          <p className="text-xs text-gray-500 mb-1">Open Repairs</p>
          <p className="text-2xl font-semibold text-amber-600">{open}</p>
        </div>
        <div className="stat-card border-red-200 bg-red-50">
          <p className="text-xs text-gray-500 mb-1">Fraud Flagged</p>
          <p className="text-2xl font-semibold text-red-600">{flagged}</p>
        </div>
        <div className="stat-card border-red-200 bg-red-50">
          <p className="text-xs text-gray-500 mb-1">Disputed</p>
          <p className="text-2xl font-semibold text-red-600">{disputed}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Total Spend Tracked</p>
          <p className="text-2xl font-semibold">{formatMoney(totalSpend)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              {['Repair #', 'Vehicle', 'Category', 'Shop', 'Requested', 'Total', 'Fraud Score', 'Status', 'Flags'].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {repairs.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="table-cell">
                  <Link href={`/repairs/${r.id}`} className="font-semibold text-blue-600 hover:underline">
                    {r.repairNumber}
                  </Link>
                </td>
                <td className="table-cell">
                  <div className="font-medium">{r.vehicle?.vehicleNumber}</div>
                  <div className="text-xs text-gray-400 font-mono">{r.vehicle?.vin?.slice(-8)}</div>
                </td>
                <td className="table-cell capitalize">{r.category?.toLowerCase()}</td>
                <td className="table-cell">{r.shop?.name ?? '—'}</td>
                <td className="table-cell text-xs text-gray-500">
                  {new Date(r.requestDate).toLocaleDateString()}
                </td>
                <td className="table-cell">
                  <span className={r.totalCost && r.totalCost > 1000 ? 'font-semibold text-red-600' : 'font-medium'}>
                    {r.totalCost ? formatMoney(r.totalCost) : '—'}
                  </span>
                </td>
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <div className="risk-bar w-10">
                      <div className={`risk-fill ${r.fraudScore >= 70 ? 'risk-fill-high' : r.fraudScore >= 40 ? 'risk-fill-medium' : 'risk-fill-low'}`}
                        style={{ width: `${r.fraudScore}%` }} />
                    </div>
                    <span className={`text-xs font-semibold ${r.fraudScore >= 70 ? 'text-red-600' : r.fraudScore >= 40 ? 'text-amber-600' : 'text-green-600'}`}>
                      {r.fraudScore}
                    </span>
                  </div>
                </td>
                <td className="table-cell">
                  <span className={STATUS_STYLES[r.status] ?? 'badge badge-gray'}>
                    {r.status.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </td>
                <td className="table-cell">
                  <div className="flex flex-wrap gap-1">
                    {r.fraudFlags?.slice(0, 2).map((f: string) => (
                      <span key={f} className="badge badge-red text-xs">
                        {f.replace(/_/g, ' ').split(' ').slice(0, 2).join(' ')}
                      </span>
                    ))}
                    {(!r.fraudFlags || r.fraudFlags.length === 0) && (
                      <span className="badge badge-gray">Clear</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {repairs.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12 text-sm text-gray-400">No repairs yet — create your first repair request</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
