/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@eld/db', '@eld/shared'],
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};
export default nextConfig;
