import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL || "https://www.edgeball.co.uk";

const routes = [
  "",
  "/props",
  "/match-props",
  "/generator",
  "/ladder",
  "/competitions",
  "/referees",
  "/record",
  "/pricing",
  "/terms",
  "/privacy",
  "/responsible-gambling",
  "/affiliate-disclosure",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return routes.map((path) => ({ url: `${base}${path}`, lastModified }));
}
