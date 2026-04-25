/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: isProd
      ? ['mongoose']
      : ['mongoose', 'mongodb-memory-server']
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
