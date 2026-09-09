"use client";

import { CheckCircle2, ChevronDown, Circle, Ellipsis, ImageUp, KeyRound, MessageCircle, MoonStar, Pencil, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Avatar } from "@/components/Avatar";
import { AvatarCropper } from "@/components/AvatarCropper";
import { Logo } from "@/components/Logo";
import { Button, Field, Modal, cn } from "@/components/ui";
import { vaultTypeLabel } from "@/lib/copy";
import { fileToDataUrl } from "@/lib/image";
import { computeMilestones } from "@/lib/milestones";
import type { InviteResult } from "@/lib/domain";
import type { Member, Memory, Vault } from "@/lib/types";
import { api, apiUpload } from "@/lib/vault-client";

/**
 * Vault interior header (spec §6): name + type, member avatars (intimate: two
 * overlapping like a locket; circle: stacked row "+N"), milestone chips, and
 * the keeper menu (rename with 30-day rule surfaced by the server, avatar
 * change, admin key regeneration / member removal, close the chest).
 */
export function VaultHeader({
  vault,
  members,
  memories,
  me,
  onOpenChat,
}: {
  vault: Vault;
  members: Member[];
  memories: Memory[];
  me: Member;
  onOpenChat: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState<(InviteResult & { qr: string | null }) | null>(null);
  const [activation, setActivation] = useState<{ invitationCreated: boolean; recoveryConfigured: boolean; recoveryEmailConfirmed: boolean } | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [rawImage, setRawImage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = me.role === "admin";
  const milestones = computeMilestones(vault, memories, members);
  const intimate = vault.vault_type === "intimate";
  const setupDone = activation
    ? [
        activation.invitationCreated,
        memories.length > 0,
        keySaved,
        !activation.recoveryConfigured || activation.recoveryEmailConfirmed,
      ].filter(Boolean).length
    : 0;

  useEffect(() => {
    queueMicrotask(() => setKeySaved(localStorage.getItem(`baul:key-saved:${vault.id}`) === "true"));
    if (isAdmin) {
      fetch(`/api/vaults/${vault.id}/activation`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => data && setActivation(data))
        .catch(() => {});
    }
  }, [isAdmin, vault.id]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function closeChest() {
    // Never sign out: members are anonymous auth users, and an anonymous
    // session has no credentials to sign back IN with — destroying it would
    // permanently orphan this member's seat. This device stays recognized.
    router.push("/vaults");
  }

  async function regenerateKey() {
    if (!confirm("Forge a new permanent key? The old key stops opening new sessions immediately.")) return;
    try {
      const { key } = await api<{ key: string }>("/api/vaults/regenerate-key", { vaultId: vault.id });
      setNewKey(key);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not forge a new key.");
    }
  }

  async function createInvite() {
    try {
      const created = await api<InviteResult>(`/api/vaults/${vault.id}/invites`, { expiresInDays: 7 });
      const qr = await QRCode.toDataURL(created.inviteUrl, {
        margin: 1,
        width: 240,
        color: { dark: "#241d14", light: "#f2e8d5" },
      }).catch(() => null);
      setInvite({ ...created, qr });
      setActivation((current) => current ? { ...current, invitationCreated: true } : current);
      setInviteOpen(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not create an invitation.");
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-brass/12 bg-night/94 shadow-[0_10px_28px_rgba(0,0,0,.12)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-14 max-w-4xl items-center gap-2 px-3 sm:gap-3 sm:px-4 sm:py-2">
        <Link href="/" aria-label="Baul home" className="shrink-0">
          <Logo size={26} />
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[15px] leading-tight text-starlight sm:text-lg">{vault.name}</h1>
          <p className="accent-text text-[11px] font-medium sm:text-xs">{vaultTypeLabel(vault.vault_type)}</p>
        </div>

        {/* member row: locket for two, stack for circles */}
        <button
          onClick={() => setMembersOpen(true)}
          className={cn("flex shrink-0 cursor-pointer items-center", intimate ? "-space-x-3" : "-space-x-2")}
          aria-label="See the keepers of this baul"
        >
          {members.slice(0, intimate ? 2 : 4).map((m, index) => (
            <span key={m.id} className={cn(index > 1 && "hidden xs:inline-flex")}>
              <Avatar member={m} size={intimate ? 30 : 26} ringColor="var(--night)" />
            </span>
          ))}
          {!intimate && members.length > 2 && (
            <span className="glass grid size-7 place-items-center rounded-full text-[10px] text-dim xs:hidden">
              +{members.length - 2}
            </span>
          )}
          {!intimate && members.length > 4 && (
            <span className="glass hidden size-7 place-items-center rounded-full text-[10px] text-dim xs:grid">
              +{members.length - 4}
            </span>
          )}
        </button>

        <button
          onClick={onOpenChat}
          aria-label="Open the chat"
          className="glass grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-starlight transition-colors hover:bg-white/10 sm:size-10"
        >
          <MessageCircle className="size-4" />
        </button>

        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="glass grid size-11 cursor-pointer place-items-center rounded-full text-dim hover:text-starlight sm:size-10"
            aria-label="Baul menu"
            aria-expanded={menuOpen}
          >
            <Ellipsis className="size-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-50 max-h-[70dvh] w-[min(calc(100vw-1.5rem),18rem)] overflow-y-auto rounded-2xl border border-brass/15 bg-night-2 py-1.5 text-sm shadow-2xl shadow-black/60">
              <MenuItem icon={<Pencil className="size-4" />} onClick={() => { setMenuOpen(false); setRenameOpen(true); }}>
                Change my name
              </MenuItem>
              {/* Open the picker synchronously inside the tap, THEN close the
                  menu — a programmatic .click() fired within a user gesture is
                  honored on iOS/Android; only detached calls are blocked. */}
              <MenuItem
                icon={<ImageUp className="size-4" />}
                onClick={() => { avatarInputRef.current?.click(); setMenuOpen(false); }}
              >
                Change my photo
              </MenuItem>
              {isAdmin && (
                <>
                  <div className="my-1 border-t border-white/10" />
                  <MenuItem icon={<KeyRound className="size-4" />} onClick={() => { setMenuOpen(false); regenerateKey(); }}>
                    Forge a new key
                  </MenuItem>
                  <MenuItem icon={<UserPlus className="size-4" />} onClick={() => { setMenuOpen(false); createInvite(); }}>
                    Invite a keeper
                  </MenuItem>
                  <MenuItem icon={<Users className="size-4" />} onClick={() => { setMenuOpen(false); setMembersOpen(true); }}>
                    Manage keepers
                  </MenuItem>
                </>
              )}
              <div className="my-1 border-t border-white/10" />
              <MenuItem icon={<MoonStar className="size-4" />} onClick={closeChest} hint="This device keeps its keeper access">
                Close the chest
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      {isAdmin && activation && !(activation.invitationCreated && memories.length > 0 && keySaved && (!activation.recoveryConfigured || activation.recoveryEmailConfirmed)) && (
        <div className="mx-auto max-w-4xl px-3 pb-2 sm:px-4 sm:pb-2.5">
          <div className="rounded-xl border border-brass/20 bg-brass/5 px-3 py-2">
            <button
              type="button"
              onClick={() => setSetupOpen((open) => !open)}
              className="flex min-h-8 w-full items-center justify-between gap-3 text-left sm:pointer-events-none sm:min-h-0"
              aria-expanded={setupOpen}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brass sm:text-[11px]">Finish setting up this Baul</span>
              <span className="flex items-center gap-1.5 text-[11px] text-dim sm:hidden">
                {setupDone} of 4 <ChevronDown className={cn("size-3.5 transition-transform", setupOpen && "rotate-180")} />
              </span>
            </button>
            <ul className={cn("mt-1.5 flex-wrap gap-x-4 gap-y-1 text-xs text-dim sm:flex", setupOpen ? "flex" : "hidden")}>
              <ChecklistItem done={activation.invitationCreated} label="Invite a keeper" />
              <ChecklistItem done={memories.length > 0} label="Add the first memory" />
              <ChecklistItem done={keySaved} label="Save the permanent key" />
              <ChecklistItem done={!activation.recoveryConfigured || activation.recoveryEmailConfirmed} label={activation.recoveryConfigured ? "Confirm recovery email" : "Recovery email skipped"} />
            </ul>
          </div>
        </div>
      )}

      {milestones.length > 0 && (
        <div className="scrollbar-none mx-auto flex max-w-4xl snap-x gap-2 overflow-x-auto px-3 pb-2 sm:px-4 sm:pb-2.5">
          {milestones.map((m) => (
            <div key={m.id} className="glass shrink-0 snap-start rounded-full px-3 py-1.5 text-[10px] sm:px-3.5 sm:text-xs">
              <span className="accent-text font-semibold">{m.value}</span>{" "}
              <span className="text-dim">{m.label}</span>
              {m.hint && <span className="text-dim/60"> · {m.hint}</span>}
            </div>
          ))}
        </div>
      )}

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            alert("That image is too large (max 5MB).");
            return;
          }
          setRawImage(await fileToDataUrl(file));
        }}
      />
      <AvatarCropper
        imageSrc={rawImage}
        onCancel={() => setRawImage(null)}
        onCropped={async (blob) => {
          setRawImage(null);
          const form = new FormData();
          form.append("file", blob, "avatar.webp");
          form.append("vaultId", vault.id);
          await apiUpload("/api/members/avatar", form).catch((err) =>
            alert(err instanceof Error ? err.message : "Could not save your photo."),
          );
        }}
      />

      <RenameModal open={renameOpen} onClose={() => setRenameOpen(false)} currentName={me.display_name} vaultId={vault.id} />
      <MembersModal
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        members={members}
        meId={me.id}
        isAdmin={isAdmin}
        maxMembers={vault.max_members}
        vaultId={vault.id}
      />

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <h3 className="font-display text-xl text-starlight">A one-time invitation</h3>
        <p className="mt-2 text-sm text-dim">It expires in seven days and works once. The permanent Baul key is not included.</p>
        {invite?.qr && (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL is not an optimization candidate
          <img src={invite.qr} alt="QR code for this one-time invitation" className="mx-auto mt-5 size-44 rounded-xl bg-paper p-2" />
        )}
        {invite && <p className="mt-4 break-all rounded-xl bg-black/20 p-3 text-xs text-dim">{invite.inviteUrl}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {invite && <Button variant="ghost" onClick={() => navigator.clipboard.writeText(invite.inviteUrl)}>Copy link</Button>}
          {invite && <Button variant="ghost" onClick={async () => {
            await fetch(`/api/vaults/${vault.id}/invites/${invite.inviteId}`, { method: "DELETE" });
            setInvite(null);
            setInviteOpen(false);
          }}>Revoke</Button>}
          <Button onClick={() => setInviteOpen(false)}>Done</Button>
        </div>
      </Modal>

      {/* one-time reveal of a regenerated key */}
      <Modal open={newKey !== null} onClose={() => setNewKey(null)}>
        <h3 className="font-display text-xl text-starlight">The new key to this baul</h3>
        <p className="mt-2 text-sm text-dim">
          Shown once, like the first. The old key no longer opens a new session; existing keeper memberships remain active.
        </p>
        <p className="glass mt-4 break-all rounded-xl p-4 text-center font-mono text-lg tracking-wide text-brass-2">
          {newKey}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigator.clipboard.writeText(newKey ?? "").catch(() => {})}>
            Copy
          </Button>
          <Button onClick={() => setNewKey(null)}>I&apos;ve shared it</Button>
        </div>
      </Modal>
    </header>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return <li className="flex items-center gap-1.5">{done ? <CheckCircle2 className="size-3.5 text-emerald-300" /> : <Circle className="size-3.5 text-brass" />}<span>{label}</span></li>;
}

function MenuItem({
  children,
  icon,
  hint,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-starlight transition-colors hover:bg-white/10"
    >
      <span className="text-dim">{icon}</span>
      <span className="flex-1">
        {children}
        {hint && <span className="block text-xs text-dim/70">{hint}</span>}
      </span>
    </button>
  );
}

function RenameModal({ open, onClose, currentName, vaultId }: { open: boolean; onClose: () => void; currentName: string; vaultId: string }) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/members/rename", { displayName: name.trim(), vaultId });
      onClose();
    } catch (err) {
      // The server states the 30-day rule with the exact date (spec §2.4).
      setError(err instanceof Error ? err.message : "Could not change your name.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="font-display text-xl text-starlight">Change my name</h3>
      <p className="mt-1.5 text-sm text-dim">Renames are limited to once every 30 days.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Field value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Renaming…" : "Rename"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function MembersModal({
  open,
  onClose,
  members,
  meId,
  isAdmin,
  maxMembers,
  vaultId,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  meId: string;
  isAdmin: boolean;
  maxMembers: number;
  vaultId: string;
}) {
  async function remove(member: Member) {
    if (!confirm(`Remove ${member.display_name} from this baul? Everything they kept stays.`)) return;
    await api("/api/members/remove", { memberId: member.id, vaultId }).catch((err) =>
      alert(err instanceof Error ? err.message : "Could not remove them."),
    );
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="font-display text-xl text-starlight">
        Keepers <span className="text-sm font-normal text-dim">({members.length} of {maxMembers})</span>
      </h3>
      <ul className="mt-4 space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <Avatar member={m} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-starlight">
                {m.display_name}
                {m.id === meId && <span className="text-dim"> (you)</span>}
              </p>
              <p className="text-xs text-dim">{m.role === "admin" ? "keeper of the key" : "member"}</p>
            </div>
            {isAdmin && m.id !== meId && (
              <button onClick={() => remove(m)} className="cursor-pointer text-xs text-dim/60 hover:text-red-300">
                remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
