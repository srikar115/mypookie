import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow HMR + dev asset requests from LAN IPs. Only affects `next dev`;
  // production builds are unaffected. See:
  //   https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["10.5.0.2"],
};

export default nextConfig;
