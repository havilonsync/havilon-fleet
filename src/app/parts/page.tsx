import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Package, Plus, AlertTriangle } from 'lucide-react'
import prisma from '@/lib/prisma'


function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default async function PartsPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const parts = await prisma.partsOrder.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      vehicle:   { select: { vehicleNumber: true } },
      repair:    { select: { repairNumber: true } },
      orderedBy: { select: { name: true } },
    },
    take: 100,
  })

  const totalSpend   = parts.reduce((t, p) => t + p.totalCost, 0)
  const duplicates   = parts.filter(p => p.isDuplicateFlag).length
  const unlinked     = parts.filter(p => !p.repairId).length

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Package size={20} className="text-blue-600" />
            Parts Procurement
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Track every part ordered — prevent double billing</p>
        </div>
        <Link href="/parts/new" className="btn-primary">
          <Plus size={15} /> Log Parts Order
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Total Parts Orders</p><p className="text-2xl font-semibold">{parts.length}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Total Spend</p><p className="text-2xl font-semibold">{formatMoney(totalSpend)}</p></div>
        <div className="stat-card border-red-200 bg-red-50"><p className="text-xs text-gray-500 mb-1">Duplicate Flags</p><p className="text-2xl font-semibold text-red-600">{duplicates}</p></div>
        <div className="stat-card border-amber-200 bg-amber-50"><p className="text-xs text-gray-500 mb-1">Unlinked Orders</p><p className="text-2xl font-semibold text-amber-600">{unlinked}</p><p className="text-xs text-gray-400 mt-1">No repair linked</p></div>
      </div>

      {duplicates > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="text-red-600 flex-shrink-0" size={18} />
          <p className="text-sm text-red-800 font-medium">
            {duplicates} parts order(s) flagged for potential double billing — shop may also be charging for these parts
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              {['Order #', 'Vehicle', 'Part', 'Vendor', 'Amazon #', 'Cost', 'Ordered', 'Linked Repair', 'Flag'].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parts.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="table-cell font-medium">{p.orderNumber}</td>
                <td className="table-cell">{p.vehicle?.vehicleNumber ?? '—'}</td>
                <td className="table-cell">
                  <div className="font-medium">{p.partName}</div>
                  {p.partNumber && <div className="text-xs text-gray-400">{p.partNumber}</div>}
                </td>
                <td className="table-cell">{p.vendor}</td>
                <td className="table-cell text-xs font-mono text-gray-500">{p.amazonOrderNumber ?? '—'}</td>
                <td className="table-cell font-medium">{formatMoney(p.totalCost)}</td>
                <td className="table-cell text-xs text-gray-500">{new Date(p.dateOrdered).toLocaleDateString()}</td>
                <td className="table-cell">
                  {p.repair ? (
                    <Link href={`/repairs/${p.repairId}`} className="text-blue-600 hover:underline text-xs">
                      {p.repair.repairNumber}
                    </Link>
                  ) : <span className="badge badge-amber">Unlinked</span>}
                </td>
                <td className="table-cell">
                  {p.isDuplicateFlag
                    ? <span className="badge badge-red">⚠️ Duplicate Risk</span>
                    : <span className="badge badge-green">Clear</span>
                  }
                </td>
              </tr>
            ))}
            {parts.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12 text-sm text-gray-400">No parts orders logged yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
