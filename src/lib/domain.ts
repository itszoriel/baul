import { z } from "zod";

export const LIMITS = {
  vaultName: 80,
  displayName: 40,
  keeperPhraseMin: 10,
  legacyKeeperPhraseMin: 6,
  keeperPhraseMax: 128,
  memory: 20_000,
  caption: 500,
  message: 2_000,
  reply: 2_000,
  songTitle: 120,
  songBytes: 15 * 1024 * 1024,
  uploadedSongsPerVault: 10,
  photosPerVault: 250,
  stickerName: 32,
  stickersPerVault: 50,
  url: 2_048,
} as const;

export const uuidSchema = z.uuid();
export const vaultTypeSchema = z.enum(["intimate", "circle"]);
export const vaultPurposeSchema = z.enum(["romance", "friends", "family", "team", "other"]);
export const memberRoleSchema = z.enum(["admin", "member"]);
export const vaultNameSchema = z.string().trim().min(1, "Give your baul a name.").max(LIMITS.vaultName);
export const displayNameSchema = z.string().trim().min(1, "Choose a keeper name.").max(LIMITS.displayName);
export const keeperPhraseSchema = z
  .string()
  .min(LIMITS.keeperPhraseMin, `Use at least ${LIMITS.keeperPhraseMin} characters.`)
  .max(LIMITS.keeperPhraseMax);
export const legacyKeeperPhraseSchema = z
  .string()
  .min(LIMITS.legacyKeeperPhraseMin)
  .max(LIMITS.keeperPhraseMax);
export const emailSchema = z.string().trim().email().max(254);
export const tokenSchema = z.string().min(32).max(256);
export const stickerNameSchema = z
  .string()
  .trim()
  .min(1, "Give your sticker a name.")
  .max(LIMITS.stickerName)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u, "Use letters, numbers, spaces, dashes, or underscores.");

export const createVaultSchema = z.object({
  name: vaultNameSchema,
  maxMembers: z.number().int().min(2).max(50),
  purpose: vaultPurposeSchema,
  recoveryEmail: emailSchema.optional().nullable(),
  milestoneDate: z.iso.date().optional().nullable(),
  countryId: uuidSchema.optional().nullable(),
  divisionId: uuidSchema.optional().nullable(),
  turnstileToken: z.string().max(2_048).optional().nullable(),
});

export const verifyKeySchema = z.object({
  key: z.string().min(1).max(100),
  turnstileToken: z.string().max(2_048).optional().nullable(),
});
export const manualJoinSchema = z.object({
  joinToken: tokenSchema,
  displayName: displayNameSchema.optional(),
  passphrase: keeperPhraseSchema.optional(),
  turnstileToken: z.string().max(2_048).optional().nullable(),
});
export const reclaimSchema = z.object({
  joinToken: tokenSchema,
  username: displayNameSchema,
  passphrase: legacyKeeperPhraseSchema,
  turnstileToken: z.string().max(2_048).optional().nullable(),
});
export const createInviteSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
export const redeemInviteSchema = z.object({
  token: tokenSchema,
  displayName: displayNameSchema,
  passphrase: keeperPhraseSchema,
  turnstileToken: z.string().max(2_048).optional().nullable(),
});
export const recoveryRequestSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().max(2_048).optional().nullable(),
});
export const recoveryConfirmSchema = z.object({
  token: tokenSchema,
  turnstileToken: z.string().max(2_048).optional().nullable(),
});
export const memoryEntrySchema = z.object({
  vaultId: uuidSchema,
  kind: z.enum(["note", "letter"]),
  content: z.string().max(LIMITS.memory),
  unlockAt: z.iso.datetime({ offset: true }).optional().nullable(),
  songId: uuidSchema.optional().nullable(),
});

export const songUploadIntentSchema = z.object({
  vaultId: uuidSchema,
  title: z.string().trim().min(1, "Give the song a title.").max(LIMITS.songTitle),
  size: z.number().int().min(1).max(LIMITS.songBytes),
  mimeType: z.enum(["audio/mpeg", "audio/mp3"]),
});

export const songUploadCompletionSchema = z.object({
  uploadId: uuidSchema,
});

export interface SongUploadIntentResult {
  uploadId: string;
  path: string;
  token: string;
  expiresAt: string;
}

export const vaultSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  vaultType: vaultTypeSchema,
  purpose: vaultPurposeSchema,
  memberId: uuidSchema,
  displayName: z.string(),
  role: memberRoleSchema,
  memberCount: z.number().int().nonnegative(),
  milestoneDate: z.string().nullable(),
  createdAt: z.string(),
});

export type VaultSummary = z.infer<typeof vaultSummarySchema>;

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "CHALLENGE_REQUIRED"
  | "INTERNAL_ERROR";

export interface ApiError {
  error: string;
  code: ApiErrorCode;
  requestId: string;
  retryAfterSec?: number;
  challengeRequired?: boolean;
}

export interface InviteResult {
  inviteId: string;
  inviteUrl: string;
  expiresAt: string;
}

export interface InviteRedeemResult {
  memberId: string;
  vault: { id: string; name: string; vaultType: "intimate" | "circle" };
}

export interface RecoveryRequestResult {
  message: string;
}

export interface RecoveryConfirmResult {
  key: string;
  vault: { id: string; name: string };
}
