/** @type {import('next').NextConfig} */
const nextConfig = {
  // the shared UI package @aivocado/mindsheet ships as raw TS/TSX source
  // (installed from github:svedenieva/mindsheet), so Next must transpile it.
  transpilePackages: ['@aivocado/mindsheet'],
};

export default nextConfig;
