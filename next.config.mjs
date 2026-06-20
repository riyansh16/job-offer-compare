/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Azure Static Web Apps' Next.js hybrid runtime: produces
  // .next/standalone/ which the SWA Functions runtime can execute.
  // See https://learn.microsoft.com/azure/static-web-apps/deploy-nextjs-hybrid
  output: 'standalone',
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.offerlens.in' }],
        destination: 'https://offerlens.in/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
