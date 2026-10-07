import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/football/**",
      },
    ],
  },
  async redirects() {
    return [{ source: "/desk.html", destination: "/today", permanent: false }];
  },
};

export default nextConfig;
