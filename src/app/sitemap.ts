import type { MetadataRoute } from "next";

const baseUrl = "https://baul.vercel.app";
const lastModified = new Date("2026-09-09T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/privacy", "/terms", "/acceptable-use", "/support"].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency: path ? "monthly" : "weekly",
    priority: path ? 0.5 : 1,
  }));
}
