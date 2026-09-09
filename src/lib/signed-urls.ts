"use client";

/**
 * Client-side signed URL cache. Avatars render everywhere, so URLs are
 * fetched in batches and reused until shortly before expiry (spec §2.4:
 * do not re-sign per render).
 */

interface Entry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<string | null>>();

export async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.url;
  const inflight = pending.get(path);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const res = await fetch("/api/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [path] }),
      });
      if (!res.ok) return null;
      const data: { urls: Record<string, { url: string; expiresIn: number }> } = await res.json();
      const entry = data.urls[path];
      if (!entry) return null;
      cache.set(path, { url: entry.url, expiresAt: Date.now() + entry.expiresIn * 1000 });
      return entry.url;
    } catch {
      return null;
    } finally {
      pending.delete(path);
    }
  })();
  pending.set(path, p);
  return p;
}
