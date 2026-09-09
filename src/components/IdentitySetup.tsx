"use client";

import { Camera, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvatarCropper } from "./AvatarCropper";
import { TurnstileChallenge } from "./TurnstileChallenge";
import { Button, Field } from "./ui";
import { fileToDataUrl } from "@/lib/image";
import { PASSPHRASE_MAX, PASSPHRASE_MIN } from "@/lib/passphrase-constants";
import { apiUpload, ApiRequestError, joinVault } from "@/lib/vault-client";
import type { VaultType } from "@/lib/types";

/**
 * First-time identity (spec §2.2.3): display name + optional avatar with
 * circular crop; skipping the photo falls back to the auto-assigned color
 * circle. Used by both the creator (after key reveal) and joiners.
 */
export function IdentitySetup({
  joinToken,
  vaultName,
  vaultType,
}: {
  joinToken: string;
  vaultName: string;
  vaultType: VaultType;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const avatarPreview = avatarBlob ? URL.createObjectURL(avatarBlob) : null;
  const ready = name.trim().length > 0 && passphrase.length >= PASSPHRASE_MIN && confirm === passphrase;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Choose a display name.");
    if (passphrase.length < PASSPHRASE_MIN) return setError(`Your passphrase needs at least ${PASSPHRASE_MIN} characters.`);
    if (confirm !== passphrase) return setError("The two passphrases don't match.");
    setBusy(true);
    setError(null);
    try {
      const joined = await joinVault(joinToken, name.trim(), passphrase, turnstileToken);
      if (avatarBlob) {
        // The baul is already open — a failed photo upload must not block entry.
        const form = new FormData();
        form.append("file", avatarBlob, "avatar.webp");
        form.append("vaultId", joined.vault.id);
        await apiUpload("/api/members/avatar", form).catch(() => {});
      }
      localStorage.setItem("baul:last-vault-id", joined.vault.id);
      router.push(`/vault/${joined.vault.id}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "CHALLENGE_REQUIRED") setChallenge(true);
      setError(err instanceof Error ? err.message : "Could not open this baul.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-left sm:space-y-5" data-vault-theme={vaultType}>
      <div>
        <h2 className="font-display text-[1.6rem] leading-tight text-starlight sm:text-2xl">
          {vaultType === "intimate" ? "Who are you to this baul?" : `Joining “${vaultName}”`}
        </h2>
        <p className="mt-1.5 text-sm text-dim">
          {vaultType === "intimate"
            ? "The name your person will see beside everything you keep."
            : "Pick the name the others will see on the board."}
        </p>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* The real <input type=file> is laid transparently OVER the avatar, so
            a tap lands directly on it and opens the picker on every browser —
            no <label> indirection or programmatic .click() that mobile Safari
            may ignore. The badge is click-through so it never eats the tap. */}
        <div className="group relative size-16 shrink-0">
          <span className="grid size-full place-items-center overflow-hidden rounded-full border border-dashed border-white/25 bg-white/5 transition-colors group-focus-within:border-brass/60 group-hover:border-brass/60">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="Your avatar" className="size-full object-cover" />
            ) : (
              <Camera className="size-7 text-dim sm:size-6" />
            )}
          </span>
          <span className="accent-fill pointer-events-none absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full text-night ring-2 ring-night">
            <Camera className="size-3.5" />
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose a profile photo"
            className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                setError("That image is too large (max 5MB).");
                return;
              }
              setRawImage(await fileToDataUrl(file));
            }}
          />
        </div>
        <div className="flex-1">
          <Field
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={vaultType === "intimate" ? "e.g. your endearment" : "e.g. your nickname"}
            autoFocus
          />
        </div>
      </div>

      <p className="text-xs text-dim/70">
        No photo? You&apos;ll get a colored circle with your initials. Renames are limited to once every 30 days —
        choose kindly.
      </p>

      {/* Personal passphrase — how you prove it's you from another device. */}
      <div className="rounded-2xl border border-brass/15 bg-black/10 p-3.5 sm:p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-starlight">
          <KeyRound className="size-4 text-brass" /> Set a personal passphrase
        </p>
        <p className="mt-1 text-xs text-dim">
          Different from the baul&apos;s key. If you ever open this baul on a new phone or browser, your username and
          this passphrase let you back into <em>this</em> keeper. Keep it to yourself.
        </p>
        <div className="mt-3 space-y-2.5">
          <Field
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            maxLength={PASSPHRASE_MAX}
            placeholder={`Your passphrase (min ${PASSPHRASE_MIN} characters)`}
            autoComplete="new-password"
          />
          <Field
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            maxLength={PASSPHRASE_MAX}
            placeholder="Type it again"
            autoComplete="new-password"
            error={error}
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={!ready || busy}>
        {busy ? "Lifting the lid…" : "Step inside"}
      </Button>
      {challenge && <TurnstileChallenge onToken={setTurnstileToken} />}

      <AvatarCropper
        imageSrc={rawImage}
        onCancel={() => setRawImage(null)}
        onCropped={(blob) => {
          setAvatarBlob(blob);
          setRawImage(null);
        }}
      />
    </form>
  );
}
