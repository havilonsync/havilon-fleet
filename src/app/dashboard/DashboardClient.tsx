'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ShieldAlert, AlertTriangle, TrendingUp, Clock, Package, RefreshCw, XCircle } from 'lucide-react'
import Link from 'next/link'

interface Props {
  stats: {
    totalVehicles: number
    groundedVehicles: number
    activeRepairs: number
    pendingApprovals: number
    activeFraudFlags: number
    mtdSpend: number
    partsSpend: number
    repeatRepairs: number
    openDisputes: number
  }
  vendorSpend: any[]
  recentRepairs: any[]
  fraudEvents: any[]
  categoryBreakdown: any[]
}

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

function FraudScoreBadge({ score }: { score: number }) {
  const cls = score >= 70 ? 'fraud-score-high' : score >= 40 ? 'fraud-score-medium' : 'fraud-score-low'
  return <span className={cls}>{score}</span>
}

function VendorBar({ name, spend, fraudScore, max }: { name: string; spend: number; fraudScore: number; max: number }) {
  const pct = max > 0 ? (spend / max) * 100 : 0
  const color = fraudScore >= 70 ? '#ef4444' : fraudScore >= 40 ? '#f59e0b' : '#3b82f6'
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-gray-600 text-right truncate">{name}</div>
      <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
        <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-20 text-xs font-medium text-right">{formatMoney(spend)}</div>
    </div>
  )
}

export function DashboardClient({ stats, vendorSpend, recentRepairs, fraudEvents, categoryBreakdown }: Props) {
  const maxVendorSpend = Math.max(...vendorSpend.map(v => v.spend), 1)

  const catData = categoryBreakdown.map(c => ({
    name: c.category.charAt(0) + c.category.slice(1).toLowerCase(),
    count: c._count.id,
    spend: c._sum?.totalCost ?? 0,
  }))

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Fleet Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Havilon LLC — Real-time oversight</p>
        </div>
        <div className="flex gap-2">
          <Link href="/repairs/new" className="btn-secondary">+ New Repair</Link>
          <Link href="/fraud" className="btn-primary">
            <ShieldAlert size={15} />
            Fraud Center
            {stats.activeFraudFlags > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 ml-0.5">
                {stats.activeFraudFlags}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Fraud Alert Banner */}
      {stats.activeFraudFlags > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="text-red-600 mt-0.5 flex-shrink-0" size={18} />
          <div className="flex-1">
            <p className="font-medium text-red-800">
              {stats.activeFraudFlags} active fraud flag{stats.activeFraudFlags > 1 ? 's' : ''} require your attention
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {fraudEvents.slice(0, 4).map(fe => (
                <span key={fe.id} className={`badge ${fe.severity === 'CRITICAL' ? 'badge-red' : 'badge-amber'}`}>
                  {fe.flagType.replace(/_/g, ' ')}
                  {fe.repair?.vehicle && ` · ${fe.repair.vehicle.vehicleNumber}`}
                </span>
              ))}
            </div>
          </div>
          <Link href="/fraud" className="text-sm text-red-600 font-medium hover:underline whitespace-nowrap">
            Review all →
          </Link>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Total Fleet</p>
          <p className="text-2xl font-semibold text-gray-900">{stats.totalVehicles}</p>
          <p className="text-xs text-gray-400 mt-1">
            {stats.groundedVehicles} grounded · {stats.activeRepairs} in repair
          </p>
        </div>
        <div className={`stat-card ${stats.activeFraudFlags > 0 ? 'border-red-200 bg-red-50' : ''}`}>
          <p className="text-xs text-gray-500 mb-1">Active Fraud Flags</p>
          <p className={`text-2xl font-semibold ${stats.activeFraudFlags > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {stats.activeFraudFlags}
          </p>
          <p className="text-xs text-gray-400 mt-1">Requires owner review</p>
        </div>
        <div className={`stat-card ${stats.pendingApprovals > 0 ? 'border-amber-200 bg-amber-50' : ''}`}>
          <p className="text-xs text-gray-500 mb-1">Pending Approvals</p>
          <p className={`text-2xl font-semibold ${stats.pendingApprovals > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
            {stats.pendingApprovals}
          </p>
          <p className="text-xs text-gray-400 mt-1">Awaiting action</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">MTD Repair Spend</p>
          <p className="text-2xl font-semibold text-gray-900">{formatMoney(stats.mtdSpend)}</p>
          <p className="text-xs text-gray-400 mt-1">Parts: {formatMoney(stats.partsSpend)}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Repeat Repairs (30d)</p>
          <p className={`text-2xl font-semibold ${stats.repeatRepairs > 2 ? 'text-amber-600' : 'text-gray-900'}`}>
            {stats.repeatRepairs}
          </p>
          <p className="text-xs text-gray-400 mt-1">Same issue recurrence</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Open Disputes</p>
          <p className={`text-2xl font-semibold ${stats.openDisputes > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {stats.openDisputes}
          </p>
          <p className="text-xs text-gray-400 mt-1">With vendors</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Grounded Vehicles</p>
          <p className={`text-2xl font-semibold ${stats.groundedVehicles > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {stats.groundedVehicles}
          </p>
          <p className="text-xs text-gray-400 mt-1">Out of service</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Active Repairs</p>
          <p className="text-2xl font-semibold text-blue-600">{stats.activeRepairs}</p>
          <p className="text-xs text-gray-400 mt-1">In workflow</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="section-title mb-4">Vendor Spend (30 days)</h3>
          <div className="space-y-3">
            {vendorSpend.slice(0, 6).map(v => (
              <VendorBar
                key={v.id}
                name={v.name}
                spend={v.spend}
                fraudScore={v.fraudScore}
                max={maxVendorSpend}
              />
            ))}
            {vendorSpend.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No repair spend this period</p>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-3">Red = high fraud risk vendor</p>
        </div>

        <div className="card p-4">
          <h3 className="section-title mb-4">Repairs by Category (30 days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={catData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(val: any) => [val, 'Repairs']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {catData.map((_, i) => (
                  <Cell key={i} fill={i < 2 ? '#ef4444' : i < 4 ? '#f59e0b' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Repairs Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="section-title">Recent Repair Activity</h3>
          <Link href="/repairs" className="text-xs text-blue-600 hover:underline">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Repair', 'Vehicle', 'Category', 'Shop', 'Amount', 'Fraud Score', 'Status', 'Flags'].map(h => (
                  <th key={h} className="table-header text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentRepairs.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-cell">
                    <Link href={`/repairs/${r.id}`} className="font-medium text-blue-600 hover:underline">
                      {r.repairNumber}
                    </Link>
                  </td>
                  <td className="table-cell">
                    <div className="font-medium">{r.vehicle?.vehicleNumber}</div>
                    <div className="text-xs text-gray-400 font-mono">{r.vehicle?.vin?.slice(-8)}</div>
                  </td>
                  <td className="table-cell capitalize">
                    {r.category?.toLowerCase().replace('_', ' ')}
                  </td>
                  <td className="table-cell">{r.shop?.name ?? '—'}</td>
                  <td className="table-cell">
                    <span className={r.totalCost > 1000 ? 'font-semibold text-red-600' : 'font-medium'}>
                      {r.totalCost ? formatMoney(r.totalCost) : '—'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="risk-bar w-12">
                        <div
                          className={`risk-fill ${r.fraudScore >= 70 ? 'risk-fill-high' : r.fraudScore >= 40 ? 'risk-fill-medium' : 'risk-fill-low'}`}
                          style={{ width: `${r.fraudScore}%` }}
                        />
                      </div>
                      <FraudScoreBadge score={r.fraudScore} />
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
                      {r.fraudFlags?.length === 0 && (
                        <span className="badge badge-gray">Clear</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {recentRepairs.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm text-gray-400">
                    No repairs in the last 30 days
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
