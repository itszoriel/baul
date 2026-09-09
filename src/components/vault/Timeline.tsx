"use client";

import { motion } from "framer-motion";
import { Lock, Music2, SmilePlus, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { cn } from "@/components/ui";
import { signedUrl } from "@/lib/signed-urls";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Member, VaultSticker } from "@/lib/types";
import { ReactionPicker, StickerArt } from "./ReactionPicker";
import { REACTION_EMOJIS, type MemoryWithExtras } from "./vault-data";

const TIMELINE_TIME_ZONE = "Asia/Manila";
const timelineDayFormatter = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIMELINE_TIME_ZONE,
});
const timelineTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIMELINE_TIME_ZONE,
});

function timelineDayKey(timestamp: string): string {
  return timelineDayFormatter.format(new Date(timestamp));
}

function timelineTime(timestamp: string): string {
  return timelineTimeFormatter.format(new Date(timestamp));
}

/**
 * The memory timeline (spec §2.3): a chronological conversation where the
 * current keeper stays right and every other keeper stays left. Day dividers
 * and exact spine times preserve the archival timeline character.
 */
export function Timeline({
  memories,
  members,
  meId,
  isAdmin,
  onPlaySong,
  stickers,
  onStickerAdded,
}: {
  memories: MemoryWithExtras[];
  members: Member[];
  meId: string;
  isAdmin: boolean;
  onPlaySong: (songId: string) => void;
  stickers: VaultSticker[];
  onStickerAdded: (sticker: VaultSticker) => void;
}) {
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  if (memories.length === 0) {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center sm:py-24">
        <div className="glass lid-light mx-auto grid size-16 place-items-center rounded-2xl sm:size-20 sm:rounded-3xl">
          <Logo size={38} />
        </div>
        <h2 className="mt-5 font-display text-[1.65rem] leading-tight text-starlight sm:text-2xl">The chest is open, and empty.</h2>
        <p className="mt-2 text-sm text-dim">Keep the first memory — a note, a photo, or a sealed letter.</p>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-3xl px-3 pb-36 sm:px-4 sm:pb-40">
      {/* spine */}
      <div aria-hidden className="absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-white/10 md:block" />

      <ol className="space-y-4 pt-3 sm:space-y-7 sm:pt-8">
        {memories.map((memory, i) => {
          const note = memory.kind === "note";
          const mine = memory.member_id === meId;
          const day = timelineDayKey(memory.created_at);
          const beginsDay = i === 0 || timelineDayKey(memories[i - 1]!.created_at) !== day;
          return (
            <Fragment key={memory.id}>
              {beginsDay && (
                <li className="relative z-10 flex items-center gap-3 py-1" role="separator">
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent to-brass/20" aria-hidden />
                  <time
                    dateTime={memory.created_at}
                    className="rounded-full border border-brass/20 bg-night-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brass-2 sm:text-[11px]"
                  >
                    {day}
                  </time>
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-brass/20" aria-hidden />
                </li>
              )}

              <motion.li
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className={cn("relative flex", mine ? "justify-end" : "justify-start")}
              >
                <time
                  dateTime={memory.created_at}
                  title={`${day}, Philippine time`}
                  className="absolute left-1/2 top-4 z-10 hidden w-14 -translate-x-1/2 flex-col items-center gap-1 text-center text-[9px] font-medium leading-tight text-dim md:flex"
                >
                  <span className="size-2 rounded-full border-2 border-night bg-brass shadow-[0_0_0_1px_rgba(224,191,120,.35)]" aria-hidden />
                  {timelineTime(memory.created_at)}
                </time>

                <div
                  className={cn(
                    "w-[94%] md:w-[calc(50%-2.5rem)]",
                    note && "w-[86%] max-w-[32rem]",
                  )}
                >
                  <MemoryCard
                    memory={memory}
                    author={memberById.get(memory.member_id) ?? null}
                    memberById={memberById}
                    meId={meId}
                    isAdmin={isAdmin}
                    onPlaySong={onPlaySong}
                    stickers={stickers}
                    onStickerAdded={onStickerAdded}
                  />
                </div>
              </motion.li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}

function MemoryCard({
  memory,
  author,
  memberById,
  meId,
  isAdmin,
  onPlaySong,
  stickers,
  onStickerAdded,
}: {
  memory: MemoryWithExtras;
  author: Member | null;
  memberById: Map<string, Member>;
  meId: string;
  isAdmin: boolean;
  onPlaySong: (songId: string) => void;
  stickers: VaultSticker[];
  onStickerAdded: (sticker: VaultSticker) => void;
}) {
  const db = supabaseBrowser();
  const [showReplies, setShowReplies] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [reply, setReply] = useState("");
  const [burst, setBurst] = useState<string | null>(null);
  const locked = memory.unlock_at !== null && new Date(memory.unlock_at) > new Date();
  const mine = memory.member_id === meId;
  const note = memory.kind === "note";
  const sentNote = note && mine;
  const visibleContent = memory.content ?? memory.memory_capsule_payloads?.content ?? null;

  async function toggleReaction(emoji: string) {
    const existing = memory.reactions.find((r) => r.member_id === meId && r.emoji === emoji);
    if (existing) {
      const { error } = await db.from("reactions").delete().eq("id", existing.id);
      if (error) throw error;
    } else {
      setBurst(emoji);
      setTimeout(() => setBurst(null), 400);
      const { error } = await db.from("reactions").insert({
        memory_id: memory.id,
        member_id: meId,
        vault_id: memory.vault_id,
        emoji,
      });
      if (error) throw error;
    }
  }

  async function toggleSticker(stickerId: string) {
    const existing = memory.reactions.find((reaction) => reaction.member_id === meId && reaction.sticker_id === stickerId);
    if (existing) {
      const { error } = await db.from("reactions").delete().eq("id", existing.id);
      if (error) throw error;
    } else {
      setBurst(`sticker:${stickerId}`);
      setTimeout(() => setBurst(null), 400);
      const { error } = await db.from("reactions").insert({
        memory_id: memory.id,
        member_id: meId,
        vault_id: memory.vault_id,
        sticker_id: stickerId,
        emoji: null,
      });
      if (error) throw error;
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    const body = reply.trim();
    if (!body) return;
    setReply("");
    await db.from("memory_replies").insert({
      memory_id: memory.id,
      member_id: meId,
      vault_id: memory.vault_id,
      body,
    });
  }

  async function remove() {
    if (!confirm("Take this memory out of the baul forever?")) return;
    await db.from("memories").delete().eq("id", memory.id);
  }

  const counts = REACTION_EMOJIS.map((e) => ({
    emoji: e,
    n: memory.reactions.filter((r) => r.emoji === e).length,
    mine: memory.reactions.some((r) => r.emoji === e && r.member_id === meId),
  })).filter((c) => c.n > 0);
  const stickerById = new Map(stickers.map((sticker) => [sticker.id, sticker]));
  const stickerCounts = Array.from(
    memory.reactions.reduce((countsBySticker, reaction) => {
      if (reaction.sticker_id) countsBySticker.set(reaction.sticker_id, (countsBySticker.get(reaction.sticker_id) ?? 0) + 1);
      return countsBySticker;
    }, new Map<string, number>()),
  ).map(([stickerId, n]) => ({
    stickerId,
    n,
    mine: memory.reactions.some((reaction) => reaction.sticker_id === stickerId && reaction.member_id === meId),
    sticker: stickerById.get(stickerId),
  })).filter((item): item is typeof item & { sticker: VaultSticker } => Boolean(item.sticker));

  return (
    <>
    <article
      className={cn(
        "rounded-2xl p-4 sm:p-5",
        memory.kind === "letter" && !locked
          ? "parchment"
          : note
            ? sentNote
              ? "rounded-br-md border border-accent-b/25 bg-[linear-gradient(135deg,var(--accent-a),var(--accent-b))] text-night shadow-[0_12px_28px_rgba(0,0,0,.16)]"
              : "rounded-bl-md border border-brass/15 bg-[#30251b] shadow-[0_12px_28px_rgba(0,0,0,.16)]"
            : "glass",
      )}
      aria-label={note ? (sentNote ? "Your note" : `Note from ${author?.display_name ?? "someone"}`) : undefined}
    >
      <header className={cn("flex items-center gap-2.5", sentNote && "flex-row-reverse")}>
        {author && !sentNote && <Avatar member={author} size={30} />}
        <div className={cn("min-w-0 flex-1", sentNote && "text-right")}>
          <p className={cn("truncate text-sm font-medium", memory.kind === "letter" && !locked ? "text-ink" : sentNote ? "text-night" : "text-starlight")}>
            {sentNote ? "You" : (author?.display_name ?? "Someone")}
          </p>
          <p className={cn("text-xs", memory.kind === "letter" && !locked ? "text-ink/60" : sentNote ? "text-night/65" : "text-dim")}>
            {memory.kind === "letter"
              ? locked
                ? "sealed a letter"
                : "left a letter"
              : memory.kind === "photo"
                ? "kept a photo"
                : sentNote
                  ? "sent a note"
                  : "left a note"}{" "}
            <span className="md:hidden"> · {timelineTime(memory.created_at)}</span>
          </p>
        </div>
        {(mine || isAdmin) && (
          <button
            onClick={remove}
            className={cn(
              "grid size-9 cursor-pointer place-items-center rounded-full text-xs transition-colors",
              memory.kind === "letter" && !locked
                ? "text-ink/50 hover:text-ink"
                : sentNote
                  ? "text-night/55 hover:bg-night/10 hover:text-night"
                  : "text-dim/60 hover:text-red-300",
            )}
            aria-label="Delete this memory"
          >
            <X className="size-3.5" />
          </button>
        )}
      </header>

      <div className="mt-3">
        {locked ? (
          <div className="rounded-xl border border-dashed border-brass/40 bg-brass/5 p-4 text-center sm:p-5">
            <Lock className="mx-auto size-6 text-brass" />
            <p className="mt-2 font-display text-starlight">A sealed letter</p>
            <p className="mt-1 text-xs text-dim">
              Opens{" "}
              {new Date(memory.unlock_at!).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        ) : (
          <>
            {memory.kind === "photo" && memory.media_url && <MemoryPhoto path={memory.media_url} />}
            {visibleContent && (
              <p
                className={cn(
                  "whitespace-pre-wrap text-[0.95rem] leading-relaxed",
                  memory.kind === "letter" ? "font-display text-ink" : sentNote ? "text-night" : "text-starlight",
                  note && "text-base",
                  memory.kind === "photo" && "mt-2 text-sm text-dim",
                )}
              >
                {visibleContent}
              </p>
            )}
          </>
        )}
        {memory.song_id && !locked && (
          <button
            onClick={() => onPlaySong(memory.song_id!)}
            className={cn(
              "mt-3 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
              memory.kind === "letter"
                ? "bg-ink/10 text-ink hover:bg-ink/20"
                : sentNote
                  ? "bg-night/10 text-night/75 hover:bg-night/20 hover:text-night"
                  : "glass text-dim hover:text-starlight",
            )}
          >
            <Music2 className="size-3.5" /> this one has a song — play it
          </button>
        )}
      </div>

      {!locked && (
        <footer className="mt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowReactions(true)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs",
                sentNote ? "bg-night/10 text-night/70" : "bg-white/5 text-dim",
              )}
              aria-expanded={showReactions}
              aria-label="Choose a reaction or custom sticker"
            >
              <SmilePlus className="size-4" /> React
            </button>
            {counts.map((c) => (
              <button
                key={c.emoji}
                onClick={() => toggleReaction(c.emoji)}
                className={cn(
                  "min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full px-2 py-1 text-sm transition-all",
                  "inline-flex",
                  burst === c.emoji && "heart-burst",
                  c.mine
                    ? sentNote
                      ? "bg-night/20 ring-1 ring-night/30"
                      : "bg-white/15 ring-1 ring-brass/50"
                    : memory.kind === "letter"
                      ? "bg-ink/5 hover:bg-ink/15"
                      : sentNote
                        ? "bg-night/10 hover:bg-night/20"
                        : "bg-white/5 hover:bg-white/12",
                )}
                aria-pressed={c.mine}
                aria-label={`React ${c.emoji}`}
              >
                {c.emoji}
                {c.n > 0 && <span className={cn("ml-1 text-xs", memory.kind === "letter" ? "text-ink/70" : sentNote ? "text-night/70" : "text-dim")}>{c.n}</span>}
              </button>
            ))}
            {stickerCounts.map((item) => (
              <button
                key={item.stickerId}
                onClick={() => toggleSticker(item.stickerId)}
                className={cn(
                  "inline-flex min-h-9 min-w-9 items-center justify-center rounded-full px-2 py-1 transition-all",
                  burst === `sticker:${item.stickerId}` && "heart-burst",
                  item.mine
                    ? sentNote ? "bg-night/20 ring-1 ring-night/30" : "bg-white/15 ring-1 ring-brass/50"
                    : sentNote ? "bg-night/10 hover:bg-night/20" : "bg-white/5 hover:bg-white/12",
                )}
                aria-pressed={item.mine}
                aria-label={`React with ${item.sticker.name}`}
              >
                <StickerArt sticker={item.sticker} className="size-6 object-contain" />
                <span className={cn("ml-1 text-xs", sentNote ? "text-night/70" : "text-dim")}>{item.n}</span>
              </button>
            ))}
            <button
              onClick={() => setShowReplies((v) => !v)}
              className={cn(
                "ml-auto min-h-9 cursor-pointer rounded-full px-2 text-xs transition-colors",
                memory.kind === "letter"
                  ? "text-ink/60 hover:text-ink"
                  : sentNote
                    ? "text-night/65 hover:bg-night/10 hover:text-night"
                    : "text-dim hover:text-starlight",
              )}
            >
              {memory.memory_replies.length > 0
                ? `${memory.memory_replies.length} repl${memory.memory_replies.length === 1 ? "y" : "ies"}`
                : "reply"}
            </button>
          </div>

          {showReplies && (
            <div className={cn("mt-3 space-y-2 border-t pt-3", memory.kind === "letter" ? "border-ink/15" : sentNote ? "border-night/15" : "border-white/10")}>
              {memory.memory_replies.map((r) => (
                <p key={r.id} className={cn("text-sm", memory.kind === "letter" ? "text-ink" : sentNote ? "text-night" : "text-starlight")}>
                  <span className={cn("font-medium", memory.kind === "letter" ? "text-ink/70" : sentNote ? "text-night/65" : "text-dim")}>
                    {r.member_id === meId ? "You" : (memberById.get(r.member_id)?.display_name ?? "Someone")}:{" "}
                  </span>
                  {r.body}
                </p>
              ))}
              <form onSubmit={sendReply} className="flex gap-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Say something under this…"
                  className={cn(
                    "min-h-11 min-w-0 flex-1 rounded-full px-3 py-1.5 text-sm focus:outline-none",
                    memory.kind === "letter"
                      ? "bg-ink/10 text-ink placeholder:text-ink/40"
                      : sentNote
                        ? "bg-night/10 text-night placeholder:text-night/45"
                        : "bg-white/5 text-starlight placeholder:text-dim/60",
                  )}
                />
              </form>
            </div>
          )}
        </footer>
      )}
    </article>
    <ReactionPicker
      open={showReactions}
      onClose={() => setShowReactions(false)}
      vaultId={memory.vault_id}
      stickers={stickers}
      onStickerAdded={onStickerAdded}
      onEmoji={toggleReaction}
      onSticker={toggleSticker}
    />
    </>
  );
}

function MemoryPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signedUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="A kept photo" className="max-h-96 w-full rounded-xl object-cover" loading="lazy" />
  ) : (
    <div className="h-48 w-full animate-pulse rounded-xl bg-white/5" aria-hidden />
  );
}
