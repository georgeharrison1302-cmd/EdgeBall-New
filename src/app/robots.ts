import type { MetadataRoute } from "next";

import { SITE_URL as base } from "@/lib/seo/entities";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/auth/", "/portfolio", "/watchlist"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
