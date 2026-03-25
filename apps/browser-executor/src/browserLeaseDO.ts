type BrowserLeaseEnv = {
  BROWSER_CONCURRENCY_HARD_CAP?: number | string;
  BROWSER_LEASE_ALARM_INTERVAL_MS?: number | string;
};

type StoredLease = {
  leaseId: string;
  runId: string;
  acquiredAt: number;
  leaseTimeoutMs: number;
};

type AcquireLeaseRequest = {
  runId: string;
  leaseTimeoutMs?: number;
};

type AcquireLeaseResult =
  | {
      ok: true;
      leaseId: string;
      runId: string;
      acquiredAt: number;
      leaseTimeoutMs: number;
      activeCount: number;
      hardCap: number;
    }
  | {
      ok: false;
      errorCode: "LEASE_UNAVAILABLE";
      message: string;
      activeCount: number;
      hardCap: number;
    };

type ReleaseLeaseResult = {
  ok: true;
  leaseId: string;
  released: boolean;
  activeCount: number;
};

type LeaseMap = Record<string, StoredLease>;

const DEFAULT_BROWSER_CONCURRENCY_HARD_CAP = 30;
const DEFAULT_LEASE_TIMEOUT_MS = 60_000;
const DEFAULT_ALARM_INTERVAL_MS = 60_000;
const LEASES_STORAGE_KEY = "browser-leases";

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

function notFound() {
  return json({ error: "not_found" }, 404);
}

function invalidRequest(message: string) {
  return json({ error: "invalid_request", message }, 400);
}

function asPositiveInteger(
  value: number | string | undefined,
  fallbackValue: number,
) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallbackValue;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export class BrowserLeaseDO {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: BrowserLeaseEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/acquire") {
      return this.handleAcquireRequest(request);
    }

    if (request.method === "POST" && pathname === "/release") {
      return this.handleReleaseRequest(request);
    }

    return notFound();
  }

  async acquire(request: AcquireLeaseRequest): Promise<AcquireLeaseResult> {
    const hardCap = this.getHardCap();
    const leaseTimeoutMs = asPositiveInteger(request.leaseTimeoutMs, DEFAULT_LEASE_TIMEOUT_MS);
    const now = Date.now();
    const activeLeases = await this.getActiveLeases(now);

    if (Object.keys(activeLeases).length >= hardCap) {
      return {
        ok: false,
        errorCode: "LEASE_UNAVAILABLE",
        message: "browser concurrency hard cap reached",
        activeCount: Object.keys(activeLeases).length,
        hardCap,
      };
    }

    const leaseId = crypto.randomUUID();
    activeLeases[leaseId] = {
      leaseId,
      runId: request.runId,
      acquiredAt: now,
      leaseTimeoutMs,
    };

    await this.storeLeases(activeLeases);
    await this.scheduleNextSweep(activeLeases, now);

    return {
      ok: true,
      leaseId,
      runId: request.runId,
      acquiredAt: now,
      leaseTimeoutMs,
      activeCount: Object.keys(activeLeases).length,
      hardCap,
    };
  }

  async release(leaseId: string): Promise<ReleaseLeaseResult> {
    const now = Date.now();
    const activeLeases = await this.getActiveLeases(now);
    const released = Boolean(activeLeases[leaseId]);

    if (released) {
      delete activeLeases[leaseId];
      await this.storeLeases(activeLeases);
    }

    await this.scheduleNextSweep(activeLeases, now);

    return {
      ok: true,
      leaseId,
      released,
      activeCount: Object.keys(activeLeases).length,
    };
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const activeLeases = await this.getActiveLeases(now);
    await this.scheduleNextSweep(activeLeases, now);
  }

  private async handleAcquireRequest(request: Request) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidRequest("body must be valid JSON");
    }

    if (!body || typeof body !== "object" || !isNonEmptyString((body as { runId?: unknown }).runId)) {
      return invalidRequest("runId is required");
    }

    const result = await this.acquire({
      runId: (body as { runId: string }).runId,
      leaseTimeoutMs:
        typeof (body as { leaseTimeoutMs?: unknown }).leaseTimeoutMs === "number"
          ? (body as { leaseTimeoutMs?: number }).leaseTimeoutMs
          : undefined,
    });

    return json(result, result.ok ? 200 : 409);
  }

  private async handleReleaseRequest(request: Request) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidRequest("body must be valid JSON");
    }

    if (
      !body ||
      typeof body !== "object" ||
      !isNonEmptyString((body as { leaseId?: unknown }).leaseId)
    ) {
      return invalidRequest("leaseId is required");
    }

    return json(await this.release((body as { leaseId: string }).leaseId), 200);
  }

  private getHardCap() {
    return asPositiveInteger(
      this.env.BROWSER_CONCURRENCY_HARD_CAP,
      DEFAULT_BROWSER_CONCURRENCY_HARD_CAP,
    );
  }

  private getAlarmIntervalMs() {
    return asPositiveInteger(
      this.env.BROWSER_LEASE_ALARM_INTERVAL_MS,
      DEFAULT_ALARM_INTERVAL_MS,
    );
  }

  private async getStoredLeases(): Promise<LeaseMap> {
    return (await this.state.storage.get<LeaseMap>(LEASES_STORAGE_KEY)) ?? {};
  }

  private async storeLeases(leases: LeaseMap) {
    await this.state.storage.put(LEASES_STORAGE_KEY, leases);
  }

  private async getActiveLeases(now: number) {
    const leases = await this.getStoredLeases();
    const activeLeases = Object.fromEntries(
      Object.entries(leases).filter(([, lease]) => lease.acquiredAt + lease.leaseTimeoutMs > now),
    );

    if (Object.keys(activeLeases).length !== Object.keys(leases).length) {
      await this.storeLeases(activeLeases);
    }

    return activeLeases;
  }

  private async scheduleNextSweep(leases: LeaseMap, now: number) {
    const activeLeases = Object.values(leases);

    if (activeLeases.length === 0) {
      return;
    }

    const earliestLeaseExpiryAt = Math.min(
      ...activeLeases.map((lease) => lease.acquiredAt + lease.leaseTimeoutMs),
    );
    const nextSweepAt = Math.min(now + this.getAlarmIntervalMs(), earliestLeaseExpiryAt);

    await this.state.storage.setAlarm(nextSweepAt);
  }
}
