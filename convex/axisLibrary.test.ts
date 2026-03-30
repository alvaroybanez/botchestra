import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./axisLibrary.ts": () => import("./axisLibrary"),
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

type AxisDefinitionInput = {
  key: string;
  label: string;
  description: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
  weight: number;
  tags: string[];
};

const makeAxisDefinitionInput = (
  overrides: Partial<AxisDefinitionInput> = {},
): AxisDefinitionInput => ({
  key: "digital_confidence",
  label: "Digital Confidence",
  description: "Comfort using digital products",
  lowAnchor: "Very hesitant",
  midAnchor: "Comfortable enough",
  highAnchor: "Power user",
  weight: 1,
  tags: ["commerce", "ux"],
  ...overrides,
});

describe("axisLibrary", () => {
  it("creates an axis definition with manual source and org metadata", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const before = Date.now();

    const axisId = await asResearcher.mutation(
      (api as any).axisLibrary.createAxisDefinition,
      {
        axis: makeAxisDefinitionInput(),
      },
    );

    const stored = await getAxisDefinitionDoc(t, axisId);

    expect(stored).not.toBeNull();
    expect(stored).toMatchObject({
      key: "digital_confidence",
      label: "Digital Confidence",
      creationSource: "manual",
      usageCount: 0,
      orgId: researcherIdentity.tokenIdentifier,
      createdBy: researcherIdentity.tokenIdentifier,
      updatedBy: researcherIdentity.tokenIdentifier,
      tags: ["commerce", "ux"],
    });
    expect(stored!.createdAt).toBeGreaterThanOrEqual(before);
    expect(stored!.updatedAt).toBeGreaterThanOrEqual(stored!.createdAt);
  });

  it("rejects missing required fields when creating an axis definition", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);

    const invalidAxes = [
      makeAxisDefinitionInput({ key: "" }),
      makeAxisDefinitionInput({ label: "" }),
      makeAxisDefinitionInput({ description: "" }),
      makeAxisDefinitionInput({ lowAnchor: "" }),
      makeAxisDefinitionInput({ midAnchor: "" }),
      makeAxisDefinitionInput({ highAnchor: "" }),
    ];

    for (const axis of invalidAxes) {
      await expect(
        asResearcher.mutation((api as any).axisLibrary.createAxisDefinition, {
          axis,
        }),
      ).rejects.toThrow();
    }

    expect(await listAxisDefinitionsDirectly(t)).toHaveLength(0);
  });

  it("rejects duplicate keys within the same org", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);

    await asResearcher.mutation((api as any).axisLibrary.createAxisDefinition, {
      axis: makeAxisDefinitionInput(),
    });

    await expect(
      asResearcher.mutation((api as any).axisLibrary.createAxisDefinition, {
        axis: makeAxisDefinitionInput({ label: "Duplicate" }),
      }),
    ).rejects.toThrow("already exists");

    expect(await listAxisDefinitionsDirectly(t)).toHaveLength(1);
  });

  it("allows the same key to exist in different orgs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const asOtherResearcher = t.withIdentity(otherResearcherIdentity);

    await asResearcher.mutation((api as any).axisLibrary.createAxisDefinition, {
      axis: makeAxisDefinitionInput(),
    });
    await asOtherResearcher.mutation((api as any).axisLibrary.createAxisDefinition, {
      axis: makeAxisDefinitionInput(),
    });

    expect(await listAxisDefinitionsDirectly(t)).toHaveLength(2);
  });

  it("rejects invalid snake_case keys", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);

    for (const key of ["DigitalConfidence", "digital confidence", "digital-confidence"]) {
      await expect(
        asResearcher.mutation((api as any).axisLibrary.createAxisDefinition, {
          axis: makeAxisDefinitionInput({ key }),
        }),
      ).rejects.toThrow("snake_case");
    }
  });

  it("rejects non-positive weights during create", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);

    for (const weight of [0, -1]) {
      await expect(
        asResearcher.mutation((api as any).axisLibrary.createAxisDefinition, {
          axis: makeAxisDefinitionInput({ weight }),
        }),
      ).rejects.toThrow("positive");
    }
  });

  it("updates mutable fields while keeping the key intact", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const axisId = await asResearcher.mutation(
      (api as any).axisLibrary.createAxisDefinition,
      {
        axis: makeAxisDefinitionInput(),
      },
    );
    const beforeUpdate = await getAxisDefinitionDoc(t, axisId);

    const updated = await asResearcher.mutation(
      (api as any).axisLibrary.updateAxisDefinition,
      {
        axisDefinitionId: axisId,
        patch: {
          label: "Updated Digital Confidence",
          description: "Updated description",
          lowAnchor: "Needs step-by-step guidance",
          midAnchor: "Can self-serve with a little help",
          highAnchor: "Optimizes every workflow",
          weight: 2.5,
          tags: ["updated", "research"],
        },
      },
    );

    expect(updated).toMatchObject({
      _id: axisId,
      key: "digital_confidence",
      label: "Updated Digital Confidence",
      description: "Updated description",
      weight: 2.5,
      tags: ["updated", "research"],
      creationSource: "manual",
      usageCount: 0,
      createdBy: researcherIdentity.tokenIdentifier,
      updatedBy: researcherIdentity.tokenIdentifier,
    });
    expect(updated.updatedAt).toBeGreaterThanOrEqual(beforeUpdate!.updatedAt);
  });

  it("rejects attempts to change the axis key", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const axisId = await asResearcher.mutation(
      (api as any).axisLibrary.createAxisDefinition,
      {
        axis: makeAxisDefinitionInput(),
      },
    );

    await expect(
      asResearcher.mutation((api as any).axisLibrary.updateAxisDefinition, {
        axisDefinitionId: axisId,
        patch: {
          key: "renamed_axis",
        },
      }),
    ).rejects.toThrow("immutable");
  });

  it("rejects non-positive weights during update", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const axisId = await asResearcher.mutation(
      (api as any).axisLibrary.createAxisDefinition,
      {
        axis: makeAxisDefinitionInput(),
      },
    );

    await expect(
      asResearcher.mutation((api as any).axisLibrary.updateAxisDefinition, {
        axisDefinitionId: axisId,
        patch: {
          weight: 0,
        },
      }),
    ).rejects.toThrow("positive");
  });

  it("deletes an axis definition", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const axisId = await asResearcher.mutation(
      (api as any).axisLibrary.createAxisDefinition,
      {
        axis: makeAxisDefinitionInput(),
      },
    );

    const result = await asResearcher.mutation(
      (api as any).axisLibrary.deleteAxisDefinition,
      {
        axisDefinitionId: axisId,
      },
    );

    expect(result).toEqual({
      axisDefinitionId: axisId,
      deleted: true,
    });
    expect(await getAxisDefinitionDoc(t, axisId)).toBeNull();
  });

  it("lists only axis definitions for the caller org", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const asOtherResearcher = t.withIdentity(otherResearcherIdentity);

    await asResearcher.mutation((api as any).axisLibrary.createAxisDefinition, {
      axis: makeAxisDefinitionInput({ key: "digital_confidence" }),
    });
    await asOtherResearcher.mutation((api as any).axisLibrary.createAxisDefinition, {
      axis: makeAxisDefinitionInput({ key: "patience" }),
    });

    const listed = await asResearcher.query(
      (api as any).axisLibrary.listAxisDefinitions,
      {},
    );

    expect(listed).toHaveLength(1);
    expect(listed[0].orgId).toBe(researcherIdentity.tokenIdentifier);
    expect(listed[0].key).toBe("digital_confidence");
  });

  it("gets an axis definition for the caller org and hides other org records", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const asOtherResearcher = t.withIdentity(otherResearcherIdentity);
    const axisId = await asResearcher.mutation(
      (api as any).axisLibrary.createAxisDefinition,
      {
        axis: makeAxisDefinitionInput(),
      },
    );

    const ownAxis = await asResearcher.query(
      (api as any).axisLibrary.getAxisDefinition,
      { axisDefinitionId: axisId },
    );
    const otherOrgAxis = await asOtherResearcher.query(
      (api as any).axisLibrary.getAxisDefinition,
      { axisDefinitionId: axisId },
    );

    expect(ownAxis?._id).toBe(axisId);
    expect(otherOrgAxis).toBeNull();
  });

  it("requires authentication for read queries", async () => {
    const t = createTest();

    await expect(
      t.query((api as any).axisLibrary.listAxisDefinitions, {}),
    ).rejects.toThrow("Not authenticated");
  });

  it("blocks reviewers from create, update, and delete mutations", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);
    const asReviewer = t.withIdentity(reviewerIdentity);
    const axisId = await asResearcher.mutation(
      (api as any).axisLibrary.createAxisDefinition,
      {
        axis: makeAxisDefinitionInput(),
      },
    );

    await expect(
      asReviewer.mutation((api as any).axisLibrary.createAxisDefinition, {
        axis: makeAxisDefinitionInput({ key: "reviewer_attempt" }),
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asReviewer.mutation((api as any).axisLibrary.updateAxisDefinition, {
        axisDefinitionId: axisId,
        patch: { label: "Reviewer update" },
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asReviewer.mutation((api as any).axisLibrary.deleteAxisDefinition, {
        axisDefinitionId: axisId,
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("allows admins to create, update, and delete axis definitions", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);

    const axisId = await asAdmin.mutation(
      (api as any).axisLibrary.createAxisDefinition,
      {
        axis: makeAxisDefinitionInput({ key: "admin_managed_axis" }),
      },
    );

    const updated = await asAdmin.mutation(
      (api as any).axisLibrary.updateAxisDefinition,
      {
        axisDefinitionId: axisId,
        patch: { label: "Admin managed axis" },
      },
    );
    const deleted = await asAdmin.mutation(
      (api as any).axisLibrary.deleteAxisDefinition,
      {
        axisDefinitionId: axisId,
      },
    );

    expect(updated.label).toBe("Admin managed axis");
    expect(deleted.deleted).toBe(true);
  });
});

async function getAxisDefinitionDoc(
  t: ReturnType<typeof createTest>,
  axisDefinitionId: any,
) {
  return (await t.run(async (ctx) => ctx.db.get(axisDefinitionId))) as any;
}

async function listAxisDefinitionsDirectly(t: ReturnType<typeof createTest>) {
  return (await t.run(async (ctx) =>
    ctx.db.query("axisDefinitions").collect(),
  )) as any[];
}
