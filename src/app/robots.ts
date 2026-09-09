import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/acceptable-use", "/support"],
      disallow: ["/api/", "/create", "/enter", "/invite/", "/offline", "/recover", "/vault", "/vaults"],
    },
    sitemap: "https://baul.vercel.app/sitemap.xml",
    host: "https://baul.vercel.app",
  };
}
