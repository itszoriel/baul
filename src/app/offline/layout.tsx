import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OfflineLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return children;
}
