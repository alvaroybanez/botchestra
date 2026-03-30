import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

const mockedGenerateWithModel = vi.fn();
const mockedResolveModel = vi.fn(
  (
    _category: string,
    modelOverride?: string,
  ) => modelOverride ?? "gpt-5.4-nano",
);

vi.mock("../packages/ai/src/index", () => ({
  generateWithModel: mockedGenerateWithModel,
  resolveModel: mockedResolveModel,
}));

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./packTranscripts.ts": () => import("./packTranscripts"),
  "./personaPacks.ts": () => import("./personaPacks"),
  "./schema.ts": () => import("./schema"),
  "./settings.ts": () => import("./settings"),
  "./transcriptExtraction.ts": () => import("./transcriptExtraction"),
  "./transcripts.ts": () => import("./transcripts"),
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);
const transcriptExtractionApi = (api as any).transcriptExtraction;
const transcriptExtractionInternal = (internal as any).transcriptExtraction;

const researcherIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Researcher One",
  email: "researcher.one@example.com",
  role: "researcher",
};

type TranscriptSignalsPayload = {
  themes: string[];
  attitudes: string[];
  painPoints: string[];
  decisionPatterns: string[];
  evidenceSnippets: Array<{
    quote: string;
    startChar: number;
    endChar: number;
  }>;
};

type ArchetypePayload = {
  name: string;
  summary: string;
  axisValues: Array<{ key: string; value: number }>;
  evidenceSnippets: Array<{
    transcriptId: string;
    quote: string;
    startChar: number;
    endChar: number;
  }>;
  contributingTranscriptIds: string[];
};

describe("transcriptExtraction", () => {
  beforeEach(() => {
    mockedGenerateWithModel.mockReset();
    mockedResolveModel.mockReset();
    mockedResolveModel.mockImplementation(
      (_category: string, modelOverride?: string) =>
        modelOverride ?? "gpt-5.4-nano",
    );
  });

  it("estimates extraction cost from transcript character counts using the default summarization model", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const firstTranscriptId = await insertTranscript(t, {
      body: "A".repeat(400),
    });
    const secondTranscriptId = await insertTranscript(t, {
      body: "B".repeat(200),
    });

    const result = await asResearcher.query(
      transcriptExtractionApi.estimateExtractionCost,
      {
        transcriptIds: [firstTranscriptId, secondTranscriptId],
      },
    );

    expect(result).toEqual({
      totalCharacters: 600,
      estimatedTokens: 150,
      estimatedCostUsd: 0.00003,
    });
  });

  it("uses org-level summarization model overrides for cost estimation", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const transcriptId = await insertTranscript(t, {
      body: "A".repeat(400),
    });
    await insertSettings(t, {
      modelConfig: [
        {
          taskCategory: "summarization",
          modelId: "gpt-5.4-mini",
        },
      ],
    });

    const result = await asResearcher.query(
      transcriptExtractionApi.estimateExtractionCost,
      {
        transcriptIds: [transcriptId],
      },
    );

    expect(result).toEqual({
      totalCharacters: 400,
      estimatedTokens: 100,
      estimatedCostUsd: 0.000075,
    });
  });

  it("extracts transcript signals, validates them, and stores them for the pack", async () => {
    const t = createTest();
    const packId = await insertPack(t);
    const transcriptBody =
      "Interviewer: What happened during checkout?\nParticipant: I hesitated because the final price felt higher than expected.";
    const transcriptId = await insertTranscript(t, {
      body: transcriptBody,
      originalFilename: "checkout.txt",
    });
    await attachTranscript(t, packId, transcriptId);
    mockedGenerateWithModel.mockResolvedValue(
      createTextOnlyResult(
        JSON.stringify(
          createSignalsPayload({
            evidenceSnippets: [
              {
                quote: "the final price felt higher than expected",
                startChar: transcriptBody.indexOf(
                  "the final price felt higher than expected",
                ),
                endChar:
                  transcriptBody.indexOf(
                    "the final price felt higher than expected",
                  ) +
                  "the final price felt higher than expected".length,
              },
            ],
          }),
        ),
      ),
    );

    await t.action(transcriptExtractionInternal.extractTranscriptSignals, {
      packId,
      transcriptId,
    });

    const storedSignals = await getTranscriptSignalForPack(t, packId, transcriptId);

    expect(storedSignals).toMatchObject({
      packId,
      transcriptId,
      status: "completed",
      signals: createSignalsPayload({
        evidenceSnippets: [
          {
            quote: "the final price felt higher than expected",
            startChar: transcriptBody.indexOf(
              "the final price felt higher than expected",
            ),
            endChar:
              transcriptBody.indexOf(
                "the final price felt higher than expected",
              ) +
              "the final price felt higher than expected".length,
          },
        ],
      }),
    });
  });

  it("marks transcript signal extraction as failed and throws on malformed model output", async () => {
    const t = createTest();
    const packId = await insertPack(t);
    const transcriptId = await insertTranscript(t);
    await attachTranscript(t, packId, transcriptId);
    mockedGenerateWithModel.mockResolvedValue(createTextOnlyResult("{ definitely bad json"));

    await expect(
      t.action(transcriptExtractionInternal.extractTranscriptSignals, {
        packId,
        transcriptId,
      }),
    ).rejects.toThrow(/failed to parse/i);

    const storedSignals = await getTranscriptSignalForPack(t, packId, transcriptId);

    expect(storedSignals).toMatchObject({
      status: "failed",
    });
    expect(storedSignals?.processingError).toMatch(/failed to parse/i);
  });

  it("clusters guided archetypes using pack shared axes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t);
    const firstTranscriptId = await insertTranscript(t, {
      body: "I compare prices and wait for reassurance from support.",
    });
    const secondTranscriptId = await insertTranscript(t, {
      body: "I move fast when prices look clear and support is optional.",
    });
    await attachTranscript(t, packId, firstTranscriptId);
    await attachTranscript(t, packId, secondTranscriptId);
    await insertTranscriptSignals(t, {
      packId,
      transcriptId: firstTranscriptId,
      signals: createSignalsPayload({
        themes: ["price clarity"],
      }),
    });
    await insertTranscriptSignals(t, {
      packId,
      transcriptId: secondTranscriptId,
      signals: createSignalsPayload({
        attitudes: ["self-directed"],
      }),
    });
    mockedGenerateWithModel.mockResolvedValue(
      createTextOnlyResult(
        JSON.stringify({
          archetypes: [
            createArchetypePayload({
              contributingTranscriptIds: [firstTranscriptId, secondTranscriptId],
              evidenceSnippets: [
                {
                  transcriptId: firstTranscriptId,
                  quote: "wait for reassurance from support",
                  startChar: 30,
                  endChar: 64,
                },
              ],
            }),
          ],
        }),
      ),
    );

    const result = await asResearcher.action(
      transcriptExtractionApi.clusterArchetypes,
      {
        packId,
        mode: "guided",
      },
    );

    expect(result).toMatchObject({
      mode: "guided",
      archetypes: [
        expect.objectContaining({
          name: "Deliberate Reassurance Seeker",
          contributingTranscriptIds: [firstTranscriptId, secondTranscriptId],
        }),
      ],
      proposedAxes: [],
    });
    expect(mockedGenerateWithModel.mock.calls[0]?.[1]?.prompt).toContain(
      "digital_confidence",
    );
  });

  it("clusters auto-discovered archetypes and proposed axes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t);
    const transcriptId = await insertTranscript(t);
    await attachTranscript(t, packId, transcriptId);
    await insertTranscriptSignals(t, {
      packId,
      transcriptId,
    });
    mockedGenerateWithModel.mockResolvedValue(
      createTextOnlyResult(
        JSON.stringify({
          archetypes: [
            createArchetypePayload({
              contributingTranscriptIds: [transcriptId],
              evidenceSnippets: [
                {
                  transcriptId,
                  quote: "surprise fees",
                  startChar: 0,
                  endChar: 13,
                },
              ],
            }),
          ],
          proposedAxes: [
            {
              key: "price_sensitivity",
              label: "Price Sensitivity",
              description: "How strongly pricing shifts behavior.",
              lowAnchor: "Price barely matters",
              midAnchor: "Balances price and convenience",
              highAnchor: "Price dominates decisions",
              weight: 1,
            },
          ],
        }),
      ),
    );

    const result = await asResearcher.action(
      transcriptExtractionApi.clusterArchetypes,
      {
        packId,
        mode: "auto_discover",
      },
    );

    expect(result.proposedAxes).toEqual([
      {
        key: "price_sensitivity",
        label: "Price Sensitivity",
        description: "How strongly pricing shifts behavior.",
        lowAnchor: "Price barely matters",
        midAnchor: "Balances price and convenience",
        highAnchor: "Price dominates decisions",
        weight: 1,
      },
    ]);
  });

  it("throws a descriptive error when clustering output is malformed", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t);
    const transcriptId = await insertTranscript(t);
    await attachTranscript(t, packId, transcriptId);
    await insertTranscriptSignals(t, {
      packId,
      transcriptId,
    });
    mockedGenerateWithModel.mockResolvedValue(createTextOnlyResult("{ nope"));

    await expect(
      asResearcher.action(transcriptExtractionApi.clusterArchetypes, {
        packId,
        mode: "guided",
      }),
    ).rejects.toThrow(/failed to parse/i);
  });

  it("blocks concurrent extraction runs for the same pack", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t);
    const transcriptId = await insertTranscript(t);
    await attachTranscript(t, packId, transcriptId);
    await insertExtractionRun(t, {
      packId,
      status: "processing",
    });

    await expect(
      asResearcher.action(transcriptExtractionApi.startExtraction, {
        packId,
        mode: "guided",
      }),
    ).rejects.toThrow(/already in progress/i);
  });

  it("processes transcripts sequentially, tracks progress, and proceeds on partial failure", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t);
    const firstTranscriptId = await insertTranscript(t, {
      body: "I hesitated at checkout.",
    });
    const secondTranscriptId = await insertTranscript(t, {
      body: "I finished once the price made sense.",
    });
    await attachTranscript(t, packId, firstTranscriptId);
    await attachTranscript(t, packId, secondTranscriptId);
    mockedGenerateWithModel
      .mockResolvedValueOnce(createTextOnlyResult("{ invalid"))
      .mockResolvedValueOnce(
        createTextOnlyResult(
          JSON.stringify(
            createSignalsPayload({
              evidenceSnippets: [
                {
                  quote: "price made sense",
                  startChar: 26,
                  endChar: 42,
                },
              ],
            }),
          ),
        ),
      )
      .mockResolvedValueOnce(
        createTextOnlyResult(
          JSON.stringify({
            archetypes: [
              createArchetypePayload({
                contributingTranscriptIds: [secondTranscriptId],
                evidenceSnippets: [
                  {
                    transcriptId: secondTranscriptId,
                    quote: "price made sense",
                    startChar: 26,
                    endChar: 42,
                  },
                ],
              }),
            ],
          }),
        ),
      );

    const result = await asResearcher.action(
      transcriptExtractionApi.startExtraction,
      {
        packId,
        mode: "guided",
      },
    );

    expect(result).toMatchObject({
      packId,
      status: "completed_with_failures",
      totalTranscripts: 2,
      processedTranscriptCount: 2,
      succeededTranscriptIds: [secondTranscriptId],
      failedTranscripts: [
        expect.objectContaining({
          transcriptId: firstTranscriptId,
        }),
      ],
      archetypes: [
        expect.objectContaining({
          contributingTranscriptIds: [secondTranscriptId],
        }),
      ],
    });

    const run = await getExtractionRunForPack(t, packId);
    expect(run).toMatchObject({
      status: "completed_with_failures",
      processedTranscriptCount: 2,
      succeededTranscriptIds: [secondTranscriptId],
    });
  });

  it("fails extraction when a guided run has no axes available", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t, { sharedAxes: [] });
    const transcriptId = await insertTranscript(t);
    await attachTranscript(t, packId, transcriptId);

    await expect(
      asResearcher.action(transcriptExtractionApi.startExtraction, {
        packId,
        mode: "guided",
      }),
    ).rejects.toThrow(/at least one axis/i);
  });

  it("returns the latest persisted extraction status for a pack", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t);
    const transcriptId = await insertTranscript(t);
    await attachTranscript(t, packId, transcriptId);
    await insertTranscriptSignals(t, {
      packId,
      transcriptId,
    });
    await insertExtractionRun(t, {
      packId,
      status: "completed",
      processedTranscriptCount: 1,
      totalTranscripts: 1,
      succeededTranscriptIds: [transcriptId],
      archetypes: [
        createArchetypePayload({
          contributingTranscriptIds: [transcriptId],
          evidenceSnippets: [
            {
              transcriptId,
              quote: "I wanted to double-check the price",
              startChar: 0,
              endChar: 34,
            },
          ],
        }),
      ],
    });

    const status = await asResearcher.query(
      transcriptExtractionApi.getExtractionStatus,
      {
        packId,
      },
    );

    expect(status).toMatchObject({
      status: "completed",
      processedTranscriptCount: 1,
      transcriptSignals: [
        expect.objectContaining({
          transcriptId,
          status: "completed",
        }),
      ],
    });
  });
});

function createSignalsPayload(
  overrides: Partial<TranscriptSignalsPayload> = {},
): TranscriptSignalsPayload {
  return {
    themes: ["price sensitivity"],
    attitudes: ["cautious"],
    painPoints: ["surprise fees"],
    decisionPatterns: ["seeks reassurance before committing"],
    evidenceSnippets: [
      {
        quote: "surprise fees",
        startChar: 0,
        endChar: 13,
      },
    ],
    ...overrides,
  };
}

function createArchetypePayload(
  overrides: Partial<ArchetypePayload> = {},
): ArchetypePayload {
  return {
    name: "Deliberate Reassurance Seeker",
    summary: "Moves cautiously, seeks confirmation, and slows down around pricing uncertainty.",
    axisValues: [
      {
        key: "digital_confidence",
        value: 0.35,
      },
    ],
    evidenceSnippets: [
      {
        transcriptId: "stub-transcript-id",
        quote: "I wanted to double-check the price",
        startChar: 0,
        endChar: 34,
      },
    ],
    contributingTranscriptIds: ["stub-transcript-id"],
    ...overrides,
  };
}

function createTextOnlyResult(text: string) {
  return {
    text,
  } as unknown;
}

async function insertSettings(
  t: ReturnType<typeof createTest>,
  overrides: {
    modelConfig?: Array<{ taskCategory: string; modelId: string }>;
  } = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("settings", {
      orgId: researcherIdentity.tokenIdentifier,
      domainAllowlist: [],
      maxConcurrency: 10,
      modelConfig: overrides.modelConfig ?? [],
      runBudgetCap: 100,
      updatedBy: researcherIdentity.tokenIdentifier,
      updatedAt: Date.now(),
    }),
  );
}

async function insertPack(
  t: ReturnType<typeof createTest>,
  overrides: {
    sharedAxes?: Array<{
      key: string;
      label: string;
      description: string;
      lowAnchor: string;
      midAnchor: string;
      highAnchor: string;
      weight: number;
    }>;
  } = {},
) {
  const now = Date.now();

  return await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      name: "Transcript Pack",
      description: "Pack for transcript extraction tests.",
      context: "Checkout support flow",
      sharedAxes:
        overrides.sharedAxes ??
        [
          {
            key: "digital_confidence",
            label: "Digital Confidence",
            description: "Comfort navigating the product independently.",
            lowAnchor: "Needs assistance often",
            midAnchor: "Can self-serve with occasional help",
            highAnchor: "Self-directed and exploratory",
            weight: 1,
          },
        ],
      version: 1,
      status: "draft",
      orgId: researcherIdentity.tokenIdentifier,
      createdBy: researcherIdentity.tokenIdentifier,
      updatedBy: researcherIdentity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function insertTranscript(
  t: ReturnType<typeof createTest>,
  overrides: {
    body?: string;
    originalFilename?: string;
    format?: "txt" | "json";
  } = {},
) {
  const body = overrides.body ?? "Participant: I was unsure what to do next.";
  const storageId = await t.action(async (ctx) =>
    ctx.storage.store(
      new Blob([body], {
        type: overrides.format === "json" ? "application/json" : "text/plain",
      }),
    ),
  );
  const now = Date.now();

  return await t.run(async (ctx) =>
    ctx.db.insert("transcripts", {
      storageId,
      originalFilename: overrides.originalFilename ?? "transcript.txt",
      format: overrides.format ?? "txt",
      metadata: {
        participantId: "participant-1",
        tags: ["checkout"],
        notes: "Seed transcript",
      },
      processingStatus: "processed",
      characterCount: body.length,
      orgId: researcherIdentity.tokenIdentifier,
      createdBy: researcherIdentity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function attachTranscript(
  t: ReturnType<typeof createTest>,
  packId: Id<"personaPacks">,
  transcriptId: Id<"transcripts">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("packTranscripts", {
      packId,
      transcriptId,
      createdAt: Date.now(),
    }),
  );
}

async function insertTranscriptSignals(
  t: ReturnType<typeof createTest>,
  overrides: {
    packId: Id<"personaPacks">;
    transcriptId: Id<"transcripts">;
    status?: "pending" | "processing" | "completed" | "failed";
    signals?: TranscriptSignalsPayload;
    processingError?: string;
  },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("transcriptSignals", {
      packId: overrides.packId,
      transcriptId: overrides.transcriptId,
      orgId: researcherIdentity.tokenIdentifier,
      status: overrides.status ?? "completed",
      signals: overrides.signals ?? createSignalsPayload(),
      processingError: overrides.processingError,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function insertExtractionRun(
  t: ReturnType<typeof createTest>,
  overrides: {
    packId: Id<"personaPacks">;
    status: "processing" | "completed" | "completed_with_failures" | "failed";
    mode?: "auto_discover" | "guided";
    totalTranscripts?: number;
    processedTranscriptCount?: number;
    succeededTranscriptIds?: Id<"transcripts">[];
    failedTranscripts?: Array<{ transcriptId: Id<"transcripts">; error: string }>;
    archetypes?: ArchetypePayload[];
  },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("transcriptExtractionRuns", {
      packId: overrides.packId,
      orgId: researcherIdentity.tokenIdentifier,
      mode: overrides.mode ?? "guided",
      status: overrides.status,
      guidedAxes: [],
      totalTranscripts: overrides.totalTranscripts ?? 1,
      processedTranscriptCount: overrides.processedTranscriptCount ?? 0,
      succeededTranscriptIds: overrides.succeededTranscriptIds ?? [],
      failedTranscripts: overrides.failedTranscripts ?? [],
      archetypes: (overrides.archetypes ?? []) as any,
      proposedAxes: [],
      startedBy: researcherIdentity.tokenIdentifier,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function getTranscriptSignalForPack(
  t: ReturnType<typeof createTest>,
  packId: Id<"personaPacks">,
  transcriptId: Id<"transcripts">,
): Promise<Doc<"transcriptSignals"> | null> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("transcriptSignals")
      .withIndex("by_packId_and_transcriptId", (q) =>
        q.eq("packId", packId).eq("transcriptId", transcriptId),
      )
      .collect();

    return (rows[0] ?? null) as Doc<"transcriptSignals"> | null;
  });
}

async function getExtractionRunForPack(
  t: ReturnType<typeof createTest>,
  packId: Id<"personaPacks">,
): Promise<Doc<"transcriptExtractionRuns"> | null> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("transcriptExtractionRuns")
      .withIndex("by_packId", (q) => q.eq("packId", packId))
      .collect();

    return (rows[0] ?? null) as Doc<"transcriptExtractionRuns"> | null;
  });
}
