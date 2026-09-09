"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Heart,
  HeartHandshake,
  House,
  Lock,
  Mail,
  PartyPopper,
  Sparkles,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { IdentitySetup } from "@/components/IdentitySetup";
import { LocationPicker, type LocationValue } from "@/components/LocationPicker";
import { Logo } from "@/components/Logo";
import { TurnstileChallenge } from "@/components/TurnstileChallenge";
import { Button, Field, cn } from "@/components/ui";
import { COPY } from "@/lib/copy";
import type { VaultPurpose, VaultType } from "@/lib/types";
import { api, ApiRequestError } from "@/lib/vault-client";

/**
 * Vault creation wizard (spec §2.1): full-screen, one question per screen.
 * name → size → purpose → location → recovery email → key reveal → identity.
 */

type Step = "name" | "size" | "purpose" | "location" | "email" | "reveal" | "identity";
const QUESTIONS: Step[] = ["name", "size", "purpose", "location", "email"];

const PURPOSES: Array<{ value: VaultPurpose; label: string; icon: React.ReactNode }> = [
  { value: "romance", label: "Romance", icon: <Heart className="size-6" /> },
  { value: "friends", label: "Friends", icon: <PartyPopper className="size-6" /> },
  { value: "family", label: "Family", icon: <House className="size-6" /> },
  { value: "team", label: "Team", icon: <Wrench className="size-6" /> },
  { value: "other", label: "Something else", icon: <Sparkles className="size-6" /> },
];

interface Created {
  key: string;
  vaultId: string;
  joinToken: string;
  vaultName: string;
  vaultType: VaultType;
  recoveryConfigured: boolean;
}

export default function CreatePage() {
  const [step, setStep] = useState<Step>("name");
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState("");
  const [size, setSize] = useState<number>(2);
  const [customSize, setCustomSize] = useState("");
  const [purpose, setPurpose] = useState<VaultPurpose | null>(null);
  const [location, setLocation] = useState<LocationValue>({ countryId: null, divisionId: null });
  const [locationTouched, setLocationTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [challenge, setChallenge] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const stepIndex = QUESTIONS.indexOf(step);

  function go(next: Step) {
    setDirection(QUESTIONS.indexOf(next) >= stepIndex ? 1 : -1);
    setError(null);
    setStep(next);
  }

  const canContinue = useMemo(() => {
    switch (step) {
      case "name":
        return name.trim().length > 0;
      case "size":
        return size >= 2 && size <= 50;
      case "purpose":
        return purpose !== null;
      case "location":
        return locationTouched; // an explicit choice — sharing or hiding — is required
      case "email":
        return true;
      default:
        return false;
    }
  }, [step, name, size, purpose, locationTouched]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<Created>("/api/vaults", {
        name: name.trim(),
        maxMembers: size,
        purpose,
        recoveryEmail: email.trim() || null,
        milestoneDate: milestoneDate || null,
        countryId: location.countryId,
        divisionId: location.divisionId,
        turnstileToken,
      });
      setCreated(result);
      setDirection(1);
      setStep("reveal");
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "CHALLENGE_REQUIRED") setChallenge(true);
      setError(err instanceof Error ? err.message : "Could not create your baul.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="route-shell relative flex flex-col overflow-hidden sm:px-6 sm:py-6">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Back to the globe">
          <Logo size={34} />
        </Link>
        {stepIndex >= 0 && (
          <div
            className="flex items-center gap-1.5"
            role="progressbar"
            aria-label="Baul creation progress"
            aria-valuemin={1}
            aria-valuemax={QUESTIONS.length}
            aria-valuenow={stepIndex + 1}
            aria-valuetext={`Step ${stepIndex + 1} of ${QUESTIONS.length}`}
          >
            {QUESTIONS.map((q, i) => (
              <span
                key={q}
                className={cn("h-1.5 rounded-full transition-all", i <= stepIndex ? "w-6 accent-fill" : "w-1.5 bg-white/15")}
              />
            ))}
          </div>
        )}
      </header>

      <div className="flex flex-1 items-start justify-center py-10 sm:items-center sm:py-8">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: 36 * direction }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -36 * direction }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="w-full max-w-lg"
          >
            {step === "name" && (
              <StepShell
                title="Name your baul"
                hint="The name everyone inside will see. You can be sentimental."
              >
                <Field
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canContinue && go("size")}
                  maxLength={80}
                  placeholder="e.g. Us, Against the World"
                  autoFocus
                />
                <Nav onNext={() => go("size")} nextDisabled={!canContinue} />
              </StepShell>
            )}

            {step === "size" && (
              <StepShell title="How many people can join?" hint="Two keeps it intimate. Up to fifty keeps the whole barkada.">
                <div className="grid grid-cols-2 gap-3">
                  <ChoiceCard active={size === 2 && !customSize} onClick={() => { setSize(2); setCustomSize(""); }}>
                    <Users className="size-6 text-brass" />
                    <span className="mt-1 block font-display text-lg">Just two of us</span>
                  </ChoiceCard>
                  <div
                    className={cn(
                      "glass min-h-28 rounded-2xl p-4 transition-all",
                      customSize && "border-brass bg-brass/10 ring-1 ring-brass/50",
                    )}
                  >
                    <UsersRound className="size-6 text-brass" />
                    <span className="mt-1 block font-display text-lg">A circle</span>
                    <input
                      type="number"
                      min={3}
                      max={50}
                      value={customSize}
                      onChange={(e) => {
                        setCustomSize(e.target.value);
                        const n = parseInt(e.target.value, 10);
                        if (!Number.isNaN(n)) setSize(Math.min(50, Math.max(3, n)));
                      }}
                      placeholder="3–50 people"
                      className="mt-2 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-starlight placeholder:text-dim/60 focus:outline-none"
                    />
                  </div>
                </div>
                <Nav onBack={() => go("name")} onNext={() => go("purpose")} nextDisabled={!canContinue} />
              </StepShell>
            )}

            {step === "purpose" && (
              <StepShell title="What is this baul for?">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {PURPOSES.map((p) => (
                    <ChoiceCard key={p.value} active={purpose === p.value} onClick={() => setPurpose(p.value)}>
                      <span className="text-brass">{p.icon}</span>
                      <span className="mt-1 block text-sm font-medium">{p.label}</span>
                    </ChoiceCard>
                  ))}
                </div>
                {purpose === "romance" && size === 2 && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-dim">
                    <HeartHandshake className="size-4 text-rose-300" /> A baul for two — we&apos;ll set the mood accordingly.
                  </p>
                )}
                <Nav onBack={() => go("size")} onNext={() => go("location")} nextDisabled={!canContinue} />
              </StepShell>
            )}

            {step === "location" && (
              <StepShell title={COPY.locationTitle}>
                <div onClickCapture={() => setLocationTouched(true)}>
                  <LocationPicker value={location} onChange={(v) => { setLocation(v); setLocationTouched(true); }} />
                </div>
                <Nav onBack={() => go("purpose")} onNext={() => go("email")} nextDisabled={!canContinue} />
              </StepShell>
            )}

            {step === "email" && (
              <StepShell title="Guard your key with an email?" hint={COPY.recoverExplainer}>
                <div className="space-y-3">
                  {purpose === "romance" && size === 2 && (
                    <label className="glass block rounded-2xl p-4">
                      <span className="font-display text-starlight">A meaningful date <span className="font-sans text-xs text-dim">(optional)</span></span>
                      <span className="mt-1 block text-xs text-dim">Used for “days together.” Without it, Baul only counts days since this chest was made.</span>
                      <input type="date" value={milestoneDate} onChange={(event) => setMilestoneDate(event.target.value)} className="mt-3 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-starlight focus:outline-none" />
                    </label>
                  )}
                  <div className={cn("glass rounded-2xl p-4 transition-all", email.trim() && "border-brass bg-brass/10 ring-1 ring-brass/50")}>
                    <p className="flex items-center gap-2 font-display text-starlight">
                      <Mail className="size-4 text-brass" /> {COPY.guardedLabel}
                    </p>
                    <p className="mt-1 text-xs text-dim">{COPY.guardedDesc}</p>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-3 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-starlight placeholder:text-dim/60 focus:outline-none"
                    />
                  </div>
                  <div className={cn("glass rounded-2xl p-4", !email.trim() && "border-white/20")}>
                    <p className="flex items-center gap-2 font-display text-starlight">
                      <Lock className="size-4 text-brass" /> {COPY.sealedLabel}
                    </p>
                    <p className="mt-1 text-xs text-dim">{COPY.sealedDesc}</p>
                    {!email.trim() && <p className="mt-2 text-xs text-amber-300/90">{COPY.sealedWarning}</p>}
                  </div>
                </div>
                {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
                {challenge && <div className="mt-4"><TurnstileChallenge onToken={setTurnstileToken} /></div>}
                <Nav
                  onBack={() => go("location")}
                  onNext={submit}
                  nextLabel={busy ? "Forging your key…" : "Forge my baul"}
                  nextDisabled={busy}
                />
              </StepShell>
            )}

            {step === "reveal" && created && (
              <KeyReveal created={created} onContinue={() => go("identity")} />
            )}

            {step === "identity" && created && (
              <div className="form-panel p-5 sm:p-8">
                <IdentitySetup joinToken={created.joinToken} vaultName={created.vaultName} vaultType={created.vaultType} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

function StepShell({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="text-center">
      <h1 className="font-display text-[1.85rem] leading-tight text-starlight sm:text-4xl">{title}</h1>
      {hint && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-dim">{hint}</p>}
      <div className="mt-6 text-left sm:mt-8">{children}</div>
    </div>
  );
}

function ChoiceCard({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "glass min-h-28 cursor-pointer rounded-2xl p-4 text-left transition-all hover:bg-white/10",
        active
          ? "border-brass bg-brass/15 ring-1 ring-brass/50 shadow-[0_0_24px_-8px_var(--brass)]"
          : "hover:border-white/25",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-7 grid grid-cols-2 gap-2 sm:mt-8 sm:flex sm:items-center sm:justify-between">
      {onBack ? (
        <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto">← Back</Button>
      ) : (
        null
      )}
      <Button onClick={onNext} disabled={nextDisabled} size="lg" className={cn("w-full sm:w-auto", !onBack && "col-span-2")}>
        {nextLabel}
      </Button>
    </div>
  );
}

/** Spec §2.1 step 6: the key is shown ONCE — copy, QR, share instructions. */
function KeyReveal({ created, onContinue }: { created: Created; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(created.key).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative text-center" data-vault-theme={created.vaultType}>
      <div className="lid-light pointer-events-none absolute inset-x-8 -top-16 h-24" />
      <h1 className="font-display text-2xl text-starlight sm:text-3xl">{COPY.keyRevealTitle}</h1>
      <p className="mt-2 text-sm text-dim">
        This is the only time it will ever be shown.{" "}
        Baul stores only a one-way verifier, never this plaintext key. {created.recoveryConfigured
          ? "Your recovery email can request a replacement, but it is never sent this key."
          : "Without recovery email, losing it means losing the shared door."}
      </p>

      <div className="glass mt-6 rounded-2xl p-5">
        <p className="break-all font-mono text-xl tracking-wide text-brass-2 sm:text-2xl" aria-label="Your baul key">
          {created.key}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={copy}>{copied ? "Copied ✓" : "Copy key"}</Button>
        </div>
        <p className="mt-3 text-xs text-dim">
          Save this permanent key privately. Invite keepers from inside the Baul; those invitations expire, work once,
          and are safe to turn into QR codes without exposing this key.
        </p>
      </div>

      <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 text-sm text-dim">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-4 accent-[var(--brass)]"
        />
        I&apos;ve kept my key somewhere safe.
      </label>

      <Button size="lg" className="mt-4 w-full" disabled={!saved} onClick={() => {
        localStorage.setItem(`baul:key-saved:${created.vaultId}`, "true");
        onContinue();
      }}>
        Open my baul
      </Button>
    </div>
  );
}
