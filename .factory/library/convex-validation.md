# Convex validation notes

- `bun run typecheck` only checks workspace packages and does **not** typecheck the standalone `convex/` directory.
- After adding or renaming Convex modules, run `bunx convex codegen` so `convex/_generated/api.d.ts` includes the new functions.
- For backend-only Convex changes, also run `bunx tsc -p convex/tsconfig.json --noEmit` in addition to the repo-level validators.
