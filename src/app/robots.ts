import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = appUrl();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/acceptable-use", "/support"],
      disallow: ["/api/", "/create", "/enter", "/invite/", "/offline", "/recover", "/vault", "/vaults"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
