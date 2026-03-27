# fix-typecheck-schema-depth notes

- `bun run typecheck` passes only while `convex/_generated/api.d.ts` is kept as the local simplified shim (`api/internal/components` as `any`). Running `bunx convex dev` or `bunx convex codegen` regenerates the full file and reintroduces the TS2589 web typecheck failures unless the shim is re-applied.
- `bunx convex dev --once --typecheck=disable` succeeded and `bunx convex run userManagement:setUserRole '{"email":"test@example.com","role":"admin"}'` returned a persisted `userRoles` row for that email.
- Full `bun run test` now fails only in `apps/browser-executor/src/browserLeaseDO.test.ts` because the two long-running tests still hit the 40s timeout; the rest of the suite passed (`381/383`).
- Convex test files that exercise `studies`/`rbac` now need `"./userManagement.ts"` in their `convexTest(..., modules)` maps because `rbac.ts` calls `internal.userManagement.getStoredRoleForEmail`.
