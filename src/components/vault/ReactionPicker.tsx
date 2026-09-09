"use client";

import { ImagePlus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, Modal, Spinner } from "@/components/ui";
import { LIMITS } from "@/lib/domain";
import { compressSticker } from "@/lib/image";
import { signedUrl } from "@/lib/signed-urls";
import type { VaultSticker } from "@/lib/types";
import { apiUpload } from "@/lib/vault-client";
import { REACTION_EMOJIS } from "./vault-data";

export function ReactionPicker({
  open,
  onClose,
  vaultId,
  stickers,
  onStickerAdded,
  onEmoji,
  onSticker,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  stickers: VaultSticker[];
  onStickerAdded: (sticker: VaultSticker) => void;
  onEmoji: (emoji: string) => Promise<void>;
  onSticker: (stickerId: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeStickers = useMemo(() => stickers.filter((sticker) => sticker.retired_at === null), [stickers]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function clearDraft() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setName("");
    setError(null);
  }

  async function chooseFile(selected: File | null) {
    clearDraft();
    if (!selected) return;
    setBusy(true);
    try {
      const blob = await compressSticker(selected);
      const prepared = new File([blob], "sticker.webp", { type: "image/webp" });
      setFile(prepared);
      setPreview(URL.createObjectURL(blob));
      const suggested = selected.name
        .replace(/\.[^.]+$/, "")
        .replace(/[^\p{L}\p{N} _-]+/gu, " ")
        .trim()
        .slice(0, LIMITS.stickerName);
      setName(suggested || "My sticker");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare that sticker.");
    } finally {
      setBusy(false);
    }
  }

  async function react(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch {
      setError("That reaction did not stick. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAndReact(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("vaultId", vaultId);
      form.set("name", name.trim());
      form.set("file", file);
      const { sticker } = await apiUpload<{ sticker: VaultSticker }>("/api/media/sticker", form);
      onStickerAdded(sticker);
      await onSticker(sticker.id);
      clearDraft();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add that sticker.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brass">Reaction drawer</p>
          <h2 className="mt-1 font-display text-2xl text-starlight">React your way</h2>
          <p className="mt-1 text-sm text-dim">Pick a classic, or add a sticker for everyone in this Baul.</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} className="grid size-10 shrink-0 place-items-center rounded-full text-dim hover:bg-white/8 hover:text-starlight" aria-label="Close reactions">
          <X className="size-4" />
        </button>
      </div>

      <section className="mt-5" aria-labelledby="classic-reactions-heading">
        <h3 id="classic-reactions-heading" className="text-xs font-medium text-dim">Classics</h3>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={busy}
              onClick={() => react(() => onEmoji(emoji))}
              className="grid aspect-square min-h-12 place-items-center rounded-2xl border border-white/7 bg-white/[0.045] text-2xl transition hover:-translate-y-0.5 hover:border-brass/35 hover:bg-brass/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5" aria-labelledby="custom-reactions-heading">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="custom-reactions-heading" className="text-xs font-medium text-dim">This Baul&apos;s stickers</h3>
            <p className="mt-0.5 text-[11px] text-dim/65">Shared by its keepers · {activeStickers.length}/{LIMITS.stickersPerVault}</p>
          </div>
          {!file && (
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-brass/25 px-3 text-xs font-medium text-brass-2 transition hover:bg-brass/10">
              <ImagePlus className="size-4" /> Import yours
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={busy || activeStickers.length >= LIMITS.stickersPerVault}
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>

        {activeStickers.length > 0 ? (
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {activeStickers.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                disabled={busy}
                onClick={() => react(() => onSticker(sticker.id))}
                className="group min-w-0 rounded-2xl border border-white/7 bg-[#211a14] p-2 transition hover:border-brass/35 hover:bg-brass/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
                aria-label={`React with ${sticker.name}`}
              >
                <StickerArt sticker={sticker} className="mx-auto size-12 object-contain transition-transform group-hover:scale-110" />
                <span className="mt-1 block truncate text-[10px] text-dim">:{sticker.name}:</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-brass/20 bg-brass/[0.035] px-4 py-5 text-center">
            <Sparkles className="mx-auto size-5 text-brass" />
            <p className="mt-2 text-sm text-starlight">No custom stickers yet</p>
            <p className="mt-1 text-xs text-dim">Import the first inside joke, face, or tiny keepsake.</p>
          </div>
        )}
      </section>

      {file && preview && (
        <form onSubmit={uploadAndReact} className="mt-5 rounded-2xl border border-brass/20 bg-brass/[0.045] p-3.5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="New sticker preview" className="size-16 rounded-xl bg-black/15 object-contain p-1" />
            <div className="min-w-0 flex-1">
              <Field label="Sticker name" value={name} maxLength={LIMITS.stickerName} onChange={(event) => setName(event.target.value)} autoFocus />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={clearDraft} disabled={busy}>Choose another</Button>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {busy ? <Spinner /> : <Sparkles className="size-4" />} Add & react
            </Button>
          </div>
        </form>
      )}

      {busy && !file && <p className="mt-4 flex items-center gap-2 text-sm text-dim" role="status"><Spinner /> Preparing your sticker…</p>}
      {error && <p className="mt-4 text-sm text-red-300" role="alert">{error}</p>}
    </Modal>
  );
}

export function StickerArt({ sticker, className }: { sticker: VaultSticker; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signedUrl(sticker.storage_path).then((value) => alive && setUrl(value));
    return () => { alive = false; };
  }, [sticker.storage_path]);

  if (!url) return <span className={`${className ?? ""} grid animate-pulse place-items-center rounded-lg bg-white/5`} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={className} loading="lazy" />;
}
