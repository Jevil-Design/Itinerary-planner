/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Commons serves the destination photography. Declared so a later switch to
    // next/image does not silently start proxying an undeclared host.
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'thumb.wikimedia.org' },
    ],
  },
  poweredByHeader: false,
  // public/prototype/index.html is reachable at its full path, but Next does
  // not resolve a directory index, so bare /prototype would 404.
  async rewrites() {
    return [{ source: '/prototype', destination: '/prototype/index.html' }];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};
export default nextConfig;
