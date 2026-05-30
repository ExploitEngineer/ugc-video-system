import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // @ugc/shared ships raw TypeScript consumed via workspace:*. Transpile it
  // so Next compiles its source and resolves its `.js` (TS-style) re-exports.
  transpilePackages: ["@ugc/shared"],
};

export default nextConfig;
