# RepRun

Personal gym + running PWA (React, Vite, Tailwind) on a Cloudflare Worker with D1, behind Cloudflare Access.

## Working here

- Commit straight to `main`; a push deploys to the live site (Workers Builds). No branches.
- Before committing: `npx tsc -b`, `npx oxlint`, `npm run build`.
- One feature per commit, so any one can be reverted on its own.
- **Every user-facing change adds a line to `src/lib/changelog.ts`** under today's date (newest first, plain words, no jargon). It shows in Settings → About.
- Tick the item in `TODO.md` when it ships.
- The repo is public: no emails, secrets or personal data in code or commits. Secrets live in Cloudflare (`ALLOWED_EMAIL`, `ACCESS_TEAM`, `ACCESS_AUD`).
