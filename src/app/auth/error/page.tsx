'use client'

import { useSearchParams } from 'next/navigation'
import { Truck, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const ERRORS: Record<string, string> = {
  AccessDenied: 'Your email address is not authorized to access this portal. Contact your manager to request access.',
  Configuration: 'There is a configuration issue with the portal. Please contact your administrator.',
  Default: 'An error occurred during sign in. Please try again.',
}

export default function AuthErrorPage() {
  const params = useSearchParams()
  const error = params.get('error') ?? 'Default'
  const message = ERRORS[error] ?? ERRORS.Default

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center">
            <AlertCircle size={28} className="text-red-500" />
          </div>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-sm text-gray-500 mb-8">{message}</p>
        <Link
          href="/auth/signin"
          className="inline-flex items-center justify-center w-full px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
        >
          Back to Sign In
        </Link>
      </div>
    </div>
  )
}
