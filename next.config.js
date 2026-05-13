/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
    serverComponentsExternalPackages: ['puppeteer'],
  },
  images: {
    domains: ['lh3.googleusercontent.com'],
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, net: false, tls: false, child_process: false,
      }
    }
    return config
  },
}

module.exports = nextConfig
