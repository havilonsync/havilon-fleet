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
    { pattern: /^(bg|border|text)-(red|amber|green|blue|gray)-(50|100|200|300|400|500|600|700|800|900)$/ },
    { pattern: /^(bg|border|text)-(red|amber|green|blue|gray)$/ },
    { pattern: /^badge-(red|amber|green|blue|gray)$/ },
    { pattern: /^status-(pending|approved|disputed|progress|completed|rejected)$/ },
    { pattern: /^risk-fill-(low|medium|high)$/ },
    'border-l-red-500',
    'border-l-amber-400', 
    'border-l-blue-400',
    'border-red-200',
    'border-amber-200',
    'border-green-200',
    'border-blue-200',
    'bg-red-50',
    'bg-amber-50',
    'bg-green-50',
    'bg-blue-50',
    'text-red-600',
    'text-amber-600',
    'text-green-600',
    'text-blue-600',
  ],
  plugins: [],
}
