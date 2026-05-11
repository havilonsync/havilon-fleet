/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] }
  },
  // Exclude puppeteer from client bundle — server only
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
      }
    }
    return config
  },
  // Tell Vercel not to bundle puppeteer at build time
  serverExternalPackages: ['puppeteer'],
}

module.exports = nextConfig
