import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, ExternalLink } from 'lucide-react'

import prisma from '@/lib/prisma'

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default async function InvoicesPage() {
  const session = await getServerSession(authOptions) as any
  if (!session) redirect('/auth/signin')

  const repairs = await prisma.repair.findMany({
    where: { invoiceUrl: { not: null } },
    orderBy: { requestDate: 'desc' },
    include: {
      vehicle: { select: { vehicleNumber: true } },
      shop:    { select: { name: true } },
    },
  })

  const withoutInvoice = await prisma.repair.count({
    where: {
      invoiceUrl: null,
      status: { in: ['COMPLETED', 'APPROVED', 'IN_PROGRESS'] },
    },
  })

  const totalInvoiced = repairs.reduce((t, r) => t + (r.totalCost ?? 0), 0)

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <FileText size={20} className="text-blue-600" />
          Invoices
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">All uploaded repair invoices</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Invoices Uploaded</p><p className="text-2xl font-semibold">{repairs.length}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Total Invoiced</p><p className="text-2xl font-semibold">{formatMoney(totalInvoiced)}</p></div>
        <div className="stat-card border-red-200 bg-red-50"><p className="text-xs text-gray-500 mb-1">Missing Invoices</p><p className="text-2xl font-semibold text-red-600">{withoutInvoice}</p><p className="text-xs text-gray-400 mt-1">Active repairs with no invoice</p></div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              {['Repair', 'Vehicle', 'Shop', 'Amount', 'Date', 'Invoice', 'Fraud Score'].map(h => (
                <th key={h} className="table-header text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {repairs.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="table-cell">
                  <Link href={`/repairs/${r.id}`} className="font-medium text-blue-600 hover:underline">
                    {r.repairNumber}
                  </Link>
                </td>
                <td className="table-cell">{r.vehicle?.vehicleNumber}</td>
                <td className="table-cell">{r.shop?.name ?? '—'}</td>
                <td className="table-cell font-medium">{r.totalCost ? formatMoney(r.totalCost) : '—'}</td>
                <td className="table-cell text-xs text-gray-500">{new Date(r.requestDate).toLocaleDateString()}</td>
                <td className="table-cell">
                  {r.invoiceUrl ? (
                    <a href={r.invoiceUrl} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                      View Invoice <ExternalLink size={11} />
                    </a>
                  ) : '—'}
                </td>
                <td className="table-cell">
                  <span className={`text-xs font-semibold ${r.fraudScore >= 70 ? 'text-red-600' : r.fraudScore >= 40 ? 'text-amber-600' : 'text-green-600'}`}>
                    {r.fraudScore}/100
                  </span>
                </td>
              </tr>
            ))}
            {repairs.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-sm text-gray-400">No invoices uploaded yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
