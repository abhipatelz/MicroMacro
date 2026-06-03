/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

// Content Security Policy.
// - 'unsafe-inline' / 'unsafe-eval' on script-src: Next.js inlines hydration
//   bootstrap and uses eval in dev. Acceptable for an internal GxP app where
//   XSS is not the primary threat model.
// - va.vercel-scripts.com, vitals.vercel-insights.com: Vercel Analytics and
//   Speed Insights. Gemini / Anthropic are server-side only and don't need
//   client allowances.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // font-src: self covers /_next/static fonts; data: covers inline SVG fonts.
  // No third-party font CDN — fonts are system-stack or served from self.
  "font-src 'self' data:",
  "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join('; ');

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-XSS-Protection',          value: '1; mode=block' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy',   value: cspDirectives },
  ...(isProd ? [{
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  }] : []),
];

const nextConfig = {
  reactStrictMode: true,
  // gzip/br compression of server responses (HTML, JSON, JS).
  compress: true,
  // Don't leak the framework version header.
  poweredByHeader: false,
  experimental: {
    // mongodb-memory-server is a devDependency, loaded only via a dynamic
    // import gated behind USE_IN_MEMORY_MONGO (never set in prod). Keep it
    // external in BOTH modes so webpack doesn't pull this dev-only package
    // (and its optional `aws4` transitive) into the production server bundle.
    serverComponentsExternalPackages: ['mongoose', 'mongodb-memory-server'],
    // Transform barrel imports (e.g. lucide-react) into direct per-icon
    // imports at build time. Harmless win; lucide-react is imported in 26 files.
    optimizePackageImports: ['lucide-react'],
    // Cache client-side navigations for 30s (static) and 60s (dynamic) so
    // navigating back to a visited page avoids a full server round-trip.
    staleTimes: { static: 30, dynamic: 60 },
  },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      // Immutable cache for fingerprinted Next.js static assets — safe because
      // the hash in the filename changes every build. Eliminates re-downloads
      // on repeat visits and subsequent navigations.
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Favicon and other public-dir assets: 1 week cache with revalidation.
      {
        source: '/favicon:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
      { source: '/(.*)', headers: securityHeaders },
    ];
  },
};

export default nextConfig;
