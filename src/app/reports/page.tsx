'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts'
import { BarChart3 } from 'lucide-react'

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function AnalyticsPage() {
  const [vendorData,   setVendorData]   = useState<any[]>([])
  const [vehicleData,  setVehicleData]  = useState<any[]>([])
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [overview,     setOverview]     = useState<any>(null)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/reports?type=overview').then(r => r.json()),
      fetch('/api/reports?type=spend_by_vendor').then(r => r.json()),
      fetch('/api/reports?type=spend_by_vehicle').then(r => r.json()),
      fetch('/api/reports?type=category_breakdown').then(r => r.json()),
    ]).then(([ov, vendors, vehicles, cats]) => {
      setOverview(ov)
      setVendorData(vendors.slice(0, 8))
      setVehicleData(vehicles.slice(0, 8))
      setCategoryData(cats.map((c: any) => ({
        name: c.category?.charAt(0) + c.category?.slice(1).toLowerCase(),
        count: c._count?.id ?? 0,
        spend: c._sum?.totalCost ?? 0,
      })))
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">Loading analytics...</p>
    </div>
  )

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 size={20} className="text-blue-600" />
          Analytics & Reports
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">30-day operational overview</p>
      </div>

      {overview && (
        <div className="grid grid-cols-4 gap-4">
          <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Total Fleet</p><p className="text-2xl font-semibold">{overview.totalVehicles}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500 mb-1">MTD Spend</p><p className="text-2xl font-semibold">{formatMoney(overview.mtdSpend)}</p></div>
          <div className="stat-card border-red-200 bg-red-50"><p className="text-xs text-gray-500 mb-1">Fraud Flags</p><p className="text-2xl font-semibold text-red-600">{overview.activeFraudFlags}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Parts Spend</p><p className="text-2xl font-semibold">{formatMoney(overview.partsSpend)}</p></div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Spend by Vendor (30d)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={vendorData} layout="vertical" margin={{ left: 80, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v: any) => formatMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                {vendorData.map((d, i) => (
                  <Cell key={i} fill={d.fraudScore >= 70 ? '#ef4444' : d.fraudScore >= 40 ? '#f59e0b' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-2">Red = high fraud risk vendor</p>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Repairs by Category (30d)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Top Vehicles by Spend (30d)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={vehicleData} layout="vertical" margin={{ left: 60, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="vehicleNumber" tick={{ fontSize: 11 }} width={60} />
              <Tooltip formatter={(v: any) => formatMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="totalSpend" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Summary</h3>
          <div className="space-y-3">
            {[
              { label: 'Active Repairs',    value: overview?.activeRepairs   ?? 0 },
              { label: 'Pending Approvals', value: overview?.pendingApprovals ?? 0 },
              { label: 'Repeat Repairs',    value: overview?.repeatRepairs    ?? 0 },
              { label: 'Open Disputes',     value: overview?.openDisputes     ?? 0 },
              { label: 'Grounded Vehicles', value: overview?.groundedVehicles ?? 0 },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-600">{item.label}</span>
                <span className="font-semibold text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
