import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'

const prisma = new PrismaClient()

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default async function ShopsPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const shops = await prisma.repairShop.findMany({
    orderBy: { fraudScore: 'desc' },
    include: { _count: { select: { repairs: true } } },
  })

  const highRisk = shops.filter(s => s.fraudScore >= 60).length

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Building2 size={20} className="text-blue-600" />
            Repair Shops
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{shops.length} vendors · Risk-scored</p>
        </div>
        <Link href="/shops/new" className="btn-primary">
          <Plus size={15} /> Add Shop
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Total Vendors</p><p className="text-2xl font-semibold">{shops.length}</p></div>
        <div className="stat-card border-red-200 bg-red-50"><p className="text-xs text-gray-500 mb-1">High Risk</p><p className="text-2xl font-semibold text-red-600">{highRisk}</p><p className="text-xs text-gray-400 mt-1">Score ≥ 60</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Total Lifetime Spend</p><p className="text-2xl font-semibold">{formatMoney(shops.reduce((t, s) => t + s.lifetimeSpend, 0))}</p></div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              {['Shop Name', 'Contact', 'Total Repairs', 'Avg Invoice', 'Lifetime Spend', 'Repeat Rate', 'Risk Score', 'Status'].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shops.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="table-cell">
                  <Link href={`/shops/${s.id}`} className="font-semibold text-blue-600 hover:underline">{s.name}</Link>
                  {s.address && <div className="text-xs text-gray-400">{s.address}</div>}
                </td>
                <td className="table-cell text-sm">{s.contactPerson ?? '—'}</td>
                <td className="table-cell">{s._count.repairs}</td>
                <td className="table-cell">{formatMoney(s.avgRepairCost)}</td>
                <td className="table-cell font-medium">{formatMoney(s.lifetimeSpend)}</td>
                <td className="table-cell">
                  <span className={`badge ${s.repeatRepairRate > 0.25 ? 'badge-red' : s.repeatRepairRate > 0.1 ? 'badge-amber' : 'badge-gray'}`}>
                    {(s.repeatRepairRate * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <div className="risk-bar w-12">
                      <div className={`risk-fill ${s.fraudScore >= 70 ? 'risk-fill-high' : s.fraudScore >= 40 ? 'risk-fill-medium' : 'risk-fill-low'}`}
                        style={{ width: `${s.fraudScore}%` }} />
                    </div>
                    <span className={`text-xs font-semibold ${s.fraudScore >= 70 ? 'text-red-600' : s.fraudScore >= 40 ? 'text-amber-600' : 'text-green-600'}`}>
                      {s.fraudScore}
                    </span>
                  </div>
                </td>
                <td className="table-cell">
                  {s.isBlacklisted
                    ? <span className="badge badge-red">Blacklisted</span>
                    : s.isActive
                    ? <span className="badge badge-green">Active</span>
                    : <span className="badge badge-gray">Inactive</span>
                  }
                </td>
              </tr>
            ))}
            {shops.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-sm text-gray-400">No repair shops added yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
