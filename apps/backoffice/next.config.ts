import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// The backoffice calls the API under /api on its own origin, like the POS: the session
// cookie is the API's own (HttpOnly, host-only), and no CORS is needed. Rewrites are fixed
// when the app is built, so a build points at the API it is built for.
const apiOrigin = process.env.FNB_API_ORIGIN ?? "http://127.0.0.1:3000";

export default function nextConfig(phase: string): NextConfig {
  return {
    // A build never writes where a running dev server reads: `next build` into the dev
    // server's directory kills it. Both stay under gitignored directories.
    distDir:
      process.env.FNB_NEXT_DIST_DIR ?? (phase === PHASE_DEVELOPMENT_SERVER ? "tmp/next-dev" : "dist"),
    reactStrictMode: false,
    poweredByHeader: false,
    // The workspace packages ship TypeScript sources.
    transpilePackages: ["@fnb/domain", "@fnb/contracts"],
    // Types and lint are their own gates (turbo typecheck, root eslint); running them again
    // inside the build only costs memory on the machines that build.
    typescript: { ignoreBuildErrors: true },
    eslint: { ignoreDuringBuilds: true },
    async rewrites() {
      return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
    },
  };
}
