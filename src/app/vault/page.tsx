"use client";

import { KeyRound, Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { ChatPanel } from "@/components/vault/ChatPanel";
import { Composer } from "@/components/vault/Composer";
import { MusicBar } from "@/components/vault/MusicBar";
import { Timeline } from "@/components/vault/Timeline";
import { VaultHeader } from "@/components/vault/VaultHeader";
import type { MemoryWithExtras } from "@/components/vault/vault-data";
import { memberRoleSchema, vaultPurposeSchema, vaultTypeSchema } from "@/lib/domain";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Member, MemoryReply, Reaction, Song, Vault, VaultSticker } from "@/lib/types";
import { currentClaims } from "@/lib/vault-client";

/** Memories are loaded newest-first in pages instead of all at once. */
const MEMORY_PAGE_SIZE = 50;
const MEMORY_COLUMNS = "id, vault_id, member_id, kind, content, media_url, song_id, unlock_at, created_at, reactions!reactions_memory_same_vault_fk(id, memory_id, member_id, vault_id, emoji, sticker_id), memory_replies!memory_replies_memory_same_vault_fk(id, memory_id, member_id, vault_id, body, created_at), memory_capsule_payloads!memory_capsule_payloads_memory_id_fkey(content)";

function parseMembers(rows: Array<Omit<Member, "role"> & { role: string }>): Member[] | null {
  const members: Member[] = [];
  for (const row of rows) {
    const role = memberRoleSchema.safeParse(row.role);
    if (!role.success) return null;
    members.push({ ...row, role: role.data });
  }
  return members;
}

/**
 * The vault interior (spec §2.3): timeline + chat + soundtrack + milestones,
 * all RLS-scoped to a live membership and kept live over realtime.
 */
export default function VaultPage() {
  const router = useRouter();
  const params = useParams<{ vaultId?: string }>();
  const requestedVaultId = params.vaultId;
  const db = supabaseBrowser();
  const [vault, setVault] = useState<Vault | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memories, setMemories] = useState<MemoryWithExtras[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [stickers, setStickers] = useState<VaultSticker[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [playRequest, setPlayRequest] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [hasOlderMemories, setHasOlderMemories] = useState(false);

  const load = useCallback(async () => {
    const claims = await currentClaims(requestedVaultId);
    if (!claims) {
      router.replace(requestedVaultId ? "/vaults" : "/vaults");
      return null;
    }
    localStorage.setItem("baul:last-vault-id", claims.vaultId);
    if (!requestedVaultId) router.replace(`/vault/${claims.vaultId}`);
    const [vaultRes, memberRes, memoryRes, songRes, stickerRes] = await Promise.all([
      db.from("vaults").select("id, name, vault_type, purpose, max_members, milestone_date, created_at").eq("id", claims.vaultId).maybeSingle(),
      db.from("members").select("id, vault_id, display_name, name_changed_at, avatar_url, avatar_color, role, joined_at, revoked_at").eq("vault_id", claims.vaultId).order("joined_at"),
      db.from("memories").select(MEMORY_COLUMNS).eq("vault_id", claims.vaultId).order("created_at", { ascending: false }).limit(MEMORY_PAGE_SIZE),
      db.from("songs").select("id, vault_id, added_by, title, source_url, file_url, created_at").eq("vault_id", claims.vaultId).order("created_at"),
      db.from("vault_stickers").select("id, vault_id, created_by, name, storage_path, created_at, retired_at").eq("vault_id", claims.vaultId).order("created_at"),
    ]);
    if (!vaultRes.data) {
      setFailed(true);
      return null;
    }
    const memberRows = parseMembers(memberRes.data ?? []);
    const vaultType = vaultTypeSchema.safeParse(vaultRes.data.vault_type);
    const purpose = vaultPurposeSchema.safeParse(vaultRes.data.purpose);
    if (!memberRows || !vaultType.success || !purpose.success) {
      setFailed(true);
      return null;
    }
    // The session's member row is gone (removed by an admin, or a vault this
    // device left long ago) — the claim is stale. Without this guard `me`
    // never resolves and the page spins forever; send them back to the key
    // door so re-entering the key rebinds (or rejoins) them.
    if (!memberRows.some((m) => m.id === claims.memberId)) {
      setFailed(true);
      return null;
    }
    setVault({ ...vaultRes.data, vault_type: vaultType.data, purpose: purpose.data });
    setMembers(memberRows);
    setMemories(memoryRes.data ?? []);
    setHasOlderMemories((memoryRes.data?.length ?? 0) === MEMORY_PAGE_SIZE);
    setSongs((songRes.data as Song[]) ?? []);
    setStickers(stickerRes.data ?? []);
    setMeId(claims.memberId);
    return claims;
  }, [db, requestedVaultId, router]);

  const loadOlderMemories = useCallback(async () => {
    const oldest = memories[memories.length - 1];
    if (!vault || !oldest) return;
    const { data, error } = await db
      .from("memories")
      .select(MEMORY_COLUMNS)
      .eq("vault_id", vault.id)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MEMORY_PAGE_SIZE);
    if (error) return;
    const rows = data ?? [];
    setMemories((current) => {
      const known = new Set(current.map((memory) => memory.id));
      return [...current, ...rows.filter((memory) => !known.has(memory.id))];
    });
    setHasOlderMemories(rows.length === MEMORY_PAGE_SIZE);
  }, [db, memories, vault]);

  // A sealed letter's text is unreadable (RLS) until unlock_at, so it was
  // fetched empty. When the next letter unlocks while the page is open, fetch
  // its payload then instead of waiting for a reload.
  useEffect(() => {
    const now = Date.now();
    const due = memories
      .filter((memory) => memory.unlock_at && !memory.content && !memory.memory_capsule_payloads?.content)
      .map((memory) => ({ id: memory.id, at: new Date(memory.unlock_at!).getTime() }))
      .filter((letter) => letter.at > now && letter.at - now < 24 * 60 * 60_000);
    if (!due.length) return;
    const nextAt = Math.min(...due.map((letter) => letter.at));
    const ids = due.filter((letter) => letter.at <= nextAt + 1_000).map((letter) => letter.id);
    // A small margin absorbs clock skew between this device and the database.
    const timer = window.setTimeout(async () => {
      const { data } = await db.from("memory_capsule_payloads").select("memory_id, content").in("memory_id", ids);
      if (!data?.length) return;
      const payloads = new Map(data.map((row) => [row.memory_id, row.content]));
      setMemories((current) => current.map((memory) => {
        const content = payloads.get(memory.id);
        return content == null ? memory : { ...memory, memory_capsule_payloads: { content } };
      }));
    }, nextAt - now + 3_000);
    return () => window.clearTimeout(timer);
  }, [db, memories]);

  useEffect(() => {
    let channel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;

    queueMicrotask(() => load().catch(() => setFailed(true)).then((claims) => {
      if (!claims || cancelled) return;
      const vaultFilter = `vault_id=eq.${claims.vaultId}`;

      // Unique topic per mount: supabase-js caches channels by topic, and a
      // StrictMode remount must not reuse an already-subscribed instance.
      channel = db
        .channel(`vault-${claims.vaultId}-${Date.now()}`)
        // memories arrive without their (empty) nested arrays
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "memories", filter: vaultFilter }, ({ new: row }) =>
          setMemories((m) =>
            m.some((x) => x.id === (row as MemoryWithExtras).id)
              ? m
              : [{ ...(row as MemoryWithExtras), reactions: [], memory_replies: [] }, ...m],
          ),
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "memories" }, ({ old: row }) =>
          setMemories((m) => m.filter((x) => x.id !== (row as { id: string }).id)),
        )
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions" }, ({ new: row }) => {
          const r = row as Reaction;
          setMemories((m) =>
            m.map((x) =>
              x.id === r.memory_id && !x.reactions.some((y) => y.id === r.id)
                ? { ...x, reactions: [...x.reactions, r] }
                : x,
            ),
          );
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, ({ old: row }) => {
          const id = (row as { id: string }).id;
          setMemories((m) =>
            m.map((x) => (x.reactions.some((y) => y.id === id) ? { ...x, reactions: x.reactions.filter((y) => y.id !== id) } : x)),
          );
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "memory_replies" }, ({ new: row }) => {
          const r = row as MemoryReply;
          setMemories((m) =>
            m.map((x) =>
              x.id === r.memory_id && !x.memory_replies.some((y) => y.id === r.id)
                ? { ...x, memory_replies: [...x.memory_replies, r] }
                : x,
            ),
          );
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "memory_replies" }, ({ old: row }) => {
          const id = (row as { id: string }).id;
          setMemories((m) =>
            m.map((x) =>
              x.memory_replies.some((y) => y.id === id)
                ? { ...x, memory_replies: x.memory_replies.filter((y) => y.id !== id) }
                : x,
            ),
          );
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "songs", filter: vaultFilter }, ({ new: row }) =>
          setSongs((s) => (s.some((x) => x.id === (row as Song).id) ? s : [...s, row as Song])),
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "songs" }, ({ old: row }) =>
          setSongs((s) => s.filter((x) => x.id !== (row as { id: string }).id)),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "vault_stickers", filter: vaultFilter }, ({ eventType, new: newRow, old: oldRow }) => {
          if (eventType === "DELETE") {
            setStickers((items) => items.filter((item) => item.id !== (oldRow as { id: string }).id));
            return;
          }
          const sticker = newRow as VaultSticker;
          setStickers((items) => items.some((item) => item.id === sticker.id)
            ? items.map((item) => item.id === sticker.id ? sticker : item)
            : [...items, sticker]);
        })
        // membership changes (joins, renames, avatars, removals) are rare: refetch
        .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: vaultFilter }, () => {
          db.from("members").select("id, vault_id, display_name, name_changed_at, avatar_url, avatar_color, role, joined_at, revoked_at").eq("vault_id", claims.vaultId).order("joined_at").then(({ data }) => {
            const parsed = parseMembers(data ?? []);
            if (parsed) setMembers(parsed);
          });
        })
        .subscribe();
    }));

    return () => {
      cancelled = true;
      if (channel) db.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me = members.find((m) => m.id === meId) ?? null;
  const activeMembers = members.filter((member) => member.revoked_at === null);

  if (failed) {
    return (
      <main className="grid min-h-svh place-items-center px-6 text-center">
        <div>
          <KeyRound className="mx-auto size-8 text-brass" />
          <h1 className="mt-3 font-display text-2xl text-starlight">This baul wouldn&apos;t open.</h1>
          <p className="mt-2 text-sm text-dim">Your session may have expired — enter your key again.</p>
          <Button className="mt-5" onClick={() => router.push("/enter")}>Enter my key</Button>
        </div>
      </main>
    );
  }

  if (!vault || !me) {
    return (
      <main className="grid min-h-svh place-items-center">
        <Spinner className="size-6" />
      </main>
    );
  }

  return (
    <div data-vault-theme={vault.vault_type} className="min-h-svh">
      <VaultHeader vault={vault} members={activeMembers} memories={memories} me={me} onOpenChat={() => setChatOpen(true)} />

      <main className="pt-2 sm:pt-6">
        <Timeline
          memories={memories}
          members={members}
          meId={me.id}
          isAdmin={me.role === "admin"}
          onPlaySong={setPlayRequest}
          stickers={stickers}
          onStickerAdded={(sticker) => setStickers((items) => items.some((item) => item.id === sticker.id) ? items : [...items, sticker])}
          hasOlder={hasOlderMemories}
          onLoadOlder={loadOlderMemories}
        />
      </main>

      {/* keep-a-memory button, floating above the music bar (+ the safe-area). */}
      <button
        onClick={() => setComposerOpen(true)}
        aria-label="Keep a memory"
        className="accent-fill fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-30 flex size-12 cursor-pointer items-center justify-center rounded-full text-sm font-semibold text-night shadow-lg shadow-black/40 transition-transform hover:scale-105 active:scale-95 xs:h-12 xs:w-auto xs:gap-2 xs:px-4 sm:bottom-20 sm:right-5 sm:h-auto sm:px-5 sm:py-3 sm:text-base"
      >
        <Plus className="size-5" /> <span className="sr-only xs:not-sr-only">Keep a memory</span>
      </button>

      <Composer open={composerOpen} onClose={() => setComposerOpen(false)} vaultId={vault.id} songs={songs} />
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        vaultId={vault.id}
        meId={me.id}
        members={members}
        stickers={stickers}
        onStickerAdded={(sticker) => setStickers((items) => items.some((item) => item.id === sticker.id) ? items : [...items, sticker])}
      />
      <MusicBar
        songs={songs}
        members={members}
        vaultId={vault.id}
        meId={me.id}
        playRequest={playRequest}
        onPlayRequestHandled={() => setPlayRequest(null)}
        onSongAdded={(song) => setSongs((items) => (
          items.some((item) => item.id === song.id) ? items : [...items, song]
        ))}
        onSongRemoved={(songId) => setSongs((items) => items.filter((item) => item.id !== songId))}
      />
    </div>
  );
}
