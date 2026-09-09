import type { Memory, MemoryReply, Reaction } from "@/lib/types";

/** A memory hydrated with its reactions and reply thread (spec §2.3). */
export interface MemoryWithExtras extends Memory {
  reactions: Reaction[];
  memory_replies: MemoryReply[];
}

export const REACTION_EMOJIS = ["❤️", "🥺", "🔥", "😂", "✨"] as const;

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
