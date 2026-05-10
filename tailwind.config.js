/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'var(--border-color, #e5e7eb)',
      }
    },
  },
  safelist: [
    { pattern: /^(bg|border|text)-(red|amber|green|blue|gray)-(50|100|200|500|600|700|800)$/ },
  ],
  plugins: [],
}
