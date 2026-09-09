# Contributing to Baul

Use Node 24 and install dependencies with `npm ci`. Read `AGENTS.md` and the relevant version-matched Next.js documentation in `node_modules/next/dist/docs/` before changing framework behavior.

Keep changes narrow, typed, and tenant-safe:

- Define limits in `src/lib/domain.ts`, mirror them in additive database constraints, and test both layers.
- Treat live `members` rows and RLS as the authorization source of truth. Never authorize from cached JWT metadata.
- Keep browser modules separate from `server-only` email, admin, key, token, and crypto modules.
- Use explicit Supabase column lists and generated `Database` types; avoid `select("*")` and handwritten row casts.
- Never log permanent keys, tokens, email addresses, user content, or raw request bodies.
- Preserve attributed content when revoking a keeper. Destructive deletion needs an explicit, separate workflow.
- Add a reversible migration and pgTAP coverage for every schema/RLS/function change.

Before opening a change, run:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
npm run audit:prod
npm run test:e2e
```

Visual changes must be checked at desktop and mobile sizes, with keyboard-only navigation and reduced motion. Update snapshots only after reviewing the rendered diff.
