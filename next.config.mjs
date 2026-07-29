/** @type {import('next').NextConfig} */
const nextConfig = {
  // the shared UI package @aivocado/mindsheet ships as raw TS/TSX source,
  // so Next must transpile it (same package the AI-Researcher app uses).
  transpilePackages: ['@aivocado/mindsheet'],
  // the package is symlinked in from a sibling repo (../../ai-researcher),
  // outside this project — widen Turbopack's root so it will resolve/compile it.
  turbopack: {
    root: 'C:/Users/nehoc',
  },
};

export default nextConfig;
