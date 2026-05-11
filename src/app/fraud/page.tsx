import { PrismaClient, FraudSeverity } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldAlert, AlertTriangle, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react'

const prisma = new PrismaClient()

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default async function FraudPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const [fraudEvents, shops] = await Promise.all([
    prisma.fraudEvent.findMany({
      where: { isActive: true },
      include: {
        repair: {
          include: {
            vehicle: { select: { vehicleNumber: true, vin: true } },
            shop: { select: { name: true } },
          },
        },
        resolvedBy: { select: { name: true } },
      },
      orderBy: [{ severity: 'asc' }, { riskScore: 'desc' }],
    }),
    prisma.repairShop.findMany({
      where: { isActive: true },
      orderBy: { fraudScore: 'desc' },
      include: {
        repairs: {
          where: { status: { not: 'REJECTED' } },
          select: { totalCost: true, isRepeatRepair: true },
        },
      },
    }),
  ])

  const critical = fraudEvents.filter(f => f.severity === FraudSeverity.CRITICAL)
  const warnings = fraudEvents.filter(f => f.severity === FraudSeverity.WARNING)

  // Leakage estimate
  const leakage = fraudEvents.reduce((total, fe) => {
    if (fe.repair?.totalCost) {
      return total + (fe.repair.totalCost * (fe.riskScore / 200))
    }
    return total
  }, 0)

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <ShieldAlert size={20} className="text-red-600" />
            Fraud Intelligence Center
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Active anomalies and risk detection</p>
        </div>
        <form action="/api/fraud/scan" method="POST">
          <button className="btn-secondary">Run Fraud Scan</button>
        </form>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card border-red-200 bg-red-50">
          <p className="text-xs text-gray-500 mb-1">Critical Flags</p>
          <p className="text-2xl font-semibold text-red-600">{critical.length}</p>
          <p className="text-xs text-gray-400 mt-1">Immediate action required</p>
        </div>
        <div className="stat-card border-amber-200 bg-amber-50">
          <p className="text-xs text-gray-500 mb-1">Warning Flags</p>
          <p className="text-2xl font-semibold text-amber-600">{warnings.length}</p>
          <p className="text-xs text-gray-400 mt-1">Review recommended</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">High-Risk Vendors</p>
          <p className="text-2xl font-semibold text-gray-900">{shops.filter(s => s.fraudScore >= 60).length}</p>
          <p className="text-xs text-gray-400 mt-1">Score ≥ 60</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Est. Financial Leakage</p>
          <p className="text-2xl font-semibold text-red-600">{formatMoney(leakage)}+</p>
          <p className="text-xs text-gray-400 mt-1">From flagged repairs</p>
        </div>
      </div>

      {/* Active Fraud Flags */}
      <div>
        <h2 className="section-title mb-3">Active Flags</h2>
        <div className="grid grid-cols-1 gap-3">
          {fraudEvents.map(fe => (
            <div
              key={fe.id}
              className={`card p-4 border-l-4 ${
                fe.severity === 'CRITICAL' ? 'border-l-red-500' : 'border-l-amber-400'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`mt-0.5 flex-shrink-0 ${fe.severity === 'CRITICAL' ? 'text-red-500' : 'text-amber-500'}`}>
                    {fe.severity === 'CRITICAL'
                      ? <AlertCircle size={18} />
                      : <AlertTriangle size={18} />
                    }
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${fe.severity === 'CRITICAL' ? 'badge-red' : 'badge-amber'}`}>
                        {fe.severity}
                      </span>
                      <span className="font-medium text-sm text-gray-900">
                        {fe.flagType.replace(/_/g, ' ')}
                      </span>
                      {fe.repair && (
                        <span className="text-sm text-gray-500">
                          · {fe.repair.repairNumber}
                          {fe.repair.vehicle && ` · ${fe.repair.vehicle.vehicleNumber}`}
                          {fe.repair.shop && ` · ${fe.repair.shop.name}`}
                        </span>
                      )}
                      <span className={`ml-auto text-sm font-semibold ${
                        fe.riskScore >= 70 ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        Risk: {fe.riskScore}/100
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{fe.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Detected {new Date(fe.detectedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {fe.repair && (
                    <Link
                      href={`/repairs/${fe.repair.id}`}
                      className="btn-secondary text-xs"
                    >
                      <ExternalLink size={12} />
                      Review
                    </Link>
                  )}
                  <form action={`/api/fraud/${fe.id}/resolve`} method="POST">
                    <button className="btn-secondary text-xs">
                      <CheckCircle size={12} />
                      Resolve
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}

          {fraudEvents.length === 0 && (
            <div className="card p-12 text-center">
              <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
              <p className="font-medium text-gray-900">No active fraud flags</p>
              <p className="text-sm text-gray-500 mt-1">System is clean. Run a scan to check for new patterns.</p>
            </div>
          )}
        </div>
      </div>

      {/* Vendor Risk Table */}
      <div>
        <h2 className="section-title mb-3">Vendor Risk Scores</h2>
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                {['Shop', 'Fraud Score', 'Total Spend', 'Repeat Rate', 'Active Flags', 'Action'].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shops.map(s => {
                const shopSpend = s.repairs.reduce((t, r) => t + (r.totalCost ?? 0), 0)
                const repeatRate = s.repairs.length > 0
                  ? (s.repairs.filter(r => r.isRepeatRepair).length / s.repairs.length) * 100
                  : 0

                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{s.name}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="risk-bar w-16">
                          <div
                            className={`risk-fill ${s.fraudScore >= 70 ? 'risk-fill-high' : s.fraudScore >= 40 ? 'risk-fill-medium' : 'risk-fill-low'}`}
                            style={{ width: `${s.fraudScore}%` }}
                          />
                        </div>
                        <span className={`font-semibold ${s.fraudScore >= 70 ? 'text-red-600' : s.fraudScore >= 40 ? 'text-amber-600' : 'text-green-600'}`}>
                          {s.fraudScore}
                        </span>
                      </div>
                    </td>
                    <td className="table-cell font-medium">{formatMoney(shopSpend)}</td>
                    <td className="table-cell">
                      <span className={`badge ${repeatRate > 25 ? 'badge-red' : repeatRate > 10 ? 'badge-amber' : 'badge-gray'}`}>
                        {repeatRate.toFixed(0)}%
                      </span>
                    </td>
                    <td className="table-cell">
                      {(s.fraudFlags as string[]).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(s.fraudFlags as string[]).slice(0, 2).map(f => (
                            <span key={f} className="badge badge-red text-xs">{f.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="badge badge-green">Clear</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <Link href={`/shops/${s.id}`} className="text-xs text-blue-600 hover:underline">
                        View History →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
