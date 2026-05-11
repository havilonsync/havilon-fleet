import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Truck, Plus, AlertTriangle } from 'lucide-react'

const prisma = new PrismaClient()

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:          'badge-green',
  GROUNDED:        'badge-red',
  IN_REPAIR:       'badge-amber',
  DECOMMISSIONED:  'badge-gray',
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default async function VehiclesPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const vehicles = await prisma.vehicle.findMany({
    orderBy: { vehicleNumber: 'asc' },
    include: {
      driver: { select: { name: true } },
      _count: { select: { repairs: true } },
    },
  })

  const active    = vehicles.filter(v => v.status === 'ACTIVE').length
  const grounded  = vehicles.filter(v => v.status === 'GROUNDED').length
  const inRepair  = vehicles.filter(v => v.status === 'IN_REPAIR').length

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Truck size={20} className="text-blue-600" />
            Vehicle Registry
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{vehicles.length} vehicles · VIN-level tracking</p>
        </div>
        <Link href="/vehicles/new" className="btn-primary">
          <Plus size={15} /> Add Vehicle
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Total Fleet</p><p className="text-2xl font-semibold">{vehicles.length}</p></div>
        <div className="stat-card border-green-200 bg-green-50"><p className="text-xs text-gray-500 mb-1">Active</p><p className="text-2xl font-semibold text-green-600">{active}</p></div>
        <div className="stat-card border-red-200 bg-red-50"><p className="text-xs text-gray-500 mb-1">Grounded</p><p className="text-2xl font-semibold text-red-600">{grounded}</p></div>
        <div className="stat-card border-amber-200 bg-amber-50"><p className="text-xs text-gray-500 mb-1">In Repair</p><p className="text-2xl font-semibold text-amber-600">{inRepair}</p></div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              {['Vehicle #', 'VIN', 'Year / Make / Model', 'Driver', 'Odometer', 'Repairs', 'Lifetime Spend', 'Status'].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vehicles.map(v => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="table-cell">
                  <Link href={`/vehicles/${v.id}`} className="font-semibold text-blue-600 hover:underline">
                    {v.vehicleNumber}
                  </Link>
                </td>
                <td className="table-cell font-mono text-xs text-gray-500">{v.vin}</td>
                <td className="table-cell">{v.year} {v.make} {v.model}</td>
                <td className="table-cell">{v.driver?.name ?? <span className="text-gray-400">Unassigned</span>}</td>
                <td className="table-cell">{v.odometerCurrent.toLocaleString()} mi</td>
                <td className="table-cell">
                  <span className={v._count.repairs > 5 ? 'text-red-600 font-semibold' : ''}>
                    {v._count.repairs}
                  </span>
                </td>
                <td className="table-cell">
                  <span className={v.totalLifetimeRepairCost > 10000 ? 'text-red-600 font-semibold' : 'font-medium'}>
                    {formatMoney(v.totalLifetimeRepairCost)}
                  </span>
                </td>
                <td className="table-cell">
                  <span className={`badge ${STATUS_COLORS[v.status] ?? 'badge-gray'}`}>
                    {v.status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-sm text-gray-400">No vehicles yet — add your first vehicle to get started</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
