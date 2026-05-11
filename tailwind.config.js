/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  safelist: [
    'badge-red', 'badge-amber', 'badge-green', 'badge-blue', 'badge-gray',
    'status-pending', 'status-approved', 'status-disputed', 'status-progress',
    'status-completed', 'status-rejected',
    'risk-fill-low', 'risk-fill-medium', 'risk-fill-high',
    'border-l-red-500', 'border-l-amber-400', 'border-l-blue-400',
    'border-red-200', 'border-amber-200', 'border-green-200', 'border-blue-200',
    'bg-red-50', 'bg-amber-50', 'bg-green-50', 'bg-blue-50',
    'text-red-600', 'text-amber-600', 'text-green-600', 'text-blue-600',
    'text-red-700', 'text-amber-700', 'text-green-700', 'text-blue-700',
  ],
  plugins: [],
}
