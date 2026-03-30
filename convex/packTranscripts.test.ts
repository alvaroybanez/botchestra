import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./packTranscripts.ts": () => import("./packTranscripts"),
  "./personaPacks.ts": () => import("./personaPacks"),
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

describe("packTranscripts", () => {
  it("attaches a transcript to a draft pack", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t, { status: "draft" });
    const transcriptId = await insertTranscript(t);

    const attached = await asResearcher.mutation((api as any).packTranscripts.attachTranscript, {
      packId,
      transcriptId,
    });

    expect(attached).toMatchObject({
      packId,
      transcriptId,
    });

    const stored = await listPackTranscriptDocs(t, packId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      packId,
      transcriptId,
    });
  });

  it("rejects attaching the same transcript twice to the same pack", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t, { status: "draft" });
    const transcriptId = await insertTranscript(t);

    await asResearcher.mutation((api as any).packTranscripts.attachTranscript, {
      packId,
      transcriptId,
    });

    await expect(
      asResearcher.mutation((api as any).packTranscripts.attachTranscript, {
        packId,
        transcriptId,
      }),
    ).rejects.toThrow("already attached");
  });

  it("rejects attaching transcripts to published packs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const publishedPackId = await insertPack(t, { status: "published" });
    const transcriptId = await insertTranscript(t);

    await expect(
      asResearcher.mutation((api as any).packTranscripts.attachTranscript, {
        packId: publishedPackId,
        transcriptId,
      }),
    ).rejects.toThrow(/published/i);
  });

  it("detaches a transcript from a draft pack", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t, { status: "draft" });
    const transcriptId = await insertTranscript(t);
    await t.run(async (ctx) =>
      ctx.db.insert("packTranscripts", {
        packId,
        transcriptId,
        createdAt: Date.now(),
      }),
    );

    const result = await asResearcher.mutation((api as any).packTranscripts.detachTranscript, {
      packId,
      transcriptId,
    });

    expect(result).toEqual({
      packId,
      transcriptId,
      detached: true,
    });
    expect(await listPackTranscriptDocs(t, packId)).toEqual([]);
  });

  it("lists transcripts for a pack with transcript details", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const packId = await insertPack(t, { status: "draft" });
    const txtTranscriptId = await insertTranscript(t, {
      originalFilename: "checkout.txt",
      format: "txt",
    });
    const jsonTranscriptId = await insertTranscript(t, {
      originalFilename: "interview.json",
      format: "json",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("packTranscripts", {
        packId,
        transcriptId: txtTranscriptId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("packTranscripts", {
        packId,
        transcriptId: jsonTranscriptId,
        createdAt: Date.now(),
      });
    });

    const attached = await asResearcher.query((api as any).packTranscripts.listPackTranscripts, {
      packId,
    });

    expect(attached).toHaveLength(2);
    expect(attached).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packId,
          transcriptId: txtTranscriptId,
          transcript: expect.objectContaining({
            originalFilename: "checkout.txt",
            format: "txt",
          }),
        }),
        expect.objectContaining({
          packId,
          transcriptId: jsonTranscriptId,
          transcript: expect.objectContaining({
            originalFilename: "interview.json",
            format: "json",
          }),
        }),
      ]),
    );
  });

  it("lists packs for a transcript with pack details", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const transcriptId = await insertTranscript(t);
    const firstPackId = await insertPack(t, { name: "Pack One", status: "draft" });
    const secondPackId = await insertPack(t, { name: "Pack Two", status: "draft" });
    await t.run(async (ctx) => {
      await ctx.db.insert("packTranscripts", {
        packId: firstPackId,
        transcriptId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("packTranscripts", {
        packId: secondPackId,
        transcriptId,
        createdAt: Date.now(),
      });
    });

    const attachedPacks = await asResearcher.query(
      (api as any).packTranscripts.listTranscriptPacks,
      {
        transcriptId,
      },
    );

    expect(attachedPacks).toHaveLength(2);
    expect(attachedPacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packId: firstPackId,
          pack: expect.objectContaining({ name: "Pack One" }),
        }),
        expect.objectContaining({
          packId: secondPackId,
          pack: expect.objectContaining({ name: "Pack Two" }),
        }),
      ]),
    );
  });

  it("supports many-to-many attachments", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const firstPackId = await insertPack(t, { name: "Pack One", status: "draft" });
    const secondPackId = await insertPack(t, { name: "Pack Two", status: "draft" });
    const firstTranscriptId = await insertTranscript(t, {
      originalFilename: "first.txt",
    });
    const secondTranscriptId = await insertTranscript(t, {
      originalFilename: "second.txt",
    });

    await asResearcher.mutation((api as any).packTranscripts.attachTranscript, {
      packId: firstPackId,
      transcriptId: firstTranscriptId,
    });
    await asResearcher.mutation((api as any).packTranscripts.attachTranscript, {
      packId: firstPackId,
      transcriptId: secondTranscriptId,
    });
    await asResearcher.mutation((api as any).packTranscripts.attachTranscript, {
      packId: secondPackId,
      transcriptId: firstTranscriptId,
    });

    const packTranscripts = await asResearcher.query(
      (api as any).packTranscripts.listPackTranscripts,
      {
        packId: firstPackId,
      },
    );
    const transcriptPacks = await asResearcher.query(
      (api as any).packTranscripts.listTranscriptPacks,
      {
        transcriptId: firstTranscriptId,
      },
    );

    expect(packTranscripts).toHaveLength(2);
    expect(transcriptPacks).toHaveLength(2);
  });

  it("enforces org isolation for transcript-pack listings", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const asOtherResearcher = t.withIdentity(otherResearcherIdentity);
    const packId = await insertPack(t, { status: "draft" });
    const transcriptId = await insertTranscript(t);
    await t.run(async (ctx) =>
      ctx.db.insert("packTranscripts", {
        packId,
        transcriptId,
        createdAt: Date.now(),
      }),
    );

    const visibleToOwner = await asResearcher.query(
      (api as any).packTranscripts.listPackTranscripts,
      { packId },
    );
    const hiddenFromOtherOrg = await asOtherResearcher.query(
      (api as any).packTranscripts.listPackTranscripts,
      { packId },
    );

    expect(visibleToOwner).toHaveLength(1);
    expect(hiddenFromOtherOrg).toEqual([]);
  });

  it("blocks reviewers from attach and detach mutations", async () => {
    const t = createTest();
    const asReviewer = t.withIdentity(reviewerIdentity);
    const packId = await insertPack(t, { status: "draft" });
    const transcriptId = await insertTranscript(t);

    await expect(
      asReviewer.mutation((api as any).packTranscripts.attachTranscript, {
        packId,
        transcriptId,
      }),
    ).rejects.toThrow("FORBIDDEN");

    await t.run(async (ctx) =>
      ctx.db.insert("packTranscripts", {
        packId,
        transcriptId,
        createdAt: Date.now(),
      }),
    );

    await expect(
      asReviewer.mutation((api as any).packTranscripts.detachTranscript, {
        packId,
        transcriptId,
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
});

async function insertPack(
  t: ReturnType<typeof createTest>,
  overrides: {
    orgId?: string;
    name?: string;
    status?: "draft" | "published" | "archived";
  } = {},
) {
  const now = Date.now();
  const orgId = overrides.orgId ?? researcherIdentity.tokenIdentifier;

  return await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      name: overrides.name ?? "Pack",
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
      status: overrides.status ?? "draft",
      orgId,
      createdBy: orgId,
      updatedBy: orgId,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function insertTranscript(
  t: ReturnType<typeof createTest>,
  overrides: {
    orgId?: string;
    originalFilename?: string;
    format?: "txt" | "json";
  } = {},
) {
  const orgId = overrides.orgId ?? researcherIdentity.tokenIdentifier;
  const storageId = await t.action(async (ctx) =>
    ctx.storage.store(
      new Blob(["seed transcript"], {
        type: overrides.format === "json" ? "application/json" : "text/plain",
      }),
    ),
  );
  const now = Date.now();

  return await t.run(async (ctx) =>
    ctx.db.insert("transcripts", {
      storageId,
      originalFilename: overrides.originalFilename ?? "seed.txt",
      format: overrides.format ?? "txt",
      metadata: {
        participantId: "participant-1",
        date: 1_711_000_000_000,
        tags: ["checkout"],
        notes: "Seed transcript",
      },
      processingStatus: "processed",
      processingError: undefined,
      characterCount: "seed transcript".length,
      orgId,
      createdBy: orgId,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function listPackTranscriptDocs(
  t: ReturnType<typeof createTest>,
  packId: Id<"personaPacks">,
): Promise<Doc<"packTranscripts">[]> {
  return await t.run(async (ctx) =>
    (await ctx.db
      .query("packTranscripts")
      .withIndex("by_packId", (q) => q.eq("packId", packId))
      .collect()) as Doc<"packTranscripts">[],
  );
}
