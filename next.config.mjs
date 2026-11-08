/** @type {import('next').NextConfig} */
const nextConfig = {
  // Public pages use ISR; routes that need a live database call opt out with
  // `dynamic = 'force-dynamic'`.
  cacheComponents: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Cover images may be hosted in Firebase Storage or another CDN.
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
    ],
  },
}

export default nextConfig