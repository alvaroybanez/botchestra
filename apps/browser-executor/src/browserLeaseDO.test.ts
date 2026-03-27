import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { describe, expect, it, vi } from "vitest";
import { BrowserLeaseDO } from "./browserLeaseDO";

const workerEntrypointPath = fileURLToPath(new URL("./index.ts", import.meta.url));
const MINIFLARE_TEST_TIMEOUT_MS = 120_000;
let bundledWorkerScript: string | undefined;

type MockStorage = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  setAlarm: ReturnType<typeof vi.fn>;
};

function createMockState() {
  const store = new Map<string, unknown>();
  const storage: MockStorage = {
    get: vi.fn(async (key: string) => store.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    setAlarm: vi.fn(async () => undefined),
  };

  return {
    storage,
  } as unknown as DurableObjectState;
}

async function createLeaseMiniflare(options?: {
  hardCap?: number;
  alarmIntervalMs?: number;
}) {
  if (!bundledWorkerScript) {
    const result = await build({
      entryPoints: [workerEntrypointPath],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
    });

    bundledWorkerScript = result.outputFiles[0]?.text;
  }

  return new Miniflare({
    compatibilityDate: "2024-12-01",
    modules: true,
    script: bundledWorkerScript,
    durableObjects: {
      BROWSER_LEASE: "BrowserLeaseDO",
    },
    bindings: {
      BROWSER_CONCURRENCY_HARD_CAP: String(options?.hardCap ?? 30),
      BROWSER_LEASE_ALARM_INTERVAL_MS: options?.alarmIntervalMs ?? 60_000,
    },
  });
}

async function getLeaseStub(options?: { hardCap?: number; alarmIntervalMs?: number }) {
  const miniflare = await createLeaseMiniflare(options);
  const namespace = (await miniflare.getDurableObjectNamespace(
    "BROWSER_LEASE",
  )) as unknown as DurableObjectNamespace;
  const durableObjectId = namespace.idFromName("browser-lease");

  return {
    miniflare,
    stub: namespace.get(durableObjectId),
  };
}

async function acquireLease(
  stub: DurableObjectStub,
  body: { runId: string; leaseTimeoutMs?: number },
) {
  const response = await stub.fetch("https://browser-lease.example/acquire", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

async function releaseLease(stub: DurableObjectStub, leaseId: string) {
  const response = await stub.fetch("https://browser-lease.example/release", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ leaseId }),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("BrowserLeaseDO", () => {
  it("rejects acquisitions beyond the hard concurrency cap", async () => {
    const { miniflare, stub } = await getLeaseStub({ hardCap: 2, alarmIntervalMs: 10 });

    try {
      const firstLease = await acquireLease(stub, { runId: "run-1", leaseTimeoutMs: 1_000 });
      const secondLease = await acquireLease(stub, { runId: "run-2", leaseTimeoutMs: 1_000 });
      const rejectedLease = await acquireLease(stub, { runId: "run-3", leaseTimeoutMs: 1_000 });

      expect(firstLease.status).toBe(200);
      expect(secondLease.status).toBe(200);
      expect(rejectedLease.status).toBe(409);
      expect(rejectedLease.body).toMatchObject({
        errorCode: "LEASE_UNAVAILABLE",
        activeCount: 2,
        hardCap: 2,
      });
    } finally {
      await miniflare.dispose();
    }
  }, MINIFLARE_TEST_TIMEOUT_MS);

  it("releases the same lease twice without throwing", async () => {
    const durableObject = new BrowserLeaseDO(
      createMockState(),
      {
        BROWSER_CONCURRENCY_HARD_CAP: "1",
        BROWSER_LEASE_ALARM_INTERVAL_MS: "10",
      },
    ) as any;

    const lease = await durableObject.acquire({ runId: "run-1", leaseTimeoutMs: 1_000 });

    await expect(durableObject.release(lease.leaseId)).resolves.toMatchObject({
      ok: true,
      released: true,
    });
    await expect(durableObject.release(lease.leaseId)).resolves.toMatchObject({
      ok: true,
      released: false,
    });
  });

  it("reclaims stale leases after the timeout passes", async () => {
    const { miniflare, stub } = await getLeaseStub({ hardCap: 1, alarmIntervalMs: 20 });

    try {
      const firstLease = await acquireLease(stub, { runId: "run-1", leaseTimeoutMs: 20 });
      const beforeReclamation = await acquireLease(stub, { runId: "run-2", leaseTimeoutMs: 20 });

      expect(firstLease.status).toBe(200);
      expect(beforeReclamation.status).toBe(409);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const afterReclamation = await acquireLease(stub, { runId: "run-3", leaseTimeoutMs: 20 });

      expect(afterReclamation.status).toBe(200);
      expect(afterReclamation.body).toMatchObject({
        runId: "run-3",
        activeCount: 1,
      });
    } finally {
      await miniflare.dispose();
    }
  }, MINIFLARE_TEST_TIMEOUT_MS);
});
