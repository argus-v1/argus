import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: { root: __dirname },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default config;
