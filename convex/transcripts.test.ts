import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./transcripts.ts": () => import("./transcripts"),
  "./userManagement.ts": () => import("./userManagement"),
};

const createTest = () => convexTest(schema, modules);

const researcherIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Researcher One",
  email: "researcher.one@example.com",
  role: "researcher",
};

const adminIdentity = {
  subject: "admin-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Admin One",
  email: "admin.one@example.com",
  role: "admin",
};

const reviewerIdentity = {
  subject: "reviewer-1",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Reviewer One",
  email: "reviewer.one@example.com",
  role: "reviewer",
};

const otherResearcherIdentity = {
  subject: "researcher-2",
  tokenIdentifier: "org_2",
  issuer: "https://factory.test",
  name: "Researcher Two",
  email: "researcher.two@example.com",
  role: "researcher",
};

const makeMetadata = (overrides: Partial<TranscriptMetadataInput> = {}) => ({
  participantId: "participant-1",
  date: 1_711_000_000_000,
  tags: ["onboarding", "mobile"],
  notes: "Shared by recruiting partner.",
  ...overrides,
});

describe("transcripts", () => {
  it("generates an upload URL before a file is posted to storage", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);

    const result = await asResearcher.mutation((api as any).transcripts.uploadTranscript, {
      originalFilename: "customer-interview.txt",
      metadata: makeMetadata(),
    });

    expect(result).toMatchObject({
      transcriptId: null,
    });
    expect(result.uploadUrl).toEqual(expect.any(String));
    expect(result.uploadUrl).toContain("https://");
  });

  it("creates a pending txt transcript and processes it into processed status", async () => {
    vi.useFakeTimers();
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const storageId = await storeBlob(
      t,
      "Line one.\nLine two.",
      "text/plain; charset=utf-8",
    );

    const result = await asResearcher.mutation((api as any).transcripts.uploadTranscript, {
      storageId,
      originalFilename: "customer-interview.txt",
      metadata: makeMetadata(),
    });

    const pendingTranscript = await getTranscriptDoc(t, result.transcriptId);

    expect(pendingTranscript).toMatchObject({
      _id: result.transcriptId,
      originalFilename: "customer-interview.txt",
      format: "txt",
      processingStatus: "pending",
      characterCount: 0,
      orgId: researcherIdentity.tokenIdentifier,
      createdBy: researcherIdentity.tokenIdentifier,
      metadata: makeMetadata(),
    });

    await t.action((internal as any).transcripts.processTranscript, {
      transcriptId: result.transcriptId,
    });

    const processedTranscript = await getTranscriptDoc(t, result.transcriptId);

    expect(processedTranscript).toMatchObject({
      processingStatus: "processed",
      characterCount: "Line one.\nLine two.".length,
    });

    vi.useRealTimers();
  });

  it("processes json transcripts with speaker turns and exposes structured content", async () => {
    vi.useFakeTimers();
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const turns = [
      { speaker: "Interviewer", text: "Tell me about checkout.", timestamp: 1 },
      { speaker: "Participant", text: "I got stuck at payment.", timestamp: 2 },
    ];
    const storageId = await storeBlob(
      t,
      JSON.stringify(turns),
      "application/json",
    );

    const result = await asResearcher.mutation((api as any).transcripts.uploadTranscript, {
      storageId,
      originalFilename: "customer-interview.json",
      metadata: makeMetadata({ tags: ["checkout"] }),
    });

    await t.action((internal as any).transcripts.processTranscript, {
      transcriptId: result.transcriptId,
    });

    const transcript = await asResearcher.query((api as any).transcripts.getTranscript, {
      transcriptId: result.transcriptId,
    });
    const content = await asResearcher.action((api as any).transcripts.getTranscriptContent, {
      transcriptId: result.transcriptId,
    });

    expect(transcript).toMatchObject({
      format: "json",
      processingStatus: "processed",
      characterCount:
        "Interviewer: Tell me about checkout.\nParticipant: I got stuck at payment."
          .length,
    });
    expect(content).toEqual({
      format: "json",
      turns,
    });

    vi.useRealTimers();
  });

  it("marks malformed json files as errored with a descriptive processing error", async () => {
    vi.useFakeTimers();
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const storageId = await storeBlob(
      t,
      "{ definitely not valid json",
      "application/json",
    );

    const result = await asResearcher.mutation((api as any).transcripts.uploadTranscript, {
      storageId,
      originalFilename: "bad-transcript.json",
      metadata: makeMetadata(),
    });

    await t.action((internal as any).transcripts.processTranscript, {
      transcriptId: result.transcriptId,
    });

    const transcript = await getTranscriptDoc(t, result.transcriptId);

    expect(transcript?.processingStatus).toBe("error");
    expect(transcript?.processingError).toContain("Invalid transcript JSON");
    expect(transcript?.characterCount).toBe(0);

    vi.useRealTimers();
  });

  it("marks invalid json transcript shapes as errored", async () => {
    vi.useFakeTimers();
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const storageId = await storeBlob(
      t,
      JSON.stringify([{ speaker: "Interviewer", timestamp: 1 }]),
      "application/json",
    );

    const result = await asResearcher.mutation((api as any).transcripts.uploadTranscript, {
      storageId,
      originalFilename: "missing-text.json",
      metadata: makeMetadata(),
    });

    await t.action((internal as any).transcripts.processTranscript, {
      transcriptId: result.transcriptId,
    });

    const transcript = await getTranscriptDoc(t, result.transcriptId);

    expect(transcript?.processingStatus).toBe("error");
    expect(transcript?.processingError).toContain("text");

    vi.useRealTimers();
  });

  it("supports search by filename, participant id, tags, and notes with ANDed filters", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const firstTranscriptId = await insertTranscript(t, {
      originalFilename: "checkout-study.txt",
      metadata: makeMetadata({
        participantId: "p-123",
        tags: ["checkout", "vip"],
        notes: "Observed payment hesitation.",
      }),
    });
    await insertTranscript(t, {
      originalFilename: "onboarding-study.txt",
      metadata: makeMetadata({
        participantId: "p-456",
        tags: ["onboarding"],
        notes: "Mentioned mobile success.",
      }),
    });

    const byFilename = await asResearcher.query((api as any).transcripts.listTranscripts, {
      search: "checkout",
    });
    const byMetadata = await asResearcher.query((api as any).transcripts.listTranscripts, {
      search: "payment hesitation",
      tags: ["checkout"],
      format: "txt",
    });

    expect(byFilename.map((transcript: { _id: Id<"transcripts"> }) => transcript._id)).toEqual([
      firstTranscriptId,
    ]);
    expect(byMetadata.map((transcript: { _id: Id<"transcripts"> }) => transcript._id)).toEqual([
      firstTranscriptId,
    ]);
  });

  it("returns only transcripts for the caller org", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const asOtherResearcher = t.withIdentity(otherResearcherIdentity);
    const ownTranscriptId = await insertTranscript(t, { orgId: researcherIdentity.tokenIdentifier });
    await insertTranscript(t, { orgId: otherResearcherIdentity.tokenIdentifier });

    const listed = await asResearcher.query((api as any).transcripts.listTranscripts, {});
    const foreignTranscript = await asOtherResearcher.query((api as any).transcripts.getTranscript, {
      transcriptId: ownTranscriptId,
    });

    expect(listed.map((transcript: { _id: Id<"transcripts"> }) => transcript._id)).toEqual([
      ownTranscriptId,
    ]);
    expect(foreignTranscript).toBeNull();
  });

  it("returns raw text content for txt transcripts", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const storageId = await storeBlob(t, "Raw transcript text", "text/plain");
    const transcriptId = await insertTranscript(t, {
      storageId,
      originalFilename: "raw.txt",
      format: "txt",
      characterCount: "Raw transcript text".length,
    });

    const content = await asResearcher.action((api as any).transcripts.getTranscriptContent, {
      transcriptId,
    });

    expect(content).toEqual({
      format: "txt",
      text: "Raw transcript text",
    });
  });

  it("updates transcript metadata fields", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const transcriptId = await insertTranscript(t, {
      metadata: makeMetadata({
        participantId: "before",
        tags: ["draft"],
        notes: "before",
      }),
    });

    const updated = await asAdmin.mutation((api as any).transcripts.updateTranscriptMetadata, {
      transcriptId,
      metadata: {
        participantId: "after",
        date: 1_712_000_000_000,
        tags: ["checkout", "returning"],
        notes: "after",
      },
    });

    expect(updated).toMatchObject({
      _id: transcriptId,
      metadata: {
        participantId: "after",
        date: 1_712_000_000_000,
        tags: ["checkout", "returning"],
        notes: "after",
      },
    });
  });

  it("deletes transcript records, their storage blobs, and attached pack relationships", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const storageId = await storeBlob(t, "delete me", "text/plain");
    const transcriptId = await insertTranscript(t, { storageId });
    const packId = await insertPack(t, { orgId: researcherIdentity.tokenIdentifier });
    await t.run(async (ctx) =>
      ctx.db.insert("packTranscripts", {
        packId,
        transcriptId,
        createdAt: Date.now(),
      }),
    );

    const result = await asResearcher.mutation((api as any).transcripts.deleteTranscript, {
      transcriptId,
    });

    const transcript = await getTranscriptDoc(t, transcriptId);
    const storageBlob = await t.action(async (ctx) => await ctx.storage.get(storageId));
    const associations = await t.run(async (ctx) =>
      ctx.db
        .query("packTranscripts")
        .withIndex("by_packId", (q) => q.eq("packId", packId))
        .collect(),
    );

    expect(result).toEqual({
      transcriptId,
      deleted: true,
    });
    expect(transcript).toBeNull();
    expect(storageBlob).toBeNull();
    expect(associations).toEqual([]);
  });

  it("blocks reviewers from transcript mutations while allowing reads to other roles", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const asReviewer = t.withIdentity(reviewerIdentity);
    const storageId = await storeBlob(t, "reviewer blocked", "text/plain");
    const transcriptId = await insertTranscript(t);

    await expect(
      asReviewer.mutation((api as any).transcripts.uploadTranscript, {
        storageId,
        originalFilename: "blocked.txt",
        metadata: makeMetadata(),
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asReviewer.mutation((api as any).transcripts.updateTranscriptMetadata, {
        transcriptId,
        metadata: { participantId: "blocked" },
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asReviewer.mutation((api as any).transcripts.deleteTranscript, {
        transcriptId,
      }),
    ).rejects.toThrow("FORBIDDEN");

    const listed = await asResearcher.query((api as any).transcripts.listTranscripts, {});
    expect(listed).toHaveLength(1);
  });
});

type TranscriptMetadataInput = {
  participantId?: string;
  date?: number;
  tags: string[];
  notes?: string;
};

type InsertTranscriptOptions = {
  storageId?: Id<"_storage">;
  originalFilename?: string;
  format?: "txt" | "json";
  metadata?: TranscriptMetadataInput;
  processingStatus?: "pending" | "processing" | "processed" | "error";
  processingError?: string;
  characterCount?: number;
  orgId?: string;
  createdBy?: string;
};

async function storeBlob(
  t: ReturnType<typeof createTest>,
  contents: string,
  type: string,
) {
  return await t.action(async (ctx) => {
    return await ctx.storage.store(new Blob([contents], { type }));
  });
}

async function insertTranscript(
  t: ReturnType<typeof createTest>,
  overrides: InsertTranscriptOptions = {},
) {
  const storageId =
    overrides.storageId ?? (await storeBlob(t, "seed transcript", "text/plain"));
  const now = Date.now();

  return await t.run(async (ctx) =>
    ctx.db.insert("transcripts", {
      storageId,
      originalFilename: overrides.originalFilename ?? "seed.txt",
      format: overrides.format ?? "txt",
      metadata: overrides.metadata ?? makeMetadata(),
      processingStatus: overrides.processingStatus ?? "processed",
      processingError: overrides.processingError,
      characterCount: overrides.characterCount ?? "seed transcript".length,
      orgId: overrides.orgId ?? researcherIdentity.tokenIdentifier,
      createdBy: overrides.createdBy ?? researcherIdentity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function getTranscriptDoc(
  t: ReturnType<typeof createTest>,
  transcriptId: Id<"transcripts">,
): Promise<Doc<"transcripts"> | null> {
  return await t.run(
    async (ctx) => (await ctx.db.get(transcriptId)) as Doc<"transcripts"> | null,
  );
}

async function insertPack(
  t: ReturnType<typeof createTest>,
  overrides: { orgId?: string } = {},
) {
  const now = Date.now();

  return await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      name: "Pack",
      description: "Pack description",
      context: "Pack context",
      sharedAxes: [
        {
          key: "digital_confidence",
          label: "Digital Confidence",
          description: "Comfort with software",
          lowAnchor: "Low",
          midAnchor: "Medium",
          highAnchor: "High",
          weight: 1,
        },
      ],
      version: 1,
      status: "draft",
      orgId: overrides.orgId ?? researcherIdentity.tokenIdentifier,
      createdBy: overrides.orgId ?? researcherIdentity.tokenIdentifier,
      updatedBy: overrides.orgId ?? researcherIdentity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    }),
  );
}
