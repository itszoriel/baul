"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field } from "./ui";
import { TurnstileChallenge } from "./TurnstileChallenge";
import { PASSPHRASE_MAX, PASSPHRASE_MIN } from "@/lib/passphrase-constants";
import { api, ApiRequestError, reclaimMember } from "@/lib/vault-client";
import type { VaultType } from "@/lib/types";

/**
 * Returning-keeper flow (spec §2.2): the caller already proved they hold the
 * baul key; here they prove WHICH keeper they are with the username +
 * personal passphrase they set, and the server rebinds that member to this
 * device.
 */
export function ReclaimForm({ joinToken, vaultType }: { joinToken: string; vaultType: VaultType }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reclaimedVaultId, setReclaimedVaultId] = useState<string | null>(null);
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [challenge, setChallenge] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !username.trim() || !passphrase) return;
    setBusy(true);
    setError(null);
    try {
      const joined = await reclaimMember(joinToken, username.trim(), passphrase, turnstileToken);
      if (joined.needsPhraseUpgrade) {
        setReclaimedVaultId(joined.vault.id);
        setBusy(false);
        return;
      }
      localStorage.setItem("baul:last-vault-id", joined.vault.id);
      router.push(`/vault/${joined.vault.id}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "CHALLENGE_REQUIRED") setChallenge(true);
      setError(err instanceof Error ? err.message : "Could not reclaim your keeper.");
      setBusy(false);
    }
  }

  async function upgrade(e: React.FormEvent) {
    e.preventDefault();
    if (!reclaimedVaultId || newPassphrase.length < PASSPHRASE_MIN || newPassphrase !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/members/passphrase", {
        vaultId: reclaimedVaultId,
        currentPassphrase: passphrase,
        newPassphrase,
      });
      localStorage.setItem("baul:last-vault-id", reclaimedVaultId);
      router.push(`/vault/${reclaimedVaultId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your keeper phrase.");
      setBusy(false);
    }
  }

  if (reclaimedVaultId) {
    return (
      <form onSubmit={upgrade} className="space-y-4 text-left" data-vault-theme={vaultType}>
        <div>
          <h2 className="font-display text-[1.6rem] leading-tight text-starlight sm:text-2xl">Strengthen your keeper phrase.</h2>
          <p className="mt-1.5 text-sm text-dim">Your older phrase still worked. New phrases use at least {PASSPHRASE_MIN} characters.</p>
        </div>
        <Field type="password" label="New personal keeper phrase" value={newPassphrase} onChange={(event) => setNewPassphrase(event.target.value)} minLength={PASSPHRASE_MIN} maxLength={PASSPHRASE_MAX} autoComplete="new-password" />
        <Field type="password" label="Repeat the new phrase" value={confirm} onChange={(event) => setConfirm(event.target.value)} error={error ?? (confirm && confirm !== newPassphrase ? "The phrases do not match." : null)} autoComplete="new-password" />
        <Button type="submit" size="lg" className="w-full" disabled={busy || newPassphrase.length < PASSPHRASE_MIN || newPassphrase !== confirm}>{busy ? "Updating…" : "Update and enter"}</Button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-left" data-vault-theme={vaultType}>
      <div>
        <h2 className="font-display text-[1.6rem] leading-tight text-starlight sm:text-2xl">Welcome back, keeper.</h2>
        <p className="mt-1.5 text-sm text-dim">
          Enter the username and personal passphrase you set for yourself in this baul.
        </p>
      </div>

      <Field
        label="Your username here"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        maxLength={40}
        placeholder="the name others see you by"
        autoFocus
      />
      <Field
        label="Your passphrase"
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="your personal passphrase"
        autoComplete="current-password"
        error={error}
      />

      <Button type="submit" size="lg" className="w-full" disabled={busy || !username.trim() || !passphrase}>
        {busy ? "Unlocking…" : "Reclaim my keeper"}
      </Button>
      {challenge && <TurnstileChallenge onToken={setTurnstileToken} />}
    </form>
  );
}
