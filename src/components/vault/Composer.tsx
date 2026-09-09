"use client";

import { Camera, ImagePlus, Lock, Mail, NotebookPen } from "lucide-react";
import { useState } from "react";
import { Button, Modal, TextArea, cn } from "@/components/ui";
import { compressPhoto } from "@/lib/image";
import type { Song } from "@/lib/types";
import { api, apiUpload } from "@/lib/vault-client";

type Kind = "note" | "letter" | "photo";

/**
 * "Keep a memory" (spec §2.3): notes and letters insert directly under RLS;
 * photos go through the upload API (compress → WebP → EXIF-free). Letters can
 * be sealed as time capsules until a chosen date; any memory can carry a song.
 */
export function Composer({
  open,
  onClose,
  vaultId,
  songs,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  songs: Song[];
}) {
  const [kind, setKind] = useState<Kind>("note");
  const [text, setText] = useState("");
  const [sealed, setSealed] = useState(false);
  const [sealUntil, setSealUntil] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [songId, setSongId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [minimumSealTime] = useState(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));

  function reset() {
    setText("");
    setSealed(false);
    setSealUntil("");
    setPhoto(null);
    setSongId("");
    setError(null);
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "photo") {
        if (!photo) throw new Error("Choose a photo first.");
        const form = new FormData();
        form.append("file", photo.blob, "photo.webp");
        form.append("vaultId", vaultId);
        if (text.trim()) form.append("caption", text.trim());
        if (songId) form.append("songId", songId);
        await apiUpload("/api/media/photo", form);
      } else {
        if (!text.trim()) throw new Error(kind === "letter" ? "The letter is empty." : "Write something first.");
        if (kind === "letter" && sealed && !sealUntil) throw new Error("Pick the date the seal breaks.");
        await api("/api/memories", {
          vaultId,
          kind,
          content: text.trim(),
          songId: songId || null,
          unlockAt: kind === "letter" && sealed && sealUntil ? new Date(sealUntil).toISOString() : null,
        });
      }
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <p className="section-kicker">Add to the chest</p>
      <h3 className="mt-1 font-display text-2xl text-starlight">Keep a memory</h3>

      <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-black/15 p-1" role="tablist" aria-label="Memory type">
        {(
          [
            { value: "note", label: "Note", icon: <NotebookPen className="size-4" /> },
            { value: "letter", label: "Letter", icon: <Mail className="size-4" /> },
            { value: "photo", label: "Photo", icon: <Camera className="size-4" /> },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={kind === t.value}
            onClick={() => setKind(t.value)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm transition-colors",
              kind === t.value ? "accent-fill font-medium text-night" : "glass text-dim hover:text-starlight",
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {kind === "photo" && (
          <>
            <label htmlFor="composer-photo-input" className="block cursor-pointer touch-manipulation">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.preview} alt="Photo to keep" className="max-h-56 w-full rounded-xl object-cover" />
              ) : (
                <span className="grid h-32 w-full place-items-center rounded-xl border border-dashed border-brass/25 bg-black/10 px-4 text-center text-sm text-dim transition-colors hover:border-brass/50 active:border-brass sm:h-36">
                  <span className="flex flex-col items-center gap-2">
                    <ImagePlus className="size-6" />
                    Choose a photo (we compress it and strip location data)
                  </span>
                </span>
              )}
            </label>
            <input
              id="composer-photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) {
                  setError("That photo is too large (max 10MB).");
                  return;
                }
                setError(null);
                const blob = await compressPhoto(file);
                setPhoto({ blob, preview: URL.createObjectURL(blob) });
              }}
            />
          </>
        )}

        <TextArea
          rows={kind === "letter" ? 7 : 3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            kind === "letter"
              ? "Dear…"
              : kind === "photo"
                ? "A caption for this photo (optional)"
                : "What do you want to remember?"
          }
          className={cn(kind === "letter" && "font-display")}
        />

        {kind === "letter" && (
          <div className="rounded-xl border border-brass/15 bg-black/10 p-3">
            <button
              type="button"
              onClick={() => setSealed((s) => !s)}
              aria-pressed={sealed}
              className="flex w-full cursor-pointer items-center gap-3 text-left"
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
                  sealed ? "accent-fill text-night" : "glass text-dim",
                )}
              >
                <Lock className="size-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm text-starlight">Seal it as a time capsule</span>
                <span className="block text-xs text-dim">
                  {sealed
                    ? "Locked for everyone — even you — until the date you choose."
                    : "Off — the letter can be read right away."}
                </span>
              </span>
              <span
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  sealed ? "accent-fill" : "bg-white/15",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-4 rounded-full bg-night transition-all",
                    sealed ? "left-[calc(100%-1.125rem)]" : "left-0.5 bg-starlight/80",
                  )}
                />
              </span>
            </button>
            {sealed && (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-xs text-dim">The seal breaks on…</span>
                <input
                  type="datetime-local"
                  value={sealUntil}
                  min={minimumSealTime}
                  onChange={(e) => setSealUntil(e.target.value)}
                  className="w-full rounded-xl glass px-4 py-2.5 text-starlight focus:outline-none scheme-dark"
                />
              </label>
            )}
          </div>
        )}

        {songs.length > 0 && (
          <label className="block">
            <span className="mb-1.5 block text-sm text-dim">Attach a song from the soundtrack (optional)</span>
            <select
              value={songId}
              onChange={(e) => setSongId(e.target.value)}
              className="min-h-12 w-full cursor-pointer rounded-xl border border-brass/15 bg-[#201912] px-4 py-2.5 text-starlight focus:border-brass/60 focus:outline-none [&>option]:bg-night-2"
            >
              <option value="">No song</option>
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  ♪ {s.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
          <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="w-full sm:w-auto">
            {busy ? "Keeping…" : kind === "letter" && sealed ? "Seal it" : "Keep it"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
