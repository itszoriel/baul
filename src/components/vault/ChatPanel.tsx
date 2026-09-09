"use client";

import { AnimatePresence, motion } from "framer-motion";
import { SendHorizontal, SmilePlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Member, Message, MessageReaction, VaultSticker } from "@/lib/types";
import { ReactionPicker, StickerArt } from "./ReactionPicker";
import { REACTION_EMOJIS, timeAgo } from "./vault-data";

const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;

type ChatMessage = Message & { message_reactions: MessageReaction[] };

function sharesMessageGroup(a: Message | undefined, b: Message | undefined): boolean {
  if (!a || !b || a.member_id !== b.member_id) return false;
  const aTime = Date.parse(a.created_at);
  const bTime = Date.parse(b.created_at);
  return Number.isFinite(aTime) && Number.isFinite(bTime) && Math.abs(bTime - aTime) <= MESSAGE_GROUP_WINDOW_MS;
}

/** Slide-in realtime chat scoped to the vault (spec §2.3). */
export function ChatPanel({
  open,
  onClose,
  vaultId,
  meId,
  members,
  stickers,
  onStickerAdded,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  meId: string;
  members: Member[];
  stickers: VaultSticker[];
  onStickerAdded: (sticker: VaultSticker) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLLIElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const reactionMessageIdRef = useRef<string | null>(null);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const stickerById = useMemo(() => new Map(stickers.map((sticker) => [sticker.id, sticker])), [stickers]);
  const db = supabaseBrowser();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    reactionMessageIdRef.current = reactionMessageId;
  }, [reactionMessageId]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("button")?.focus());
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && reactionMessageIdRef.current === null) onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || loaded) return;
    db.from("messages")
      .select("id, vault_id, member_id, body, created_at, message_reactions!message_reactions_message_same_vault_fk(id, message_id, member_id, vault_id, emoji, sticker_id, created_at)")
      .order("created_at", { ascending: false })
      .limit(150)
      .then(({ data, error: loadError }) => {
        if (loadError) setError("Whispers could not be opened. Please try again.");
        setMessages(((data as ChatMessage[]) ?? []).reverse());
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded]);

  useEffect(() => {
    // Unique topic per mount (supabase-js caches channels by topic).
    const channel = db
      .channel(`chat-${vaultId}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `vault_id=eq.${vaultId}` },
        ({ new: row }) => setMessages((m) => {
          const message = row as Message;
          return m.some((x) => x.id === message.id) ? m : [...m, { ...message, message_reactions: [] }];
        }),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        ({ old: row }) => setMessages((m) => m.filter((x) => x.id !== (row as Message).id)),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions", filter: `vault_id=eq.${vaultId}` },
        ({ new: row }) => {
          const reaction = row as MessageReaction;
          setMessages((items) => items.map((message) =>
            message.id === reaction.message_id && !message.message_reactions.some((item) => item.id === reaction.id)
              ? { ...message, message_reactions: [...message.message_reactions, reaction] }
              : message,
          ));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        ({ old: row }) => {
          const id = (row as { id: string }).id;
          setMessages((items) => items.map((message) =>
            message.message_reactions.some((reaction) => reaction.id === id)
              ? { ...message, message_reactions: message.message_reactions.filter((reaction) => reaction.id !== id) }
              : message,
          ));
        },
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError(null);
    const { error: sendError } = await db.from("messages").insert({ vault_id: vaultId, member_id: meId, body });
    if (sendError) {
      setDraft(body);
      setError("That whisper was not sent. Please try again.");
    }
  }

  function addReactionLocally(reaction: MessageReaction) {
    setMessages((items) => items.map((message) =>
      message.id === reaction.message_id && !message.message_reactions.some((item) => item.id === reaction.id)
        ? { ...message, message_reactions: [...message.message_reactions, reaction] }
        : message,
    ));
  }

  async function toggleEmoji(message: ChatMessage, emoji: string) {
    const existing = message.message_reactions.find((reaction) => reaction.member_id === meId && reaction.emoji === emoji);
    if (existing) {
      const { error: removeError } = await db.from("message_reactions").delete().eq("id", existing.id);
      if (removeError) throw removeError;
      setMessages((items) => items.map((item) => item.id === message.id
        ? { ...item, message_reactions: item.message_reactions.filter((reaction) => reaction.id !== existing.id) }
        : item));
      return;
    }

    const { data, error: addError } = await db.from("message_reactions").insert({
      message_id: message.id,
      member_id: meId,
      vault_id: message.vault_id,
      emoji,
    }).select("id, message_id, member_id, vault_id, emoji, sticker_id, created_at").single();
    if (addError) throw addError;
    addReactionLocally(data);
  }

  async function toggleSticker(message: ChatMessage, stickerId: string) {
    const existing = message.message_reactions.find((reaction) => reaction.member_id === meId && reaction.sticker_id === stickerId);
    if (existing) {
      const { error: removeError } = await db.from("message_reactions").delete().eq("id", existing.id);
      if (removeError) throw removeError;
      setMessages((items) => items.map((item) => item.id === message.id
        ? { ...item, message_reactions: item.message_reactions.filter((reaction) => reaction.id !== existing.id) }
        : item));
      return;
    }

    const { data, error: addError } = await db.from("message_reactions").insert({
      message_id: message.id,
      member_id: meId,
      vault_id: message.vault_id,
      emoji: null,
      sticker_id: stickerId,
    }).select("id, message_id, member_id, vault_id, emoji, sticker_id, created_at").single();
    if (addError) throw addError;
    addReactionLocally(data);
  }

  const reactionTarget = messages.find((message) => message.id === reactionMessageId) ?? null;

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.aside
          ref={panelRef}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-brass/15 bg-night-2/98 shadow-2xl shadow-black/50 backdrop-blur-xl"
          aria-label="Baul chat"
          aria-modal="true"
          role="dialog"
        >
          <header className="flex min-h-14 items-center justify-between border-b border-brass/12 px-4 pt-[env(safe-area-inset-top)]">
            <div>
              <p className="section-kicker">Keeper chat</p>
              <h3 className="font-display text-lg text-starlight">Whispers</h3>
            </div>
            <button onClick={onClose} className="grid size-11 cursor-pointer place-items-center rounded-full text-dim hover:bg-white/8 hover:text-starlight" aria-label="Close chat">
              <X className="size-4" />
            </button>
          </header>

          <ol
            className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
            aria-label="Messages"
          >
            {messages.map((m, index) => {
              const sender = memberById.get(m.member_id);
              const mine = m.member_id === meId;
              const startsGroup = !sharesMessageGroup(messages[index - 1], m);
              const endsGroup = !sharesMessageGroup(m, messages[index + 1]);
              const emojiCounts = REACTION_EMOJIS.map((emoji) => ({
                emoji,
                count: m.message_reactions.filter((reaction) => reaction.emoji === emoji).length,
                mine: m.message_reactions.some((reaction) => reaction.emoji === emoji && reaction.member_id === meId),
              })).filter((item) => item.count > 0);
              const stickerCounts = Array.from(m.message_reactions.reduce((counts, reaction) => {
                if (reaction.sticker_id) counts.set(reaction.sticker_id, (counts.get(reaction.sticker_id) ?? 0) + 1);
                return counts;
              }, new Map<string, number>())).map(([stickerId, count]) => ({
                stickerId,
                count,
                mine: m.message_reactions.some((reaction) => reaction.sticker_id === stickerId && reaction.member_id === meId),
                sticker: stickerById.get(stickerId),
              })).filter((item): item is typeof item & { sticker: VaultSticker } => Boolean(item.sticker));
              return (
                <li
                  key={m.id}
                  className={cn(
                    "group/message flex items-end gap-2",
                    mine ? "justify-end" : "justify-start",
                    startsGroup ? "mt-4 first:mt-0" : "mt-1",
                  )}
                >
                  {!mine && (
                    <span className="w-7 shrink-0 self-end">
                      {endsGroup && sender ? <Avatar member={sender} size={28} /> : null}
                    </span>
                  )}

                  <div className={cn("flex max-w-[82%] flex-col sm:max-w-[76%]", mine ? "items-end" : "items-start")}>
                    {!mine && startsGroup && (
                      <p className="mb-1 px-2 text-[11px] font-medium text-brass-2/85">
                        {sender?.display_name ?? "Someone"}
                      </p>
                    )}

                    <div
                      className={cn(
                        "px-3.5 py-2.5 text-[15px] leading-snug shadow-[0_8px_20px_rgba(0,0,0,.12)]",
                        mine
                          ? "accent-fill text-night"
                          : "border border-brass/12 bg-[#30251b] text-starlight",
                        mine && startsGroup && endsGroup && "rounded-[1.15rem] rounded-br-[0.35rem]",
                        mine && startsGroup && !endsGroup && "rounded-[1.15rem] rounded-br-md",
                        mine && !startsGroup && !endsGroup && "rounded-[1.15rem] rounded-r-md",
                        mine && !startsGroup && endsGroup && "rounded-[1.15rem] rounded-tr-md rounded-br-[0.35rem]",
                        !mine && startsGroup && endsGroup && "rounded-[1.15rem] rounded-bl-[0.35rem]",
                        !mine && startsGroup && !endsGroup && "rounded-[1.15rem] rounded-bl-md",
                        !mine && !startsGroup && !endsGroup && "rounded-[1.15rem] rounded-l-md",
                        !mine && !startsGroup && endsGroup && "rounded-[1.15rem] rounded-tl-md rounded-bl-[0.35rem]",
                      )}
                      aria-label={`${mine ? "Sent" : `Received from ${sender?.display_name ?? "someone"}`}: ${m.body}`}
                      role="group"
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </div>

                    <div className={cn("mt-1 flex max-w-full flex-wrap items-center gap-1", mine && "justify-end")}>
                      {emojiCounts.map((item) => (
                        <button
                          key={item.emoji}
                          type="button"
                          onClick={() => toggleEmoji(m, item.emoji).catch(() => setError("That reaction did not stick. Please try again."))}
                          className={cn(
                            "inline-flex min-h-7 items-center rounded-full border px-1.5 text-xs transition",
                            item.mine ? "border-brass/50 bg-brass/15" : "border-white/8 bg-white/5 hover:bg-white/10",
                          )}
                          aria-pressed={item.mine}
                          aria-label={`React ${item.emoji}`}
                        >
                          {item.emoji}<span className="ml-1 text-[10px] text-dim">{item.count}</span>
                        </button>
                      ))}
                      {stickerCounts.map((item) => (
                        <button
                          key={item.stickerId}
                          type="button"
                          onClick={() => toggleSticker(m, item.stickerId).catch(() => setError("That reaction did not stick. Please try again."))}
                          className={cn(
                            "inline-flex min-h-7 items-center rounded-full border px-1.5 transition",
                            item.mine ? "border-brass/50 bg-brass/15" : "border-white/8 bg-white/5 hover:bg-white/10",
                          )}
                          aria-pressed={item.mine}
                          aria-label={`React with ${item.sticker.name}`}
                        >
                          <StickerArt sticker={item.sticker} className="size-5 object-contain" />
                          <span className="ml-1 text-[10px] text-dim">{item.count}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setReactionMessageId(m.id)}
                        className="grid size-7 place-items-center rounded-full text-dim/75 transition hover:bg-white/8 hover:text-starlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass sm:opacity-45 sm:group-hover/message:opacity-100 sm:focus-visible:opacity-100"
                        aria-label="React to this whisper"
                      >
                        <SmilePlus className="size-3.5" />
                      </button>
                    </div>

                    {endsGroup && (
                      <p className={cn("mt-1 px-2 text-[10px] text-dim/60", mine && "text-right")}>
                        {mine ? "Sent · " : ""}{timeAgo(m.created_at)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
            {loaded && messages.length === 0 && (
              <li className="pt-12 text-center">
                <p className="font-display text-lg text-starlight">The conversation is quiet.</p>
                <p className="mt-1 text-sm text-dim">Send the first whisper to your keepers.</p>
              </li>
            )}
            {error && <li className="px-3 pt-3 text-center text-xs text-red-300" role="alert">{error}</li>}
            <li ref={bottomRef} aria-hidden />
          </ol>

          <form onSubmit={send} className="flex gap-2 border-t border-brass/12 p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Whisper into the baul…"
              className="min-h-11 min-w-0 flex-1 rounded-full border border-brass/15 bg-[#201912] px-4 py-2.5 text-sm text-starlight placeholder:text-dim/60 focus:border-brass/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              className="accent-fill grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-night disabled:opacity-40"
            >
              <SendHorizontal className="size-4" />
            </button>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
    <ReactionPicker
      open={open && reactionTarget !== null}
      onClose={() => setReactionMessageId(null)}
      vaultId={vaultId}
      stickers={stickers}
      onStickerAdded={onStickerAdded}
      onEmoji={(emoji) => reactionTarget ? toggleEmoji(reactionTarget, emoji) : Promise.resolve()}
      onSticker={(stickerId) => reactionTarget ? toggleSticker(reactionTarget, stickerId) : Promise.resolve()}
    />
    </>
  );
}
