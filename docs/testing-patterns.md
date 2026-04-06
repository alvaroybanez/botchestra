# Testing Patterns

## Runner

Vitest workspace at root `vitest.config.ts` aggregates 4 projects: `packages/*`, `apps/*`, `convex/`. Run all with `bun test`.

## File Naming

Always `*.test.ts` / `*.test.tsx`, colocated next to source. Multi-topic test files use dot-separated names (e.g., `runExecutor.test.ts`, `runExecutor.logging.test.ts`).

## Convex Tests

Use `convex-test` library. Pattern in every test file:

```ts
const modules = import.meta.glob("./!(*.test).{ts,tsx}", { eager: true });
const createTest = () => convexTest(schema, modules);

test("example", async () => {
  const t = createTest();
  const asAdmin = t.withIdentity({ subject: "admin", tokenIdentifier: "test|admin", ... });
  await asAdmin.mutation(api.studies.createStudy, { ... });
});
```

- Seed data via `t.run()` for direct DB manipulation
- Factory helpers defined inline per file (e.g., `makeTaskSpec()`, `insertPack()`)

## Frontend Tests

Environment: `happy-dom`. Pattern:

- Mock Convex hooks via `vi.mock("convex/react", ...)`
- Render with `createMemoryHistory` from TanStack Router + `ReactDOM.createRoot` + `act()`
- Assert via `document.querySelector`
- See `router.test.tsx` (~4800 lines) for comprehensive examples

## AI Mocking

Consistent inline pattern (not shared):

```ts
vi.mock("../packages/ai/src/index", () => ({
  generateWithModel: vi.fn(),
}));
const mockedGenerateWithModel = vi.mocked(generateWithModel);
mockedGenerateWithModel.mockResolvedValueOnce({ text: "..." });
```

## No Shared Test Utils

Each test file is self-contained with inline mocks, fixtures, and helpers.
